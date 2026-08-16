import { useEffect, useState } from 'react'
import type { FavoriteServer } from '../electron/modules/server-browser'
import Home from './pages/Home'
import Servers from './pages/Servers'
import Content from './pages/Content'
import CfgBuilder from './pages/CfgBuilder'
import Settings from './pages/Settings'
import TitleBar from './components/TitleBar'
import Sidebar, { type Tab } from './components/Sidebar'
import CommandPalette from './components/CommandPalette'
import { ToastProvider } from './lib/toast'
import { FAVORITES_KEY, loadJSON } from './lib/storage'

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('home')
  const [focusServer, setFocusServer] = useState<FavoriteServer | null>(null)

  // Pushes the current favorites list to the main-process notification poller
  // once at startup, so background polling (M12) has a watchlist even if the
  // user never opens the Servers tab this session — Servers.tsx re-pushes on
  // every add/remove after that.
  useEffect(() => {
    window.launcher.setNotificationWatchlist(loadJSON<FavoriteServer[]>(FAVORITES_KEY, [])).catch(() => {})
  }, [])

  useEffect(() => {
    return window.launcher.onNotificationFocusServer((address) => {
      setTab('servers')
      setFocusServer(address)
    })
  }, [])

  return (
    <ToastProvider>
      <div className="app">
        <TitleBar />
        <div className="app-body">
          <Sidebar tab={tab} onSelect={setTab} />
          <main className="content">
            {tab === 'home' && <Home onNavigate={setTab} />}
            {tab === 'servers' && (
              <Servers focusServer={focusServer} onFocusServerHandled={() => setFocusServer(null)} />
            )}
            {tab === 'content' && <Content />}
            {tab === 'cfgbuilder' && <CfgBuilder />}
            {tab === 'settings' && <Settings />}
          </main>
        </div>
        <CommandPalette tab={tab} onNavigate={setTab} />
      </div>
    </ToastProvider>
  )
}
