/**
 * Reads the user's Steam per-game Launch Options for CS 1.6 (appid 10) from
 * userdata/<id>/config/localconfig.vdf, purely to tell whether
 * `+exec autoexec.cfg` is present — see the M9 follow-up doc comment in
 * content-sync.ts for why that matters (autoexec.cfg isn't reliably
 * auto-exec'd on current Steam GoldSrc builds without it).
 *
 * Read-only, by design: never writes to localconfig.vdf. Steam owns that
 * file and may rewrite it at any time (including while running), so a
 * launcher-side write is a real corruption risk for no good reason — the UI
 * this feeds just tells the player what to paste into Steam's own Launch
 * Options field themselves.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'vdf-parser'
import { detectSteam, CS16_APPID } from './steam-detect'

export interface LaunchOptionsCheck {
  /** False if Steam, or any readable userdata profile, couldn't be found — the UI should stay quiet rather than guess. */
  checked: boolean
  hasExecAutoexec: boolean
  /** Whatever's currently in Launch Options for CS 1.6, '' if empty. */
  currentOptions: string
}

const EXEC_AUTOEXEC_RE = /\+exec\s+"?autoexec\.cfg"?/i

/** VDF key casing isn't guaranteed stable across Steam versions — look up case-insensitively. */
function getCI(obj: unknown, key: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined
  const record = obj as Record<string, unknown>
  const match = Object.keys(record).find((k) => k.toLowerCase() === key.toLowerCase())
  return match ? record[match] : undefined
}

/** Steam supports multiple local profiles; the most recently modified localconfig.vdf is the best guess at "the one in use". */
async function findMostRecentLocalConfig(steamPath: string): Promise<string | null> {
  const userdataDir = join(steamPath, 'userdata')
  let ids: string[]
  try {
    ids = (await readdir(userdataDir)).filter((id) => /^\d+$/.test(id))
  } catch {
    return null
  }

  let best: { path: string; mtimeMs: number } | null = null
  for (const id of ids) {
    const path = join(userdataDir, id, 'config', 'localconfig.vdf')
    try {
      const info = await stat(path)
      if (!best || info.mtimeMs > best.mtimeMs) best = { path, mtimeMs: info.mtimeMs }
    } catch {
      continue
    }
  }
  return best?.path ?? null
}

export async function checkLaunchOptions(): Promise<LaunchOptionsCheck> {
  const detection = await detectSteam()
  if (!detection.steamPath) return { checked: false, hasExecAutoexec: false, currentOptions: '' }

  const configPath = await findMostRecentLocalConfig(detection.steamPath)
  if (!configPath) return { checked: false, hasExecAutoexec: false, currentOptions: '' }

  try {
    const text = await readFile(configPath, 'utf-8')
    const root = parse(text)
    const store = getCI(root, 'UserLocalConfigStore')
    const software = getCI(store, 'Software')
    const valve = getCI(software, 'Valve')
    const steam = getCI(valve, 'Steam')
    const apps = getCI(steam, 'apps')
    const appEntry = getCI(apps, CS16_APPID)
    const launchOptions = getCI(appEntry, 'LaunchOptions')
    const currentOptions = typeof launchOptions === 'string' ? launchOptions : ''
    return { checked: true, hasExecAutoexec: EXEC_AUTOEXEC_RE.test(currentOptions), currentOptions }
  } catch {
    return { checked: false, hasExecAutoexec: false, currentOptions: '' }
  }
}
