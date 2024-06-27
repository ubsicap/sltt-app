import { ipcMain, app } from 'electron'
import { writeFileSync, writeFile, mkdirSync, readFile } from 'fs'
import { basename, dirname, join } from 'path'
import { createHash } from 'crypto'

const PERSISTENT_STORAGE_PATH = join(app.getPath('userData'), 'persistentStorage')
const VIDEO_CACHE_PATH = join(PERSISTENT_STORAGE_PATH, 'VideoCache')
const DOCS_PATH = join(PERSISTENT_STORAGE_PATH, 'docs')
const DOCS_FROM_REMOTE_PATH = join(DOCS_PATH, 'remote')
const DOCS_FROM_LOCAL_PATH = join(DOCS_PATH, 'local')

const VIDEO_CACHE_API_STORE_BLOB = 'storeVideoBlob'
const VIDEO_CACHE_API_TRY_RETRIEVE_BLOB = 'tryRetrieveVideoBlob'
const DOCS_API_PUT_DOC = 'putDoc'

ipcMain.handle(VIDEO_CACHE_API_TRY_RETRIEVE_BLOB, async (_, args) => {
    return new Promise(function (resolve, reject) {
        // do stuff
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
        // do stuff
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

const getFilenameSafeDate = (modDate: string): string => {
    let dateStr = modDate // 2024/06/17 09:49:07.997Z
    // Replace slashes, spaces, and colons with underscores to make it filename-safe
    dateStr = dateStr.replace(/\//g, '-') // Replace slashes with hyphens
    dateStr = dateStr.replace(/ /g, '_') // Replace spaces with underscores
    dateStr = dateStr.replace(/:/g, '-') // Replace colons with hyphens
    // Handle milliseconds and 'Z' - replace '.' with '-' and remove 'Z'
    dateStr = dateStr.replace(/\./g, '-').replace(/Z$/, '')
    return dateStr // 2024-06-17_09-49-07-997
}

const getFilenameSafeId = (_id: string): string => {
    // GIVEN _id in format like plan_240617_094907/stg_240617_094910/tsk_240617_094912
    // Replace slashes with hyphens
    return _id.replace(/\//g, '-') // plan_240617_094907-stg_240617_094910-tsk_240617_094912
}


const createMd5Hash = (s: string): string => createHash('md5').update(s).digest('hex').toString()
const createEmailHash = (email: string): string => createMd5Hash(email).substring(0, 16)

const getFilenameSafeEmail = (email: string): string => {
    return createEmailHash(email)
}



ipcMain.handle(DOCS_API_PUT_DOC, async (_, args) => {
    return new Promise(function (resolve, reject) {
        // do stuff
        if (args === 'test') {
            resolve(`${DOCS_API_PUT_DOC} api test worked!`)
        } else if (Array.isArray(args)
            && args.length === 2
            && typeof args[0] === 'object') {
            const [doc] = args
            // is remote doc or local?
            const { _id, modDate, creator, modBy } = doc as { _id: string, modDate: string, creator: string, modBy: string }
            // TODO: make path safe as filename
            const filenameSafeModDate = getFilenameSafeDate(modDate)
            const filenameSafeId = getFilenameSafeId(_id)
            const filenameSafeCreator = getFilenameSafeEmail(creator)
            const filenameSafeModBy = modBy && getFilenameSafeEmail(modBy) || 'no-mod-by'
            const filename = `${filenameSafeModDate}__${filenameSafeId}__${filenameSafeCreator}__${filenameSafeModBy}`
            mkdirSync(DOCS_FROM_REMOTE_PATH, { recursive: true })
            const fullPath = join(DOCS_FROM_REMOTE_PATH, DOCS_FROM_REMOTE_PATH)
            writeFile(fullPath, doc, (err) => {
                if (err) {
                    console.error('An error occurred:', err.message)
                    reject(err)
                } else {
                    resolve({ filename, doc, fullPath, _id, modDate, creator, modBy })
                }
            })
        } else {
            reject(`invalid args for ${DOCS_API_PUT_DOC}. Expected: [path: string, content: string] Got: ${JSON.stringify(args)}`)
        }
    })
})
