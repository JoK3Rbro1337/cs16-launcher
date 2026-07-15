import { useState } from 'react'
import Home from './pages/Home'
import Servers from './pages/Servers'
import Content from './pages/Content'
import Settings from './pages/Settings'
import TitleBar from './components/TitleBar'
import Sidebar, { type Tab } from './components/Sidebar'

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar tab={tab} onSelect={setTab} />
        <main className="content">
          {tab === 'home' && <Home />}
          {tab === 'servers' && <Servers />}
          {tab === 'content' && <Content />}
          {tab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  )
}
