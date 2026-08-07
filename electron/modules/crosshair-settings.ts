/**
 * crosshair-settings — M15: pure types/defaults/sanitization for the
 * crosshair overlay. Deliberately zero Electron/Node dependency (same
 * pattern as notification-rules.ts and config-scanner.ts) so it's usable
 * from the renderer (Settings.tsx, the overlay page) and verifiable via a
 * plain `node` script with no Electron runtime at all.
 *
 * crosshair-overlay.ts (the Electron-side driver: window management,
 * polling, persistence) is the only thing that mutates a live settings
 * object — this module only knows how to validate/clamp one, and decide
 * (given a settings snapshot + whether the game is running) whether the
 * overlay should be visible. That decision is intentionally its own named
 * function (shouldShowOverlay) rather than inlined in the poll loop, so it
 * has a stable, headlessly-testable seam independent of the real OS
 * process check (game-process.ts) or any actual window.
 */

export type CrosshairShape = 'dot' | 'cross' | 'circle' | 'cross-dot'

export interface CrosshairSettings {
  enabled: boolean
  /** One-time disclosure (screen overlay, reads/modifies nothing about the game, server rules may still disallow it) must be shown before `enabled` can ever be true — see shouldShowOverlay. */
  disclosureSeen: boolean
  shape: CrosshairShape
  /** Arm length (cross/cross-dot), radius (circle), or diameter basis (dot) — see crosshair.ts. */
  size: number
  thickness: number
  /** Distance from center to the start of each cross arm — cross/cross-dot only. */
  gap: number
  /** "#rrggbb". */
  color: string
  outline: boolean
  opacity: number
  offsetX: number
  offsetY: number
  /** Electron `Display.id` to pin the overlay to, or null for "auto" (see crosshair-overlay.ts's resolveTargetDisplay). */
  displayId: number | null
}

export const CROSSHAIR_SHAPES: CrosshairShape[] = ['dot', 'cross', 'circle', 'cross-dot']

/** Bright, saturated defaults — a crosshair needs to read against any in-game background, not match this app's own UI palette. */
export const CROSSHAIR_COLOR_PRESETS = ['#39ff14', '#00eaff', '#ff3b30', '#ffe135', '#ffffff', '#ff2fd6']

export const CROSSHAIR_RANGES = {
  size: { min: 2, max: 64 },
  thickness: { min: 1, max: 12 },
  gap: { min: 0, max: 32 },
  opacity: { min: 0.1, max: 1 },
  offset: { min: -300, max: 300 }
} as const

export const DEFAULT_CROSSHAIR_SETTINGS: CrosshairSettings = {
  enabled: false,
  disclosureSeen: false,
  shape: 'cross',
  size: 10,
  thickness: 2,
  gap: 4,
  color: CROSSHAIR_COLOR_PRESETS[0],
  outline: true,
  opacity: 1,
  offsetX: 0,
  offsetY: 0,
  displayId: null
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Merges `partial` onto `base` and clamps/validates every field — the only
 * way a CrosshairSettings object should ever be produced from untrusted
 * input (an IPC call from the renderer, or a persisted JSON file that could
 * have been hand-edited or predate a range change). Unknown/out-of-range
 * values fall back to `base`'s own value, never to a hardcoded default, so
 * a partial update never clobbers unrelated fields.
 */
export function sanitizeCrosshairSettings(
  partial: Partial<CrosshairSettings>,
  base: CrosshairSettings = DEFAULT_CROSSHAIR_SETTINGS
): CrosshairSettings {
  const merged = { ...base, ...partial }
  return {
    enabled: !!merged.enabled,
    disclosureSeen: !!merged.disclosureSeen,
    shape: CROSSHAIR_SHAPES.includes(merged.shape) ? merged.shape : base.shape,
    size: clamp(merged.size, CROSSHAIR_RANGES.size.min, CROSSHAIR_RANGES.size.max, base.size),
    thickness: clamp(merged.thickness, CROSSHAIR_RANGES.thickness.min, CROSSHAIR_RANGES.thickness.max, base.thickness),
    gap: clamp(merged.gap, CROSSHAIR_RANGES.gap.min, CROSSHAIR_RANGES.gap.max, base.gap),
    color: typeof merged.color === 'string' && HEX_COLOR_RE.test(merged.color) ? merged.color : base.color,
    outline: !!merged.outline,
    opacity: clamp(merged.opacity, CROSSHAIR_RANGES.opacity.min, CROSSHAIR_RANGES.opacity.max, base.opacity),
    offsetX: clamp(merged.offsetX, CROSSHAIR_RANGES.offset.min, CROSSHAIR_RANGES.offset.max, base.offsetX),
    offsetY: clamp(merged.offsetY, CROSSHAIR_RANGES.offset.min, CROSSHAIR_RANGES.offset.max, base.offsetY),
    displayId: merged.displayId === null || Number.isInteger(merged.displayId) ? merged.displayId : base.displayId
  }
}

/**
 * The single decision point for overlay visibility. Checks disclosureSeen
 * in addition to enabled — trusting `enabled` alone would mean a
 * hand-edited or imported settings file could set enabled:true without the
 * disclosure ever having been shown, silently bypassing it. `gameRunning`
 * comes from game-process.ts's read-only OS process-list check — never
 * anything that touches the game's process, memory, or files.
 */
export function shouldShowOverlay(settings: CrosshairSettings, gameRunning: boolean): boolean {
  return settings.enabled && settings.disclosureSeen && gameRunning
}
