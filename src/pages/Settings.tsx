import { useEffect, useRef, useState } from 'react'
import { FolderOpen, TriangleAlert } from 'lucide-react'
import type { BuildProfile, SyncProgress, SyncProgressItem, SyncResult } from '../../electron/modules/content-sync'
import type { UpdateStatus } from '../../electron/modules/updater'
import { BUILD_PROFILE_KEY, MANIFEST_URL_KEY, getReduceMotion, loadJSON, setReduceMotion } from '../lib/storage'
import { useToast } from '../lib/toast'
import { registerVerifyHandler } from '../lib/verifyRequest'
import ConfirmModal from '../components/ConfirmModal'
import {
  getBattlemetricsEnabled,
  loadSubscriptions,
  saveSubscriptions,
  setBattlemetricsEnabled,
  type ServerSubscription
} from '../lib/serverSources'

function isValidSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

type SyncState = 'idle' | 'syncing' | 'done' | 'error'
type SyncAction = 'sync' | 'verify'

interface SpeedSample {
  bytes: number
  time: number
  speed: number
}

const STATUS_ORDER: Record<SyncProgressItem['status'], number> = { downloading: 0, pending: 1, done: 2 }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatSpeed(bytesPerSec: number): string {
  return bytesPerSec > 0 ? `${formatBytes(bytesPerSec)}/s` : ''
}

function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

/** Tracks a byte counter over time, sampling at most every 200ms so displayed speed doesn't jitter every chunk. */
function sampleSpeed(prev: SpeedSample | undefined, bytes: number): SpeedSample {
  const now = performance.now()
  if (!prev) return { bytes, time: now, speed: 0 }
  const dt = now - prev.time
  if (dt < 200) return prev
  return { bytes, time: now, speed: (bytes - prev.bytes) / (dt / 1000) }
}

function ProgressRing({ pct }: { pct: number }): React.JSX.Element {
  const size = 44
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(1, Math.max(0, pct)))
  return (
    <svg width={size} height={size} className="progress-ring">
      <circle className="progress-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
      <circle
        className="progress-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

export default function Settings(): React.JSX.Element {
  const { pushToast } = useToast()
  const [manifestUrl, setManifestUrl] = useState(() => localStorage.getItem(MANIFEST_URL_KEY) ?? '')
  const [reduceMotion, setReduceMotionState] = useState(getReduceMotion)

  const [state, setState] = useState<SyncState>('idle')
  const [lastAction, setLastAction] = useState<SyncAction>('sync')
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmVerify, setConfirmVerify] = useState(false)

  const [itemSpeeds, setItemSpeeds] = useState<Record<string, number>>({})
  const [globalSpeed, setGlobalSpeed] = useState(0)
  const itemSpeedSamples = useRef(new Map<string, SpeedSample>())
  const globalSpeedSample = useRef<SpeedSample | undefined>(undefined)

  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)

  const [subscriptions, setSubscriptions] = useState<ServerSubscription[]>(loadSubscriptions)
  const [subUrl, setSubUrl] = useState('')
  const [subError, setSubError] = useState<string | null>(null)
  const [battlemetricsEnabled, setBattlemetricsEnabledState] = useState(getBattlemetricsEnabled)

  useEffect(() => {
    return window.launcher.onSyncProgress((p) => {
      setProgress(p)
      globalSpeedSample.current = sampleSpeed(globalSpeedSample.current, p.downloadedBytes)
      setGlobalSpeed(globalSpeedSample.current.speed)
      setItemSpeeds((prev) => {
        const next = { ...prev }
        for (const item of p.items) {
          if (item.status !== 'downloading') continue
          const sample = sampleSpeed(itemSpeedSamples.current.get(item.path), item.downloadedBytes)
          itemSpeedSamples.current.set(item.path, sample)
          next[item.path] = sample.speed
        }
        return next
      })
    })
  }, [])

  useEffect(() => registerVerifyHandler(() => setConfirmVerify(true)), [])

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

  function handleToggleReduceMotion(): void {
    const next = !reduceMotion
    setReduceMotion(next)
    setReduceMotionState(next)
  }

  async function runSync(action: SyncAction): Promise<void> {
    setLastAction(action)
    setState('syncing')
    setError(null)
    setResult(null)
    setProgress(null)
    setItemSpeeds({})
    itemSpeedSamples.current.clear()
    globalSpeedSample.current = undefined
    setGlobalSpeed(0)
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

  async function handleOpenGameFolder(): Promise<void> {
    try {
      await window.launcher.openGameFolder()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleOpenBackupFolder(): Promise<void> {
    try {
      await window.launcher.openBackupFolder()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    }
  }

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

  function handleToggleBattlemetrics(): void {
    const next = !battlemetricsEnabled
    setBattlemetricsEnabled(next)
    setBattlemetricsEnabledState(next)
  }

  function handleAddSubscription(): void {
    const url = subUrl.trim()
    if (!isValidSourceUrl(url)) {
      setSubError('Enter a valid http(s) URL')
      return
    }
    if (subscriptions.some((s) => s.url === url)) {
      setSubError('Already added')
      return
    }
    const next = [...subscriptions, { id: crypto.randomUUID(), url }]
    setSubscriptions(next)
    saveSubscriptions(next)
    setSubUrl('')
    setSubError(null)
  }

  function handleRemoveSubscription(id: string): void {
    const next = subscriptions.filter((s) => s.id !== id)
    setSubscriptions(next)
    saveSubscriptions(next)
  }

  const pct = progress && progress.totalBytes > 0 ? progress.downloadedBytes / progress.totalBytes : state === 'done' ? 1 : 0
  const remainingBytes = progress ? progress.totalBytes - progress.downloadedBytes : 0
  const etaSeconds = state === 'syncing' && globalSpeed > 0 ? remainingBytes / globalSpeed : null
  const sortedItems = progress ? [...progress.items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) : []

  const headline =
    state === 'syncing'
      ? `${progress?.completedFiles ?? 0}/${progress?.totalFiles ?? 0} files`
      : state === 'done'
        ? 'Up to date'
        : state === 'error'
          ? 'Sync failed'
          : 'Ready to sync'

  return (
    <section className="page">
      <h1>Content Sync</h1>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="manifest-url">
          Content manifest URL
        </label>
        <input
          id="manifest-url"
          type="text"
          className="cp-input"
          placeholder="https://github.com/<owner>/<repo>/releases/download/<tag>/manifest.json"
          value={manifestUrl}
          onChange={(e) => handleManifestUrlChange(e.target.value)}
        />
      </div>

      <div className="sync-summary-card">
        <ProgressRing pct={pct} />
        <div className="sync-summary-info">
          <p className="sync-summary-headline">{headline}</p>
          <p className="sync-summary-eta">
            {state === 'syncing'
              ? `ETA ${formatEta(etaSeconds)} · ${formatSpeed(globalSpeed) || '—'}`
              : state === 'done' && result
                ? `v${result.version} · ${result.updatedFiles} updated, ${result.skippedFiles} unchanged`
                : 'No sync in progress'}
          </p>
        </div>
        <div className="sync-summary-actions">
          <button className="cp-btn-primary" disabled={!manifestUrl || state === 'syncing'} onClick={() => runSync('sync')}>
            {state === 'syncing' && lastAction === 'sync' ? 'Syncing…' : 'Sync Content'}
          </button>
          <button
            className="cp-btn-secondary"
            disabled={!manifestUrl || state === 'syncing'}
            onClick={() => setConfirmVerify(true)}
          >
            {state === 'syncing' && lastAction === 'verify' ? 'Verifying…' : 'Verify & Repair'}
          </button>
        </div>
      </div>

      {state === 'error' && error && (
        <div className="sync-error">
          <TriangleAlert size={14} />
          <span>{error}</span>
          <button className="cp-btn-secondary" onClick={() => runSync(lastAction)}>
            Retry
          </button>
        </div>
      )}

      {progress && progress.items.length > 0 && (
        <div className="sync-item-list">
          {sortedItems.map((item) => {
            const pctItem = item.size > 0 ? (item.downloadedBytes / item.size) * 100 : item.status === 'done' ? 100 : 0
            return (
              <div key={item.path} className={`sync-item sync-item-${item.status}`}>
                <span className="sync-item-name">{fileName(item.path)}</span>
                <span className="sync-item-size">{formatBytes(item.size)}</span>
                <div className="sync-item-bar">
                  <div className="sync-item-bar-fill" style={{ width: `${pctItem}%` }} />
                </div>
                <span className="sync-item-speed">
                  {item.status === 'downloading' ? formatSpeed(itemSpeeds[item.path] ?? 0) : item.status === 'done' ? 'done' : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {confirmVerify && (
        <ConfirmModal
          title="Verify & Repair Files"
          message="Re-checks every file in the active content build against the manifest and re-downloads anything that doesn't match. This can take a while on a slow connection."
          confirmLabel="Verify & Repair"
          onConfirm={() => {
            setConfirmVerify(false)
            runSync('verify')
          }}
          onCancel={() => setConfirmVerify(false)}
        />
      )}

      <h2 className="section-header">Folders</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Game folder</p>
            <p className="settings-row-desc">Open the CS 1.6 install directory in your file manager.</p>
          </div>
          <button className="cp-btn-secondary" onClick={handleOpenGameFolder}>
            <FolderOpen size={14} /> Open
          </button>
        </div>
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Backups folder</p>
            <p className="settings-row-desc">Original files the launcher preserved before overwriting them.</p>
          </div>
          <button className="cp-btn-secondary" onClick={handleOpenBackupFolder}>
            <FolderOpen size={14} /> Open
          </button>
        </div>
      </div>

      <h2 className="section-header">Server Sources</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">BattleMetrics</p>
            <p className="settings-row-desc">
              Public server list from battlemetrics.com — addresses only, no key required. Server name, map,
              players, and ping always come from our own queries.
            </p>
          </div>
          <button
            className={`toggle-switch${battlemetricsEnabled ? ' on' : ''}`}
            role="switch"
            aria-checked={battlemetricsEnabled}
            aria-label="BattleMetrics source"
            onClick={handleToggleBattlemetrics}
          >
            <span className="toggle-switch-thumb" />
          </button>
        </div>
      </div>

      <div className="settings-card">
        <p className="settings-row-desc server-sources-hint">
          Add URLs that return plain-text <code>ip:port</code> lines or a JSON array. Fetched and merged in on
          every server-list refresh.
        </p>
        {subscriptions.length === 0 ? (
          <p className="muted">No subscriptions added.</p>
        ) : (
          <ul className="server-sources-list">
            {subscriptions.map((sub) => (
              <li key={sub.id} className="server-sources-item">
                <span className="server-sources-url">{sub.url}</span>
                <button className="cp-btn-secondary" onClick={() => handleRemoveSubscription(sub.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="servers-add-row">
          <input
            type="text"
            className="cp-input servers-add-input server-sources-input"
            placeholder="https://example.com/servers.txt"
            value={subUrl}
            onChange={(e) => setSubUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubscription()}
          />
          <button className="cp-btn-secondary" onClick={handleAddSubscription}>
            Add source
          </button>
          {subError && <span className="cp-inline-error">{subError}</span>}
        </div>
      </div>

      <h2 className="section-header">Preferences</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Reduce motion</p>
            <p className="settings-row-desc">Turns off animated transitions, pulses, and shimmer everywhere in the app.</p>
          </div>
          <button
            className={`toggle-switch${reduceMotion ? ' on' : ''}`}
            role="switch"
            aria-checked={reduceMotion}
            aria-label="Reduce motion"
            onClick={handleToggleReduceMotion}
          >
            <span className="toggle-switch-thumb" />
          </button>
        </div>
      </div>

      <h2 className="section-header">Launcher Updates</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Version {appVersion ?? '…'}</p>
            {updateStatus?.state === 'dev-disabled' && <p className="settings-row-desc">Updates are disabled in development builds.</p>}
            {updateStatus?.state === 'checking' && <p className="settings-row-desc">Checking for updates…</p>}
            {updateStatus?.state === 'not-available' && <p className="settings-row-desc">You're on the latest version.</p>}
            {updateStatus?.state === 'available' && (
              <p className="settings-row-desc">Update v{updateStatus.version} is available.</p>
            )}
            {updateStatus?.state === 'downloading' && (
              <p className="settings-row-desc">Downloading update — {updateStatus.percent}%</p>
            )}
            {updateStatus?.state === 'downloaded' && (
              <p className="settings-row-desc">Update v{updateStatus.version} downloaded and ready to install.</p>
            )}
            {updateStatus?.state === 'error' && <p className="settings-row-desc">{updateStatus.message}</p>}
          </div>
          {updateStatus?.state === 'available' && (
            <button className="cp-btn-primary" onClick={handleDownloadUpdate}>
              Download
            </button>
          )}
          {updateStatus?.state === 'downloaded' && (
            <button className="cp-btn-primary" onClick={handleInstallUpdate}>
              Restart &amp; Install
            </button>
          )}
          {(updateStatus === null ||
            updateStatus.state === 'not-available' ||
            updateStatus.state === 'error' ||
            updateStatus.state === 'dev-disabled' ||
            updateStatus.state === 'checking') && (
            <button
              className="cp-btn-secondary"
              disabled={updateStatus?.state === 'checking'}
              onClick={() => window.launcher.checkForUpdates()}
            >
              Check for Updates
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
