import { useEffect, useState } from 'react'
import type { BuildProfile, SyncProgress, SyncResult } from '../../electron/modules/content-sync'
import type { UpdateStatus } from '../../electron/modules/updater'
import { BUILD_PROFILE_KEY, MANIFEST_URL_KEY, loadJSON } from '../lib/storage'

type SyncState = 'idle' | 'syncing' | 'done' | 'error'

export default function Settings(): React.JSX.Element {
  const [manifestUrl, setManifestUrl] = useState(
    () => localStorage.getItem(MANIFEST_URL_KEY) ?? ''
  )
  const [state, setState] = useState<SyncState>('idle')
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    return window.launcher.onSyncProgress(setProgress)
  }, [])

  useEffect(() => {
    window.launcher.getAppVersion().then(setAppVersion)
    const unsubscribe = window.launcher.onUpdateStatus(setUpdateStatus)
    // Re-check on every visit: the startup auto-check's result may have
    // arrived before this page was ever mounted (Settings unmounts when the
    // user switches tabs), so its status would otherwise be missed. Cheap —
    // electron-updater dedupes a check that's already in flight.
    window.launcher.checkForUpdates()
    return unsubscribe
  }, [])

  function handleManifestUrlChange(value: string): void {
    setManifestUrl(value)
    localStorage.setItem(MANIFEST_URL_KEY, value)
  }

  async function handleSync(): Promise<void> {
    setState('syncing')
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const profile = loadJSON<BuildProfile>(BUILD_PROFILE_KEY, { selections: {}, features: {} })
      const syncResult = await window.launcher.syncContent(manifestUrl, profile)
      setResult(syncResult)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  const pct =
    progress && progress.totalBytes > 0
      ? Math.round((progress.downloadedBytes / progress.totalBytes) * 100)
      : progress
        ? 100
        : 0

  async function handleDownloadUpdate(): Promise<void> {
    try {
      await window.launcher.downloadUpdate()
    } catch (err) {
      setUpdateStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleInstallUpdate(): Promise<void> {
    await window.launcher.installUpdate()
  }

  return (
    <section className="page">
      <h1>Settings</h1>

      <label className="field">
        <span>Content manifest URL</span>
        <input
          type="text"
          className="text-input"
          placeholder="https://github.com/<owner>/<repo>/releases/download/<tag>/manifest.json"
          value={manifestUrl}
          onChange={(e) => handleManifestUrlChange(e.target.value)}
        />
      </label>

      <button
        className="primary"
        disabled={!manifestUrl || state === 'syncing'}
        onClick={handleSync}
      >
        {state === 'syncing' ? 'Syncing…' : 'Sync Content'}
      </button>

      {state === 'syncing' && (
        <div className="sync-progress">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="muted">
            {progress
              ? `${progress.completedFiles}/${progress.totalFiles} files — ${pct}%${
                  progress.currentFile ? ` — ${progress.currentFile}` : ''
                }`
              : 'Checking local files…'}
          </p>
        </div>
      )}

      {state === 'done' && result && (
        <p className="muted">
          Synced content v{result.version}: {result.updatedFiles} updated, {result.skippedFiles}{' '}
          already up to date, {result.removedFiles} removed.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <h2>Launcher Updates</h2>
      <p className="muted">Version {appVersion ?? '…'}</p>

      <button
        className="secondary"
        disabled={updateStatus?.state === 'checking' || updateStatus?.state === 'downloading'}
        onClick={() => window.launcher.checkForUpdates()}
      >
        Check for Updates
      </button>

      {updateStatus?.state === 'dev-disabled' && (
        <p className="muted">Updates are disabled in development builds.</p>
      )}
      {updateStatus?.state === 'checking' && <p className="muted">Checking for updates…</p>}
      {updateStatus?.state === 'not-available' && (
        <p className="muted">You're on the latest version.</p>
      )}
      {updateStatus?.state === 'available' && (
        <div className="sync-progress">
          <p className="muted">Update v{updateStatus.version} is available.</p>
          <button className="primary" onClick={handleDownloadUpdate}>
            Download Update
          </button>
        </div>
      )}
      {updateStatus?.state === 'downloading' && (
        <div className="sync-progress">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${updateStatus.percent}%` }} />
          </div>
          <p className="muted">Downloading update — {updateStatus.percent}%</p>
        </div>
      )}
      {updateStatus?.state === 'downloaded' && (
        <div className="sync-progress">
          <p className="muted">Update v{updateStatus.version} downloaded and ready to install.</p>
          <button className="primary" onClick={handleInstallUpdate}>
            Restart &amp; Install
          </button>
        </div>
      )}
      {updateStatus?.state === 'error' && <p className="error">{updateStatus.message}</p>}
    </section>
  )
}
