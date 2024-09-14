export type VideoCacheRecord = {
    _id: string
    uploadeds: boolean[]
}

export type StoreVcrArgs = { clientId: string, videoCacheRecord: VideoCacheRecord }
export type StoreVcrResponse = { fullPath: string }

export function storeVcr(
    args: StoreVcrArgs
): Promise<StoreVcrResponse>

export type ListVcrFilesArgs = { clientId: string, project: string }
export type ListVcrFilesResponse = string[]

export function listVcrFiles(
    args: ListVcrFilesArgs
): Promise<ListVcrFilesResponse>

export type RetrieveVcrsArgs = { clientId: string, filename: string }
export type RetrieveVcrsResponse = { [videoId: string]: VideoCacheRecord }

export function retrieveVcrs(
    args: RetrieveVcrsArgs
): Promise<RetrieveVcrsResponse>
