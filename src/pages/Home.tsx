import { useEffect, useState } from 'react'
import type { SteamDetectResult } from '../../electron/modules/steam-detect'
import type { BuildProfile, SyncProgress } from '../../electron/modules/content-sync'
import type { GameServer } from '../../electron/modules/server-browser'
import {
  BUILD_PROFILE_KEY,
  LAST_SERVER_KEY,
  MANIFEST_URL_KEY,
  SYNCED_PROFILE_KEY,
  loadJSON
} from '../lib/storage'
import { useToast } from '../lib/toast'
import LaunchOptionsNotice from '../components/LaunchOptionsNotice'

type PlayState = 'steam-missing' | 'update' | 'syncing' | 'launching' | 'idle'

interface LastServer {
  ip: string
  port: number
  name: string
  map: string
  players: number
  maxPlayers: number
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

export default function Home(): React.JSX.Element {
  const [detection, setDetection] = useState<SteamDetectResult | 'loading' | 'error'>('loading')
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
  const [liveServer, setLiveServer] = useState<GameServer | null>(null)
  const [connecting, setConnecting] = useState(false)

  const { pushToast } = useToast()

  useEffect(() => {
    window.launcher
      .detectSteam()
      .then(setDetection)
      .catch(() => setDetection('error'))
    window.launcher.getAppVersion().then(setAppVersion)
  }, [])

  useEffect(() => {
    return window.launcher.onSyncProgress(setSyncProgress)
  }, [])

  // Re-query on every visit to Home — the persisted snapshot goes stale
  // fast (players/map/ping all change live), so refresh it each time the
  // hero is shown rather than trusting what was true at connect time.
  useEffect(() => {
    if (!lastServer) return
    window.launcher
      .queryServer(lastServer.ip, lastServer.port)
      .then(setLiveServer)
      .catch(() => setLiveServer(null))
  }, [lastServer])

  const installed = detection !== 'loading' && detection !== 'error' && detection.installed
  const steamFound = detection !== 'loading' && detection !== 'error' && detection.steamPath !== null
  const dirty = manifestUrl !== '' && JSON.stringify(profile) !== syncedProfileJSON

  const playState: PlayState = !installed
    ? 'steam-missing'
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
    if (!lastServer) return
    setConnecting(true)
    try {
      await window.launcher.connect(lastServer.ip, lastServer.port)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  const syncLabel = !manifestUrl
    ? 'No content pack configured'
    : syncing
      ? 'Syncing content…'
      : dirty
        ? 'Content changes pending'
        : 'Content up to date'

  const serverView = liveServer ?? lastServer
  const pingLabel = !liveServer
    ? lastServer
      ? '…'
      : '—'
    : liveServer.ping !== null
      ? `${liveServer.ping} ms`
      : 'timeout'

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

        <div className="hero-play-row">
          <button
            className={`play-button play-button-${playState}`}
            disabled={playState === 'steam-missing' || playState === 'syncing' || playState === 'launching'}
            onClick={handlePlay}
            title={
              playState === 'steam-missing'
                ? steamFound
                  ? "Steam is installed, but CS 1.6 isn't — install it through Steam"
                  : "Steam wasn't found on this system"
                : undefined
            }
          >
            {playState === 'syncing' ? (
              <>
                <span className="play-button-fill" style={{ width: `${pct}%` }} />
                <span className="play-button-label">
                  {syncProgress ? `${syncProgress.completedFiles}/${syncProgress.totalFiles}` : 'Checking'}
                </span>
                <span className="play-button-pct">{pct}%</span>
              </>
            ) : (
              <span className="play-button-label play-button-label-center">
                {playState === 'launching' ? 'LAUNCHING…' : playState === 'update' ? 'UPDATE' : 'PLAY'}
              </span>
            )}
          </button>

          {playState === 'steam-missing' && (
            <button className="hero-fix-link" onClick={handleFixSteam}>
              {steamFound ? 'Install CS 1.6…' : 'Locate Steam…'}
            </button>
          )}
        </div>
      </div>

      <div className="quickconnect-card">
        <p className="quickconnect-label">Last server</p>
        {!serverView && <p className="muted">No recent connections — visit Servers to connect.</p>}
        {serverView && (
          <>
            <p className="quickconnect-name">{serverView.name}</p>
            <p className="quickconnect-meta">
              <span>{serverView.map || '—'}</span>
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
              {connecting ? 'Connecting…' : 'CONNECT'}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
