

// V1
export type RemoteSeqDoc<TDoc> = { seq: number, doc: TDoc }
export type StoreRemoteDocsArgs<TDoc> = { clientId: string, project: string, seqDocs: RemoteSeqDoc<TDoc>[] }
export type StoreRemoteDocsResponse = { lastSeq: number, storedCount: number, error?: string }

export type RemoteSpot = { seq: number, bytePosition: number }
export type SaveRemoteSpotsArgs = { clientId: string, project: string, spots: { [spotKey: string]: RemoteSpot } }
export type SaveRemoteSpotsResponse = void

export type GetRemoteSpotsArgs = { clientId: string, project: string }
export type GetRemoteSpotsResponse = { [key: string]: RemoteSpot }

export type RetrieveRemoteDocsArgs = { clientId: string, project: string, spotKey?: string }
export type RetrieveRemoteDocsResponse<TDoc> = { seqDocs: RemoteSeqDoc<TDoc>[], spot: [spotKey: string, RemoteSpot] }

export type StoreLocalDocsArgs<TDoc> = { clientId: string, project: string, docs: TDoc[] }
export type StoreLocalDocsResponse = { storedCount: number }

export type LocalDoc<TDoc> = { clientId: string, doc: TDoc }
export type LocalSpot = { clientId: string, bytePosition: number }
export type RetrieveLocalDocsArgs = { clientId: string, project: string, spotKey?: string, includeOwn?: boolean }
export type RetrieveLocalDocsResponse<TDoc> = { localDocs: LocalDoc<TDoc>[], spot: [spotKey: string, LocalSpot[]] }

export type SaveLocalSpotsArgs = { clientId: string, project: string, spots: { [spotKey: string]: LocalSpot[] } }
export type SaveLocalSpotsResponse = void

export type GetLocalSpotsArgs = { clientId: string, project: string }
export type GetLocalSpotsResponse = { [key: string]: LocalSpot[] }

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
