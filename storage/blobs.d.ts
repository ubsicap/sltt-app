export const BLOBS_API_STORE_BLOB = 'storeBlob'
export const BLOBS_API_RETRIEVE_BLOB = 'retrieveBlob'
export const BLOBS_API_RETRIEVE_ALL_BLOB_IDS = 'retrieveAllBlobIds'

export type StoreBlobArgs = { clientId: string, blobId: string, blob: Blob }
export type StoreBlobResponse = { fullPath: string }

export type RetrieveBlobArgs = { clientId: string, blobId: string }
export type RetrieveBlobResponse = Buffer | null

export type RetrieveAllBlobIdsArgs = { clientId: string }
export type RetrieveAllBlobIdsResponse = string[]
