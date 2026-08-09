/**
 * native-crosshair-settings — M15 follow-up: pure types/defaults/sanitize/
 * cfg-text-generation for the "native" crosshair path. Same zero-Electron/
 * Node-dependency pattern as crosshair-settings.ts, notification-rules.ts,
 * and config-scanner.ts, for the same reason: usable from the renderer and
 * verifiable via a plain `node` script with no Electron runtime.
 *
 * This is the primary, safer crosshair customization option (see
 * native-crosshair.ts's module doc for why): it only ever writes the four
 * real GoldSrc client cvars below — every one of them already curated in
 * config-scanner.ts's KNOWN_CVARS allowlist and confirmed against every
 * shipped content/slots/config/*.cfg (cl_crosshair_size takes "small" or
 * "large" in every shipped config; "medium" is accepted too per the classic
 * Half-Life SDK cvar and offered here for completeness) — never free-form
 * text, so there is no scannable attack surface the way an arbitrary
 * downloaded .cfg has: nothing here can ever contain a connect/rcon/alias/
 * exec statement.
 */

export type NativeCrosshairSize = 'small' | 'medium' | 'large'

export interface NativeCrosshairSettings {
  enabled: boolean
  /** "#rrggbb" — converted to GoldSrc's "r g b" (0-255 each) cvar format on write. */
  color: string
  size: NativeCrosshairSize
  translucent: boolean
  dynamic: boolean
}

export const NATIVE_CROSSHAIR_SIZES: NativeCrosshairSize[] = ['small', 'medium', 'large']

/** Same bright/saturated preset set as crosshair-settings.ts's overlay, for a consistent picker — a crosshair needs to read against any in-game background either way. */
export const NATIVE_CROSSHAIR_COLOR_PRESETS = ['#39ff14', '#00eaff', '#ff3b30', '#ffe135', '#ffffff', '#ff2fd6']

export const DEFAULT_NATIVE_CROSSHAIR_SETTINGS: NativeCrosshairSettings = {
  enabled: false,
  color: NATIVE_CROSSHAIR_COLOR_PRESETS[0],
  size: 'medium',
  translucent: false,
  dynamic: false
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function sanitizeNativeCrosshairSettings(
  partial: Partial<NativeCrosshairSettings>,
  base: NativeCrosshairSettings = DEFAULT_NATIVE_CROSSHAIR_SETTINGS
): NativeCrosshairSettings {
  const merged = { ...base, ...partial }
  return {
    enabled: !!merged.enabled,
    color: typeof merged.color === 'string' && HEX_COLOR_RE.test(merged.color) ? merged.color : base.color,
    size: NATIVE_CROSSHAIR_SIZES.includes(merged.size) ? merged.size : base.size,
    translucent: !!merged.translucent,
    dynamic: !!merged.dynamic
  }
}

function hexToRgbCvar(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

/**
 * The full text of the leaf cfg file native-crosshair.ts writes and execs.
 * Deliberately never anything but these four cvar lines plus a header
 * comment — no exec, no alias, no bind — so it can never participate in the
 * userconfig.cfg/autoexec.cfg exec-cycle hazard documented in
 * content-sync.ts regardless of what's written here.
 */
export function buildNativeCrosshairCfgText(settings: NativeCrosshairSettings): string {
  const lines = [
    '// ============================================================================',
    '// 1.6X Launcher — Native Crosshair (managed, do not edit)',
    '// Regenerated whenever these settings change in Settings > Crosshair.',
    '// ============================================================================',
    `cl_crosshair_color "${hexToRgbCvar(settings.color)}"`,
    `cl_crosshair_size "${settings.size}"`,
    `cl_crosshair_translucent "${settings.translucent ? 1 : 0}"`,
    `cl_dynamiccrosshair "${settings.dynamic ? 1 : 0}"`,
    ''
  ]
  return lines.join('\n')
}
