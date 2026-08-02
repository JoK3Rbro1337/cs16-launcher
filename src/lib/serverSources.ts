// Server list *sources* (M11) — Settings owns editing these, Servers.tsx
// reads them on every refresh. Kept in one place so the two pages agree on
// storage shape without importing each other.

import type { FavoriteServer } from '../../electron/modules/server-browser'
import type { ServerSourceSpec } from '../../electron/modules/server-sources'
import {
  BATTLEMETRICS_ENABLED_KEY,
  DEFAULT_SUBSCRIPTION_SEEDED_KEY,
  NEIGHBORHOOD_SCAN_ENABLED_KEY,
  SERVER_SOURCES_KEY,
  loadJSON,
  saveJSON
} from './storage'

export interface ServerSubscription {
  id: string
  url: string
}

/**
 * Repo-hosted, community-maintained fallback list — see servers/cs16-servers.txt
 * for the format and why it exists (both BattleMetrics and Valve's master server
 * are down as of 2026-07, see server-sources.ts / server-browser.ts doc comments).
 * Seeded into subscriptions exactly once (see ensureDefaultSubscriptionSeeded);
 * removing it afterward sticks, same as removing any user-added subscription.
 */
export const DEFAULT_SUBSCRIPTION_ID = 'default-curated'
const DEFAULT_SUBSCRIPTION_URL =
  'https://raw.githubusercontent.com/JoK3Rbro1337/cs16-launcher/master/servers/cs16-servers.txt'

/** One-time migration: adds the default curated subscription if this install has never seen it before. */
function ensureDefaultSubscriptionSeeded(): void {
  if (loadJSON(DEFAULT_SUBSCRIPTION_SEEDED_KEY, false)) return
  const existing = loadJSON<ServerSubscription[]>(SERVER_SOURCES_KEY, [])
  if (!existing.some((s) => s.id === DEFAULT_SUBSCRIPTION_ID)) {
    saveJSON(SERVER_SOURCES_KEY, [...existing, { id: DEFAULT_SUBSCRIPTION_ID, url: DEFAULT_SUBSCRIPTION_URL }])
  }
  saveJSON(DEFAULT_SUBSCRIPTION_SEEDED_KEY, true)
}

export function loadSubscriptions(): ServerSubscription[] {
  ensureDefaultSubscriptionSeeded()
  return loadJSON<ServerSubscription[]>(SERVER_SOURCES_KEY, [])
}

export function saveSubscriptions(subs: ServerSubscription[]): void {
  saveJSON(SERVER_SOURCES_KEY, subs)
}

/**
 * Off by default — BattleMetrics' public API now requires a paid subscription
 * (confirmed live, 2026-07: every unauthenticated request gets a 403 with
 * "Access denied. A subscription is required to use the API."). See
 * electron/modules/server-sources.ts's doc comment. Users who do have a
 * subscription can still flip this on in Settings; it just isn't a useful
 * default anymore since it can't work for anyone without one.
 */
export function getBattlemetricsEnabled(): boolean {
  return loadJSON(BATTLEMETRICS_ENABLED_KEY, false)
}

export function setBattlemetricsEnabled(value: boolean): void {
  saveJSON(BATTLEMETRICS_ENABLED_KEY, value)
}

/** Off by default — sends UDP probes to addresses the user never explicitly added; see neighborhood-scan.ts. */
export function getNeighborhoodScanEnabled(): boolean {
  return loadJSON(NEIGHBORHOOD_SCAN_ENABLED_KEY, false)
}

export function setNeighborhoodScanEnabled(value: boolean): void {
  saveJSON(NEIGHBORHOOD_SCAN_ENABLED_KEY, value)
}

export function currentSourceSpecs(): ServerSourceSpec[] {
  const specs: ServerSourceSpec[] = loadSubscriptions().map((sub) => ({
    id: sub.id,
    kind: 'subscription',
    url: sub.url
  }))
  if (getBattlemetricsEnabled()) {
    specs.push({ id: 'battlemetrics', kind: 'battlemetrics' })
  }
  return specs
}

function addressKey(a: FavoriteServer): string {
  return `${a.ip}:${a.port}`
}

export function dedupeAddresses(lists: FavoriteServer[][]): FavoriteServer[] {
  const seen = new Set<string>()
  const result: FavoriteServer[] = []
  for (const list of lists) {
    for (const addr of list) {
      const key = addressKey(addr)
      if (seen.has(key)) continue
      seen.add(key)
      result.push(addr)
    }
  }
  return result
}
