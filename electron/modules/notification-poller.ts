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
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, Notification } from 'electron'
import { queryServer, type FavoriteServer, type GameServer } from './server-browser'
import { getKnownServers } from './known-servers'
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
let onPollStatus: (status: PollStatus) => void = () => {}

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

function sendNotification(fire: FireDecision): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: fire.title, body: fire.body })
  n.on('click', () => onFocusServer(fire.address))
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

async function pollTick(): Promise<void> {
  if (!settings.enabled) return
  const targets = await computeTargets()
  const results: GameServer[] = targets.length > 0 ? await mapPool(targets, POLL_CONCURRENCY, (t) => queryServer(t.ip, t.port)) : []
  const now = Date.now()
  const suppressed = settings.muted || isQuietHours(settings.quietHours, new Date(now))

  for (let i = 0; i < targets.length; i++) {
    const address = targets[i]
    const server = results[i]
    const key = addressKey(address)
    const { nextState, fire } = evaluateServer(address, server, rules, pollState.get(key), now, settings.cooldownMinutes * 60_000)
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

export async function initNotificationPoller(
  focusServer: (address: FavoriteServer) => void,
  pollStatus: (status: PollStatus) => void
): Promise<void> {
  onFocusServer = focusServer
  onPollStatus = pollStatus
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
