import { ensureDir } from 'fs-extra'
import { readFile, writeFile } from 'fs/promises'
import { dirname, basename, join, posix } from 'path'
import { RetrieveBlobArgs, RetrieveBlobResponse, StoreBlobArgs, StoreBlobResponse } from './blobs.d'
import { getFiles } from './utils'


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

export const handleRetrieveAllBlobIds = async (blobsPath, { clientId }: { clientId: string }): Promise<string[]> => {
    const fullClientPath = join(blobsPath, clientId)
    try {
        const allFiles = await getFiles(fullClientPath)
        // filter out all files that don't match the video blob filename pattern 240925_150335-1
        // and filter out all files that don't match the pasDoc blob filename pattern pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1
        const videoBlobPattern = /^\d{6}_\d{6}-\d+$/
        const pasDocBlobPattern = /^pasDoc_\d{6}_\d{6}\/\d{4}_\d{2}_\d{2}T\d{2}_\d{2}_\d{2}\.\d{3}Z\.txt-\d+$/
        const blobFilePaths = allFiles.filter((file) => videoBlobPattern.test(basename(file)) || pasDocBlobPattern.test(basename(file)))
        // now normalize the blob file paths to remove fullClientPath and use forward slashes
        const blobIds = blobFilePaths.map((file) => posix.relative(fullClientPath, file))
        return blobIds
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []
        } else {
            // Handle other possible errors
            console.error('An error occurred:', error.message)
            throw error
        }
    }
}
