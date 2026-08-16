import { useEffect, useState } from 'react'
import type { NativeCrosshairSettings, NativeCrosshairSize } from '../../electron/modules/native-crosshair'
import { useT } from '../lib/i18n'
import type { Messages } from '../lib/i18n'

/**
 * Mirrors NATIVE_CROSSHAIR_SIZES/NATIVE_CROSSHAIR_COLOR_PRESETS in
 * electron/modules/native-crosshair-settings.ts — same "renderer only pulls
 * types" convention used throughout this codebase (the renderer never
 * imports runtime values from electron/modules).
 */
const NATIVE_CROSSHAIR_SIZES: NativeCrosshairSize[] = ['small', 'medium', 'large']
const NATIVE_CROSSHAIR_COLOR_PRESETS = ['#39ff14', '#00eaff', '#ff3b30', '#ffe135', '#ffffff', '#ff2fd6']

function nativeCrosshairSizeLabel(t: Messages, size: NativeCrosshairSize): string {
  switch (size) {
    case 'small':
      return t.settings.nativeCrosshairSizeSmall
    case 'medium':
      return t.settings.nativeCrosshairSizeMedium
    case 'large':
      return t.settings.nativeCrosshairSizeLarge
  }
}

/**
 * Editor for GoldSrc's own cl_crosshair_* cvars — Settings' primary crosshair
 * option, and reused as-is (not reimplemented) by the CFG Builder's HUD
 * section per the M14 spec's "reuse the native crosshair editor's controls
 * rather than duplicating them." Both call sites edit the exact same
 * settings object via the exact same IPC calls: this owns its own
 * fetch/apply cycle rather than taking settings as props, since there's only
 * ever one native-crosshair-settings.json regardless of which screen is
 * open. Deliberately never written into the CFG Builder's own generated cfg
 * (see cfg-builder-settings.ts's module doc) — this component is the only
 * writer of cl_crosshair_*, from either screen.
 */
export default function NativeCrosshairEditor(): React.JSX.Element {
  const t = useT()
  const [settings, setSettings] = useState<NativeCrosshairSettings | null>(null)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    window.launcher
      .getNativeCrosshairStatus()
      .then(({ settings, applied }) => {
        setSettings(settings)
        setApplied(applied)
      })
      .catch(() => {})
  }, [])

  async function apply(partial: Partial<NativeCrosshairSettings>): Promise<void> {
    const { settings: next, applied: nextApplied } = await window.launcher.updateNativeCrosshairSettings(partial)
    setSettings(next)
    setApplied(nextApplied)
  }

  return (
    <div className="settings-card">
      <p className="settings-row-desc settings-section-intro">{t.settings.nativeCrosshairIntro}</p>

      <div className="settings-row">
        <div>
          <p className="settings-row-label">{t.settings.nativeCrosshairEnabledLabel}</p>
          <p className="settings-row-desc">{t.settings.nativeCrosshairEnabledDesc}</p>
        </div>
        <button
          className={`toggle-switch${settings?.enabled ? ' on' : ''}`}
          role="switch"
          aria-checked={!!settings?.enabled}
          aria-label={t.settings.nativeCrosshairEnabledAriaLabel}
          disabled={!settings}
          onClick={() => settings && apply({ enabled: !settings.enabled })}
        >
          <span className="toggle-switch-thumb" />
        </button>
      </div>

      {settings?.enabled && (
        <>
          <p className={`settings-row-desc crosshair-wayland-hint${applied ? ' native-crosshair-status-ok' : ''}`}>
            {applied ? t.settings.nativeCrosshairAppliedHint : t.settings.nativeCrosshairNotAppliedHint}
          </p>

          <div className="settings-row">
            <p className="settings-row-label">{t.settings.nativeCrosshairSizeLabel}</p>
            <div className="filter-chips">
              {NATIVE_CROSSHAIR_SIZES.map((size) => (
                <button
                  key={size}
                  className={`filter-chip${settings.size === size ? ' active' : ''}`}
                  onClick={() => apply({ size })}
                >
                  {nativeCrosshairSizeLabel(t, size)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <p className="settings-row-label">{t.settings.nativeCrosshairColorLabel}</p>
            <div className="crosshair-color-row">
              {NATIVE_CROSSHAIR_COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={`crosshair-color-swatch${settings.color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  aria-label={c}
                  onClick={() => apply({ color: c })}
                />
              ))}
              <input
                type="color"
                className="crosshair-color-custom"
                aria-label={t.settings.nativeCrosshairCustomColorAriaLabel}
                value={settings.color}
                onChange={(e) => apply({ color: e.target.value })}
              />
            </div>
          </div>

          <div className="settings-row">
            <div>
              <p className="settings-row-label">{t.settings.nativeCrosshairTranslucentLabel}</p>
              <p className="settings-row-desc">{t.settings.nativeCrosshairTranslucentDesc}</p>
            </div>
            <button
              className={`toggle-switch${settings.translucent ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.translucent}
              aria-label={t.settings.nativeCrosshairTranslucentAriaLabel}
              onClick={() => apply({ translucent: !settings.translucent })}
            >
              <span className="toggle-switch-thumb" />
            </button>
          </div>

          <div className="settings-row">
            <div>
              <p className="settings-row-label">{t.settings.nativeCrosshairDynamicLabel}</p>
              <p className="settings-row-desc">{t.settings.nativeCrosshairDynamicDesc}</p>
            </div>
            <button
              className={`toggle-switch${settings.dynamic ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.dynamic}
              aria-label={t.settings.nativeCrosshairDynamicAriaLabel}
              onClick={() => apply({ dynamic: !settings.dynamic })}
            >
              <span className="toggle-switch-thumb" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
