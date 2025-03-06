import { access, appendFile, readFile } from 'fs/promises'
import { constants, ensureDir } from 'fs-extra'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import { AddStorageProjectArgs, ConnectionInfo, ConnectResponse, GetStorageProjectsArgs, GetStorageProjectsResponse, ProbeConnectionsArgs, ProbeConnectionsResponse, RemoveStorageProjectArgs } from './connections.d'
import { checkHostStoragePath, createUrl, getAmHosting, getHostsByRelevance, getLANStoragePath, HostInfo, serverState, SLTT_APP_LAN_FOLDER } from './serverState'
import axios from 'axios'
import { broadcastPushHostDataMaybe } from './udp'
import { hostname } from 'os'
import { uniq } from 'lodash'
import wifi from 'node-wifi'
import { isNodeError } from './utils'

wifi.init({
    iface: null
})

const wifiGetCurrentConnections = promisify(wifi.getCurrentConnections)

const execPromise = promisify(exec)

async function connectToSambaWithCommand(command: string): Promise<boolean> {
    try {
        const { stdout } = await execPromise(command)
        console.log(`Successfully connected to Samba drive (${command})`)
        console.log(stdout)
        return true
    } catch (error: unknown) {
        console.error(`Error connecting to Samba drive (${command}): ${(error as Error).message}`)
        return false
    }
}

const SHARE_NAME = 'sltt-local-team-storage'

async function connectToSamba(sambaIP: string): Promise<boolean> {
    if (process.platform === 'win32') {
        const command = `net use \\\\${sambaIP}\\${SHARE_NAME} /user:guest ""` /* TODO? /persistent:yes */
        return await connectToSambaWithCommand(command)
    } else if (process.platform === 'darwin') {
        const command = `mount_smbfs //guest:@${sambaIP}/${SHARE_NAME} /Volumes/${SHARE_NAME}`
        return await connectToSambaWithCommand(command)
    } else {
        console.error('Unsupported platform')
        return false
    }
}

export const handleGetStorageProjects = async ({ clientId }: GetStorageProjectsArgs): Promise<GetStorageProjectsResponse> => {
    const lanStoragePath = getLANStoragePath()
    return await getStorageProjects(clientId, lanStoragePath)
}

async function getStorageProjects(clientId: string, lanStoragePath: string): Promise<GetStorageProjectsResponse> {
    checkHostStoragePath(lanStoragePath)
    console.log(`handleGetStorageProjects by client '${clientId}'`)
    const whitelistPath = `${lanStoragePath}/whitelist.sltt-projects`
    const projectsRemoved = new Set<string>()
    const projectsAdded = new Set<string>()
    // `whitelist.sltt-projects` file has the following tsv format {timestamp}\t{-|+}\t{project}\t{adminEmail}
    try {
        const whitelistContent = await readFile(whitelistPath, 'utf-8')
        whitelistContent.split('\n').reverse().forEach((line) => {
            const [_timestamp, action, project, _adminEmail] = line.split('\t')
            if (action === '+' && !projectsRemoved.has(project)) {
                projectsAdded.add(project)
            } else if (action === '-' && !projectsAdded.has(project)) {
                projectsRemoved.add(project)
            }
        })
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            console.warn(`Whitelist file not found at ${whitelistPath}, assuming no projects are added or removed yet.`)
        } else {
            console.error(`readFile(${whitelistPath}) error`, error)
            throw error
        }
    }
    console.log(`handleGetStorageProjects[${clientId}]: projects added: [${[...projectsAdded]}], projects removed: [${[...projectsRemoved]}]`)
    return [...projectsAdded].reverse()
}

export const handleAddStorageProject = async ({ clientId, project, adminEmail }: AddStorageProjectArgs): Promise<void> => {
    const myLanStoragePath = getLANStoragePath()
    checkHostStoragePath(myLanStoragePath)
    const existingProjects = await handleGetStorageProjects({ clientId })
    if (existingProjects.includes(project)) {
        console.error(`handleAddStorageProject[${myLanStoragePath}]: project '${project}' not added for '${adminEmail}' (client '${clientId}'): already in storage projects`)
        return
    }
    console.log(`handleAddStorageProject[${myLanStoragePath}]: project '${project}' added by '${adminEmail}' (client '${clientId}')`)
    try {
        await appendFile(`${myLanStoragePath}/whitelist.sltt-projects`, `${Date.now()}\t+\t${project}\t${adminEmail}\n`)
    } catch (error) {
        console.error(`appendFile(${myLanStoragePath}/whitelist.sltt-projects) error`, error)
        throw error
    }
    broadcastPushHostDataMaybe(() => Promise.resolve(existingProjects.concat(project)))
}

export const handleRemoveStorageProject = async ({ clientId, project, adminEmail }: RemoveStorageProjectArgs): Promise<void> => {
    const myLanStoragePath = getLANStoragePath()
    checkHostStoragePath(myLanStoragePath)
    const existingProjects = await handleGetStorageProjects({ clientId })
    if (!existingProjects.includes(project)) {
        console.error(`handleRemoveStorageProject[${myLanStoragePath}]: project ${project} not removed for ${adminEmail}: not in storage projects`)
        return
    }
    console.log(`handleRemoveStorageProject[${myLanStoragePath}]: project ${project} removed by ${adminEmail}`)
    try {
        await appendFile(`${myLanStoragePath}/whitelist.sltt-projects`, `${Date.now()}\t-\t${project}\t${adminEmail}\n`)
    } catch (error) {
        console.error(`appendFile(${myLanStoragePath}/whitelist.sltt-projects) error`, error)
        throw error
    }
    broadcastPushHostDataMaybe(() => Promise.resolve(existingProjects.filter((p) => p !== project)))
}

let lastSambaIP = ''
let newSambaIpAddressMaybe = ''

let cachedWifiConnections: string[] = []

const updateWifiConnections = async (): Promise<void> => {
    console.log('Updating wifi connections...')
    try {
        const connections = await wifiGetCurrentConnections()
        const ssIdList = connections.map((c) => c.bssid || c.ssid)
        if (JSON.stringify(ssIdList) !== JSON.stringify(cachedWifiConnections)) {
            console.log(`Wifi connections changed: ${JSON.stringify(connections, null, 2)}`)
            cachedWifiConnections = ssIdList
        }
    } catch (error) {
        console.error('wifi.getCurrentConnections() error', error)
    }
}

updateWifiConnections()

export const handleProbeConnections = async ({ clientId }: ProbeConnectionsArgs): Promise<ProbeConnectionsResponse> => {
    const hostsByRelevance = getHostsByRelevance()
    const hostUrlToHostMap = hostsByRelevance.reduce((acc, host) => {
        acc[createUrl(host.protocol, host.ip, host.port)] = host
        // get our host's own peer ip/port which is probably different than localhost
        const hostOwnPeer = host.peers[host.serverId]
        if (hostOwnPeer) {
            acc[createUrl(hostOwnPeer.protocol, hostOwnPeer.ip, hostOwnPeer.port)] = host
        }
        return acc
    }, {} as Record<string, HostInfo>)
    const networkName = cachedWifiConnections[0] || ''
    console.log(`Network name: ${networkName}`)
    updateWifiConnections()
    const hostUrls = Object.keys(hostUrlToHostMap)
    console.log(`hostUrls: ${JSON.stringify(hostUrls)}`)
    const allPossibleUrls = uniq([...hostUrls])
    const user = serverState.myUsername
    const { myServerId } = serverState
    const myHost = serverState.hosts[myServerId]
    const computerName = hostname()
    const peers = getAmHosting() ? Object.keys(myHost.peers).length : 0
    const clients = getAmHosting() ? Object.values(myHost.peers).filter(peer => peer.isClient).length : 0
    const canProxy = getAmHosting() ? myHost.protocol === 'http' : false
    const projects = getAmHosting() ? myHost.projects : []
    const diskUsage = getAmHosting() ? myHost.diskUsage : undefined
    const connectionInfo: ConnectionInfo = {
        serverId: myServerId,
        canProxy,
        computerName,
        user,
        peers,
        clients,
        projects,
        isMyServer: true,
        diskUsage,
    }
    const connections = await Promise.all(
        allPossibleUrls
            .map(
                async (url) => {
                    let urlObj: URL
                    try {
                        urlObj = new URL(url)
                    } catch (e: unknown) {
                        console.error(`new URL(${url}) error`, e)
                        return { url, accessible: false, error: (e as Error).message, connectionInfo, networkName }
                    }
                    if (urlObj.protocol === 'file:') {
                        let filePath = ''
                        try {
                            filePath = fileURLToPath(url)
                        } catch (e: unknown) {
                            console.error(`fileURLToPath(${url}) error`, e)
                            return { url, accessible: false, error: (e as Error).message, connectionInfo, networkName }
                        }
                        console.log(`Probing access to '${url}'...`)
                        if (urlObj.hostname /** starts with ip address */) {
                            if (urlObj.hostname !== lastSambaIP) {
                                newSambaIpAddressMaybe = urlObj.hostname
                                console.log(`Possibly Samba IP detected: ${newSambaIpAddressMaybe}`)
                            }
                            // create the full path, if it doesn't exist
                            // NOTE: even if the connectToSamba fails, it's possible that the user still has folder access
                            if (urlObj.pathname === `/${SHARE_NAME}/${SLTT_APP_LAN_FOLDER}`) {
                                console.log(`Creating full folder path '(${newSambaIpAddressMaybe}:)${urlObj.pathname}' if needed...`)
                                try {
                                    await canEnsureDir(filePath, true)
                                    const projects = await getStorageProjects(clientId, filePath)
                                    const newConnectionInfo = {
                                        ...connectionInfo,
                                        projects
                                    }
                                    return { url, accessible: true, connectionInfo: newConnectionInfo, networkName }
                                } catch (error: unknown) {
                                    console.error(`ensureDir(${filePath}) error`, error)
                                    return { url, accessible: false, error: (error as Error).message, connectionInfo, networkName }
                                }
                            }
                        }

                        const projects = await getStorageProjects(clientId, filePath)
                        const newConnectionInfo = {
                            ...connectionInfo,
                            projects
                        }

                        return { url, accessible: await canAccess(filePath), connectionInfo: newConnectionInfo, networkName }
                    }
                    if (urlObj.protocol.startsWith('http')) {
                        // console.log(`Probing access to '${url}'...`)
                        // await axios.get(url, { timeout: 500 }).catch((e) => {
                        //     console.error(`axios.get(${url}) error`, e)
                        //     return { url, accessible: false, error: e.message }
                        // })
                        const host = hostUrlToHostMap[url]
                        if (host) {
                            const hostConnectionInfo: ConnectionInfo = {
                                serverId: host.serverId,
                                canProxy: host.protocol === 'http',
                                computerName: host.computerName,
                                isMyServer: host.serverId === myServerId,
                                user: host.user,
                                clients: (Object.values(host.peers).filter(peer => peer.isClient)).length,
                                peers: Object.keys(host.peers).length,
                                projects: host.projects,
                                diskUsage: host.diskUsage
                            }
                            const accessible = host.diskUsage !== undefined && (
                                host.diskUsage.available > 50 * 1024 * 1024 /* 50 MB */
                            )
                            return {
                                url, accessible,
                                connectionInfo: hostConnectionInfo,
                                networkName
                            }
                        } else {
                            return {
                                url, accessible: false,
                                connectionInfo,
                                networkName
                            }
                        }
                    }
                    return { url, accessible: false, error: 'Invalid URL', connectionInfo, networkName }
                }
        )
    )
    return connections
}

const asyncPathOperationUntilTimeout = async (opName: string, fnPathOperation: (path: string) => Promise<void>, path: string, throwError = false, timeout = 50): Promise<boolean> => {
    const MSG_OPERATION_TIMED_OUT = 'Operation timed out'
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(MSG_OPERATION_TIMED_OUT))
        }, timeout)
    })

    try {
        await Promise.race([
            fnPathOperation(path),
            timeoutPromise
        ])
        return true
    } catch (error: unknown) {
        if ((error as Error).message === MSG_OPERATION_TIMED_OUT) {
            console.error(`${opName}(${path}) timed out`)
        } else {
            console.error(`${opName}(${path}) error`, error)
        }
        if (throwError) {
            throw error
        }
        return false
    }
}

const canEnsureDir = async (path: string, throwError = false, timeout = 50): Promise<boolean> => {
    return asyncPathOperationUntilTimeout('ensureDir', async (path) => {
        await ensureDir(path)
    }, path, throwError, timeout)
}

const canAccess = async (filePath: string, throwError = false, timeout = 5000): Promise<boolean> => {
    return asyncPathOperationUntilTimeout('access', async (path) => {
        await access(path, constants.F_OK)
    }, filePath, throwError, timeout)
}

export const handleConnectToUrl = async ({ url }: { url: string }): Promise<ConnectResponse> => {
    let urlObj: URL
    try {
        urlObj = new URL(url)
    } catch (e: unknown) {
        console.error(`new URL(${url}) error`, e)
        throw new Error(`Connection URL '${url}' is invalid due to error: ` + (e as Error).message)
    }
    if (urlObj.protocol === 'file:') {
        let filePath = ''
        try {
            filePath = fileURLToPath(url)
        }
        catch (e: unknown) {
            console.error(`fileURLToPath(${url}) error`, e)
            throw new Error(`Connection path '${url}' is invalid due to error: ` + (e as Error).message)
        }
        await canAccess(filePath, true).catch((e) => {
            console.error(`access(${filePath}) error`, e)
            throw new Error(`Connection path '${filePath}' is inaccessible due to error: ` + e.message)
        })
        return { connectionUrl: filePath }
    }
    if (urlObj.protocol.startsWith('http')) {
        const response = await axios.get(url).catch((e) => {
            console.error(`axios.get(${url}) error`, e)
            throw new Error(`Connection URL '${url}' is inaccessible due to error: ` + e.message)
        })
        console.debug(`connectToUrl(${url}) response:`, JSON.stringify(response.data))
        return { connectionUrl: url }
    }
    throw new Error(`Connection URL '${url}' is invalid`)
}

let tryingToConnectToSamba = false

export const startSambaIPDetection = async (intervalMs: number = 30000) => {
    setInterval(async () => {
        if (tryingToConnectToSamba || !newSambaIpAddressMaybe || newSambaIpAddressMaybe === lastSambaIP) {
            return
        }
        console.log(`Connecting to Samba drive (${newSambaIpAddressMaybe})...`)
        tryingToConnectToSamba = true
        try {
            // keep trying until we connect once (per reboot)
            const isConnected = await connectToSamba(newSambaIpAddressMaybe)
            if (isConnected) {
                lastSambaIP = newSambaIpAddressMaybe
            } else {
                // NOTE: one of the reasons `isConnected` can be `false` is due to the following Windows error
                // which can occur when there are too many existing connections to the same folder
                // e.g. if \\192.168.8.1\sltt-local-team-storage is open in the File Explorer.
                //
                // The error:
                // System error 1219 has occurred.
                // Multiple connections to a server or shared resource by the same user, 
                // using more than one user name, are not allowed. Disconnect all previous 
                // connections to the server or shared resource and try again.
                console.log(`Try closing other windows that may be connected to the smb folder ${newSambaIpAddressMaybe}\\\\${SHARE_NAME} and try again.`)
            }
        } catch (error: unknown) {
            console.error(`Error connecting to Samba drive (${newSambaIpAddressMaybe}): ${(error as Error).message}`)
        } finally {
            tryingToConnectToSamba = false
        }
    }, intervalMs)
}
