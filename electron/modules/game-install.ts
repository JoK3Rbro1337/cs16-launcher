/**
 * game-install — the launcher's single source of truth for "which CS 1.6
 * install directory should everything downstream act on."
 *
 * Steam auto-detection (steam-detect.ts) stays the default, zero-setup
 * convenience path — most players have CS 1.6 through Steam and should never
 * need to touch this module's settings. But this launcher must also work
 * with any install the user already has on disk regardless of how it got
 * there (a WON-era standalone install, a portable copy, a Steam library
 * Steam itself somehow can't resolve, a non-Steam client build, etc.) — this
 * module adds a manual, user-configured override for exactly that case.
 * Never adds any capability to download/bundle/distribute game files itself:
 * the override is purely "point at a folder you already have."
 *
 * Precedence: **a valid manual override always wins over Steam**, even if
 * Steam also has a perfectly good install. This is a deliberate choice, not
 * an oversight — the override is an explicit, deliberate action the player
 * took in Settings, and honoring it unconditionally is the only way the
 * resolved path stays predictable. The alternative (silently falling back to
 * whichever source currently resolves) would mean content sync / config
 * backups / crosshair writes could silently start targeting a *different*
 * directory than the one the player last saw, with no visible cause — a much
 * worse failure mode than the one being avoided.
 *
 * When a configured override stops validating (folder moved/deleted, or was
 * never a real CS 1.6 install), `getActiveInstall` reports `installed: false`
 * with a specific `manualPathProblem` rather than silently falling back to
 * Steam even if Steam is available — same reasoning: the player should see
 * and explicitly resolve the break (fix the path, or clear the override),
 * not have the launcher quietly swap install directories out from under
 * them. Steam's own independent status is still reported alongside (see
 * `steamPath`/`steamGamePath`/`steamInstalled`) so the UI can offer "use
 * Steam instead" without a second round trip.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'
import { detectSteam } from './steam-detect.ts'
import { getLocaleSync } from './locale-store.ts'
import { CATALOGS } from '../../locales/index.ts'

export type InstallSource = 'steam' | 'manual'

export type ManualPathProblem = 'not-found' | 'missing-cstrike' | 'missing-binary'

export interface GameInstall {
  /** True only when the resolved `gamePath` (whichever source it came from) passes validation. */
  installed: boolean
  /** The active install root, or null if nothing currently validates. */
  gamePath: string | null
  source: InstallSource | null
  /** Steam's own independent detection — populated regardless of which source is active, so the UI never needs a second call to offer "use Steam instead." */
  steamPath: string | null
  steamGamePath: string | null
  steamInstalled: boolean
  /** The configured manual override, or null if none is set — independent of whether it currently validates. */
  manualPath: string | null
  /** Set only when manualPath is non-null and currently fails validation. */
  manualPathProblem: ManualPathProblem | null
}

export interface InstallValidation {
  valid: boolean
  exists: boolean
  hasCstrike: boolean
  hasEngineBinary: boolean
  /** Absolute path to the resolved engine binary, if found. */
  binaryPath: string | null
}

/** Same binary names game-process.ts checks for in the OS process list — kept here too since resolving an actual file path (not just a process name) is this module's job, not that one's. */
const ENGINE_BINARY_NAMES_LINUX = ['hl_linux', 'hl.sh']
const ENGINE_BINARY_NAME_WINDOWS = 'hl.exe'

/** Platform-aware engine binary lookup inside a candidate game root. Returns the first match's absolute path, or null if none exist. */
export function resolveEngineBinary(gamePath: string): string | null {
  if (process.platform === 'win32') {
    const candidate = join(gamePath, ENGINE_BINARY_NAME_WINDOWS)
    return existsSync(candidate) ? candidate : null
  }
  for (const name of ENGINE_BINARY_NAMES_LINUX) {
    const candidate = join(gamePath, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** "Looks like a CS 1.6 install": the folder exists, has a cstrike/ subdirectory, and has a resolvable engine binary. Each check is reported separately so the UI can say specifically what's missing. */
export function validateInstallPath(path: string): InstallValidation {
  const exists = existsSync(path)
  const hasCstrike = exists && existsSync(join(path, 'cstrike'))
  const binaryPath = exists ? resolveEngineBinary(path) : null
  return {
    valid: exists && hasCstrike && binaryPath !== null,
    exists,
    hasCstrike,
    hasEngineBinary: binaryPath !== null,
    binaryPath
  }
}

function problemFor(validation: InstallValidation): ManualPathProblem {
  if (!validation.exists) return 'not-found'
  if (!validation.hasCstrike) return 'missing-cstrike'
  return 'missing-binary'
}

const FILENAME = 'game-install.json'

let manualPath: string | null = null
let writeQueue: Promise<void> = Promise.resolve()

function userDataDir(): string {
  return app.getPath('userData')
}

async function persist(): Promise<void> {
  const dest = `${userDataDir()}/${FILENAME}`
  const snapshot = manualPath
  const next = writeQueue.then(async () => {
    await mkdir(userDataDir(), { recursive: true })
    const tmp = `${dest}.part`
    await writeFile(tmp, JSON.stringify({ manualPath: snapshot }, null, 2))
    await rename(tmp, dest)
  })
  writeQueue = next.catch(() => {})
  return next
}

export async function initGameInstall(): Promise<void> {
  try {
    const text = await readFile(`${userDataDir()}/${FILENAME}`, 'utf-8')
    const parsed = JSON.parse(text) as { manualPath?: unknown }
    manualPath = typeof parsed.manualPath === 'string' && parsed.manualPath !== '' ? parsed.manualPath : null
  } catch {
    manualPath = null
  }
}

export function getManualInstallPath(): string | null {
  return manualPath
}

/** Sets or clears the manual override. Never validates here — validation is the caller's job (see setManualInstallPathIfValid) so a deliberately-forced/already-known-good path can still be set directly if ever needed (e.g. import/restore flows). */
async function setManualInstallPath(path: string | null): Promise<void> {
  manualPath = path
  await persist()
}

export interface SetManualInstallResult {
  /** False when `path` failed validation — in that case nothing was persisted, the previous override (if any) is untouched. */
  saved: boolean
  /** Null for a clear (path === null) — there's nothing to validate, clearing always succeeds. */
  validation: InstallValidation | null
}

/**
 * The only path Settings' folder picker should use: validates before ever
 * persisting, so an obviously-wrong folder pick can't silently break a
 * working Steam-detected setup. Passing null always "succeeds" (clearing an
 * override is always valid) and reverts resolution to Steam auto-detect.
 */
export async function setManualInstallPathIfValid(path: string | null): Promise<SetManualInstallResult> {
  if (path === null) {
    await setManualInstallPath(null)
    return { saved: true, validation: null }
  }
  const validation = validateInstallPath(path)
  if (!validation.valid) return { saved: false, validation }
  await setManualInstallPath(path)
  return { saved: true, validation }
}

export async function getActiveInstall(): Promise<GameInstall> {
  const steam = await detectSteam()
  const base = {
    steamPath: steam.steamPath,
    steamGamePath: steam.gamePath,
    steamInstalled: steam.installed
  }

  if (manualPath) {
    const validation = validateInstallPath(manualPath)
    if (validation.valid) {
      return { ...base, installed: true, gamePath: manualPath, source: 'manual', manualPath, manualPathProblem: null }
    }
    return { ...base, installed: false, gamePath: null, source: null, manualPath, manualPathProblem: problemFor(validation) }
  }

  if (steam.installed && steam.gamePath) {
    return { ...base, installed: true, gamePath: steam.gamePath, source: 'steam', manualPath: null, manualPathProblem: null }
  }

  return { ...base, installed: false, gamePath: null, source: null, manualPath: null, manualPathProblem: null }
}

export interface BrowseInstallResult {
  canceled: boolean
  /** The folder the player picked — only set when not canceled. */
  path?: string
  /** Only set when not canceled — whether `path` validated and was persisted. */
  saved?: boolean
  validation?: InstallValidation
}

/**
 * Opens a native folder picker and, if the player picks something, validates
 * and (only if valid) persists it in one round trip — same
 * validate-before-persist contract as setManualInstallPathIfValid. Mirrors
 * profile.ts's window-parented dialog pattern.
 */
export async function browseForInstallPath(window: BrowserWindow | null): Promise<BrowseInstallResult> {
  const title = CATALOGS[getLocaleSync()].dialogs.browseInstallTitle
  const result = window
    ? await dialog.showOpenDialog(window, { title, properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ title, properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }

  const path = result.filePaths[0]
  const { saved, validation } = await setManualInstallPathIfValid(path)
  return { canceled: false, path, saved, validation: validation ?? undefined }
}
