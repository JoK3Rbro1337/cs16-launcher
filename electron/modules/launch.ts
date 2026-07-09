/**
 * launch — orchestrate starting the game through Steam.
 *
 * M2 will delegate to Steam rather than wrapping Proton by hand:
 *   - "Play"            -> steam://rungameid/10
 *   - "connect to IP"   -> steam://connect/ip:port   (from the server browser)
 * appid of Counter-Strike (1.6) = 10.
 */

/** Steam appid for Counter-Strike (1.6). */
export const CS16_APPID = 10

export async function playGame(): Promise<void> {
  // TODO(M2): shell.openExternal(`steam://rungameid/${CS16_APPID}`)
  throw new Error('launch not implemented yet (M2)')
}

export async function connectToServer(_ip: string, _port: number): Promise<void> {
  // TODO(M2/M4): shell.openExternal(`steam://connect/${ip}:${port}`)
  throw new Error('connect not implemented yet (M2)')
}
