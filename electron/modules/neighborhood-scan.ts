/**
 * neighborhood-scan — opt-in, off by default (Settings). Probes nearby
 * addresses in the same /24 as servers the player already knows (favorites
 * + the local known-servers pool — deliberately NOT subscription/master/
 * BattleMetrics addresses, which aren't necessarily real, trustworthy, or
 * even server /24s worth exploring; see Servers.tsx's caller for the exact
 * seed it builds), on the standard GoldSrc port range. Uses the exact same
 * A2S_INFO query every other source's addresses get queried with
 * (server-browser.ts's queryServer) — the same public status query the
 * in-game browser itself uses, no different protocol, no connection to any
 * server.
 *
 * Only addresses that actually answer are returned — everything else is
 * discarded here rather than handed to the caller as unverified addresses,
 * since the candidate space (up to 254 hosts x 6 ports per /24) is far too
 * large to dump into the normal per-refresh query pipeline unfiltered.
 *
 * This is still hundreds of UDP packets per refresh to addresses the user
 * never explicitly added, so it stays capped (MAX_NEIGHBORHOOD_PROBES) and
 * candidates are shuffled before truncating so repeated refreshes explore
 * different parts of a large /24 rather than always the same low host
 * numbers.
 */

import { queryServer, type FavoriteServer } from './server-browser'

const GOLDSRC_PORTS = [27015, 27016, 27017, 27018, 27019, 27020]
export const MAX_NEIGHBORHOOD_PROBES = 200
const NEIGHBORHOOD_CONCURRENCY = 24

export interface NeighborhoodScanResult {
  addresses: FavoriteServer[]
  /** How many candidates were actually queried this run (after capping) — surfaced for the sources UI. */
  probed: number
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

function subnet24(ip: string): string | null {
  const parts = ip.split('.')
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null
  return parts.slice(0, 3).join('.')
}

function shuffled<T>(items: T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * `knownAddresses` must already be filtered to the user's own favorites +
 * known-servers pool by the caller (see module doc comment). `excludeAddresses`
 * is everything already in this refresh's seed, so probes aren't wasted
 * re-querying addresses we already have fresh data for.
 */
export async function scanNeighborhoods(
  knownAddresses: FavoriteServer[],
  excludeAddresses: FavoriteServer[]
): Promise<NeighborhoodScanResult> {
  const subnets = new Set<string>()
  for (const addr of knownAddresses) {
    const subnet = subnet24(addr.ip)
    if (subnet) subnets.add(subnet)
  }
  if (subnets.size === 0) return { addresses: [], probed: 0 }

  const exclude = new Set(excludeAddresses.map((a) => `${a.ip}:${a.port}`))
  const candidates: FavoriteServer[] = []
  for (const subnet of subnets) {
    for (let host = 1; host <= 254; host++) {
      const ip = `${subnet}.${host}`
      for (const port of GOLDSRC_PORTS) {
        if (exclude.has(`${ip}:${port}`)) continue
        candidates.push({ ip, port })
      }
    }
  }

  const targets = shuffled(candidates).slice(0, MAX_NEIGHBORHOOD_PROBES)
  const results = await mapPool(targets, NEIGHBORHOOD_CONCURRENCY, async (t): Promise<FavoriteServer | null> => {
    const info = await queryServer(t.ip, t.port)
    return info.ping !== null ? { ip: t.ip, port: t.port } : null
  })

  return { addresses: results.filter((r): r is FavoriteServer => r !== null), probed: targets.length }
}
