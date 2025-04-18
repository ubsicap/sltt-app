export const BLOBS_API_STORE_BLOB = 'storeBlob'
export const BLOBS_API_RETRIEVE_BLOB = 'retrieveBlob'
export const BLOBS_API_UPDATE_BLOB_UPLOADED_STATUS = 'updateBlobUploadedStatus'
export const BLOBS_API_RETRIEVE_ALL_BLOB_IDS = 'retrieveAllBlobIds'

/**
 * @vcrTotalBlobs - the number of blobs in the VideoCacheRecord responsible for this blob
 */
export type StoreBlobArgs = { clientId: string, blobId: string, blob: Blob, isUploaded: boolean, vcrTotalBlobs: number }
export type StoreBlobResponse = { fullPath: string }

export type RetrieveBlobArgs = { clientId: string, blobId: string, vcrTotalBlobs: number }
export type RetrieveBlobResponse = { blobBytes: number[] | null, isUploaded: boolean }

/**
 * @isUploaded - `true` means blob has been uploaded to remote server. `false` means `isPendingUpload`
 */
export type UpdateBlobUploadedStatusArgs = { clientId: string, blobId: string, isUploaded: boolean, vcrTotalBlobs: number }
export type UpdateBlobUploadedStatusResponse = { ok: boolean }

export type RetrieveAllBlobIdsArgs = { clientId: string }
export type RetrieveAllBlobIdsResponse = {
    blobId: string,
    isUploaded: boolean,
    vcrTotalBlobs: number,
}[]
