import { contextBridge, ipcRenderer } from 'electron'
import type { SteamDetectResult } from './modules/steam-detect'
import type { LaunchOptionsCheck } from './modules/steam-launch-options'
import type { FavoriteServer, GameServer, QueryServersResult, ServerPlayer } from './modules/server-browser'
import type { ServerSourceResult, ServerSourceSpec } from './modules/server-sources'
import type { KnownServerEntry } from './modules/known-servers'
import type { KnownPlayer, FriendsOnlineEntry } from './modules/player-tracking'
import type { NeighborhoodScanResult } from './modules/neighborhood-scan'
import type { BackedUpFile, BuildProfile, ContentManifest, ManifestFile, SyncProgress, SyncResult } from './modules/content-sync'
import type { LocalVariantSnapshot, UpdatePreview } from './modules/local-config-variant'
import type { ConfigScanResult } from './modules/config-scanner'
import type { UpdateStatus } from './modules/updater'
import type { LiveSession, SessionHistoryEntry } from './modules/session-watcher'
import type { NotificationRule, NotificationSettings, PollStatus } from './modules/notification-poller'
import type { Locale } from '../locales/types'

/**
 * Renderer-facing API. The renderer has no Node/Electron access — every
 * capability crosses the contextBridge as a typed IPC call (no nodeIntegration).
 */
const launcher = {
  detectSteam: (): Promise<SteamDetectResult> => ipcRenderer.invoke('steam:detect'),
  checkLaunchOptions: (): Promise<LaunchOptionsCheck> => ipcRenderer.invoke('steam:check-launch-options'),
  play: (): Promise<void> => ipcRenderer.invoke('launch:play'),
  connect: (ip: string, port: number): Promise<void> =>
    ipcRenderer.invoke('launch:connect', ip, port),
  fixSteam: (steamFound: boolean): Promise<void> => ipcRenderer.invoke('launch:fix-steam', steamFound),
  queryServers: (favorites: FavoriteServer[]): Promise<QueryServersResult> =>
    ipcRenderer.invoke('servers:query', favorites),
  queryServer: (ip: string, port: number): Promise<GameServer> =>
    ipcRenderer.invoke('servers:query-one', ip, port),
  queryPlayers: (ip: string, port: number): Promise<ServerPlayer[]> =>
    ipcRenderer.invoke('servers:query-players', ip, port),
  fetchServerSources: (specs: ServerSourceSpec[]): Promise<ServerSourceResult[]> =>
    ipcRenderer.invoke('servers:fetch-sources', specs),
  getKnownServers: (): Promise<KnownServerEntry[]> => ipcRenderer.invoke('known-servers:get'),
  recordKnownServerResults: (
    results: { ip: string; port: number; responded: boolean }[],
    retentionDays: number
  ): Promise<void> => ipcRenderer.invoke('known-servers:record-results', results, retentionDays),
  scanNeighborhood: (known: FavoriteServer[], exclude: FavoriteServer[]): Promise<NeighborhoodScanResult> =>
    ipcRenderer.invoke('servers:scan-neighborhood', known, exclude),
  importKnownServers: (entries: KnownServerEntry[], mode: 'merge' | 'replace'): Promise<KnownServerEntry[]> =>
    ipcRenderer.invoke('known-servers:import', entries, mode),
  getKnownPlayers: (): Promise<KnownPlayer[]> => ipcRenderer.invoke('player-tracking:get-known-players'),
  setPlayerKnown: (name: string, known: boolean, note: string): Promise<KnownPlayer[]> =>
    ipcRenderer.invoke('player-tracking:set-known', name, known, note),
  getFriendsOnline: (): Promise<FriendsOnlineEntry[]> => ipcRenderer.invoke('player-tracking:get-friends-online'),
  importKnownPlayers: (entries: KnownPlayer[], mode: 'merge' | 'replace'): Promise<KnownPlayer[]> =>
    ipcRenderer.invoke('player-tracking:import-known-players', entries, mode),
  getMapThumbnail: (mapName: string): Promise<string | null> =>
    ipcRenderer.invoke('servers:map-thumbnail', mapName),
  getNotificationState: (): Promise<{ settings: NotificationSettings; rules: NotificationRule[]; status: PollStatus }> =>
    ipcRenderer.invoke('notifications:get-state'),
  updateNotificationSettings: (partial: Partial<NotificationSettings>): Promise<NotificationSettings> =>
    ipcRenderer.invoke('notifications:update-settings', partial),
  setNotificationRules: (rules: NotificationRule[]): Promise<void> =>
    ipcRenderer.invoke('notifications:set-rules', rules),
  setNotificationWatchlist: (favorites: FavoriteServer[]): Promise<void> =>
    ipcRenderer.invoke('notifications:set-watchlist', favorites),
  onNotificationFocusServer: (callback: (address: FavoriteServer) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, address: FavoriteServer): void => callback(address)
    ipcRenderer.on('notifications:focus-server', listener)
    return () => ipcRenderer.removeListener('notifications:focus-server', listener)
  },
  onNotificationPollStatus: (callback: (status: PollStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: PollStatus): void => callback(status)
    ipcRenderer.on('notifications:poll-status', listener)
    return () => ipcRenderer.removeListener('notifications:poll-status', listener)
  },
  getDesktopIntegrationStatus: (): Promise<{ eligible: boolean; installed: boolean }> =>
    ipcRenderer.invoke('desktop-integration:get-status'),
  installDesktopIntegration: (): Promise<void> => ipcRenderer.invoke('desktop-integration:install'),
  removeDesktopIntegration: (): Promise<void> => ipcRenderer.invoke('desktop-integration:remove'),
  fetchManifest: (manifestUrl: string): Promise<ContentManifest> =>
    ipcRenderer.invoke('content:fetch-manifest', manifestUrl),
  syncContent: (manifestUrl: string, profile: BuildProfile): Promise<SyncResult> =>
    ipcRenderer.invoke('content:sync', manifestUrl, profile),
  onSyncProgress: (callback: (progress: SyncProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: SyncProgress): void =>
      callback(progress)
    ipcRenderer.on('content:progress', listener)
    return () => ipcRenderer.removeListener('content:progress', listener)
  },
  ensureLocalConfigVariant: (): Promise<LocalVariantSnapshot | null> =>
    ipcRenderer.invoke('config:ensure-local-variant'),
  getLocalConfigVariant: (): Promise<LocalVariantSnapshot | null> =>
    ipcRenderer.invoke('config:get-local-variant'),
  previewUpdateLocalConfigVariant: (): Promise<UpdatePreview> =>
    ipcRenderer.invoke('config:preview-update-local-variant'),
  commitUpdateLocalConfigVariant: (): Promise<LocalVariantSnapshot> =>
    ipcRenderer.invoke('config:commit-update-local-variant'),
  listBackups: (): Promise<BackedUpFile[]> => ipcRenderer.invoke('config:list-backups'),
  restoreBackup: (relPath: string): Promise<void> => ipcRenderer.invoke('config:restore-backup', relPath),
  restoreAllBackups: (): Promise<{ restored: string[] }> => ipcRenderer.invoke('config:restore-all-backups'),
  importLocalConfigVariant: (
    snapshot: LocalVariantSnapshot | null,
    mode: 'merge' | 'replace'
  ): Promise<LocalVariantSnapshot | null> => ipcRenderer.invoke('config:import-local-variant', snapshot, mode),
  scanConfigFiles: (files: ManifestFile[]): Promise<ConfigScanResult> => ipcRenderer.invoke('config:scan-files', files),
  scanConfigGate: (manifestUrl: string, profile: BuildProfile): Promise<ConfigScanResult | null> =>
    ipcRenderer.invoke('config:scan-gate', manifestUrl, profile),
  scanLocalConfigVariant: (): Promise<ConfigScanResult | null> => ipcRenderer.invoke('config:scan-local-variant'),
  exportProfile: (data: unknown): Promise<{ canceled: boolean }> => ipcRenderer.invoke('profile:export', data),
  importProfileFile: (): Promise<{ canceled: boolean; data?: unknown }> =>
    ipcRenderer.invoke('profile:import-file'),
  getLastSession: (): Promise<LiveSession | null> => ipcRenderer.invoke('session:get-last'),
  getSessionHistory: (): Promise<SessionHistoryEntry[]> => ipcRenderer.invoke('session:get-history'),
  onSessionUpdate: (callback: (session: LiveSession | null) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, session: LiveSession | null): void => callback(session)
    ipcRenderer.on('session:update', listener)
    return () => ipcRenderer.removeListener('session:update', listener)
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getLocale: (): Promise<Locale> => ipcRenderer.invoke('locale:get'),
  setLocale: (locale: Locale): Promise<void> => ipcRenderer.invoke('locale:set', locale),
  openGameFolder: (): Promise<void> => ipcRenderer.invoke('shell:open-game-folder'),
  openBackupFolder: (): Promise<void> => ipcRenderer.invoke('shell:open-backup-folder'),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
      callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void =>
      callback(maximized)
    ipcRenderer.on('window:maximized-change', listener)
    return () => ipcRenderer.removeListener('window:maximized-change', listener)
  }
}

export type LauncherApi = typeof launcher

contextBridge.exposeInMainWorld('launcher', launcher)
