/**
 * server-browser — query CS 1.6 servers over the GoldSrc/Source A2S protocol.
 *
 * Uses `steam-server-query-goldsrc-support` for both master-server discovery
 * (Master Server Query Protocol) and per-server A2S_INFO queries; it branches
 * on the response header byte ('m' = legacy GoldSrc format, otherwise the
 * newer Source format) so both reply styles parse correctly — real CS 1.6
 * servers reply in either depending on engine build.
 *
 * The GoldSrc-specific master (hl1master.steampowered.com) has been shut down
 * by Valve; hl2master was meant to serve both Source and GoldSrc appids, with
 * a documented IP fallback for when DNS to it is unavailable. Master discovery
 * is best-effort: it merges into the caller-supplied favorites list rather
 * than being required, since the legacy UDP master infrastructure is flaky.
 *
 * **Live-use finding, 2026-07:** both fell over. `hl2master.steampowered.com`
 * is a CNAME to `hl2master.discovery.steamserver.net`, which currently has no
 * A/AAAA record at all — confirmed against multiple resolvers (system
 * default, Google's 8.8.8.8 directly via `dig`) from an unrestricted network
 * path, so this isn't a local DNS quirk. The documented fallback IP,
 * 208.64.200.65:27015, doesn't answer the master query protocol either (times
 * out) and doesn't even answer ICMP. Read as: Valve's GoldSrc master
 * infrastructure at these addresses appears to be dead right now, not merely
 * flaky. Both hosts are still tried (cheap insurance if Valve fixes DNS or
 * routing later), but MASTER_QUERY_TIMEOUT_MS was cut in half — waiting the
 * old 3s per dead host was pure tax on every refresh — and the failure reason
 * is now returned (see QueryServersResult.masterError) so the UI can say so
 * plainly instead of showing a silent zero.
 *
 * "Connect" hands off to launch.connectToServer.
 */

import {
  queryGameServerInfo,
  queryGameServerPlayer,
  queryMasterServer,
  REGIONS
} from 'steam-server-query-goldsrc-support'
import { CS16_APPID } from './steam-detect'

export interface GameServer {
  ip: string
  port: number
  name: string
  map: string
  players: number
  maxPlayers: number
  /** Round-trip ping in ms, or null if unreachable. */
  ping: number | null
  /** True if the server requires a password (A2S_INFO visibility byte). */
  locked: boolean
}

export interface FavoriteServer {
  ip: string
  port: number
}

export interface ServerPlayer {
  name: string
  score: number
  duration: number
}

/** hl1master (GoldSrc-only) was shut down by Valve; hl2master was meant to cover CS 1.6 too — see module doc comment. */
const MASTER_SERVERS = ['hl2master.steampowered.com:27011', '208.64.200.65:27015']
/** Cut from 3000ms (live-use finding: both hosts currently appear dead — no point paying a long timeout twice per refresh). */
const MASTER_QUERY_TIMEOUT_MS = 1500
const MAX_MASTER_HOSTS = 200
const SERVER_QUERY_TIMEOUT_MS = 1500
const QUERY_CONCURRENCY = 12

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

export function parseHostPort(hostPort: string): FavoriteServer | null {
  const idx = hostPort.lastIndexOf(':')
  if (idx === -1) return null
  const port = Number(hostPort.slice(idx + 1))
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { ip: hostPort.slice(0, idx), port }
}

/** Plain-language reason for a master-query failure — DNS vs. no-response are worth telling apart in the UI. */
function friendlyMasterError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
    return "hostname isn't resolving"
  }
  if (message.toLowerCase().includes('timeout')) {
    return 'no response'
  }
  return message
}

/** Best-effort: returns { hosts: [], error } if every master (and its fallback) fails, rather than failing silently. */
async function discoverMasterHosts(): Promise<{ hosts: string[]; error: string | null }> {
  let lastError: string | null = null
  for (const master of MASTER_SERVERS) {
    try {
      const hosts = await queryMasterServer(
        master,
        REGIONS.ALL,
        { appid: Number(CS16_APPID) },
        MASTER_QUERY_TIMEOUT_MS,
        MAX_MASTER_HOSTS
      )
      console.log(`[server-browser] master ${master}: ${hosts.length} hosts`)
      return { hosts, error: null }
    } catch (err) {
      lastError = friendlyMasterError(err)
      continue
    }
  }
  console.log(`[server-browser] master discovery: all masters failed (${lastError}), 0 hosts`)
  return { hosts: [], error: `Valve's master server(s) unreachable (${lastError})` }
}

/** Never rejects — an unreachable server is reported with ping: null, not thrown. */
export async function queryServer(ip: string, port: number): Promise<GameServer> {
  try {
    const info = await queryGameServerInfo(`${ip}:${port}`, 1, SERVER_QUERY_TIMEOUT_MS)
    return {
      ip,
      port,
      name: info.name,
      map: info.map,
      players: info.players,
      maxPlayers: info.maxPlayers,
      ping: info.ping ?? null,
      locked: info.visibility === 1
    }
  } catch {
    return { ip, port, name: `${ip}:${port}`, map: '', players: 0, maxPlayers: 0, ping: null, locked: false }
  }
}

/** Throws if the server doesn't answer A2S_PLAYER — callers should treat the list as best-effort. */
export async function queryPlayers(ip: string, port: number): Promise<ServerPlayer[]> {
  const response = await queryGameServerPlayer(`${ip}:${port}`, 1, SERVER_QUERY_TIMEOUT_MS)
  return response.players.map((p) => ({ name: p.name, score: p.score, duration: p.duration }))
}

function byPingAscending(a: GameServer, b: GameServer): number {
  if (a.ping === null) return b.ping === null ? 0 : 1
  if (b.ping === null) return -1
  return a.ping - b.ping
}

export interface QueryServersResult {
  servers: GameServer[]
  /** Raw host count master discovery returned, before dedup against the seed. */
  masterDiscoveredCount: number
  /** Of those, how many weren't already covered by the seed and were actually queried. */
  masterNewCount: number
  /** Total unique addresses actually A2S-queried (seed + masterNewCount). */
  queriedCount: number
  /** servers with ping !== null. */
  respondingCount: number
  /** Plain-language reason master discovery contributed nothing this refresh, or null if it worked (or wasn't needed). */
  masterError: string | null
}

/**
 * `seedAddresses` is whatever the caller wants queried unconditionally —
 * favorites, plus (as of M11) addresses merged in from user subscriptions
 * and the optional built-in BattleMetrics source. Master-server discovery
 * still runs here and only contributes hosts not already in the seed.
 */
export async function queryServers(seedAddresses: FavoriteServer[]): Promise<QueryServersResult> {
  const { hosts: masterHosts, error: masterError } = await discoverMasterHosts()

  const seedKeys = new Set(seedAddresses.map((f) => `${f.ip}:${f.port}`))
  const masterTargets = masterHosts
    .map(parseHostPort)
    .filter((t): t is FavoriteServer => t !== null && !seedKeys.has(`${t.ip}:${t.port}`))

  const targets = [...seedAddresses, ...masterTargets]
  const results = await mapPool(targets, QUERY_CONCURRENCY, (t) => queryServer(t.ip, t.port))
  const servers = results.sort(byPingAscending)
  const respondingCount = servers.filter((s) => s.ping !== null).length

  console.log(
    `[server-browser] queried ${targets.length} addresses (${masterTargets.length} new from master), ${respondingCount} responding`
  )

  return {
    servers,
    masterDiscoveredCount: masterHosts.length,
    masterNewCount: masterTargets.length,
    queriedCount: targets.length,
    masterError,
    respondingCount
  }
}
