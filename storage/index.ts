import { ipcMain, app } from 'electron'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { basename, dirname, join } from 'path'

const PERSISTENT_STORAGE_PATH = join(app.getPath('userData'), 'persistentStorage')

ipcMain.handle('testReadFile', async (_, arg) => {
    return new Promise(function (resolve, reject) {
        // do stuff
        if (arg === 'test') {
            resolve('test worked!')
        } else if (Array.isArray(arg)) {
            const [path, seqNum] = arg
            const videosFolder = join(PERSISTENT_STORAGE_PATH, 'VideoCache')
            const relativeVideoPath = dirname(path)
            const fileName = `${basename(path)}-${seqNum}`
            const fullFolder = join(videosFolder, relativeVideoPath)
            const fullPath = join(fullFolder, fileName)
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

ipcMain.handle('testWriteFile', async (_, arg) => {
    return new Promise(function (resolve, reject) {
        // do stuff
        if (arg === 'test') {
            const videosFolder = join(PERSISTENT_STORAGE_PATH, 'VideoCache')
            mkdirSync(videosFolder, { recursive: true })
            writeFileSync(join(videosFolder, 'mytest.txt'), 'test worked!')
            resolve('test worked!')
        } else if (Array.isArray(arg)) {
            const [path, seqNum, arrayBuffer] = arg
            const videosFolder = join(PERSISTENT_STORAGE_PATH, 'VideoCache')
            const relativeVideoPath = dirname(path)
            const fileName = `${basename(path)}-${seqNum}`
            const fullFolder = join(videosFolder, relativeVideoPath)
            const fullPath = join(fullFolder, fileName)
            mkdirSync(fullFolder, { recursive: true })
            const buffer = Buffer.from(arrayBuffer)
            writeFileSync(fullPath, buffer)
            resolve({ path, seqNum, videosFolder, relativeVideoPath, fileName, fullPath, bufferLength: buffer.length })
        } else {
            reject('this did NOT work!')
        }
    })
})
