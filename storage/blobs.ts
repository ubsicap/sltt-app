import { ensureDir } from 'fs-extra'
import { copyFile, readFile } from 'fs/promises'
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

export const handleStoreBlob = async (blobsPath, { blobId, file }: { blobId: StoreBlobArgs['blobId'], file: File }): Promise<StoreBlobResponse> => {
    const relativeVideoPath = dirname(blobId)
    const fileName = basename(blobId)
    const fullFolder = join(blobsPath, relativeVideoPath)
    await ensureDir(fullFolder)
    const fullPath = join(fullFolder, fileName)
    try {
        await copyFile(file.path, fullPath)
        return { fullPath }
    } catch (error) {
        console.error('An error occurred:', error.message)
        throw error
    }
}

export const filterBlobFiles = (allPosixFilePaths: string[]): string[] => {
    // filter out all files that don't match the video blob filename pattern 240925_150335-1
    // and filter out all files that don't match the pasDoc blob filename pattern pasDoc_221231_163557/2024_08_31T11_34_55.102Z.txt-1
    if (allPosixFilePaths.some((filePath) => filePath.includes('\\'))){
        throw new Error('All file paths must be in posix format')
    }
    const blobPattern = /-\d+$/
    return allPosixFilePaths.filter((file) => blobPattern.test(basename(file)))
}

export const transformBlobFilePathsToBlobIds = (blobsPath: string, blobFilePaths: string[]): string[] => {
    // now normalize the blob file paths to remove fullClientPath and ensure forward slashes
    return blobFilePaths.map((file) => posix.relative(blobsPath.replace(/\\/g, '/'), file.replace(/\\/g, '/')))
}

export const handleRetrieveAllBlobIds = async (blobsPath, { clientId }: { clientId: string }): Promise<string[]> => {
    try {
        console.log('handleRetrieveAllBlobIds for client', clientId)
        const allPosixFilePaths = await getFiles(blobsPath, true)
        const blobFilePaths = filterBlobFiles(allPosixFilePaths)
        const blobIds = transformBlobFilePathsToBlobIds(blobsPath, blobFilePaths)
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
