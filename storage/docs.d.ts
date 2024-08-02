declare module 'storage/docs' {
    export const handleListDocs: (docsFolder: string, project: string, isFromRemote: boolean) => Promise<string[]>

    type BasicDocResponse = {
        projectPath: string,
        normalizedFilename: string,
        remoteSeq: string | 'local-doc',
        filenameModDate: string,
        filenameId: string,
        filenameCreator: string,
        filenameModBy: string
    }

    export type WriteDocResponse = BasicDocResponse & { freshlyWritten: boolean }
    export const handleStoreDoc: (
        docsFolder: string, project: string, doc: unknown, remoteSeq: string
    ) => Promise<WriteDocResponse>
    export type RetrieveDocResponse = BasicDocResponse & { doc: unknown, fullPath: string }
    export const handleRetrieveDoc: (
        docsFolder: string, project: string, isFromRemote: boolean, filename: string
    ) => Promise<RetrieveDocResponse | null>
}
