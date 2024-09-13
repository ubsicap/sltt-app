export interface VideoCacheRecord {
    _id: string
    uploadeds: boolean[]
}

type StoreVcrArgs = { clientId: string, videoCacheRecord: VideoCacheRecord }
type StoreVcrResponse = { fullPath: string }

export function storeVcr(
    args: StoreVcrArgs
): Promise<StoreVcrResponse>

type ListVcrsArgs = { clientId: string, project: string }
type ListVcrsResponse = string[]

export function listVcrs(
    args: ListVcrsArgs
): Promise<ListVcrsResponse>

type RetrieveVcrsArgs = { clientId: string, filename: string }
type RetrieveVcrsResponse = { [videoId: string]: VideoCacheRecord }

export function retrieveVcrs(
    args: RetrieveVcrsArgs
): Promise<RetrieveVcrsResponse>
