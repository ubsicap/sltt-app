import { readJson, read, Stats, ensureFile, readdir } from 'fs-extra'
import { promisify } from 'util'
import { stat, open } from 'fs/promises'
import { resolve } from 'path'

/**
 * from https://stackoverflow.com/a/45130990/24056785
 * @param dir parent directory to search for files
 * @param useForwardSlashes whether to convert path separators to forward slash format
 * @returns all file paths (recursively) under given `dir`
 */
export async function getFiles(dir: string, useForwardSlashes = false): Promise<string[]> {
    const dirents = await readdir(dir, { withFileTypes: true })
    const files = await Promise.all(dirents.map((dirent) => {
        const res = resolve(dir, dirent.name)
        return dirent.isDirectory() ? getFiles(res) : res
    }))
    return Array.prototype.concat(...files).map(file => useForwardSlashes ? file.replace(/\\/g, '/'): file)
}

export async function readJsonCatchMissing<T,TDefault>(filePath: string, defaultValue: T | TDefault | undefined): Promise<T|TDefault> {
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

const readAsync = promisify(read)

export async function readFromBytePosition(filePath: string, bytePosition: number): Promise<{ buffer: Buffer, fileStats: Stats }> {
    // Open the file in read mode
    await ensureFile(filePath)
    const fileHandle = await open(filePath, 'r')
    try {
        // Get the size of the file
        const fileStats = await stat(filePath)
        const fileSize = fileStats.size

        // Calculate the position to start reading from
        const startPosition = Math.max(0, bytePosition)

        // Create a buffer to hold the bytes
        const buffer = Buffer.alloc(fileSize - startPosition)

        // Read the bytes from the file
        await readAsync(fileHandle.fd, buffer, 0, buffer.length, startPosition)

        return { buffer, fileStats }
    } finally {
        // Close the file
        try {
            await fileHandle.close()
        } catch (closeErr) {
            console.error('Error closing file:', closeErr)
        }
    }
}

export async function readLastBytes(filePath: string, byteCount: number): Promise<{ buffer: Buffer, fileStats: Stats}> {
    // Open the file in read mode
    await ensureFile(filePath)
    const fileHandle = await open(filePath, 'r')
    try {
        // Get the size of the file
        const fileStats = await stat(filePath)
        const fileSize = fileStats.size

        // Calculate the position to start reading from
        const startPosition = Math.max(0, fileSize - byteCount)

        // Create a buffer to hold the bytes
        const buffer = Buffer.alloc(byteCount)

        // Read the bytes from the file
        await readAsync(fileHandle.fd, buffer, 0, byteCount, startPosition)

        return { buffer, fileStats }
    } finally {
        try {
            await fileHandle.close()
        } catch (closeErr) {
            console.error('Error closing file:', closeErr)
        }
    }
}
