export type StoreDocArgs = { project: string, doc: unknown, remoteSeq: string }

export type StoreDoc = (
    args: StoreDocArgs
) => Promise<StoreDocResponse>

export type StoreDocResponse = BasicDocResponse & { freshlyWritten: boolean }

export type RetrieveDocArgs = { project: string, isFromRemote: boolean, filename: string }

export type RetrieveDoc = (
    args: RetrieveDocArgs
) => Promise<RetrieveDocResponse | null>

export type RetrieveDocResponse = BasicDocResponse & { doc: unknown, fullPath: string }

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
