import { useEffect, useState } from 'react'
import { Copy, Plus, X } from 'lucide-react'
import type {
  CfgBuilderSettings,
  CfgBuilderStatus,
  CfgBuilderNumberKey,
  CfgBuilderBoolKey,
  BindActionId,
  CustomBind,
  ConfigScanResult
} from '../../electron/modules/cfg-builder'
import type { ContentManifest, ManifestVariant } from '../../electron/modules/content-sync'
import { CONFIG_SLOT_ID } from '../lib/configVariant'
import { MANIFEST_URL_KEY, CFG_BUILDER_SECTION_COLLAPSE_KEY, loadJSON, saveJSON } from '../lib/storage'
import { useT } from '../lib/i18n'
import type { Messages } from '../lib/i18n'
import { useToast } from '../lib/toast'
import ConfigScanModal from '../components/ConfigScanModal'
import NativeCrosshairEditor from '../components/NativeCrosshairEditor'

/**
 * Field catalogs below mirror electron/modules/cfg-builder-settings.ts's
 * NUMBER_FIELDS/BOOL_FIELDS/BIND_ACTIONS — duplicated rather than imported as
 * a value, same "renderer only pulls types from electron/modules" convention
 * used throughout this codebase (see Settings.tsx's crosshair constants).
 * Every field's label/description lives in locales/*.ts's cfgBuilder
 * namespace under `${key}Label`/`${key}Desc` — see fieldLabel/fieldDesc.
 */
interface NumberFieldDef {
  key: CfgBuilderNumberKey
  min: number
  max: number
  step: number
  advisoryMin?: number
  advisoryMax?: number
}

const MOUSE_NUMBER_FIELDS: NumberFieldDef[] = [
  { key: 'sensitivity', min: 0.01, max: 50, step: 0.1 },
  { key: 'zoom_sensitivity_ratio', min: 0.1, max: 5, step: 0.1 }
]
const MOUSE_BOOL_FIELDS: CfgBuilderBoolKey[] = ['m_filter', 'm_customaccel']

const NETWORK_NUMBER_FIELDS: NumberFieldDef[] = [
  { key: 'rate', min: 0, max: 100000, step: 1000, advisoryMin: 20000 },
  { key: 'cl_updaterate', min: 0, max: 102, step: 1 },
  { key: 'cl_cmdrate', min: 0, max: 105, step: 1 },
  { key: 'ex_interp', min: 0.01, max: 0.1, step: 0.001 },
  { key: 'cl_cmdbackup', min: 0, max: 90, step: 1 },
  { key: 'cl_timeout', min: 5, max: 300, step: 5 }
]
const NETWORK_BOOL_FIELDS: CfgBuilderBoolKey[] = ['cl_lc', 'cl_lw', 'cl_predict']

const VIDEO_NUMBER_FIELDS: NumberFieldDef[] = [
  { key: 'fps_max', min: 1, max: 1000, step: 1, advisoryMax: 300 },
  { key: 'gl_picmip', min: 0, max: 4, step: 1 },
  { key: 'gamma', min: 0.1, max: 5, step: 0.1 },
  { key: 'brightness', min: 0, max: 5, step: 0.1 },
  { key: 'r_decals', min: 0, max: 4096, step: 50 }
]
const VIDEO_BOOL_FIELDS: CfgBuilderBoolKey[] = ['gl_vsync', 'cl_minmodels', 'cl_weather']

const AUDIO_NUMBER_FIELDS: NumberFieldDef[] = [
  { key: 'volume', min: 0, max: 1, step: 0.05 },
  { key: 'bgmvolume', min: 0, max: 1, step: 0.05 },
  { key: 'mp3volume', min: 0, max: 1, step: 0.05 },
  { key: 'suitvolume', min: 0, max: 1, step: 0.05 }
]
const AUDIO_BOOL_FIELDS: CfgBuilderBoolKey[] = ['hisound']

const HUD_BOOL_FIELDS: CfgBuilderBoolKey[] = ['hud_fastswitch', 'hud_centerid', 'cl_righthand', 'cl_radartype']

interface BindActionDef {
  id: BindActionId
  group: 'movement' | 'action' | 'buy'
}

const BIND_ACTIONS: BindActionDef[] = [
  { id: 'moveForward', group: 'movement' },
  { id: 'moveBack', group: 'movement' },
  { id: 'moveLeft', group: 'movement' },
  { id: 'moveRight', group: 'movement' },
  { id: 'jump', group: 'movement' },
  { id: 'duck', group: 'movement' },
  { id: 'walk', group: 'movement' },
  { id: 'use', group: 'action' },
  { id: 'attack', group: 'action' },
  { id: 'attack2', group: 'action' },
  { id: 'reload', group: 'action' },
  { id: 'buyMenu', group: 'buy' },
  { id: 'autobuy', group: 'buy' },
  { id: 'rebuy', group: 'buy' },
  { id: 'buyAmmoPrimary', group: 'buy' },
  { id: 'buyAmmoSecondary', group: 'buy' }
]

const KEY_NAME_RE = /^[a-z0-9_]{1,20}$/

function fieldLabel(t: Messages, key: string): string {
  return (t.cfgBuilder as unknown as Record<string, string>)[`${key}Label`] ?? key
}
function fieldDesc(t: Messages, key: string): string {
  return (t.cfgBuilder as unknown as Record<string, string>)[`${key}Desc`] ?? ''
}

function advisoryHint(t: Messages, def: NumberFieldDef, value: number): string | null {
  if (def.advisoryMin !== undefined && value < def.advisoryMin) return t.cfgBuilder.rateLowAdvisoryHint
  if (def.advisoryMax !== undefined && value > def.advisoryMax) return t.cfgBuilder.fps_maxHighAdvisoryHint
  return null
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

function ChangedDot({ shown, t }: { shown: boolean; t: Messages }): React.JSX.Element | null {
  if (!shown) return null
  return <span className="cfg-field-changed-dot" title={t.cfgBuilder.changedFromBaseTitle} />
}

function NumberFieldRow({
  t,
  def,
  value,
  changed,
  onChange
}: {
  t: Messages
  def: NumberFieldDef
  value: number
  changed: boolean
  onChange: (v: number) => void
}): React.JSX.Element {
  const hint = advisoryHint(t, def, value)
  return (
    <div className="settings-row cfg-field-row">
      <div>
        <p className="settings-row-label">
          <ChangedDot shown={changed} t={t} /> {fieldLabel(t, def.key)} <span className="mono cfg-field-cvar">{def.key}</span>
        </p>
        <p className="settings-row-desc">{fieldDesc(t, def.key)}</p>
        {hint && <p className="settings-row-desc cfg-field-advisory">{hint}</p>}
      </div>
      <input
        type="number"
        className="cp-input cfg-number-input"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function BoolFieldRow({
  t,
  fieldKey,
  value,
  changed,
  onChange
}: {
  t: Messages
  fieldKey: CfgBuilderBoolKey
  value: boolean
  changed: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className="settings-row cfg-field-row">
      <div>
        <p className="settings-row-label">
          <ChangedDot shown={changed} t={t} /> {fieldLabel(t, fieldKey)} <span className="mono cfg-field-cvar">{fieldKey}</span>
        </p>
        <p className="settings-row-desc">{fieldDesc(t, fieldKey)}</p>
      </div>
      <button
        className={`toggle-switch${value ? ' on' : ''}`}
        role="switch"
        aria-checked={value}
        aria-label={fieldLabel(t, fieldKey)}
        onClick={() => onChange(!value)}
      >
        <span className="toggle-switch-thumb" />
      </button>
    </div>
  )
}

export default function CfgBuilder(): React.JSX.Element {
  const t = useT()
  const { pushToast } = useToast()

  const [status, setStatus] = useState<CfgBuilderStatus | null>(null)
  const [scan, setScan] = useState<ConfigScanResult | null>(null)
  const [previewText, setPreviewText] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    loadJSON(CFG_BUILDER_SECTION_COLLAPSE_KEY, { presets: false, mouse: false, network: true, video: true, audio: true, hud: true, binds: true, output: false })
  )

  const [manifestUrl] = useState(() => localStorage.getItem(MANIFEST_URL_KEY) ?? '')
  const [manifest, setManifest] = useState<ContentManifest | null>(null)
  const [presetLoadingId, setPresetLoadingId] = useState<string | null>(null)

  // Local edit buffer for custom binds — kept separate from `status.settings.customBinds`
  // (the server-sanitized, scan-relevant copy) because sanitize silently drops an
  // empty/invalid row, which would make a just-added blank row vanish out from under
  // the player before they finish typing it. Re-seeded on mount and whenever settings
  // are bulk-replaced (preset load / reset), never on a per-field settings round-trip.
  const [customBinds, setCustomBinds] = useState<CustomBind[]>([])

  const [applying, setApplying] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [blockedResult, setBlockedResult] = useState<ConfigScanResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    refreshAll()
  }, [])

  useEffect(() => {
    if (!manifestUrl) return
    window.launcher
      .fetchManifest(manifestUrl)
      .then(setManifest)
      .catch(() => setManifest(null))
  }, [manifestUrl])

  async function refreshAll(): Promise<void> {
    const [s, sc, text] = await Promise.all([
      window.launcher.getCfgBuilderStatus(),
      window.launcher.scanCfgBuilder(),
      window.launcher.previewCfgBuilderText()
    ])
    setStatus(s)
    setScan(sc)
    setPreviewText(text)
    setCustomBinds(s.settings.customBinds)
  }

  /** Applies a status returned by an update/load/reset call without re-seeding customBinds — see the comment on that state. */
  async function applyStatus(s: CfgBuilderStatus, reseedCustomBinds: boolean): Promise<void> {
    setStatus(s)
    if (reseedCustomBinds) setCustomBinds(s.settings.customBinds)
    const [sc, text] = await Promise.all([window.launcher.scanCfgBuilder(), window.launcher.previewCfgBuilderText()])
    setScan(sc)
    setPreviewText(text)
  }

  async function update(partial: Partial<CfgBuilderSettings>): Promise<void> {
    const s = await window.launcher.updateCfgBuilderSettings(partial)
    await applyStatus(s, false)
  }

  function toggleSection(id: string): void {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      saveJSON(CFG_BUILDER_SECTION_COLLAPSE_KEY, next)
      return next
    })
  }

  async function loadPreset(variant: ManifestVariant): Promise<void> {
    setPresetLoadingId(variant.id)
    try {
      const s = await window.launcher.loadCfgBuilderPreset(variant.files, variant.label)
      await applyStatus(s, true)
    } catch {
      pushToast(t.cfgBuilder.presetsLoadFailedToast)
    } finally {
      setPresetLoadingId(null)
    }
  }

  async function resetToDefault(): Promise<void> {
    const s = await window.launcher.resetCfgBuilderToDefault()
    await applyStatus(s, true)
  }

  function commitCustomBinds(next: CustomBind[]): void {
    setCustomBinds(next)
    update({ customBinds: next })
  }

  function addCustomBind(): void {
    commitCustomBinds([...customBinds, { key: '', command: '' }])
  }

  function editCustomBind(index: number, patch: Partial<CustomBind>): void {
    commitCustomBinds(customBinds.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }

  function removeCustomBind(index: number): void {
    commitCustomBinds(customBinds.filter((_, i) => i !== index))
  }

  async function handleApply(): Promise<void> {
    setApplying(true)
    try {
      const result = await window.launcher.applyCfgBuilder()
      if (result.ok) {
        pushToast(t.cfgBuilder.applySuccessToast, 'ok')
        setBlockedResult(null)
        const s = await window.launcher.getCfgBuilderStatus()
        setStatus(s)
      } else {
        pushToast(t.cfgBuilder.applyBlockedMessage(result.scan.counts.critical))
        setBlockedResult(result.scan)
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  async function handleRemove(): Promise<void> {
    setRemoving(true)
    try {
      await window.launcher.removeCfgBuilderFromGame()
      pushToast(t.cfgBuilder.removeSuccessToast, 'ok')
      const s = await window.launcher.getCfgBuilderStatus()
      setStatus(s)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setRemoving(false)
    }
  }

  function handleCopy(): void {
    navigator.clipboard
      .writeText(previewText)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  async function handleSaveToFile(): Promise<void> {
    await window.launcher.exportCfgBuilderFile().catch(() => {})
  }

  const settings = status?.settings
  const changedSet = new Set(status?.changedKeys ?? [])
  const configSlot = manifest?.slots.find((s) => s.id === CONFIG_SLOT_ID)

  return (
    <section className="page">
      <h1>{t.cfgBuilder.title}</h1>
      <p className="note">{t.cfgBuilder.intro}</p>

      <CollapsibleSection title={t.cfgBuilder.sectionPresets} collapsed={collapsed.presets ?? false} onToggle={() => toggleSection('presets')}>
        <p className="settings-row-desc settings-section-intro">{t.cfgBuilder.presetsIntro}</p>
        {status?.base ? (
          <p className="settings-row-desc">
            {t.cfgBuilder.presetsBaseLabel(status.base.label)}
            {status.changedKeys.length > 0 && ` · ${t.cfgBuilder.presetsFieldsChanged(status.changedKeys.length)}`}
          </p>
        ) : (
          <p className="settings-row-desc muted">{t.cfgBuilder.presetsNoBase}</p>
        )}

        {!manifestUrl || !configSlot ? (
          <p className="note">{t.cfgBuilder.presetsNoManifest}</p>
        ) : (
          <div className="filter-chips">
            {configSlot.variants.map((variant) => (
              <button
                key={variant.id}
                className="filter-chip"
                disabled={presetLoadingId !== null}
                onClick={() => loadPreset(variant)}
              >
                {presetLoadingId === variant.id ? t.cfgBuilder.presetsLoading : variant.label}
              </button>
            ))}
          </div>
        )}

        <button className="cp-btn-secondary cfg-reset-btn" onClick={resetToDefault}>
          {t.cfgBuilder.presetsResetButton}
        </button>
      </CollapsibleSection>

      {settings && (
        <>
          <CollapsibleSection title={t.cfgBuilder.sectionMouse} collapsed={collapsed.mouse ?? false} onToggle={() => toggleSection('mouse')}>
            {MOUSE_NUMBER_FIELDS.map((def) => (
              <NumberFieldRow
                key={def.key}
                t={t}
                def={def}
                value={settings[def.key]}
                changed={changedSet.has(def.key)}
                onChange={(v) => update({ [def.key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
            {MOUSE_BOOL_FIELDS.map((key) => (
              <BoolFieldRow
                key={key}
                t={t}
                fieldKey={key}
                value={settings[key]}
                changed={changedSet.has(key)}
                onChange={(v) => update({ [key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title={t.cfgBuilder.sectionNetwork} collapsed={collapsed.network ?? true} onToggle={() => toggleSection('network')}>
            {NETWORK_NUMBER_FIELDS.map((def) => (
              <NumberFieldRow
                key={def.key}
                t={t}
                def={def}
                value={settings[def.key]}
                changed={changedSet.has(def.key)}
                onChange={(v) => update({ [def.key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
            {NETWORK_BOOL_FIELDS.map((key) => (
              <BoolFieldRow
                key={key}
                t={t}
                fieldKey={key}
                value={settings[key]}
                changed={changedSet.has(key)}
                onChange={(v) => update({ [key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title={t.cfgBuilder.sectionVideo} collapsed={collapsed.video ?? true} onToggle={() => toggleSection('video')}>
            {VIDEO_NUMBER_FIELDS.map((def) => (
              <NumberFieldRow
                key={def.key}
                t={t}
                def={def}
                value={settings[def.key]}
                changed={changedSet.has(def.key)}
                onChange={(v) => update({ [def.key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
            {VIDEO_BOOL_FIELDS.map((key) => (
              <BoolFieldRow
                key={key}
                t={t}
                fieldKey={key}
                value={settings[key]}
                changed={changedSet.has(key)}
                onChange={(v) => update({ [key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title={t.cfgBuilder.sectionAudio} collapsed={collapsed.audio ?? true} onToggle={() => toggleSection('audio')}>
            {AUDIO_NUMBER_FIELDS.map((def) => (
              <NumberFieldRow
                key={def.key}
                t={t}
                def={def}
                value={settings[def.key]}
                changed={changedSet.has(def.key)}
                onChange={(v) => update({ [def.key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
            {AUDIO_BOOL_FIELDS.map((key) => (
              <BoolFieldRow
                key={key}
                t={t}
                fieldKey={key}
                value={settings[key]}
                changed={changedSet.has(key)}
                onChange={(v) => update({ [key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title={t.cfgBuilder.sectionHud} collapsed={collapsed.hud ?? true} onToggle={() => toggleSection('hud')}>
            {HUD_BOOL_FIELDS.map((key) => (
              <BoolFieldRow
                key={key}
                t={t}
                fieldKey={key}
                value={settings[key]}
                changed={changedSet.has(key)}
                onChange={(v) => update({ [key]: v } as Partial<CfgBuilderSettings>)}
              />
            ))}
            <p className="settings-row-desc settings-section-intro">{t.cfgBuilder.crosshairIntro}</p>
            <NativeCrosshairEditor />
          </CollapsibleSection>

          <CollapsibleSection title={t.cfgBuilder.sectionBinds} collapsed={collapsed.binds ?? true} onToggle={() => toggleSection('binds')}>
            <p className="settings-row-desc settings-section-intro">{t.cfgBuilder.bindsIntro}</p>

            {(['movement', 'action', 'buy'] as const).map((group) => (
              <div key={group} className="cfg-bind-group">
                <p className="cfg-bind-group-heading">
                  {group === 'movement' ? t.cfgBuilder.bindsMovementHeading : group === 'action' ? t.cfgBuilder.bindsActionHeading : t.cfgBuilder.bindsBuyHeading}
                </p>
                {BIND_ACTIONS.filter((a) => a.group === group).map((action) => (
                  <div key={action.id} className="settings-row cfg-bind-row">
                    <p className="settings-row-label">
                      <ChangedDot shown={changedSet.has(`bind:${action.id}`)} t={t} /> {fieldLabel(t, action.id)}
                    </p>
                    <input
                      type="text"
                      className="cp-input cfg-bind-key-input mono"
                      placeholder={t.cfgBuilder.bindKeyPlaceholder}
                      value={settings.binds[action.id]}
                      onChange={(e) => update({ binds: { ...settings.binds, [action.id]: e.target.value.toLowerCase() } })}
                    />
                  </div>
                ))}
              </div>
            ))}

            <div className="cfg-bind-group">
              <p className="cfg-bind-group-heading">{t.cfgBuilder.bindsCustomHeading}</p>
              <p className="settings-row-desc">{t.cfgBuilder.bindsCustomDesc}</p>
              {customBinds.map((bind, i) => {
                const keyValid = bind.key === '' || KEY_NAME_RE.test(bind.key)
                return (
                  <div key={i} className="cfg-custom-bind-row">
                    <input
                      type="text"
                      className={`cp-input cfg-bind-key-input mono${keyValid ? '' : ' cfg-field-invalid'}`}
                      placeholder={t.cfgBuilder.bindsCustomKeyPlaceholder}
                      value={bind.key}
                      onChange={(e) => editCustomBind(i, { key: e.target.value.toLowerCase() })}
                    />
                    <input
                      type="text"
                      className="cp-input cfg-bind-command-input mono"
                      placeholder={t.cfgBuilder.bindsCustomCommandPlaceholder}
                      value={bind.command}
                      onChange={(e) => editCustomBind(i, { command: e.target.value })}
                    />
                    <button
                      className="cp-btn-secondary cfg-bind-remove-btn"
                      aria-label={t.cfgBuilder.bindsCustomRemoveAriaLabel}
                      onClick={() => removeCustomBind(i)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
              <button className="cp-btn-secondary" onClick={addCustomBind}>
                <Plus size={14} /> {t.cfgBuilder.bindsCustomAdd}
              </button>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title={t.cfgBuilder.sectionOutput} collapsed={collapsed.output ?? false} onToggle={() => toggleSection('output')}>
            <p className="settings-row-desc settings-section-intro">{t.cfgBuilder.outputIntro}</p>

            {scan && (
              <p className={`config-scan-panel-score${scan.counts.critical > 0 ? ' cfg-scan-critical' : ''}`}>
                {t.configScanner.safeScoreLabel}: <span className="mono">{scan.safeScore}</span>
                {scan.findings.length > 0 && ` · ${t.configScanner.viewFindings(scan.findings.length)}`}
              </p>
            )}

            <p className="settings-row-label">{t.cfgBuilder.previewLabel}</p>
            <pre className="cfg-preview mono">{previewText}</pre>

            <div className="cfg-output-actions">
              <button className="cp-btn-secondary" onClick={handleCopy}>
                <Copy size={14} /> {copied ? t.notices.copied : t.cfgBuilder.copyToClipboard}
              </button>
              <button className="cp-btn-secondary" onClick={handleSaveToFile}>
                {t.cfgBuilder.saveToFile}
              </button>
              <button className="cp-btn-primary" disabled={applying} onClick={handleApply}>
                {applying ? t.cfgBuilder.applying : t.cfgBuilder.applyButton}
              </button>
              <button className="cp-btn-secondary" disabled={removing} onClick={handleRemove}>
                {removing ? t.cfgBuilder.removing : t.cfgBuilder.removeFromGameButton}
              </button>
            </div>

            <p className="settings-row-desc muted">
              {status?.lastAppliedAt ? t.cfgBuilder.lastAppliedLabel(new Date(status.lastAppliedAt).toLocaleString()) : t.cfgBuilder.neverApplied}
            </p>
          </CollapsibleSection>
        </>
      )}

      {blockedResult && (
        <ConfigScanModal title={t.cfgBuilder.applyBlockedTitle} result={blockedResult} onClose={() => setBlockedResult(null)} />
      )}
    </section>
  )
}
