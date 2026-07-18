// Server list *sources* (M11) — Settings owns editing these, Servers.tsx
// reads them on every refresh. Kept in one place so the two pages agree on
// storage shape without importing each other.

import type { FavoriteServer } from '../../electron/modules/server-browser'
import type { ServerSourceSpec } from '../../electron/modules/server-sources'
import { BATTLEMETRICS_ENABLED_KEY, SERVER_SOURCES_KEY, loadJSON, saveJSON } from './storage'

export interface ServerSubscription {
  id: string
  url: string
}

export function loadSubscriptions(): ServerSubscription[] {
  return loadJSON<ServerSubscription[]>(SERVER_SOURCES_KEY, [])
}

export function saveSubscriptions(subs: ServerSubscription[]): void {
  saveJSON(SERVER_SOURCES_KEY, subs)
}

/** BattleMetrics is a keyless public read API (see electron/modules/server-sources.ts) — on by default. */
export function getBattlemetricsEnabled(): boolean {
  return loadJSON(BATTLEMETRICS_ENABLED_KEY, true)
}

export function setBattlemetricsEnabled(value: boolean): void {
  saveJSON(BATTLEMETRICS_ENABLED_KEY, value)
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
