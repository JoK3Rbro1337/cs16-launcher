import { useEffect, useState } from 'react'
import type { SteamDetectResult } from '../../electron/modules/steam-detect'

interface SkinItem {
  id: string
  name: string
}

interface SkinCategory {
  id: string
  label: string
  items: SkinItem[]
}

interface Feature {
  id: string
  label: string
}

interface BuildProfile {
  /** categoryId -> selected itemId */
  selections: Record<string, string>
  /** featureId -> enabled */
  features: Record<string, boolean>
}

// Placeholder content — categories/items/thumbnails here are mocked until a
// real content pack is wired in (see the note in the page below).
const CATEGORIES: SkinCategory[] = [
  {
    id: 'standard',
    label: 'Standard',
    items: [
      { id: 'std-deagle', name: 'Desert Eagle' },
      { id: 'std-ak47', name: 'AK-47' },
      { id: 'std-m4a1', name: 'M4A1' },
      { id: 'std-awp', name: 'AWP' },
      { id: 'std-usp', name: 'USP' },
      { id: 'std-mp5', name: 'MP5' }
    ]
  },
  {
    id: 'knives',
    label: 'Knives',
    items: [
      { id: 'knife-karambit', name: 'Karambit' },
      { id: 'knife-butterfly', name: 'Butterfly' },
      { id: 'knife-bayonet', name: 'Bayonet' },
      { id: 'knife-falchion', name: 'Falchion' },
      { id: 'knife-bowie', name: 'Bowie' }
    ]
  },
  {
    id: 'build1',
    label: 'Build #1',
    items: [
      { id: 'b1-deagle', name: 'Desert Eagle' },
      { id: 'b1-ak47', name: 'AK-47' },
      { id: 'b1-m4a1', name: 'M4A1' },
      { id: 'b1-awp', name: 'AWP' },
      { id: 'b1-mp5', name: 'MP5' }
    ]
  },
  {
    id: 'build2',
    label: 'Build #2',
    items: [
      { id: 'b2-deagle', name: 'Desert Eagle' },
      { id: 'b2-ak47', name: 'AK-47' },
      { id: 'b2-awp', name: 'AWP' },
      { id: 'b2-karambit', name: 'Karambit' },
      { id: 'b2-usp', name: 'USP' }
    ]
  }
]

const FEATURES: Feature[] = [
  { id: 'csgo-hud', label: 'CS:GO HUD' },
  { id: 'ru-voiceover', label: 'Russian voiceover' },
  { id: 'csgo-awp-crosshair', label: 'CS:GO AWP crosshair' }
]

const PROFILE_KEY = 'cs16-build-profile'
const COLLAPSE_KEY = 'cs16-section-collapsed'

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function defaultProfile(): BuildProfile {
  const selections: Record<string, string> = {}
  for (const category of CATEGORIES) selections[category.id] = category.items[0].id
  const features: Record<string, boolean> = {}
  for (const feature of FEATURES) features[feature.id] = false
  return { selections, features }
}

function defaultCollapsed(): Record<string, boolean> {
  const state: Record<string, boolean> = { system: true }
  for (const category of CATEGORIES) state[category.id] = false
  return state
}

function CollapsibleSection({
  title,
  collapsed,
  onToggle,
  children
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="collapsible">
      <button className="collapsible-header" onClick={onToggle}>
        <span className={`chevron${collapsed ? '' : ' open'}`}>▸</span>
        <span>{title}</span>
      </button>
      {!collapsed && <div className="collapsible-body">{children}</div>}
    </div>
  )
}

export default function Home(): React.JSX.Element {
  const [detection, setDetection] = useState<SteamDetectResult | 'loading' | 'error'>('loading')
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [profile, setProfile] = useState<BuildProfile>(() => loadJSON(PROFILE_KEY, defaultProfile()))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    loadJSON(COLLAPSE_KEY, defaultCollapsed())
  )

  useEffect(() => {
    window.launcher
      .detectSteam()
      .then(setDetection)
      .catch(() => setDetection('error'))
  }, [])

  const installed = detection !== 'loading' && detection !== 'error' && detection.installed

  async function handlePlay(): Promise<void> {
    setLaunchError(null)
    try {
      await window.launcher.play()
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : String(err))
    }
  }

  function selectItem(categoryId: string, itemId: string): void {
    setProfile((prev) => {
      const next = { ...prev, selections: { ...prev.selections, [categoryId]: itemId } }
      saveJSON(PROFILE_KEY, next)
      return next
    })
  }

  function toggleFeature(featureId: string): void {
    setProfile((prev) => {
      const next = {
        ...prev,
        features: { ...prev.features, [featureId]: !prev.features[featureId] }
      }
      saveJSON(PROFILE_KEY, next)
      return next
    })
  }

  function toggleSection(sectionId: string): void {
    setCollapsed((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] }
      saveJSON(COLLAPSE_KEY, next)
      return next
    })
  }

  return (
    <section className="page build-page">
      <h1>Build</h1>

      <div className="category-list">
        {CATEGORIES.map((category) => (
          <CollapsibleSection
            key={category.id}
            title={category.label}
            collapsed={collapsed[category.id] ?? false}
            onToggle={() => toggleSection(category.id)}
          >
            <div className="item-grid">
              {category.items.map((item) => {
                const selected = (profile.selections[category.id] ?? category.items[0].id) === item.id
                return (
                  <button
                    key={item.id}
                    className={`item-card${selected ? ' selected' : ''}`}
                    onClick={() => selectItem(category.id, item.id)}
                  >
                    <div className="item-thumb" />
                    <span className="item-name">{item.name}</span>
                  </button>
                )
              })}
            </div>
          </CollapsibleSection>
        ))}
      </div>

      <p className="muted note">Content selection will apply after content-pack integration.</p>

      <h2>Features</h2>
      <div className="feature-pills">
        {FEATURES.map((feature) => (
          <button
            key={feature.id}
            className={`pill${profile.features[feature.id] ? ' active' : ''}`}
            onClick={() => toggleFeature(feature.id)}
          >
            {feature.label}
          </button>
        ))}
      </div>

      <CollapsibleSection
        title="System"
        collapsed={collapsed.system ?? true}
        onToggle={() => toggleSection('system')}
      >
        {detection === 'loading' && <p className="muted">Detecting Steam…</p>}
        {detection === 'error' && <p className="muted">Steam detection failed.</p>}
        {detection !== 'loading' && detection !== 'error' && (
          <dl className="detect-result">
            <dt>Steam path</dt>
            <dd>{detection.steamPath ?? 'not found'}</dd>
            <dt>Game path</dt>
            <dd>{detection.gamePath ?? 'not found'}</dd>
            <dt>Installed</dt>
            <dd>{detection.installed ? 'yes' : 'no'}</dd>
          </dl>
        )}
      </CollapsibleSection>

      <div className="play-dock">
        {launchError && <p className="error">{launchError}</p>}
        <button className="play-button" disabled={!installed} onClick={handlePlay}>
          PLAY
        </button>
      </div>
    </section>
  )
}
