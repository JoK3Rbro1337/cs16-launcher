/**
 * crosshair-overlay — M15: a second, transparent, click-through
 * BrowserWindow drawing a canvas crosshair over the desktop, shown only
 * while CS 1.6 is running (per game-process.ts's read-only OS process-list
 * check — the same module M12a's session watcher uses) and hidden the rest
 * of the time. See crosshair-settings.ts for the pure settings shape,
 * validation, and the shouldShowOverlay visibility decision this module
 * drives off of.
 *
 * Safety stance (the whole point of this feature): zero interaction with
 * the game's process, memory, or files — isGameRunning() only lists process
 * names, never touches them. The overlay window itself never receives
 * input: setIgnoreMouseEvents(true) passes every click through to whatever
 * is beneath it, and `focusable: false` means it can never steal keyboard
 * focus from the game. OFF by default; can only ever turn on through
 * Settings' one-time disclosure flow (see shouldShowOverlay's doc comment
 * for why `enabled` alone isn't trusted).
 *
 * Every relative import here uses an explicit `.ts` extension (both
 * targets — game-process.ts and crosshair-settings.ts — have zero relative
 * imports of their own), so this module's persistence/visibility-decision
 * logic stays reachable by a headless-Electron verify script via Node's
 * native TS/ESM loader, same convention as locale-store.ts. See
 * scripts/verify-crosshair-overlay.mts.
 *
 * Platform reality, documented rather than silently swallowed:
 *  - Wayland compositors generally block a window from reliably compositing
 *    above another app's *exclusive* fullscreen surface — the same
 *    sandboxing that gates screen capture. alwaysOnTop reliably wins over a
 *    borderless/windowed game; exclusive fullscreen is compositor-dependent
 *    and may not show the overlay at all. isWaylandSession() surfaces this
 *    as a UI hint (getCrosshairPlatformInfo) rather than pretending it will
 *    always work.
 *  - "Auto" display selection can't inspect the game's actual window
 *    (that would mean listing/inspecting other processes' windows, which
 *    Wayland restricts by design and which this feature deliberately never
 *    does anyway per the zero-interaction stance above) — it's a best-effort
 *    heuristic: the display under the mouse cursor at the moment CS
 *    transitions from not-running to running, held fixed until the next
 *    such transition so it doesn't jitter as the player's mouse moves
 *    between monitors afterward. An explicit per-display pick in Settings
 *    always overrides it.
 *  - **Known Electron 43.x regression, X11 (confirmed against
 *    electron/electron#52456, still open/unfixed as of 2026-08, labeled
 *    43-x-y):** `setIgnoreMouseEvents(true)` stops making a transparent
 *    window click-through on X11 sessions — the native input region stays
 *    full-window instead of collapsing to empty, so clicks that should pass
 *    to whatever's beneath the overlay hit the overlay instead. Confirmed
 *    last-known-good at Electron 42.7.0; no userland workaround exists (no
 *    public API to set the X11 input-shape region directly — that's exactly
 *    what setIgnoreMouseEvents is supposed to drive internally). Evaluated
 *    and deliberately NOT pinning Electron back to 42.x for this: 43.1.0 has
 *    been the pin since this app's initial scaffold (not a deliberate
 *    upgrade being reverted), but downgrading now, after several shipped
 *    releases, has a regression surface spanning the whole app that can't be
 *    verified on this project's (Wayland) dev sandbox either way. Instead,
 *    mitigated at the source of the harm: OVERLAY_SIZE_* below keeps the
 *    window small (~200px, growing only as far as the current shape/size/
 *    gap/offset settings actually need) rather than fullscreen, so a
 *    click-through failure blocks a small region around the crosshair
 *    instead of the entire screen. tick() also re-asserts
 *    setIgnoreMouseEvents(true) on every poll while shown — cheap and
 *    idempotent, and means a future Electron patch release fixes this
 *    silently (no code change needed here) the moment it's installed.
 *    Wayland is unaffected (compositor-level input regions, different code
 *    path); this regression is X11-only.
 *  - **Gotcha (real-world finding, 2026-08) — KWin doesn't honor alwaysOnTop
 *    persistently:** the overlay shows correctly at first but drops behind
 *    the game window the moment the game takes focus — confirmed KWin isn't
 *    keeping it in the "above" stacking layer across a foreign window's
 *    focus change, even though alwaysOnTop was set once at show-time.
 *    Mitigated three ways, none of them the 'screen-saver' escalation that
 *    caused the exclusive-fullscreen freeze documented in CLAUDE.md's
 *    standing incident (deliberately not reintroduced — see
 *    OVERLAY_ALWAYS_ON_TOP_LEVEL below for why 'pop-up-menu' is judged safe
 *    to try instead): (1) REASSERT_INTERVAL_MS runs a dedicated, much
 *    faster timer than the isGameRunning() poll purely to re-call
 *    setAlwaysOnTop/moveTop/setIgnoreMouseEvents while shown — no OS calls
 *    involved, so a short interval costs nothing; (2) `moveTop()` alongside
 *    `setAlwaysOnTop` on every reassert, since a same-layer window can still
 *    end up stacked below another same-layer window that was more recently
 *    raised; (3) `reassertCrosshairOverlay()` is called from the main
 *    window's own 'blur' event (main.ts) — the moment our own window loses
 *    focus is the moment the player most likely just switched to the game,
 *    so reasserting right then (in addition to the timer) catches the
 *    highest-risk transition immediately rather than waiting out the
 *    interval. This only observes our own window's focus state — zero
 *    interaction with the game process, consistent with the zero-
 *    interaction stance above. NOT verifiable headlessly (no real KWin
 *    compositor in this sandbox) — needs real-world retest; if the overlay
 *    still drops behind after this, the next things to try are further up
 *    the level ladder documented below, but 'screen-saver' stays off-limits
 *    without stopping to confirm with whoever's driving this feature next,
 *    per the standing caution around that specific level.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, screen, BrowserWindow, type Display } from 'electron'
import { is } from '@electron-toolkit/utils'
import { isGameRunning } from './game-process.ts'
import { DESKTOP_ENTRY_ID } from './linux-desktop-integration.ts'
import {
  DEFAULT_CROSSHAIR_SETTINGS,
  sanitizeCrosshairSettings,
  scaledCrosshairSettings,
  shouldShowOverlay,
  type CrosshairSettings
} from './crosshair-settings.ts'

export type { CrosshairSettings, CrosshairShape } from './crosshair-settings.ts'

/** Must match overlay.html's <title> — used both as the actual window title and as the KWin-rule match target below (getKwinRuleInstructions). */
const OVERLAY_WINDOW_TITLE = 'crosshair-overlay'

const FILENAME = 'crosshair-settings.json'
const POLL_INTERVAL_MS = 1500
/**
 * How often the overlay re-asserts alwaysOnTop/moveTop/click-through while
 * shown — deliberately decoupled from POLL_INTERVAL_MS (which drives
 * isGameRunning(), a real OS process-list call not worth running this
 * often). This timer only calls cheap, no-syscall Electron window methods,
 * so a short interval costs nothing. See the module doc's KWin-stacking
 * gotcha for why this exists.
 */
const REASSERT_INTERVAL_MS = 250
/**
 * The always-on-top level requested while the overlay is shown. Electron
 * mirrors macOS's NSWindow level names for this API; on Linux the ordering
 * (increasing) is: normal < floating < torn-off-menu < modal-panel <
 * main-menu < status < pop-up-menu < screen-saver. 'pop-up-menu' is the
 * highest level *below* 'screen-saver' — tried here specifically because
 * plain 'normal'-level alwaysOnTop wasn't enough to survive KWin's
 * stacking once the game window took focus (see module doc). 'screen-saver'
 * is deliberately excluded: it's the level (paired with
 * setVisibleOnAllWorkspaces({ visibleOnFullScreen: true }), which this
 * module also still never calls) that caused the documented exclusive-
 * fullscreen freeze in CLAUDE.md's standing incident. This is a different,
 * lower level than that one, but is still unverified against a real KWin
 * session in this headless sandbox — needs real-world retest. If the
 * overlay still falls behind at this level, do not escalate further to
 * 'screen-saver' without stopping to confirm first; the KWin Rules fallback
 * (getKwinRuleInstructions) exists for exactly that case.
 */
const OVERLAY_ALWAYS_ON_TOP_LEVEL = 'pop-up-menu' as const

/**
 * Overlay window sizing — small and centered rather than fullscreen (per the
 * commercial-overlay pattern this follows, e.g. CrossOver): a smaller native
 * window means less surface for the compositor to blend, and a much smaller
 * blast radius for the X11 click-through regression documented above (a
 * failed setIgnoreMouseEvents blocks this small region, not the whole
 * screen). MIN is the floor for small/default crosshairs; the window grows
 * past it only as far as the current shape actually reaches, so a large
 * size/gap/thickness/outline combination never gets visually clipped. Capped
 * at MAX so a pathological settings combination can't regress back toward
 * "basically fullscreen".
 */
const OVERLAY_SIZE_MIN_PX = 200
const OVERLAY_SIZE_MAX_PX = 500
/** Padding beyond the crosshair's own geometric reach, so anti-aliasing/outline strokes never touch the window edge. */
const OVERLAY_SIZE_MARGIN_PX = 24

/**
 * __dirname is a real CJS global once bundled (electron-vite's main build
 * output — same as every other electron/modules file) and is always used
 * in production. The import.meta.url fallback only ever runs when this
 * module is loaded directly by Node's native ESM loader, with no bundler
 * involved (scripts/verify-crosshair-overlay.mts) — __dirname doesn't exist
 * in that mode. Rollup rewrites import.meta.url to a CJS-safe equivalent
 * when bundling to CJS output, so this costs nothing on the production path.
 */
const MODULE_DIR: string =
  typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
}

export interface CrosshairPlatformInfo {
  isWayland: boolean
  /** KDE Plasma/KWin specifically — gates whether the KWin Rules fallback UI (getKwinRuleInstructions) makes sense to show at all. */
  isKwin: boolean
  displays: DisplayInfo[]
}

/** The data Settings.tsx needs to build its own localized copy of the KWin Rules fallback instructions — see getKwinRuleInstructions. */
export interface KwinRuleInstructions {
  windowClass: string
  windowTitle: string
}

let settings: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS }
let overlayWindow: BrowserWindow | null = null
let timer: ReturnType<typeof setInterval> | null = null
let reassertTimer: ReturnType<typeof setInterval> | null = null
let currentlyShown = false
let wasRunning = false
/** Set by stopCrosshairOverlay(); guards tick() against resurrecting the overlay window (and thus the process) after shutdown has started — see its doc comment. */
let shuttingDown = false
/** Captured on each not-running -> running transition; see module doc's "Auto" heuristic. */
let autoDisplayId: number | null = null
let writeQueue: Promise<void> = Promise.resolve()
/**
 * Temporary alignment-guide toggle (M15 follow-up, 2026-08) — deliberately
 * in-memory only, never persisted to crosshair-settings.json: it's a debug
 * aid for verifying overlay centering, not a real setting, and always
 * starts off on a fresh launch. See drawAlignmentGuide in src/lib/crosshair.ts.
 */
let debugAlignmentGuide = false

function userDataDir(): string {
  return app.getPath('userData')
}

async function persist(): Promise<void> {
  const dest = join(userDataDir(), FILENAME)
  const snapshot = settings
  const next = writeQueue.then(async () => {
    await mkdir(userDataDir(), { recursive: true })
    const tmp = `${dest}.part`
    await writeFile(tmp, JSON.stringify(snapshot, null, 2))
    await rename(tmp, dest)
  })
  writeQueue = next.catch(() => {})
  return next
}

async function loadPersisted(): Promise<void> {
  try {
    const text = await readFile(join(userDataDir(), FILENAME), 'utf-8')
    const parsed = JSON.parse(text) as Partial<CrosshairSettings>
    settings = sanitizeCrosshairSettings(parsed, DEFAULT_CROSSHAIR_SETTINGS)
  } catch {
    settings = { ...DEFAULT_CROSSHAIR_SETTINGS }
  }
}

export function listDisplays(): DisplayInfo[] {
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id
  return displays.map((d, i) => ({
    id: d.id,
    label: `${i + 1}: ${d.size.width}×${d.size.height}`,
    primary: d.id === primaryId
  }))
}

/**
 * Env-var detection only (XDG_SESSION_TYPE / WAYLAND_DISPLAY, set by every
 * major desktop) — never anything that inspects other windows/processes. A
 * false negative just means the UI hint doesn't show; never a functional
 * difference, since alwaysOnTop is attempted identically either way.
 */
export function isWaylandSession(): boolean {
  if (process.platform !== 'linux') return false
  return process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY
}

/**
 * Env-var detection only (XDG_CURRENT_DESKTOP / KDE_FULL_SESSION, set by
 * every Plasma session regardless of X11 or Wayland) — same stance as
 * isWaylandSession() above, never anything that inspects other windows or
 * processes. Only used to decide whether the KWin Rules fallback UI
 * (getKwinRuleInstructions) makes sense to offer at all; a false negative
 * just hides that fallback on a KWin session we failed to detect, never a
 * functional difference in the overlay itself.
 */
export function isKwinSession(): boolean {
  if (process.platform !== 'linux') return false
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? '').toLowerCase()
  return desktop.includes('kde') || process.env.KDE_FULL_SESSION === 'true'
}

export function getCrosshairPlatformInfo(): CrosshairPlatformInfo {
  return { isWayland: isWaylandSession(), isKwin: isKwinSession(), displays: listDisplays() }
}

/**
 * Never writes ~/.config/kwinrulesrc ourselves (same "recommend, don't
 * write" stance as steam-launch-options.ts) — this only returns the two
 * values Settings.tsx needs to build its own localized step-by-step copy
 * text for KDE System Settings' Window Rules GUI. windowClass matches the
 * app's StartupWMClass (shared by every window this process creates, main
 * window included — see linux-desktop-integration.ts), so windowTitle is
 * included specifically so a rule can be scoped to *just* the overlay
 * window (its title is unique — "1.6X Launcher" is the main window's) rather
 * than accidentally forcing the main launcher window always-on-top too.
 */
export function getKwinRuleInstructions(): KwinRuleInstructions {
  return { windowClass: DESKTOP_ENTRY_ID, windowTitle: OVERLAY_WINDOW_TITLE }
}

function resolveTargetDisplay(): Display {
  const displays = screen.getAllDisplays()
  if (settings.displayId !== null) {
    const picked = displays.find((d) => d.id === settings.displayId)
    if (picked) return picked
  }
  if (autoDisplayId !== null) {
    const auto = displays.find((d) => d.id === autoDisplayId)
    if (auto) return auto
  }
  return screen.getPrimaryDisplay()
}

/**
 * Suggests a `scale` value (see crosshair-settings.ts's CrosshairSettings.scale
 * doc comment for the full rationale) from a game render resolution — used
 * both by Settings.tsx's explicit "game resolution" input and its
 * "auto-detect from Launch Options" button (fed from steam-launch-
 * options.ts's parsed -w/-h), which both just display/apply whatever this
 * returns rather than duplicating the math in the renderer (which has no
 * access to Electron's `screen` module anyway).
 *
 * Resolves the *current* target display exactly the way the real overlay
 * does (resolveTargetDisplay()) so the suggested number matches production
 * behavior exactly — no separate/approximate calculation path to drift out
 * of sync. `display.bounds` is DIP (device-independent pixels, per
 * Electron's documented screen API), while a game's -w/-h is a raw physical
 * pixel count with no DPI-awareness — multiplying by `scaleFactor` converts
 * the display's DIP width to physical pixels so both sides of the ratio are
 * in the same unit before dividing. Uses whichever axis (width or height)
 * yields the *smaller* ratio, matching an aspect-ratio-preserving upscale
 * (e.g. gamescope's default fit mode, or a GPU scaling mode configured to
 * preserve aspect ratio): the non-letterboxed axis is what actually
 * determines the real stretch factor, and using the other axis would
 * overestimate scale whenever the game's resolution doesn't share the
 * display's exact aspect ratio. Returns 1 (no adjustment) for invalid input
 * rather than throwing — this backs a live "as you type" UI readout, where
 * a momentarily-empty or partial number field is expected, not an error.
 */
export function computeSuggestedScale(gameWidth: number, gameHeight: number): number {
  if (!Number.isFinite(gameWidth) || gameWidth <= 0 || !Number.isFinite(gameHeight) || gameHeight <= 0) return 1
  const display = resolveTargetDisplay()
  const scaleX = (display.bounds.width * display.scaleFactor) / gameWidth
  const scaleY = (display.bounds.height * display.scaleFactor) / gameHeight
  return Math.min(scaleX, scaleY)
}

function overlayUrl(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return new URL('overlay.html', process.env['ELECTRON_RENDERER_URL']).toString()
  }
  return join(MODULE_DIR, '../renderer/overlay.html')
}

/** Exported (not just an internal helper) so scripts/verify-crosshair-overlay.mts can assert the window's real Electron-level properties and show/hide mechanics headlessly, in addition to internal use from tick(). */
export function ensureOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const initialSize = overlayWindowSize(settings)
  const win = new BrowserWindow({
    width: initialSize,
    height: initialSize,
    show: false,
    frame: false,
    transparent: true,
    // Belt-and-suspenders alongside transparent:true: an explicit zero-alpha
    // hex background is what actually gets Electron a real alpha channel on
    // some Linux/Wayland compositor + GPU combinations — without it,
    // transparent:true alone has been known to silently fall back to an
    // opaque (often black) surface, which over a fullscreen game looks
    // exactly like the freeze reported on first real test (2026-08).
    backgroundColor: '#00000000',
    hasShadow: false,
    // Deliberately NOT resizable: false (real-world finding, 2026-08,
    // investigated alongside a small residual centering offset): this
    // window has no visible frame/border to drag a resize handle on
    // (frame: false), never receives mouse input (setIgnoreMouseEvents),
    // and is never focusable — there is no user-facing way to resize it
    // regardless of this flag, so it served no purpose here. It's also a
    // real risk: some window managers translate `resizable: false` into an
    // EWMH min=max size hint that can be enforced more strictly than
    // Electron's own setBounds() calls expect, which would fight this
    // module's own programmatic resizing (overlayWindowSize/
    // computeOverlayBounds resize the window on nearly every settings/scale
    // change) — Electron's own bookkeeping (getBounds()) would report the
    // requested size while the WM silently keeps the window at an earlier
    // actual size, a "stale size" class of bug matching the shape of a real
    // centering-offset report. Removed as a no-downside hardening fix;
    // unconfirmed whether it was contributing to that specific report (the
    // offset there was asymmetric — X correct, Y off — and a stuck-size bug
    // would offset both axes equally, since this window is always square),
    // but there was no reason to keep it.
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(MODULE_DIR, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // Without this, a backgrounded (not-yet-shown, or hidden between game
      // sessions) overlay window gets Chromium's normal background frame
      // throttling — the renderer effectively freezes, so a settings change
      // applied while the game isn't running doesn't actually redraw the
      // canvas until the next real resize/show. Cheap to disable: this
      // window is never a heavy page, and it's never actually visible to
      // "save battery" on in the first place.
      backgroundThrottling: false
    }
  })
  // Deliberately NOT escalating to the 'screen-saver' always-on-top level or
  // setVisibleOnAllWorkspaces({ visibleOnFullScreen: true }) — both exist
  // specifically to force a window to composite above another app's
  // *exclusive fullscreen* surface, which is exactly the scenario that hard-
  // froze the game on first real test (2026-08): qconsole.log showed the
  // engine repeatedly recompiling/relinking shaders with no error, consistent
  // with the compositor fighting over the fullscreen surface and forcing GL
  // context loss/recreation rather than a crash. The constructor's
  // alwaysOnTop:true (default window level) is sufficient to sit above a
  // windowed/borderless game, which is the honest, already-documented
  // expectation for this feature (see module doc's Wayland note) — over
  // exclusive fullscreen it will now simply not show, rather than fight the
  // compositor for it. setVisibleOnAllWorkspaces(true) alone (no
  // visibleOnFullScreen option, which is macOS-specific anyway) is kept so
  // the overlay still follows the user across virtual desktops/workspaces.
  win.setIgnoreMouseEvents(true)
  win.setVisibleOnAllWorkspaces(true)

  const url = overlayUrl()
  // Best-effort: a load failure here (e.g. this module loaded outside its
  // normal bundled location, as scripts/verify-crosshair-overlay.mts does)
  // would otherwise surface as an unhandled rejection with nothing to
  // meaningfully recover — the window just stays blank/hidden.
  const loadPromise = url.startsWith('http') ? win.loadURL(url) : win.loadFile(url)
  loadPromise.catch(() => {})

  win.on('closed', () => {
    if (overlayWindow === win) overlayWindow = null
  })

  overlayWindow = win
  return win
}

/**
 * How far a crosshair actually reaches from its own center, given the
 * current shape/size/gap/thickness/outline — mirrors src/lib/crosshair.ts's
 * drawing geometry (cross arms extend gap+size+thickness/2; circle/dot
 * extend size(+thickness/2)/size/2 respectively) without importing it (that
 * module targets a 2D canvas context, not something this Node-side sizing
 * math needs). Outline adds a few px of stroke/fill padding on top.
 */
function crosshairReachPx(s: CrosshairSettings): number {
  const outlinePad = s.outline ? 4 : 0
  const crossReach = s.gap + s.size + s.thickness / 2
  const circleReach = s.size + s.thickness / 2
  const dotReach = s.size / 2
  return Math.max(crossReach, circleReach, dotReach) + outlinePad
}

/**
 * Exported for scripts/verify-crosshair-overlay.mts to assert sizing
 * directly, in addition to internal use from ensureOverlayWindow/
 * positionOverlay. Applies `scale` internally (via scaledCrosshairSettings)
 * so every caller can just pass the raw stored settings and get correctly
 * game-resolution-aware sizing without remembering to scale first.
 */
export function overlayWindowSize(s: CrosshairSettings): number {
  const needed = Math.ceil(crosshairReachPx(scaledCrosshairSettings(s)) * 2 + OVERLAY_SIZE_MARGIN_PX * 2)
  return Math.min(OVERLAY_SIZE_MAX_PX, Math.max(OVERLAY_SIZE_MIN_PX, needed))
}

/**
 * The overlay window itself stays small (see OVERLAY_SIZE_* above); offset
 * is realized by moving the *window* off display-center rather than by
 * drawing off-center within a small canvas (which would clip at the
 * offset range's extremes — up to ±300px against a ~200-500px window).
 * Clamped so the window can't be positioned partially off the target
 * display for an extreme offset on a small display. `scale` applies to
 * offsetX/offsetY here too (via scaledCrosshairSettings) — an off-center
 * crosshair should shift proportionally to the game's magnified content,
 * same reasoning as size/thickness/gap.
 *
 * **Gotcha (real-world finding, 2026-08):** centers on `display.workArea`,
 * not `display.bounds`. `bounds` is the full physical display, including
 * whatever's occluded by a panel/taskbar/dock; `workArea` is what's left
 * after the desktop environment reserves that space, and — critically —
 * is what a WM actually centers a normal window's content within. A
 * borderless CS 1.6 window ends up visually centered on the *workArea*
 * (the same as any other window), so an overlay centered on `bounds`
 * instead is offset from the game's own true visual center by exactly half
 * the panel's height/width, toward whichever edge the panel isn't on —
 * confirmed as the root cause of a real "crosshair sits noticeably below
 * screen center" report (KDE Plasma, bottom panel: workArea's height is
 * shorter than bounds' by the panel height P, so workArea's center sits P/2
 * *higher* than bounds' center — meaning a bounds-centered overlay, compared
 * against a workArea-centered game window, reads as pushed down by P/2).
 * The clamp bounds below use `workArea` too, for the same reason: an
 * extreme offset should stay within the same visually-meaningful region the
 * center itself is computed against, not slide into the panel-occluded
 * strip along `bounds`' outer edge.
 *
 * Deliberately does NOT multiply by `display.scaleFactor` here — unlike
 * computeSuggestedScale's DIP-vs-raw-game-pixel conversion (a genuine
 * cross-domain unit mismatch), `display.bounds`/`workArea` and
 * `BrowserWindow.setBounds()` are already both DIP-space by Electron's own
 * design, so they're unit-consistent with each other with no conversion
 * needed; introducing scaleFactor into this specific calculation would
 * double-scale the window's position on any HiDPI display, not fix
 * anything.
 */
export function computeOverlayBounds(display: Display, s: CrosshairSettings): { x: number; y: number; width: number; height: number } {
  const size = overlayWindowSize(s)
  const scaled = scaledCrosshairSettings(s)
  const area = display.workArea
  const targetCx = area.x + area.width / 2 + scaled.offsetX
  const targetCy = area.y + area.height / 2 + scaled.offsetY
  const minX = area.x
  const maxX = area.x + area.width - size
  const minY = area.y
  const maxY = area.y + area.height - size
  const x = Math.round(Math.min(maxX, Math.max(minX, targetCx - size / 2)))
  const y = Math.round(Math.min(maxY, Math.max(minY, targetCy - size / 2)))
  return { x, y, width: size, height: size }
}

/** Exported alongside ensureOverlayWindow for the same testability reason — see its doc comment. */
export function positionOverlay(win: BrowserWindow): void {
  win.setBounds(computeOverlayBounds(resolveTargetDisplay(), settings))
}

/**
 * The settings pushed to the overlay's own canvas are pre-scaled (size/
 * thickness/gap already multiplied by `scale`, itself reset to 1 — see
 * scaledCrosshairSettings) so the overlay renderer (src/overlay/main.ts)
 * doesn't need to know `scale` exists at all, same reasoning as offsetX/Y
 * below. offsetX/Y always carry as 0 — the offset is already baked into the
 * window's position (see computeOverlayBounds), so drawing it again inside
 * the canvas would apply it twice. Settings' live preview canvas
 * (Settings.tsx) is a separate, fixed-size UI element unrelated to this
 * window and applies scaledCrosshairSettings itself before drawing, which is
 * correct there (its offset isn't baked into any window position).
 */
function pushSettingsToOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const scaled = scaledCrosshairSettings(settings)
    overlayWindow.webContents.send('crosshair:settings', { ...scaled, offsetX: 0, offsetY: 0 })
  }
}

function pushDebugAlignmentToOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('crosshair:debug-alignment', debugAlignmentGuide)
  }
}

export function getCrosshairDebugAlignment(): boolean {
  return debugAlignmentGuide
}

/** Toggled from Settings' temporary "Alignment Guide" debug control — see the module-level doc comment on debugAlignmentGuide. */
export function setCrosshairDebugAlignment(enabled: boolean): void {
  debugAlignmentGuide = enabled
  pushDebugAlignmentToOverlay()
}

/**
 * Re-asserts click-through and top-most on a shown overlay window — called
 * from the fast reassertTimer, from tick() at the moment of first showing,
 * and from reassertCrosshairOverlay() (the main window's 'blur' handler in
 * main.ts). `moveTop()` alongside `setAlwaysOnTop` because a same-layer
 * window can still end up stacked below another window that was more
 * recently raised to the same layer — setAlwaysOnTop(true) alone re-flags
 * the window as "above" but doesn't necessarily move it to the top of that
 * layer's stack. See the module doc's KWin-stacking gotcha.
 */
function reassertOnTop(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, OVERLAY_ALWAYS_ON_TOP_LEVEL)
  win.moveTop()
}

/**
 * Exported so main.ts can call it from the main window's 'blur' event — the
 * moment our own window loses focus is the moment the player most likely
 * just switched to the game, the highest-risk transition for the overlay
 * falling behind. Safe no-op if the overlay isn't currently shown or has
 * been destroyed. Only ever observes our own window's focus state, never
 * the game's — consistent with this module's zero-interaction stance.
 */
export function reassertCrosshairOverlay(): void {
  if (currentlyShown && overlayWindow && !overlayWindow.isDestroyed()) {
    reassertOnTop(overlayWindow)
  }
}

function startReassertTimer(): void {
  if (reassertTimer) return
  reassertTimer = setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) reassertOnTop(overlayWindow)
  }, REASSERT_INTERVAL_MS)
}

function stopReassertTimer(): void {
  if (reassertTimer) {
    clearInterval(reassertTimer)
    reassertTimer = null
  }
}

async function tick(): Promise<void> {
  if (shuttingDown) return
  const running = await isGameRunning()
  if (running && !wasRunning) {
    autoDisplayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
  }
  wasRunning = running

  const shouldShow = shouldShowOverlay(settings, running)
  if (shouldShow === currentlyShown) return

  if (shouldShow) {
    const win = ensureOverlayWindow()
    positionOverlay(win)
    pushSettingsToOverlay()
    pushDebugAlignmentToOverlay()
    reassertOnTop(win)
    win.showInactive() // never steals focus from the game
    currentlyShown = true
    startReassertTimer()
  } else {
    stopReassertTimer()
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
    currentlyShown = false
  }
}

function startLoop(): void {
  if (timer) return
  timer = setInterval(() => {
    tick().catch(() => {})
  }, POLL_INTERVAL_MS)
  tick().catch(() => {})
}

export async function initCrosshairOverlay(): Promise<void> {
  await loadPersisted()
  startLoop()
}

/**
 * Stops the poll loop and destroys the overlay window (idempotent — safe to
 * call multiple times, or when no overlay window currently exists). Must be
 * called before the app can rely on window-all-closed/quit: the overlay is a
 * real BrowserWindow, so Electron counts it toward "windows still open" the
 * same as the main window, and window-all-closed never fires while it's
 * alive — this is what left the process running after the main window closed
 * on first real test (2026-08). Sets shuttingDown first so an in-flight
 * tick() (already past its own shuttingDown check, awaiting isGameRunning())
 * can't recreate the window afterward via ensureOverlayWindow() and undo the
 * shutdown — the guard against a stray overlay ever outliving the app.
 */
export function stopCrosshairOverlay(): void {
  shuttingDown = true
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  stopReassertTimer()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
  currentlyShown = false
}

export function getCrosshairSettings(): CrosshairSettings {
  return settings
}

export async function updateCrosshairSettings(partial: Partial<CrosshairSettings>): Promise<CrosshairSettings> {
  settings = sanitizeCrosshairSettings(partial, settings)
  await persist()
  pushSettingsToOverlay()
  // A displayId/offset change while already visible should take effect immediately, not on the next tick.
  if (currentlyShown && overlayWindow && !overlayWindow.isDestroyed()) {
    positionOverlay(overlayWindow)
  }
  return settings
}
