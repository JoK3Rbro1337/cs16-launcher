/**
 * server-sources — pluggable server-list *discovery* sources (M11).
 *
 * The GoldSrc master-server protocol (see server-browser.ts) is flaky for
 * CS 1.6 in practice, so this module adds two more ways to seed addresses
 * into a refresh, on top of the user's own favorites:
 *
 *  - `subscription` — a user-added URL (Settings) returning either plain
 *    text `ip:port` lines or a JSON array (of strings, or {ip,port}
 *    objects). No schema negotiation: whichever parses first wins.
 *  - `battlemetrics` — an optional built-in source hitting BattleMetrics'
 *    public servers API (https://www.battlemetrics.com/developers/documentation).
 *    Confirmed keyless: unauthenticated GETs are allowed (60/min, 15/sec
 *    burst) and `filter[game]=cs` is the classic GoldSrc Counter-Strike 1.6
 *    slug (distinct from `csgo`/`css`) — verified against the live API
 *    while building this feature. No secret ever ships in the app.
 *
 * Every source here provides *addresses only* — name/map/players/ping
 * always come from our own A2S queries in server-browser.ts, never from the
 * source. A source failing (bad URL, timeout, malformed body) is reported
 * per-source and never aborts the others or the refresh as a whole.
 */

import type { FavoriteServer } from './server-browser'
import { parseHostPort } from './server-browser'

export interface ServerSourceSpec {
  id: string
  kind: 'subscription' | 'battlemetrics'
  /** Required for kind 'subscription'; ignored for 'battlemetrics'. */
  url?: string
}

export interface ServerSourceResult {
  id: string
  addresses: FavoriteServer[]
  error: string | null
}

const FETCH_TIMEOUT_MS = 8000

/** Attribution: server addresses only (no player data), via BattleMetrics.com's public read API. */
const BATTLEMETRICS_URL =
  'https://api.battlemetrics.com/servers?filter[game]=cs&filter[status]=online&page[size]=100'

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': '16x-launcher' } })
  } finally {
    clearTimeout(timer)
  }
}

function parseAddressEntry(entry: unknown): FavoriteServer | null {
  if (typeof entry === 'string') return parseHostPort(entry)
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>
    const ip = typeof obj.ip === 'string' ? obj.ip : null
    const port = typeof obj.port === 'number' ? obj.port : Number(obj.port)
    if (ip && Number.isInteger(port) && port > 0 && port <= 65535) return { ip, port }
  }
  return null
}

/** Tries JSON array first (strings or {ip,port} objects), falls back to plain-text ip:port lines. */
export function parseAddressList(text: string): FavoriteServer[] {
  const trimmed = text.trim()
  if (trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed)
      if (Array.isArray(json)) {
        return json.map(parseAddressEntry).filter((t): t is FavoriteServer => t !== null)
      }
    } catch {
      // Not valid JSON despite the leading '[' — fall through to text parsing.
    }
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(parseHostPort)
    .filter((t): t is FavoriteServer => t !== null)
}

export async function fetchSubscription(url: string): Promise<FavoriteServer[]> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return parseAddressList(await res.text())
}

interface BattlemetricsServer {
  attributes?: { ip?: string; port?: number }
}

interface BattlemetricsResponse {
  data?: BattlemetricsServer[]
}

export async function fetchBattlemetricsAddresses(): Promise<FavoriteServer[]> {
  const res = await fetchWithTimeout(BATTLEMETRICS_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const body = (await res.json()) as BattlemetricsResponse
  return (body.data ?? [])
    .map((s): FavoriteServer | null => {
      const ip = s.attributes?.ip
      const port = s.attributes?.port
      if (!ip || !Number.isInteger(port) || port! <= 0 || port! > 65535) return null
      return { ip, port: port! }
    })
    .filter((t): t is FavoriteServer => t !== null)
}

/** Never throws — a failing source reports its error and contributes no addresses. */
export async function fetchServerSources(specs: ServerSourceSpec[]): Promise<ServerSourceResult[]> {
  return Promise.all(
    specs.map(async (spec): Promise<ServerSourceResult> => {
      try {
        const addresses =
          spec.kind === 'battlemetrics' ? await fetchBattlemetricsAddresses() : await fetchSubscription(spec.url ?? '')
        return { id: spec.id, addresses, error: null }
      } catch (err) {
        return { id: spec.id, addresses: [], error: err instanceof Error ? err.message : String(err) }
      }
    })
  )
}
