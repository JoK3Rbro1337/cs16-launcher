import { useEffect, useRef, useState } from 'react'
import { Copy, FolderOpen, Minus, Plus, TriangleAlert } from 'lucide-react'
import type {
  BackedUpFile,
  BuildProfile,
  SyncProgress,
  SyncProgressItem,
  SyncResult
} from '../../electron/modules/content-sync'
import type { UpdateStatus } from '../../electron/modules/updater'
import type { NotificationRule, NotificationSettings, PollStatus } from '../../electron/modules/notification-poller'
import type { KnownPlayer } from '../../electron/modules/player-tracking'
import type { ConfigScanResult } from '../../electron/modules/config-scanner'
import type { CrosshairPlatformInfo, CrosshairSettings, CrosshairShape, KwinRuleInstructions } from '../../electron/modules/crosshair-overlay'
import type { GameInstall, InstallValidation } from '../../electron/modules/game-install'
import { BUILD_PROFILE_KEY, MANIFEST_URL_KEY, getReduceMotion, loadJSON, setReduceMotion } from '../lib/storage'
import { useToast } from '../lib/toast'
import { registerVerifyHandler } from '../lib/verifyRequest'
import { applyProfile, gatherProfile, isLauncherProfile, summarizeProfile, type ImportMode, type LauncherProfile } from '../lib/profile'
import { useI18n, LOCALES, LOCALE_NAMES, type Messages } from '../lib/i18n'
import { drawCrosshair } from '../lib/crosshair'
import ConfirmModal from '../components/ConfirmModal'
import ConfigScanModal from '../components/ConfigScanModal'
import NotificationRules from '../components/NotificationRules'
import ProfileImportModal from '../components/ProfileImportModal'
import CrosshairWindowedNotice from '../components/CrosshairWindowedNotice'
import NativeCrosshairEditor from '../components/NativeCrosshairEditor'

/**
 * Mirrors CROSSHAIR_SHAPES/CROSSHAIR_COLOR_PRESETS in
 * electron/modules/crosshair-settings.ts — duplicated rather than imported
 * as a value, same convention as configVariant.ts's sentinel ids (the
 * renderer only pulls types from electron/modules, never runtime values).
 */
const CROSSHAIR_SHAPES: CrosshairShape[] = ['dot', 'cross', 'circle', 'cross-dot']
const CROSSHAIR_COLOR_PRESETS = ['#39ff14', '#00eaff', '#ff3b30', '#ffe135', '#ffffff', '#ff2fd6']

function installProblemMessage(t: Messages, problem: 'not-found' | 'missing-cstrike' | 'missing-binary'): string {
  switch (problem) {
    case 'not-found':
      return t.settings.installProblemNotFound
    case 'missing-cstrike':
      return t.settings.installProblemMissingCstrike
    case 'missing-binary':
      return t.settings.installProblemMissingBinary
  }
}

function validationProblem(v: InstallValidation): 'not-found' | 'missing-cstrike' | 'missing-binary' {
  if (!v.exists) return 'not-found'
  if (!v.hasCstrike) return 'missing-cstrike'
  return 'missing-binary'
}

function crosshairShapeLabel(t: Messages, shape: CrosshairShape): string {
  switch (shape) {
    case 'dot':
      return t.settings.crosshairShapeDot
    case 'cross':
      return t.settings.crosshairShapeCross
    case 'circle':
      return t.settings.crosshairShapeCircle
    case 'cross-dot':
      return t.settings.crosshairShapeCrossDot
  }
}

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
function sourceStatusLabel(t: Messages, entry: SourceStatusEntry | undefined): string | null {
  if (!entry) return null
  const when = new Date(entry.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (entry.error) return t.settings.lastCheckFailed(when, entry.error)
  return t.settings.lastCheckOk(when, entry.addresses)
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
  const { t, locale, setLocale } = useI18n()
  const { pushToast } = useToast()
  const [manifestUrl, setManifestUrl] = useState(() => localStorage.getItem(MANIFEST_URL_KEY) ?? '')
  const [reduceMotion, setReduceMotionState] = useState(getReduceMotion)

  const [state, setState] = useState<SyncState>('idle')
  const [lastAction, setLastAction] = useState<SyncAction>('sync')
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmVerify, setConfirmVerify] = useState(false)
  const [scanGateResult, setScanGateResult] = useState<ConfigScanResult | null>(null)
  const [pendingSyncAction, setPendingSyncAction] = useState<SyncAction>('sync')
  const [installingAnyway, setInstallingAnyway] = useState(false)

  const [itemSpeeds, setItemSpeeds] = useState<Record<string, number>>({})
  const [globalSpeed, setGlobalSpeed] = useState(0)
  const itemSpeedSamples = useRef(new Map<string, SpeedSample>())
  const globalSpeedSample = useRef<SpeedSample | undefined>(undefined)

  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)

  const [installStatus, setInstallStatus] = useState<GameInstall | null>(null)
  const [browsingInstall, setBrowsingInstall] = useState(false)
  const [clearingInstall, setClearingInstall] = useState(false)
  const [browseError, setBrowseError] = useState<{ path: string; validation: InstallValidation } | null>(null)

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

  const [desktopIntegration, setDesktopIntegration] = useState<{ eligible: boolean; installed: boolean } | null>(null)
  const [desktopIntegrationBusy, setDesktopIntegrationBusy] = useState(false)

  const [backups, setBackups] = useState<BackedUpFile[] | null>(null)
  const [restoringPath, setRestoringPath] = useState<string | null>(null)
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false)
  const [restoringAll, setRestoringAll] = useState(false)

  const [knownPlayers, setKnownPlayers] = useState<KnownPlayer[]>([])
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pendingImport, setPendingImport] = useState<LauncherProfile | null>(null)

  const [crosshair, setCrosshair] = useState<CrosshairSettings | null>(null)
  const [crosshairPlatformInfo, setCrosshairPlatformInfo] = useState<CrosshairPlatformInfo | null>(null)
  const [confirmCrosshairDisclosure, setConfirmCrosshairDisclosure] = useState(false)
  const crosshairPreviewRef = useRef<HTMLCanvasElement | null>(null)
  const [kwinInstructions, setKwinInstructions] = useState<KwinRuleInstructions | null>(null)
  const [kwinCopied, setKwinCopied] = useState(false)
  const [scaleWidthInput, setScaleWidthInput] = useState('')
  const [scaleHeightInput, setScaleHeightInput] = useState('')
  const [suggestedScale, setSuggestedScale] = useState<number | null>(null)
  const [debugAlignment, setDebugAlignment] = useState(false)

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

  function refreshKnownPlayers(): void {
    window.launcher.getKnownPlayers().then(setKnownPlayers).catch(() => {})
  }

  useEffect(refreshKnownPlayers, [])

  useEffect(() => {
    window.launcher.getNotificationState().then(({ settings, rules, status }) => {
      setNotifSettings(settings)
      setNotifRules(rules)
      setPollStatus(status)
    })
    return window.launcher.onNotificationPollStatus(setPollStatus)
  }, [])

  function refreshDesktopIntegration(): void {
    window.launcher
      .getDesktopIntegrationStatus()
      .then(setDesktopIntegration)
      .catch(() => setDesktopIntegration(null))
  }

  useEffect(refreshDesktopIntegration, [])

  useEffect(() => {
    window.launcher.getCrosshairSettings().then(setCrosshair).catch(() => {})
    window.launcher.getCrosshairPlatformInfo().then(setCrosshairPlatformInfo).catch(() => {})
    window.launcher.getKwinRuleInstructions().then(setKwinInstructions).catch(() => {})
    window.launcher.getCrosshairDebugAlignment().then(setDebugAlignment).catch(() => {})
  }, [])

  function handleToggleDebugAlignment(): void {
    const next = !debugAlignment
    setDebugAlignment(next)
    window.launcher.setCrosshairDebugAlignment(next).catch(() => {})
  }

  function handleCopyKwinInstructions(): void {
    if (!kwinInstructions) return
    const text = t.settings.crosshairKwinInstructions(kwinInstructions.windowClass, kwinInstructions.windowTitle)
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setKwinCopied(true)
        setTimeout(() => setKwinCopied(false), 2000)
      })
      .catch(() => {})
  }

  // Live preview: the same drawCrosshair() the overlay window itself uses, so this is
  // guaranteed to match exactly rather than risk drifting from a lookalike re-implementation.
  useEffect(() => {
    const canvas = crosshairPreviewRef.current
    if (!canvas || !crosshair) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Mirrors scaledCrosshairSettings in electron/modules/crosshair-settings.ts
    // (duplicated rather than imported as a value — same "renderer only pulls
    // types from electron/modules" convention as CROSSHAIR_SHAPES above) so
    // the preview shows the same game-resolution-scaled result the real
    // overlay renders, not the unscaled slider values.
    const scaled = {
      ...crosshair,
      size: crosshair.size * crosshair.scale,
      thickness: crosshair.thickness * crosshair.scale,
      gap: crosshair.gap * crosshair.scale,
      offsetX: crosshair.offsetX * crosshair.scale,
      offsetY: crosshair.offsetY * crosshair.scale
    }
    drawCrosshair(ctx, canvas.width, canvas.height, scaled)
  }, [crosshair])

  async function applyCrosshairSettings(partial: Partial<CrosshairSettings>): Promise<void> {
    const next = await window.launcher.updateCrosshairSettings(partial)
    setCrosshair(next)
  }

  function handleToggleCrosshairEnabled(): void {
    if (!crosshair) return
    if (!crosshair.enabled && !crosshair.disclosureSeen) {
      setConfirmCrosshairDisclosure(true)
      return
    }
    applyCrosshairSettings({ enabled: !crosshair.enabled })
  }

  function handleConfirmCrosshairDisclosure(): void {
    setConfirmCrosshairDisclosure(false)
    applyCrosshairSettings({ enabled: true, disclosureSeen: true })
  }

  function handleToggleCrosshairOutline(): void {
    if (!crosshair) return
    applyCrosshairSettings({ outline: !crosshair.outline })
  }

  function handleCrosshairDisplayChange(value: string): void {
    applyCrosshairSettings({ displayId: value === 'auto' ? null : Number(value) })
  }

  function handleNudgeCrosshair(axis: 'offsetX' | 'offsetY', delta: number): void {
    if (!crosshair) return
    applyCrosshairSettings({ [axis]: crosshair[axis] + delta })
  }

  function handleResetCrosshairPosition(): void {
    applyCrosshairSettings({ offsetX: 0, offsetY: 0 })
  }

  useEffect(() => {
    const w = Number(scaleWidthInput)
    const h = Number(scaleHeightInput)
    if (!scaleWidthInput || !scaleHeightInput || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      setSuggestedScale(null)
      return
    }
    let cancelled = false
    window.launcher
      .computeSuggestedCrosshairScale(w, h)
      .then((scale) => {
        if (!cancelled) setSuggestedScale(scale)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [scaleWidthInput, scaleHeightInput])

  function handleAutoDetectGameResolution(): void {
    window.launcher
      .checkLaunchOptions()
      .then((check) => {
        if (check.gameWidth && check.gameHeight) {
          setScaleWidthInput(String(check.gameWidth))
          setScaleHeightInput(String(check.gameHeight))
        } else {
          pushToast(t.settings.crosshairScaleAutoDetectNotFound)
        }
      })
      .catch(() => pushToast(t.settings.crosshairScaleAutoDetectNotFound))
  }

  function handleApplySuggestedScale(): void {
    if (suggestedScale === null) return
    applyCrosshairSettings({ scale: suggestedScale })
  }

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

  useEffect(() => {
    window.launcher.getGameInstall().then(setInstallStatus).catch(() => setInstallStatus(null))
  }, [])

  async function handleBrowseInstall(): Promise<void> {
    setBrowsingInstall(true)
    setBrowseError(null)
    try {
      const result = await window.launcher.browseForInstallPath()
      if (result.canceled) return
      if (result.saved) {
        setInstallStatus(await window.launcher.getGameInstall())
        pushToast(t.settings.installSavedToast, 'ok')
      } else if (result.path && result.validation) {
        setBrowseError({ path: result.path, validation: result.validation })
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setBrowsingInstall(false)
    }
  }

  async function handleClearManualInstall(): Promise<void> {
    setClearingInstall(true)
    try {
      setInstallStatus(await window.launcher.clearManualInstallPath())
      setBrowseError(null)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setClearingInstall(false)
    }
  }

  function handleManifestUrlChange(value: string): void {
    setManifestUrl(value)
    localStorage.setItem(MANIFEST_URL_KEY, value)
  }

  function handleToggleReduceMotion(): void {
    const next = !reduceMotion
    setReduceMotion(next)
    setReduceMotionState(next)
  }

  async function runSync(action: SyncAction, skipScanGate = false): Promise<void> {
    const profile = loadJSON<BuildProfile>(BUILD_PROFILE_KEY, { selections: {}, features: {} })

    // M12.5 — before touching disk, scan whatever config the active profile
    // would actually exec. Critical findings block the sync with a dialog
    // (file/line/offending text + an explicit override); a scan failure
    // (e.g. can't fetch the cfg text to scan it) never blocks sync itself —
    // only a completed scan with real critical findings does.
    if (!skipScanGate) {
      try {
        const gate = await window.launcher.scanConfigGate(manifestUrl, profile)
        if (gate && gate.counts.critical > 0) {
          setPendingSyncAction(action)
          setScanGateResult(gate)
          return
        }
      } catch {
        // scan itself failed — proceed to the normal sync/error flow below
      }
    }

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
      pushToast(t.settings.restoredFileToast(fileName(path)), 'ok')
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
      pushToast(t.settings.restoredAllToast(restored.length), 'ok')
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

  async function handleInstallDesktopIntegration(): Promise<void> {
    setDesktopIntegrationBusy(true)
    try {
      await window.launcher.installDesktopIntegration()
      pushToast(t.settings.addedToMenuToast, 'ok')
      refreshDesktopIntegration()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setDesktopIntegrationBusy(false)
    }
  }

  async function handleRemoveDesktopIntegration(): Promise<void> {
    setDesktopIntegrationBusy(true)
    try {
      await window.launcher.removeDesktopIntegration()
      pushToast(t.settings.removedFromMenuToast, 'ok')
      refreshDesktopIntegration()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setDesktopIntegrationBusy(false)
    }
  }

  function handleAddSubscription(): void {
    const url = subUrl.trim()
    if (!isValidSourceUrl(url)) {
      setSubError(t.settings.subErrorInvalid)
      return
    }
    if (subscriptions.some((s) => s.url === url)) {
      setSubError(t.settings.subErrorDuplicate)
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

  async function handleForgetPlayer(name: string): Promise<void> {
    const next = await window.launcher.setPlayerKnown(name, false, '')
    setKnownPlayers(next)
  }

  function handleStartEditNote(player: KnownPlayer): void {
    setEditingNote(player.name)
    setNoteDraft(player.note)
  }

  async function handleSaveNote(name: string): Promise<void> {
    const next = await window.launcher.setPlayerKnown(name, true, noteDraft)
    setKnownPlayers(next)
    setEditingNote(null)
  }

  async function handleExportProfile(): Promise<void> {
    setExporting(true)
    try {
      const profile = await gatherProfile()
      const result = await window.launcher.exportProfile(profile)
      if (!result.canceled) pushToast(t.settings.profileExportedToast, 'ok')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  async function handleImportProfileClick(): Promise<void> {
    setImporting(true)
    try {
      const result = await window.launcher.importProfileFile()
      if (result.canceled) return
      if (!isLauncherProfile(result.data)) {
        pushToast(t.settings.profileNotAFileToast)
        return
      }
      setPendingImport(result.data)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  async function handleConfirmImport(mode: ImportMode): Promise<void> {
    if (!pendingImport) return
    try {
      await applyProfile(pendingImport, mode)
      pushToast(t.settings.profileImportedToast(mode), 'ok')
      refreshKnownPlayers()
      window.launcher.getNotificationState().then(({ settings, rules, status }) => {
        setNotifSettings(settings)
        setNotifRules(rules)
        setPollStatus(status)
      })
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setPendingImport(null)
    }
  }

  const pct = progress && progress.totalBytes > 0 ? progress.downloadedBytes / progress.totalBytes : state === 'done' ? 1 : 0
  const remainingBytes = progress ? progress.totalBytes - progress.downloadedBytes : 0
  const etaSeconds = state === 'syncing' && globalSpeed > 0 ? remainingBytes / globalSpeed : null
  const sortedItems = progress ? [...progress.items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) : []

  const headline =
    state === 'syncing'
      ? t.settings.headlineFiles(progress?.completedFiles ?? 0, progress?.totalFiles ?? 0)
      : state === 'done'
        ? t.settings.headlineUpToDate
        : state === 'error'
          ? t.settings.headlineSyncFailed
          : t.settings.headlineReady

  return (
    <section className="page">
      <h1>{t.settings.contentSyncTitle}</h1>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="manifest-url">
          {t.settings.manifestUrlLabel}
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
              ? t.settings.etaLine(formatEta(etaSeconds), formatSpeed(globalSpeed))
              : state === 'done' && result
                ? t.settings.resultLine(result.version, result.updatedFiles, result.skippedFiles)
                : t.settings.noSyncInProgress}
          </p>
        </div>
        <div className="sync-summary-actions">
          <button className="cp-btn-primary" disabled={!manifestUrl || state === 'syncing'} onClick={() => runSync('sync')}>
            {state === 'syncing' && lastAction === 'sync' ? t.settings.syncing : t.settings.syncContent}
          </button>
          <button
            className="cp-btn-secondary"
            disabled={!manifestUrl || state === 'syncing'}
            onClick={() => setConfirmVerify(true)}
          >
            {state === 'syncing' && lastAction === 'verify' ? t.settings.verifying : t.settings.verifyAndRepair}
          </button>
        </div>
      </div>

      {state === 'error' && error && (
        <div className="sync-error">
          <TriangleAlert size={14} />
          <span>{error}</span>
          <button className="cp-btn-secondary" onClick={() => runSync(lastAction)}>
            {t.settings.retry}
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
                  {item.status === 'downloading' ? formatSpeed(itemSpeeds[item.path] ?? 0) : item.status === 'done' ? t.settings.itemDone : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {confirmVerify && (
        <ConfirmModal
          title={t.settings.verifyModalTitle}
          message={t.settings.verifyModalMessage}
          confirmLabel={t.settings.verifyAndRepair}
          onConfirm={() => {
            setConfirmVerify(false)
            runSync('verify')
          }}
          onCancel={() => setConfirmVerify(false)}
        />
      )}

      {scanGateResult && (
        <ConfigScanModal
          title={t.configScanner.gateTitle}
          result={scanGateResult}
          onClose={() => setScanGateResult(null)}
          gate={{
            busy: installingAnyway,
            onInstallAnyway: async () => {
              setInstallingAnyway(true)
              try {
                await runSync(pendingSyncAction, true)
              } finally {
                setInstallingAnyway(false)
                setScanGateResult(null)
              }
            }
          }}
        />
      )}

      <h2 className="section-header">{t.settings.sectionInstall}</h2>
      <div className="settings-card">
        <p className="settings-row-desc settings-section-intro">{t.settings.installIntro}</p>

        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.activeInstallLabel}</p>
            <p className="settings-row-desc">
              {installStatus?.installed && installStatus.gamePath
                ? installStatus.gamePath
                : t.settings.installNotFoundLabel}
            </p>
          </div>
          {installStatus?.installed && (
            <span className={`install-source-badge install-source-badge-${installStatus.source}`}>
              {installStatus.source === 'steam' ? t.settings.activeInstallSourceSteam : t.settings.activeInstallSourceManual}
            </span>
          )}
        </div>

        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.steamAutoDetectLabel}</p>
            <p className="settings-row-desc">{t.settings.steamAutoDetectDesc}</p>
            <p className="settings-row-desc muted">
              {installStatus?.steamInstalled && installStatus.steamGamePath
                ? installStatus.steamGamePath
                : installStatus?.steamPath
                  ? t.settings.steamFoundNotInstalledStatus
                  : t.settings.steamNotFoundStatus}
            </p>
          </div>
        </div>

        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.manualInstallLabel}</p>
            <p className="settings-row-desc">{t.settings.manualInstallDesc}</p>
            <p className="settings-row-desc muted">{installStatus?.manualPath ?? t.settings.manualInstallNone}</p>
            {installStatus?.manualPathProblem && (
              <p className="settings-row-desc install-problem">
                <TriangleAlert size={12} /> {installProblemMessage(t, installStatus.manualPathProblem)}
              </p>
            )}
            {browseError && (
              <p className="settings-row-desc install-problem">
                <TriangleAlert size={12} /> {browseError.path}: {installProblemMessage(t, validationProblem(browseError.validation))}
              </p>
            )}
          </div>
          <div className="install-manual-actions">
            <button className="cp-btn-secondary" disabled={browsingInstall} onClick={handleBrowseInstall}>
              <FolderOpen size={14} /> {browsingInstall ? t.settings.browsing : t.settings.browseButton}
            </button>
            {installStatus?.manualPath && (
              <button className="cp-btn-secondary" disabled={clearingInstall} onClick={handleClearManualInstall}>
                {clearingInstall ? t.settings.clearing : t.settings.clearButton}
              </button>
            )}
          </div>
        </div>
      </div>

      <h2 className="section-header">{t.settings.sectionFolders}</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.gameFolderLabel}</p>
            <p className="settings-row-desc">{t.settings.gameFolderDesc}</p>
          </div>
          <button className="cp-btn-secondary" onClick={handleOpenGameFolder}>
            <FolderOpen size={14} /> {t.settings.open}
          </button>
        </div>
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.backupsFolderLabel}</p>
            <p className="settings-row-desc">{t.settings.backupsFolderDesc}</p>
          </div>
          <button className="cp-btn-secondary" onClick={handleOpenBackupFolder}>
            <FolderOpen size={14} /> {t.settings.open}
          </button>
        </div>
      </div>

      <h2 className="section-header">{t.settings.sectionRestore}</h2>
      <div className="settings-card">
        <p className="settings-row-desc restore-files-hint">{t.settings.restoreHint}</p>
        {backups === null && <p className="muted">{t.settings.restoreLoading}</p>}
        {backups !== null && backups.length === 0 && <p className="muted">{t.settings.restoreEmpty}</p>}
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
                    {restoringPath === file.path ? t.settings.restoring : t.settings.restore}
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="cp-btn-secondary restore-files-all"
              disabled={restoringAll}
              onClick={() => setConfirmRestoreAll(true)}
            >
              {restoringAll ? t.settings.restoringAll : t.settings.restoreAll(backups.length)}
            </button>
          </>
        )}
      </div>

      {confirmRestoreAll && (
        <ConfirmModal
          title={t.settings.restoreAllModalTitle}
          message={t.settings.restoreAllModalMessage(backups?.length ?? 0)}
          confirmLabel={t.settings.restoreAllConfirm}
          onConfirm={handleRestoreAllBackups}
          onCancel={() => setConfirmRestoreAll(false)}
        />
      )}

      <h2 className="section-header">{t.settings.sectionServerSources}</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.masterLabel}</p>
            <p className="settings-row-desc">{t.settings.masterDesc}</p>
            {sourceStatusLabel(t, sourceStatus.find((s) => s.id === 'master')) && (
              <p className="server-sources-status">{sourceStatusLabel(t, sourceStatus.find((s) => s.id === 'master'))}</p>
            )}
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.battlemetricsLabel}</p>
            <p className="settings-row-desc">{t.settings.battlemetricsDesc}</p>
            {battlemetricsEnabled && sourceStatusLabel(t, sourceStatus.find((s) => s.id === 'battlemetrics')) && (
              <p className="server-sources-status">
                {sourceStatusLabel(t, sourceStatus.find((s) => s.id === 'battlemetrics'))}
              </p>
            )}
          </div>
          <button
            className={`toggle-switch${battlemetricsEnabled ? ' on' : ''}`}
            role="switch"
            aria-checked={battlemetricsEnabled}
            aria-label={t.settings.battlemetricsAriaLabel}
            onClick={handleToggleBattlemetrics}
          >
            <span className="toggle-switch-thumb" />
          </button>
        </div>
      </div>

      <div className="settings-card">
        <p className="settings-row-desc server-sources-hint">
          {t.settings.subscriptionsHintBefore} <code>{t.settings.subscriptionsHintCode}</code>{' '}
          {t.settings.subscriptionsHintAfter}
        </p>
        {subscriptions.length === 0 ? (
          <p className="muted">{t.settings.noSubscriptions}</p>
        ) : (
          <ul className="server-sources-list">
            {subscriptions.map((sub) => (
              <li key={sub.id} className="server-sources-item">
                <div>
                  {sub.id === DEFAULT_SUBSCRIPTION_ID && (
                    <p className="server-sources-default-label">{t.settings.defaultSubscriptionLabel}</p>
                  )}
                  <span className="server-sources-url">{sub.url}</span>
                  {sourceStatusLabel(t, sourceStatus.find((s) => s.id === sub.id)) && (
                    <p className="server-sources-status">{sourceStatusLabel(t, sourceStatus.find((s) => s.id === sub.id))}</p>
                  )}
                </div>
                <button className="cp-btn-secondary" onClick={() => handleRemoveSubscription(sub.id)}>
                  {t.settings.removeSource}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="servers-add-row">
          <input
            type="text"
            className="cp-input servers-add-input server-sources-input"
            placeholder={t.settings.subscriptionUrlPlaceholder}
            value={subUrl}
            onChange={(e) => setSubUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSubscription()}
          />
          <button className="cp-btn-secondary" onClick={handleAddSubscription}>
            {t.settings.addSource}
          </button>
          {subError && <span className="cp-inline-error">{subError}</span>}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.knownPoolLabel}</p>
            <p className="settings-row-desc">{t.settings.knownPoolDesc}</p>
            {sourceStatusLabel(t, sourceStatus.find((s) => s.id === 'known-pool')) && (
              <p className="server-sources-status">{sourceStatusLabel(t, sourceStatus.find((s) => s.id === 'known-pool'))}</p>
            )}
          </div>
        </div>
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.retentionLabel}</p>
            <p className="settings-row-desc">{t.settings.retentionDesc}</p>
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
            <p className="settings-row-label">{t.settings.neighborhoodLabel}</p>
            <p className="settings-row-desc">{t.settings.neighborhoodDesc}</p>
            {neighborhoodScanEnabled && sourceStatusLabel(t, sourceStatus.find((s) => s.id === 'neighborhood')) && (
              <p className="server-sources-status">
                {sourceStatusLabel(t, sourceStatus.find((s) => s.id === 'neighborhood'))}
              </p>
            )}
          </div>
          <button
            className={`toggle-switch${neighborhoodScanEnabled ? ' on' : ''}`}
            role="switch"
            aria-checked={neighborhoodScanEnabled}
            aria-label={t.settings.neighborhoodAriaLabel}
            onClick={handleToggleNeighborhoodScan}
          >
            <span className="toggle-switch-thumb" />
          </button>
        </div>
      </div>

      <h2 className="section-header">{t.settings.sectionKnownPlayers}</h2>
      <div className="settings-card">
        <p className="settings-row-desc server-sources-hint">{t.settings.knownPlayersHint}</p>
        {knownPlayers.length === 0 ? (
          <p className="muted">{t.settings.knownPlayersEmpty}</p>
        ) : (
          <ul className="server-sources-list">
            {knownPlayers
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((player) => (
                <li key={player.name} className="server-sources-item">
                  <div>
                    <span className="server-sources-url">{player.name}</span>
                    {editingNote === player.name ? (
                      <div className="servers-add-row known-player-note-edit">
                        <input
                          type="text"
                          className="cp-input servers-add-input"
                          placeholder={t.settings.notePlaceholder}
                          value={noteDraft}
                          autoFocus
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveNote(player.name)}
                        />
                        <button className="cp-btn-secondary" onClick={() => handleSaveNote(player.name)}>
                          {t.settings.noteSave}
                        </button>
                      </div>
                    ) : (
                      <p className="server-sources-status known-player-note" onClick={() => handleStartEditNote(player)}>
                        {player.note || t.settings.noteAdd}
                      </p>
                    )}
                  </div>
                  <button className="cp-btn-secondary" onClick={() => handleForgetPlayer(player.name)}>
                    {t.settings.forgetPlayer}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      <h2 className="section-header">{t.settings.sectionProfile}</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.profileLabel}</p>
            <p className="settings-row-desc">{t.settings.profileDesc}</p>
          </div>
          <div className="profile-actions">
            <button className="cp-btn-secondary" disabled={exporting} onClick={handleExportProfile}>
              {exporting ? t.settings.exporting : t.settings.export}
            </button>
            <button className="cp-btn-secondary" disabled={importing} onClick={handleImportProfileClick}>
              {importing ? t.settings.importReading : t.settings.import}
            </button>
          </div>
        </div>
      </div>

      {pendingImport && (
        <ProfileImportModal
          summary={summarizeProfile(pendingImport)}
          onConfirm={handleConfirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}

      <h2 className="section-header">{t.settings.sectionLanguage}</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.languageLabel}</p>
            <p className="settings-row-desc">{t.settings.languageDesc}</p>
          </div>
          <div className="filter-chips" role="group" aria-label={t.settings.languageLabel}>
            {LOCALES.map((code) => (
              <button
                key={code}
                className={`filter-chip${locale === code ? ' active' : ''}`}
                aria-pressed={locale === code}
                onClick={() => setLocale(code)}
              >
                {LOCALE_NAMES[code]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h2 className="section-header">{t.settings.sectionNotifications}</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.notificationsLabel}</p>
            <p className="settings-row-desc">{t.settings.notificationsDesc}</p>
            {pollStatus && (
              <p className="server-sources-status">
                {t.settings.pollStatusLine(
                  pollTimeLabel(pollStatus.lastPollAt),
                  pollTimeLabel(pollStatus.nextPollAt),
                  pollStatus.watchedCount
                )}
              </p>
            )}
          </div>
          <button
            className={`toggle-switch${notifSettings?.enabled ? ' on' : ''}`}
            role="switch"
            aria-checked={!!notifSettings?.enabled}
            aria-label={t.settings.notificationsAriaLabel}
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
                <p className="settings-row-label">{t.settings.muteLabel}</p>
                <p className="settings-row-desc">{t.settings.muteDesc}</p>
              </div>
              <button
                className={`toggle-switch${notifSettings.muted ? ' on' : ''}`}
                role="switch"
                aria-checked={notifSettings.muted}
                aria-label={t.settings.muteAriaLabel}
                onClick={handleToggleMute}
              >
                <span className="toggle-switch-thumb" />
              </button>
            </div>
            <div className="settings-row">
              <div>
                <p className="settings-row-label">{t.settings.pollIntervalLabel}</p>
                <p className="settings-row-desc">{t.settings.pollIntervalDesc}</p>
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
                <p className="settings-row-label">{t.settings.quietHoursLabel}</p>
                <p className="settings-row-desc">{t.settings.quietHoursDesc}</p>
              </div>
              <button
                className={`toggle-switch${notifSettings.quietHours.enabled ? ' on' : ''}`}
                role="switch"
                aria-checked={notifSettings.quietHours.enabled}
                aria-label={t.settings.quietHoursAriaLabel}
                onClick={handleToggleQuietHours}
              >
                <span className="toggle-switch-thumb" />
              </button>
            </div>
            {notifSettings.quietHours.enabled && (
              <div className="settings-row quiet-hours-row">
                <label className="quiet-hours-field">
                  {t.settings.quietHoursFrom}
                  <input
                    type="time"
                    className="cp-input"
                    value={notifSettings.quietHours.from}
                    onChange={(e) => handleQuietHoursChange('from', e.target.value)}
                  />
                </label>
                <label className="quiet-hours-field">
                  {t.settings.quietHoursTo}
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
          <p className="settings-row-desc server-sources-hint">{t.settings.rulesHint}</p>
          <NotificationRules rules={notifRules} onChange={handleNotificationRulesChange} />
        </div>
      )}

      {confirmNotificationsIntro && (
        <ConfirmModal
          title={t.settings.notificationsIntroModalTitle}
          message={t.settings.notificationsIntroModalMessage}
          confirmLabel={t.settings.notificationsIntroConfirm}
          onConfirm={handleConfirmNotificationsIntro}
          onCancel={() => setConfirmNotificationsIntro(false)}
        />
      )}

      {desktopIntegration?.eligible && (
        <>
          <h2 className="section-header">{t.settings.sectionDesktopIntegration}</h2>
          <div className="settings-card">
            <div className="settings-row">
              <div>
                <p className="settings-row-label">{t.settings.desktopIntegrationLabel}</p>
                <p className="settings-row-desc">
                  {t.settings.desktopIntegrationDescBefore} <code>{t.settings.desktopIntegrationDescCode1}</code>{' '}
                  {t.settings.desktopIntegrationDescMid}
                  <code>{t.settings.desktopIntegrationDescCode2}</code>
                  {t.settings.desktopIntegrationDescAfter}
                </p>
              </div>
              {desktopIntegration.installed ? (
                <button className="cp-btn-secondary" disabled={desktopIntegrationBusy} onClick={handleRemoveDesktopIntegration}>
                  {desktopIntegrationBusy ? t.settings.desktopIntegrationRemoving : t.settings.desktopIntegrationRemove}
                </button>
              ) : (
                <button className="cp-btn-primary" disabled={desktopIntegrationBusy} onClick={handleInstallDesktopIntegration}>
                  {desktopIntegrationBusy ? t.settings.desktopIntegrationAdding : t.settings.desktopIntegrationAdd}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <h2 className="section-header">{t.settings.sectionNativeCrosshair}</h2>
      <NativeCrosshairEditor />

      <h2 className="section-header">{t.settings.sectionCrosshair}</h2>
      <div className="settings-card">
        <p className="settings-row-desc settings-section-intro">{t.settings.crosshairOverlayIntro}</p>

        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.crosshairEnabledLabel}</p>
            <p className="settings-row-desc">{t.settings.crosshairEnabledDesc}</p>
          </div>
          <button
            className={`toggle-switch${crosshair?.enabled ? ' on' : ''}`}
            role="switch"
            aria-checked={!!crosshair?.enabled}
            aria-label={t.settings.crosshairEnabledAriaLabel}
            disabled={!crosshair}
            onClick={handleToggleCrosshairEnabled}
          >
            <span className="toggle-switch-thumb" />
          </button>
        </div>

        {crosshairPlatformInfo?.isWayland && <p className="settings-row-desc crosshair-wayland-hint">{t.settings.crosshairWaylandHint}</p>}
        {crosshair?.enabled && <CrosshairWindowedNotice />}

        {crosshair?.enabled && crosshairPlatformInfo?.isKwin && kwinInstructions && (
          <div className="kwin-rule-notice">
            <p className="settings-row-label">{t.settings.crosshairKwinHintTitle}</p>
            <p className="settings-row-desc">{t.settings.crosshairKwinHintDesc}</p>
            <pre className="kwin-rule-steps">{t.settings.crosshairKwinInstructions(kwinInstructions.windowClass, kwinInstructions.windowTitle)}</pre>
            <button className="cp-btn-secondary" onClick={handleCopyKwinInstructions}>
              <Copy size={12} /> {kwinCopied ? t.notices.copied : t.settings.crosshairKwinCopyButton}
            </button>
          </div>
        )}

        {crosshair?.enabled && (
          <>
            <div className="crosshair-preview-card">
              <canvas ref={crosshairPreviewRef} className="crosshair-preview-canvas" width={280} height={160} />
            </div>

            <div className="settings-row">
              <p className="settings-row-label">{t.settings.crosshairShapeLabel}</p>
              <div className="filter-chips">
                {CROSSHAIR_SHAPES.map((shape) => (
                  <button
                    key={shape}
                    className={`filter-chip${crosshair.shape === shape ? ' active' : ''}`}
                    onClick={() => applyCrosshairSettings({ shape })}
                  >
                    {crosshairShapeLabel(t, shape)}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row settings-row-slider">
              <p className="settings-row-label crosshair-slider-label">{t.settings.crosshairSizeLabel}</p>
              <input
                type="range"
                className="cp-slider"
                min={2}
                max={64}
                value={crosshair.size}
                onChange={(e) => applyCrosshairSettings({ size: Number(e.target.value) })}
              />
              <span className="crosshair-slider-value mono">{crosshair.size}</span>
            </div>

            <div className="settings-row settings-row-slider">
              <p className="settings-row-label crosshair-slider-label">{t.settings.crosshairThicknessLabel}</p>
              <input
                type="range"
                className="cp-slider"
                min={1}
                max={12}
                value={crosshair.thickness}
                onChange={(e) => applyCrosshairSettings({ thickness: Number(e.target.value) })}
              />
              <span className="crosshair-slider-value mono">{crosshair.thickness}</span>
            </div>

            {(crosshair.shape === 'cross' || crosshair.shape === 'cross-dot') && (
              <div className="settings-row settings-row-slider">
                <p className="settings-row-label crosshair-slider-label">{t.settings.crosshairGapLabel}</p>
                <input
                  type="range"
                  className="cp-slider"
                  min={0}
                  max={32}
                  value={crosshair.gap}
                  onChange={(e) => applyCrosshairSettings({ gap: Number(e.target.value) })}
                />
                <span className="crosshair-slider-value mono">{crosshair.gap}</span>
              </div>
            )}

            <div className="settings-row settings-row-slider">
              <p className="settings-row-label crosshair-slider-label">{t.settings.crosshairOpacityLabel}</p>
              <input
                type="range"
                className="cp-slider"
                min={0.1}
                max={1}
                step={0.05}
                value={crosshair.opacity}
                onChange={(e) => applyCrosshairSettings({ opacity: Number(e.target.value) })}
              />
              <span className="crosshair-slider-value mono">{Math.round(crosshair.opacity * 100)}%</span>
            </div>

            <div className="settings-row settings-row-slider">
              <p className="settings-row-label crosshair-slider-label">{t.settings.crosshairOffsetXLabel}</p>
              <input
                type="range"
                className="cp-slider"
                min={-300}
                max={300}
                value={crosshair.offsetX}
                onChange={(e) => applyCrosshairSettings({ offsetX: Number(e.target.value) })}
              />
              <span className="crosshair-slider-value mono">{crosshair.offsetX}</span>
              <button
                className="crosshair-nudge-btn"
                aria-label={t.settings.crosshairNudgeDecrementAriaLabel}
                onClick={() => handleNudgeCrosshair('offsetX', -1)}
              >
                <Minus size={12} />
              </button>
              <button
                className="crosshair-nudge-btn"
                aria-label={t.settings.crosshairNudgeIncrementAriaLabel}
                onClick={() => handleNudgeCrosshair('offsetX', 1)}
              >
                <Plus size={12} />
              </button>
            </div>

            <div className="settings-row settings-row-slider">
              <p className="settings-row-label crosshair-slider-label">{t.settings.crosshairOffsetYLabel}</p>
              <input
                type="range"
                className="cp-slider"
                min={-300}
                max={300}
                value={crosshair.offsetY}
                onChange={(e) => applyCrosshairSettings({ offsetY: Number(e.target.value) })}
              />
              <span className="crosshair-slider-value mono">{crosshair.offsetY}</span>
              <button
                className="crosshair-nudge-btn"
                aria-label={t.settings.crosshairNudgeDecrementAriaLabel}
                onClick={() => handleNudgeCrosshair('offsetY', -1)}
              >
                <Minus size={12} />
              </button>
              <button
                className="crosshair-nudge-btn"
                aria-label={t.settings.crosshairNudgeIncrementAriaLabel}
                onClick={() => handleNudgeCrosshair('offsetY', 1)}
              >
                <Plus size={12} />
              </button>
            </div>

            <div className="settings-row">
              <div>
                <p className="settings-row-label">{t.settings.crosshairNudgeResetLabel}</p>
                <p className="settings-row-desc">{t.settings.crosshairNudgeResetDesc}</p>
              </div>
              <button className="cp-btn-secondary" onClick={handleResetCrosshairPosition}>
                {t.settings.crosshairNudgeResetButton}
              </button>
            </div>

            <div className="settings-row">
              <p className="settings-row-label">{t.settings.crosshairColorLabel}</p>
              <div className="crosshair-color-row">
                {CROSSHAIR_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    className={`crosshair-color-swatch${crosshair.color === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    aria-label={c}
                    onClick={() => applyCrosshairSettings({ color: c })}
                  />
                ))}
                <input
                  type="color"
                  className="crosshair-color-custom"
                  aria-label={t.settings.crosshairCustomColorAriaLabel}
                  value={crosshair.color}
                  onChange={(e) => applyCrosshairSettings({ color: e.target.value })}
                />
              </div>
            </div>

            <div className="settings-row">
              <div>
                <p className="settings-row-label">{t.settings.crosshairOutlineLabel}</p>
                <p className="settings-row-desc">{t.settings.crosshairOutlineDesc}</p>
              </div>
              <button
                className={`toggle-switch${crosshair.outline ? ' on' : ''}`}
                role="switch"
                aria-checked={crosshair.outline}
                aria-label={t.settings.crosshairOutlineAriaLabel}
                onClick={handleToggleCrosshairOutline}
              >
                <span className="toggle-switch-thumb" />
              </button>
            </div>

            <div className="settings-row">
              <div>
                <p className="settings-row-label">{t.settings.crosshairDisplayLabel}</p>
                <p className="settings-row-desc">{t.settings.crosshairDisplayDesc}</p>
              </div>
              <select
                className="cp-input crosshair-display-select"
                value={crosshair.displayId ?? 'auto'}
                onChange={(e) => handleCrosshairDisplayChange(e.target.value)}
              >
                <option value="auto">{t.settings.crosshairDisplayAuto}</option>
                {crosshairPlatformInfo?.displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-row">
              <div>
                <p className="settings-row-label">{t.settings.crosshairScaleLabel}</p>
                <p className="settings-row-desc">{t.settings.crosshairScaleDesc}</p>
              </div>
            </div>
            <p className="settings-row-desc crosshair-scale-current mono">{t.settings.crosshairScaleCurrent(crosshair.scale.toFixed(2))}</p>
            <div className="crosshair-scale-inputs">
              <input
                type="number"
                min={1}
                className="cp-input crosshair-scale-dim-input"
                placeholder={t.settings.crosshairScaleWidthLabel}
                aria-label={t.settings.crosshairScaleWidthLabel}
                value={scaleWidthInput}
                onChange={(e) => setScaleWidthInput(e.target.value)}
              />
              <span className="crosshair-scale-x">×</span>
              <input
                type="number"
                min={1}
                className="cp-input crosshair-scale-dim-input"
                placeholder={t.settings.crosshairScaleHeightLabel}
                aria-label={t.settings.crosshairScaleHeightLabel}
                value={scaleHeightInput}
                onChange={(e) => setScaleHeightInput(e.target.value)}
              />
              <button className="cp-btn-secondary" onClick={handleAutoDetectGameResolution}>
                {t.settings.crosshairScaleAutoDetectButton}
              </button>
            </div>
            {suggestedScale !== null && (
              <div className="crosshair-scale-suggestion">
                <span className="mono">{t.settings.crosshairScaleSuggested(suggestedScale.toFixed(2))}</span>
                <button className="cp-btn-secondary" onClick={handleApplySuggestedScale}>
                  {t.settings.crosshairScaleApplyButton}
                </button>
              </div>
            )}

            <div className="settings-row crosshair-debug-row">
              <div>
                <p className="settings-row-label">{t.settings.crosshairDebugAlignmentLabel}</p>
                <p className="settings-row-desc">{t.settings.crosshairDebugAlignmentDesc}</p>
              </div>
              <button
                className={`toggle-switch${debugAlignment ? ' on' : ''}`}
                role="switch"
                aria-checked={debugAlignment}
                aria-label={t.settings.crosshairDebugAlignmentLabel}
                onClick={handleToggleDebugAlignment}
              >
                <span className="toggle-switch-thumb" />
              </button>
            </div>
          </>
        )}
      </div>

      {confirmCrosshairDisclosure && (
        <ConfirmModal
          title={t.settings.crosshairDisclosureModalTitle}
          message={t.settings.crosshairDisclosureModalMessage}
          confirmLabel={t.settings.crosshairDisclosureConfirm}
          onConfirm={handleConfirmCrosshairDisclosure}
          onCancel={() => setConfirmCrosshairDisclosure(false)}
        />
      )}

      <h2 className="section-header">{t.settings.sectionPreferences}</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.reduceMotionLabel}</p>
            <p className="settings-row-desc">{t.settings.reduceMotionDesc}</p>
          </div>
          <button
            className={`toggle-switch${reduceMotion ? ' on' : ''}`}
            role="switch"
            aria-checked={reduceMotion}
            aria-label={t.settings.reduceMotionAriaLabel}
            onClick={handleToggleReduceMotion}
          >
            <span className="toggle-switch-thumb" />
          </button>
        </div>
      </div>

      <h2 className="section-header">{t.settings.sectionUpdates}</h2>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <p className="settings-row-label">{t.settings.versionLabel(appVersion ?? '…')}</p>
            {updateStatus?.state === 'dev-disabled' && <p className="settings-row-desc">{t.settings.updatesDevDisabled}</p>}
            {updateStatus?.state === 'checking' && <p className="settings-row-desc">{t.settings.updatesChecking}</p>}
            {updateStatus?.state === 'not-available' && <p className="settings-row-desc">{t.settings.updatesNotAvailable}</p>}
            {updateStatus?.state === 'available' && (
              <p className="settings-row-desc">{t.settings.updateAvailable(updateStatus.version)}</p>
            )}
            {updateStatus?.state === 'downloading' && (
              <p className="settings-row-desc">{t.settings.updateDownloading(updateStatus.percent)}</p>
            )}
            {updateStatus?.state === 'downloaded' && (
              <p className="settings-row-desc">{t.settings.updateDownloaded(updateStatus.version)}</p>
            )}
            {updateStatus?.state === 'error' && <p className="settings-row-desc">{updateStatus.message}</p>}
          </div>
          {updateStatus?.state === 'available' && (
            <button className="cp-btn-primary" onClick={handleDownloadUpdate}>
              {t.settings.download}
            </button>
          )}
          {updateStatus?.state === 'downloaded' && (
            <button className="cp-btn-primary" onClick={handleInstallUpdate}>
              {t.settings.restartAndInstall}
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
              {t.settings.checkForUpdates}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
