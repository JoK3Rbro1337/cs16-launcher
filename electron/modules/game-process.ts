/**
 * game-process — read-only OS process-list check for whether CS 1.6 is
 * currently running. No process/memory interaction beyond listing names,
 * same safety stance planned for the M15 crosshair overlay (which will
 * reuse this module to gate its own visibility).
 *
 * Binary names confirmed against a real Steam install: the native Linux
 * client runs as `hl_linux` (steamapps/common/Half-Life/hl_linux, launched
 * via hl.sh); Windows/Proton builds run `hl.exe`. Both are checked on every
 * platform since a user could be running either under compatibility layers.
 */

import { readdir, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const GAME_PROCESS_NAMES = ['hl_linux', 'hl.exe']

async function isRunningLinux(): Promise<boolean> {
  let pids: string[]
  try {
    pids = (await readdir('/proc')).filter((entry) => /^\d+$/.test(entry))
  } catch {
    return false
  }
  for (const pid of pids) {
    try {
      const comm = (await readFile(`/proc/${pid}/comm`, 'utf-8')).trim()
      if (GAME_PROCESS_NAMES.includes(comm)) return true
    } catch {
      continue // process exited between readdir and read, or unreadable — not our process either way
    }
  }
  return false
}

async function isRunningWindows(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq hl.exe', '/NH'])
    return stdout.toLowerCase().includes('hl.exe')
  } catch {
    return false
  }
}

/** macOS (and any other POSIX platform) fallback — GoldSrc has no official Mac client, but this costs nothing to check. */
async function isRunningPosixFallback(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ps', ['-A', '-o', 'comm='])
    const names = stdout.split('\n').map((line) => line.trim())
    return names.some((name) => GAME_PROCESS_NAMES.some((candidate) => name === candidate || name.endsWith(`/${candidate}`)))
  } catch {
    return false
  }
}

export async function isGameRunning(): Promise<boolean> {
  if (process.platform === 'win32') return isRunningWindows()
  if (process.platform === 'linux') return isRunningLinux()
  return isRunningPosixFallback()
}
