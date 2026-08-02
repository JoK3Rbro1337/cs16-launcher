// Shared localStorage keys and JSON helpers — the manifest URL and build
// profile are read/written from both Home.tsx (selection UI) and
// Settings.tsx (manual sync trigger), so the key names live in one place.

export const MANIFEST_URL_KEY = 'cs16-manifest-url'
export const BUILD_PROFILE_KEY = 'cs16-build-profile'
export const SYNCED_PROFILE_KEY = 'cs16-build-profile-synced'
export const SECTION_COLLAPSE_KEY = 'cs16-section-collapsed'
export const SIDEBAR_COLLAPSED_KEY = 'cs16-sidebar-collapsed'
export const LAST_SERVER_KEY = 'cs16-last-server'
export const REDUCE_MOTION_KEY = 'cs16-reduce-motion'
export const FAVORITES_KEY = 'cs16-favorite-servers'
export const SERVER_SOURCES_KEY = 'cs16-server-sources'
export const BATTLEMETRICS_ENABLED_KEY = 'cs16-battlemetrics-enabled'
export const SERVER_VIEW_KEY = 'cs16-server-view'
export const LAUNCH_OPTIONS_NOTICE_DISMISSED_KEY = 'cs16-launch-options-notice-dismissed'
export const CONDEBUG_NOTICE_DISMISSED_KEY = 'cs16-condebug-notice-dismissed'
export const SOURCE_STATUS_KEY = 'cs16-source-status'
export const DEFAULT_SUBSCRIPTION_SEEDED_KEY = 'cs16-default-subscription-seeded'
export const KNOWN_SERVER_RETENTION_DAYS_KEY = 'cs16-known-server-retention-days'
export const NEIGHBORHOOD_SCAN_ENABLED_KEY = 'cs16-neighborhood-scan-enabled'

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getReduceMotion(): boolean {
  return loadJSON(REDUCE_MOTION_KEY, false)
}

/** Also flips :root.reduce-motion, which the CSS reduced-motion overrides key off alongside prefers-reduced-motion. */
export function setReduceMotion(value: boolean): void {
  saveJSON(REDUCE_MOTION_KEY, value)
  document.documentElement.classList.toggle('reduce-motion', value)
}
