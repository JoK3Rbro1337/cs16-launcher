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
import { getKnownServers, recordQueryResults, importKnownServers, type KnownServerEntry } from './modules/known-servers'
import {
  getKnownPlayers,
  setPlayerKnown,
  getFriendsOnline,
  importKnownPlayers,
  recordPlayerSightings,
  type KnownPlayer
} from './modules/player-tracking'
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
import { fetchManifest, syncContent, scanFiles, scanConfigGate, type BuildProfile, type ManifestFile } from './modules/content-sync'
import {
  ensureLocalVariant,
  loadLocalVariant,
  previewUpdateLocalVariant,
  commitUpdateLocalVariant,
  importLocalVariant,
  scanLocalVariant,
  type LocalVariantSnapshot
} from './modules/local-config-variant'
import { exportProfile, importProfileFile } from './modules/profile'
import { checkForUpdates, downloadUpdate, initUpdater, installUpdate } from './modules/updater'
import {
  getDesktopIntegrationStatus,
  installDesktopEntry,
  removeDesktopEntry
} from './modules/linux-desktop-integration'
import { initLocale, getLocale, setLocale } from './modules/locale-store'
import {
  initCrosshairOverlay,
  stopCrosshairOverlay,
  getCrosshairSettings,
  updateCrosshairSettings,
  getCrosshairPlatformInfo,
  reassertCrosshairOverlay,
  getKwinRuleInstructions,
  computeSuggestedScale,
  getCrosshairDebugAlignment,
  setCrosshairDebugAlignment,
  type CrosshairSettings
} from './modules/crosshair-overlay'
import {
  initNativeCrosshair,
  getNativeCrosshairStatus,
  updateNativeCrosshairSettings,
  type NativeCrosshairSettings
} from './modules/native-crosshair'
import type { Locale } from '../locales/types'

/**
 * Must match `desktopName` in package.json (which electron-builder also uses to name the
 * installed .desktop file and its StartupWMClass, via linux.syncDesktopName in
 * electron-builder.yml). This is what determines the app's XDG application ID on Wayland —
 * without a consistent value here, compositors can't associate this running window with
 * any .desktop entry, and reject window-activation requests from things like notification
 * clicks (M12). Must be called before 'ready'. See CLAUDE.md's Wayland-activation gotcha.
 */
const DESKTOP_NAME = 'com.cs16launcher.app.desktop'
if (process.platform === 'linux') {
  app.setDesktopName(DESKTOP_NAME)
}
// Complements the above — gives the window/taskbar/dock a real name instead of whatever
// Electron infers by default (previously nothing set this at all).
app.setName('1.6X Launcher')

/**
 * Wayland compositors (KWin included) require an xdg-activation token to grant a
 * self-initiated activation request; window.focus() called from our own process without
 * one is legitimately ignored by design, not a bug — Electron's own docs note focus() may
 * only flash the app icon on Wayland. So: always show/focus (harmless where it works,
 * silently ignored where it doesn't), and when the window still isn't actually focused
 * afterward, fall back to flashFrame (taskbar/urgency hint — some compositors honor it,
 * harmless no-op elsewhere) instead of leaving the user with no visible cue at all.
 */
function focusOrFlagWindow(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  if (!window.isFocused()) {
    window.flashFrame(true)
    window.once('focus', () => window.flashFrame(false))
  }
}

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

  // The moment our own window loses focus is the moment the player most
  // likely just switched to the game — the highest-risk transition for the
  // crosshair overlay falling behind it under KWin (see crosshair-overlay.ts's
  // module doc). Reasserting right here, in addition to that module's own
  // fast timer, catches it immediately instead of waiting out the interval.
  mainWindow.on('blur', () => reassertCrosshairOverlay())

  // The overlay is a real (if hidden) BrowserWindow, so Electron counts it
  // toward "windows still open" — window-all-closed never fires while it's
  // alive, which left the process running after the main window closed on
  // first real test (2026-08). Destroying it here, synchronously as part of
  // the main window's own 'closed' handler, means the window count is
  // already 0 by the time Electron evaluates window-all-closed below.
  mainWindow.on('closed', () => stopCrosshairOverlay())

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
  ipcMain.handle('servers:query-players', async (_e, ip: string, port: number) => {
    const players = await queryPlayers(ip, port)
    // Feeds nickname tracking (M13) — this is the drawer's own on-demand query, not an
    // extra one; see player-tracking.ts's module doc for why this is a natural choke point.
    recordPlayerSightings(ip, port, players.map((p) => p.name)).catch(() => {})
    return players
  })
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
  ipcMain.handle('known-servers:import', (_e, entries: KnownServerEntry[], mode: 'merge' | 'replace') =>
    importKnownServers(entries, mode)
  )
  ipcMain.handle('player-tracking:get-known-players', () => getKnownPlayers())
  ipcMain.handle('player-tracking:set-known', (_e, name: string, known: boolean, note: string) =>
    setPlayerKnown(name, known, note)
  )
  ipcMain.handle('player-tracking:get-friends-online', () => getFriendsOnline())
  ipcMain.handle('player-tracking:import-known-players', (_e, entries: KnownPlayer[], mode: 'merge' | 'replace') =>
    importKnownPlayers(entries, mode)
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
  ipcMain.handle('desktop-integration:get-status', () => getDesktopIntegrationStatus())
  ipcMain.handle('desktop-integration:install', () => installDesktopEntry())
  ipcMain.handle('desktop-integration:remove', () => removeDesktopEntry())
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
  ipcMain.handle(
    'config:import-local-variant',
    (_e, snapshot: LocalVariantSnapshot | null, mode: 'merge' | 'replace') => importLocalVariant(snapshot, mode)
  )
  ipcMain.handle('config:scan-files', (_e, files: ManifestFile[]) => scanFiles(files))
  ipcMain.handle('config:scan-gate', (_e, manifestUrl: string, profile: BuildProfile) => scanConfigGate(manifestUrl, profile))
  ipcMain.handle('config:scan-local-variant', () => scanLocalVariant())

  ipcMain.handle('profile:export', (event, data: unknown) =>
    exportProfile(BrowserWindow.fromWebContents(event.sender), data)
  )
  ipcMain.handle('profile:import-file', (event) => importProfileFile(BrowserWindow.fromWebContents(event.sender)))

  ipcMain.handle('locale:get', () => getLocale())
  ipcMain.handle('locale:set', (_e, locale: Locale) => setLocale(locale))

  ipcMain.handle('crosshair:get-settings', () => getCrosshairSettings())
  ipcMain.handle('crosshair:update-settings', (_e, partial: Partial<CrosshairSettings>) => updateCrosshairSettings(partial))
  ipcMain.handle('crosshair:get-platform-info', () => getCrosshairPlatformInfo())
  ipcMain.handle('crosshair:get-kwin-rule-instructions', () => getKwinRuleInstructions())
  ipcMain.handle('crosshair:compute-suggested-scale', (_e, gameWidth: number, gameHeight: number) =>
    computeSuggestedScale(gameWidth, gameHeight)
  )
  ipcMain.handle('crosshair:get-debug-alignment', () => getCrosshairDebugAlignment())
  ipcMain.handle('crosshair:set-debug-alignment', (_e, enabled: boolean) => setCrosshairDebugAlignment(enabled))

  ipcMain.handle('native-crosshair:get-status', () => getNativeCrosshairStatus())
  ipcMain.handle('native-crosshair:update-settings', (_e, partial: Partial<NativeCrosshairSettings>) =>
    updateNativeCrosshairSettings(partial)
  )

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

app.whenReady().then(async () => {
  // Awaited before initNotificationPoller/registerIpc so background notifications (which can
  // fire with no window ever opened this session) and every locale IPC call always see a
  // resolved locale — see locale-store.ts's getLocaleSync() doc comment.
  await initLocale()

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

  initNotificationPoller({
    onFocusServer: (address) => {
      // Always push the state change (select this server / open its drawer) regardless of
      // whether the window actually got raised — see focusOrFlagWindow's doc comment. That
      // way the app is in the right state the moment the user switches to it themselves,
      // even on a compositor that silently ignored the activation request.
      for (const window of BrowserWindow.getAllWindows()) {
        focusOrFlagWindow(window)
        window.webContents.send('notifications:focus-server', address)
      }
    },
    onConnect: (address) => {
      noteLauncherConnect(address.ip, address.port)
      startSessionWatching()
      connectToServer(address.ip, address.port).catch(() => {})
    },
    onPollStatus: (status) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('notifications:poll-status', status)
      }
    }
  })

  await initCrosshairOverlay()
  await initNativeCrosshair()

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Guard against a stray overlay window ever outliving the app (e.g. a quit
// path — Cmd+Q on darwin, or a future programmatic app.quit() — that doesn't
// go through the main window's 'closed' handler above). Idempotent.
app.on('before-quit', () => stopCrosshairOverlay())
