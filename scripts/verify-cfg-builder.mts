/**
 * Sandbox-safe verification for M14's CFG Builder (cfg-builder-settings.ts +
 * cfg-builder.ts). Every fixture lives under a throwaway mkdtemp(tmpdir())
 * directory standing in for a game install root — never the real install,
 * per CLAUDE.md's sandbox-only testing rule.
 *
 * Run under Electron (cfg-builder.ts imports `app`/`dialog` from 'electron'
 * for its userData-relative settings persistence and save-file dialog — a
 * plain `node` run can't resolve that import even for the parts of the
 * module that don't use it, same as verify-native-crosshair.mts):
 *
 *   ./node_modules/.bin/electron --disable-gpu --no-sandbox \
 *     --disable-software-rasterizer scripts/verify-cfg-builder.mts
 *
 * Covers: generation correctness (cvar/bind lines, never exec/alias/
 * unbindall), range clamping/validation, custom-bind sanitization (invalid
 * key/quote/empty command dropped), preset-text parsing round-trip (against
 * both a synthetic cfg and a real shipped content/slots/config/*.cfg, read
 * directly off disk rather than fetched — see the note below on what's NOT
 * covered), the diff-vs-base indicator, the scanner gate refusing to write
 * anything on a critical finding, and three-way managed-block coexistence
 * with native-crosshair.ts's and content-sync.ts's own independently-marked
 * blocks in the same autoexec.cfg/userconfig.cfg — plus a player's own line.
 *
 * Deliberately NOT covered here (both are thin, low-risk wrappers, and
 * exercising them for real would mean either a live network fetch or a
 * user-interactive save dialog, neither appropriate for a headless verify
 * script): loadCfgBuilderPreset's fetch() call itself (its post-fetch logic
 * — merge + parse + sanitize — is exercised directly via
 * parseCfgBuilderBaseFromText below), and exportCfgBuilderFile's
 * dialog.showSaveDialog.
 */

import { app } from 'electron'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

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
  const userDataTmp = await mkdtemp(join(tmpdir(), 'cfg-builder-userdata-'))
  app.setPath('userData', userDataTmp)
  await app.whenReady()

  const {
    NUMBER_FIELDS,
    BOOL_FIELDS,
    BIND_ACTIONS,
    DEFAULT_CFG_BUILDER_SETTINGS,
    defaultCfgBuilderSettings,
    sanitizeCfgBuilderSettings,
    buildCfgBuilderCfgText,
    parseCfgBuilderBaseFromText,
    diffCfgBuilderSettings,
    isValidKeyName
  } = await import('../electron/modules/cfg-builder-settings.ts')

  const { scanConfigFile } = await import('../electron/modules/config-scanner.ts')
  const { syncManagedExecTargets } = await import('../electron/modules/content-sync.ts')
  const { applyNativeCrosshair } = await import('../electron/modules/native-crosshair.ts')
  const { DEFAULT_NATIVE_CROSSHAIR_SETTINGS, sanitizeNativeCrosshairSettings } = await import(
    '../electron/modules/native-crosshair-settings.ts'
  )
  const { applyCfgBuilderToPath, removeCfgBuilderFromPath } = await import('../electron/modules/cfg-builder.ts')

  console.log('== generation: default settings ==')
  {
    const defaults = defaultCfgBuilderSettings()
    const text = buildCfgBuilderCfgText(defaults)
    const findings = scanConfigFile({ path: 'cstrike/16x-cfgbuilder.cfg', text })

    check('every NUMBER_FIELDS key appears as a cvar line', NUMBER_FIELDS.every((f) => new RegExp(`^${f.key} "`, 'm').test(text)))
    check('every BOOL_FIELDS key appears as a cvar line', BOOL_FIELDS.every((f) => new RegExp(`^${f.key} "`, 'm').test(text)))
    check('every default-keyed BIND_ACTIONS entry appears as a bind line', BIND_ACTIONS.every((a) => text.includes(`bind "${a.defaultKey}" "${a.command}"`)))
    check('never contains exec/alias/unbindall (structurally can\'t enter the exec-cycle hazard)', !/\b(exec|alias|unbindall)\b/i.test(text))
    check('scans clean (zero findings) — defaults are entirely curated-safe', findings.length === 0)
  }

  console.log('== range clamping / validation ==')
  {
    const sensitivityField = NUMBER_FIELDS.find((f) => f.key === 'sensitivity')!
    const clampedHigh = sanitizeCfgBuilderSettings({ sensitivity: 9999 })
    check('out-of-range number clamps to max', clampedHigh.sensitivity === sensitivityField.max)
    const clampedLow = sanitizeCfgBuilderSettings({ sensitivity: -50 })
    check('out-of-range number clamps to min', clampedLow.sensitivity === sensitivityField.min)
    const nonFinite = sanitizeCfgBuilderSettings({ fps_max: Number.NaN }, DEFAULT_CFG_BUILDER_SETTINGS)
    check('non-finite number falls back to base value, not a crash', nonFinite.fps_max === DEFAULT_CFG_BUILDER_SETTINGS.fps_max)
    const boolCoerced = sanitizeCfgBuilderSettings({ gl_vsync: 1 as unknown as boolean })
    check('truthy non-boolean coerces to boolean', boolCoerced.gl_vsync === true)

    check('isValidKeyName accepts lowercase alnum/underscore', isValidKeyName('space') && isValidKeyName('kp_end') && isValidKeyName('f12'))
    check('isValidKeyName rejects quotes/semicolons/uppercase', !isValidKeyName('"x') && !isValidKeyName('a;b') && !isValidKeyName('SPACE'))

    const invalidBindKey = sanitizeCfgBuilderSettings({ binds: { ...DEFAULT_CFG_BUILDER_SETTINGS.binds, jump: 'not valid!' } })
    check('invalid curated bind key falls back to base', invalidBindKey.binds.jump === DEFAULT_CFG_BUILDER_SETTINGS.binds.jump)
    const clearedBindKey = sanitizeCfgBuilderSettings({ binds: { ...DEFAULT_CFG_BUILDER_SETTINGS.binds, jump: '' } })
    check('empty string is a valid "unbound" curated bind key', clearedBindKey.binds.jump === '')
  }

  console.log('== custom bind sanitization ==')
  {
    const withQuote = sanitizeCfgBuilderSettings({ customBinds: [{ key: 'j', command: 'echo "hi"' }] })
    check('a command containing a double-quote is dropped entirely (would break bind "key" "cmd" quoting)', withQuote.customBinds.length === 0)

    const withInvalidKey = sanitizeCfgBuilderSettings({ customBinds: [{ key: 'F1!', command: 'echo hi' }] })
    check('an invalid key drops the entry', withInvalidKey.customBinds.length === 0)

    const withEmptyCommand = sanitizeCfgBuilderSettings({ customBinds: [{ key: 'j', command: '   ' }] })
    check('a blank/whitespace-only command drops the entry', withEmptyCommand.customBinds.length === 0)

    const valid = sanitizeCfgBuilderSettings({ customBinds: [{ key: 'F6', command: '  say hello  ' }] })
    check('a valid entry survives with key lowercased and command trimmed', valid.customBinds.length === 1 && valid.customBinds[0].key === 'f6' && valid.customBinds[0].command === 'say hello')

    const tooMany = sanitizeCfgBuilderSettings({ customBinds: Array.from({ length: 80 }, (_, i) => ({ key: `f${i % 9}`, command: `echo ${i}` })) })
    check('customBinds list is capped', tooMany.customBinds.length <= 50)

    const newlineFolded = sanitizeCfgBuilderSettings({ customBinds: [{ key: 'j', command: 'echo a\necho b' }] })
    check('a newline in a command is folded to a space, not kept as a raw line break', newlineFolded.customBinds[0]?.command === 'echo a echo b')
  }

  console.log('== preset parsing round-trip ==')
  {
    const original = sanitizeCfgBuilderSettings({
      sensitivity: 2.5,
      rate: 30000,
      cl_lc: false,
      binds: { ...DEFAULT_CFG_BUILDER_SETTINGS.binds, jump: 'k' },
      customBinds: [{ key: 'f9', command: 'say gg' }]
    })
    const text = buildCfgBuilderCfgText(original)
    const parsed = parseCfgBuilderBaseFromText(text)
    const roundTripped = sanitizeCfgBuilderSettings(parsed, DEFAULT_CFG_BUILDER_SETTINGS)

    check('numeric field round-trips through generate -> parse -> sanitize', roundTripped.sensitivity === 2.5 && roundTripped.rate === 30000)
    check('boolean field round-trips', roundTripped.cl_lc === false)
    check('curated bind round-trips to its rebound key', roundTripped.binds.jump === 'k')
    check('custom bind round-trips into customBinds', roundTripped.customBinds.some((b) => b.key === 'f9' && b.command === 'say gg'))

    // A real shipped config — not fetched (see module doc comment on what's
    // deliberately not covered), just read directly off disk to prove the
    // parser survives real-world cfg syntax (comments, unrelated cvars,
    // player-authored binds this builder doesn't curate) without throwing.
    const shipped = await readFile(join(SCRIPT_DIR, '..', 'content', 'slots', 'config', 'steam-default', 'cstrike', 'steam-default.cfg'), 'utf-8').catch(
      () => null
    )
    if (shipped !== null) {
      let threw = false
      let parsedShipped: Record<string, unknown> = {}
      try {
        parsedShipped = parseCfgBuilderBaseFromText(shipped)
      } catch {
        threw = true
      }
      check('parsing a real shipped cfg never throws', !threw)
      check('parsing a real shipped cfg produces a sanitizable result', !!sanitizeCfgBuilderSettings(parsedShipped, DEFAULT_CFG_BUILDER_SETTINGS))
    } else {
      console.log('  ..   (skipped: content/slots/config/steam-default not present in this checkout)')
    }
  }

  console.log('== diff vs. base ==')
  {
    const base = DEFAULT_CFG_BUILDER_SETTINGS
    const changed = sanitizeCfgBuilderSettings(
      { sensitivity: 5, binds: { ...base.binds, jump: 'k' } },
      base
    )
    const diff = diffCfgBuilderSettings(base, changed)
    check('changed numeric field is in the diff', diff.has('sensitivity'))
    check('changed bind is in the diff as bind:<actionId>', diff.has('bind:jump'))
    check('untouched field is not in the diff', !diff.has('fps_max'))
    check('identical settings diff to nothing', diffCfgBuilderSettings(base, base).size === 0)
  }

  console.log('== scanner gate refuses to write on a critical finding ==')
  {
    const dir = await freshSandbox('cfg-builder-gate-')
    const dangerous = sanitizeCfgBuilderSettings({
      customBinds: [{ key: 'j', command: 'connect evil.example.com:27015' }]
    })
    const result = await applyCfgBuilderToPath(dir, dangerous)
    check('applyCfgBuilderToPath reports not ok', result.ok === false)
    check('scan result carries the critical finding', result.scan.counts.critical > 0)
    check('leaf cfg was never written', (await readCfgIfExists(dir, '16x-cfgbuilder.cfg')) === null)
    check('userconfig.cfg was never written', (await readCfgIfExists(dir, 'userconfig.cfg')) === null)
    check('autoexec.cfg was never written', (await readCfgIfExists(dir, 'autoexec.cfg')) === null)
    await rm(dir, { recursive: true, force: true })
  }

  console.log('== safe settings apply cleanly and remove cleanly ==')
  {
    const dir = await freshSandbox('cfg-builder-apply-')
    const settings = sanitizeCfgBuilderSettings({ sensitivity: 4, customBinds: [{ key: 'f9', command: 'say gg' }] })
    const result = await applyCfgBuilderToPath(dir, settings)
    check('apply reports ok', result.ok === true)
    check('scan on safe settings has zero critical findings', result.scan.counts.critical === 0)

    const leaf = await readCfgIfExists(dir, '16x-cfgbuilder.cfg')
    check('leaf cfg written with the expected sensitivity line', !!leaf && leaf.includes('sensitivity "4"'))

    const userconfig = await readCfgIfExists(dir, 'userconfig.cfg')
    check('userconfig.cfg execs the leaf cfg', !!userconfig && userconfig.includes('exec 16x-cfgbuilder.cfg'))
    const autoexec = await readCfgIfExists(dir, 'autoexec.cfg')
    check('autoexec.cfg execs the leaf cfg too', !!autoexec && autoexec.includes('exec 16x-cfgbuilder.cfg'))

    // Idempotent re-apply: identical settings should be a clean no-op re-write, not a growing block.
    await applyCfgBuilderToPath(dir, settings)
    const userconfigAgain = await readCfgIfExists(dir, 'userconfig.cfg')
    const occurrences = (userconfigAgain?.match(/16X LAUNCHER CFG BUILDER/g) ?? []).length
    check('re-applying does not duplicate the managed block', occurrences === 2) // BEGIN + END markers, once each

    await removeCfgBuilderFromPath(dir)
    const userconfigAfterRemove = await readCfgIfExists(dir, 'userconfig.cfg')
    check('removeCfgBuilderFromPath strips the block', !userconfigAfterRemove || !userconfigAfterRemove.includes('16X LAUNCHER CFG BUILDER'))

    await rm(dir, { recursive: true, force: true })
  }

  console.log('== three-way managed-block coexistence (content-sync + native-crosshair + cfg-builder + player line) ==')
  {
    const dir = await freshSandbox('cfg-builder-coexist-')
    const playerLine = 'bind "y" "messagemode"'
    await writeFile(join(dir, 'cstrike', 'userconfig.cfg'), `${playerLine}\n`)
    await writeFile(join(dir, 'cstrike', 'autoexec.cfg'), `${playerLine}\n`)

    // content-sync's own managed block first (as a real sync would leave it).
    await syncManagedExecTargets(dir, ['some-variant.cfg'])

    // native-crosshair's independently-marked block second.
    const nativeSettings = sanitizeNativeCrosshairSettings({ enabled: true }, DEFAULT_NATIVE_CROSSHAIR_SETTINGS)
    await applyNativeCrosshair(dir, nativeSettings)

    // cfg-builder's own independently-marked block third.
    const cfgSettings = sanitizeCfgBuilderSettings({ sensitivity: 3 })
    const applyResult = await applyCfgBuilderToPath(dir, cfgSettings)
    check('cfg-builder apply succeeds alongside the other two blocks', applyResult.ok === true)

    const finalText = await readCfgIfExists(dir, 'userconfig.cfg')
    check("player's own line is still intact", !!finalText && finalText.includes(playerLine))
    check('content-sync managed block is present', !!finalText && finalText.includes('16X LAUNCHER MANAGED BLOCK') && finalText.includes('exec some-variant.cfg'))
    check('native-crosshair managed block is present', !!finalText && finalText.includes('16X LAUNCHER NATIVE CROSSHAIR') && finalText.includes('exec 16x-crosshair.cfg'))
    check('cfg-builder managed block is present', !!finalText && finalText.includes('16X LAUNCHER CFG BUILDER') && finalText.includes('exec 16x-cfgbuilder.cfg'))

    // Remove cfg-builder's block only — the other two and the player line must survive untouched.
    await removeCfgBuilderFromPath(dir)
    const afterRemove = await readCfgIfExists(dir, 'userconfig.cfg')
    check('after removing cfg-builder, player line survives', !!afterRemove && afterRemove.includes(playerLine))
    check('after removing cfg-builder, content-sync block survives', !!afterRemove && afterRemove.includes('16X LAUNCHER MANAGED BLOCK'))
    check('after removing cfg-builder, native-crosshair block survives', !!afterRemove && afterRemove.includes('16X LAUNCHER NATIVE CROSSHAIR'))
    check('after removing cfg-builder, its own block is gone', !!afterRemove && !afterRemove.includes('16X LAUNCHER CFG BUILDER'))

    await rm(dir, { recursive: true, force: true })
  }

  console.log('== export text is clean (no launcher markers, safe to share/publish) ==')
  {
    const settings = sanitizeCfgBuilderSettings({ sensitivity: 3 })
    const text = buildCfgBuilderCfgText(settings)
    check('no BEGIN/END marker text in the exportable cfg', !text.includes('DO NOT EDIT') && !text.includes('LAUNCHER CFG BUILDER'))
    check('exportable text is self-contained (header + cvars/binds only)', text.trimStart().startsWith('//'))
  }

  await rm(userDataTmp, { recursive: true, force: true })
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  app.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
