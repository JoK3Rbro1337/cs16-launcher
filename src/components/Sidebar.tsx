import { useEffect, useState } from 'react'
import {
  Home,
  Server,
  Boxes,
  SlidersHorizontal,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  CircleCheck,
  TriangleAlert
} from 'lucide-react'
import type { SteamDetectResult } from '../../electron/modules/steam-detect'
import { SIDEBAR_COLLAPSED_KEY, loadJSON, saveJSON } from '../lib/storage'
import { useT } from '../lib/i18n'

export type Tab = 'home' | 'servers' | 'content' | 'cfgbuilder' | 'settings'

export default function Sidebar({
  tab,
  onSelect
}: {
  tab: Tab
  onSelect: (tab: Tab) => void
}): React.JSX.Element {
  const t = useT()
  const [collapsed, setCollapsed] = useState(() => loadJSON(SIDEBAR_COLLAPSED_KEY, false))
  const [steam, setSteam] = useState<SteamDetectResult | 'loading' | 'error'>('loading')
  const [version, setVersion] = useState<string | null>(null)

  const NAV_ITEMS: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: t.nav.home, icon: Home },
    { id: 'servers', label: t.nav.servers, icon: Server },
    { id: 'content', label: t.nav.content, icon: Boxes },
    { id: 'cfgbuilder', label: t.nav.cfgBuilder, icon: SlidersHorizontal },
    { id: 'settings', label: t.nav.settings, icon: SettingsIcon }
  ]

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
  const steamLabel = steam === 'loading' ? t.nav.steamChecking : steamOk ? t.nav.steamDetected : t.nav.steamNotFound

  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="sidebar-collapse-btn"
        onClick={toggleCollapsed}
        title={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
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
              {t.nav.fix}
            </button>
          )}
        </div>
        {!collapsed && <div className="app-version">v{version ?? '…'}</div>}
      </div>
    </nav>
  )
}
