import { join } from 'node:path'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { detectSteam } from './modules/steam-detect'
import { playGame, connectToServer, openSteamFix } from './modules/launch'
import { queryServers, queryServer, queryPlayers, type FavoriteServer } from './modules/server-browser'
import { fetchManifest, syncContent, type BuildProfile } from './modules/content-sync'
import { checkForUpdates, downloadUpdate, initUpdater, installUpdate } from './modules/updater'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: '1.6X Launcher',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // Best-effort: failures surface to the renderer via the 'error' status
    // event already wired in initUpdater, nothing more to do with it here.
    checkForUpdates().catch(() => {})
  })

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-change', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-change', false))

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
  ipcMain.handle('launch:fix-steam', (_e, steamFound: boolean) => openSteamFix(steamFound))
  ipcMain.handle('servers:query', (_e, favorites: FavoriteServer[]) => queryServers(favorites))
  ipcMain.handle('servers:query-one', (_e, ip: string, port: number) => queryServer(ip, port))
  ipcMain.handle('servers:query-players', (_e, ip: string, port: number) => queryPlayers(ip, port))
  ipcMain.handle('content:fetch-manifest', (_e, manifestUrl: string) => fetchManifest(manifestUrl))
  ipcMain.handle('content:sync', (event, manifestUrl: string, profile: BuildProfile) =>
    syncContent(manifestUrl, profile, (progress) => event.sender.send('content:progress', progress))
  )
  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:install', () => installUpdate())
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle(
    'window:is-maximized',
    (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  )
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.cs16launcher.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initUpdater((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('updater:status', status)
    }
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
