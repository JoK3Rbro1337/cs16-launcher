// Tiny module-level store so the command palette (mounted once at the App
// level) can offer "connect to server by name" against whatever the Servers
// page most recently queried, without lifting that list into React context.
// It's a snapshot, not a subscription — the palette only reads it at open
// time, so a plain mutable variable is enough.

import type { GameServer } from '../../electron/modules/server-browser'

let knownServers: GameServer[] = []

export function setKnownServers(servers: GameServer[]): void {
  knownServers = servers
}

export function getKnownServers(): GameServer[] {
  return knownServers
}
