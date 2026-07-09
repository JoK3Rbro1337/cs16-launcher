import { useState } from 'react'
import Home from './pages/Home'
import Servers from './pages/Servers'
import Settings from './pages/Settings'

type Tab = 'home' | 'servers' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'servers', label: 'Servers' },
  { id: 'settings', label: 'Settings' }
]

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">CS 1.6</div>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`nav-item${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'home' && <Home />}
        {tab === 'servers' && <Servers />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  )
}
