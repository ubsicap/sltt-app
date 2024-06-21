import { ipcMain } from 'electron'

ipcMain.handle('myfunc', async (_, arg) => {
    return new Promise(function (resolve, reject) {
        // do stuff
        if (arg === 'test') {
            resolve('test worked!')
        } else {
            reject('this did NOT work!')
        }
    })
})
