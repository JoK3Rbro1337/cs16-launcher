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
import type { GameInstall } from '../../electron/modules/game-install'
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
  const [install, setInstall] = useState<GameInstall | 'loading' | 'error'>('loading')
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
      .getGameInstall()
      .then(setInstall)
      .catch(() => setInstall('error'))
    window.launcher.getAppVersion().then(setVersion)
  }, [])

  function toggleCollapsed(): void {
    setCollapsed((prev) => {
      const next = !prev
      saveJSON(SIDEBAR_COLLAPSED_KEY, next)
      return next
    })
  }

  const installKnown = install !== 'loading' && install !== 'error'
  const installOk = installKnown && install.installed
  const installLabel = install === 'loading'
    ? t.nav.installChecking
    : installOk && installKnown
      ? install.source === 'steam'
        ? t.nav.installDetectedSteam
        : t.nav.installDetectedManual
      : t.nav.installNotFound

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
          className={`steam-chip${installKnown ? (installOk ? ' ok' : ' warn') : ''}`}
          title={installLabel}
        >
          {installOk ? (
            <CircleCheck size={14} />
          ) : installKnown ? (
            <TriangleAlert size={14} />
          ) : (
            <span className="steam-chip-dot" />
          )}
          {!collapsed && <span className="steam-chip-label">{installLabel}</span>}
          {!collapsed && installKnown && !installOk && (
            <button className="steam-chip-fix" onClick={() => onSelect('settings')}>
              {t.nav.fix}
            </button>
          )}
        </div>
        {!collapsed && <div className="app-version">v{version ?? '…'}</div>}
      </div>
    </nav>
  )
}
