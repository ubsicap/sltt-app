import { ipcMain, app } from 'electron'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { writeFile,readFile, readdir } from 'fs/promises'
import { basename, dirname, join, parse } from 'path'
import { createHash } from 'crypto'

const PERSISTENT_STORAGE_PATH = join(app.getPath('userData'), 'persistentStorage')
const VIDEO_CACHE_PATH = join(PERSISTENT_STORAGE_PATH, 'VideoCache')
const VIDEO_CACHE_RECORDS_PATH = join(PERSISTENT_STORAGE_PATH, 'VideoCacheRecords')
const DOCS_PATH = join(PERSISTENT_STORAGE_PATH, 'docs')

const VIDEO_CACHE_API_STORE_BLOB = 'storeVideoBlob'
const VIDEO_CACHE_API_TRY_RETRIEVE_BLOB = 'tryRetrieveVideoBlob'
const VIDEO_CACHE_RECORDS_API_STORE_VCR = 'storeVideoCacheRecord'
const VIDEO_CACHE_RECORDS_API_LIST_VCRS = 'listVideoCacheRecords'
const VIDEO_CACHE_RECORDS_API_RETRIEVE_VCR = 'retrieveVideoCacheRecord'
const DOCS_API_STORE_DOC = 'storeDoc'
const DOCS_API_LIST_DOCS = 'listDocs'
const DOCS_API_RETRIEVE_DOC = 'retrieveDoc'

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

const composeFilenameSafeDate = (modDate: string): string => {
    let dateStr = modDate // 2024/06/17 09:49:07.997Z
    // Replace slashes, spaces, and colons with underscores to make it filename-safe
    dateStr = dateStr.replace(/\//g, '-') // Replace slashes with hyphens
    dateStr = dateStr.replace(/ /g, '_') // Replace spaces with underscores
    dateStr = dateStr.replace(/:/g, '-') // Replace colons with hyphens
    // Handle milliseconds and 'Z' - replace '.' with '-' and remove 'Z'
    dateStr = dateStr.replace(/\./g, '-').replace(/Z$/, '')
    return dateStr // 2024-06-17_09-49-07-997
}

const decomponseFilenameSafeDate = (filenameSafeDate: string): string => {
    let [dateStr, timeStr] = filenameSafeDate.split('_') // 2024-06-17, 09-49-07-997 <-- 2024-06-17_09-49-07-997
    // Replace hyphens with slashes, spaces, and colons to make it filename-safe
    dateStr = dateStr.replace(/-/g, '/') // Replace hyphens with slashes
    timeStr = timeStr.replace(/-/g, ':') // Replace hyphens with colons
    // Handle milliseconds and 'Z' - replace '-' with '.' and add 'Z'
    timeStr = timeStr.replace(/-/g, '.').concat('Z')
    return `${dateStr} ${timeStr}` // 2024/06/17 09:49:07.997Z
}

const composeFilenameSafeId = (_id: string): string => {
    // GIVEN _id in format like plan_240617_094907/stg_240617_094910/tsk_240617_094912
    // Replace slashes with hyphens
    if (!_id) return 'no-id'
    const filenameSafeId1 = _id.replace(/\//g, '-') // plan_240617_094907-stg_240617_094910-tsk_240617_094912
    const fileNameExtra = composeFilename('9999/99/99 99:99:99.999Z', '', '999@99999.999', '999@99999.999', '999999999')
    const fileNameTrial1 = fileNameExtra.replace('no-id', filenameSafeId1)
    if (fileNameTrial1.length >= 255) {
        // if filename is too long, shorten each inner date_time to just the time component, but keep first and last parts of _id
        const abbreviatedId = _id.split('/').map((s, i, array) => (i > 0 && i < array.length - 1) ? s.split('_').slice(-1) : s).join('-')
        return abbreviatedId // plan_240617_094907-094910-tsk_240617_094912 <-- plan_240617_094907/stg_240617_094910/tsk_240617_094912
    } else {
        return filenameSafeId1 // plan_240617_094907-stg_240617_094910-tsk_240617_094912 <-- plan_240617_094907/stg_240617_094910/tsk_240617_094912
    }
}

const LOCAL_DOC_PREFIX = 'local-doc' // 9 characters...same as remote seq

const composeFilename = (modDate: string, _id: string, creator: string, modBy: string, remoteSeq: string): string => {
    const filenameSafeModDate = composeFilenameSafeDate(modDate)
    const filenameSafeId = composeFilenameSafeId(_id)
    const filenameSafeCreator = composeFilenameSafeEmail(creator)
    const filenameSafeModBy = modBy && composeFilenameSafeEmail(modBy) || 'no-mod-by'
    // make slot for remote and local nine characters so abbreviation logic is applied to both
    // this can make determining whether local has become remote based on the filename alone) 
    const filenameRemoteSeq = remoteSeq ? `${remoteSeq.padStart(9, '0')}` : LOCAL_DOC_PREFIX
    const filename = `${filenameRemoteSeq}__${filenameSafeModDate}__${filenameSafeId}__${filenameSafeCreator}__${filenameSafeModBy}.sltt-doc`
    return filename
}

const decomposeRemoteSeq = (paddedRemoteSeq: string): string =>
    paddedRemoteSeq === 'local' ? '' : paddedRemoteSeq.replace(/^0+/, '')

const createMd5Hash = (s: string): string => createHash('md5').update(s).digest('hex').toString()
const createEmailHash = (email: string): string => createMd5Hash(email).substring(0, 16) // api uses this

const composeFilenameSafeEmail = (email: string): string => {
    return createEmailHash(email).substring(0, 8) // 8 characters will probably avoid collision within team 
}

const buildDocFolder = (project: string, isFromRemote: boolean): string => {
    const DOCS_FROM_REMOTE_PATH = 'remote'
    const DOCS_FROM_LOCAL_PATH = 'local'
    const fullFromPath = isFromRemote ? DOCS_FROM_REMOTE_PATH : DOCS_FROM_LOCAL_PATH
    return join(DOCS_PATH, basename(project), fullFromPath)
}

const parseFilename = (filename: string): { normalizedFilename: string, remoteSeq: string, filenameModDate: string, filenameId: string, filenameCreator: string, filenameModBy: string } => {
    const normalizedFilename = basename(filename) // prevent path traversal
    const filenameWithoutExt = parse(normalizedFilename).name
    const [remoteSeq, filenameModDate, filenameId, filenameCreator, filenameModBy] = filenameWithoutExt.split('__')
    return { normalizedFilename, remoteSeq, filenameModDate, filenameId, filenameCreator, filenameModBy }
}

export const handleStoreDoc = async (project: string, doc: unknown, remoteSeq: string):
    Promise<{ filename, exists: true } | { remoteSeq: string, filename: string, doc: unknown, fullPath: string, _id: string, modDate: string, creator: string, modBy: string }> => {
    const fullFromPath = buildDocFolder(project, !!remoteSeq)
    const { _id, modDate, creator, modBy } = doc as { _id: string, modDate: string, creator: string, modBy: string }
    const filename = composeFilename(modDate, _id, creator, modBy, remoteSeq)
    if (filename.length > 255) {
        throw Error(`attempted filename is too long: ${filename}`)
    }
    mkdirSync(fullFromPath, { recursive: true })
    let finalFilename = filename
    if (!remoteSeq) {
        // see if _id has already been stored locally with a later modDate
        // if so, add `-lost` to the filename
        // TODO: cache listDocs and maintain it in memory
        try {
            const localFilenames = await listDocs({
                project, isFromRemote: false,
                fnFilter: (storedFilename) => storedFilename.split('__')[2] === filename.split('__')[2]
            })
            if (filename in localFilenames) {
                // filename already exists locally, so don't overwrite it
                return { filename, exists: true }
            }
            // sort localFilenames and get modDate from last one
            const mostRecentLocalFilename = [...localFilenames, filename].sort().pop()
            if (mostRecentLocalFilename !== filename) {
                const lostFilename = `${filename}-lost`
                finalFilename = lostFilename
            }
            const fullPath = join(fullFromPath, finalFilename)
            return await writeDoc(fullPath, doc)
        } catch (error) {
            console.error('An error occurred:', error.message)
        }
    }
    const fullPath = join(fullFromPath, finalFilename)
    return await writeDoc(fullPath, doc)
}

ipcMain.handle(DOCS_API_STORE_DOC, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_STORE_DOC} api test worked!`
    } else if (typeof args === 'object'
        && 'project' in args && typeof args.project === 'string'
        && 'doc' in args && typeof args.doc === 'object'
        && 'remoteSeq' in args && typeof args.remoteSeq === 'string') {
        const { project, doc, remoteSeq } = args
        return await handleStoreDoc(project, doc, remoteSeq)
    } else {
        throw Error(`invalid args for ${DOCS_API_STORE_DOC}. Expected: { project: string, doc: string, remoteSeq: string } Got: ${JSON.stringify(args)}`)
    }
})

export const handleListDocs = async (project: string, isFromRemote: boolean): Promise<string[]> => {
    try {
        const filenames = await listDocs({ project, isFromRemote })
        if (!isFromRemote) {
            const localFilenames: string[] = []
            const remoteFilenames = await listDocs({ project, isFromRemote: true })
            const strippedRemoteFilenames = new Set(remoteFilenames.map((filename) => filename.slice(9) /* strip 9 char remote seq */))
            // reverse the order of local filenames so that the most recent is first
            // for each local doc compose remote filename and see if that file exists
            // if so stop local filenames
            for (const localFilename of filenames.reverse()) {
                const strippedLocalFilename = localFilename.slice(9) /* strip 9 char local-doc */
                if (strippedRemoteFilenames.has(strippedLocalFilename)) {
                    break
                }
                if (localFilename.endsWith('-lost')) {
                    // if local doc is lost, don't show it
                    continue
                }
                localFilenames.unshift(localFilename) // undo reverse order
            }
            return localFilenames
        } else {
            return filenames
        }
    } catch (error) {
        console.error('An error occurred:', error.message)
        throw error
    }
}

ipcMain.handle(DOCS_API_LIST_DOCS, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_LIST_DOCS} api test worked!`
    } else if (typeof args === 'object'
        && 'project' in args && typeof args.project === 'string'
        && 'isFromRemote' in args && typeof args.isFromRemote === 'boolean'
    ) {
        console.log('listDocs args:', args)
        const { project, isFromRemote } = args
        return await handleListDocs(project, isFromRemote)
    } else {
        throw Error(`invalid args for ${DOCS_API_LIST_DOCS}. Expected: '{ project: string, isFromRemote: boolean }' Got: ${JSON.stringify(args)}`)
    }
})

export const handleRetrieveDoc = async (project: string, isFromRemote: boolean, filename: string):
    Promise<{ remoteSeq: string | 'local-doc', filename: string, doc: unknown, fullPath: string, filenameId: string, filenameModDate: string, filenameCreator: string, filenameModBy: string } | null> => {
    const { normalizedFilename, remoteSeq, filenameModDate, filenameId, filenameCreator, filenameModBy } = parseFilename(filename)
    const fullFromPath = buildDocFolder(project, isFromRemote)
    const fullPath = join(fullFromPath, normalizedFilename)
    try {
        const buffer = await readFile(fullPath)
        const doc = JSON.parse(buffer.toString())
        return { remoteSeq, filename, doc, fullPath, filenameId, filenameModDate, filenameCreator, filenameModBy }
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null
        } else {
            console.error('An error occurred:', error.message)
            throw error
        }
    }
}

ipcMain.handle(DOCS_API_RETRIEVE_DOC, async (_, args) => {
    if (args === 'test') {
        return `${DOCS_API_RETRIEVE_DOC} api test worked!`
    } else if (typeof args === 'object'
        && 'project' in args && typeof args.project === 'string'
        && 'isFromRemote' in args && typeof args.isFromRemote === 'boolean'
        && 'filename' in args && typeof args.filename === 'string'
    ) {
        const { project, isFromRemote, filename } = args
        return await handleRetrieveDoc(project, isFromRemote, filename)
    } else {
        throw Error(`invalid args for ${DOCS_API_RETRIEVE_DOC}. Expected: '{ project: string, isFromRemote: boolean, filename: string }' Got: ${JSON.stringify(args)}`)
    }
})


type WriteDocResponse = ReturnType<typeof parseFilename>

async function writeDoc(fullPath: string, doc: unknown):
    Promise<WriteDocResponse> {
    try {
        await writeFile(fullPath, JSON.stringify(doc))
        return parseFilename(fullPath)
    } catch (error) {
        console.error('An error occurred:', error.message)
        throw error
    }
}

async function listDocs({ project, isFromRemote, fnFilter }: { project: string, isFromRemote: boolean, fnFilter?: (string) => boolean }): Promise<string[]> {
    const fullFromPath = buildDocFolder(project, isFromRemote)
    // detect if path doesn't yet exist
    if (!existsSync(fullFromPath)) {
        return []
    }
    console.log('listDocs fullFromPath:', fullFromPath)
    try {
        const filenames = await readdir(fullFromPath)
        console.log('filenames:', filenames)
        const result = filenames
            .filter(filename => filename.endsWith('.sltt-doc') && (!fnFilter || fnFilter(filename)))
        result.sort() // just in case it's not yet by name
        console.log('listDocs result:', result)
        return result
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []
        } else {
            console.error('An error occurred:', error.message)
            throw error
        }
    }
}
