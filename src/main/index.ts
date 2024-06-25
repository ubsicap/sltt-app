import { app, shell, BrowserWindow, LoadFileOptions } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { parse } from 'url'
import { optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Maximize the window
  mainWindow.maximize()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  console.log({ loadUrl: process.env['ELECTRON_RENDERER_URL'], isDev: is.dev })
  loadUrlOrFile(mainWindow)
  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  ensureOneInstanceOfSlttAppAndCompressor()
  // Set app user model id for windows
  // const { build: { appId } } = require('./package.json')
  app.setAppUserModelId(app.name)

  // Check for updates
  // see https://www.electron.build/auto-update
  autoUpdater.checkForUpdatesAndNotify()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const win = createWindow()
  const { session: { webRequest } } = win.webContents

  webRequest.onBeforeRequest({
    urls: ['http://localhost/callback*']
  }, async ({ url: callbackURL }) => {
    const urlParts = parse(callbackURL, true)
    const { search } = urlParts
    loadUrlOrFile(win, search ? { search } : undefined)
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


// if someone launches a second version of the app, quit it and focus on the first one
function ensureOneInstanceOfSlttAppAndCompressor(): void {
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
  } else {
    // launch compressor
    require('../../compressor/index.js')
    app.on('second-instance', () => {
      // Someone tried to run a second instance, we should focus our window.
      const allWindows = BrowserWindow.getAllWindows()
      if (allWindows.length) {
        const win = allWindows[0]
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    })
  }
}

function loadUrlOrFile(mainWindow: BrowserWindow, options: LoadFileOptions | undefined = undefined): void {
  console.log({ isDev: is.dev, options })
  if (is.dev) {
    mainWindow.loadURL(`http://localhost:3000/${options?.search || ''}`)
  } else {
    // mainWindow.loadURL('https://sltt-bible.net')
    mainWindow.loadFile(join(__dirname, '../client/index.html'), options)
  }
}
// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
