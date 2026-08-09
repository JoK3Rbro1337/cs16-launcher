/**
 * Sandbox-safe verification for native-crosshair.ts (M15 follow-up).
 * Every fixture lives under a throwaway mkdtemp(tmpdir()) directory standing
 * in for a game install root — never the real install, per CLAUDE.md's
 * sandbox-only testing rule.
 *
 * Run under Electron (native-crosshair.ts imports `app` from 'electron' for
 * its userData-relative settings persistence — a plain `node` run can't
 * resolve that import even for the parts of the module that don't use it):
 *
 *   ./node_modules/.bin/electron --disable-gpu --no-sandbox \
 *     --disable-software-rasterizer scripts/verify-native-crosshair.mts
 *
 * Covers: the leaf cfg's generated text (cvar values only, never anything
 * exec/alias/connect-shaped — see native-crosshair-settings.ts's doc
 * comment on why that's structural, not just tested-for), applyNativeCrosshair
 * writing/removing its own independently-delimited block in both managed
 * targets, and — the actually load-bearing check — that its block and
 * content-sync.ts's own separately-marked managed block coexist in the same
 * file without either clobbering the other or the player's own lines.
 */

import { app } from 'electron'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
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

async function freshSandbox(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  await mkdir(join(dir, 'cstrike'), { recursive: true })
  return dir
}

async function readCfgIfExists(gamePath: string, name: string): Promise<string | null> {
  try {
    return await readFile(join(gamePath, 'cstrike', name), 'utf-8')
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const userDataTmp = await mkdtemp(join(tmpdir(), 'native-crosshair-userdata-'))
  app.setPath('userData', userDataTmp)
  await app.whenReady()

  const { DEFAULT_NATIVE_CROSSHAIR_SETTINGS, buildNativeCrosshairCfgText, sanitizeNativeCrosshairSettings } = await import(
    '../electron/modules/native-crosshair-settings.ts'
  )
  const { applyNativeCrosshair } = await import('../electron/modules/native-crosshair.ts')
  const { syncManagedExecTargets } = await import('../electron/modules/content-sync.ts')

  console.log('== generated cfg text: cvars only, never exec-shaped ==')
  const settings = sanitizeNativeCrosshairSettings({ enabled: true, color: '#32fa14', size: 'large', translucent: true, dynamic: false })
  const cfgText = buildNativeCrosshairCfgText(settings)
  check('color converts hex to "r g b"', cfgText.includes('cl_crosshair_color "50 250 20"'))
  check('size cvar set', cfgText.includes('cl_crosshair_size "large"'))
  check('translucent cvar set to 1', cfgText.includes('cl_crosshair_translucent "1"'))
  check('dynamic cvar set to 0', cfgText.includes('cl_dynamiccrosshair "0"'))
  check('never contains an exec/alias/connect/rcon statement', !/\b(exec|alias|connect|rcon)\b/i.test(cfgText))

  console.log('\n== applyNativeCrosshair: write, coexistence with content-sync\'s own block, and removal ==')
  {
    const dir = await freshSandbox('native-crosshair-verify-')

    // A player's own pre-existing userconfig.cfg content must survive untouched.
    await writeFile(join(dir, 'cstrike', 'userconfig.cfg'), ['// my own line', 'sensitivity "2.5"', ''].join('\n'))

    // content-sync's own managed block goes in first, simulating a config variant already active.
    await syncManagedExecTargets(dir, ['my-variant.cfg'])

    await applyNativeCrosshair(dir, settings)

    const leaf = await readCfgIfExists(dir, '16x-crosshair.cfg')
    check('leaf cfg file was written', leaf !== null && leaf.includes('cl_crosshair_size "large"'))

    const userconfig = await readCfgIfExists(dir, 'userconfig.cfg')
    check('player\'s own pre-existing line survives untouched', !!userconfig && userconfig.includes('sensitivity "2.5"'))
    check('content-sync\'s managed block (its own markers) is still present', !!userconfig && userconfig.includes('exec my-variant.cfg'))
    check('native-crosshair\'s own block is present with its own markers', !!userconfig && userconfig.includes('exec 16x-crosshair.cfg'))
    check(
      'both blocks appear exactly once each (no duplication from re-running apply)',
      (userconfig?.match(/exec my-variant\.cfg/g)?.length ?? 0) === 1 && (userconfig?.match(/exec 16x-crosshair\.cfg/g)?.length ?? 0) === 1
    )

    const autoexec = await readCfgIfExists(dir, 'autoexec.cfg')
    check('autoexec.cfg got both blocks too (same two-target convention as content-sync)', !!autoexec && autoexec.includes('exec 16x-crosshair.cfg') && autoexec.includes('exec my-variant.cfg'))

    // Re-applying with identical settings must be a no-op write (idempotent).
    await applyNativeCrosshair(dir, settings)
    const userconfigAfterReapply = await readCfgIfExists(dir, 'userconfig.cfg')
    check('re-applying identical settings does not duplicate the block', userconfigAfterReapply === userconfig)

    // Disabling removes native-crosshair's own block only.
    const disabled = sanitizeNativeCrosshairSettings({ enabled: false }, settings)
    await applyNativeCrosshair(dir, disabled)
    const userconfigAfterDisable = await readCfgIfExists(dir, 'userconfig.cfg')
    check('disabling removes native-crosshair\'s own block', !!userconfigAfterDisable && !userconfigAfterDisable.includes('exec 16x-crosshair.cfg'))
    check('disabling leaves content-sync\'s block and the player\'s own line untouched', !!userconfigAfterDisable && userconfigAfterDisable.includes('exec my-variant.cfg') && userconfigAfterDisable.includes('sensitivity "2.5"'))

    await rm(dir, { recursive: true, force: true })
  }

  console.log('\n== applyNativeCrosshair on a fresh install (no pre-existing managed files at all) ==')
  {
    const dir = await freshSandbox('native-crosshair-verify-fresh-')
    await applyNativeCrosshair(dir, DEFAULT_NATIVE_CROSSHAIR_SETTINGS)
    check('DEFAULT settings (enabled: false) writes no block at all', (await readCfgIfExists(dir, 'userconfig.cfg')) === null)

    const enabledDefaults = sanitizeNativeCrosshairSettings({ enabled: true }, DEFAULT_NATIVE_CROSSHAIR_SETTINGS)
    await applyNativeCrosshair(dir, enabledDefaults)
    const userconfig = await readCfgIfExists(dir, 'userconfig.cfg')
    check('enabling from scratch creates the managed block cleanly on a file that never existed', !!userconfig && userconfig.includes('exec 16x-crosshair.cfg'))

    await rm(dir, { recursive: true, force: true })
  }

  await rm(userDataTmp, { recursive: true, force: true })
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  app.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
