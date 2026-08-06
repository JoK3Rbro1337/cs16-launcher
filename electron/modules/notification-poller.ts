/**
 * notification-poller — M12: background A2S polling of favorites + the
 * known-servers pool while the launcher is running, firing system
 * notifications per user-configurable rules. See notification-rules.ts for
 * the pure (Electron-free) rule-evaluation logic this module drives.
 *
 * Off by default. Settings + rules persist to app data (userData JSON, same
 * read-modify-write-via-tmp-file pattern as known-servers.ts) so they
 * survive restarts; per-server poll state (last-seen conditions, cooldowns)
 * is kept in memory only — it doesn't need to survive a restart since
 * polling itself only ever happens while the launcher process is running.
 *
 * Favorites live in the renderer's localStorage (Servers.tsx owns them),
 * not in app data — the renderer pushes its current list here via
 * setWatchlist() (on every change, and once on app start) rather than this
 * module reading localStorage directly, which isn't reachable from the main
 * process. The known-servers pool is already main-process-owned
 * (known-servers.ts), so no push is needed for it. Any address referenced
 * by an enabled server-scoped rule is also polled even if it's in neither
 * list, so a per-server rule for a non-favorite address still works.
 *
 * Each tick also does one A2S_PLAYER query per target alongside the existing
 * A2S_INFO one, feeding player-tracking.ts's nickname sightings (M13) — this
 * rides the poller's already-scheduled targets/cadence rather than adding a
 * new polling loop, per the "friends online" feature's own constraint of not
 * adding load beyond what this poller already does. A target that doesn't
 * answer A2S_PLAYER is silently skipped, same as an unreachable A2S_INFO.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, Notification } from 'electron'
import { queryServer, queryPlayers, type FavoriteServer, type GameServer } from './server-browser'
import { getKnownServers } from './known-servers'
import { recordPlayerSightings } from './player-tracking'
import { getLocaleSync } from './locale-store'
import { CATALOGS } from '../../locales'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  addressKey,
  clampPollInterval,
  evaluateServer,
  isQuietHours,
  type FireDecision,
  type NotificationRule,
  type NotificationSettings,
  type PerServerState
} from './notification-rules'

export type { NotificationRule, NotificationSettings, QuietHours, RuleType, RuleScope } from './notification-rules'

const FILENAME = 'notification-settings.json'
const POLL_CONCURRENCY = 8

interface PersistedShape {
  settings: NotificationSettings
  rules: NotificationRule[]
}

export interface PollStatus {
  lastPollAt: number | null
  nextPollAt: number | null
  watchedCount: number
}

let settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS }
let rules: NotificationRule[] = []
let watchlist: FavoriteServer[] = []
const pollState = new Map<string, PerServerState>()

let timer: ReturnType<typeof setTimeout> | null = null
let lastPollAt: number | null = null
let nextPollAt: number | null = null
let onFocusServer: (address: FavoriteServer) => void = () => {}
let onConnect: (address: FavoriteServer) => void = () => {}
let onPollStatus: (status: PollStatus) => void = () => {}

export interface NotificationPollerCallbacks {
  /** Body click — main.ts attempts to raise the window; see its own Wayland-activation fallback. */
  onFocusServer: (address: FavoriteServer) => void
  /** "Connect" action button (macOS/Windows only — see sendNotification) — never needs the window raised. */
  onConnect: (address: FavoriteServer) => void
  onPollStatus: (status: PollStatus) => void
}

function userDataDir(): string {
  return app.getPath('userData')
}

let writeQueue: Promise<void> = Promise.resolve()

async function persist(): Promise<void> {
  const dest = join(userDataDir(), FILENAME)
  const payload: PersistedShape = { settings, rules }
  const next = writeQueue.then(async () => {
    await mkdir(userDataDir(), { recursive: true })
    const tmp = `${dest}.part`
    await writeFile(tmp, JSON.stringify(payload, null, 2))
    await rename(tmp, dest)
  })
  writeQueue = next.catch(() => {})
  return next
}

async function loadPersisted(): Promise<void> {
  try {
    const text = await readFile(join(userDataDir(), FILENAME), 'utf-8')
    const parsed = JSON.parse(text) as Partial<PersistedShape>
    settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed.settings }
    rules = Array.isArray(parsed.rules) ? parsed.rules : []
  } catch {
    settings = { ...DEFAULT_NOTIFICATION_SETTINGS }
    rules = []
  }
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  async function next(): Promise<void> {
    while (index < items.length) {
      const i = index++
      results[i] = await worker(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
  return results
}

function dedupe(lists: FavoriteServer[][]): FavoriteServer[] {
  const seen = new Set<string>()
  const out: FavoriteServer[] = []
  for (const list of lists) {
    for (const addr of list) {
      const key = addressKey(addr)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(addr)
    }
  }
  return out
}

async function computeTargets(): Promise<FavoriteServer[]> {
  const knownPool = await getKnownServers()
  const knownAddresses: FavoriteServer[] = knownPool.map((k) => ({ ip: k.ip, port: k.port }))
  const ruleTargets = rules.filter((r) => r.scope === 'server' && r.enabled && r.target).map((r) => r.target as FavoriteServer)
  return dedupe([watchlist, knownAddresses, ruleTargets])
}

/**
 * `actions` (native button row) is darwin/win32 only per Electron's own typings — Linux
 * notification backends never surface action-button clicks back to this API. It's added
 * anyway since it's free on the platforms that do support it and gives a way to connect
 * without ever needing the window raised (steam://connect doesn't care about window focus).
 * The whole-notification `click` handler (onFocusServer) is what Linux users actually get;
 * see main.ts's focusOrFlagWindow for why that alone can't reliably raise the window there.
 */
function sendNotification(fire: FireDecision): void {
  if (!Notification.isSupported()) return
  const t = CATALOGS[getLocaleSync()]
  const n = new Notification({
    title: fire.title,
    body: fire.body,
    actions: [{ type: 'button', text: t.notifications.connectAction }]
  })
  n.on('click', () => onFocusServer(fire.address))
  n.on('action', (_event, actionIndex) => {
    if (actionIndex === 0) onConnect(fire.address)
  })
  n.show()
}

function emitStatus(): void {
  onPollStatus({ lastPollAt, nextPollAt, watchedCount: watchlist.length })
}

function stopLoop(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  nextPollAt = null
}

function scheduleNext(): void {
  const ms = clampPollInterval(settings.pollIntervalMinutes) * 60_000
  nextPollAt = Date.now() + ms
  timer = setTimeout(() => {
    pollTick().catch(() => {})
  }, ms)
  emitStatus()
}

async function pollTarget(target: FavoriteServer): Promise<GameServer> {
  const server = await queryServer(target.ip, target.port)
  // Best-effort, piggybacked on this same target/tick — see module doc comment.
  queryPlayers(target.ip, target.port)
    .then((players) => recordPlayerSightings(target.ip, target.port, players.map((p) => p.name)))
    .catch(() => {})
  return server
}

async function pollTick(): Promise<void> {
  if (!settings.enabled) return
  const targets = await computeTargets()
  const results: GameServer[] = targets.length > 0 ? await mapPool(targets, POLL_CONCURRENCY, pollTarget) : []
  const now = Date.now()
  const suppressed = settings.muted || isQuietHours(settings.quietHours, new Date(now))
  const t = CATALOGS[getLocaleSync()]

  for (let i = 0; i < targets.length; i++) {
    const address = targets[i]
    const server = results[i]
    const key = addressKey(address)
    const { nextState, fire } = evaluateServer(
      address,
      server,
      rules,
      pollState.get(key),
      now,
      settings.cooldownMinutes * 60_000,
      t
    )
    pollState.set(key, nextState)
    if (fire && !suppressed) sendNotification(fire)
  }

  lastPollAt = now
  console.log(`[notification-poller] polled ${targets.length} address(es)${suppressed ? ' (notifications suppressed: muted/quiet hours)' : ''}`)
  if (settings.enabled) scheduleNext()
}

function restartLoopIfEnabled(): void {
  stopLoop()
  if (settings.enabled) {
    pollTick().catch(() => {})
  } else {
    emitStatus()
  }
}

export async function initNotificationPoller(callbacks: NotificationPollerCallbacks): Promise<void> {
  onFocusServer = callbacks.onFocusServer
  onConnect = callbacks.onConnect
  onPollStatus = callbacks.onPollStatus
  await loadPersisted()
  restartLoopIfEnabled()
}

export function setNotificationWatchlist(favorites: FavoriteServer[]): void {
  watchlist = favorites
}

export function getNotificationState(): { settings: NotificationSettings; rules: NotificationRule[]; status: PollStatus } {
  return { settings, rules, status: { lastPollAt, nextPollAt, watchedCount: watchlist.length } }
}

export async function updateNotificationSettings(
  partial: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  const wasEnabled = settings.enabled
  settings = { ...settings, ...partial }
  if (partial.pollIntervalMinutes !== undefined) settings.pollIntervalMinutes = clampPollInterval(settings.pollIntervalMinutes)
  await persist()
  if (settings.enabled !== wasEnabled || partial.pollIntervalMinutes !== undefined) {
    restartLoopIfEnabled()
  }
  return settings
}

export async function setNotificationRules(next: NotificationRule[]): Promise<void> {
  rules = next
  await persist()
}
