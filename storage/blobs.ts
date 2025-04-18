import { ensureDir } from 'fs-extra'
import { access, copyFile, readFile } from 'fs/promises'
import { dirname, basename, join, posix } from 'path'
import { RetrieveBlobArgs, RetrieveBlobResponse, StoreBlobArgs, StoreBlobResponse } from './blobs.d'
import { getFiles, isNodeError } from './utils'

const UPLOAD_QUEUE_FOLDER = '__uploadQueue'

/**
 * find the full path of the blob file (if it exists). 
 * Do Promise.race to check if the file exists in the ${blobsPath}/__uploadQueue/${vcrTotalBlobs}/${blobId} folder or the ${blobsPath}/{blobId} 
 * @isUploaded - `true` means blob has been uploaded to remote server and is found in the ${blobsPath}/{blobId} folder.
 * `false` means found in special folder: ${blobsPath}/__uploadQueue/${vcrTotalBlobs}/${blobId} folder.
*/
const getBlobInfo = async (blobsPath: string, blobId: string, vcrTotalBlobs: number): Promise<{ fullPath: string, isUploaded: boolean }> => {
    const relativeVideoPath = dirname(blobId)
    const fileName = basename(blobId)
    const fullFolderUploaded = join(blobsPath, relativeVideoPath)
    const fullFolderUploadQueue = join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs))
    const pathsToCheck = [
        { path: join(fullFolderUploadQueue, fileName), isUploaded: false },
        { path: join(fullFolderUploaded, fileName), isUploaded: true }
    ]

    const promises = pathsToCheck.map(async ({ path, isUploaded }) => {
        try {
            await access(path)
            return { fullPath: path, isUploaded }
        } catch (error: unknown) {
            if (isNodeError(error) && error.code === 'ENOENT') {
                return null
            } else {
                // Handle other possible errors
                console.error('An error occurred:', (error as Error).message)
                throw error
            }
        }
    })

    const results = await Promise.all(promises)
    const found = results.find(result => result !== null) as { fullPath: string, isUploaded: boolean } | undefined
    if (found) {
        return found
    } else {
        throw new Error(`ENOENT: Blob not found: ${blobId}`)
    }
}

export const handleRetrieveBlob = async (blobsPath, { blobId, vcrTotalBlobs }: RetrieveBlobArgs ): Promise<RetrieveBlobResponse> => {
    try {
        const { fullPath, isUploaded } = await getBlobInfo(blobsPath, blobId, vcrTotalBlobs)
        const blobBuffer = await readFile(fullPath)
        return { blobBytes: Array.from(new Uint8Array(blobBuffer)), isUploaded }
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT' || String(error).includes('ENOENT')) {
            return { blobBytes: null, isUploaded: false }
        } else {
            // Handle other possible errors
            console.error('An error occurred:', (error as Error).message)
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
        await copyFile((file as unknown /* Express.Multer.File */ as { path: string }).path, fullPath)
        return { fullPath }
    } catch (error: unknown) {
        console.error('An error occurred:', (error as Error).message)
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
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            return []
        } else {
            // Handle other possible errors
            console.error('An error occurred:', (error as Error).message)
            throw error
        }
    }
}
