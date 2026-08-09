/**
 * Reads the user's Steam per-game Launch Options for CS 1.6 (appid 10) from
 * userdata/<id>/config/localconfig.vdf. Checks two independent flags:
 *   - `+exec autoexec.cfg` — see the M9 follow-up doc comment in
 *     content-sync.ts. Confirmed on a real install (see CLAUDE.md) that this
 *     is no longer necessary now that config variants also exec via
 *     userconfig.cfg, so it's a reliability nice-to-have, not a hard
 *     requirement.
 *   - `-condebug` — a hard requirement for session-watcher.ts (M12a): GoldSrc
 *     only writes qconsole.log when this flag is set, so without it there is
 *     nothing to tail at all.
 *   - `-windowed`/`-noborder` — M15 follow-up: the crosshair overlay
 *     (crosshair-overlay.ts) is a real, separate window composited above the
 *     game, which is only reliable over a windowed/borderless game — an
 *     *exclusive* fullscreen game surface is compositor-dependent to draw
 *     over (Wayland) or fights the overlay for top-most status (X11, see
 *     the setIgnoreMouseEvents regression documented in crosshair-
 *     overlay.ts). Same read-only stance as -condebug below applies here:
 *     detected and surfaced as a recommendation only, never written.
 *   - `-w`/`-h` (also accepts `-width`/`-height`, defensively — GoldSrc's
 *     documented flags are `-w`/`-h`, but a Steam-pipe engine update
 *     recognizing the longer spelling too costs nothing to also match) — the
 *     game's actual render resolution, parsed (not just detected as
 *     present/absent like the flags above) so Settings' crosshair-scale
 *     auto-detect (crosshair-settings.ts's `scale` field) can offer "use my
 *     current Launch Options resolution" instead of requiring the player to
 *     retype numbers they already set in Steam.
 *

 * Read-only, by design: never writes to localconfig.vdf. Steam owns that
 * file and may rewrite it at any time (including while running), so a
 * launcher-side write is a real corruption risk for no good reason — the UI
 * this feeds just tells the player what to paste into Steam's own Launch
 * Options field themselves. This stance is deliberately not reconsidered for
 * the overlay's windowed/borderless recommendation either, even though this
 * launcher doesn't spawn the game process itself (playGame() hands off
 * entirely to Steam via steam://rungameid — see launch.ts) and so has no
 * per-launch argument injection point of its own: the corruption risk that
 * justified read-only for -condebug applies identically here, and a launcher
 * that can't safely write once shouldn't gain a write path just because a
 * second feature would also like one.
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'vdf-parser'
import { detectSteam, CS16_APPID } from './steam-detect'

export interface LaunchOptionsCheck {
  /** False if Steam, or any readable userdata profile, couldn't be found — the UI should stay quiet rather than guess. */
  checked: boolean
  hasExecAutoexec: boolean
  hasCondebug: boolean
  /** `-window` or `-windowed` — both are recognized by GoldSrc; either satisfies this. */
  hasWindowed: boolean
  hasNoBorder: boolean
  /** Parsed from -w/-width, null if not set or unparseable. */
  gameWidth: number | null
  /** Parsed from -h/-height, null if not set or unparseable. */
  gameHeight: number | null
  /** Whatever's currently in Launch Options for CS 1.6, '' if empty. */
  currentOptions: string
}

const EXEC_AUTOEXEC_RE = /\+exec\s+"?autoexec\.cfg"?/i
const CONDEBUG_RE = /(^|\s)-condebug(\s|$)/i
const WINDOWED_RE = /(^|\s)-window(ed)?(\s|$)/i
const NOBORDER_RE = /(^|\s)-noborder(\s|$)/i
const WIDTH_RE = /(^|\s)-w(?:idth)?\s+(\d+)/i
const HEIGHT_RE = /(^|\s)-h(?:eight)?\s+(\d+)/i

function parseDimension(re: RegExp, options: string): number | null {
  const match = re.exec(options)
  if (!match) return null
  const n = Number(match[2])
  return Number.isFinite(n) && n > 0 ? n : null
}

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

const NOT_CHECKED: LaunchOptionsCheck = {
  checked: false,
  hasExecAutoexec: false,
  hasCondebug: false,
  hasWindowed: false,
  hasNoBorder: false,
  gameWidth: null,
  gameHeight: null,
  currentOptions: ''
}

export async function checkLaunchOptions(): Promise<LaunchOptionsCheck> {
  const detection = await detectSteam()
  if (!detection.steamPath) return NOT_CHECKED

  const configPath = await findMostRecentLocalConfig(detection.steamPath)
  if (!configPath) return NOT_CHECKED

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
    return {
      checked: true,
      hasExecAutoexec: EXEC_AUTOEXEC_RE.test(currentOptions),
      hasCondebug: CONDEBUG_RE.test(currentOptions),
      hasWindowed: WINDOWED_RE.test(currentOptions),
      hasNoBorder: NOBORDER_RE.test(currentOptions),
      gameWidth: parseDimension(WIDTH_RE, currentOptions),
      gameHeight: parseDimension(HEIGHT_RE, currentOptions),
      currentOptions
    }
  } catch {
    return NOT_CHECKED
  }
}
