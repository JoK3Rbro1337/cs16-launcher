/**
 * profile — M13 export/import orchestration. Renderer-side because it's the
 * only place with both localStorage (favorites, subscriptions, source
 * toggles, content selections) and IPC access to the main-process-owned
 * collections (known servers, known players, notification settings/rules,
 * the local My Config snapshot). electron/modules/profile.ts only handles
 * the save/open file dialog + disk IO for whatever object this module hands
 * it — it has no opinion on shape.
 *
 * Merge-or-replace semantics (surfaced verbatim in Settings' import summary):
 *   Merge   — additive only. Collections are unioned (favorites/subscriptions
 *             by address/url, known servers/players by key keeping the
 *             fresher entry, notification rules by id keeping the LOCAL rule
 *             on a collision since a rule is authored intent, not measured
 *             data). Scalar settings (toggles, retention days, manifest URL,
 *             content selections, notification settings, My Config) are left
 *             untouched if you already have a value — merge never overwrites
 *             something you already configured.
 *   Replace — the imported profile wins everywhere, including scalars.
 */

import type { FavoriteServer } from '../../electron/modules/server-browser'
import type { KnownServerEntry } from '../../electron/modules/known-servers'
import type { KnownPlayer } from '../../electron/modules/player-tracking'
import type { NotificationRule, NotificationSettings } from '../../electron/modules/notification-poller'
import type { BuildProfile } from '../../electron/modules/content-sync'
import type { LocalVariantSnapshot } from '../../electron/modules/local-config-variant'
import {
  BATTLEMETRICS_ENABLED_KEY,
  BUILD_PROFILE_KEY,
  FAVORITES_KEY,
  KNOWN_SERVER_RETENTION_DAYS_KEY,
  MANIFEST_URL_KEY,
  NEIGHBORHOOD_SCAN_ENABLED_KEY,
  loadJSON,
  saveJSON
} from './storage'
import { loadSubscriptions, saveSubscriptions, type ServerSubscription } from './serverSources'

export const PROFILE_VERSION = 1

export interface LauncherProfile {
  version: number
  exportedAt: string
  favorites: FavoriteServer[]
  serverSubscriptions: ServerSubscription[]
  battlemetricsEnabled: boolean
  neighborhoodScanEnabled: boolean
  knownServerRetentionDays: number
  manifestUrl: string
  contentSelections: BuildProfile
  knownServers: KnownServerEntry[]
  knownPlayers: KnownPlayer[]
  notificationSettings: NotificationSettings
  notificationRules: NotificationRule[]
  localConfigVariant: LocalVariantSnapshot | null
}

export type ImportMode = 'merge' | 'replace'

function addressKey(a: FavoriteServer): string {
  return `${a.ip}:${a.port}`
}

export async function gatherProfile(): Promise<LauncherProfile> {
  const [knownServers, knownPlayers, notifState, localConfigVariant] = await Promise.all([
    window.launcher.getKnownServers(),
    window.launcher.getKnownPlayers(),
    window.launcher.getNotificationState(),
    window.launcher.getLocalConfigVariant()
  ])

  return {
    version: PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    favorites: loadJSON<FavoriteServer[]>(FAVORITES_KEY, []),
    serverSubscriptions: loadSubscriptions(),
    battlemetricsEnabled: loadJSON(BATTLEMETRICS_ENABLED_KEY, false),
    neighborhoodScanEnabled: loadJSON(NEIGHBORHOOD_SCAN_ENABLED_KEY, false),
    knownServerRetentionDays: loadJSON(KNOWN_SERVER_RETENTION_DAYS_KEY, 30),
    manifestUrl: localStorage.getItem(MANIFEST_URL_KEY) ?? '',
    contentSelections: loadJSON<BuildProfile>(BUILD_PROFILE_KEY, { selections: {}, features: {} }),
    knownServers,
    knownPlayers,
    notificationSettings: notifState.settings,
    notificationRules: notifState.rules,
    localConfigVariant
  }
}

/** Best-effort shape check — enough to reject an unrelated JSON file without pretending to fully validate it. */
export function isLauncherProfile(value: unknown): value is LauncherProfile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.version === 'number' &&
    Array.isArray(v.favorites) &&
    Array.isArray(v.knownServers) &&
    Array.isArray(v.knownPlayers)
  )
}

export interface ProfileSummary {
  favorites: number
  subscriptions: number
  knownServers: number
  knownPlayers: number
  notificationRules: number
  hasLocalConfigVariant: boolean
  exportedAt: string
}

export function summarizeProfile(profile: LauncherProfile): ProfileSummary {
  return {
    favorites: profile.favorites.length,
    subscriptions: profile.serverSubscriptions.length,
    knownServers: profile.knownServers.length,
    knownPlayers: profile.knownPlayers.length,
    notificationRules: profile.notificationRules.length,
    hasLocalConfigVariant: profile.localConfigVariant !== null,
    exportedAt: profile.exportedAt
  }
}

function unionFavorites(local: FavoriteServer[], imported: FavoriteServer[]): FavoriteServer[] {
  const seen = new Set(local.map(addressKey))
  const next = [...local]
  for (const addr of imported) {
    const key = addressKey(addr)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(addr)
  }
  return next
}

function unionSubscriptions(local: ServerSubscription[], imported: ServerSubscription[]): ServerSubscription[] {
  const seenUrls = new Set(local.map((s) => s.url))
  const next = [...local]
  for (const sub of imported) {
    if (seenUrls.has(sub.url)) continue
    seenUrls.add(sub.url)
    next.push(sub)
  }
  return next
}

/** Rules merge by id, LOCAL wins on collision — a rule is authored intent, so merge must never silently rewrite one you already have. */
function unionRules(local: NotificationRule[], imported: NotificationRule[]): NotificationRule[] {
  const localIds = new Set(local.map((r) => r.id))
  return [...local, ...imported.filter((r) => !localIds.has(r.id))]
}

export async function applyProfile(profile: LauncherProfile, mode: ImportMode): Promise<void> {
  if (mode === 'replace') {
    saveJSON(FAVORITES_KEY, profile.favorites)
    saveSubscriptions(profile.serverSubscriptions)
    saveJSON(BATTLEMETRICS_ENABLED_KEY, profile.battlemetricsEnabled)
    saveJSON(NEIGHBORHOOD_SCAN_ENABLED_KEY, profile.neighborhoodScanEnabled)
    saveJSON(KNOWN_SERVER_RETENTION_DAYS_KEY, profile.knownServerRetentionDays)
    localStorage.setItem(MANIFEST_URL_KEY, profile.manifestUrl)
    saveJSON(BUILD_PROFILE_KEY, profile.contentSelections)
    await window.launcher.updateNotificationSettings(profile.notificationSettings)
    await window.launcher.setNotificationRules(profile.notificationRules)
  } else {
    const currentFavorites = loadJSON<FavoriteServer[]>(FAVORITES_KEY, [])
    saveJSON(FAVORITES_KEY, unionFavorites(currentFavorites, profile.favorites))
    saveSubscriptions(unionSubscriptions(loadSubscriptions(), profile.serverSubscriptions))
    const notifState = await window.launcher.getNotificationState()
    await window.launcher.setNotificationRules(unionRules(notifState.rules, profile.notificationRules))
    // Scalars (toggles, retention days, manifest URL, content selections, notification
    // settings) are intentionally left untouched on merge — see module doc comment.
  }

  await window.launcher.importKnownServers(profile.knownServers, mode)
  await window.launcher.importKnownPlayers(profile.knownPlayers, mode)
  await window.launcher.importLocalConfigVariant(profile.localConfigVariant, mode)
}
