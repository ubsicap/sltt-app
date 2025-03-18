import { ensureDir, pathExists, readJson, writeJson } from 'fs-extra'
import { initialServerConfig, ServerSettings } from './serverState'
import { dirname } from 'path'

type ServerConfig = {
    port: number,
}

/** use this for console output, but not for writing to files */
export const MY_CLIENT_ID = '$me$'

export const getServerConfig = (): ServerConfig => ({
    port: 45177
})

export const saveServerSettings = async (configPath: string, {
    myServerId,
    allowHosting,
    myLanStoragePath,
}: ServerSettings): Promise<void> => {
    try {
        await ensureDir(dirname(configPath))
        await writeJson(configPath, {
            myServerId,
            allowHosting,
            myLanStoragePath,
        })
    } catch (error: unknown) {
        console.error(`Error saving server settings: ${(error as Error).message}`)
        throw error
    }
}

export const loadServerSettings = async (configPath: string): Promise<ServerSettings> => {
    try {
        const exists = await pathExists(configPath)
        if (!exists) {
            console.warn(`Server settings file not found: ${configPath}`)
            return { ...initialServerConfig }
        }
        const settings = await readJson(configPath)
        return settings as ServerSettings
    } catch (error: unknown) {
        console.error(`Error loading server settings: ${(error as Error).message}`)
        throw error
    }
}
