/**
 * Headless verification for electron/modules/linux-desktop-integration.ts's
 * pure logic (no Electron runtime, no touching the real
 * ~/.local/share/applications). Run with
 * `node scripts/verify-desktop-integration.mts`.
 *
 * `installDesktopEntry`/`removeDesktopEntry` themselves aren't exercised
 * here — they resolve the bundled icon path via `__dirname`, which is only
 * unambiguous inside the real electron-vite CJS bundle (same convention as
 * map-thumbnails.ts, already relied on elsewhere in this codebase), not
 * when this .ts file is loaded raw by Node outside that bundle. That path
 * resolution was instead confirmed directly against a real build: built
 * the AppImage (`npx electron-builder --linux --publish never`), listed
 * `resources/app.asar` (`resources/icon.png` present, asarUnpack redirects
 * it to `app.asar.unpacked/resources/icon.png` on real disk — confirmed
 * present there too), computed what `__dirname` for the bundled
 * `out/main/main.js` resolves `../../resources/icon.png` to, and confirmed
 * it lands on that exact unpacked file. What's actually bug-prone and worth
 * a repeatable check is the pure string-building below — a path with a
 * space (`process.env.APPIMAGE` on a real system routinely has one, e.g.
 * "~/Applications/1.6X Launcher.AppImage") is exactly the kind of input
 * that breaks naive Exec= quoting.
 */

import {
  DESKTOP_ENTRY_ID,
  buildDesktopEntryContents,
  getDesktopIntegrationStatus,
  isEligibleForDesktopIntegration
} from '../electron/modules/linux-desktop-integration.ts'

let failures = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

console.log('1. buildDesktopEntryContents: correctness of the actual file content')
{
  const contents = buildDesktopEntryContents('/home/user/Apps/1.6X Launcher.AppImage', '/home/user/.local/share/icons/com.cs16launcher.app.png')
  const lines = contents.split('\n')
  check('starts with [Desktop Entry]', lines[0] === '[Desktop Entry]')
  check('Name is set', lines.includes('Name=1.6X Launcher'))
  check(
    'Exec quotes a path containing a space, and carries --no-sandbox %U',
    lines.includes('Exec="/home/user/Apps/1.6X Launcher.AppImage" --no-sandbox %U')
  )
  check('Type=Application present', lines.includes('Type=Application'))
  check('Terminal=false present', lines.includes('Terminal=false'))
  check('Icon points at the absolute icon path (no theme lookup needed)', lines.includes('Icon=/home/user/.local/share/icons/com.cs16launcher.app.png'))
  check(`StartupWMClass matches DESKTOP_ENTRY_ID (${DESKTOP_ENTRY_ID})`, lines.includes(`StartupWMClass=${DESKTOP_ENTRY_ID}`))
  check('ends with a trailing newline', contents.endsWith('\n'))
}

console.log('2. buildDesktopEntryContents: Exec quoting of shell-meaningful characters')
{
  // A path containing a double quote, backslash, backtick, and dollar sign — each must
  // survive as literal characters inside the desktop file's Exec value, not be interpreted.
  const nasty = String.raw`/tmp/weird"path\with$(danger)\`and backtick.AppImage`
  const contents = buildDesktopEntryContents(nasty, '/tmp/icon.png')
  const execLine = contents.split('\n').find((l) => l.startsWith('Exec='))
  check('Exec line exists', !!execLine)
  check('embedded double quote is escaped', execLine?.includes('\\"path') ?? false)
  check('embedded backslash is escaped', execLine?.includes('\\\\with') ?? false)
  check('embedded dollar sign is escaped', execLine?.includes('\\$(danger)') ?? false)
  check('embedded backtick is escaped', execLine?.includes('\\`and') ?? false)
}

console.log('3. isEligibleForDesktopIntegration / getDesktopIntegrationStatus')
{
  const originalAppImage = process.env.APPIMAGE
  delete process.env.APPIMAGE
  check('not eligible without APPIMAGE set (this test only proves the env-var gate; platform is whatever this machine is)', !isEligibleForDesktopIntegration() || process.platform !== 'linux')

  process.env.APPIMAGE = '/tmp/fake.AppImage'
  const eligible = isEligibleForDesktopIntegration()
  check('eligible iff platform is linux', eligible === (process.platform === 'linux'))
  const status = getDesktopIntegrationStatus()
  check('status.eligible matches isEligibleForDesktopIntegration()', status.eligible === eligible)
  check('installed is never true when not eligible', eligible || status.installed === false)

  if (originalAppImage === undefined) delete process.env.APPIMAGE
  else process.env.APPIMAGE = originalAppImage
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
