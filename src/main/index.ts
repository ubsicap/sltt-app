import { app, shell, BrowserWindow, LoadFileOptions, Menu, globalShortcut, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { parse } from 'url'
import { optimizer, is } from '@electron-toolkit/utils'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import icon from '../../resources/icon.png?asset'

const CONFIG_FILE = join(app.getPath('userData'), 'window-configs.json')

function createWindow(partition?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      partition: partition && `persist:${partition}`
    }
  })

  // Maximize the window
  win.maximize()

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  console.log({ loadUrl: process.env['ELECTRON_RENDERER_URL'], isDev: is.dev })
  loadUrlOrFile(win)
  return win
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

  const mainWindow = createWindow()
  const { session: { webRequest } } = mainWindow.webContents

  webRequest.onBeforeRequest({
    urls: ['http://localhost/callback*']
  }, async ({ url: callbackURL }) => {
    const urlParts = parse(callbackURL, true)
    const { search } = urlParts
    loadUrlOrFile(mainWindow, search ? { search } : undefined)
  })

  createMenu(mainWindow)

  // Register a global shortcut for Alt+W
  globalShortcut.register('Alt+W', () => {
    const menu = Menu.getApplicationMenu()
    if (menu) {
      menu.popup({ window: mainWindow })
    }
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

async function launchNewWindowConfig(configs: ReturnType<typeof loadWindowConfigs>): Promise<string> {
  const inputWindow = new BrowserWindow({
    width: 620,
    height: 320,
    modal: true,
    parent: BrowserWindow.getFocusedWindow() || undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  const emptyMenu = Menu.buildFromTemplate([])
  inputWindow.setMenu(emptyMenu)
  inputWindow.loadFile(join(__dirname, '../renderer/dialogs/newPrivateWindow.html'))
  // inputWindow.webContents.openDevTools()

  const [newConfigName] = await promisifyIpcEvent<string>('new-config-name')
  if (newConfigName) {
    configs[newConfigName] = { partition: newConfigName }
    saveWindowConfigs(configs)
    inputWindow.close()
    return newConfigName
  } else {
    inputWindow.close()
    return ''
  }
}

async function promisifyIpcEvent<TResponse>(event: string): Promise<TResponse[]> {
  return new Promise((resolve) => {
    ipcMain.once(event, (_event, ...args) => {
      resolve(args)
    })
  })
}

function loadWindowConfigs(): Record<string, { partition: string }> {
  if (existsSync(CONFIG_FILE)) {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  }
  return {}
}

function saveWindowConfigs(configs: Record<string, { partition: string }>): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2))
}

function createMenu(mainWindow: BrowserWindow): void {
  const configs = loadWindowConfigs()
  const configNames = Object.keys(configs)

  const menuTemplate = [
    {
      label: '🪟',
      submenu: [
        ...configNames.map((name) => ({
          label: name,
          click: (): ReturnType<typeof createWindow> => createWindow(name)
        })),
        {
          label: '➕🕶️',
          click: async (): Promise<void> => {
            const newConfigName = await launchNewWindowConfig(configs)
            if (newConfigName) {
              createWindow(newConfigName)
            }
          }
        },
        {
          label: '🔧',
          tooltip: 'DevTools',
          click: (): void => {
            mainWindow.webContents.openDevTools()
          }
        },
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)

  // Open DevTools when the menu is shown
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Alt' && input.code === 'KeyW') {
      mainWindow.webContents.openDevTools()
    }
  })
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
require('./storage.js')
