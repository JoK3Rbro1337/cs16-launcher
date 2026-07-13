import { join } from 'node:path'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { detectSteam } from './modules/steam-detect'
import { playGame, connectToServer } from './modules/launch'
import { queryServers, type FavoriteServer } from './modules/server-browser'
import { syncContent } from './modules/content-sync'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Open external links (e.g. steam:// or http) in the OS, never in-app.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('steam:detect', () => detectSteam())
  ipcMain.handle('launch:play', () => playGame())
  ipcMain.handle('launch:connect', (_e, ip: string, port: number) => connectToServer(ip, port))
  ipcMain.handle('servers:query', (_e, favorites: FavoriteServer[]) => queryServers(favorites))
  ipcMain.handle('content:sync', (event, manifestUrl: string) =>
    syncContent(manifestUrl, (progress) => event.sender.send('content:progress', progress))
  )
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.cs16launcher.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
