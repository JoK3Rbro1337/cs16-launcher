import { useEffect, useState } from 'react'
import type { SyncProgress, SyncResult } from '../../electron/modules/content-sync'

const MANIFEST_URL_KEY = 'cs16-manifest-url'

type SyncState = 'idle' | 'syncing' | 'done' | 'error'

export default function Settings(): React.JSX.Element {
  const [manifestUrl, setManifestUrl] = useState(
    () => localStorage.getItem(MANIFEST_URL_KEY) ?? ''
  )
  const [state, setState] = useState<SyncState>('idle')
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return window.launcher.onSyncProgress(setProgress)
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
      const syncResult = await window.launcher.syncContent(manifestUrl)
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
          already up to date.
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  )
}
