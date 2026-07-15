import { useEffect, useState } from 'react'
import type { FavoriteServer, GameServer } from '../../electron/modules/server-browser'
import { LAST_SERVER_KEY, saveJSON } from '../lib/storage'

const FAVORITES_KEY = 'cs16-favorite-servers'

function loadFavorites(): FavoriteServer[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    return raw ? (JSON.parse(raw) as FavoriteServer[]) : []
  } catch {
    return []
  }
}

function saveFavorites(favorites: FavoriteServer[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
}

function serverKey(s: { ip: string; port: number }): string {
  return `${s.ip}:${s.port}`
}

/** Parses "ip:port", rejecting anything that isn't a plausible host:port pair. */
function parseAddress(value: string): FavoriteServer | null {
  const idx = value.lastIndexOf(':')
  if (idx === -1) return null
  const ip = value.slice(0, idx).trim()
  const port = Number(value.slice(idx + 1).trim())
  if (!ip || !Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { ip, port }
}

export default function Servers(): React.JSX.Element {
  const [favorites, setFavorites] = useState<FavoriteServer[]>(loadFavorites)
  const [servers, setServers] = useState<GameServer[]>([])
  const [addValue, setAddValue] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setServers(await window.launcher.queryServers(favorites))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleAddFavorite(): void {
    const parsed = parseAddress(addValue)
    if (!parsed) {
      setAddError('Enter an address as ip:port')
      return
    }
    if (favorites.some((f) => serverKey(f) === serverKey(parsed))) {
      setAddError('Already in favorites')
      return
    }
    const next = [...favorites, parsed]
    setFavorites(next)
    saveFavorites(next)
    setAddValue('')
    setAddError(null)
  }

  function handleRemoveFavorite(target: FavoriteServer): void {
    const next = favorites.filter((f) => serverKey(f) !== serverKey(target))
    setFavorites(next)
    saveFavorites(next)
  }

  function handleToggleFavorite(server: GameServer): void {
    const key = serverKey(server)
    const isFavorite = favorites.some((f) => serverKey(f) === key)
    const next = isFavorite
      ? favorites.filter((f) => serverKey(f) !== key)
      : [...favorites, { ip: server.ip, port: server.port }]
    setFavorites(next)
    saveFavorites(next)
  }

  async function handleConnect(server: GameServer): Promise<void> {
    setConnectError(null)
    try {
      await window.launcher.connect(server.ip, server.port)
      saveJSON(LAST_SERVER_KEY, {
        ip: server.ip,
        port: server.port,
        name: server.name,
        map: server.map,
        players: server.players,
        maxPlayers: server.maxPlayers
      })
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
    }
  }

  const favoriteKeys = new Set(favorites.map(serverKey))

  return (
    <section className="page">
      <h1>Servers</h1>

      <div className="field-row">
        <input
          type="text"
          className="text-input"
          placeholder="ip:port (e.g. 192.168.1.50:27015)"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddFavorite()}
        />
        <button className="secondary" onClick={handleAddFavorite}>
          Add favorite
        </button>
        <button className="secondary" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {addError && <p className="error">{addError}</p>}
      {error && <p className="error">{error}</p>}
      {connectError && <p className="error">{connectError}</p>}

      {favorites.length === 0 && servers.length === 0 && !loading && (
        <p className="muted">
          No favorites yet, and no public servers responded. Add a server above, or check back —
          the public master-server list is best-effort and not always reachable.
        </p>
      )}

      {servers.length > 0 && (
        <table className="server-table">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Map</th>
              <th>Players</th>
              <th>Ping</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => {
              const key = serverKey(server)
              const isFavorite = favoriteKeys.has(key)
              const unreachable = server.ping === null
              return (
                <tr key={key} className={unreachable ? 'unreachable' : ''}>
                  <td>
                    <button
                      className={`star${isFavorite ? ' active' : ''}`}
                      onClick={() => handleToggleFavorite(server)}
                      title={isFavorite ? 'Remove favorite' : 'Add favorite'}
                    >
                      {isFavorite ? '★' : '☆'}
                    </button>
                  </td>
                  <td>{server.name}</td>
                  <td>{server.map}</td>
                  <td>
                    {server.players}/{server.maxPlayers}
                  </td>
                  <td>{unreachable ? 'timeout' : `${server.ping} ms`}</td>
                  <td>
                    <button
                      className="secondary"
                      disabled={unreachable}
                      onClick={() => handleConnect(server)}
                    >
                      Connect
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {favorites.length > 0 && (
        <>
          <h2>Favorites</h2>
          <ul className="favorite-list">
            {favorites.map((f) => (
              <li key={serverKey(f)}>
                <span>{serverKey(f)}</span>
                <button className="link" onClick={() => handleRemoveFavorite(f)}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
