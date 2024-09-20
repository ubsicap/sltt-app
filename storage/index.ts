import { ipcMain, app } from 'electron'
import { writeFileSync } from 'fs'
import { ensureDir } from 'fs-extra'
import { writeFile, readFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { handleGetStoredLocalClientIds, handleListDocsV0, handleRetrieveDocV0, handleRetrieveLocalClientDocs, handleRetrieveRemoteDocs, handleSaveLocalSpots, handleSaveRemoteSpots, handleStoreDocV0, handleStoreLocalDocs, handleStoreRemoteDocs, IDBModDoc } from './docs'
import { getLANStoragePath } from './core'
import { listVcrFiles, retrieveVcrs, storeVcr } from './vcrs'
import { GetStoredLocalClientIdsArgs, RetrieveRemoteDocsArgs, SaveRemoteSpotsArgs, StoreRemoteDocsArgs } from './docs.d'

const LAN_STORAGE_PATH = getLANStoragePath(app.getPath('userData'))
const VIDEO_CACHE_PATH = join(getLANStoragePath(app.getPath('userData')), 'VideoCache')
const VIDEO_CACHE_RECORDS_PATH = join(LAN_STORAGE_PATH, 'VideoCacheRecords')
const DOCS_PATH = join(LAN_STORAGE_PATH, 'docs')
const DOCS_API_STORE_DOC = 'storeDoc'
const DOCS_API_LIST_DOCS = 'listDocs'
const DOCS_API_RETRIEVE_DOC = 'retrieveDoc'
const DOCS_API_STORE_REMOTE_DOCS = 'storeRemoteDocs'
const DOCS_API_RETRIEVE_REMOTE_DOCS = 'retrieveRemoteDocs'
const DOCS_API_SAVE_REMOTE_SPOTS = 'saveRemoteDocsSpots'
const DOCS_API_STORE_LOCAL_DOCS = 'storeLocalDocs'
const DOCS_API_GET_STORED_LOCAL_CLIENT_IDS = 'getStoredLocalClientIds'
const DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS = 'retrieveLocalClientDocs'
const DOCS_API_SAVE_LOCAL_SPOTS = 'saveLocalSpots'

const VIDEO_CACHE_API_STORE_BLOB = 'storeVideoBlob'
const VIDEO_CACHE_API_TRY_RETRIEVE_BLOB = 'tryRetrieveVideoBlob'
const VIDEO_CACHE_RECORDS_API_STORE_VCR = 'storeVideoCacheRecord'
const VIDEO_CACHE_RECORDS_API_LIST_VCR_FILES = 'listVideoCacheRecordFiles'
const VIDEO_CACHE_RECORDS_API_RETRIEVE_VCRS = 'retrieveVideoCacheRecords'


ipcMain.handle(VIDEO_CACHE_API_TRY_RETRIEVE_BLOB, async (_, args) => {
    if (args === 'test') {
        return `${VIDEO_CACHE_API_TRY_RETRIEVE_BLOB} api test worked!`
    } else if (typeof args === 'object'
        && 'blobId' in args && typeof args.blobId === 'string') {
        const { blobId } = args
        const relativeVideoPath = dirname(blobId)
        const fileName = basename(blobId)
        const fullFolder = join(VIDEO_CACHE_PATH, relativeVideoPath)
        const fullPath = join(fullFolder, fileName)
        try {
            const buffer = await readFile(fullPath)
            return buffer
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null
            } else {
                // Handle other possible errors
                console.error('An error occurred:', error.message)
                throw error
            }
        }
    } else {
        throw Error(`invalid args for ${VIDEO_CACHE_API_TRY_RETRIEVE_BLOB}. Expected: { blobId: string } Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(VIDEO_CACHE_API_STORE_BLOB, async (_, args) => {
    if (args === 'test') {
        await ensureDir(VIDEO_CACHE_PATH)
        const testPath = join(VIDEO_CACHE_PATH, 'mytest.txt')
        writeFileSync(testPath, new Date(Date.now()).toISOString())
        return `${VIDEO_CACHE_API_STORE_BLOB} api test worked! Wrote to ${testPath}`
    } else if (typeof args === 'object'
        && 'blobId' in args && typeof args.blobId === 'string'
        && 'arrayBuffer' in args && args.arrayBuffer instanceof ArrayBuffer) {
        const { blobId, arrayBuffer } = args
        const relativeVideoPath = dirname(blobId)
        const fileName = basename(blobId)
        const fullFolder = join(VIDEO_CACHE_PATH, relativeVideoPath)
        await ensureDir(fullFolder)
        const fullPath = join(fullFolder, fileName)
        const buffer = Buffer.from(arrayBuffer)
        try {
            await writeFile(fullPath, buffer)
            return { blobId, videosFolder: VIDEO_CACHE_PATH, relativeVideoPath, fileName, fullPath, bufferLength: buffer.length }
        } catch (error) {
            console.error('An error occurred:', error.message)
            throw error
        }
    } else {
        throw Error(`invalid args for ${VIDEO_CACHE_API_STORE_BLOB}. Expected: {blobId: string, arrayBuffer: ArrayBuffer} Got: ${JSON.stringify(args)}`)
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

ipcMain.handle(DOCS_API_STORE_DOC, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_STORE_DOC} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && 'doc' in args && typeof args.doc === 'object'
        && 'remoteSeq' in args && typeof args.remoteSeq === 'number') {
        const { clientId, project, doc, remoteSeq } = args
        return await handleStoreDocV0(DOCS_PATH, { clientId, project, doc, remoteSeq })
    } else {
        throw Error(`invalid args for ${DOCS_API_STORE_DOC}. Expected: { project: string, doc: string, remoteSeq: string } Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_LIST_DOCS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_LIST_DOCS} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && 'isFromRemote' in args && typeof args.isFromRemote === 'boolean'
    ) {
        console.log('listDocs args:', args)
        const { clientId, project, isFromRemote } = args
        return await handleListDocsV0(DOCS_PATH, { clientId, project, isFromRemote })
    } else {
        throw Error(`invalid args for ${DOCS_API_LIST_DOCS}. Expected: '{ project: string, isFromRemote: boolean }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_RETRIEVE_DOC, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_RETRIEVE_DOC} api test worked!`
    } else if (typeof args === 'object'
        && 'clientId' in args && typeof args.clientId === 'string'
        && 'project' in args && typeof args.project === 'string'
        && 'isFromRemote' in args && typeof args.isFromRemote === 'boolean'
        && 'filename' in args && typeof args.filename === 'string'
    ) {
        const { clientId, project, isFromRemote, filename } = args
        return await handleRetrieveDocV0(DOCS_PATH, { clientId, project, isFromRemote, filename })
    } else {
        throw Error(`invalid args for ${DOCS_API_RETRIEVE_DOC}. Expected: '{ project: string, isFromRemote: boolean, filename: string }' Got: ${JSON.stringify(args)}`)
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
        && (('spotKey' in args && Array.isArray(args.seqDocs)) || !('spotKey' in args))
    ) {
        const { clientId, project, spotKey }: RetrieveRemoteDocsArgs = args
        return await handleRetrieveRemoteDocs(DOCS_PATH, { clientId, project, spotKey })
    } else {
        throw Error(`invalid args for ${DOCS_API_RETRIEVE_REMOTE_DOCS}. Expected: '{ project: string, clientId: string, spotKey: string }' Got: ${JSON.stringify(args)}`)
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
        && (('spotKey' in args && Array.isArray(args.seqDocs)) || !('spotKey' in args))
    ) {
        const { clientId, localClientId, project, spotKey } = args
        return await handleRetrieveLocalClientDocs(DOCS_PATH, { clientId, localClientId, project, spotKey })
    } else {
        throw Error(`invalid args for ${DOCS_API_RETRIEVE_LOCAL_CLIENT_DOCS}. Expected: '{ project: string, clientId: string, spotKey?: string }' Got: ${JSON.stringify(args)}`)
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
