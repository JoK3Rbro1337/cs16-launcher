/**
 * Pure-logic verification for M15's crosshair-settings.ts — zero Electron
 * dependency, run with `node scripts/verify-crosshair-settings.mts`.
 * Exercises sanitization/clamping and the shouldShowOverlay decision.
 */

import {
  DEFAULT_CROSSHAIR_SETTINGS,
  sanitizeCrosshairSettings,
  scaledCrosshairSettings,
  shouldShowOverlay,
  type CrosshairSettings
} from '../electron/modules/crosshair-settings.ts'

let failures = 0
function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

console.log('== sanitizeCrosshairSettings: range clamping ==')
check('size clamps above max', sanitizeCrosshairSettings({ size: 9999 }).size === 64)
check('size clamps below min', sanitizeCrosshairSettings({ size: -5 }).size === 2)
check('thickness clamps above max', sanitizeCrosshairSettings({ thickness: 100 }).thickness === 12)
check('gap clamps below min', sanitizeCrosshairSettings({ gap: -1 }).gap === 0)
check('opacity clamps above max', sanitizeCrosshairSettings({ opacity: 5 }).opacity === 1)
check('opacity clamps below min', sanitizeCrosshairSettings({ opacity: 0 }).opacity === 0.1)
check('offsetX clamps to range', sanitizeCrosshairSettings({ offsetX: 99999 }).offsetX === 300)
check('offsetY clamps to negative range', sanitizeCrosshairSettings({ offsetY: -99999 }).offsetY === -300)
check('non-finite value falls back to base, not a hardcoded default', (() => {
  const base: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, size: 40 }
  return sanitizeCrosshairSettings({ size: NaN }, base).size === 40
})())

console.log('== sanitizeCrosshairSettings: enum/string/boolean fields ==')
check('invalid shape falls back to base shape', sanitizeCrosshairSettings({ shape: 'triangle' as never }).shape === DEFAULT_CROSSHAIR_SETTINGS.shape)
check('valid shape is accepted', sanitizeCrosshairSettings({ shape: 'circle' }).shape === 'circle')
check('invalid hex color falls back to base', sanitizeCrosshairSettings({ color: 'not-a-color' }).color === DEFAULT_CROSSHAIR_SETTINGS.color)
check('valid hex color is accepted', sanitizeCrosshairSettings({ color: '#abcdef' }).color === '#abcdef')
check('color without # is rejected', sanitizeCrosshairSettings({ color: 'abcdef' }).color === DEFAULT_CROSSHAIR_SETTINGS.color)
check('short hex (#abc) is rejected', sanitizeCrosshairSettings({ color: '#abc' }).color === DEFAULT_CROSSHAIR_SETTINGS.color)
check('enabled coerces truthy', sanitizeCrosshairSettings({ enabled: 1 as unknown as boolean }).enabled === true)
check('displayId accepts an integer', sanitizeCrosshairSettings({ displayId: 7 }).displayId === 7)
check('displayId accepts null (auto)', sanitizeCrosshairSettings({ displayId: null }, { ...DEFAULT_CROSSHAIR_SETTINGS, displayId: 3 }).displayId === null)
check('displayId rejects a non-integer, falls back to base', sanitizeCrosshairSettings({ displayId: 1.5 }, { ...DEFAULT_CROSSHAIR_SETTINGS, displayId: 9 }).displayId === 9)
check('scale defaults to 1', DEFAULT_CROSSHAIR_SETTINGS.scale === 1)
check('scale clamps above max (8)', sanitizeCrosshairSettings({ scale: 999 }).scale === 8)
check('scale clamps below min (0.25)', sanitizeCrosshairSettings({ scale: 0 }).scale === 0.25)
check('a valid scale is accepted as-is', sanitizeCrosshairSettings({ scale: 2 }).scale === 2)
check('non-finite scale falls back to base, not a hardcoded default', (() => {
  const base: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, scale: 1.5 }
  return sanitizeCrosshairSettings({ scale: NaN }, base).scale === 1.5
})())

console.log('== scaledCrosshairSettings ==')
check('scale of 1 leaves spatial fields unchanged', (() => {
  const s: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, size: 10, thickness: 2, gap: 4, offsetX: 5, offsetY: -5, scale: 1 }
  const scaled = scaledCrosshairSettings(s)
  return scaled.size === 10 && scaled.thickness === 2 && scaled.gap === 4 && scaled.offsetX === 5 && scaled.offsetY === -5
})())
check('scale of 2 doubles size/thickness/gap/offsetX/offsetY', (() => {
  const s: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, size: 10, thickness: 2, gap: 4, offsetX: 5, offsetY: -5, scale: 2 }
  const scaled = scaledCrosshairSettings(s)
  return scaled.size === 20 && scaled.thickness === 4 && scaled.gap === 8 && scaled.offsetX === 10 && scaled.offsetY === -10
})())
check('output always carries scale: 1 (safe to feed straight into drawCrosshair without double-applying)', scaledCrosshairSettings({ ...DEFAULT_CROSSHAIR_SETTINGS, scale: 3 }).scale === 1)
check('color/opacity/outline/shape/displayId pass through untouched', (() => {
  const s: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, color: '#123456', opacity: 0.5, outline: false, shape: 'circle', displayId: 3, scale: 2 }
  const scaled = scaledCrosshairSettings(s)
  return scaled.color === '#123456' && scaled.opacity === 0.5 && scaled.outline === false && scaled.shape === 'circle' && scaled.displayId === 3
})())

console.log('== sanitizeCrosshairSettings: partial merge never clobbers unrelated fields ==')
check('updating only color leaves size untouched', (() => {
  const base: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, size: 33 }
  return sanitizeCrosshairSettings({ color: '#000000' }, base).size === 33
})())

console.log('== shouldShowOverlay ==')
const enabledAndSeen: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, enabled: true, disclosureSeen: true }
check('shows when enabled + disclosure seen + game running', shouldShowOverlay(enabledAndSeen, true))
check('hidden when game not running', !shouldShowOverlay(enabledAndSeen, false))
check('hidden when not enabled', !shouldShowOverlay({ ...enabledAndSeen, enabled: false }, true))
check(
  'hidden when disclosure never seen, even if enabled+running (guards a hand-edited/imported settings file)',
  !shouldShowOverlay({ ...enabledAndSeen, disclosureSeen: false }, true)
)
check('default settings never show (off by default)', !shouldShowOverlay(DEFAULT_CROSSHAIR_SETTINGS, true))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
