import { access } from 'fs/promises'
import { constants, ensureDir } from 'fs-extra'
import { pathToFileURL, fileURLToPath } from 'url'
import { ConnectToUrlArgs, ConnectToUrlResponse, ProbeConnectionsArgs, ProbeConnectionsResponse } from './connections.d'

export const handleProbeConnections = async (defaultStoragePath: string, { urls }: ProbeConnectionsArgs): Promise<ProbeConnectionsResponse> => {

    await ensureDir(defaultStoragePath)
    const connections = await Promise.all(
        [pathToFileURL(defaultStoragePath).href, ...(urls || [])].map(
            async (url) => {
                let filePath = ''
                try {
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
