// Shared localStorage keys and JSON helpers — the manifest URL and build
// profile are read/written from both Home.tsx (selection UI) and
// Settings.tsx (manual sync trigger), so the key names live in one place.

export const MANIFEST_URL_KEY = 'cs16-manifest-url'
export const BUILD_PROFILE_KEY = 'cs16-build-profile'
export const SYNCED_PROFILE_KEY = 'cs16-build-profile-synced'
export const SECTION_COLLAPSE_KEY = 'cs16-section-collapsed'
export const SIDEBAR_COLLAPSED_KEY = 'cs16-sidebar-collapsed'
export const LAST_SERVER_KEY = 'cs16-last-server'

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
