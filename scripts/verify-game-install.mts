/**
 * Sandbox-safe verification for game-install.ts (install-source
 * decoupling milestone) and launch.ts's buildLaunchArgs. Every fixture
 * lives under a throwaway mkdtemp(tmpdir()) directory standing in for a
 * game install root — never the real install, per CLAUDE.md's sandbox-only
 * testing rule.
 *
 * Run under Electron (game-install.ts imports `app`/`dialog` for its
 * userData-relative persistence and folder-picker dialog; launch.ts pulls in
 * crosshair-overlay.ts, which imports `screen`/`BrowserWindow` — none of
 * this resolves under a plain `node` process):
 *
 *   ./node_modules/.bin/electron --disable-gpu --no-sandbox \
 *     --disable-software-rasterizer scripts/verify-game-install.mts
 *
 * Deliberately NOT covered here (same "documented, not silently skipped"
 * convention as crosshair-overlay.ts's isGameRunning() note): a scenario
 * with a *real* simultaneously-valid Steam install, since this sandbox has
 * none. Not a gap in what's actually proven, though — getActiveInstall's
 * manual-wins branch returns before ever consulting Steam's installed/
 * gamePath fields (only steamPath/steamGamePath/steamInstalled are carried
 * along for informational display), so "manual wins over Steam" is a
 * structural property of the code path, verified below by confirming the
 * decision itself never depends on whatever detectSteam() happened to find
 * in this environment.
 */

import { app } from 'electron'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
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

async function freshInstallDir(prefix: string, opts: { cstrike?: boolean; binary?: 'hl_linux' | 'hl.sh' | 'none' } = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  if (opts.cstrike !== false) await mkdir(join(dir, 'cstrike'), { recursive: true })
  if (opts.binary === 'hl_linux' || opts.binary === undefined) await writeFile(join(dir, 'hl_linux'), '')
  else if (opts.binary === 'hl.sh') await writeFile(join(dir, 'hl.sh'), '')
  return dir
}

async function main(): Promise<void> {
  const userDataTmp = await mkdtemp(join(tmpdir(), 'game-install-userdata-'))
  app.setPath('userData', userDataTmp)
  await app.whenReady()

  const {
    resolveEngineBinary,
    validateInstallPath,
    initGameInstall,
    getManualInstallPath,
    setManualInstallPathIfValid,
    getActiveInstall
  } = await import('../electron/modules/game-install.ts')
  const { buildLaunchArgs } = await import('../electron/modules/launch.ts')
  const { detectSteam } = await import('../electron/modules/steam-detect.ts')

  console.log('== resolveEngineBinary / validateInstallPath ==')
  {
    const valid = await freshInstallDir('gi-valid-')
    const v = validateInstallPath(valid)
    check('a real cstrike/ + hl_linux dir validates', v.valid && v.exists && v.hasCstrike && v.hasEngineBinary)
    check('binaryPath points at the actual binary', v.binaryPath === join(valid, 'hl_linux'))
    await rm(valid, { recursive: true, force: true })
  }
  {
    const shWrapper = await freshInstallDir('gi-shwrapper-', { binary: 'hl.sh' })
    check('hl.sh is also recognized as a valid engine binary', validateInstallPath(shWrapper).valid)
    await rm(shWrapper, { recursive: true, force: true })
  }
  {
    const noCstrike = await freshInstallDir('gi-nocstrike-', { cstrike: false })
    const v = validateInstallPath(noCstrike)
    check('missing cstrike/ fails validation', !v.valid && v.exists && !v.hasCstrike)
    await rm(noCstrike, { recursive: true, force: true })
  }
  {
    const noBinary = await freshInstallDir('gi-nobinary-', { binary: 'none' })
    const v = validateInstallPath(noBinary)
    check('missing engine binary fails validation', !v.valid && v.hasCstrike && !v.hasEngineBinary)
    check('resolveEngineBinary returns null when nothing matches', resolveEngineBinary(noBinary) === null)
    await rm(noBinary, { recursive: true, force: true })
  }
  {
    const v = validateInstallPath(join(tmpdir(), 'gi-does-not-exist-at-all'))
    check('a nonexistent path reports exists:false, not a throw', !v.valid && !v.exists && !v.hasCstrike && !v.hasEngineBinary)
  }

  console.log('== manual path persistence ==')
  {
    await initGameInstall()
    check('no persisted file yet -> manual path starts null', getManualInstallPath() === null)

    const valid = await freshInstallDir('gi-persist-valid-')
    const setValid = await setManualInstallPathIfValid(valid)
    check('setting a valid path saves it', setValid.saved && getManualInstallPath() === valid)

    const invalid = await freshInstallDir('gi-persist-invalid-', { cstrike: false, binary: 'none' })
    const setInvalid = await setManualInstallPathIfValid(invalid)
    check('setting an invalid path refuses to save', !setInvalid.saved)
    check('the previous valid path is untouched by the refused set', getManualInstallPath() === valid)

    const cleared = await setManualInstallPathIfValid(null)
    check('clearing always succeeds', cleared.saved && getManualInstallPath() === null)

    await rm(valid, { recursive: true, force: true })
    await rm(invalid, { recursive: true, force: true })
  }

  console.log('== getActiveInstall() resolution ==')
  {
    await setManualInstallPathIfValid(null)
    const steam = await detectSteam()
    const status = await getActiveInstall()
    check('with no manual override, steam fields are carried through verbatim', status.steamPath === steam.steamPath && status.steamGamePath === steam.gamePath && status.steamInstalled === steam.installed)
    check('with no manual override, source/installed match Steam detection', steam.installed ? status.source === 'steam' && status.gamePath === steam.gamePath : status.source === null && !status.installed)
    check('manualPath is null when nothing is configured', status.manualPath === null && status.manualPathProblem === null)
  }
  {
    const valid = await freshInstallDir('gi-active-valid-')
    await setManualInstallPathIfValid(valid)
    const status = await getActiveInstall()
    check('a valid manual override is active regardless of Steam status', status.installed && status.source === 'manual' && status.gamePath === valid)
    check('manualPath reflects the configured override with no problem', status.manualPath === valid && status.manualPathProblem === null)
    await rm(valid, { recursive: true, force: true })
  }
  {
    const missingCstrike = await freshInstallDir('gi-active-nocstrike-', { cstrike: false })
    // setManualInstallPathIfValid refuses to persist an invalid path (by design), so to exercise
    // "a previously-valid override that broke later" we persist while valid, then break it on disk.
    await mkdir(join(missingCstrike, 'cstrike'))
    await setManualInstallPathIfValid(missingCstrike)
    await rm(join(missingCstrike, 'cstrike'), { recursive: true, force: true })

    const status = await getActiveInstall()
    check('a manual override that broke after being set reports installed:false, not a silent Steam fallback', !status.installed && status.source === null)
    check('manualPathProblem is missing-cstrike', status.manualPathProblem === 'missing-cstrike')
    check('manualPath still reports the configured (now-broken) path for the UI to show', status.manualPath === missingCstrike)
    await rm(missingCstrike, { recursive: true, force: true })
  }
  {
    const dir = join(tmpdir(), 'gi-active-notfound-should-not-exist')
    await mkdir(dir)
    await mkdir(join(dir, 'cstrike'))
    await writeFile(join(dir, 'hl_linux'), '')
    await setManualInstallPathIfValid(dir)
    await rm(dir, { recursive: true, force: true }) // now genuinely gone

    const status = await getActiveInstall()
    check('a manual override pointing at a now-deleted folder reports not-found', status.manualPathProblem === 'not-found' && !status.installed)
  }
  {
    const missingBinary = await freshInstallDir('gi-active-nobinary-', { binary: 'none' })
    // Same "set while valid, then break" approach as above.
    await writeFile(join(missingBinary, 'hl_linux'), '')
    await setManualInstallPathIfValid(missingBinary)
    await rm(join(missingBinary, 'hl_linux'), { force: true })

    const status = await getActiveInstall()
    check('a manual override missing its engine binary reports missing-binary', status.manualPathProblem === 'missing-binary')
    await rm(missingBinary, { recursive: true, force: true })
  }
  await setManualInstallPathIfValid(null)

  console.log('== buildLaunchArgs (pure, launch.ts) ==')
  {
    check('idle: only -condebug', JSON.stringify(buildLaunchArgs({ overlayEnabled: false })) === JSON.stringify(['-condebug']))
    check(
      'overlay enabled: adds -window -noborder',
      JSON.stringify(buildLaunchArgs({ overlayEnabled: true })) === JSON.stringify(['-condebug', '-window', '-noborder'])
    )
    check(
      'connecting: appends +connect ip:port',
      JSON.stringify(buildLaunchArgs({ overlayEnabled: false, connectTo: { ip: '1.2.3.4', port: 27015 } })) ===
        JSON.stringify(['-condebug', '+connect', '1.2.3.4:27015'])
    )
    check(
      'overlay + connect together',
      JSON.stringify(buildLaunchArgs({ overlayEnabled: true, connectTo: { ip: '1.2.3.4', port: 27015 } })) ===
        JSON.stringify(['-condebug', '-window', '-noborder', '+connect', '1.2.3.4:27015'])
    )
  }

  await rm(userDataTmp, { recursive: true, force: true })
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  app.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
