import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  FolderOpen,
  Home as HomeIcon,
  Search,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Wand2,
  type LucideIcon
} from 'lucide-react'
import type { FavoriteServer, GameServer } from '../../electron/modules/server-browser'
import type { Tab } from './Sidebar'
import { FAVORITES_KEY, getReduceMotion, loadJSON, setReduceMotion } from '../lib/storage'
import { getKnownServers } from '../lib/serverListStore'
import { requestVerify } from '../lib/verifyRequest'
import { useToast } from '../lib/toast'
import { useT } from '../lib/i18n'
import type { Messages } from '../lib/i18n'

interface Action {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  run: () => void | Promise<void>
}

function serverKey(s: { ip: string; port: number }): string {
  return `${s.ip}:${s.port}`
}

function buildConnectActions(t: Messages, pushToast: (msg: string) => void): Action[] {
  const favorites = loadJSON<FavoriteServer[]>(FAVORITES_KEY, [])
  const known = getKnownServers()
  const byKey = new Map<string, { ip: string; port: number; name?: string; map?: string }>()

  for (const f of favorites) byKey.set(serverKey(f), { ip: f.ip, port: f.port })
  for (const s of known as GameServer[]) {
    byKey.set(serverKey(s), { ip: s.ip, port: s.port, name: s.name, map: s.map })
  }

  return [...byKey.values()].map((s) => ({
    id: `connect:${serverKey(s)}`,
    label: t.commandPalette.connectTo(s.name ?? serverKey(s)),
    hint: s.map ?? serverKey(s),
    icon: Server,
    run: async () => {
      try {
        await window.launcher.connect(s.ip, s.port)
      } catch (err) {
        pushToast(err instanceof Error ? err.message : String(err))
      }
    }
  }))
}

export default function CommandPalette({
  tab,
  onNavigate
}: {
  tab: Tab
  onNavigate: (tab: Tab) => void
}): React.JSX.Element | null {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { pushToast } = useToast()

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const actions = useMemo<Action[]>(() => {
    if (!open) return []
    const reduceMotion = getReduceMotion()
    const nav: Action[] = [
      { id: 'nav:home', label: t.commandPalette.goToHome, hint: t.commandPalette.hintScreen, icon: HomeIcon, run: () => onNavigate('home') },
      { id: 'nav:servers', label: t.commandPalette.goToServers, hint: t.commandPalette.hintScreen, icon: Server, run: () => onNavigate('servers') },
      { id: 'nav:content', label: t.commandPalette.goToContent, hint: t.commandPalette.hintScreen, icon: Boxes, run: () => onNavigate('content') },
      {
        id: 'nav:cfgbuilder',
        label: t.commandPalette.goToCfgBuilder,
        hint: t.commandPalette.hintScreen,
        icon: SlidersHorizontal,
        run: () => onNavigate('cfgbuilder')
      },
      { id: 'nav:settings', label: t.commandPalette.goToSettings, hint: t.commandPalette.hintScreen, icon: SettingsIcon, run: () => onNavigate('settings') }
    ].filter((a) => a.id !== `nav:${tab}`)

    const toggles: Action[] = [
      {
        id: 'toggle:reduce-motion',
        label: reduceMotion ? t.commandPalette.toggleReduceMotionOff : t.commandPalette.toggleReduceMotionOn,
        hint: t.commandPalette.hintSetting,
        icon: Wand2,
        run: () => setReduceMotion(!reduceMotion)
      }
    ]

    const folders: Action[] = [
      {
        id: 'folder:game',
        label: t.commandPalette.openGameFolder,
        hint: t.commandPalette.hintFolder,
        icon: FolderOpen,
        run: async () => {
          try {
            await window.launcher.openGameFolder()
          } catch (err) {
            pushToast(err instanceof Error ? err.message : String(err))
          }
        }
      },
      {
        id: 'folder:backup',
        label: t.commandPalette.openBackupFolder,
        hint: t.commandPalette.hintFolder,
        icon: FolderOpen,
        run: async () => {
          try {
            await window.launcher.openBackupFolder()
          } catch (err) {
            pushToast(err instanceof Error ? err.message : String(err))
          }
        }
      }
    ]

    const verify: Action[] = [
      {
        id: 'verify-files',
        label: t.commandPalette.verifyFiles,
        hint: t.commandPalette.verifyFilesHint,
        icon: ShieldCheck,
        run: () => {
          onNavigate('settings')
          requestVerify()
        }
      }
    ]

    return [...buildConnectActions(t, pushToast), ...nav, ...verify, ...toggles, ...folders]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q))
  }, [actions, query])

  function close(): void {
    setOpen(false)
  }

  function runAction(action: Action): void {
    close()
    action.run()
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = filtered[selected]
      if (action) runAction(action)
    }
  }

  if (!open) return null

  return (
    <div className="palette-overlay" onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-search">
          <Search size={14} />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder={t.commandPalette.placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={onInputKeyDown}
          />
        </div>
        <div className="palette-list">
          {filtered.length === 0 && <p className="palette-empty">{t.commandPalette.empty}</p>}
          {filtered.map((action, i) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                className={`palette-item${i === selected ? ' selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => runAction(action)}
              >
                <span className="palette-item-label">
                  <Icon size={14} />
                  {action.label}
                </span>
                <span className="palette-item-hint">{action.hint}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
