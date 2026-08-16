/**
 * launch — start the game and connect to servers, source-aware.
 *
 * A Steam-managed install still delegates to Steam rather than wrapping it
 * by hand — "Play" -> steam://rungameid/10, connect -> steam://connect/ip:port
 * (shell.openExternal hands the URI to the OS's default handler; on Linux
 * that's xdg-open, which routes steam:// correctly even for a Flatpak Steam
 * install, no special-casing needed).
 *
 * A manually-configured install (game-install.ts) has no Steam process to
 * hand off to, so this module spawns the resolved engine binary directly
 * instead — detached and unref'd so the child survives independently of this
 * process, mirroring how steam:// URIs already hand off and forget. This is
 * also what "unlocks" passing engine command-line flags ourselves rather
 * than only ever being able to recommend them for the player to paste into
 * Steam's Launch Options (see steam-launch-options.ts's read-only stance,
 * unchanged and still correct for Steam-managed installs — Steam owns that
 * file, this module still never touches it):
 *   - `-condebug` is always passed for a direct spawn — it's a hard
 *     requirement for session-watcher.ts (M12a), and unlike the Steam path
 *     there's no "ask the player to set it" step needed anymore, it's just
 *     always on.
 *   - `-window -noborder` are passed whenever the crosshair overlay (M15) is
 *     enabled — that feature's own module doc explains why it only reliably
 *     composites over a windowed/borderless game, not exclusive fullscreen.
 *     Read via crosshair-overlay.ts's `getCrosshairSettings()` (an in-memory
 *     getter, already loaded at app startup) rather than a separate launch
 *     setting, so there's exactly one place "does the player want the
 *     overlay" is decided. Left off otherwise, preserving the classic
 *     exclusive-fullscreen default for players not using the overlay.
 *   - `+connect ip:port` is GoldSrc's own command-line auto-connect syntax,
 *     used in place of steam://connect for a direct spawn.
 *
 * `buildLaunchArgs` and `resolveLaunchAction` are factored out and exported
 * specifically so their decision logic is verifiable without actually
 * spawning a process or calling shell.openExternal — see
 * scripts/verify-game-install.mts.
 */

import { spawn } from 'node:child_process'
import { shell } from 'electron'
import { CS16_APPID } from './steam-detect.ts'
import { getActiveInstall, resolveEngineBinary, type GameInstall } from './game-install.ts'
import { getCrosshairSettings } from './crosshair-overlay.ts'

export type LaunchAction = { kind: 'spawn'; gamePath: string } | { kind: 'steam' }

/**
 * Pure routing decision, deliberately separate from actually doing anything.
 * Two outcomes look similar but must be told apart: "no manual override is
 * configured at all" (fall through to Steam — the original, unchanged
 * behavior) vs. "a manual override IS configured but currently invalid"
 * (never fall through to Steam) — the latter throws instead. Falling through
 * silently in the broken-override case would mean a broken/moved manual
 * install quietly launches *whatever Steam happens to have*, if anything —
 * exactly the "silent directory swap" the whole manual-override precedence
 * design in game-install.ts exists to prevent. installed:false with no
 * manualPath configured (nothing set up at all) still falls through to the
 * Steam branch — that case is unchanged from pre-M17 behavior, and the UI
 * already disables Play/Connect when nothing is installed; this is
 * defense-in-depth for a direct IPC call, not the primary guard.
 */
export function resolveLaunchAction(install: GameInstall): LaunchAction {
  if (install.manualPath && !install.installed) {
    throw new Error('Your configured install folder is missing or invalid — check it in Settings')
  }
  if (install.source === 'manual' && install.gamePath) {
    return { kind: 'spawn', gamePath: install.gamePath }
  }
  return { kind: 'steam' }
}

export async function playGame(): Promise<void> {
  const install = await getActiveInstall()
  const action = resolveLaunchAction(install)
  if (action.kind === 'spawn') {
    await spawnDirect(action.gamePath, buildLaunchArgs({ overlayEnabled: getCrosshairSettings().enabled }))
    return
  }
  await shell.openExternal(`steam://rungameid/${CS16_APPID}`)
}

/**
 * The PLAY button's "Steam missing" state links out to whatever actually
 * fixes the problem: install the game through an already-installed Steam,
 * or send the player to get Steam itself when we couldn't find it at all.
 * Unrelated to the manual-install path — a player using a manual override
 * who wants Steam too can still reach this via Settings' Steam status row.
 */
export async function openSteamFix(steamFound: boolean): Promise<void> {
  const url = steamFound
    ? `steam://install/${CS16_APPID}`
    : 'https://store.steampowered.com/about/'
  await shell.openExternal(url)
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function isValidIPv4(ip: string): boolean {
  const match = ip.match(IPV4_RE)
  if (!match) return false
  return match.slice(1).every((octet) => Number(octet) <= 255)
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535
}

export async function connectToServer(ip: string, port: number): Promise<void> {
  if (!isValidIPv4(ip)) throw new Error(`Invalid server IP: ${ip}`)
  if (!isValidPort(port)) throw new Error(`Invalid server port: ${port}`)

  const install = await getActiveInstall()
  const action = resolveLaunchAction(install)
  if (action.kind === 'spawn') {
    await spawnDirect(
      action.gamePath,
      buildLaunchArgs({ overlayEnabled: getCrosshairSettings().enabled, connectTo: { ip, port } })
    )
    return
  }
  await shell.openExternal(`steam://connect/${ip}:${port}`)
}

/** Pure argument construction — see module doc for what each flag is and why. Order is stable but not load-bearing (GoldSrc accepts its flags in any order). */
export function buildLaunchArgs(opts: { overlayEnabled: boolean; connectTo?: { ip: string; port: number } }): string[] {
  const args = ['-condebug']
  if (opts.overlayEnabled) args.push('-window', '-noborder')
  if (opts.connectTo) args.push('+connect', `${opts.connectTo.ip}:${opts.connectTo.port}`)
  return args
}

/**
 * Resolves the engine binary fresh (rather than trusting a stale path) and
 * spawns it detached — the child must survive independently of this process
 * exactly like a steam:// hand-off already does. Throws (surfaced to the
 * renderer as a toast, same as any other launch failure) if the binary can't
 * be found — this should be rare since `getActiveInstall` already only
 * reports `source: 'manual'` for a path that validated, but the folder could
 * still have changed on disk between that check and this call.
 *
 * Waits for Node's 'spawn' event (confirms the OS actually started the
 * process) rather than calling `unref()` immediately after `spawn()`
 * returns: `child_process.spawn` never throws synchronously for a launch
 * failure (bad binary, permission denied, disappeared between the check
 * above and now) — it always emits an async 'error' event instead. An
 * EventEmitter's 'error' event with no listener attached crashes the whole
 * process (Node's documented behavior, not Electron-specific), so leaving
 * this unhandled would have taken down the entire launcher on a launch
 * failure that should have been a toast. Racing 'error' against 'spawn'
 * both attaches a listener (fixing the crash risk) and turns a real failure
 * into a normal rejected promise the caller already knows how to surface.
 *
 * Exported (not just an internal helper) so a verify script can exercise the
 * error path directly — see resolveEngineBinary's doc comment for the same
 * convention.
 */
export async function spawnDirect(gamePath: string, args: string[]): Promise<void> {
  const binaryPath = resolveEngineBinary(gamePath)
  if (!binaryPath) {
    throw new Error('Game engine binary not found in the configured install folder — check it in Settings')
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binaryPath, args, { cwd: gamePath, detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
