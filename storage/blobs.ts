import { ensureDir } from 'fs-extra'
import { readFile, writeFile } from 'fs/promises'
import { dirname, basename, join } from 'path'
import { RetrieveBlobArgs, RetrieveBlobResponse, StoreBlobArgs, StoreBlobResponse } from './blobs.d'


export const handleRetrieveBlob = async (blobsPath, { blobId }: RetrieveBlobArgs ): Promise<RetrieveBlobResponse> => {
    const relativeVideoPath = dirname(blobId)
    const fileName = basename(blobId)
    const fullFolder = join(blobsPath, relativeVideoPath)
    const fullPath = join(fullFolder, fileName)
    try {
        return await readFile(fullPath)
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null
        } else {
            // Handle other possible errors
            console.error('An error occurred:', error.message)
            throw error
        }
    }
}

export const handleStoreBlob = async (blobsPath, { blobId, arrayBuffer }: StoreBlobArgs): Promise<StoreBlobResponse> => {
    const relativeVideoPath = dirname(blobId)
    const fileName = basename(blobId)
    const fullFolder = join(blobsPath, relativeVideoPath)
    await ensureDir(fullFolder)
    const fullPath = join(fullFolder, fileName)
    const buffer = Buffer.from(arrayBuffer)
    try {
        await writeFile(fullPath, buffer)
        return { fullPath }
    } catch (error) {
        console.error('An error occurred:', error.message)
        throw error
    }
}
