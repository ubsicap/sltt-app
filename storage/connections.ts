import { access, appendFile, readFile } from 'fs/promises'
import { constants, ensureDir } from 'fs-extra'
import { exec } from 'child_process'
import { promisify } from 'util'
import { pathToFileURL, fileURLToPath } from 'url'
import { AddStorageProjectArgs, ConnectToUrlArgs, ConnectToUrlResponse, GetStorageProjectsArgs, GetStorageProjectsResponse, ProbeConnectionsArgs, ProbeConnectionsResponse, RemoveStorageProjectArgs } from './connections.d'
import { normalize } from 'path'

const execPromise = promisify(exec)

async function connectToSambaWithCommand(command: string): Promise<boolean> {
    try {
        const { stdout, stderr } = await execPromise(command)
        console.log(`Successfully connected to Samba drive (${command})`)
        console.log(stdout)
        return true
    } catch (error) {
        console.error(`Error connecting to Samba drive (${command}): ${error.message}`)
        return false
    }
}

const SHARE_NAME = 'sltt-local-team-storage'
export const SLTT_APP_LAN_FOLDER = `sltt-app/lan`

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

const checkLanStoragePath = (lanStoragePath: string): void => {
    if (!lanStoragePath) {
        throw new Error('LAN storage path is not set')
    }
    if (!normalize(lanStoragePath).endsWith(`${normalize(SLTT_APP_LAN_FOLDER)}`)) {
        throw new Error(`LAN storage path is invalid: ${lanStoragePath}`)
    }
}

export const handleGetStorageProjects = async (lanStoragePath: string, { clientId }: GetStorageProjectsArgs): Promise<GetStorageProjectsResponse> => {
    checkLanStoragePath(lanStoragePath)
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
    } catch (error) {
        console.error(`readFile(${whitelistPath}) error`, error)
    }
    console.log(`handleGetStorageProjects[${clientId}]: projects added: ${[...projectsAdded]}, projects removed: ${[...projectsRemoved]}`)
    return [...projectsAdded]
}

export const handleAddStorageProject = async (lanStoragePath: string, { clientId, url, project, adminEmail }: AddStorageProjectArgs): Promise<void> => {
    checkLanStoragePath(lanStoragePath)
    console.log(`handleAddStorageProject[${url}]: project '${project}' added by '${adminEmail}' (client '${clientId}')`)
    try {
        await appendFile(`${lanStoragePath}/whitelist.sltt-projects`, `${Date.now()}\t+\t${project}\t${adminEmail}\n`)
    } catch (error) {
        console.error(`appendFile(${lanStoragePath}/whitelist.sltt-projects) error`, error)
        throw error
    }
}

export const handleRemoveStorageProject = async (lanStoragePath: string, { url, project, adminEmail }: RemoveStorageProjectArgs): Promise<void> => {
    checkLanStoragePath(lanStoragePath)
    console.log(`handleRemoveStorageProject[${url}]: project ${project} removed by ${adminEmail}`)
    try {
        await appendFile(`${lanStoragePath}/whitelist.sltt-projects`, `${Date.now()}\t-\t${project}\t${adminEmail}\n`)
    } catch (error) {
        console.error(`appendFile(${lanStoragePath}/whitelist.sltt-projects) error`, error)
        throw error
    }
}

let lastSambaIP = ''

export const handleProbeConnections = async (defaultStoragePath: string, { urls }: ProbeConnectionsArgs): Promise<ProbeConnectionsResponse> => {

    await ensureDir(defaultStoragePath)
    const connections = await Promise.all(
        [pathToFileURL(defaultStoragePath).href, ...(urls || [])]
            .map(
                async (url) => {
                    let filePath = ''
                    try {
                        const urlObj = new URL(url)
                        const ipAddress = urlObj.hostname
                        console.log(`Probing access to '${url}'...`)
                        if (urlObj.protocol === 'file:'
                            && ipAddress && ipAddress !== lastSambaIP) {
                            // keep trying until we connect once (per reboot)
                            const isConnected = await connectToSamba(ipAddress)
                            if (isConnected) {
                                lastSambaIP = ipAddress
                                // create the full path, if it doesn't exist
                                if (urlObj.pathname === `/${SHARE_NAME}/${SLTT_APP_LAN_FOLDER}`) {
                                    console.log(`Creating full folder path '(${ipAddress}:)${urlObj.pathname}' if needed...`)
                                    await ensureDir(fileURLToPath(url))
                                }
                            }
                        }
                        filePath = fileURLToPath(url)
                    } catch (e) {
                        console.error(`fileURLToPath(${url}) error`, e)
                        return { url, accessible: false, error: e.message }
                    }
                    return { url, accessible: await canAccess(filePath) }
                }
        )
    )
    return connections
}

const canAccess = async (filePath: string, throwError = false, timeout = 5000): Promise<boolean> => {
    const MSG_OPERATION_TIMED_OUT = 'Operation timed out'
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(MSG_OPERATION_TIMED_OUT))
        }, timeout)
    })

    try {
        await Promise.race([
            access(filePath, constants.F_OK),
            timeoutPromise
        ])
        return true
    } catch (error) {
        if (error.message === MSG_OPERATION_TIMED_OUT) {
            console.error(`access(${filePath}) timed out`)
        } else {
            console.error(`access(${filePath}) error`, error)
        }
        if (throwError) {
            throw error
        }
        return false
    }
}

export const handleConnectToUrl = async ({ url }: ConnectToUrlArgs): Promise<ConnectToUrlResponse> => {
    let filePath = ''
    try {
        filePath = fileURLToPath(url)
    }
    catch (e) {
        console.error(`fileURLToPath(${url}) error`, e)
        throw new Error(`Connection path '${url}' is invalid due to error: ` + e.message)
    }
    await canAccess(filePath, true).catch((e) => {
        console.error(`access(${filePath}) error`, e)
        throw new Error(`Connection path '${filePath}' is inaccessible due to error: ` + e.message)
    })
    return filePath
}
