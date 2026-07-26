/**
 * session-watcher — read-only tail of qconsole.log (GoldSrc's `-condebug`
 * output) to learn what server the player is actually on, no matter how they
 * connected: our own Connect/Play buttons, the in-game server browser, or a
 * console `connect`. Zero interaction with the game process or its memory —
 * this only reads a text file the engine itself writes, plus a read-only
 * OS process-list check (game-process.ts) to know when to start/stop
 * watching. Same safety stance as the planned M15 crosshair overlay, which
 * will reuse game-process.ts for the same reason.
 *
 * Real-world correction: qconsole.log lands at the game install ROOT
 * (`<gamePath>/qconsole.log`), not inside cstrike/ — confirmed against a
 * live install. `-condebug` is a hard requirement here (unlike the M9
 * follow-up's `+exec autoexec.cfg`, which turned out unnecessary): without
 * it the engine never writes the file at all, so there is nothing to tail.
 * See steam-launch-options.ts's `hasCondebug` check and CondebugNotice.tsx
 * for the in-app nudge, and Home.tsx for the graceful-degradation fallback
 * to launcher-only history when the file isn't available.
 *
 * Log parsing is regex-over-text, not line-by-line: qconsole.log frequently
 * concatenates chat/kill-feed prints with no newline between them (confirmed
 * against a real log), so anchoring on line boundaries would miss events.
 * The lines we actually key off — "Server IP address a.b.c.d:port" (printed
 * on every connect, listen-server or remote) and "maps/<name>_load.cfg" (the
 * engine's per-map-transition exec attempt, logged whether or not the file
 * exists) — are reliably intact substrings, so plain regex matching is both
 * simpler and more robust than trying to parse whole lines. Each tick
 * re-reads the whole file and rescans from `RESCAN_WINDOW` characters before
 * the last-processed offset (not exactly at it), so a token whose bytes
 * straddled the previous read boundary is matched whole — but only matches
 * that extend past that offset are acted on, so nothing already handled
 * fires twice (see processWindow).
 *
 * "Resolved name" for a connect event is intentionally NOT parsed from the
 * log (GoldSrc doesn't print a clean hostname on connect) — instead we reuse
 * the existing A2S query (server-browser.ts, already used by the server
 * browser and Home's quick-connect card) against the parsed ip:port. That's
 * a UDP status query, not game-process interaction, and gives us name/map/
 * players with the same never-throws fallback behavior already relied on
 * elsewhere.
 *
 * Address filtering (live-use finding): a "Create Game" listen server connects
 * to a loopback address (127.0.0.1) that briefly showed up as "last server" —
 * loopback is filtered out of tracking entirely (see classifyAddress).
 * Private LAN addresses (10/8, 172.16/12, 192.168/16) are still tracked into
 * history, but must never become the persisted/emitted "last server" — that
 * pointer only ever moves for public addresses, so a real public server
 * already recorded there survives a LAN session untouched.
 *
 * "launcher" vs. "in-game" source: launch.ts's connectToServer path calls
 * noteLauncherConnect(ip, port) right before handing off to steam://connect.
 * When a matching "Server IP address" line shows up within
 * LAUNCHER_CONNECT_WINDOW_MS, the event is tagged 'launcher'; otherwise
 * 'in-game'. A bare PLAY press (no target server) is deliberately NOT
 * tagged — only an explicit Connect from our UI counts as "our browser".
 *
 * Fallback-seed evaluation (M12a requirement 6): Steam's own server browser
 * history file, userdata/<id>/<cloud-slot>/remote/serverbrowser_hist.vdf,
 * does exist and is plain VDF (parseable with the same vdf-parser dependency
 * already in use). It records address + LastPlayed (unix seconds) under
 * "favorites" and "history" — confirmed against a real profile. Findings:
 * it's a *Server Browser* history, not a full connect log — a console
 * `connect` typed outside the Server Browser panel is not guaranteed to
 * land there, and its "appid" field was observed as always "0" (not usable
 * to disambiguate games; reliance is instead on the file living under CS
 * 1.6's own Steam Cloud "remote" slot). It also has no map/server-name
 * field. Verdict: not reliable enough to be a primary source, but harmless
 * as a one-time best-effort seed for the very first run (before qconsole.log
 * has ever produced anything) — see seedFromServerBrowserHistory below.
 */

import { readdir, readFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { parse } from 'vdf-parser'
import { detectSteam } from './steam-detect'
import { isGameRunning } from './game-process'
import { queryServer } from './server-browser'

export type SessionSource = 'launcher' | 'in-game'

export interface LiveSession {
  ip: string
  port: number
  map: string
  name: string | null
  connectedAt: number
  source: SessionSource
}

export interface SessionHistoryEntry {
  ip: string
  port: number
  name: string | null
  map: string
  source: SessionSource
  joinedAt: number
  leftAt: number
}

const QCONSOLE_LOG_FILENAME = 'qconsole.log'
const LAST_SESSION_FILENAME = 'session-last.json'
const HISTORY_FILENAME = 'session-history.json'
const MAX_HISTORY_ENTRIES = 200

const PROCESS_POLL_INTERVAL_MS = 4000
const TAIL_POLL_INTERVAL_MS = 1500
const LAUNCHER_CONNECT_WINDOW_MS = 45_000
/** How far back (in characters) to rescan on every tick, so a token split across two reads is never dropped. */
const RESCAN_WINDOW = 256

const SERVER_IP_RE = /Server IP address (\d{1,3}(?:\.\d{1,3}){3}):(\d+)/g
const MAP_LOAD_RE = /maps\/([A-Za-z0-9_-]+)_load\.cfg/g

let emitSession: (session: LiveSession | null) => void = () => {}

let watching = false
let processPollTimer: ReturnType<typeof setTimeout> | null = null
let tailTimer: ReturnType<typeof setTimeout> | null = null

/** Absolute character offset into the full re-decoded log text already handled — see processWindow. */
let processedUpTo = 0
let currentMap = ''
let liveSession: LiveSession | null = null
let pendingLauncherConnect: { ip: string; port: number; requestedAt: number } | null = null

function userDataDir(): string {
  return app.getPath('userData')
}

// Serializes writes per filename — appendHistory and persistLastSession can
// both be in flight from a single connect event, and each does its own
// read-modify-write; without this, two overlapping writes to the same file
// race on the same `.part` tmp path and corrupt it.
const writeQueues = new Map<string, Promise<void>>()

async function saveJSONFile(filename: string, value: unknown): Promise<void> {
  const dest = join(userDataDir(), filename)
  const previous = writeQueues.get(filename) ?? Promise.resolve()
  const next = previous.then(async () => {
    await mkdir(userDataDir(), { recursive: true })
    const tmp = `${dest}.part`
    await writeFile(tmp, JSON.stringify(value, null, 2))
    await rename(tmp, dest)
  })
  writeQueues.set(
    filename,
    next.catch(() => {})
  )
  return next
}

async function loadJSONFile<T>(filename: string): Promise<T | null> {
  try {
    const text = await readFile(join(userDataDir(), filename), 'utf-8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export async function getLastSession(): Promise<LiveSession | null> {
  return loadJSONFile<LiveSession>(LAST_SESSION_FILENAME)
}

export async function getSessionHistory(): Promise<SessionHistoryEntry[]> {
  return (await loadJSONFile<SessionHistoryEntry[]>(HISTORY_FILENAME)) ?? []
}

async function persistLastSession(session: LiveSession): Promise<void> {
  await saveJSONFile(LAST_SESSION_FILENAME, session)
}

async function appendHistory(entry: SessionHistoryEntry): Promise<void> {
  const existing = await getSessionHistory()
  const next = [...existing, entry].slice(-MAX_HISTORY_ENTRIES)
  await saveJSONFile(HISTORY_FILENAME, next)
}

export function noteLauncherConnect(ip: string, port: number): void {
  pendingLauncherConnect = { ip, port, requestedAt: Date.now() }
}

function resolveSource(ip: string, port: number): SessionSource {
  if (
    pendingLauncherConnect &&
    pendingLauncherConnect.ip === ip &&
    pendingLauncherConnect.port === port &&
    Date.now() - pendingLauncherConnect.requestedAt <= LAUNCHER_CONNECT_WINDOW_MS
  ) {
    pendingLauncherConnect = null
    return 'launcher'
  }
  return 'in-game'
}

function finalizeLiveSession(leftAt: number): void {
  if (!liveSession) return
  const entry: SessionHistoryEntry = {
    ip: liveSession.ip,
    port: liveSession.port,
    name: liveSession.name,
    map: liveSession.map,
    source: liveSession.source,
    joinedAt: liveSession.connectedAt,
    leftAt
  }
  appendHistory(entry).catch(() => {})
}

type AddressClass = 'loopback' | 'private' | 'public'

/**
 * 127.0.0.0/8 only — GoldSrc/CS 1.6 networking is IPv4-only in practice, so
 * ::1 isn't a real concern here. 10/8, 172.16/12, 192.168/16 are private LAN.
 */
function classifyAddress(ip: string): AddressClass {
  const octets = ip.split('.').map(Number)
  if (octets[0] === 127) return 'loopback'
  if (octets[0] === 10) return 'private'
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return 'private'
  if (octets[0] === 192 && octets[1] === 168) return 'private'
  return 'public'
}

function handleConnect(ip: string, port: number): void {
  const addressClass = classifyAddress(ip)
  // Loopback (a "Create Game" listen server) is noise, not a session — filtered out
  // entirely: no live update, no persisted "last server", no history entry. In
  // particular this must NOT finalize whatever real session was live before it —
  // starting a local practice server should not look like "you left server X".
  if (addressClass === 'loopback') return

  finalizeLiveSession(Date.now())

  const source = resolveSource(ip, port)
  const connectedAt = Date.now()
  liveSession = { ip, port, map: currentMap, name: null, connectedAt, source }
  // Private LAN sessions are still tracked (liveSession, history via the next
  // finalize) but must never become the persisted/emitted "last server" — a
  // public server already recorded there must not be overwritten by a LAN game.
  if (addressClass === 'public') {
    emitSession(liveSession)
    persistLastSession(liveSession).catch(() => {})
  }

  queryServer(ip, port)
    .then((info) => {
      if (!liveSession || liveSession.ip !== ip || liveSession.port !== port || liveSession.connectedAt !== connectedAt) {
        return // superseded by a newer connect while the query was in flight
      }
      liveSession = { ...liveSession, name: info.name, map: info.map || liveSession.map }
      if (addressClass === 'public') {
        emitSession(liveSession)
        persistLastSession(liveSession).catch(() => {})
      }
    })
    .catch(() => {})
}

interface RawMatch {
  index: number
  kind: 'map' | 'connect'
  map?: string
  ip?: string
  port?: number
}

/**
 * Scans `slice` (a substring of the full log text starting at `baseOffset`)
 * for map/connect tokens, in order, but only acts on ones that extend past
 * `alreadyProcessedUpTo` — everything at or before that absolute offset was
 * already handled on a previous tick and must not fire again. `slice`
 * starts RESCAN_WINDOW characters before that offset (not exactly at it) so
 * a token whose bytes straddled the previous tick's read boundary is still
 * matched whole here; the `absoluteEnd` filter is what stops it from being
 * double-counted now that it's fully in view.
 */
function processWindow(slice: string, baseOffset: number, alreadyProcessedUpTo: number): void {
  const matches: RawMatch[] = []
  for (const m of slice.matchAll(MAP_LOAD_RE)) {
    if (baseOffset + m.index + m[0].length <= alreadyProcessedUpTo) continue
    matches.push({ index: baseOffset + m.index, kind: 'map', map: m[1] })
  }
  for (const m of slice.matchAll(SERVER_IP_RE)) {
    if (baseOffset + m.index + m[0].length <= alreadyProcessedUpTo) continue
    matches.push({ index: baseOffset + m.index, kind: 'connect', ip: m[1], port: Number(m[2]) })
  }
  matches.sort((a, b) => a.index - b.index)
  for (const m of matches) {
    if (m.kind === 'map') currentMap = m.map as string
    else handleConnect(m.ip as string, m.port as number)
  }
}

async function tailTick(logPath: string): Promise<void> {
  let text: string
  try {
    text = await readFile(logPath, 'utf-8')
  } catch {
    return // not written yet — most commonly means -condebug is missing
  }

  if (text.length < processedUpTo) {
    // Truncated — a fresh engine launch reopened the file. Rescan from the top.
    processedUpTo = 0
  }
  if (text.length === processedUpTo) return // nothing new

  const rescanStart = Math.max(0, processedUpTo - RESCAN_WINDOW)
  processWindow(text.slice(rescanStart), rescanStart, processedUpTo)
  processedUpTo = text.length
}

function scheduleTail(logPath: string): void {
  tailTimer = setTimeout(async () => {
    await tailTick(logPath).catch(() => {})
    if (watching) scheduleTail(logPath)
  }, TAIL_POLL_INTERVAL_MS)
}

export async function startWatching(): Promise<void> {
  if (watching) return
  const detection = await detectSteam()
  if (!detection.gamePath) return

  watching = true
  currentMap = ''
  // Skip whatever's already in the file — only react to lines appended from now on. A truncation
  // (fresh engine launch) is handled by tailTick's own length check, so this is safe either way:
  // if the game is about to (re)start, the file will shrink past this and we naturally rescan from 0.
  try {
    const existing = await readFile(join(detection.gamePath, QCONSOLE_LOG_FILENAME), 'utf-8')
    processedUpTo = existing.length
  } catch {
    processedUpTo = 0
  }

  scheduleTail(join(detection.gamePath, QCONSOLE_LOG_FILENAME))
}

export function stopWatching(): void {
  if (!watching) return
  watching = false
  if (tailTimer) {
    clearTimeout(tailTimer)
    tailTimer = null
  }
  finalizeLiveSession(Date.now())
}

function scheduleProcessPoll(): void {
  processPollTimer = setTimeout(async () => {
    const running = await isGameRunning().catch(() => false)
    if (running && !watching) await startWatching()
    else if (!running && watching) stopWatching()
    scheduleProcessPoll()
  }, PROCESS_POLL_INTERVAL_MS)
}

/** Steam profile dirs can have several numbered Cloud "remote" slots; scan for the one holding server browser history. */
async function findServerBrowserHistoryPath(steamPath: string): Promise<string | null> {
  const userdataDir = join(steamPath, 'userdata')
  let profileIds: string[]
  try {
    profileIds = (await readdir(userdataDir)).filter((id) => /^\d+$/.test(id))
  } catch {
    return null
  }
  for (const profileId of profileIds) {
    const profileDir = join(userdataDir, profileId)
    let slots: string[]
    try {
      slots = await readdir(profileDir)
    } catch {
      continue
    }
    for (const slot of slots) {
      const candidate = join(profileDir, slot, 'remote', 'serverbrowser_hist.vdf')
      try {
        await readFile(candidate, 'utf-8')
        return candidate
      } catch {
        continue
      }
    }
  }
  return null
}

interface ServerBrowserHistEntry {
  address?: string
  LastPlayed?: string
}

/**
 * Best-effort only, per the module doc comment above — never required, never
 * overwrites anything qconsole.log has already produced. Only called once,
 * at startup, and only when there's no persisted last-known session yet.
 */
async function seedFromServerBrowserHistory(): Promise<void> {
  try {
    const detection = await detectSteam()
    if (!detection.steamPath) return
    const histPath = await findServerBrowserHistoryPath(detection.steamPath)
    if (!histPath) return

    const text = await readFile(histPath, 'utf-8')
    const root = parse(text) as { Filters?: { history?: Record<string, ServerBrowserHistEntry> } }
    const history = root.Filters?.history ?? {}

    let best: { ip: string; port: number; lastPlayed: number } | null = null
    for (const entry of Object.values(history)) {
      if (!entry.address || !entry.LastPlayed) continue
      const idx = entry.address.lastIndexOf(':')
      if (idx === -1) continue
      const ip = entry.address.slice(0, idx)
      const port = Number(entry.address.slice(idx + 1))
      const lastPlayed = Number(entry.LastPlayed)
      if (!Number.isInteger(port) || !Number.isFinite(lastPlayed)) continue
      if (classifyAddress(ip) !== 'public') continue // seeding only ever populates the public "last server" pointer
      if (!best || lastPlayed > best.lastPlayed) best = { ip, port, lastPlayed }
    }
    if (!best) return

    const info = await queryServer(best.ip, best.port)
    const seeded: LiveSession = {
      ip: best.ip,
      port: best.port,
      map: info.map,
      name: info.name,
      connectedAt: best.lastPlayed * 1000,
      source: 'in-game'
    }
    await persistLastSession(seeded)
    emitSession(seeded)
  } catch {
    // best-effort — never blocks startup
  }
}

export async function initSessionWatcher(onSession: (session: LiveSession | null) => void): Promise<void> {
  emitSession = onSession
  scheduleProcessPoll()

  const existing = await getLastSession()
  if (!existing) await seedFromServerBrowserHistory()
}
