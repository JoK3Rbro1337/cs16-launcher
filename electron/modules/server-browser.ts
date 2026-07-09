/**
 * server-browser — query CS 1.6 servers over the GoldSrc/Source A2S protocol.
 *
 * M4 will use `steam-server-query-goldsrc-support` to both list servers from the
 * Steam master server (by appid) and query each one (A2S_INFO/PLAYER/RULES over
 * UDP, default port 27015). "Connect" hands off to launch.connectToServer.
 */

export interface GameServer {
  ip: string
  port: number
  name: string
  map: string
  players: number
  maxPlayers: number
  /** Round-trip ping in ms, or null if unreachable. */
  ping: number | null
}

export async function queryServers(): Promise<GameServer[]> {
  // TODO(M4): master-server list + per-server A2S query, sort by ping
  return []
}
