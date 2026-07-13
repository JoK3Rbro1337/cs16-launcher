import { contextBridge, ipcRenderer } from 'electron'
import type { SteamDetectResult } from './modules/steam-detect'
import type { FavoriteServer, GameServer } from './modules/server-browser'
import type { SyncProgress, SyncResult } from './modules/content-sync'
import type { UpdateStatus } from './modules/updater'

/**
 * Renderer-facing API. The renderer has no Node/Electron access — every
 * capability crosses the contextBridge as a typed IPC call (no nodeIntegration).
 */
const launcher = {
  detectSteam: (): Promise<SteamDetectResult> => ipcRenderer.invoke('steam:detect'),
  play: (): Promise<void> => ipcRenderer.invoke('launch:play'),
  connect: (ip: string, port: number): Promise<void> =>
    ipcRenderer.invoke('launch:connect', ip, port),
  queryServers: (favorites: FavoriteServer[]): Promise<GameServer[]> =>
    ipcRenderer.invoke('servers:query', favorites),
  syncContent: (manifestUrl: string): Promise<SyncResult> =>
    ipcRenderer.invoke('content:sync', manifestUrl),
  onSyncProgress: (callback: (progress: SyncProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: SyncProgress): void =>
      callback(progress)
    ipcRenderer.on('content:progress', listener)
    return () => ipcRenderer.removeListener('content:progress', listener)
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
      callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  }
}

export type LauncherApi = typeof launcher

contextBridge.exposeInMainWorld('launcher', launcher)
