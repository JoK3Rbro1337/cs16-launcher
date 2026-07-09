/**
 * steam-detect — locate Steam and the installed Counter-Strike 1.6 (appid 10).
 *
 * M1 will implement cross-platform detection (our own logic, per architecture
 * decision ②): resolve the Steam root, parse steamapps/libraryfolders.vdf for
 * every library, then read steamapps/appmanifest_10.acf to get `installdir`.
 * Uses `vdf-parser`; no `regedit`/`steam-path` dependency.
 */

export interface SteamDetectResult {
  /** Absolute path to the Steam install root, or null if not found. */
  steamPath: string | null
  /** Absolute path to the CS 1.6 install dir, or null if not installed. */
  gamePath: string | null
  /** Whether appmanifest_10.acf was found in any library. */
  installed: boolean
}

export async function detectSteam(): Promise<SteamDetectResult> {
  // TODO(M1): real detection via libraryfolders.vdf + appmanifest_10.acf
  return { steamPath: null, gamePath: null, installed: false }
}
