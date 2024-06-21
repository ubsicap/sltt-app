import { ipcMain, app } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { basename, dirname, join } from 'path'

ipcMain.handle('testWriteFile', async (_, arg) => {
    return new Promise(function (resolve, reject) {
        // do stuff
        if (arg === 'test') {
            const videosFolder = join(app.getPath('userData'), 'fullStorage', 'VideoCache')
            mkdirSync(videosFolder, { recursive: true })
            writeFileSync(join(videosFolder, 'mytest.txt'), 'test worked!')
            resolve('test worked!')
        } else if (Array.isArray(arg)) {
            const [path, seqNum, arrayBuffer] = arg
            const videosFolder = join(app.getPath('userData'), 'fullStorage', 'VideoCache')
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
