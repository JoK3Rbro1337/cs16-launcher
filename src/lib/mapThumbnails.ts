// Module-level cache so every card in a virtualized grid (which mounts and
// unmounts constantly while scrolling) shares one IPC round-trip per map
// name instead of re-fetching on every mount.

const cache = new Map<string, Promise<string | null>>()

export function loadMapThumbnail(map: string): Promise<string | null> {
  const key = map.trim().toLowerCase()
  if (!key) return Promise.resolve(null)
  let entry = cache.get(key)
  if (!entry) {
    entry = window.launcher.getMapThumbnail(key).catch(() => null)
    cache.set(key, entry)
  }
  return entry
}

const FALLBACK_PALETTES = ['fallback-sand', 'fallback-olive', 'fallback-slate', 'fallback-rust'] as const

/** Deterministic so a given map always lands on the same palette across renders/sessions. */
export function paletteFor(map: string): string {
  let hash = 0
  for (let i = 0; i < map.length; i++) hash = (hash * 31 + map.charCodeAt(i)) | 0
  return FALLBACK_PALETTES[Math.abs(hash) % FALLBACK_PALETTES.length]
}
