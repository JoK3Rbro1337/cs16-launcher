/**
 * map-thumbnails — look up shipped placeholder art for the server browser
 * (M11). Resolves `resources/maps/<mapname>.webp` relative to this module's
 * output location, same relative-path trick already used for the app icon
 * in main.ts (`../../resources/...` from `out/main/`), so it works
 * unchanged in dev and packaged builds.
 *
 * The renderer has no filesystem or `file://` access (contextIsolation, and
 * the CSP only allows `img-src 'self' data:`), so this returns a base64
 * data URL rather than a path — the same shape the renderer already
 * consumes for everything else that crosses the contextBridge.
 *
 * Only the classic map pool ships real art; anything else (custom/community
 * maps) resolves to null and the renderer falls back to a generated
 * placeholder tile.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAP_NAME_RE = /^[a-z0-9_-]+$/

const cache = new Map<string, string | null>()

function mapsDir(): string {
  return join(__dirname, '../../resources/maps')
}

export async function getMapThumbnail(mapName: string): Promise<string | null> {
  const key = mapName.trim().toLowerCase()
  if (!MAP_NAME_RE.test(key)) return null

  const cached = cache.get(key)
  if (cached !== undefined) return cached

  try {
    const buf = await readFile(join(mapsDir(), `${key}.webp`))
    const dataUrl = `data:image/webp;base64,${buf.toString('base64')}`
    cache.set(key, dataUrl)
    return dataUrl
  } catch {
    cache.set(key, null)
    return null
  }
}
