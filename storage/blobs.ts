import { ensureDir } from 'fs-extra'
import { access, copyFile, readFile, rename } from 'fs/promises'
import { sortBy, uniqBy } from 'lodash'
import { dirname, basename, join, posix } from 'path'
import { RetrieveAllBlobIdsArgs, RetrieveAllBlobIdsResponse, RetrieveBlobArgs, RetrieveBlobInfoArgs, RetrieveBlobInfoResponse, RetrieveBlobResponse, StoreBlobArgs, StoreBlobResponse, UpdateBlobUploadedStatusArgs, UpdateBlobUploadedStatusResponse } from './blobs.d'
import { getFiles, isNodeError } from './utils'

export const UPLOAD_QUEUE_FOLDER = '__uploadQueue'

export const buildBlobPath = (blobsPath: string, blobId: string, isUploaded: boolean, vcrTotalBlobs: number): string => {
    const relativeVideoPath = dirname(blobId)
    const fileName = basename(blobId)
    if (isUploaded) {
        return join(blobsPath, relativeVideoPath, fileName)
    } else {
        return join(blobsPath, UPLOAD_QUEUE_FOLDER, String(vcrTotalBlobs), relativeVideoPath, fileName)
    }
}

/**
 * find the full path of the blob file (if it exists). 
 * check if the file exists in the ${blobsPath}/__uploadQueue/${vcrTotalBlobs}/${blobId} folder AND in the ${blobsPath}/{blobId}
 * if exists in both, prefer the one in ${blobsPath}/{blobId}
 * @return
 * - fullPath - the full path of the blob file
 * - isUploaded - `true` means blob has been uploaded to remote server and is found in the ${blobsPath}/{blobId} folder.
 * `false` means found in special folder: ${blobsPath}/__uploadQueue/${vcrTotalBlobs}/${blobId} folder.
 * 
 * NOTE: might throw ENOENT if the blob file is not found in either location.
*/
export const getBlobInfo = async (blobsPath: string, blobId: string, vcrTotalBlobs: number): Promise<{ fullPath: string, isUploaded: boolean }> => {
    const pathsToCheck = [
        { path: buildBlobPath(blobsPath, blobId, false, vcrTotalBlobs), isUploaded: false },
        { path: buildBlobPath(blobsPath, blobId, true, vcrTotalBlobs), isUploaded: true }
    ]

    const promises = pathsToCheck.map(async ({ path, isUploaded }) => {
        try {
            await access(path)
            return { fullPath: path, isUploaded, error: null }
        } catch (error: unknown) {
            if (isNodeError(error) && error.code === 'ENOENT') {
                return { fullPath: path, isUploaded, error: error as NodeJS.ErrnoException }
            } else {
                // Handle other possible errors
                console.error('An error occurred:', (error as Error).message)
                throw error
            }
        }
    })

    const results = await Promise.all(promises)
    const found = sortBy(results, r => r.isUploaded ? 0 /* prefer uploaded */ : 1)
        .find(result => result.error === null) as { fullPath: string, isUploaded: boolean } | undefined
    if (found) {
        const { fullPath, isUploaded } = found
        return { fullPath, isUploaded }
    } else {
        throw results[0].error || new Error(`Blob not found: ${blobId}`)
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
        if (isNodeError(error) && error.code === 'ENOENT') {
            return { blobBase64: null, isUploaded: false }
        } else {
            // Handle other possible errors
            console.error('An error occurred:', (error as Error).message)
            throw error
        }
    }
}

export type HandleStoreBlobArgs = { clientId: StoreBlobArgs['clientId'], blobId: StoreBlobArgs['blobId'], file: File, isUploaded: StoreBlobArgs['isUploaded'], vcrTotalBlobs: StoreBlobArgs['vcrTotalBlobs'] }

export const handleStoreBlob = async (blobsPath, { clientId, blobId, file, isUploaded, vcrTotalBlobs }: HandleStoreBlobArgs): Promise<StoreBlobResponse> => {
    const fullPath = buildBlobPath(blobsPath, blobId, isUploaded, vcrTotalBlobs)
    let blobInfo: Awaited<ReturnType<typeof getBlobInfo> | undefined> = undefined
    try {
        blobInfo = await getBlobInfo(blobsPath, blobId, vcrTotalBlobs)
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            // file doesn't exist, continue to store it
        } else {
            // Handle other possible errors
            console.error('An error occurred:', (error as Error).message)
            // try to continue
        }
    }
    if (blobInfo) {
        if (isUploaded === blobInfo.isUploaded) {
            // already stored in expected location
            return { fullPath: blobInfo.fullPath, isUploaded: blobInfo.isUploaded }
        }
        if (blobInfo.isUploaded && !isUploaded) {
            // prevent storing duplicate in __uploadQueue folder
            console.error(`Blob ${blobId} is already uploaded. Cannot set isUploaded to false.`)
            return { fullPath: blobInfo.fullPath, isUploaded: blobInfo.isUploaded }
        }
        // else (!blobInfo.isUploaded && isUploaded)
        const status = await handleUpdateBlobUploadedStatus(blobsPath, { clientId, blobId, isUploaded, vcrTotalBlobs })
        if (!status.ok) {
            console.error(`Failed to update blob status for ${blobId} to isUploaded: ${isUploaded}`)
            return { fullPath: blobInfo.fullPath, isUploaded: blobInfo.isUploaded }
        }
        return { fullPath, isUploaded }
    }

    const fullFolder = dirname(fullPath)
    await ensureDir(fullFolder)

    try {
        await copyFile((file as unknown /* Express.Multer.File */ as { path: string }).path, fullPath)
        return { fullPath, isUploaded }
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

const getDuplicateKeys = <T> (array: T[], key: (item: T) => string): string[] => {
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const item of array) {
        const identifier = key(item)
        if (seen.has(identifier)) {
            duplicates.add(identifier)
        } else {
            seen.add(identifier)
        }
    }
    return Array.from(duplicates) 
}

export const handleRetrieveAllBlobIds = async (blobsPath, { clientId }: RetrieveAllBlobIdsArgs): Promise<RetrieveAllBlobIdsResponse> => {
    try {
        console.log('handleRetrieveAllBlobIds for client', clientId)
        const allPosixFilePaths = await getFiles(blobsPath, true)
        const blobFilePaths = filterBlobFiles(allPosixFilePaths)
        const blobInfo = transformBlobFilePathsToBlobInfo(blobsPath, blobFilePaths)
        const duplicateKeys = getDuplicateKeys(blobInfo, b => b.blobId)
        if (duplicateKeys.length > 0) {
            console.warn(`Duplicate blob IDs found. Excluding ${UPLOAD_QUEUE_FOLDER}: ${duplicateKeys.join(', ')}`)
            return uniqBy(sortBy(blobInfo, b => b.isUploaded ? 0 : 1), b => b.blobId)
        }
        // if same blobId is stored in multiple folders, prefer the uploaded one (not in __uploadQueue).
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

export const handleRetrieveBlobInfo = async (blobsPath: string, { blobId, vcrTotalBlobs }: RetrieveBlobInfoArgs): Promise<RetrieveBlobInfoResponse> => {
    try {
        const { fullPath, isUploaded } = await getBlobInfo(blobsPath, blobId, vcrTotalBlobs)
        return { fullPath, isUploaded }
    } catch (error: unknown) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            return { fullPath: '', isUploaded: false }
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
                // already renamed?
                await access(destFilePath)
                return { ok: true }
            } catch (error: unknown) {
                return { ok: false }
            }
        }
    }
    return { ok: true }
}
