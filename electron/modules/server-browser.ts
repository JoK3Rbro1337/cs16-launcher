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
 * by Valve; hl2master now serves both Source and GoldSrc appids, with a
 * documented IP fallback for when DNS to it is unavailable. Master discovery
 * is best-effort: it merges into the caller-supplied favorites list rather
 * than being required, since the legacy UDP master infrastructure is flaky.
 *
 * "Connect" hands off to launch.connectToServer.
 */

import { queryGameServerInfo, queryMasterServer, REGIONS } from 'steam-server-query-goldsrc-support'
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
}

export interface FavoriteServer {
  ip: string
  port: number
}

/** hl1master (GoldSrc-only) was shut down by Valve; hl2master now covers CS 1.6 too. */
const MASTER_SERVERS = ['hl2master.steampowered.com:27011', '208.64.200.65:27015']
const MASTER_QUERY_TIMEOUT_MS = 3000
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

function parseHostPort(hostPort: string): FavoriteServer | null {
  const idx = hostPort.lastIndexOf(':')
  if (idx === -1) return null
  const port = Number(hostPort.slice(idx + 1))
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { ip: hostPort.slice(0, idx), port }
}

/** Best-effort: returns [] if every master (and its fallback) fails. */
async function discoverMasterHosts(): Promise<string[]> {
  for (const master of MASTER_SERVERS) {
    try {
      return await queryMasterServer(
        master,
        REGIONS.ALL,
        { appid: Number(CS16_APPID) },
        MASTER_QUERY_TIMEOUT_MS,
        MAX_MASTER_HOSTS
      )
    } catch {
      continue
    }
  }
  return []
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
      ping: info.ping ?? null
    }
  } catch {
    return { ip, port, name: `${ip}:${port}`, map: '', players: 0, maxPlayers: 0, ping: null }
  }
}

function byPingAscending(a: GameServer, b: GameServer): number {
  if (a.ping === null) return b.ping === null ? 0 : 1
  if (b.ping === null) return -1
  return a.ping - b.ping
}

export async function queryServers(favorites: FavoriteServer[]): Promise<GameServer[]> {
  const masterHosts = await discoverMasterHosts()

  const favoriteKeys = new Set(favorites.map((f) => `${f.ip}:${f.port}`))
  const masterTargets = masterHosts
    .map(parseHostPort)
    .filter((t): t is FavoriteServer => t !== null && !favoriteKeys.has(`${t.ip}:${t.port}`))

  const targets = [...favorites, ...masterTargets]
  const results = await mapPool(targets, QUERY_CONCURRENCY, (t) => queryServer(t.ip, t.port))
  return results.sort(byPingAscending)
}
