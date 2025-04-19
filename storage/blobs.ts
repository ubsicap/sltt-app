import { ensureDir } from 'fs-extra'
import { access, copyFile, readFile, rename } from 'fs/promises'
import { dirname, basename, join, posix } from 'path'
import { RetrieveAllBlobIdsArgs, RetrieveAllBlobIdsResponse, RetrieveBlobArgs, RetrieveBlobResponse, StoreBlobArgs, StoreBlobResponse, UpdateBlobUploadedStatusArgs, UpdateBlobUploadedStatusResponse } from './blobs.d'
import { getFiles, isNodeError } from './utils'

export const UPLOAD_QUEUE_FOLDER = '__uploadQueue'

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

const convertBufferToBase64 = (buffer: Buffer): string => {
    return buffer.toString('base64')
}

export const handleRetrieveBlob = async (blobsPath, { blobId, vcrTotalBlobs }: RetrieveBlobArgs ): Promise<RetrieveBlobResponse> => {
    try {
        const { fullPath, isUploaded } = await getBlobInfo(blobsPath, blobId, vcrTotalBlobs)
        const blobBuffer = await readFile(fullPath)
        const blobBase64 = convertBufferToBase64(blobBuffer)
        return { blobBase64, isUploaded }
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT' || String(error).includes('ENOENT')) {
            return { blobBase64: null, isUploaded: false }
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

export const transformBlobFilePathsToBlobInfo = (blobsPath: string, blobFilePaths: string[]): RetrieveAllBlobIdsResponse => {
    // now normalize the blob file paths to remove fullClientPath and ensure forward slashes
    return blobFilePaths.map((filePath) => {
        const relativePath = posix.relative(blobsPath.replace(/\\/g, '/'), filePath.replace(/\\/g, '/'))
        const parsedFile = posix.parse(relativePath)
        const isUploaded = parsedFile.dir.split('/')[0] !== UPLOAD_QUEUE_FOLDER
        const vcrTotalBlobs = isUploaded ? -1 : Number(parsedFile.dir.split('/')[1])
        const blobId = isUploaded ? relativePath : posix.join(parsedFile.dir.split('/').slice(2).join('/'), parsedFile.base)
        return { blobId, isUploaded, vcrTotalBlobs }
    })
}

export const handleRetrieveAllBlobIds = async (blobsPath, { clientId }: RetrieveAllBlobIdsArgs): Promise<RetrieveAllBlobIdsResponse> => {
    try {
        console.log('handleRetrieveAllBlobIds for client', clientId)
        const allPosixFilePaths = await getFiles(blobsPath, true)
        const blobFilePaths = filterBlobFiles(allPosixFilePaths)
        const blobInfo = transformBlobFilePathsToBlobInfo(blobsPath, blobFilePaths)
        return blobInfo
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

/** 
 * TODO: vitests
 * if blob on disk isUploaded, throw error if isUploaded parameter is false
 * if blob on disk is in __uploadQueue folder, move it to the project folder if isUploaded parameter is true
*/
export const handleUpdateBlobUploadedStatus = async (blobsPath, { blobId, isUploaded, vcrTotalBlobs }: UpdateBlobUploadedStatusArgs): Promise<UpdateBlobUploadedStatusResponse> => {
    const { fullPath: fullPathOnDisk, isUploaded: isUploadedOnDisk } = await getBlobInfo(blobsPath, blobId, vcrTotalBlobs)
    if (isUploadedOnDisk && !isUploaded) {
        throw new Error(`Blob ${blobId} is already uploaded. Cannot set isUploaded to false.`)
    } else if (!isUploadedOnDisk && isUploaded) {
        const relativeVideoPath = dirname(blobId)
        const fileName = basename(blobId)
        const destFolder = join(blobsPath, relativeVideoPath)
        const destFilePath = join(destFolder, fileName)
        try {
            await ensureDir(destFolder)
            await rename(fullPathOnDisk, destFilePath)
            return { ok: true }
        } catch (error: unknown) {
            console.error('An error occurred:', (error as Error).message)
            try {
                await access(destFilePath)
                // already renamed
                return { ok: true }
            } catch (error: unknown) {
                return { ok: false }
            }
        }
    }
    return { ok: true }
}
