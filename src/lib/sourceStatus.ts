// Last server-source refresh outcome, persisted so Settings can show "where
// servers are coming from" without needing the Servers page to be mounted —
// Servers.tsx writes this after every refresh() (see M12a server-sources
// follow-up), Settings.tsx just reads it.

import { SOURCE_STATUS_KEY, loadJSON, saveJSON } from './storage'

export interface SourceStatusEntry {
  id: string
  kind: 'master' | 'battlemetrics' | 'subscription' | 'known' | 'neighborhood'
  addresses: number
  error: string | null
  checkedAt: number
}

export function saveSourceStatus(entries: SourceStatusEntry[]): void {
  saveJSON(SOURCE_STATUS_KEY, entries)
}

export function loadSourceStatus(): SourceStatusEntry[] {
  return loadJSON<SourceStatusEntry[]>(SOURCE_STATUS_KEY, [])
}
