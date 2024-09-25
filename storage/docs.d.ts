// V1
export const DOCS_API_STORE_REMOTE_DOCS = 'storeRemoteDocs'
export const DOCS_API_RETRIEVE_REMOTE_DOCS = 'retrieveRemoteDocs'
export const DOCS_API_SAVE_REMOTE_SPOTS = 'saveRemoteDocsSpots'
export const DOCS_API_GET_REMOTE_SPOTS = 'getRemoteDocsSpots'
export const DOCS_API_STORE_LOCAL_DOCS = 'storeLocalDocs'
export const DOCS_API_GET_STORED_LOCAL_CLIENT_IDS = 'getStoredLocalClientIds'
export const DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS = 'retrieveLocalClientDocs'
export const DOCS_API_SAVE_LOCAL_SPOTS = 'saveLocalSpots'
export const DOCS_API_GET_LOCAL_SPOTS = 'getLocalSpots'

export type RemoteSeqDoc<TDoc> = { seq: number, doc: TDoc }
export type StoreRemoteDocsArgs<TDoc> = { clientId: string, project: string, seqDocs: RemoteSeqDoc<TDoc>[] }
export type StoreRemoteDocsResponse = { lastSeq: number, storedCount: number, error?: string }

type Spot = { bytePosition: number }
export type RemoteSpot = { seq: number } & Spot
export type SaveRemoteSpotsArgs = { clientId: string, project: string, spots: { [spotKey: string]: RemoteSpot } }
export type SaveRemoteSpotsResponse = void

export type GetRemoteSpotsArgs = { clientId: string, project: string }
export type GetRemoteSpotsResponse = { [key: string]: RemoteSpot } | Record<string, never>

export type RetrieveRemoteDocsArgs = { clientId: string, project: string, spot?: RemoteSpot }
export type RetrieveRemoteDocsResponse<TDoc> = { seqDocs: RemoteSeqDoc<TDoc>[], spot: RemoteSpot }

export type StoreLocalDocsArgs<TDoc> = { clientId: string, project: string, docs: TDoc[] }
export type StoreLocalDocsResponse = { storedCount: number }

export type GetStoredLocalClientIdsArgs = { project: string }
export type GetStoredLocalClientIdsResponse = string[]

export type LocalDoc<TDoc> = { clientId: string, doc: TDoc }
export type LocalSpot = { clientId: string } & Spot
export type RetrieveLocalClientDocsArgs = { clientId: string, localClientId: string, project: string, spot?: LocalSpot }
export type RetrieveLocalClientDocsResponse<TDoc> = { localDocs: LocalDoc<TDoc>[], spot: LocalSpot }

export type SaveLocalSpotsArgs = { clientId: string, project: string, spots: { [spotKey: string]: LocalSpot[] } }
export type SaveLocalSpotsResponse = void

export type GetLocalSpotsArgs = { clientId: string, project: string }
export type GetLocalSpotsResponse = { [key: string]: LocalSpot[] } | Record<string, never>
