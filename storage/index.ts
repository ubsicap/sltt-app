import { ipcMain, app } from 'electron'
import { writeFileSync } from 'fs'
import { ensureDir } from 'fs-extra'
import { join } from 'path'
import { handleGetLocalSpots, handleGetRemoteSpots, handleGetStoredLocalClientIds, handleRetrieveLocalClientDocs, handleRetrieveRemoteDocs, handleSaveLocalSpots, handleSaveRemoteSpots, handleStoreLocalDocs, handleStoreRemoteDocs, IDBModDoc } from './docs'
import { getLANStoragePath } from './core'
import { listVcrFiles, retrieveVcrs, storeVcr } from './vcrs'
import { DOCS_API_GET_LOCAL_SPOTS, DOCS_API_GET_REMOTE_SPOTS, DOCS_API_GET_STORED_LOCAL_CLIENT_IDS, DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS, DOCS_API_RETRIEVE_REMOTE_DOCS, DOCS_API_SAVE_LOCAL_SPOTS, DOCS_API_SAVE_REMOTE_SPOTS, DOCS_API_STORE_LOCAL_DOCS, DOCS_API_STORE_REMOTE_DOCS, GetStoredLocalClientIdsArgs, RetrieveRemoteDocsArgs, SaveRemoteSpotsArgs, StoreRemoteDocsArgs } from './docs.d'
import { VIDEO_CACHE_RECORDS_API_STORE_VCR, VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES, VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS } from './vcrs.d'
import { handleRegisterClientUser } from './clients'
import { CLIENTS_API_REGISTER_CLIENT_USER } from './clients.d'
import { BLOBS_API_RETRIEVE_BLOB, BLOBS_API_STORE_BLOB } from './blobs.d'
import { handleRetrieveBlob, handleStoreBlob } from './blobs'

const LAN_STORAGE_PATH = getLANStoragePath(app.getPath('userData'))
console.log('LAN_STORAGE_PATH:', LAN_STORAGE_PATH)
const BLOBS_PATH = join(getLANStoragePath(app.getPath('userData')), 'blobs')
const VIDEO_CACHE_RECORDS_PATH = join(LAN_STORAGE_PATH, 'vcrs')
const DOCS_PATH = join(LAN_STORAGE_PATH, 'docs')
const CLIENTS_FOLDER = join(LAN_STORAGE_PATH, 'clients')

ipcMain.handle(BLOBS_API_RETRIEVE_BLOB, async (_, args) => {
    if (args === 'test') {
        return `${BLOBS_API_RETRIEVE_BLOB} api test worked!`
    } else if (typeof args === 'object'
        && 'blobId' in args && typeof args.blobId === 'string') {
        const { blobId } = args
        return await handleRetrieveBlob(BLOBS_PATH, { blobId })
    } else {
        throw Error(`invalid args for ${BLOBS_API_RETRIEVE_BLOB}. Expected: { blobId: string } Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(BLOBS_API_STORE_BLOB, async (_, args) => {
    if (args === 'test') {
        await ensureDir(BLOBS_PATH)
        const testPath = join(BLOBS_PATH, 'mytest.txt')
        writeFileSync(testPath, new Date(Date.now()).toISOString())
        return `${BLOBS_API_STORE_BLOB} api test worked! Wrote to ${testPath}`
    } else if (typeof args === 'object'
        && 'blobId' in args && typeof args.blobId === 'string'
        && 'arrayBuffer' in args && args.arrayBuffer instanceof ArrayBuffer) {
        const { blobId, arrayBuffer } = args
        return await handleStoreBlob(BLOBS_PATH, { blobId, arrayBuffer })
    } else {
        throw Error(`invalid args for ${BLOBS_API_STORE_BLOB}. Expected: {blobId: string, arrayBuffer: ArrayBuffer} Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(VIDEO_CACHE_RECORDS_API_STORE_VCR, async (_, args) => {
    if (args === 'test') {
        return `${VIDEO_CACHE_RECORDS_API_STORE_VCR} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'videoCacheRecord' in args && typeof args.videoCacheRecord === 'object') {
        const { clientId, videoCacheRecord } = args
        return await storeVcr(VIDEO_CACHE_RECORDS_PATH, { clientId, videoCacheRecord })
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
       return await listVcrFiles(VIDEO_CACHE_RECORDS_PATH, { clientId, project })
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
        return await retrieveVcrs(VIDEO_CACHE_RECORDS_PATH, { clientId, filename })
    } else {
        throw Error(`invalid args for ${VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS}. Expected: { filename: string } Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(CLIENTS_API_REGISTER_CLIENT_USER, async (_, args) => {
    if (args === 'test') {
        return `${CLIENTS_API_REGISTER_CLIENT_USER} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'username' in args && typeof args.username === 'string') {
        const { clientId, username } = args
        return await handleRegisterClientUser(CLIENTS_FOLDER, { clientId, username })
    } else {
        throw Error(`invalid args for ${CLIENTS_API_REGISTER_CLIENT_USER}. Expected: '{ clientId: string, username: string }' Got: ${JSON.stringify(args)}`)
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
        return await handleStoreRemoteDocs(DOCS_PATH, { clientId, project, seqDocs })
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
        return await handleRetrieveRemoteDocs(DOCS_PATH, { clientId, project, spot })
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
        && Object.values(args.spots).every(spot => typeof spot === 'object' && 'seq' in spot && 'bytePosition' in spot)
    ) {
        const { clientId, project, spots }: SaveRemoteSpotsArgs = args
        return await handleSaveRemoteSpots(DOCS_PATH, { clientId, project, spots })
    } else {
        throw Error(`invalid args for ${DOCS_API_SAVE_REMOTE_SPOTS}. Expected: '{ project: string, clientId: string, spots: { [spotKey: string]: { seq: number, bytePosition: number }} }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_GET_REMOTE_SPOTS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_GET_REMOTE_SPOTS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string') {
        const { clientId, project } = args
        return await handleGetRemoteSpots(DOCS_PATH, { clientId, project })
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
        return await handleStoreLocalDocs(DOCS_PATH, { clientId, project, docs })
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
        return await handleGetStoredLocalClientIds(DOCS_PATH, { project })
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
        return await handleRetrieveLocalClientDocs(DOCS_PATH, { clientId, localClientId, project, spot })
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
        && Object.values(args.spots).every(spot => typeof spot === 'object' && 'clientId' in spot && 'bytePosition' in spot)
    ) {
        const { clientId, project, spots } = args
        return await handleSaveLocalSpots(DOCS_PATH, { clientId, project, spots })
    } else {
        throw Error(`invalid args for ${DOCS_API_SAVE_LOCAL_SPOTS}. Expected: '{ project: string, clientId: string, spots: { [spotKey: string]: { clientId: string, bytePosition: number }} }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_GET_LOCAL_SPOTS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_GET_LOCAL_SPOTS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string') {
        const { clientId, project } = args
        return await handleGetLocalSpots(DOCS_PATH, { clientId, project })
    } else {
        throw Error(`invalid args for ${DOCS_API_GET_LOCAL_SPOTS}. Expected: '{ project: string, clientId: string }' Got: ${JSON.stringify(args)}`)
    }
})
