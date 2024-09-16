import { readJson } from 'fs-extra'

export async function readJsonCatchMissing<T>(filePath: string, defaultValue: T | null = null): Promise<T> {
    try {
        const contents = await readJson(filePath)
        return contents
    } catch (error) {
        if (error.code === 'ENOENT') {
            return defaultValue
        } else {
            console.error('An error occurred:', error.message)
            throw error
        }
    }
}
