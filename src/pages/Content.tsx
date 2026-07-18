import { useEffect, useState } from 'react'
import type { SteamDetectResult } from '../../electron/modules/steam-detect'
import type { BuildProfile, ContentManifest } from '../../electron/modules/content-sync'
import {
  BUILD_PROFILE_KEY,
  MANIFEST_URL_KEY,
  SECTION_COLLAPSE_KEY,
  loadJSON,
  saveJSON
} from '../lib/storage'

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

// Placeholder content, used until a manifest URL is configured in Settings
// (or if fetching it fails) — see the note rendered below the grid.
const PLACEHOLDER_CATEGORIES: SkinCategory[] = [
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

const PLACEHOLDER_FEATURES: Feature[] = [
  { id: 'csgo-hud', label: 'CS:GO HUD' },
  { id: 'ru-voiceover', label: 'Russian voiceover' },
  { id: 'csgo-awp-crosshair', label: 'CS:GO AWP crosshair' }
]

function emptyProfile(): BuildProfile {
  return { selections: {}, features: {} }
}

function defaultCollapsed(categories: SkinCategory[]): Record<string, boolean> {
  const state: Record<string, boolean> = { system: true }
  for (const category of categories) state[category.id] = false
  return state
}

/**
 * Fills in a selection for any slot that doesn't have one yet (or whose
 * stored selection no longer exists) and a false default for any new
 * feature — without touching selections/toggles the user already made, so
 * a manifest re-fetch never silently resets an existing choice.
 */
function reconcileProfile(profile: BuildProfile, categories: SkinCategory[], features: Feature[]): BuildProfile {
  const selections = { ...profile.selections }
  for (const category of categories) {
    const current = selections[category.id]
    const stillValid = category.items.some((item) => item.id === current)
    if (!stillValid && category.items.length > 0) selections[category.id] = category.items[0].id
  }
  const featureState = { ...profile.features }
  for (const feature of features) {
    if (!(feature.id in featureState)) featureState[feature.id] = false
  }
  return { selections, features: featureState }
}

function manifestToCategories(manifest: ContentManifest): SkinCategory[] {
  return manifest.slots.map((slot) => ({
    id: slot.id,
    label: slot.label,
    items: slot.variants.map((variant) => ({ id: variant.id, name: variant.label }))
  }))
}

function manifestToFeatures(manifest: ContentManifest): Feature[] {
  return manifest.features.map((feature) => ({ id: feature.id, label: feature.label }))
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

export default function Content(): React.JSX.Element {
  const [detection, setDetection] = useState<SteamDetectResult | 'loading' | 'error'>('loading')
  const [profile, setProfile] = useState<BuildProfile>(() => loadJSON(BUILD_PROFILE_KEY, emptyProfile()))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    loadJSON(SECTION_COLLAPSE_KEY, defaultCollapsed(PLACEHOLDER_CATEGORIES))
  )

  const [manifestUrl] = useState(() => localStorage.getItem(MANIFEST_URL_KEY) ?? '')
  const [manifest, setManifest] = useState<ContentManifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)

  const usingManifest = manifestUrl !== '' && manifest !== null
  const categories = usingManifest ? manifestToCategories(manifest) : PLACEHOLDER_CATEGORIES
  const features = usingManifest ? manifestToFeatures(manifest) : PLACEHOLDER_FEATURES

  useEffect(() => {
    window.launcher
      .detectSteam()
      .then(setDetection)
      .catch(() => setDetection('error'))
  }, [])

  useEffect(() => {
    if (!manifestUrl) return
    window.launcher
      .fetchManifest(manifestUrl)
      .then((m) => {
        setManifest(m)
        setManifestError(null)
      })
      .catch((err) => {
        setManifest(null)
        setManifestError(err instanceof Error ? err.message : String(err))
      })
  }, [manifestUrl])

  // Fill in defaults for slots/features that don't have a stored choice yet
  // (new manifest, or first run) without clobbering existing selections.
  useEffect(() => {
    setProfile((prev) => {
      const next = reconcileProfile(prev, categories, features)
      if (JSON.stringify(next) !== JSON.stringify(prev)) saveJSON(BUILD_PROFILE_KEY, next)
      return next
    })
  }, [categories.length, features.length, usingManifest])

  function selectItem(categoryId: string, itemId: string): void {
    setProfile((prev) => {
      const next = { ...prev, selections: { ...prev.selections, [categoryId]: itemId } }
      saveJSON(BUILD_PROFILE_KEY, next)
      return next
    })
  }

  function toggleFeature(featureId: string): void {
    setProfile((prev) => {
      const next = {
        ...prev,
        features: { ...prev.features, [featureId]: !prev.features[featureId] }
      }
      saveJSON(BUILD_PROFILE_KEY, next)
      return next
    })
  }

  function toggleSection(sectionId: string): void {
    setCollapsed((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] }
      saveJSON(SECTION_COLLAPSE_KEY, next)
      return next
    })
  }

  return (
    <section className="page">
      <h1>Content</h1>

      {manifestUrl && manifestError && (
        <p className="note">Couldn't load the content pack ({manifestError}) — showing placeholder content.</p>
      )}

      <div className="category-list">
        {categories.map((category) => (
          <CollapsibleSection
            key={category.id}
            title={category.label}
            collapsed={collapsed[category.id] ?? false}
            onToggle={() => toggleSection(category.id)}
          >
            <div className="item-grid">
              {category.items.map((item) => {
                const selected = profile.selections[category.id] === item.id
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

      {!usingManifest && <p className="note">Content selection will apply after content-pack integration.</p>}

      <h2>Features</h2>
      <div className="filter-chips content-features">
        {features.map((feature) => (
          <button
            key={feature.id}
            className={`filter-chip${profile.features[feature.id] ? ' active' : ''}`}
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
    </section>
  )
}
