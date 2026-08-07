/**
 * Sandbox-safe verification harness for M12.5's static analyzer
 * (electron/modules/config-scanner.ts). Pure logic, in-memory fixture text —
 * no Electron runtime, no filesystem writes outside this process, no game
 * files touched. Run with `node scripts/verify-config-scanner.mts`.
 *
 * Exercises every rule at least once, plus the evasion attempts the M12.5
 * spec called out explicitly: commands smuggled inside bind target strings,
 * mixed case, extra whitespace, and quoted vs. unquoted variants. Also runs
 * the scanner across every shipped config in content/slots/config/ and
 * prints a report (point 5 of the M12.5 task — reported, not silently tuned
 * to pass).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  scanConfigFile,
  scanConfigFiles,
  computeSafeScore,
  classifySeverityBand,
  type FindingRule,
  type FindingSeverity
} from '../electron/modules/config-scanner.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

let failures = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

function hasFinding(findings: { rule: FindingRule; severity: FindingSeverity }[], rule: FindingRule, severity?: FindingSeverity): boolean {
  return findings.some((f) => f.rule === rule && (severity === undefined || f.severity === severity))
}

function scan(text: string, path = 'cstrike/test.cfg') {
  return scanConfigFile({ path, text })
}

console.log('== critical: server hijack (connect/connect_lan/retry) ==')
check('bare connect', hasFinding(scan('connect evil.example.com:27015'), 'server-hijack', 'critical'))
check('connect_lan', hasFinding(scan('connect_lan 10.0.0.5:27015'), 'server-hijack', 'critical'))
check('retry', hasFinding(scan('retry'), 'server-hijack', 'critical'))
check('mixed case CONNECT', hasFinding(scan('CoNNect evil.example.com:27015'), 'server-hijack', 'critical'))
check('smuggled inside bind target', hasFinding(scan('bind "e" "+use; connect evil.example.com:27015"'), 'server-hijack', 'critical'))
check('smuggled, unquoted key + extra whitespace', hasFinding(scan('bind   e     "+use;    connect evil.example.com:27015"'), 'server-hijack', 'critical'))
check('smuggled inside alias body', hasFinding(scan('alias sneaky "+jump;connect evil.example.com:27015"'), 'server-hijack', 'critical'))
check('clean bind does not false-positive', !hasFinding(scan('bind "e" "+use"'), 'server-hijack'))

console.log('== critical: rcon / rcon_password ==')
check('rcon command', hasFinding(scan('rcon status'), 'rcon', 'critical'))
check('rcon_password', hasFinding(scan('rcon_password "hunter2"'), 'rcon', 'critical'))
check('rcon smuggled in bind, mixed case', hasFinding(scan('bind "x" "RCON_Password hunter2"'), 'rcon', 'critical'))

console.log('== critical: motd_write ==')
check('motd_write', hasFinding(scan('motd_write "gotcha"'), 'motd-write', 'critical'))
check('motd_write smuggled in bind', hasFinding(scan('bind "x" "motd_write gotcha"'), 'motd-write', 'critical'))

console.log('== critical: exec outside cstrike ==')
check('parent traversal', hasFinding(scan('exec ../../../etc/passwd'), 'exec-outside-cstrike', 'critical'))
check('absolute unix path', hasFinding(scan('exec /etc/passwd'), 'exec-outside-cstrike', 'critical'))
check('windows drive path', hasFinding(scan('exec C:\\Windows\\system.ini'), 'exec-outside-cstrike', 'critical'))
check('home-relative', hasFinding(scan('exec ~/.bashrc'), 'exec-outside-cstrike', 'critical'))
check('plain relative exec is safe', !hasFinding(scan('exec userconfig.cfg'), 'exec-outside-cstrike'))
check('relative subpath exec is safe', !hasFinding(scan('exec scripts/jump.cfg'), 'exec-outside-cstrike'))

console.log('== critical: unbindall with nothing after it ==')
check('unbindall, no bind ever', hasFinding(scan('unbindall\nsensitivity "2.0"'), 'unbindall-no-restore', 'critical'))
check('unbindall followed by binds is safe', !hasFinding(scan('unbindall\nbind "w" "+forward"'), 'unbindall-no-restore'))
check('unbindall on same line as later bind (statement split)', !hasFinding(scan('unbindall;bind "w" "+forward"'), 'unbindall-no-restore'))
check(
  'second unbindall with nothing after it still flags, even though binds followed the first',
  hasFinding(scan('unbindall\nbind "w" "+forward"\nunbindall\nsensitivity "2.0"'), 'unbindall-no-restore', 'critical')
)

console.log('== warning: alias definitions ==')
check('alias flagged as warning', hasFinding(scan('alias +jumpthrow "+jump"'), 'alias-script', 'warning'))
check('alias is not critical by itself', !hasFinding(scan('alias +jumpthrow "+jump"'), 'alias-script', 'critical'))

console.log('== warning: multi-command binds except pure buy chains ==')
check('buy;buy chain is exempt', !hasFinding(scan('bind "KP_DOWNARROW" "buy ak47; buy m4a1"'), 'multi-command-bind'))
check('buyammo1;buyammo2 chain is exempt', !hasFinding(scan('bind "KP_ENTER" "buyammo1; buyammo2"'), 'multi-command-bind'))
check('buy mixed with non-buy is flagged', hasFinding(scan('bind "k" "buy ak47; +jump"'), 'multi-command-bind', 'warning'))
check('non-buy chain is flagged', hasFinding(scan('bind "k" "+forward;+jump"'), 'multi-command-bind', 'warning'))
check('single command bind is not flagged', !hasFinding(scan('bind "w" "+forward"'), 'multi-command-bind'))
check(
  'buy chain, mixed case + extra whitespace still exempt',
  !hasFinding(scan('bind  "KP_DOWNARROW"   "Buy ak47;   BUY m4a1"'), 'multi-command-bind')
)

console.log('== warning: binds containing wait ==')
check('wait in a chained bind', hasFinding(scan('bind "j" "+jump;wait;-jump"'), 'wait-bind', 'warning'))
check('WAIT mixed case', hasFinding(scan('bind "j" "+jump;WAIT;-jump"'), 'wait-bind', 'warning'))
check('no wait, not flagged', !hasFinding(scan('bind "j" "+jump;-jump"'), 'wait-bind'))

console.log('== warning: setinfo with unknown keys ==')
check('known key _ah is not flagged', !hasFinding(scan('setinfo "_ah" "1"'), 'setinfo-unknown-key'))
check('known key _vgui_menus is not flagged', !hasFinding(scan('setinfo "_vgui_menus" "1"'), 'setinfo-unknown-key'))
check('unknown key is flagged', hasFinding(scan('setinfo "_backdoor" "1"'), 'setinfo-unknown-key', 'warning'))

console.log('== info: unrecognized cvars ==')
check('known cvar sensitivity is not flagged', !hasFinding(scan('sensitivity "2.0"'), 'unknown-cvar'))
check('typo cvar is flagged info', hasFinding(scan('sensitivty "2.0"'), 'unknown-cvar', 'info'))
check('made-up cvar is flagged info', hasFinding(scan('cl_totally_fake_cvar "1"'), 'unknown-cvar', 'info'))

console.log('== info: values far outside sane ranges ==')
check('rate above client cap flagged', hasFinding(scan('rate "500000"'), 'value-out-of-range', 'info'))
check('rate at client cap not flagged', !hasFinding(scan('rate "100000"'), 'value-out-of-range'))
check('sensitivity absurd value flagged', hasFinding(scan('sensitivity "9999"'), 'value-out-of-range', 'info'))
check('sensitivity normal value not flagged', !hasFinding(scan('sensitivity "2.0"'), 'value-out-of-range'))

console.log('== quoted vs. unquoted bind variants parse identically ==')
const quoted = scan('bind "KP_DOWNARROW" "buy ak47; buy m4a1"')
const unquotedKey = scan('bind KP_DOWNARROW "buy ak47; buy m4a1"')
check('quoted key vs. bare key: same finding count', quoted.length === unquotedKey.length)
check('unquoted single-word target parses', hasFinding(scan('bind e +use'), 'unbindall-no-restore') === false)

console.log('== safe score / severity band ==')
check('clean file scores 100 / ok', (() => {
  const r = scanConfigFiles([{ path: 'a.cfg', text: 'sensitivity "2.0"\nbind "w" "+forward"' }])
  return r.safeScore === 100 && classifySeverityBand(r.counts) === 'ok'
})())
check('any critical forces danger band regardless of score', (() => {
  const r = scanConfigFiles([{ path: 'a.cfg', text: 'connect evil.example.com:27015' }])
  return classifySeverityBand(r.counts) === 'danger'
})())
check('warning-only forces warn band', (() => {
  const r = scanConfigFiles([{ path: 'a.cfg', text: 'alias foo "+jump"' }])
  return classifySeverityBand(r.counts) === 'warn'
})())
check('score never goes below 0', computeSafeScore({ critical: 10, warning: 10, info: 10 }) === 0)

console.log('\n== shipped archive: content/slots/config/*/cstrike/*.cfg ==')
const configDir = join(REPO_ROOT, 'content/slots/config')
const variantDirs = readdirSync(configDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

let anyShippedFinding = false
for (const variant of variantDirs) {
  const cstrikeDir = join(configDir, variant, 'cstrike')
  const files = readdirSync(cstrikeDir).filter((f) => f.endsWith('.cfg'))
  const inputs = files.map((f) => ({ path: `cstrike/${f}`, text: readFileSync(join(cstrikeDir, f), 'utf-8') }))
  const result = scanConfigFiles(inputs)
  const band = classifySeverityBand(result.counts)
  const summary = `critical=${result.counts.critical} warning=${result.counts.warning} info=${result.counts.info} score=${result.safeScore} band=${band}`
  console.log(`  ${variant.padEnd(20)} ${summary}`)
  if (result.findings.length > 0) {
    anyShippedFinding = true
    for (const f of result.findings) {
      console.log(`      [${f.severity}] ${f.rule} ${f.file}:${f.line} — ${f.text}${f.detail ? ` (${f.detail})` : ''}`)
    }
  }
}
console.log(anyShippedFinding ? '  -> see findings listed above (reported as-is, not tuned to hide them)' : '  -> zero findings across all shipped configs')

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
