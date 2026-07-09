import { contextBridge, ipcRenderer } from 'electron'
import type { SteamDetectResult } from './modules/steam-detect'
import type { GameServer } from './modules/server-browser'

/**
 * Renderer-facing API. The renderer has no Node/Electron access — every
 * capability crosses the contextBridge as a typed IPC call (no nodeIntegration).
 */
const launcher = {
  detectSteam: (): Promise<SteamDetectResult> => ipcRenderer.invoke('steam:detect'),
  play: (): Promise<void> => ipcRenderer.invoke('launch:play'),
  connect: (ip: string, port: number): Promise<void> =>
    ipcRenderer.invoke('launch:connect', ip, port),
  queryServers: (): Promise<GameServer[]> => ipcRenderer.invoke('servers:query'),
  syncContent: (): Promise<void> => ipcRenderer.invoke('content:sync')
}

export type LauncherApi = typeof launcher

contextBridge.exposeInMainWorld('launcher', launcher)
