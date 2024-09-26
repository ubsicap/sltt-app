export const BLOBS_API_STORE_BLOB = 'storeBlob'
export const BLOBS_API_RETRIEVE_BLOB = 'retrieveBlob'

export type StoreBlobArgs = { blobId: string, arrayBuffer: ArrayBuffer }
export type StoreBlobResponse = { fullPath: string }

export type RetrieveBlobArgs = { blobId: string }
export type RetrieveBlobResponse = Buffer | null
