/**
 * updater — self-update the launcher itself via electron-updater/GitHub Releases.
 *
 * Entirely separate from content-sync (which updates the *game's* custom
 * content, not the launcher binary). Downloads are opt-in: `autoDownload` is
 * off, so checking for an update only ever reports availability — the
 * renderer has to explicitly call `downloadUpdate()`, so a check on launch
 * can't burn a player's bandwidth mid-session without them asking for it.
 *
 * electron-updater no-ops `checkForUpdates()` (resolves null, no events) when
 * the app isn't packaged, since there's no packaged artifact/latest.yml to
 * compare against in dev. We surface that as an explicit `dev-disabled`
 * status instead of leaving the UI in "checking" forever.
 */

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateStatus =
  | { state: 'dev-disabled' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

let emitStatus: (status: UpdateStatus) => void = () => {}

export function initUpdater(onStatus: (status: UpdateStatus) => void): void {
  emitStatus = onStatus
  autoUpdater.autoDownload = false
  autoUpdater.on('checking-for-update', () => emitStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => emitStatus({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => emitStatus({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    emitStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => emitStatus({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => emitStatus({ state: 'error', message: err.message }))
}

function updaterEnabled(): boolean {
  return app.isPackaged || autoUpdater.forceDevUpdateConfig
}

export async function checkForUpdates(): Promise<void> {
  if (!updaterEnabled()) {
    emitStatus({ state: 'dev-disabled' })
    return
  }
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
