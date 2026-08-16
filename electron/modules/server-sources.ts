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
 *    `filter[game]=cs` is the classic GoldSrc Counter-Strike 1.6 slug
 *    (distinct from `csgo`/`css`). No secret ever ships in the app.
 *
 *    **Live-use finding, 2026-07:** BattleMetrics now returns 403 for every
 *    unauthenticated request — `{"errors":[{"status":"403","title":"Forbidden",
 *    "detail":"Access denied. A subscription is required to use the API."}]}`
 *    — confirmed directly against the live endpoint with multiple User-Agents,
 *    so this isn't a User-Agent or IP-range block, it's a real policy change:
 *    the public read API this was built against is no longer keyless. There is
 *    no free-tier workaround; we just surface BattleMetrics' own `detail`
 *    message (see fetchBattlemetricsAddresses) instead of a bare HTTP code,
 *    and default the source to OFF (see BATTLEMETRICS_ENABLED_KEY's fallback
 *    in src/lib/serverSources.ts) since it can't work for anyone without a
 *    paid subscription.
 *
 * Every source here provides *addresses only* — name/map/players/ping
 * always come from our own A2S queries in server-browser.ts, never from the
 * source. A source failing (bad URL, timeout, malformed body, HTTP error) is
 * reported per-source in plain language (see friendlyStatusMessage) and never
 * aborts the others or the refresh as a whole; favorites are merged in
 * unconditionally by the caller (Servers.tsx) regardless of source outcomes,
 * so a source failure can never empty the browser on its own.
 */

import type { FavoriteServer } from './server-browser.ts'
import { parseHostPort } from './server-browser.ts'

export interface ServerSourceSpec {
  id: string
  kind: 'subscription' | 'battlemetrics'
  /** Required for kind 'subscription'; ignored for 'battlemetrics'. */
  url?: string
}

export interface ServerSourceResult {
  id: string
  kind: 'subscription' | 'battlemetrics'
  addresses: FavoriteServer[]
  error: string | null
}

const FETCH_TIMEOUT_MS = 8000

/**
 * Attribution: server addresses only (no player data), via BattleMetrics.com's
 * public read API. `filter[game]=cs` is the classic GoldSrc Counter-Strike 1.6
 * catalog slug — confirmed against /games/cs (metadata.appid: 10, matching
 * CS16_APPID), not a broader/narrower catalog.
 */
const BATTLEMETRICS_URL =
  'https://api.battlemetrics.com/servers?filter[game]=cs&filter[status]=online&page[size]=100'

/**
 * Follow-up (M11 usage feedback): the first cut only ever fetched page one
 * (100 servers) and silently dropped BattleMetrics' cursor-based `links.next`
 * pagination — the catalog tracks 3000+ servers, so that was most of the
 * funnel loss. Page through up to this many addresses, respecting the
 * unauthenticated rate limit (60/min, 15/sec burst — a handful of paced
 * requests per refresh is nowhere near either ceiling).
 */
const BATTLEMETRICS_MAX_ADDRESSES = 500
const BATTLEMETRICS_MAX_PAGES = Math.ceil(BATTLEMETRICS_MAX_ADDRESSES / 100)
const BATTLEMETRICS_PAGE_DELAY_MS = 200

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Plain-language fallback for an HTTP failure whose body isn't in a known/parseable shape. */
function friendlyStatusMessage(status: number, statusText: string): string {
  if (status === 401 || status === 403) return 'Access denied (may require an API key or subscription)'
  if (status === 404) return 'Not found — check the URL'
  if (status === 429) return 'Rate limited — try again shortly'
  if (status >= 500) return 'Service temporarily unavailable'
  return `Request failed (HTTP ${status}${statusText ? ` ${statusText}` : ''})`
}

/** Normalizes network-level failures (DNS, connection refused, timeout) into plain language too. */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': '16x-launcher' } })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Timed out after ${FETCH_TIMEOUT_MS / 1000}s`)
    }
    throw new Error('Network error — check your connection')
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

/**
 * Tries JSON array first (strings or {ip,port} objects), falls back to
 * plain-text ip:port lines. In the text path, everything from the first `#`
 * onward is stripped before parsing a line — this makes a whole-line comment
 * (`# some note`) and a trailing inline note on an address line
 * (`1.2.3.4:27015 # EU dust2 24/7`) the same case: both just leave an empty
 * or address-only remainder. Before this, a trailing note silently dropped
 * the whole line (the `#` isn't a valid port character, so parseHostPort
 * returned null with no error surfaced) — a real footgun for a hand-curated
 * list where annotating entries is the natural thing to do. No address ever
 * legitimately contains `#`, so this is unambiguous and backward-compatible
 * with every existing whole-line-comment-only subscription file.
 */
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
    .map((line) => line.split('#')[0].trim())
    .filter((line) => line.length > 0)
    .map(parseHostPort)
    .filter((t): t is FavoriteServer => t !== null)
}

export async function fetchSubscription(url: string): Promise<FavoriteServer[]> {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(friendlyStatusMessage(res.status, res.statusText))
  return parseAddressList(await res.text())
}

interface BattlemetricsServer {
  attributes?: { ip?: string; port?: number }
}

interface BattlemetricsResponse {
  data?: BattlemetricsServer[]
  links?: { next?: string }
}

interface BattlemetricsErrorResponse {
  errors?: { detail?: string; title?: string }[]
}

/** BattleMetrics' JSON:API error body carries a human-readable `detail` — prefer it over a bare status code. */
async function battlemetricsErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as BattlemetricsErrorResponse
    const detail = body.errors?.[0]?.detail ?? body.errors?.[0]?.title
    if (detail) return detail
  } catch {
    // body wasn't the expected JSON:API error shape — fall through
  }
  return friendlyStatusMessage(res.status, res.statusText)
}

function extractAddresses(servers: BattlemetricsServer[]): FavoriteServer[] {
  return servers
    .map((s): FavoriteServer | null => {
      const ip = s.attributes?.ip
      const port = s.attributes?.port
      if (!ip || !Number.isInteger(port) || port! <= 0 || port! > 65535) return null
      return { ip, port: port! }
    })
    .filter((t): t is FavoriteServer => t !== null)
}

export async function fetchBattlemetricsAddresses(): Promise<FavoriteServer[]> {
  const addresses: FavoriteServer[] = []
  let url: string | undefined = BATTLEMETRICS_URL
  let pagesFetched = 0

  for (let page = 0; url && page < BATTLEMETRICS_MAX_PAGES && addresses.length < BATTLEMETRICS_MAX_ADDRESSES; page++) {
    if (page > 0) await delay(BATTLEMETRICS_PAGE_DELAY_MS)
    const res: Response = await fetchWithTimeout(url)
    if (!res.ok) {
      if (page === 0) throw new Error(await battlemetricsErrorMessage(res))
      break // Later page failed — keep what we already fetched rather than discarding it.
    }
    const body = (await res.json()) as BattlemetricsResponse
    addresses.push(...extractAddresses(body.data ?? []))
    pagesFetched++
    url = body.links?.next
  }

  console.log(`[server-sources] battlemetrics: ${addresses.length} addresses across ${pagesFetched} page(s)`)
  return addresses.slice(0, BATTLEMETRICS_MAX_ADDRESSES)
}

/** Never throws — a failing source reports its error and contributes no addresses. */
export async function fetchServerSources(specs: ServerSourceSpec[]): Promise<ServerSourceResult[]> {
  return Promise.all(
    specs.map(async (spec): Promise<ServerSourceResult> => {
      try {
        const addresses =
          spec.kind === 'battlemetrics' ? await fetchBattlemetricsAddresses() : await fetchSubscription(spec.url ?? '')
        if (spec.kind === 'subscription') {
          console.log(`[server-sources] subscription ${spec.url}: ${addresses.length} addresses`)
        }
        return { id: spec.id, kind: spec.kind, addresses, error: null }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.log(`[server-sources] ${spec.kind} ${spec.url ?? ''} failed: ${message}`)
        return { id: spec.id, kind: spec.kind, addresses: [], error: message }
      }
    })
  )
}
