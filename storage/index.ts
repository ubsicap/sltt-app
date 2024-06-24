import { ipcMain, app } from 'electron'
import { writeFileSync, writeFile, mkdirSync, readFileSync, readFile } from 'fs'
import { basename, dirname, join } from 'path'

const PERSISTENT_STORAGE_PATH = join(app.getPath('userData'), 'persistentStorage')
const VIDEO_CACHE_PATH = join(PERSISTENT_STORAGE_PATH, 'VideoCache')

ipcMain.handle('tryRetrieveVideoBlob', async (_, args) => {
    return new Promise(function (resolve, reject) {
        // do stuff
        if (args === 'test') {
            resolve('test worked!')
        } else if (Array.isArray(args)) {
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
            try {
                const buffer = readFileSync(fullPath)
                resolve(buffer)
            } catch (error) {
                if (error.code === 'ENOENT') {
                    resolve(null)
                } else {
                    // Handle other possible errors
                    console.error('An error occurred:', error.message)
                    reject(error)
                }
            }

        } else {
            reject('this did NOT work!')
        }
    })
})

ipcMain.handle('storeVideoBlob', async (_, args) => {
    return new Promise(function (resolve, reject) {
        // do stuff
        if (args === 'test') {
            mkdirSync(VIDEO_CACHE_PATH, { recursive: true })
            writeFileSync(join(VIDEO_CACHE_PATH, 'mytest.txt'), 'test worked!')
            resolve('test worked!')
        } else if (Array.isArray(args)) {
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
            reject('this did NOT work!')
        }
    })
})
