import { ipcMain, app } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { writeFile,readFile, readdir } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { handleListDocs, handleRetrieveDoc, handleStoreDoc } from './docs'
import { getLANStoragePath } from './core'

const LAN_STORAGE_PATH = getLANStoragePath(app.getPath('userData'))
const VIDEO_CACHE_PATH = join(getLANStoragePath(app.getPath('userData')), 'VideoCache')
const VIDEO_CACHE_RECORDS_PATH = join(LAN_STORAGE_PATH, 'VideoCacheRecords')
const DOCS_PATH = join(LAN_STORAGE_PATH, 'docs')
const DOCS_API_STORE_DOC = 'storeDoc'
const DOCS_API_LIST_DOCS = 'listDocs'
const DOCS_API_RETRIEVE_DOC = 'retrieveDoc'

const VIDEO_CACHE_API_STORE_BLOB = 'storeVideoBlob'
const VIDEO_CACHE_API_TRY_RETRIEVE_BLOB = 'tryRetrieveVideoBlob'
const VIDEO_CACHE_RECORDS_API_STORE_VCR = 'storeVideoCacheRecord'
const VIDEO_CACHE_RECORDS_API_LIST_VCRS = 'listVideoCacheRecords'
const VIDEO_CACHE_RECORDS_API_RETRIEVE_VCR = 'retrieveVideoCacheRecord'

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
        mkdirSync(VIDEO_CACHE_PATH, { recursive: true })
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
        mkdirSync(fullFolder, { recursive: true })
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

const composeVideoCacheRecordFilename = (_id: string): string => {
    // BGSL_БЖЕ__230601_064416-230601_065151-240327_114822-2 <-- "BGSL_БЖЕ/230601_064416/230601_065151/240327_114822-2"
    const [project, ...videoIdParts] = _id.split('/')
    const videoId = videoIdParts.join('-')
    const filename = `${project}__${videoId}.sltt-vcr`
    return filename
}

ipcMain.handle(VIDEO_CACHE_RECORDS_API_STORE_VCR, async (_, args) => {
        if (args === 'test') {
            return `${VIDEO_CACHE_RECORDS_API_STORE_VCR} api test worked!`
        } else if (typeof args === 'object'
            && 'videoCacheRecord' in args && typeof args.videoCacheRecord === 'object') {
            mkdirSync(VIDEO_CACHE_RECORDS_PATH, { recursive: true })
            const { videoCacheRecord } = args
            const { _id } = videoCacheRecord
            const filename = composeVideoCacheRecordFilename(_id)
            const fullPath = join(VIDEO_CACHE_RECORDS_PATH, filename)
            try {
                await writeFile(fullPath, JSON.stringify(videoCacheRecord))
                return { videoCacheRecord, fullPath }
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
            throw Error(`invalid args for ${VIDEO_CACHE_RECORDS_API_STORE_VCR}. Expected: '{ videoCacheRecord: { _id: string, uploadeds: boolean[] } }' Got: ${JSON.stringify(args)}`)
        }
})

ipcMain.handle(VIDEO_CACHE_RECORDS_API_LIST_VCRS, async (_, args) => {
    if (args === 'test') {
        return `${VIDEO_CACHE_RECORDS_API_LIST_VCRS} api test worked!`
    } else if (typeof args === 'object'
        && 'project' in args && typeof args.project === 'string') {
        try {
            const filenames = await readdir(VIDEO_CACHE_RECORDS_PATH)
            const { project } = args
            // empty project means all projects
            const result = filenames
                .filter(filename =>
                    (!project || filename.startsWith(`${project}__`)) &&
                    filename.endsWith('.sltt-vcr')
                )
            result.sort() // just in case it's not yet by name
            return result
        } catch (error) {
            if (error.code === 'ENOENT') {
                return []
            } else {
                console.error('An error occurred:', error.message)
                throw error
            }
        }
    } else {
        throw Error(`invalid args for ${VIDEO_CACHE_RECORDS_API_LIST_VCRS}. Expected: '{ project: string }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(VIDEO_CACHE_RECORDS_API_RETRIEVE_VCR, async (_, args) => {
    if (args === 'test') {
        return `${VIDEO_CACHE_RECORDS_API_RETRIEVE_VCR} api test worked!`
    } else if (typeof args === 'object'
        && 'filename' in args && typeof args.filename === 'string') {
        const { filename } = args
        const fullPath = join(VIDEO_CACHE_RECORDS_PATH, filename)
        try {
            const buffer = await readFile(fullPath)
            const videoCacheRecord = JSON.parse(buffer.toString())
            return videoCacheRecord
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null
            } else {
                console.error('An error occurred:', error.message)
                throw error
            }
        }
    } else {
        throw Error(`invalid args for ${VIDEO_CACHE_RECORDS_API_RETRIEVE_VCR}. Expected: { filename: string } Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_STORE_DOC, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_STORE_DOC} api test worked!`
    } else if (typeof args === 'object'
        && 'project' in args && typeof args.project === 'string'
        && 'doc' in args && typeof args.doc === 'object'
        && 'remoteSeq' in args && typeof args.remoteSeq === 'number') {
        const { project, doc, remoteSeq } = args
        return await handleStoreDoc(DOCS_PATH, { project, doc, remoteSeq })
    } else {
        throw Error(`invalid args for ${DOCS_API_STORE_DOC}. Expected: { project: string, doc: string, remoteSeq: string } Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_LIST_DOCS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_LIST_DOCS} api test worked!`
    } else if (typeof args === 'object'
        && 'project' in args && typeof args.project === 'string'
        && 'isFromRemote' in args && typeof args.isFromRemote === 'boolean'
    ) {
        console.log('listDocs args:', args)
        const { project, isFromRemote } = args
        return await handleListDocs(DOCS_PATH, { project, isFromRemote })
    } else {
        throw Error(`invalid args for ${DOCS_API_LIST_DOCS}. Expected: '{ project: string, isFromRemote: boolean }' Got: ${JSON.stringify(args)}`)
    }
})

ipcMain.handle(DOCS_API_RETRIEVE_DOC, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_RETRIEVE_DOC} api test worked!`
    } else if (typeof args === 'object'
        && 'project' in args && typeof args.project === 'string'
        && 'isFromRemote' in args && typeof args.isFromRemote === 'boolean'
        && 'filename' in args && typeof args.filename === 'string'
    ) {
        const { project, isFromRemote, filename } = args
        return await handleRetrieveDoc(DOCS_PATH, { project, isFromRemote, filename })
    } else {
        throw Error(`invalid args for ${DOCS_API_RETRIEVE_DOC}. Expected: '{ project: string, isFromRemote: boolean, filename: string }' Got: ${JSON.stringify(args)}`)
    }
})
