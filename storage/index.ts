import { ipcMain, app } from 'electron'
import { writeFileSync, writeFile, mkdirSync, readFile, readdir, existsSync } from 'fs'
import { basename, dirname, join } from 'path'
import { createHash } from 'crypto'

const PERSISTENT_STORAGE_PATH = join(app.getPath('userData'), 'persistentStorage')
const VIDEO_CACHE_PATH = join(PERSISTENT_STORAGE_PATH, 'VideoCache')
const DOCS_PATH = join(PERSISTENT_STORAGE_PATH, 'docs')
const DOCS_FROM_REMOTE_PATH = join(DOCS_PATH, 'remote')
const DOCS_FROM_LOCAL_PATH = join(DOCS_PATH, 'local')

const VIDEO_CACHE_API_STORE_BLOB = 'storeVideoBlob'
const VIDEO_CACHE_API_TRY_RETRIEVE_BLOB = 'tryRetrieveVideoBlob'
const DOCS_API_STORE_DOC = 'storeDoc'
const DOCS_API_LIST_DOCS = 'listDocs'

ipcMain.handle(VIDEO_CACHE_API_TRY_RETRIEVE_BLOB, async (_, args) => {
    return new Promise(function (resolve, reject) {
        if (args === 'test') {
            resolve(`${VIDEO_CACHE_API_TRY_RETRIEVE_BLOB} api test worked!`)
        } else if (Array.isArray(args)
            && args.length === 2
            && typeof args[0] === 'string' 
            && typeof args[1] === 'string') {
            const [path, seqNum] = args
            const relativeVideoPath = dirname(path)
            const fileName = `${basename(path)}-${seqNum}`
            const fullFolder = join(VIDEO_CACHE_PATH, relativeVideoPath)
            const fullPath = join(fullFolder, fileName)
            readFile(fullPath, (error, buffer) => {
                if (error) {
                    if (error.code === 'ENOENT') {
                        resolve(null)
                    } else {
                        // Handle other possible errors
                        console.error('An error occurred:', error.message)
                        reject(error)
                    }
                } else {
                    resolve(buffer)
                }
            })
        } else {
            reject(`invalid args for ${VIDEO_CACHE_API_TRY_RETRIEVE_BLOB}. Expected: [path: string, seqNum: string] Got: ${JSON.stringify(args)}`)
        }
    })
})

ipcMain.handle(VIDEO_CACHE_API_STORE_BLOB, async (_, args) => {
    return new Promise(function (resolve, reject) {
        if (args === 'test') {
            mkdirSync(VIDEO_CACHE_PATH, { recursive: true })
            const testPath = join(VIDEO_CACHE_PATH, 'mytest.txt')
            writeFileSync(testPath, new Date(Date.now()).toISOString())
            resolve(`${VIDEO_CACHE_API_STORE_BLOB} api test worked! Wrote to ${testPath}`)
        } else if (Array.isArray(args)
            && args.length === 3
            && typeof args[0] === 'string' 
            && typeof args[1] === 'string'
            && args[2] instanceof ArrayBuffer) {
            const [path, seqNum, arrayBuffer] = args
            const relativeVideoPath = dirname(path)
            const fileName = `${basename(path)}-${seqNum}`
            const fullFolder = join(VIDEO_CACHE_PATH, relativeVideoPath)
            mkdirSync(fullFolder, { recursive: true })
            const fullPath = join(fullFolder, fileName)
            const buffer = Buffer.from(arrayBuffer)
            writeFile(fullPath, buffer, (err) => {
                if (err) {
                    console.error('An error occurred:', err.message)
                    reject(err)
                } else {
                    resolve({ path, seqNum, videosFolder: VIDEO_CACHE_PATH, relativeVideoPath, fileName, fullPath, bufferLength: buffer.length })
                }
            })
        } else {
            reject(`invalid args for ${VIDEO_CACHE_API_STORE_BLOB}. Expected: [path: string, seqNum: string, arrayBuffer: ArrayBuffer] Got: ${JSON.stringify(args)}`)
        }
    })
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

const composeFilename = (modDate: string, _id: string, creator: string, modBy: string, remoteSeq: string): string => {
    const filenameSafeModDate = composeFilenameSafeDate(modDate)
    const filenameSafeId = composeFilenameSafeId(_id)
    const filenameSafeCreator = composeFilenameSafeEmail(creator)
    const filenameSafeModBy = modBy && composeFilenameSafeEmail(modBy) || 'no-mod-by'
    const filenameRemoteSeq = remoteSeq ? `${remoteSeq.padStart(9, '0')}__` : ''
    const filename = `${filenameRemoteSeq}${filenameSafeModDate}__${filenameSafeId}__${filenameSafeCreator}__${filenameSafeModBy}.sltt-doc`
    return filename
}

const decomposeRemoteSeq = (paddedRemoteSeq: string): string => paddedRemoteSeq.replace(/^0+/, '')

const createMd5Hash = (s: string): string => createHash('md5').update(s).digest('hex').toString()
const createEmailHash = (email: string): string => createMd5Hash(email).substring(0, 16) // api uses this

const composeFilenameSafeEmail = (email: string): string => {
    return createEmailHash(email).substring(0, 8) // 8 characters will probably avoid collision within team 
}

ipcMain.handle(DOCS_API_STORE_DOC, async (_, args) => {
    return new Promise(function (resolve, reject) {
        if (args === 'test') {
            resolve(`${DOCS_API_STORE_DOC} api test worked!`)
        } else if (Array.isArray(args)
            && args.length === 2
            && typeof args[0] === 'object'
            && typeof args[1] === 'string') {
            const [doc, remoteSeq] = args
            const fullFromPath = remoteSeq ? DOCS_FROM_REMOTE_PATH : DOCS_FROM_LOCAL_PATH
            const { _id, modDate, creator, modBy } = doc as { _id: string, modDate: string, creator: string, modBy: string }
            const filename = composeFilename(modDate, _id, creator, modBy, remoteSeq)
            if (filename.length > 255) {
                reject(`attempted filename is too long: ${filename}`)
            }
            mkdirSync(fullFromPath, { recursive: true })
            const fullPath = join(fullFromPath, filename)
            writeFile(fullPath, JSON.stringify(doc), (err) => {
                if (err) {
                    console.error('An error occurred:', err.message)
                    reject(err)
                } else {
                    resolve({ remoteSeq, filename, doc, fullPath, _id, modDate, creator, modBy })
                }
            })
        } else {
            reject(`invalid args for ${DOCS_API_STORE_DOC}. Expected: [doc: string, remoteSeq: string] Got: ${JSON.stringify(args)}`)
        }
    })
})

ipcMain.handle(DOCS_API_LIST_DOCS, async (_, args) => {
    return new Promise(function (resolve, reject) {
        if (args === 'test') {
            resolve(`${DOCS_API_LIST_DOCS} api test worked!`)
        } else if (typeof args === 'object'
            && 'isFromRemote' in args && typeof args.isFromRemote === 'boolean'
        ) {
            console.log('listDocs args:', args)
            const { isFromRemote } = args
            const fullFromPath = isFromRemote ? DOCS_FROM_REMOTE_PATH : DOCS_FROM_LOCAL_PATH
            // detect if path doesn't yet exist
            if (!existsSync(fullFromPath)) {
                resolve([])
            }
            console.log('listDocs fullFromPath:', fullFromPath)
            readdir(fullFromPath, (err, filenames) => {
                if (err) {
                    console.error('An error occurred:', err.message)
                    reject(err)
                } else {
                    console.log('filenames:', filenames)
                    const result = filenames
                        .filter(filename => filename.endsWith('.sltt-doc'))
                        .map(filename => {
                            if (isFromRemote) {
                                const [remoteSeq, modDate] = filename.split('__').slice(0, 2)
                                const normalizedModDate = decomponseFilenameSafeDate(modDate)
                                const remoteSeqWithoutPadding = decomposeRemoteSeq(remoteSeq)
                                return { modDate: normalizedModDate, remoteSeq: remoteSeqWithoutPadding }
                            }
                            const modDate = filename.split('__')[0]
                            const normalizedModDate = decomponseFilenameSafeDate(modDate)
                            return { modDate: normalizedModDate, remoteSeq: '' }
                        })
                    console.log('listDocs result:', result)
                    resolve(result)
                }
            })
        } else {
            reject(`invalid args for ${DOCS_API_LIST_DOCS}. Expected: '{ isFromRemote: boolean }' Got: ${JSON.stringify(args)}`)
        }
    })
})
