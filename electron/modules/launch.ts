/**
 * launch — orchestrate starting the game through Steam.
 *
 * Delegates to Steam rather than wrapping Proton by hand:
 *   - "Play"          -> steam://rungameid/10
 *   - connect to a server -> steam://connect/ip:port (from the server browser, M4)
 * `shell.openExternal` hands the URI to the OS's default handler; on Linux this
 * is xdg-open, which routes steam:// correctly to Steam even when it's a
 * Flatpak install — no special-casing needed.
 */

import { shell } from 'electron'
import { CS16_APPID } from './steam-detect'

export async function playGame(): Promise<void> {
  await shell.openExternal(`steam://rungameid/${CS16_APPID}`)
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
  await shell.openExternal(`steam://connect/${ip}:${port}`)
}
