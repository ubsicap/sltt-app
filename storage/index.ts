import { ipcMain, app } from 'electron'
import { writeFileSync } from 'fs'
import { ensureDir } from 'fs-extra'
import { join } from 'path'
import { handleGetLocalSpots, handleGetRemoteSpots, handleGetStoredLocalClientIds, handleRetrieveLocalClientDocs, handleRetrieveRemoteDocs, handleSaveLocalSpots, handleSaveRemoteSpots, handleStoreLocalDocs, handleStoreRemoteDocs, IDBModDoc } from './docs'
import { getLANStoragePath as buildLANStoragePath } from './core'
import { listVcrFiles, retrieveVcrs, storeVcr } from './vcrs'
import { DOCS_API_GET_LOCAL_SPOTS, DOCS_API_GET_REMOTE_SPOTS, DOCS_API_GET_STORED_LOCAL_CLIENT_IDS, DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS, DOCS_API_RETRIEVE_REMOTE_DOCS, DOCS_API_SAVE_LOCAL_SPOTS, DOCS_API_SAVE_REMOTE_SPOTS, DOCS_API_STORE_LOCAL_DOCS, DOCS_API_STORE_REMOTE_DOCS, GetStoredLocalClientIdsArgs, RetrieveRemoteDocsArgs, SaveRemoteSpotsArgs, StoreRemoteDocsArgs } from './docs.d'
import { VIDEO_CACHE_RECORDS_API_STORE_VCR, VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES, VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS } from './vcrs.d'
import { handleRegisterClientUser } from './clients'
import { CLIENTS_API_REGISTER_CLIENT_USER } from './clients.d'
import { CONNECTIONS_API_CONNECT_TO_URL, CONNECTIONS_API_PROBE, ConnectToUrlArgs, ProbeConnectionsArgs } from './connections.d'
import { BLOBS_API_RETRIEVE_ALL_BLOB_IDS, BLOBS_API_RETRIEVE_BLOB, BLOBS_API_STORE_BLOB, RetrieveBlobArgs, StoreBlobArgs } from './blobs.d'
import { handleRetrieveBlob, handleStoreBlob } from './blobs'
import { handleConnectToUrl, handleProbeConnections } from './connections'

const DEFAULT_STORAGE_BASE_PATH = app.getPath('userData')
let lanStoragePath = buildLANStoragePath(DEFAULT_STORAGE_BASE_PATH)
console.log('lanStoragePath:', lanStoragePath)
const getLANStoragePath = (): string => lanStoragePath
const setLANStoragePath = (path: string): void => {
    lanStoragePath = path
    console.log('lanStoragePath:', lanStoragePath)
}
const getBlobsPath = (): string => join(getLANStoragePath(), 'blobs')
const getVcrsPath = (): string => join(getLANStoragePath(), 'vcrs')
const getDocsPath = (): string => join(getLANStoragePath(), 'docs')
const getClientsPath = (): string => join(getLANStoragePath(), 'clients')

ipcMain.handle(CONNECTIONS_API_PROBE, async (_, args) => {
    if (args === 'test') {
        return `${CONNECTIONS_API_PROBE} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && ('urls' in args && Array.isArray(args.urls) || args.urls === undefined)) {
        const { clientId, urls }: ProbeConnectionsArgs = args
        return await handleProbeConnections(buildLANStoragePath(DEFAULT_STORAGE_BASE_PATH), { clientId, urls })
    } else {
        throw Error(`invalid args for ${CONNECTIONS_API_PROBE}. Expected: '{ urls: string[] }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(CONNECTIONS_API_CONNECT_TO_URL, async (_, args) => {
    if (args === 'test') {
        return `${CONNECTIONS_API_CONNECT_TO_URL} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'url' in args && typeof args.url === 'string') {
        const { clientId, url }: ConnectToUrlArgs = args
        const newStoragePath = await handleConnectToUrl({ url, clientId })
        setLANStoragePath(newStoragePath)
        return newStoragePath
    } else {
        throw Error(`invalid args for ${CONNECTIONS_API_CONNECT_TO_URL}. Expected: '{ url: string }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(CLIENTS_API_REGISTER_CLIENT_USER, async (_, args) => {
    if (args === 'test') {
        return `${CLIENTS_API_REGISTER_CLIENT_USER} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'username' in args && typeof args.username === 'string') {
        const { clientId, username } = args
        return await handleRegisterClientUser(getClientsPath(), { clientId, username })
    } else {
        throw Error(`invalid args for ${CLIENTS_API_REGISTER_CLIENT_USER}. Expected: '{ clientId: string, username: string }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(BLOBS_API_RETRIEVE_BLOB, async (_, args) => {
    if (args === 'test') {
        return `${BLOBS_API_RETRIEVE_BLOB} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'blobId' in args && typeof args.blobId === 'string') {
        const { clientId, blobId }: RetrieveBlobArgs = args
        return await handleRetrieveBlob(getBlobsPath(), { clientId,  blobId })
    } else {
        throw Error(`invalid args for ${BLOBS_API_RETRIEVE_BLOB}. Expected: { blobId: string } Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(BLOBS_API_STORE_BLOB, async (_, args) => {
    if (args === 'test') {
        await ensureDir(getBlobsPath())
        const testPath = join(getBlobsPath(), 'mytest.txt')
        writeFileSync(testPath, new Date(Date.now()).toISOString())
        return `${BLOBS_API_STORE_BLOB} api test worked! Wrote to ${testPath}`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'blobId' in args && typeof args.blobId === 'string'
        && 'arrayBuffer' in args && args.arrayBuffer instanceof ArrayBuffer) {
        const { clientId, blobId, arrayBuffer }: StoreBlobArgs = args
        return await handleStoreBlob(getBlobsPath(), { clientId, blobId, arrayBuffer })
    } else {
        throw Error(`invalid args for ${BLOBS_API_STORE_BLOB}. Expected: {blobId: string, arrayBuffer: ArrayBuffer} Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(BLOBS_API_RETRIEVE_ALL_BLOB_IDS, async (_, args) => {
    if (args === 'test') {
        return `${BLOBS_API_RETRIEVE_ALL_BLOB_IDS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string') {
        return await Promise.resolve([])
    } else {
        throw Error(`invalid args for ${BLOBS_API_RETRIEVE_ALL_BLOB_IDS}. Expected: 'test' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(VIDEO_CACHE_RECORDS_API_STORE_VCR, async (_, args) => {
    if (args === 'test') {
        return `${VIDEO_CACHE_RECORDS_API_STORE_VCR} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'videoCacheRecord' in args && typeof args.videoCacheRecord === 'object') {
        const { clientId, videoCacheRecord } = args
        return await storeVcr(getVcrsPath(), { clientId, videoCacheRecord })
    } else {
        throw Error(`invalid args for ${VIDEO_CACHE_RECORDS_API_STORE_VCR}. Expected: '{ clientId: string, videoCacheRecord: { _id: string, uploadeds: boolean[] } }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES, async (_, args) => {
    if (args === 'test') {
        return `${VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string') {
       const { clientId, project } = args
       return await listVcrFiles(getVcrsPath(), { clientId, project })
    } else {
        throw Error(`invalid args for ${VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES}. Expected: '{ project: string }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS, async (_, args) => {
    if (args === 'test') {
        return `${VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'filename' in args && typeof args.filename === 'string') {
        const { clientId, filename } = args
        return await retrieveVcrs(getVcrsPath(), { clientId, filename })
    } else {
        throw Error(`invalid args for ${VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS}. Expected: { filename: string } Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_STORE_REMOTE_DOCS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_STORE_REMOTE_DOCS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && 'seqDocs' in args && Array.isArray(args.seqDocs)
    ) {
        const { clientId, project, seqDocs }: StoreRemoteDocsArgs<IDBModDoc> = args
        return await handleStoreRemoteDocs(getDocsPath(), { clientId, project, seqDocs })
    } else {
        throw Error(`invalid args for ${DOCS_API_STORE_REMOTE_DOCS}. Expected: '{ project: string, clientId: string, seqDocs: { seq: number, doc: IDBModDoc } }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_RETRIEVE_REMOTE_DOCS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_RETRIEVE_REMOTE_DOCS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && (('spot' in args && typeof args.spot === 'object' && typeof args.spot.seq === 'number' && typeof args.spot.bytePosition === 'number' ) || (args.spot === undefined))
    ) {
        const { clientId, project, spot }: RetrieveRemoteDocsArgs = args
        return await handleRetrieveRemoteDocs(getDocsPath(), { clientId, project, spot })
    } else {
        throw Error(`invalid args for ${DOCS_API_RETRIEVE_REMOTE_DOCS}. Expected: '{ project: string, clientId: string, spot: { seq: number, bytePosition: number } }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_SAVE_REMOTE_SPOTS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_SAVE_REMOTE_SPOTS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && 'spots' in args && typeof args.spots === 'object' && Object.keys(args.spots).length > 0
        && Object.values(args.spots).every(
            spot => typeof spot === 'object'
                && 'seq' in spot && typeof spot.seq === 'number'
                && 'bytePosition' in spot && typeof spot.bytePosition === 'number'
                && 'modDate' in spot && typeof spot.modDate === 'string'
            )
    ) {
        const { clientId, project, spots }: SaveRemoteSpotsArgs = args
        return await handleSaveRemoteSpots(getDocsPath(), { clientId, project, spots })
    } else {
        throw Error(`invalid args for ${DOCS_API_SAVE_REMOTE_SPOTS}. Expected: '{ project: string, clientId: string, spots: { [spotKey: string]: { seq: number, bytePosition: number, modDate: string }} }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_GET_REMOTE_SPOTS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_GET_REMOTE_SPOTS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string') {
        const { clientId, project } = args
        return await handleGetRemoteSpots(getDocsPath(), { clientId, project })
    } else {
        throw Error(`invalid args for ${DOCS_API_GET_REMOTE_SPOTS}. Expected: '{ project: string, clientId: string }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_STORE_LOCAL_DOCS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_STORE_LOCAL_DOCS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && 'docs' in args && Array.isArray(args.docs)
    ) {
        const { clientId, project, docs } = args
        return await handleStoreLocalDocs(getDocsPath(), { clientId, project, docs })
    } else {
        throw Error(`invalid args for ${DOCS_API_STORE_LOCAL_DOCS}. Expected: '{ project: string, clientId: string, docs: IDBModDoc[] }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_GET_STORED_LOCAL_CLIENT_IDS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_GET_STORED_LOCAL_CLIENT_IDS} api test worked!`
    } else if (typeof args === 'object'
        && 'project' in args && typeof args.project === 'string') {
        const { project }: GetStoredLocalClientIdsArgs = args
        return await handleGetStoredLocalClientIds(getDocsPath(), { project })
    } else {
        throw Error(`invalid args for ${DOCS_API_GET_STORED_LOCAL_CLIENT_IDS}. Expected: '{ project: string }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && 'localClientId' in args && typeof args.localClientId === 'string'
        && (('spot' in args && typeof args.spot === 'object' && typeof args.spot.clientId === 'string' && typeof args.spot.bytePosition === 'number') || (args.spot === undefined))
    ) {
        const { clientId, localClientId, project, spot } = args
        return await handleRetrieveLocalClientDocs(getDocsPath(), { clientId, localClientId, project, spot })
    } else {
        throw Error(`invalid args for ${DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS}. Expected: '{ project: string, clientId: string, spot?: { clientId: string, bytePosition: number} }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_SAVE_LOCAL_SPOTS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_SAVE_LOCAL_SPOTS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && 'spots' in args && typeof args.spots === 'object' && Object.keys(args.spots).length > 0
        && Object.values(args.spots).every(
            spots => Array.isArray(spots) && 
            spots.every(spot => typeof spot === 'object'
                && 'clientId' in spot && typeof spot.clientId === 'string'
                && 'bytePosition' in spot && typeof spot.bytePosition === 'number'
                && 'modDate' in spot && typeof spot.modDate === 'string'
            )
        )
    ) {
        const { clientId, project, spots } = args
        return await handleSaveLocalSpots(getDocsPath(), { clientId, project, spots })
    } else {
        throw Error(`invalid args for ${DOCS_API_SAVE_LOCAL_SPOTS}. Expected: '{ project: string, clientId: string, spots: { [spotKey: string]: { clientId: string, bytePosition: number, modDate: string }[] } }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_GET_LOCAL_SPOTS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_GET_LOCAL_SPOTS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string') {
        const { clientId, project } = args
        return await handleGetLocalSpots(getDocsPath(), { clientId, project })
    } else {
        throw Error(`invalid args for ${DOCS_API_GET_LOCAL_SPOTS}. Expected: '{ project: string, clientId: string }' Got: ${JSON.stringify(args)}`)
    }
})
