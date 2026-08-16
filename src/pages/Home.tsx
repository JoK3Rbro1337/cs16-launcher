import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GameInstall } from '../../electron/modules/game-install'
import type { BuildProfile, SyncProgress } from '../../electron/modules/content-sync'
import type { GameServer } from '../../electron/modules/server-browser'
import type { LiveSession, SessionSource } from '../../electron/modules/session-watcher'
import type { Tab } from '../components/Sidebar'
import {
  BUILD_PROFILE_KEY,
  LAST_SERVER_KEY,
  MANIFEST_URL_KEY,
  SYNCED_PROFILE_KEY,
  loadJSON
} from '../lib/storage'
import { useToast } from '../lib/toast'
import { useT } from '../lib/i18n'
import LaunchOptionsNotice from '../components/LaunchOptionsNotice'
import CondebugNotice from '../components/CondebugNotice'
import DesktopIntegrationNotice from '../components/DesktopIntegrationNotice'

/** Same interval CondebugNotice/LaunchOptionsNotice/CrosshairWindowedNotice already re-check on. */
const INSTALL_RECHECK_INTERVAL_MS = 30_000

type PlayState = 'install-missing' | 'update' | 'syncing' | 'launching' | 'idle'

interface LastServer {
  ip: string
  port: number
  name: string
  map: string
  players: number
  maxPlayers: number
}

/** Unifies the two "last server" sources into one shape the quick-connect card renders from. */
interface QuickConnectTarget {
  ip: string
  port: number
  name: string
  map: string
  players: number
  maxPlayers: number
  source: SessionSource
}

function emptyProfile(): BuildProfile {
  return { selections: {}, features: {} }
}

function pingTone(ping: number | null): string {
  if (ping === null) return ''
  if (ping < 50) return ' ping-ok'
  if (ping <= 120) return ' ping-warn'
  return ' ping-danger'
}

export default function Home({ onNavigate }: { onNavigate: (tab: Tab) => void }): React.JSX.Element {
  const t = useT()
  const [detection, setDetection] = useState<GameInstall | 'loading' | 'error'>('loading')
  const [appVersion, setAppVersion] = useState<string | null>(null)

  const [manifestUrl] = useState(() => localStorage.getItem(MANIFEST_URL_KEY) ?? '')
  const [profile] = useState<BuildProfile>(() => loadJSON(BUILD_PROFILE_KEY, emptyProfile()))
  const [syncedProfileJSON, setSyncedProfileJSON] = useState<string | null>(() =>
    localStorage.getItem(SYNCED_PROFILE_KEY)
  )
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [launching, setLaunching] = useState(false)

  const [lastServer] = useState<LastServer | null>(() => loadJSON<LastServer | null>(LAST_SERVER_KEY, null))
  const [mainSession, setMainSession] = useState<LiveSession | null>(null)
  const [liveServer, setLiveServer] = useState<GameServer | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [friendNames, setFriendNames] = useState<string[]>([])

  const { pushToast } = useToast()

  // Re-checks periodically rather than trusting a stale read: a manual
  // install's folder can disappear (drive unmounted, folder moved) while
  // this page is sitting open, and PLAY's disabled state should reflect
  // that without requiring the player to leave and come back — same
  // self-correcting pattern as CondebugNotice/LaunchOptionsNotice.
  useEffect(() => {
    function refresh(): void {
      window.launcher
        .getGameInstall()
        .then(setDetection)
        .catch(() => setDetection('error'))
    }
    refresh()
    const interval = setInterval(refresh, INSTALL_RECHECK_INTERVAL_MS)
    window.launcher.getAppVersion().then(setAppVersion)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    return window.launcher.onSyncProgress(setSyncProgress)
  }, [])

  // session-watcher (main process) knows about ANY connect — launcher or
  // in-game — and pushes updates live while the game is running; the
  // legacy localStorage lastServer (launcher-only) is the fallback for
  // players who don't have -condebug set, per CondebugNotice.
  useEffect(() => {
    window.launcher
      .getLastSession()
      .then(setMainSession)
      .catch(() => setMainSession(null))
    return window.launcher.onSessionUpdate(setMainSession)
  }, [])

  const target: QuickConnectTarget | null = mainSession
    ? {
        ip: mainSession.ip,
        port: mainSession.port,
        name: mainSession.name ?? `${mainSession.ip}:${mainSession.port}`,
        map: mainSession.map,
        players: 0,
        maxPlayers: 0,
        source: mainSession.source
      }
    : lastServer
      ? { ...lastServer, source: 'launcher' }
      : null

  // Re-query on every visit to Home — the persisted snapshot goes stale
  // fast (players/map/ping all change live), so refresh it each time the
  // hero is shown rather than trusting what was true at connect time.
  useEffect(() => {
    if (!target) return
    window.launcher
      .queryServer(target.ip, target.port)
      .then(setLiveServer)
      .catch(() => setLiveServer(null))
  }, [target?.ip, target?.port])

  // "Friends online" (M13) — same recency-windowed snapshot Servers.tsx reads, not a fresh
  // query of its own; see player-tracking.ts's getFriendsOnline doc comment.
  useEffect(() => {
    if (!target) {
      setFriendNames([])
      return
    }
    window.launcher
      .getFriendsOnline()
      .then((entries) => {
        const match = entries.find((e) => e.ip === target.ip && e.port === target.port)
        setFriendNames(match?.names ?? [])
      })
      .catch(() => setFriendNames([]))
  }, [target?.ip, target?.port])

  const installed = detection !== 'loading' && detection !== 'error' && detection.installed
  const steamFound = detection !== 'loading' && detection !== 'error' && detection.steamPath !== null
  const dirty = manifestUrl !== '' && JSON.stringify(profile) !== syncedProfileJSON

  const playState: PlayState = !installed
    ? 'install-missing'
    : launching
      ? 'launching'
      : syncing
        ? 'syncing'
        : dirty
          ? 'update'
          : 'idle'

  const pct =
    syncProgress && syncProgress.totalBytes > 0
      ? Math.round((syncProgress.downloadedBytes / syncProgress.totalBytes) * 100)
      : syncProgress
        ? 100
        : 0

  function markSynced(synced: BuildProfile): void {
    const json = JSON.stringify(synced)
    localStorage.setItem(SYNCED_PROFILE_KEY, json)
    setSyncedProfileJSON(json)
  }

  async function handlePlay(): Promise<void> {
    try {
      if (manifestUrl && dirty) {
        setSyncing(true)
        setSyncProgress(null)
        await window.launcher.syncContent(manifestUrl, profile)
        markSynced(profile)
        setSyncing(false)
      }
      setLaunching(true)
      await window.launcher.play()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
      setLaunching(false)
    }
  }

  async function handleFixSteam(): Promise<void> {
    try {
      await window.launcher.fixSteam(steamFound)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleConnectLast(): Promise<void> {
    if (!target) return
    setConnecting(true)
    try {
      await window.launcher.connect(target.ip, target.port)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  const syncLabel = !manifestUrl
    ? t.home.syncNoManifest
    : syncing
      ? t.home.syncSyncing
      : dirty
        ? t.home.syncPending
        : t.home.syncUpToDate

  const serverView = liveServer ?? target
  const pingLabel = !liveServer
    ? target
      ? t.home.pingPending
      : t.common.dash
    : liveServer.ping !== null
      ? `${liveServer.ping} ms`
      : t.home.pingTimeout

  return (
    <section className="hero">
      <div className="hero-backdrop" />
      <div className="hero-vignette" />

      <div className="hero-glass">
        <h1 className="hero-title">1.6X</h1>
        <p className="hero-meta">
          v{appVersion ?? '…'} · {syncLabel}
        </p>

        {manifestUrl && <LaunchOptionsNotice className="launch-options-notice-compact" />}
        <CondebugNotice className="launch-options-notice-compact" />
        <DesktopIntegrationNotice className="launch-options-notice-compact" />

        <div className="hero-play-row">
          <button
            className={`play-button play-button-${playState}`}
            disabled={playState === 'install-missing' || playState === 'syncing' || playState === 'launching'}
            onClick={handlePlay}
            title={
              playState === 'install-missing'
                ? steamFound
                  ? t.home.steamMissingTooltipInstall
                  : t.home.steamMissingTooltipLocate
                : undefined
            }
          >
            {playState === 'syncing' ? (
              <>
                <span className="play-button-fill" style={{ width: `${pct}%` }} />
                <span className="play-button-label">
                  {syncProgress ? `${syncProgress.completedFiles}/${syncProgress.totalFiles}` : t.home.checking}
                </span>
                <span className="play-button-pct">{pct}%</span>
              </>
            ) : (
              <span className="play-button-label play-button-label-center">
                {playState === 'launching' ? t.home.launching : playState === 'update' ? t.home.update : t.home.play}
              </span>
            )}
          </button>

          {playState === 'install-missing' && (
            <div className="hero-fix-links">
              <button className="hero-fix-link" onClick={handleFixSteam}>
                {steamFound ? t.home.installCs : t.home.locateSteam}
              </button>
              <button className="hero-fix-link" onClick={() => onNavigate('settings')}>
                {t.home.browseForInstall}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="quickconnect-card">
        <p className="quickconnect-label">{t.home.lastServer}</p>
        {!serverView && <p className="muted">{t.home.noRecentConnections}</p>}
        {serverView && (
          <>
            <p className="quickconnect-name">
              {serverView.name}
              {target && (
                <span className={`quickconnect-source-badge quickconnect-source-badge-${target.source}`}>
                  {target.source === 'launcher' ? t.home.sourceLauncher : t.home.sourceInGame}
                </span>
              )}
              {friendNames.length > 0 && (
                <span className="friends-badge" title={t.home.knownOnline(friendNames.join(', '))}>
                  <Users size={11} />
                  {friendNames.length}
                </span>
              )}
            </p>
            <p className="quickconnect-meta">
              <span>{serverView.map || t.common.dash}</span>
              <span className="quickconnect-dot">·</span>
              <span>
                {serverView.players}/{serverView.maxPlayers}
              </span>
              <span className="quickconnect-dot">·</span>
              <span className={`quickconnect-ping${liveServer ? pingTone(liveServer.ping) : ''}`}>
                {pingLabel}
              </span>
            </p>
            <button className="quickconnect-connect" disabled={connecting} onClick={handleConnectLast}>
              {connecting ? t.home.connecting : t.home.connect}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
