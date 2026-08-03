/**
 * linux-desktop-integration — optional, opt-in installation of a `.desktop`
 * entry for AppImage runs on Linux (M12 follow-up).
 *
 * Root cause this exists for: confirmed via a real build (`npx electron-builder
 * --linux --publish never`, then `--appimage-extract`) that the AppImage runs
 * completely unintegrated by default — nothing is ever written to
 * `~/.local/share/applications`, so desktop environments have no installed
 * entry to associate the running window with, no matter what app_id the
 * window itself reports (see main.ts's `app.setDesktopName()`, added in the
 * previous fix — necessary but not sufficient). Concretely, this is what
 * blocks Wayland xdg-activation from granting our own window-raise request
 * when a background notification (M12) is clicked: KWin has nothing
 * registered to check the request's app_id against, so it refuses it — not
 * a bug, by design. See CLAUDE.md's Wayland notification-activation gotcha.
 *
 * Never installed automatically — only via explicit user action (Settings'
 * "Desktop integration" row, or the one-time first-run banner in
 * DesktopIntegrationNotice.tsx). Only offered when actually running as an
 * AppImage: `process.env.APPIMAGE` (set by the AppImage runtime itself to
 * its own absolute path) is what `Exec=` needs to point at, and a `npm run
 * dev` run has no such stable, launchable path worth registering.
 *
 * The icon is copied out to a stable location and referenced by absolute
 * path in `Icon=` (freedesktop's Icon key accepts either an icon-theme name
 * or an absolute path) — deliberately not going through the hicolor icon
 * theme + cache dance, since the source file only exists inside the
 * AppImage's transient squashfs mount while this process is running, and an
 * icon-theme lookup needs a cache refresh most distros won't trigger for us.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { mkdir, copyFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const execFileAsync = promisify(execFile)

/** Must match main.ts's DESKTOP_NAME (minus the .desktop suffix) and the StartupWMClass it implies. */
export const DESKTOP_ENTRY_ID = 'com.cs16launcher.app'
/** Must match electron-builder.yml's productName. */
const DISPLAY_NAME = '1.6X Launcher'

const DESKTOP_FILENAME = `${DESKTOP_ENTRY_ID}.desktop`
const ICON_FILENAME = `${DESKTOP_ENTRY_ID}.png`

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
}

function desktopEntryPath(): string {
  return join(xdgDataHome(), 'applications', DESKTOP_FILENAME)
}

function iconDestPath(): string {
  return join(xdgDataHome(), 'icons', ICON_FILENAME)
}

/** Only a real AppImage run has a stable path worth registering — dev runs don't. */
export function isEligibleForDesktopIntegration(): boolean {
  return process.platform === 'linux' && !!process.env.APPIMAGE
}

export function isDesktopEntryInstalled(): boolean {
  return existsSync(desktopEntryPath())
}

export function getDesktopIntegrationStatus(): { eligible: boolean; installed: boolean } {
  return { eligible: isEligibleForDesktopIntegration(), installed: isEligibleForDesktopIntegration() && isDesktopEntryInstalled() }
}

/** Freedesktop desktop-entry-spec string escaping (\\, \n, \r, \t) — same rules electron-builder itself uses. */
function desktopStringEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
}

/** Double-quoted per the Exec key spec so a path containing spaces/$/`/" is not misinterpreted. */
function desktopExecQuote(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
  return `"${escaped}"`
}

/**
 * Pure (no fs/electron access) so it's directly testable — see
 * scripts/verify-desktop-integration.mts. Mirrors the --no-sandbox flag
 * electron-builder's own bundled (unused-by-us) .desktop Exec line already
 * carries, for parity between a direct AppImage run and a menu launch.
 */
export function buildDesktopEntryContents(appImagePath: string, iconPath: string): string {
  const lines = [
    '[Desktop Entry]',
    `Name=${desktopStringEscape(DISPLAY_NAME)}`,
    `Exec=${desktopExecQuote(appImagePath)} --no-sandbox %U`,
    'Terminal=false',
    'Type=Application',
    `Icon=${iconPath}`,
    'Categories=Game;',
    `StartupWMClass=${DESKTOP_ENTRY_ID}`
  ]
  return lines.join('\n') + '\n'
}

/** Best-effort — not present on every distro, and most desktop environments pick up new entries via inotify anyway. */
async function refreshDesktopDatabase(): Promise<void> {
  try {
    await execFileAsync('update-desktop-database', [join(xdgDataHome(), 'applications')])
  } catch {
    // ignore — see comment above
  }
}

export async function installDesktopEntry(): Promise<void> {
  if (!isEligibleForDesktopIntegration()) {
    throw new Error('Desktop integration is only available when running the packaged Linux AppImage')
  }
  const appImagePath = process.env.APPIMAGE as string

  const iconSrc = join(__dirname, '../../resources/icon.png')
  const iconDest = iconDestPath()
  await mkdir(dirname(iconDest), { recursive: true })
  await copyFile(iconSrc, iconDest)

  const entryDest = desktopEntryPath()
  await mkdir(dirname(entryDest), { recursive: true })
  await writeFile(entryDest, buildDesktopEntryContents(appImagePath, iconDest))

  await refreshDesktopDatabase()
}

export async function removeDesktopEntry(): Promise<void> {
  await unlink(desktopEntryPath()).catch(() => {})
  await unlink(iconDestPath()).catch(() => {})
  await refreshDesktopDatabase()
}
