import { useEffect, useState } from 'react'
import {
  Home,
  Server,
  Boxes,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  CircleCheck,
  TriangleAlert
} from 'lucide-react'
import type { SteamDetectResult } from '../../electron/modules/steam-detect'
import { SIDEBAR_COLLAPSED_KEY, loadJSON, saveJSON } from '../lib/storage'

export type Tab = 'home' | 'servers' | 'content' | 'settings'

const NAV_ITEMS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'content', label: 'Content', icon: Boxes },
  { id: 'settings', label: 'Settings', icon: SettingsIcon }
]

export default function Sidebar({
  tab,
  onSelect
}: {
  tab: Tab
  onSelect: (tab: Tab) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(() => loadJSON(SIDEBAR_COLLAPSED_KEY, false))
  const [steam, setSteam] = useState<SteamDetectResult | 'loading' | 'error'>('loading')
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    window.launcher
      .detectSteam()
      .then(setSteam)
      .catch(() => setSteam('error'))
    window.launcher.getAppVersion().then(setVersion)
  }, [])

  function toggleCollapsed(): void {
    setCollapsed((prev) => {
      const next = !prev
      saveJSON(SIDEBAR_COLLAPSED_KEY, next)
      return next
    })
  }

  const steamOk = steam !== 'loading' && steam !== 'error' && steam.installed
  const steamKnown = steam !== 'loading' && steam !== 'error'
  const steamLabel = steam === 'loading' ? 'Checking Steam…' : steamOk ? 'Steam detected' : 'Steam not found'

  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="sidebar-collapse-btn"
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>

      <div className="nav-list">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item${tab === id ? ' active' : ''}`}
            onClick={() => onSelect(id)}
            title={collapsed ? label : undefined}
          >
            <Icon size={16} className="nav-icon" />
            {!collapsed && <span className="nav-label">{label}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-bottom">
        <div
          className={`steam-chip${steamKnown ? (steamOk ? ' ok' : ' warn') : ''}`}
          title={steamLabel}
        >
          {steamOk ? (
            <CircleCheck size={14} />
          ) : steamKnown ? (
            <TriangleAlert size={14} />
          ) : (
            <span className="steam-chip-dot" />
          )}
          {!collapsed && <span className="steam-chip-label">{steamLabel}</span>}
          {!collapsed && steamKnown && !steamOk && (
            <button className="steam-chip-fix" onClick={() => onSelect('home')}>
              Fix
            </button>
          )}
        </div>
        {!collapsed && <div className="app-version">v{version ?? '…'}</div>}
      </div>
    </nav>
  )
}
