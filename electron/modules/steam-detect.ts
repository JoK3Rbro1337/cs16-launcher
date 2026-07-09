/**
 * steam-detect — locate Steam and the installed Counter-Strike 1.6 (appid 10).
 *
 * Cross-platform, own implementation (no `regedit`/`steam-path`): resolve the
 * Steam root, parse steamapps/libraryfolders.vdf for every library, then read
 * steamapps/appmanifest_10.acf in each to get `installdir`. The real game root
 * is `<library>/steamapps/common/<installdir>` (installdir is "Half-Life" for
 * CS 1.6, confirmed against a live Steam install); `cstrike/` inside it is the
 * mod content dir that content-sync manifests will target.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'vdf-parser'

/** Steam appid for Counter-Strike (1.6). */
export const CS16_APPID = '10'

export interface SteamDetectResult {
  /** Absolute path to the Steam install root, or null if not found. */
  steamPath: string | null
  /** Absolute path to the CS 1.6 install dir (steamapps/common/<installdir>), or null. */
  gamePath: string | null
  /** Whether appmanifest_10.acf was found in any library. */
  installed: boolean
}

interface LibraryFoldersVdf {
  libraryfolders: Record<string, { path: string }>
}

interface AppManifestVdf {
  AppState: { installdir: string }
}

/** Candidate Steam roots to probe, most likely first. Stops at the first that exists. */
function candidateSteamPaths(): string[] {
  if (process.platform === 'win32') {
    return [] // resolved via registry in findSteamPathWindows()
  }
  const home = homedir()
  return [
    join(home, '.steam', 'steam'),
    join(home, '.steam', 'root'),
    join(home, '.local', 'share', 'Steam'),
    join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam') // Flatpak
  ]
}

async function findSteamPathWindows(): Promise<string | null> {
  const queries = [
    { hive: 'HKCU', key: 'HKCU\\Software\\Valve\\Steam' },
    { hive: 'HKLM', key: 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam' }
  ]
  for (const { key } of queries) {
    const value = await readWindowsRegistryValue(key, 'SteamPath')
    if (value && existsSync(value)) return value
  }
  return null
}

/** Minimal `reg query` reader — avoids a native/regedit dependency. */
async function readWindowsRegistryValue(key: string, valueName: string): Promise<string | null> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  try {
    const { stdout } = await execFileAsync('reg', ['query', key, '/v', valueName])
    // Line looks like: "    SteamPath    REG_SZ    C:\Program Files (x86)\Steam"
    const match = stdout.match(new RegExp(`${valueName}\\s+REG_SZ\\s+(.+)`, 'i'))
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

async function findSteamPath(): Promise<string | null> {
  if (process.platform === 'win32') {
    return findSteamPathWindows()
  }
  for (const candidate of candidateSteamPaths()) {
    if (existsSync(join(candidate, 'steamapps'))) return candidate
  }
  return null
}

async function readLibraryPaths(steamPath: string): Promise<string[]> {
  const vdfPath = join(steamPath, 'steamapps', 'libraryfolders.vdf')
  if (!existsSync(vdfPath)) return [steamPath]

  const text = await readFile(vdfPath, 'utf-8')
  const parsed = parse<LibraryFoldersVdf>(text)
  const entries = Object.values(parsed.libraryfolders ?? {})
  const paths = entries.map((entry) => entry.path).filter((p): p is string => Boolean(p))

  return paths.length > 0 ? paths : [steamPath]
}

async function readInstallDir(libraryPath: string): Promise<string | null> {
  const manifestPath = join(libraryPath, 'steamapps', `appmanifest_${CS16_APPID}.acf`)
  if (!existsSync(manifestPath)) return null

  const text = await readFile(manifestPath, 'utf-8')
  const parsed = parse<AppManifestVdf>(text)
  return parsed.AppState?.installdir ?? null
}

export async function detectSteam(): Promise<SteamDetectResult> {
  const steamPath = await findSteamPath()
  if (!steamPath) {
    return { steamPath: null, gamePath: null, installed: false }
  }

  const libraryPaths = await readLibraryPaths(steamPath)
  for (const libraryPath of libraryPaths) {
    const installDir = await readInstallDir(libraryPath)
    if (installDir) {
      const gamePath = join(libraryPath, 'steamapps', 'common', installDir)
      return { steamPath, gamePath, installed: existsSync(gamePath) }
    }
  }

  return { steamPath, gamePath: null, installed: false }
}
