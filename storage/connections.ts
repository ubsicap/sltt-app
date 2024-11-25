import { access, appendFile, readFile } from 'fs/promises'
import { constants, ensureDir } from 'fs-extra'
import { pathToFileURL, fileURLToPath } from 'url'
import { AddStorageProjectArgs, ConnectToUrlArgs, ConnectToUrlResponse, GetStorageProjectsArgs, GetStorageProjectsResponse, ProbeConnectionsArgs, ProbeConnectionsResponse, RemoveStorageProjectArgs } from './connections.d'

const { exec } = require('child_process');

function connectToSambaWindows(): void {
    const command = `net use \\\\192.168.8.1\\sltt-app /user:guest ""`

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error connecting to Samba drive: ${error.message}`)
            return
        }
        console.log('Successfully connected to Samba drive.')
        console.log(stdout)
    })
}

function connectToSambaMac(): void {
    const command = `mount_smbfs //guest:@192.168.8.1/sltt-app /Volumes/sltt-app`

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error connecting to Samba drive: ${error.message}`)
            return
        }
        console.log('Successfully connected to Samba drive.')
        console.log(stdout)
    })
}

function connectToSamba(): void {
    if (process.platform === 'win32') {
        connectToSambaWindows()
    } else if (process.platform === 'darwin') {
        connectToSambaMac()
    } else {
        console.error('Unsupported platform')
    }
}

export const handleGetStorageProjects = async (defaultStoragePath: string, { clientId }: GetStorageProjectsArgs): Promise<GetStorageProjectsResponse> => {
    await ensureDir(defaultStoragePath)
    console.log(`handleGetStorageProjects by client '${clientId}'`)
    const whitelistPath = `${defaultStoragePath}/whitelist.sltt-projects`
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

export const handleAddStorageProject = async (defaultStoragePath: string, { clientId, url, project, adminEmail }: AddStorageProjectArgs): Promise<void> => {
    await ensureDir(defaultStoragePath)
    console.log(`handleAddStorageProject[${url}]: project '${project}' added by '${adminEmail}' (client '${clientId}')`)
    try {
        await appendFile(`${defaultStoragePath}/whitelist.sltt-projects`, `${Date.now()}\t+\t${project}\t${adminEmail}\n`)
    } catch (error) {
        console.error(`appendFile(${defaultStoragePath}/whitelist.sltt-projects) error`, error)
        throw error
    }
}

export const handleRemoveStorageProject = async (defaultStoragePath: string, { url, project, adminEmail }: RemoveStorageProjectArgs): Promise<void> => {
    await ensureDir(defaultStoragePath)
    console.log(`handleRemoveStorageProject[${url}]: project ${project} removed by ${adminEmail}`)
    try {
        await appendFile(`${defaultStoragePath}/whitelist.sltt-projects`, `${Date.now()}\t-\t${project}\t${adminEmail}\n`)
    } catch (error) {
        console.error(`appendFile(${defaultStoragePath}/whitelist.sltt-projects) error`, error)
        throw error
    }
}

export const handleProbeConnections = async (defaultStoragePath: string, { urls }: ProbeConnectionsArgs): Promise<ProbeConnectionsResponse> => {

    await ensureDir(defaultStoragePath)
    const connections = await Promise.all(
        [pathToFileURL(defaultStoragePath).href, ...(urls || [])].map(
            async (url) => {
                let filePath = ''
                try {
                    filePath = fileURLToPath(url)
                    connectToSamba()
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

const canAccess = async (filePath: string, throwError = false): Promise<boolean> => {
    try {
        await access(filePath, constants.F_OK)
        return true
    } catch (error) {
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
