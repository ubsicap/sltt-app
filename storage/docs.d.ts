export type StoreDocArgs<TDoc> = { project: string, doc: TDoc, remoteSeq: number }

export type StoreDoc = (
    args: StoreDocArgs
) => Promise<StoreDocResponse>

export type StoreDocResponse = BasicDocResponse & { freshlyWritten: boolean }

export type RetrieveDocArgs = { project: string, isFromRemote: boolean, filename: string }

export type RetrieveDoc = (
    args: RetrieveDocArgs
) => Promise<RetrieveDocResponse | null>

export type RetrieveDocResponse<TDoc> = BasicDocResponse & { doc: TDoc, fullPath: string }

export type ListDocsArgs = { project: string, isFromRemote: boolean }

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
