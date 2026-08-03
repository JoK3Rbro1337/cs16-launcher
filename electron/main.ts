import { join } from 'node:path'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { detectSteam } from './modules/steam-detect'
import { checkLaunchOptions } from './modules/steam-launch-options'
import { BACKUP_DIRNAME, listBackups, restoreBackup, restoreAllBackups } from './modules/content-sync'
import { playGame, connectToServer, openSteamFix } from './modules/launch'
import {
  initSessionWatcher,
  startWatching as startSessionWatching,
  noteLauncherConnect,
  getLastSession,
  getSessionHistory
} from './modules/session-watcher'
import { queryServers, queryServer, queryPlayers, type FavoriteServer } from './modules/server-browser'
import { fetchServerSources, type ServerSourceSpec } from './modules/server-sources'
import { getKnownServers, recordQueryResults } from './modules/known-servers'
import { scanNeighborhoods } from './modules/neighborhood-scan'
import {
  initNotificationPoller,
  getNotificationState,
  updateNotificationSettings,
  setNotificationRules,
  setNotificationWatchlist,
  type NotificationRule,
  type NotificationSettings
} from './modules/notification-poller'
import { getMapThumbnail } from './modules/map-thumbnails'
import { fetchManifest, syncContent, type BuildProfile } from './modules/content-sync'
import {
  ensureLocalVariant,
  loadLocalVariant,
  previewUpdateLocalVariant,
  commitUpdateLocalVariant
} from './modules/local-config-variant'
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
  ipcMain.handle('steam:check-launch-options', () => checkLaunchOptions())
  ipcMain.handle('launch:play', () => {
    startSessionWatching()
    return playGame()
  })
  ipcMain.handle('launch:connect', (_e, ip: string, port: number) => {
    noteLauncherConnect(ip, port)
    startSessionWatching()
    return connectToServer(ip, port)
  })
  ipcMain.handle('session:get-last', () => getLastSession())
  ipcMain.handle('session:get-history', () => getSessionHistory())
  ipcMain.handle('launch:fix-steam', (_e, steamFound: boolean) => openSteamFix(steamFound))
  ipcMain.handle('servers:query', (_e, favorites: FavoriteServer[]) => queryServers(favorites))
  ipcMain.handle('servers:query-one', (_e, ip: string, port: number) => queryServer(ip, port))
  ipcMain.handle('servers:query-players', (_e, ip: string, port: number) => queryPlayers(ip, port))
  ipcMain.handle('servers:fetch-sources', (_e, specs: ServerSourceSpec[]) => fetchServerSources(specs))
  ipcMain.handle('known-servers:get', () => getKnownServers())
  ipcMain.handle(
    'known-servers:record-results',
    (_e, results: { ip: string; port: number; responded: boolean }[], retentionDays: number) =>
      recordQueryResults(results, retentionDays)
  )
  ipcMain.handle('servers:scan-neighborhood', (_e, known: FavoriteServer[], exclude: FavoriteServer[]) =>
    scanNeighborhoods(known, exclude)
  )
  ipcMain.handle('servers:map-thumbnail', (_e, mapName: string) => getMapThumbnail(mapName))
  ipcMain.handle('notifications:get-state', () => getNotificationState())
  ipcMain.handle('notifications:update-settings', (_e, partial: Partial<NotificationSettings>) =>
    updateNotificationSettings(partial)
  )
  ipcMain.handle('notifications:set-rules', (_e, rules: NotificationRule[]) => setNotificationRules(rules))
  ipcMain.handle('notifications:set-watchlist', (_e, favorites: FavoriteServer[]) =>
    setNotificationWatchlist(favorites)
  )
  ipcMain.handle('content:fetch-manifest', (_e, manifestUrl: string) => fetchManifest(manifestUrl))
  ipcMain.handle('content:sync', (event, manifestUrl: string, profile: BuildProfile) =>
    syncContent(manifestUrl, profile, (progress) => event.sender.send('content:progress', progress))
  )
  ipcMain.handle('config:ensure-local-variant', () => ensureLocalVariant())
  ipcMain.handle('config:get-local-variant', () => loadLocalVariant())
  ipcMain.handle('config:preview-update-local-variant', () => previewUpdateLocalVariant())
  ipcMain.handle('config:commit-update-local-variant', () => commitUpdateLocalVariant())
  ipcMain.handle('config:list-backups', () => listBackups())
  ipcMain.handle('config:restore-backup', (_e, relPath: string) => restoreBackup(relPath))
  ipcMain.handle('config:restore-all-backups', () => restoreAllBackups())

  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:install', () => installUpdate())
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('shell:open-game-folder', async () => {
    const detection = await detectSteam()
    if (!detection.gamePath) throw new Error('CS 1.6 install not found')
    await shell.openPath(detection.gamePath)
  })
  ipcMain.handle('shell:open-backup-folder', async () => {
    const detection = await detectSteam()
    if (!detection.gamePath) throw new Error('CS 1.6 install not found')
    await shell.openPath(join(detection.gamePath, BACKUP_DIRNAME))
  })

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

  initSessionWatcher((session) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('session:update', session)
    }
  })

  initNotificationPoller(
    (address) => {
      const windows = BrowserWindow.getAllWindows()
      for (const window of windows) {
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
        window.webContents.send('notifications:focus-server', address)
      }
    },
    (status) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('notifications:poll-status', status)
      }
    }
  )

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
