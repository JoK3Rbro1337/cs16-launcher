import { useEffect, useState } from 'react'
import type { SteamDetectResult } from '../../electron/modules/steam-detect'
import type { BuildProfile, ContentManifest } from '../../electron/modules/content-sync'
import type { LocalVariantSnapshot, UpdatePreview } from '../../electron/modules/local-config-variant'
import {
  BUILD_PROFILE_KEY,
  MANIFEST_URL_KEY,
  SECTION_COLLAPSE_KEY,
  loadJSON,
  saveJSON
} from '../lib/storage'
import { CONFIG_SLOT_ID, LOCAL_VARIANT_ID } from '../lib/configVariant'
import { useToast } from '../lib/toast'
import { useT } from '../lib/i18n'
import ConfirmModal from '../components/ConfirmModal'
import LaunchOptionsNotice from '../components/LaunchOptionsNotice'

interface SkinItem {
  id: string
  name: string
  isLocal?: boolean
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
  return manifest.slots.map((slot) => {
    const items: SkinItem[] = slot.variants.map((variant) => ({ id: variant.id, name: variant.label }))
    // "My Config" is client-only and always leads the config slot's items,
    // so it's both the default selection (reconcileProfile picks items[0]
    // for an unset/stale choice) and never shadowed by a manifest variant.
    if (slot.id === CONFIG_SLOT_ID) {
      items.unshift({ id: LOCAL_VARIANT_ID, name: 'My Config', isLocal: true })
    }
    return { id: slot.id, label: slot.label, items }
  })
}

function manifestToFeatures(manifest: ContentManifest): Feature[] {
  return manifest.features.map((feature) => ({ id: feature.id, label: feature.label }))
}

function formatSnapshotDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
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
  const t = useT()
  const { pushToast } = useToast()
  const [detection, setDetection] = useState<SteamDetectResult | 'loading' | 'error'>('loading')
  const [profile, setProfile] = useState<BuildProfile>(() => loadJSON(BUILD_PROFILE_KEY, emptyProfile()))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    loadJSON(SECTION_COLLAPSE_KEY, defaultCollapsed(PLACEHOLDER_CATEGORIES))
  )

  const [manifestUrl] = useState(() => localStorage.getItem(MANIFEST_URL_KEY) ?? '')
  const [manifest, setManifest] = useState<ContentManifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)

  const [localVariant, setLocalVariant] = useState<LocalVariantSnapshot | null>(null)
  const [localVariantChecked, setLocalVariantChecked] = useState(false)
  const [updatePreview, setUpdatePreview] = useState<UpdatePreview | null>(null)
  const [updatingSnapshot, setUpdatingSnapshot] = useState(false)

  const usingManifest = manifestUrl !== '' && manifest !== null
  const categories = usingManifest ? manifestToCategories(manifest) : PLACEHOLDER_CATEGORIES
  const features = usingManifest ? manifestToFeatures(manifest) : PLACEHOLDER_FEATURES
  const hasConfigSlot = categories.some((category) => category.id === CONFIG_SLOT_ID)

  useEffect(() => {
    window.launcher
      .detectSteam()
      .then(setDetection)
      .catch(() => setDetection('error'))
  }, [])

  // First render of the config slot: auto-snapshot the player's existing
  // config.cfg into "My Config", if one exists and nothing's been snapshotted
  // yet. ensureLocalConfigVariant is idempotent, so this is safe to re-run.
  useEffect(() => {
    if (!hasConfigSlot || localVariantChecked) return
    window.launcher
      .ensureLocalConfigVariant()
      .then((snapshot) => {
        setLocalVariant(snapshot)
        setLocalVariantChecked(true)
      })
      .catch(() => setLocalVariantChecked(true))
  }, [hasConfigSlot, localVariantChecked])

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

  async function handleRequestUpdateSnapshot(): Promise<void> {
    try {
      const preview = await window.launcher.previewUpdateLocalConfigVariant()
      if (!preview.configCfgFound) {
        pushToast(t.content.configNotFoundToast)
        return
      }
      setUpdatePreview(preview)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleConfirmUpdateSnapshot(): Promise<void> {
    setUpdatingSnapshot(true)
    try {
      const snapshot = await window.launcher.commitUpdateLocalConfigVariant()
      setLocalVariant(snapshot)
      pushToast(t.content.snapshotUpdatedToast, 'ok')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingSnapshot(false)
      setUpdatePreview(null)
    }
  }

  return (
    <section className="page">
      <h1>{t.content.title}</h1>

      {manifestUrl && manifestError && <p className="note">{t.content.manifestLoadError(manifestError)}</p>}

      {hasConfigSlot && <LaunchOptionsNotice />}

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
                    className={`item-card${selected ? ' selected' : ''}${item.isLocal ? ' item-card-local' : ''}`}
                    onClick={() => selectItem(category.id, item.id)}
                  >
                    {item.isLocal && <span className="item-badge-local">{t.content.localBadge}</span>}
                    <div className="item-thumb" />
                    <span className="item-name">{item.name}</span>
                  </button>
                )
              })}
            </div>

            {category.id === CONFIG_SLOT_ID && profile.selections[category.id] === LOCAL_VARIANT_ID && (
              <div className="my-config-panel">
                {localVariant ? (
                  <p className="my-config-panel-meta">
                    {t.content.snapshotTaken(formatSnapshotDate(localVariant.updatedAt))}
                    {localVariant.strippedCount > 0 && ` · ${t.content.strippedLines(localVariant.strippedCount)}`}
                  </p>
                ) : (
                  <p className="my-config-panel-meta muted">
                    {localVariantChecked ? t.content.noConfigYet : t.content.checkingConfig}
                  </p>
                )}
                <button className="cp-btn-secondary" onClick={handleRequestUpdateSnapshot}>
                  {t.content.updateSnapshot}
                </button>
              </div>
            )}
          </CollapsibleSection>
        ))}
      </div>

      {updatePreview && (
        <ConfirmModal
          title={t.content.updateSnapshotModalTitle}
          message={
            updatePreview.hasSnapshot
              ? t.content.updateSnapshotModalMessageChanged(updatePreview.changedLines)
              : t.content.updateSnapshotModalMessageFirst
          }
          confirmLabel={updatingSnapshot ? t.content.updateSnapshotConfirming : t.content.updateSnapshotConfirm}
          onConfirm={handleConfirmUpdateSnapshot}
          onCancel={() => setUpdatePreview(null)}
        />
      )}

      {!usingManifest && <p className="note">{t.content.noManifestNote}</p>}

      <h2>{t.content.featuresHeading}</h2>
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
        title={t.content.systemHeading}
        collapsed={collapsed.system ?? true}
        onToggle={() => toggleSection('system')}
      >
        {detection === 'loading' && <p className="muted">{t.content.detectingSteam}</p>}
        {detection === 'error' && <p className="muted">{t.content.steamDetectionFailed}</p>}
        {detection !== 'loading' && detection !== 'error' && (
          <dl className="detect-result">
            <dt>{t.content.steamPath}</dt>
            <dd>{detection.steamPath ?? t.content.notFound}</dd>
            <dt>{t.content.gamePath}</dt>
            <dd>{detection.gamePath ?? t.content.notFound}</dd>
            <dt>{t.content.installed}</dt>
            <dd>{detection.installed ? t.content.yes : t.content.no}</dd>
          </dl>
        )}
      </CollapsibleSection>
    </section>
  )
}
