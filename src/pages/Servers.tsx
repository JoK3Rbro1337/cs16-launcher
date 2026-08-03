import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Info, LayoutGrid, List, Lock, RotateCw, Search, TriangleAlert, X } from 'lucide-react'
import type { FavoriteServer, GameServer, ServerPlayer } from '../../electron/modules/server-browser'
import { FAVORITES_KEY, LAST_SERVER_KEY, SERVER_VIEW_KEY, saveJSON } from '../lib/storage'
import { useToast } from '../lib/toast'
import { setKnownServers } from '../lib/serverListStore'
import { currentSourceSpecs, dedupeAddresses, getNeighborhoodScanEnabled } from '../lib/serverSources'
import { getKnownServerRetentionDays } from '../lib/knownServers'
import { saveSourceStatus, type SourceStatusEntry } from '../lib/sourceStatus'
import MapThumb from '../components/MapThumb'

const ROW_HEIGHT = 34
const OVERSCAN = 8

const CARD_WIDTH = 236
const CARD_HEIGHT = 196
const CARD_GAP = 12
const GRID_ROW_OVERSCAN = 2

type SortKey = 'name' | 'map' | 'players' | 'ping'
type SortDir = 'asc' | 'desc'
type ServerView = 'list' | 'grid'

interface Filters {
  notFull: boolean
  notEmpty: boolean
  noPassword: boolean
  favoritesOnly: boolean
  showUnresponsive: boolean
}

interface ContextMenuState {
  x: number
  y: number
  server: GameServer
}

interface FunnelSummary {
  sources: number
  addresses: number
  responding: number
}

interface SourceIssue {
  id: string
  kind: string
  message: string
}

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

function loadView(): ServerView {
  return localStorage.getItem(SERVER_VIEW_KEY) === 'grid' ? 'grid' : 'list'
}

function saveView(view: ServerView): void {
  localStorage.setItem(SERVER_VIEW_KEY, view)
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

function pingTone(ping: number | null): string {
  if (ping === null) return ''
  if (ping < 50) return ' ping-ok'
  if (ping <= 120) return ' ping-warn'
  return ' ping-danger'
}

function matchesFilters(s: GameServer, filters: Filters, favKeys: Set<string>): boolean {
  if (filters.notFull && s.maxPlayers > 0 && s.players >= s.maxPlayers) return false
  if (filters.notEmpty && s.players <= 0) return false
  if (filters.noPassword && s.locked) return false
  if (filters.favoritesOnly && !favKeys.has(serverKey(s))) return false
  if (!filters.showUnresponsive && s.ping === null) return false
  return true
}

function matchesSearch(s: GameServer, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return s.name.toLowerCase().includes(q) || s.map.toLowerCase().includes(q)
}

function compareServers(a: GameServer, b: GameServer, key: SortKey, dir: SortDir): number {
  let result = 0
  switch (key) {
    case 'name':
      result = a.name.localeCompare(b.name)
      break
    case 'map':
      result = a.map.localeCompare(b.map)
      break
    case 'players':
      result = a.players - b.players
      break
    case 'ping':
      if (a.ping === null) result = b.ping === null ? 0 : 1
      else if (b.ping === null) result = -1
      else result = a.ping - b.ping
      break
  }
  return dir === 'asc' ? result : -result
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface ServersProps {
  /** Set by App.tsx when a background-notification (M12) click asks the browser to jump to a server. */
  focusServer?: FavoriteServer | null
  onFocusServerHandled?: () => void
}

export default function Servers({ focusServer, onFocusServerHandled }: ServersProps): React.JSX.Element {
  const [favorites, setFavorites] = useState<FavoriteServer[]>(loadFavorites)
  const [servers, setServers] = useState<GameServer[]>([])
  const [addValue, setAddValue] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [firstLoad, setFirstLoad] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { pushToast } = useToast()

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>({
    notFull: false,
    notEmpty: false,
    noPassword: false,
    favoritesOnly: false,
    showUnresponsive: false
  })
  const [mapFilter, setMapFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('ping')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [drawerServer, setDrawerServer] = useState<GameServer | null>(null)
  const [players, setPlayers] = useState<ServerPlayer[] | 'loading' | 'error'>('loading')
  const [view, setView] = useState<ServerView>(loadView)
  const [funnel, setFunnel] = useState<FunnelSummary | null>(null)
  const [sourceIssues, setSourceIssues] = useState<SourceIssue[]>([])
  const [retryingKeys, setRetryingKeys] = useState<Set<string>>(new Set())

  const searchRef = useRef<HTMLInputElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const specs = currentSourceSpecs()
      const [sourceResults, knownPool] = await Promise.all([
        specs.length > 0 ? window.launcher.fetchServerSources(specs) : Promise.resolve([]),
        window.launcher.getKnownServers()
      ])
      for (const source of sourceResults) {
        if (source.error) pushToast(`Server source "${source.id}" failed: ${source.error}`)
      }
      const knownAddresses: FavoriteServer[] = knownPool.map((k) => ({ ip: k.ip, port: k.port }))

      // Favorites and the known-servers pool are always merged in regardless of what
      // sourceResults contains, so a source failing (or master discovery coming up
      // empty) can never wipe them out.
      let seed = dedupeAddresses([favorites, knownAddresses, ...sourceResults.map((s) => s.addresses)])

      // Neighborhood scan (opt-in, off by default) — only ever seeded from the user's
      // own favorites + known-servers pool, never from subscription/master/BattleMetrics
      // addresses (see neighborhood-scan.ts's module doc comment for why).
      let neighborhoodResult: { addresses: FavoriteServer[]; probed: number } | null = null
      let neighborhoodError: string | null = null
      if (getNeighborhoodScanEnabled()) {
        try {
          const userKnownAddresses = dedupeAddresses([favorites, knownAddresses])
          neighborhoodResult = await window.launcher.scanNeighborhood(userKnownAddresses, seed)
          seed = dedupeAddresses([seed, neighborhoodResult.addresses])
        } catch (err) {
          neighborhoodError = err instanceof Error ? err.message : String(err)
        }
      }

      const result = await window.launcher.queryServers(seed)
      setServers(result.servers)
      setKnownServers(result.servers)

      // Feed this refresh's ping results back into the known-servers pool so it can
      // bump lastResponded for hits and prune anything that's gone stale.
      if (knownPool.length > 0) {
        const byKey = new Map(result.servers.map((s) => [serverKey(s), s]))
        const results = knownPool.map((k) => {
          const match = byKey.get(serverKey(k))
          return { ip: k.ip, port: k.port, responded: match ? match.ping !== null : false }
        })
        window.launcher.recordKnownServerResults(results, getKnownServerRetentionDays()).catch(() => {})
      }

      const now = Date.now()
      const issues: SourceIssue[] = sourceResults
        .filter((s) => s.error)
        .map((s) => ({ id: s.id, kind: s.kind, message: s.error as string }))
      if (result.masterError) issues.push({ id: 'master', kind: 'master', message: result.masterError })
      if (neighborhoodError) issues.push({ id: 'neighborhood', kind: 'neighborhood', message: neighborhoodError })
      setSourceIssues(issues)

      const status: SourceStatusEntry[] = sourceResults.map((s) => ({
        id: s.id,
        kind: s.kind,
        addresses: s.addresses.length,
        error: s.error,
        checkedAt: now
      }))
      status.push({
        id: 'master',
        kind: 'master',
        addresses: result.masterDiscoveredCount,
        error: result.masterError,
        checkedAt: now
      })
      status.push({ id: 'known-pool', kind: 'known', addresses: knownPool.length, error: null, checkedAt: now })
      if (neighborhoodResult || neighborhoodError) {
        status.push({
          id: 'neighborhood',
          kind: 'neighborhood',
          addresses: neighborhoodResult?.addresses.length ?? 0,
          error: neighborhoodError,
          checkedAt: now
        })
      }
      saveSourceStatus(status)

      // Diagnostic funnel (M11 follow-up): per-source contribution -> dedup -> A2S response, so a
      // "why does the list feel short" report has real numbers to point at instead of guesswork.
      const subscriptionCounts: Record<string, number> = {}
      let battlemetricsCount = 0
      for (const source of sourceResults) {
        if (source.kind === 'battlemetrics') battlemetricsCount = source.addresses.length
        else subscriptionCounts[source.id] = source.addresses.length
      }
      console.log('[servers] refresh funnel', {
        favorites: favorites.length,
        battlemetrics: battlemetricsCount,
        subscriptions: subscriptionCounts,
        knownPool: knownPool.length,
        neighborhood: neighborhoodResult
          ? { probed: neighborhoodResult.probed, found: neighborhoodResult.addresses.length }
          : neighborhoodError,
        master: { discovered: result.masterDiscoveredCount, new: result.masterNewCount, error: result.masterError },
        dedupedSeed: seed.length,
        totalQueried: result.queriedCount,
        responding: result.respondingCount
      })
      setFunnel({
        sources:
          1 /* master */ +
          1 /* known pool */ +
          specs.length +
          (neighborhoodResult || neighborhoodError ? 1 : 0),
        addresses: result.queriedCount,
        responding: result.respondingCount
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      setFirstLoad(false)
    }
  }

  async function handleRetry(server: GameServer): Promise<void> {
    const key = serverKey(server)
    setRetryingKeys((prev) => new Set(prev).add(key))
    try {
      const updated = await window.launcher.queryServer(server.ip, server.port)
      setServers((prev) => prev.map((s) => (serverKey(s) === key ? updated : s)))
    } finally {
      setRetryingKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  function openDrawer(server: GameServer): void {
    setSelectedKey(serverKey(server))
    setDrawerServer(server)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keeps the main-process notification poller's watchlist (M12) in sync with
  // favorites — fires on mount too, which is fine, App.tsx's own startup push
  // just gets immediately superseded by this one when the tab is visited.
  useEffect(() => {
    window.launcher.setNotificationWatchlist(favorites).catch(() => {})
  }, [favorites])

  useEffect(() => {
    if (!focusServer) return
    const target = focusServer
    window.launcher
      .queryServer(target.ip, target.port)
      .then((server) => openDrawer(server))
      .finally(() => onFocusServerHandled?.())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusServer])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight)
      setViewportWidth(el.clientWidth)
    })
    observer.observe(el)
    setViewportHeight(el.clientHeight)
    setViewportWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  function handleViewChange(next: ServerView): void {
    setView(next)
    saveView(next)
  }

  useEffect(() => {
    function handler(e: KeyboardEvent): void {
      if (e.key !== '/') return
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!menu) return
    function close(): void {
      setMenu(null)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    if (!drawerServer) return
    setPlayers('loading')
    window.launcher
      .queryPlayers(drawerServer.ip, drawerServer.port)
      .then(setPlayers)
      .catch(() => setPlayers('error'))
  }, [drawerServer])

  const favKeys = useMemo(() => new Set(favorites.map(serverKey)), [favorites])

  const mapOptions = useMemo(() => {
    const set = new Set(servers.map((s) => s.map).filter((m) => m))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [servers])

  const rows = useMemo(() => {
    const filtered = servers.filter(
      (s) =>
        matchesFilters(s, filters, favKeys) && matchesSearch(s, search) && (!mapFilter || s.map === mapFilter)
    )
    const favRows = filtered
      .filter((s) => favKeys.has(serverKey(s)))
      .sort((a, b) => compareServers(a, b, sortKey, sortDir))
    const otherRows = filtered
      .filter((s) => !favKeys.has(serverKey(s)))
      .sort((a, b) => compareServers(a, b, sortKey, sortDir))
    return [...favRows, ...otherRows]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers, favKeys, filters, search, mapFilter, sortKey, sortDir])

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)
  const visibleRows = rows.slice(startIndex, endIndex)

  const columnCount = Math.max(1, Math.floor((viewportWidth + CARD_GAP) / (CARD_WIDTH + CARD_GAP)))
  const totalGridRows = Math.ceil(rows.length / columnCount)
  const gridRowHeight = CARD_HEIGHT + CARD_GAP
  const startGridRow = Math.max(0, Math.floor(scrollTop / gridRowHeight) - GRID_ROW_OVERSCAN)
  const endGridRow = Math.min(totalGridRows, Math.ceil((scrollTop + viewportHeight) / gridRowHeight) + GRID_ROW_OVERSCAN)
  const gridStartIndex = startGridRow * columnCount
  const gridEndIndex = Math.min(rows.length, endGridRow * columnCount)
  const visibleCards = rows.slice(gridStartIndex, gridEndIndex)

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function toggleFilter(key: keyof Filters): void {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

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

  function handleToggleFavorite(server: { ip: string; port: number }): void {
    const key = serverKey(server)
    const isFavorite = favorites.some((f) => serverKey(f) === key)
    const next = isFavorite
      ? favorites.filter((f) => serverKey(f) !== key)
      : [...favorites, { ip: server.ip, port: server.port }]
    setFavorites(next)
    saveFavorites(next)
  }

  async function handleConnect(server: GameServer): Promise<void> {
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
      pushToast(err instanceof Error ? err.message : String(err))
    }
  }

  function handleCopyIp(server: GameServer): void {
    navigator.clipboard.writeText(serverKey(server)).catch(() => {})
  }

  function openMenu(e: React.MouseEvent, server: GameServer): void {
    e.preventDefault()
    setSelectedKey(serverKey(server))
    setMenu({ x: e.clientX, y: e.clientY, server })
  }

  const anyResults = rows.length > 0
  const rawEmpty = servers.length === 0
  const drawerFavorite = drawerServer ? favKeys.has(serverKey(drawerServer)) : false

  return (
    <section className="servers-page">
      <div className="servers-toolbar">
        <div className="servers-search">
          <Search size={14} className="servers-search-icon" />
          <input
            ref={searchRef}
            type="text"
            className="cp-input servers-search-input"
            placeholder="Search servers…  (press / to focus)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-chips">
          <button
            className={`filter-chip${filters.notFull ? ' active' : ''}`}
            onClick={() => toggleFilter('notFull')}
          >
            Not full
          </button>
          <button
            className={`filter-chip${filters.notEmpty ? ' active' : ''}`}
            onClick={() => toggleFilter('notEmpty')}
          >
            Not empty
          </button>
          <button
            className={`filter-chip${filters.noPassword ? ' active' : ''}`}
            onClick={() => toggleFilter('noPassword')}
          >
            No password
          </button>
          <button
            className={`filter-chip${filters.favoritesOnly ? ' active' : ''}`}
            onClick={() => toggleFilter('favoritesOnly')}
          >
            Favorites
          </button>
          <button
            className={`filter-chip${filters.showUnresponsive ? ' active' : ''}`}
            onClick={() => toggleFilter('showUnresponsive')}
          >
            Show unresponsive
          </button>
          <select
            className={`filter-chip filter-chip-select${mapFilter ? ' active' : ''}`}
            value={mapFilter}
            onChange={(e) => setMapFilter(e.target.value)}
            disabled={mapOptions.length === 0}
          >
            <option value="">All maps</option>
            {mapOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="view-toggle" role="group" aria-label="View">
          <button
            className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
            onClick={() => handleViewChange('list')}
            title="List view"
          >
            <List size={14} />
          </button>
          <button
            className={`view-toggle-btn${view === 'grid' ? ' active' : ''}`}
            onClick={() => handleViewChange('grid')}
            title="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
        </div>

        <button
          className={`refresh-btn${loading ? ' spinning' : ''}`}
          onClick={refresh}
          disabled={loading}
          title="Refresh"
        >
          <RotateCw size={16} />
        </button>
      </div>

      {funnel && (
        <div className="servers-funnel">
          <span className="servers-funnel-num">{funnel.sources}</span> source{funnel.sources === 1 ? '' : 's'}
          {' · '}
          <span className="servers-funnel-num">{funnel.addresses}</span> address{funnel.addresses === 1 ? '' : 'es'}
          {' · '}
          <span className="servers-funnel-num">{funnel.responding}</span> responding
        </div>
      )}

      {sourceIssues.length > 0 && (
        <div className="servers-source-issues">
          {sourceIssues.map((issue) => (
            <p key={issue.id} className="servers-source-issue">
              {issue.kind === 'battlemetrics'
                ? 'BattleMetrics'
                : issue.kind === 'master'
                  ? 'Master server'
                  : issue.kind === 'neighborhood'
                    ? 'Neighborhood scan'
                    : issue.id}
              :{' '}
              {issue.message}
            </p>
          ))}
        </div>
      )}

      <div className="servers-add-row">
        <input
          type="text"
          className="cp-input servers-add-input"
          placeholder="Add server by address — ip:port"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddFavorite()}
        />
        <button className="cp-btn-secondary" onClick={handleAddFavorite}>
          Add favorite
        </button>
        {addError && <span className="cp-inline-error">{addError}</span>}
      </div>

      {view === 'list' && (
        <div className="server-list-header">
          <span className="col-dot" />
          <span className="col-star" />
          <button className="col-sort" onClick={() => toggleSort('name')}>
            Name{sortKey === 'name' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
          </button>
          <button className="col-sort" onClick={() => toggleSort('map')}>
            Map{sortKey === 'map' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
          </button>
          <button className="col-sort col-sort-right" onClick={() => toggleSort('players')}>
            Players{sortKey === 'players' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
          </button>
          <button className="col-sort col-sort-right" onClick={() => toggleSort('ping')}>
            Ping{sortKey === 'ping' && <span className="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
          </button>
          <span className="col-lock" />
          <span className="col-info" />
        </div>
      )}

      <div
        className={`server-list-viewport${view === 'grid' ? ' server-grid-viewport' : ''}`}
        ref={viewportRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {firstLoad && view === 'list' && (
          <div className="server-list-skeleton">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="server-row-skeleton" style={{ top: i * ROW_HEIGHT }} />
            ))}
          </div>
        )}

        {firstLoad && view === 'grid' && (
          <div className="server-grid-skeleton">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="server-card-skeleton"
                style={{
                  top: Math.floor(i / columnCount) * (CARD_HEIGHT + CARD_GAP),
                  left: (i % columnCount) * (CARD_WIDTH + CARD_GAP)
                }}
              />
            ))}
          </div>
        )}

        {!firstLoad && error && (
          <div className="server-list-message">
            <TriangleAlert size={28} />
            <p>{error}</p>
            <button className="cp-btn-secondary" onClick={refresh}>
              Retry
            </button>
          </div>
        )}

        {!firstLoad && !error && !anyResults && (
          <div className="server-list-message">
            <Crosshair size={28} />
            <p>{rawEmpty ? 'No servers found — add a favorite or check back' : 'No servers match these filters'}</p>
            <button className="cp-btn-secondary" onClick={refresh}>
              Refresh
            </button>
          </div>
        )}

        {!firstLoad && !error && anyResults && view === 'list' && (
          <div className="server-list-spacer" style={{ height: rows.length * ROW_HEIGHT }}>
            {visibleRows.map((server, i) => {
              const index = startIndex + i
              const key = serverKey(server)
              const isFavorite = favKeys.has(key)
              const unreachable = server.ping === null
              const selected = selectedKey === key
              return (
                <div
                  key={key}
                  className={`server-row${selected ? ' selected' : ''}${unreachable ? ' unreachable' : ''}`}
                  style={{ top: index * ROW_HEIGHT }}
                  tabIndex={0}
                  onClick={() => setSelectedKey(key)}
                  onDoubleClick={() => handleConnect(server)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect(server)}
                  onContextMenu={(e) => openMenu(e, server)}
                >
                  <span className={`status-dot${unreachable ? '' : ' status-dot-ok'}`} />
                  <button
                    className={`row-star${isFavorite ? ' active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleFavorite(server)
                    }}
                    title={isFavorite ? 'Remove favorite' : 'Add favorite'}
                  >
                    {isFavorite ? '★' : '☆'}
                  </button>
                  <span className="row-name">{server.name}</span>
                  <span className="row-map">{server.map || '—'}</span>
                  <span className="row-players">
                    {server.players}/{server.maxPlayers}
                  </span>
                  <span className={`row-ping${pingTone(server.ping)}`}>
                    {unreachable ? (
                      <button
                        className="row-retry"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRetry(server)
                        }}
                        disabled={retryingKeys.has(key)}
                      >
                        {retryingKeys.has(key) ? '…' : 'Retry'}
                      </button>
                    ) : (
                      `${server.ping} ms`
                    )}
                  </span>
                  <span className="row-lock">{server.locked && <Lock size={12} />}</span>
                  <button
                    className="row-info"
                    onClick={(e) => {
                      e.stopPropagation()
                      openDrawer(server)
                    }}
                    title="Server info"
                  >
                    <Info size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {!firstLoad && !error && anyResults && view === 'grid' && (
          <div className="server-grid-spacer" style={{ height: totalGridRows * (CARD_HEIGHT + CARD_GAP) }}>
            {visibleCards.map((server, i) => {
              const index = gridStartIndex + i
              const key = serverKey(server)
              const isFavorite = favKeys.has(key)
              const unreachable = server.ping === null
              const selected = selectedKey === key
              const row = Math.floor(index / columnCount)
              const col = index % columnCount
              return (
                <div
                  key={key}
                  className={`server-card${selected ? ' selected' : ''}${unreachable ? ' unreachable' : ''}`}
                  style={{ top: row * (CARD_HEIGHT + CARD_GAP), left: col * (CARD_WIDTH + CARD_GAP) }}
                  tabIndex={0}
                  onClick={() => setSelectedKey(key)}
                  onDoubleClick={() => handleConnect(server)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect(server)}
                  onContextMenu={(e) => openMenu(e, server)}
                >
                  <div
                    className="server-card-thumb"
                    onClick={(e) => {
                      e.stopPropagation()
                      openDrawer(server)
                    }}
                  >
                    <MapThumb map={server.map} />
                    <button
                      className="server-card-info"
                      onClick={(e) => {
                        e.stopPropagation()
                        openDrawer(server)
                      }}
                      title="Server info"
                    >
                      <Info size={12} />
                    </button>
                    <button
                      className={`server-card-star${isFavorite ? ' active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleFavorite(server)
                      }}
                      title={isFavorite ? 'Remove favorite' : 'Add favorite'}
                    >
                      {isFavorite ? '★' : '☆'}
                    </button>
                    {server.locked && (
                      <span className="server-card-lock">
                        <Lock size={12} />
                      </span>
                    )}
                  </div>
                  <div className="server-card-body">
                    <p className="server-card-name">{server.name}</p>
                    <p className="server-card-map">{server.map || '—'}</p>
                    <div className="server-card-stats">
                      <span className="server-card-players">
                        {server.players}<span className="server-card-players-max">/{server.maxPlayers}</span>
                      </span>
                      <span className={`server-card-ping${pingTone(server.ping)}`}>
                        <span className={`status-dot${unreachable ? '' : ' status-dot-ok'}`} />
                        {unreachable ? (
                          <button
                            className="server-card-retry"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRetry(server)
                            }}
                            disabled={retryingKeys.has(key)}
                          >
                            {retryingKeys.has(key) ? '…' : 'Retry'}
                          </button>
                        ) : (
                          `${server.ping} ms`
                        )}
                      </span>
                    </div>
                    <button
                      className="cp-btn-primary server-card-connect"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleConnect(server)
                      }}
                    >
                      Connect
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onContextMenu={(e) => e.preventDefault()}>
          <button
            className="context-menu-item"
            onClick={() => {
              handleConnect(menu.server)
              setMenu(null)
            }}
          >
            Connect
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              handleCopyIp(menu.server)
              setMenu(null)
            }}
          >
            Copy IP
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              handleToggleFavorite(menu.server)
              setMenu(null)
            }}
          >
            {favKeys.has(serverKey(menu.server)) ? 'Remove favorite' : 'Favorite'}
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              openDrawer(menu.server)
              setMenu(null)
            }}
          >
            Server info
          </button>
        </div>
      )}

      <div className={`server-drawer${drawerServer ? ' open' : ''}`}>
        {drawerServer && (
          <>
            <div className="server-drawer-header">
              <h2>{drawerServer.name}</h2>
              <button className="server-drawer-close" onClick={() => setDrawerServer(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="server-drawer-thumb">
              <MapThumb map={drawerServer.map} />
            </div>
            <dl className="server-drawer-meta">
              <dt>Address</dt>
              <dd>{serverKey(drawerServer)}</dd>
              <dt>Players</dt>
              <dd>
                {drawerServer.players}/{drawerServer.maxPlayers}
              </dd>
              <dt>Ping</dt>
              <dd className={pingTone(drawerServer.ping)}>
                {drawerServer.ping === null ? 'timeout' : `${drawerServer.ping} ms`}
              </dd>
            </dl>
            <div className="server-drawer-actions">
              <button className="cp-btn-primary" onClick={() => handleConnect(drawerServer)}>
                Connect
              </button>
              <button
                className="cp-btn-secondary"
                onClick={() => handleToggleFavorite(drawerServer)}
              >
                {drawerFavorite ? 'Remove favorite' : 'Add favorite'}
              </button>
            </div>
            <h3 className="server-drawer-subhead">Players</h3>
            {players === 'loading' && <p className="muted">Querying players…</p>}
            {players === 'error' && <p className="muted">Player list unavailable.</p>}
            {Array.isArray(players) && players.length === 0 && <p className="muted">No players connected.</p>}
            {Array.isArray(players) && players.length > 0 && (
              <ul className="server-drawer-players">
                {players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((p, i) => (
                    <li key={i}>
                      <span className="player-name">{p.name || 'unconnected'}</span>
                      <span className="player-score">{p.score}</span>
                      <span className="player-duration">{formatDuration(p.duration)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}
