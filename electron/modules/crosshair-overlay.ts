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
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, screen, BrowserWindow, type Display } from 'electron'
import { is } from '@electron-toolkit/utils'
import { isGameRunning } from './game-process.ts'
import {
  DEFAULT_CROSSHAIR_SETTINGS,
  sanitizeCrosshairSettings,
  shouldShowOverlay,
  type CrosshairSettings
} from './crosshair-settings.ts'

export type { CrosshairSettings, CrosshairShape } from './crosshair-settings.ts'

const FILENAME = 'crosshair-settings.json'
const POLL_INTERVAL_MS = 1500

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
  displays: DisplayInfo[]
}

let settings: CrosshairSettings = { ...DEFAULT_CROSSHAIR_SETTINGS }
let overlayWindow: BrowserWindow | null = null
let timer: ReturnType<typeof setInterval> | null = null
let currentlyShown = false
let wasRunning = false
/** Captured on each not-running -> running transition; see module doc's "Auto" heuristic. */
let autoDisplayId: number | null = null
let writeQueue: Promise<void> = Promise.resolve()

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

export function getCrosshairPlatformInfo(): CrosshairPlatformInfo {
  return { isWayland: isWaylandSession(), displays: listDisplays() }
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

function overlayUrl(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return new URL('overlay.html', process.env['ELECTRON_RENDERER_URL']).toString()
  }
  return join(MODULE_DIR, '../renderer/overlay.html')
}

/** Exported (not just an internal helper) so scripts/verify-crosshair-overlay.mts can assert the window's real Electron-level properties and show/hide mechanics headlessly, in addition to internal use from tick(). */
export function ensureOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
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
      nodeIntegration: false
    }
  })
  // The constructor's alwaysOnTop:true is the base behavior; the 'screen-saver'
  // level is what actually wins over other apps' own always-on-top/fullscreen
  // windows on platforms that support window levels (macOS reliably; Linux
  // compositor-dependent — see the module doc's Wayland note).
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

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

/** Exported alongside ensureOverlayWindow for the same testability reason — see its doc comment. */
export function positionOverlay(win: BrowserWindow): void {
  win.setBounds(resolveTargetDisplay().bounds)
}

function pushSettingsToOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('crosshair:settings', settings)
  }
}

async function tick(): Promise<void> {
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
    win.showInactive() // never steals focus from the game
    currentlyShown = true
  } else if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
    currentlyShown = false
  } else {
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
