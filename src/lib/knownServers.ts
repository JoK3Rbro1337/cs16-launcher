// Retention setting for the self-growing known-servers pool (see
// electron/modules/known-servers.ts). Settings.tsx exposes it; Servers.tsx
// reads it once per refresh when pruning.

import { KNOWN_SERVER_RETENTION_DAYS_KEY, loadJSON, saveJSON } from './storage'

export const DEFAULT_KNOWN_SERVER_RETENTION_DAYS = 30

export function getKnownServerRetentionDays(): number {
  return loadJSON(KNOWN_SERVER_RETENTION_DAYS_KEY, DEFAULT_KNOWN_SERVER_RETENTION_DAYS)
}

export function setKnownServerRetentionDays(days: number): void {
  saveJSON(KNOWN_SERVER_RETENTION_DAYS_KEY, Math.max(1, Math.round(days)))
}
