import type { Messages } from './i18n'
import type { FindingRule, SeverityBand } from '../../electron/modules/config-scanner'

/** M12.5 — maps a scan finding's rule id + raw detail to localized copy. Kept out of the pure scanner module itself: findings carry rule ids/raw data only, never baked-in message strings (same convention as notification-rules.ts describing to en/ru/uk elsewhere). */
export function findingMessage(t: Messages, rule: FindingRule, detail: string): string {
  switch (rule) {
    case 'server-hijack':
      return t.configScanner.ruleServerHijack(detail)
    case 'rcon':
      return t.configScanner.ruleRcon(detail)
    case 'motd-write':
      return t.configScanner.ruleMotdWrite
    case 'exec-outside-cstrike':
      return t.configScanner.ruleExecOutsideCstrike(detail)
    case 'unbindall-no-restore':
      return t.configScanner.ruleUnbindallNoRestore
    case 'alias-script':
      return t.configScanner.ruleAliasScript(detail)
    case 'multi-command-bind':
      return t.configScanner.ruleMultiCommandBind
    case 'wait-bind':
      return t.configScanner.ruleWaitBind
    case 'setinfo-unknown-key':
      return t.configScanner.ruleSetinfoUnknownKey(detail)
    case 'unknown-cvar':
      return t.configScanner.ruleUnknownCvar(detail)
    case 'value-out-of-range':
      return t.configScanner.ruleValueOutOfRange(detail)
  }
}

export function severityLabel(t: Messages, severity: 'critical' | 'warning' | 'info'): string {
  switch (severity) {
    case 'critical':
      return t.configScanner.severityCritical
    case 'warning':
      return t.configScanner.severityWarning
    case 'info':
      return t.configScanner.severityInfo
  }
}

export function severityBandClass(band: SeverityBand): string {
  return band === 'ok' ? 'ok' : band === 'warn' ? 'warn' : 'danger'
}

/**
 * Duplicated from electron/modules/config-scanner.ts's classifySeverityBand
 * rather than imported — same reasoning as CONFIG_SLOT_ID/LOCAL_VARIANT_ID in
 * configVariant.ts: the renderer bundle doesn't pull runtime code from
 * electron/modules, only types (see the `import type` above).
 */
export function classifyBand(counts: { critical: number; warning: number; info: number }): SeverityBand {
  if (counts.critical > 0) return 'danger'
  if (counts.warning > 0) return 'warn'
  return 'ok'
}

/**
 * Duplicated from electron/modules/content-sync.ts's isExecCfg (path/type
 * convention only, no filesystem access) so the renderer can filter a
 * manifest variant's files before asking the main process to scan them.
 */
export function isExecCfgFile(file: { path: string; type?: string }): boolean {
  if (file.type === 'exec-cfg') return true
  const lower = file.path.toLowerCase()
  if (!lower.startsWith('cstrike/')) return false
  if (!lower.endsWith('.cfg')) return false
  const base = lower.slice(lower.lastIndexOf('/') + 1)
  return base !== 'config.cfg' && base !== 'autoexec.cfg' && base !== 'userconfig.cfg'
}
