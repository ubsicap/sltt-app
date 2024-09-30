import { access } from 'fs/promises'
import { constants, ensureDir } from 'fs-extra'
import { pathToFileURL, fileURLToPath } from 'url'
import { ConnectToUrlArgs, ConnectToUrlResponse, ProbeConnectionsArgs, ProbeConnectionsResponse } from './connections.d'

export const handleProbeConnections = async (defaultStoragePath: string, { urls }: ProbeConnectionsArgs): Promise<ProbeConnectionsResponse> => {

    await ensureDir(defaultStoragePath)
    const connections = await Promise.all(
        [pathToFileURL(defaultStoragePath).href, ...(urls || [])].map(
            async (url) => {
                const filePath = fileURLToPath(url)
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
    const filePath = fileURLToPath(url)
    await canAccess(filePath, true).catch((e) => {
        console.error(`access(${filePath}) error`, e)
        throw new Error(`Connection path '${filePath}' is inaccessible due to error: ` + e.message)
    })
    return filePath
}
