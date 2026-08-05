/**
 * profile — M13 export/import: a single JSON file bundling everything a
 * player would want to carry to a new machine (favorites, known servers,
 * known players, notification rules/settings, content selections, and the
 * local My Config snapshot). This module only does the file-dialog + disk IO
 * — it has no opinion on the JSON's shape. The renderer (src/lib/profile.ts)
 * owns assembling the payload (it's the only place with both localStorage
 * access and the various main-process getters) and applying it back with a
 * merge-or-replace choice per field, since each owning module (known-servers,
 * player-tracking, notification-poller, local-config-variant) already
 * exposes its own import function with its own sensible merge semantics.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dialog, type BrowserWindow } from 'electron'

const FILE_FILTERS = [{ name: 'JSON', extensions: ['json'] }]

function defaultFileName(): string {
  const date = new Date().toISOString().slice(0, 10)
  return `1.6x-launcher-profile-${date}.json`
}

export async function exportProfile(
  window: BrowserWindow | null,
  data: unknown
): Promise<{ canceled: boolean }> {
  const result = window
    ? await dialog.showSaveDialog(window, { defaultPath: defaultFileName(), filters: FILE_FILTERS })
    : await dialog.showSaveDialog({ defaultPath: defaultFileName(), filters: FILE_FILTERS })
  if (result.canceled || !result.filePath) return { canceled: true }
  await writeFile(result.filePath, JSON.stringify(data, null, 2))
  return { canceled: false }
}

export async function importProfileFile(window: BrowserWindow | null): Promise<{ canceled: boolean; data?: unknown }> {
  const result = window
    ? await dialog.showOpenDialog(window, { properties: ['openFile'], filters: FILE_FILTERS })
    : await dialog.showOpenDialog({ properties: ['openFile'], filters: FILE_FILTERS })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  const text = await readFile(result.filePaths[0], 'utf-8')
  try {
    return { canceled: false, data: JSON.parse(text) }
  } catch {
    throw new Error('Not a valid profile file — JSON parsing failed')
  }
}
