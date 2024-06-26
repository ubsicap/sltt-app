import { ipcMain, app } from 'electron'
import { writeFileSync, writeFile, mkdirSync, readFile } from 'fs'
import { basename, dirname, join } from 'path'

const PERSISTENT_STORAGE_PATH = join(app.getPath('userData'), 'persistentStorage')
const VIDEO_CACHE_PATH = join(PERSISTENT_STORAGE_PATH, 'VideoCache')

const VIDEO_CACHE_API_STORE_BLOB = 'storeVideoBlob'
const VIDEO_CACHE_API_TRY_RETRIEVE_BLOB = 'tryRetrieveVideoBlob'

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
            const fullPath = join(fullFolder, fileName)
            mkdirSync(fullFolder, { recursive: true })
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
