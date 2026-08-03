import { useEffect, useRef, useState } from 'react'
import { FolderOpen, TriangleAlert } from 'lucide-react'
import type {
  BackedUpFile,
  BuildProfile,
  SyncProgress,
  SyncProgressItem,
  SyncResult
} from '../../electron/modules/content-sync'
import type { UpdateStatus } from '../../electron/modules/updater'
import type { NotificationRule, NotificationSettings, PollStatus } from '../../electron/modules/notification-poller'
import { BUILD_PROFILE_KEY, MANIFEST_URL_KEY, getReduceMotion, loadJSON, setReduceMotion } from '../lib/storage'
import { useToast } from '../lib/toast'
import { registerVerifyHandler } from '../lib/verifyRequest'
import ConfirmModal from '../components/ConfirmModal'
import NotificationRules from '../components/NotificationRules'
import {
  DEFAULT_SUBSCRIPTION_ID,
  getBattlemetricsEnabled,
  getNeighborhoodScanEnabled,
  loadSubscriptions,
  saveSubscriptions,
  setBattlemetricsEnabled,
  setNeighborhoodScanEnabled,
  type ServerSubscription
} from '../lib/serverSources'
import { getKnownServerRetentionDays, setKnownServerRetentionDays } from '../lib/knownServers'
import { loadSourceStatus, type SourceStatusEntry } from '../lib/sourceStatus'

function isValidSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** "Last check (14:32): 41 addresses" / "Last check (14:32): failed — <reason>" — null if never checked. */
function sourceStatusLabel(entry: SourceStatusEntry | undefined): string | null {
  if (!entry) return null
  const when = new Date(entry.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (entry.error) return `Last check (${when}): failed — ${entry.error}`
  return `Last check (${when}): ${entry.addresses} address${entry.addresses === 1 ? '' : 'es'}`
}

/** "14:32" or "—" for a null poll timestamp. */
function pollTimeLabel(ms: number | null): string {
  return ms === null ? '—' : new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  const [neighborhoodScanEnabled, setNeighborhoodScanEnabledState] = useState(getNeighborhoodScanEnabled)
  const [retentionDays, setRetentionDaysState] = useState(getKnownServerRetentionDays)
  const sourceStatus = loadSourceStatus()

  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null)
  const [notifRules, setNotifRules] = useState<NotificationRule[]>([])
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null)
  const [confirmNotificationsIntro, setConfirmNotificationsIntro] = useState(false)

  const [backups, setBackups] = useState<BackedUpFile[] | null>(null)
  const [restoringPath, setRestoringPath] = useState<string | null>(null)
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false)
  const [restoringAll, setRestoringAll] = useState(false)

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

  function refreshBackups(): void {
    window.launcher
      .listBackups()
      .then(setBackups)
      .catch(() => setBackups([]))
  }

  useEffect(refreshBackups, [])

  useEffect(() => {
    window.launcher.getNotificationState().then(({ settings, rules, status }) => {
      setNotifSettings(settings)
      setNotifRules(rules)
      setPollStatus(status)
    })
    return window.launcher.onNotificationPollStatus(setPollStatus)
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

  async function handleRestoreBackup(path: string): Promise<void> {
    setRestoringPath(path)
    try {
      await window.launcher.restoreBackup(path)
      setBackups((prev) => prev?.filter((f) => f.path !== path) ?? null)
      pushToast(`Restored ${fileName(path)}`, 'ok')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setRestoringPath(null)
    }
  }

  async function handleRestoreAllBackups(): Promise<void> {
    setConfirmRestoreAll(false)
    setRestoringAll(true)
    try {
      const { restored } = await window.launcher.restoreAllBackups()
      setBackups([])
      pushToast(`Restored ${restored.length} file(s)`, 'ok')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setRestoringAll(false)
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

  function handleToggleNeighborhoodScan(): void {
    const next = !neighborhoodScanEnabled
    setNeighborhoodScanEnabled(next)
    setNeighborhoodScanEnabledState(next)
  }

  function handleRetentionDaysChange(value: number): void {
    if (!Number.isFinite(value) || value < 1) return
    setKnownServerRetentionDays(value)
    setRetentionDaysState(value)
  }

  async function applyNotificationSettings(partial: Partial<NotificationSettings>): Promise<void> {
    const next = await window.launcher.updateNotificationSettings(partial)
    setNotifSettings(next)
  }

  function handleToggleNotificationsEnabled(): void {
    if (!notifSettings) return
    if (!notifSettings.enabled && !notifSettings.introSeen) {
      setConfirmNotificationsIntro(true)
      return
    }
    applyNotificationSettings({ enabled: !notifSettings.enabled })
  }

  function handleConfirmNotificationsIntro(): void {
    setConfirmNotificationsIntro(false)
    applyNotificationSettings({ enabled: true, introSeen: true })
  }

  function handleToggleMute(): void {
    if (!notifSettings) return
    applyNotificationSettings({ muted: !notifSettings.muted })
  }

  function handlePollIntervalChange(value: number): void {
    if (!Number.isFinite(value) || value < 1) return
    applyNotificationSettings({ pollIntervalMinutes: value })
  }

  function handleToggleQuietHours(): void {
    if (!notifSettings) return
    applyNotificationSettings({ quietHours: { ...notifSettings.quietHours, enabled: !notifSettings.quietHours.enabled } })
  }

  function handleQuietHoursChange(field: 'from' | 'to', value: string): void {
    if (!notifSettings) return
    applyNotificationSettings({ quietHours: { ...notifSettings.quietHours, [field]: value } })
  }

  function handleNotificationRulesChange(rules: NotificationRule[]): void {
    setNotifRules(rules)
    window.launcher.setNotificationRules(rules).catch(() => {})
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

      <h2 className="section-header">Restore Original Files</h2>
      <div className="settings-card">
        <p className="settings-row-desc restore-files-hint">
          Whatever was on disk before the launcher first overwrote it, for every file it's touched — the safety net
          behind every sync.
        </p>
        {backups === null && <p className="muted">Loading…</p>}
        {backups !== null && backups.length === 0 && <p className="muted">No backed-up files — nothing to restore.</p>}
        {backups !== null && backups.length > 0 && (
          <>
            <ul className="restore-files-list">
              {backups.map((file) => (
                <li key={file.path} className="restore-files-item">
                  <span className="restore-files-path">{file.path}</span>
                  <span className="restore-files-size">{formatBytes(file.size)}</span>
                  <button
                    className="cp-btn-secondary"
                    disabled={restoringPath === file.path || restoringAll}
                    onClick={() => handleRestoreBackup(file.path)}
                  >
                    {restoringPath === file.path ? 'Restoring…' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="cp-btn-secondary restore-files-all"
              disabled={restoringAll}
              onClick={() => setConfirmRestoreAll(true)}
            >
              {restoringAll ? 'Restoring all…' : `Restore all (${backups.length})`}
            </button>
          </>
        )}
      </div>

      {confirmRestoreAll && (
        <ConfirmModal
          title="Restore Original Files"
          message={`Restores all ${backups?.length ?? 0} backed-up file(s) to what they were before the launcher touched them. Anything a manifest variant put in their place is replaced.`}
          confirmLabel="Restore All"
          onConfirm={handleRestoreAllBackups}
          onCancel={() => setConfirmRestoreAll(false)}
        />
      )}

      <h2 className="section-header">Server Sources</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Master server discovery</p>
            <p className="settings-row-desc">
              Valve's GoldSrc master server — always on, not configurable. As of 2026-07 it appears to be down
              (both the hostname and its documented IP fallback are unreachable), so this currently contributes
              nothing; we keep trying every refresh in case Valve fixes it.
            </p>
            {sourceStatusLabel(sourceStatus.find((s) => s.id === 'master')) && (
              <p className="server-sources-status">{sourceStatusLabel(sourceStatus.find((s) => s.id === 'master'))}</p>
            )}
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">BattleMetrics</p>
            <p className="settings-row-desc">
              Server list from battlemetrics.com — as of 2026-07 their public API requires a paid subscription
              (unauthenticated requests get an access-denied error), so this is off by default. Only enable it
              if you have one. Server name, map, players, and ping always come from our own queries either way.
            </p>
            {battlemetricsEnabled && sourceStatusLabel(sourceStatus.find((s) => s.id === 'battlemetrics')) && (
              <p className="server-sources-status">
                {sourceStatusLabel(sourceStatus.find((s) => s.id === 'battlemetrics'))}
              </p>
            )}
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
                <div>
                  {sub.id === DEFAULT_SUBSCRIPTION_ID && (
                    <p className="server-sources-default-label">Default curated list (community-maintained)</p>
                  )}
                  <span className="server-sources-url">{sub.url}</span>
                  {sourceStatusLabel(sourceStatus.find((s) => s.id === sub.id)) && (
                    <p className="server-sources-status">{sourceStatusLabel(sourceStatus.find((s) => s.id === sub.id))}</p>
                  )}
                </div>
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

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Known servers pool</p>
            <p className="settings-row-desc">
              Every public server you actually connect to — however you joined — is remembered locally and
              merged into every refresh, same as favorites. No network dependency; it's how the launcher gets
              better at finding servers the more you play.
            </p>
            {sourceStatusLabel(sourceStatus.find((s) => s.id === 'known-pool')) && (
              <p className="server-sources-status">{sourceStatusLabel(sourceStatus.find((s) => s.id === 'known-pool'))}</p>
            )}
          </div>
        </div>
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Retention</p>
            <p className="settings-row-desc">Drop a known server if it hasn't answered in this many days.</p>
          </div>
          <input
            type="number"
            min={1}
            className="cp-input settings-number-input"
            value={retentionDays}
            onChange={(e) => handleRetentionDaysChange(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Neighborhood scan</p>
            <p className="settings-row-desc">
              Off by default. When enabled, probes nearby addresses (same /24, ports 27015–27020) around servers
              you already know — favorites and servers you've actually connected to — using the same public
              status query the in-game browser itself uses. Read-only, no connection to any server; capped and
              rate-limited per refresh. May slow down refresh and sends UDP packets to addresses you haven't
              explicitly added.
            </p>
            {neighborhoodScanEnabled && sourceStatusLabel(sourceStatus.find((s) => s.id === 'neighborhood')) && (
              <p className="server-sources-status">
                {sourceStatusLabel(sourceStatus.find((s) => s.id === 'neighborhood'))}
              </p>
            )}
          </div>
          <button
            className={`toggle-switch${neighborhoodScanEnabled ? ' on' : ''}`}
            role="switch"
            aria-checked={neighborhoodScanEnabled}
            aria-label="Neighborhood scan source"
            onClick={handleToggleNeighborhoodScan}
          >
            <span className="toggle-switch-thumb" />
          </button>
        </div>
      </div>

      <h2 className="section-header">Notifications</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">Background server notifications</p>
            <p className="settings-row-desc">
              Off by default. When on, periodically checks favorites + your known-servers pool while the launcher
              is open and fires a system notification per rule below — never while the launcher is closed.
            </p>
            {pollStatus && (
              <p className="server-sources-status">
                Last poll ({pollTimeLabel(pollStatus.lastPollAt)}) · next ({pollTimeLabel(pollStatus.nextPollAt)}) ·
                watching {pollStatus.watchedCount} favorite{pollStatus.watchedCount === 1 ? '' : 's'} + known pool
              </p>
            )}
          </div>
          <button
            className={`toggle-switch${notifSettings?.enabled ? ' on' : ''}`}
            role="switch"
            aria-checked={!!notifSettings?.enabled}
            aria-label="Background server notifications"
            disabled={!notifSettings}
            onClick={handleToggleNotificationsEnabled}
          >
            <span className="toggle-switch-thumb" />
          </button>
        </div>

        {notifSettings?.enabled && (
          <>
            <div className="settings-row">
              <div>
                <p className="settings-row-label">Mute</p>
                <p className="settings-row-desc">Keep polling (status above stays live) but suppress notifications.</p>
              </div>
              <button
                className={`toggle-switch${notifSettings.muted ? ' on' : ''}`}
                role="switch"
                aria-checked={notifSettings.muted}
                aria-label="Mute notifications"
                onClick={handleToggleMute}
              >
                <span className="toggle-switch-thumb" />
              </button>
            </div>
            <div className="settings-row">
              <div>
                <p className="settings-row-label">Poll interval</p>
                <p className="settings-row-desc">Minutes between background checks (1–30).</p>
              </div>
              <input
                type="number"
                min={1}
                max={30}
                className="cp-input settings-number-input"
                value={notifSettings.pollIntervalMinutes}
                onChange={(e) => handlePollIntervalChange(Number(e.target.value))}
              />
            </div>
            <div className="settings-row">
              <div>
                <p className="settings-row-label">Quiet hours</p>
                <p className="settings-row-desc">No notifications between these times (still polls, still tracks state).</p>
              </div>
              <button
                className={`toggle-switch${notifSettings.quietHours.enabled ? ' on' : ''}`}
                role="switch"
                aria-checked={notifSettings.quietHours.enabled}
                aria-label="Quiet hours"
                onClick={handleToggleQuietHours}
              >
                <span className="toggle-switch-thumb" />
              </button>
            </div>
            {notifSettings.quietHours.enabled && (
              <div className="settings-row quiet-hours-row">
                <label className="quiet-hours-field">
                  From
                  <input
                    type="time"
                    className="cp-input"
                    value={notifSettings.quietHours.from}
                    onChange={(e) => handleQuietHoursChange('from', e.target.value)}
                  />
                </label>
                <label className="quiet-hours-field">
                  To
                  <input
                    type="time"
                    className="cp-input"
                    value={notifSettings.quietHours.to}
                    onChange={(e) => handleQuietHoursChange('to', e.target.value)}
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>

      {notifSettings?.enabled && (
        <div className="settings-card">
          <p className="settings-row-desc server-sources-hint">
            Rules apply to every favorite + known-servers-pool address unless scoped to one server. Fires once per
            transition (e.g. crossing a threshold), never repeatedly while it stays true.
          </p>
          <NotificationRules rules={notifRules} onChange={handleNotificationRulesChange} />
        </div>
      )}

      {confirmNotificationsIntro && (
        <ConfirmModal
          title="Enable Background Notifications"
          message="The launcher will periodically query your favorites and known servers while it's open, and show a system notification when a rule you define matches (e.g. a server crosses a player-count threshold). Nothing is checked while the launcher is closed. You can add rules, mute, set quiet hours, or turn this off again at any time."
          confirmLabel="Enable"
          onConfirm={handleConfirmNotificationsIntro}
          onCancel={() => setConfirmNotificationsIntro(false)}
        />
      )}

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
