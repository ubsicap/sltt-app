import { ipcMain, app } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

ipcMain.handle('testWriteFile', async (_, arg) => {
    return new Promise(function (resolve, reject) {
        // do stuff
        if (arg === 'test') {
            const videosFolder = join(app.getPath('userData'), 'fullStorage', 'VideoCache')
            mkdirSync(videosFolder, { recursive: true })
            writeFileSync(join(videosFolder, 'mytest.txt'), 'test worked!')
            resolve('test worked!')
        } else {
            reject('this did NOT work!')
        }
    })
})
