import { contextBridge, ipcRenderer } from 'electron'
import type { SteamDetectResult } from './modules/steam-detect'
import type { LaunchOptionsCheck } from './modules/steam-launch-options'
import type { FavoriteServer, GameServer, QueryServersResult, ServerPlayer } from './modules/server-browser'
import type { ServerSourceResult, ServerSourceSpec } from './modules/server-sources'
import type { BackedUpFile, BuildProfile, ContentManifest, SyncProgress, SyncResult } from './modules/content-sync'
import type { LocalVariantSnapshot, UpdatePreview } from './modules/local-config-variant'
import type { UpdateStatus } from './modules/updater'

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
  getMapThumbnail: (mapName: string): Promise<string | null> =>
    ipcRenderer.invoke('servers:map-thumbnail', mapName),
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
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
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
