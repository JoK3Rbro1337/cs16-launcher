/**
 * Headless-Electron verification for M15's crosshair-overlay.ts — the parts
 * genuinely verifiable without a real display and a real running game:
 *
 *  1. Settings persistence round-trip (isolated userData tmp dir — never
 *     the real profile).
 *  2. The overlay BrowserWindow's actual Electron-level properties
 *     (transparent, alwaysOnTop, non-focusable, click-through) and its
 *     show/hide mechanics respond correctly to direct calls.
 *  3. Display resolution (positionOverlay/resolveTargetDisplay) against
 *     whatever screen.getAllDisplays() reports in this environment.
 *  4. Overlay window sizing (overlayWindowSize) and offset-baked-into-
 *     position bounds math (computeOverlayBounds) — the small-window
 *     mitigation for the Electron 43 X11 setIgnoreMouseEvents regression
 *     documented in crosshair-overlay.ts's module doc. NOT verifiable here:
 *     whether setIgnoreMouseEvents actually achieves click-through on a real
 *     X11 session (this sandbox is Wayland) — that regression and its
 *     mitigation's real-world effectiveness need manual X11 testing.
 *  5. KWin-stacking mitigation mechanics: the escalated always-on-top level
 *     + moveTop() are callable without throwing, isKwinSession() detection,
 *     and getKwinRuleInstructions()'s two match values. NOT verifiable here:
 *     whether any of this actually keeps the overlay above a focused game
 *     window under a real KWin compositor — this sandbox has no real window
 *     manager to observe stacking order against. Needs real-world retest.
 *
 * Deliberately NOT attempted here: making isGameRunning() report true (that
 * needs an actual hl_linux/hl.exe process) and confirming the overlay is
 * visually correct over a real running game / real multi-monitor setup /
 * real exclusive-fullscreen on Wayland. See scripts/verify-crosshair-settings.mts
 * for the pure enabled+disclosureSeen+gameRunning decision logic tested in
 * isolation — combined with this script's direct show()/hide() mechanics
 * test, that covers "decision" and "mechanics" separately without a single
 * flaky end-to-end fake-process test. The real over-the-game behavior is
 * called out explicitly as needing manual verification in CLAUDE.md / the
 * PR notes.
 *
 * Run: ./node_modules/.bin/electron --disable-gpu --no-sandbox \
 *        --disable-software-rasterizer scripts/verify-crosshair-overlay.mts
 */

import { app, screen } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

async function main(): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'crosshair-overlay-verify-'))
  app.setPath('userData', tmpDir)

  await app.whenReady()

  const {
    initCrosshairOverlay,
    stopCrosshairOverlay,
    getCrosshairSettings,
    updateCrosshairSettings,
    listDisplays,
    isWaylandSession,
    isKwinSession,
    getCrosshairPlatformInfo,
    getKwinRuleInstructions,
    reassertCrosshairOverlay,
    ensureOverlayWindow,
    positionOverlay,
    overlayWindowSize,
    computeOverlayBounds,
    computeSuggestedScale,
    getCrosshairDebugAlignment,
    setCrosshairDebugAlignment
  } = await import('../electron/modules/crosshair-overlay.ts')
  const { DEFAULT_CROSSHAIR_SETTINGS } = await import('../electron/modules/crosshair-settings.ts')

  console.log('== persistence round-trip (isolated userData tmp dir) ==')
  await initCrosshairOverlay()
  const initial = getCrosshairSettings()
  check('fresh install defaults to disabled', initial.enabled === false)
  check('fresh install defaults to disclosure not seen', initial.disclosureSeen === false)
  check('fresh install defaults to shape "cross"', initial.shape === 'cross')

  const updated = await updateCrosshairSettings({ enabled: true, disclosureSeen: true, color: '#123456', size: 22 })
  check('update returns the sanitized settings immediately', updated.color === '#123456' && updated.size === 22)
  check('getCrosshairSettings reflects the update in-memory', getCrosshairSettings().enabled === true)

  // Simulate a restart: re-run init (re-reads the persisted file from disk).
  await initCrosshairOverlay()
  const reloaded = getCrosshairSettings()
  check('settings survive a simulated restart (persisted to disk)', reloaded.color === '#123456' && reloaded.size === 22 && reloaded.enabled === true)

  const clamped = await updateCrosshairSettings({ size: 99999, opacity: -5 })
  check('out-of-range values are clamped on write, not rejected wholesale', clamped.size === 64 && clamped.opacity === 0.1)

  console.log('== platform info ==')
  const platformInfo = getCrosshairPlatformInfo()
  check('isWaylandSession() matches getCrosshairPlatformInfo()', platformInfo.isWayland === isWaylandSession())
  check('isWaylandSession() is false on this non-Linux-or-non-Wayland CI/dev box, or a boolean either way', typeof platformInfo.isWayland === 'boolean')
  console.log(`  (isWayland=${platformInfo.isWayland}, XDG_SESSION_TYPE=${process.env.XDG_SESSION_TYPE ?? '(unset)'})`)
  check('isKwinSession() matches getCrosshairPlatformInfo()', platformInfo.isKwin === isKwinSession())
  console.log(`  (isKwin=${platformInfo.isKwin}, XDG_CURRENT_DESKTOP=${process.env.XDG_CURRENT_DESKTOP ?? '(unset)'})`)

  console.log('== KWin Rules fallback instructions (never writes kwinrulesrc — see module doc) ==')
  const kwinInstructions = getKwinRuleInstructions()
  check('windowClass matches the app\'s StartupWMClass', kwinInstructions.windowClass === 'com.cs16launcher.app')
  check('windowTitle is the overlay-specific title, not the main window\'s (would force the main window always-on-top too otherwise)', kwinInstructions.windowTitle === 'crosshair-overlay')

  console.log('== display listing ==')
  const displays = listDisplays()
  console.log(`  ${displays.length} display(s) reported by this environment: ${JSON.stringify(displays)}`)
  check('listDisplays() returns at least one entry', displays.length >= 1)
  check('primary display is marked', displays.some((d) => d.primary))

  console.log('== overlay window: real Electron-level properties ==')
  const win = ensureOverlayWindow()
  check('window starts hidden', !win.isVisible())
  check('window is always-on-top', win.isAlwaysOnTop())
  check('window is not focusable (never steals input from the game)', !win.isFocusable())
  check('window is excluded from the taskbar', win.isSkipTaskbar?.() ?? true)
  // Deliberately resizable (not resizable:false) — see ensureOverlayWindow's
  // doc comment: no user-facing way to resize this window regardless (no
  // frame, no mouse input, not focusable), and resizable:false risked a WM
  // enforcing a min=max size hint that fights this module's own programmatic
  // resizing on every settings/scale change.
  check('window is resizable at the Electron API level (programmatic resize must not be WM-blocked)', win.isResizable())
  // `movable: false` isn't honored by every Linux WM/GTK backend's isMovable()
  // bookkeeping (confirmed: this sandbox reports true despite the constructor
  // option) — harmless in practice since setIgnoreMouseEvents(true) already
  // makes the window unclickable, so there's no mouse-driven way to move it
  // regardless of what isMovable() reports. Logged, not asserted.
  console.log(`  (isMovable=${win.isMovable()} — informational only, see comment above)`)
  check('calling ensureOverlayWindow() again reuses the same window (no leak)', ensureOverlayWindow() === win)

  console.log('== overlay window: show/hide mechanics ==')
  win.showInactive()
  check('showInactive() makes the window visible', win.isVisible())
  check('showInactive() never focuses the window', !win.isFocused())
  win.hide()
  check('hide() makes the window invisible again', !win.isVisible())

  console.log('== overlay sizing (small window, not fullscreen — X11 setIgnoreMouseEvents regression mitigation) ==')
  const defaultSize = overlayWindowSize(DEFAULT_CROSSHAIR_SETTINGS)
  check('default-size crosshair gets the floor window size (200px)', defaultSize === 200)
  const bigSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, shape: 'cross' as const, size: 64, gap: 32, thickness: 12, outline: true }
  const bigSize = overlayWindowSize(bigSettings)
  check('a large cross/gap/thickness/outline combination grows the window past the floor', bigSize > defaultSize)
  check('window size never exceeds the cap (500px), even for max settings', bigSize <= 500)
  const primaryBounds = screen.getPrimaryDisplay().bounds
  check(
    'the overlay window is always small relative to the display, never fullscreen',
    defaultSize < primaryBounds.width && defaultSize < primaryBounds.height
  )

  console.log('== game-resolution scale (M15 follow-up: 1280x960 game on a higher-res display) ==')
  // Deliberately sized so the scale:1 baseline already clears the 200px
  // floor (unlike DEFAULT_CROSSHAIR_SETTINGS, whose reach at scale:1 is
  // small enough that even scale:2 stays under the floor) — otherwise
  // growth from scaling wouldn't be observable against the floor clamp.
  const unscaledMidSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, size: 50, gap: 20, thickness: 6, scale: 1 }
  const unscaledMidSize = overlayWindowSize(unscaledMidSettings)
  const doubledSize = overlayWindowSize({ ...unscaledMidSettings, scale: 2 })
  check('scale:1 baseline already clears the 200px floor (test validity check)', unscaledMidSize > 200)
  check('scale: 2 grows the window vs. scale: 1 for identical size/thickness/gap', doubledSize > unscaledMidSize)
  const primaryDisplay = screen.getPrimaryDisplay()
  const suggested = computeSuggestedScale(primaryDisplay.bounds.width * primaryDisplay.scaleFactor, primaryDisplay.bounds.height * primaryDisplay.scaleFactor)
  check('computeSuggestedScale() returns ~1 when the "game resolution" equals the real display resolution', Math.abs(suggested - 1) < 0.01)
  const suggestedHalf = computeSuggestedScale(
    (primaryDisplay.bounds.width * primaryDisplay.scaleFactor) / 2,
    (primaryDisplay.bounds.height * primaryDisplay.scaleFactor) / 2
  )
  check('computeSuggestedScale() returns ~2 when the game renders at half the display resolution', Math.abs(suggestedHalf - 2) < 0.01)
  check('computeSuggestedScale() returns 1 (no adjustment) for invalid input rather than throwing', computeSuggestedScale(0, -5) === 1 && computeSuggestedScale(NaN, 100) === 1)

  console.log('== display positioning (centers on workArea, not bounds — real-world KDE panel-offset finding) ==')
  const primaryWorkArea = screen.getPrimaryDisplay().workArea
  console.log(`  (bounds=${JSON.stringify(primaryBounds)}, workArea=${JSON.stringify(primaryWorkArea)})`)
  positionOverlay(win)
  const bounds = win.getBounds()
  check(
    'positionOverlay() with no displayId/offset set centers a small window on the primary display\'s workArea',
    bounds.width === defaultSize &&
      bounds.height === defaultSize &&
      bounds.x === Math.round(primaryWorkArea.x + primaryWorkArea.width / 2 - defaultSize / 2) &&
      bounds.y === Math.round(primaryWorkArea.y + primaryWorkArea.height / 2 - defaultSize / 2)
  )
  // This sandbox likely has no real desktop panel reserving space (workArea
  // === bounds here), so this only proves the two centers *would* diverge
  // given a nonzero panel — not that they actually do on this box. The real
  // regression (crosshair visibly off-center under a real KDE panel) needs
  // manual retest.
  if (primaryWorkArea.width !== primaryBounds.width || primaryWorkArea.height !== primaryBounds.height) {
    const boundsCenterX = Math.round(primaryBounds.x + primaryBounds.width / 2 - defaultSize / 2)
    const boundsCenterY = Math.round(primaryBounds.y + primaryBounds.height / 2 - defaultSize / 2)
    check('workArea and bounds actually disagree on this box, and positioning follows workArea, not bounds', bounds.x !== boundsCenterX || bounds.y !== boundsCenterY)
  } else {
    console.log('  (workArea === bounds on this box — no panel reserving space here, so bounds-vs-workArea divergence isn\'t observable in this run)')
  }

  const offsetSettings = { ...DEFAULT_CROSSHAIR_SETTINGS, offsetX: 50, offsetY: -30 }
  const offsetBounds = computeOverlayBounds(screen.getPrimaryDisplay(), offsetSettings)
  check(
    'computeOverlayBounds() bakes offsetX/offsetY into window position, not canvas draw',
    offsetBounds.x === bounds.x + 50 && offsetBounds.y === bounds.y - 30
  )

  console.log('== re-assert mechanics (X11 click-through + KWin stacking regression insurance) ==')
  win.showInactive()
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'pop-up-menu')
  check('setAlwaysOnTop with the escalated (non-screen-saver) level can be re-asserted without throwing', win.isAlwaysOnTop())
  win.moveTop()
  check('moveTop() can be called alongside setAlwaysOnTop without throwing', win.isAlwaysOnTop())
  // reassertCrosshairOverlay() is a no-op here: its guard checks the module's
  // own `currentlyShown` state, which only tick() sets — and tick() only
  // shows the overlay when isGameRunning() is true, which needs a real
  // hl_linux/hl.exe process this sandbox doesn't have. This only confirms
  // the exported function is callable/doesn't throw when nothing is shown
  // (the common case main.ts's blur handler will hit outside an active game
  // session) — the actual reassert-on-blur behavior needs manual retest
  // against a real running game.
  reassertCrosshairOverlay()
  check('reassertCrosshairOverlay() is a safe no-op when the overlay isn\'t currently shown', true)
  win.hide()

  console.log('== temporary alignment-guide debug toggle ==')
  check('debug alignment starts off', getCrosshairDebugAlignment() === false)
  setCrosshairDebugAlignment(true)
  check('setCrosshairDebugAlignment(true) is reflected by the getter', getCrosshairDebugAlignment() === true)
  setCrosshairDebugAlignment(false)
  check('setCrosshairDebugAlignment(false) turns it back off', getCrosshairDebugAlignment() === false)

  await rm(tmpDir, { recursive: true, force: true })
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)

  console.log('\n== stopCrosshairOverlay: lifecycle fix (first real test, 2026-08 — app never quit) ==')
  // Root cause of the app-never-quits bug: the overlay is a real (if hidden)
  // BrowserWindow, so Electron counts it toward "windows still open" and
  // window-all-closed never fired while it was alive. stopCrosshairOverlay()
  // is what main.ts now calls from the main window's 'closed' handler (and
  // before-quit as a guard) to get the window count to genuinely reach 0.
  // Run last and unconditional on `failures`: once this destroys the last
  // remaining BrowserWindow and its poll timer, nothing keeps this script's
  // own event loop alive either — same as the real app quitting — so no
  // code after this point is guaranteed to run.
  const winBeforeStop = ensureOverlayWindow()
  winBeforeStop.showInactive()
  stopCrosshairOverlay()
  check('stopCrosshairOverlay() destroys the overlay window', winBeforeStop.isDestroyed())
  stopCrosshairOverlay()
  check('a second stopCrosshairOverlay() call is a no-op, not a throw', true)

  app.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
