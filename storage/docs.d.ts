

// V1
export type RemoteSeqDoc<TDoc> = { seq: number, doc: TDoc }
export type StoreRemoteDocsArgs<TDoc> = { clientId: string, project: string, seqDocs: RemoteSeqDoc<TDoc>[] }
export type StoreRemoteDocsResponse = { lastSeq: number, storedCount: number, error?: string }

export type RemoteSpot = { seq: number, bytePosition: number }
export type SaveSpotsArgs = { clientId: string, project: string, spots: { [spotKey: string]: RemoteSpot } }
export type SaveSpotsResponse = void

export type RetrieveSpotsArgs = { clientId: string, project: string }
export type RetrieveSpotsResponse = { [key: string]: RemoteSpot }

export type RetrieveRemoteDocsArgs = { clientId: string, project: string, spotKey?: string }
export type RetrieveRemoteDocsResponse<TDoc> = { seqDocs: RemoteSeqDoc<TDoc>[], spot: [spotKey: string, RemoteSpot] }

// V0
export type StoreDocArgs<TDoc> = { clientId: string, project: string, doc: TDoc, remoteSeq: number }

export type StoreDoc = (
    args: StoreDocArgs
) => Promise<StoreDocResponse>

export type StoreDocResponse = BasicDocResponse & { freshlyWritten: boolean }

export type RetrieveDocArgs = { clientId: string, project: string, isFromRemote: boolean, filename: string }

export type RetrieveDoc = (
    args: RetrieveDocArgs
) => Promise<RetrieveDocResponse | null>

export type RetrieveDocResponse<TDoc> = BasicDocResponse & { doc: TDoc, fullPath: string }

export type ListDocsArgs = { clientId: string, project: string, isFromRemote: boolean }

export type ListDocs = (
    args: ListDocsArgs
) => Promise<ListDocsResponse>

export type ListDocsResponse = string[]

type BasicDocResponse = {
    projectPath: string,
    normalizedFilename: string,
    remoteSeq: string | 'local-doc',
    filenameModDate: string,
    filenameId: string,
    filenameCreator: string,
    filenameModBy: string
}
