/**
 * config-scanner — M12.5 static analyzer for game .cfg files.
 *
 * Deliberately has zero Electron/Node dependency (same pattern as
 * notification-rules.ts) so it can be exercised directly by
 * scripts/verify-config-scanner.mts with fixture text, and imported by both
 * the main process (content-sync.ts, local-config-variant.ts) and its verify
 * script without an Electron runtime.
 *
 * A .cfg file is a sequence of statements separated by newlines and/or
 * top-level `;` (the engine treats both as statement separators — a cfg can
 * chain `unbindall;bind ...` on one physical line). A `bind`'s target string
 * is itself executed as a command when the key is pressed, so it can smuggle
 * further `;`-chained statements; same for an `alias`'s body when the alias
 * is later invoked. Both are recursively re-scanned for the critical-tier
 * rules below — that's the "commands inside bind target strings" evasion
 * this module exists to catch, not just a line's own first token.
 *
 * KNOWN_CVARS is deliberately curated, not exhaustive: it's the set of cvars
 * this module has actually verified appear in real HL/CS 1.6 configs (every
 * cvar across content/slots/config/*, gathered 2026-08). A cvar outside it
 * only ever produces an `info`-tier finding — "may be a typo or engine-
 * specific", never blocking — so under-listing here costs nothing but a
 * little noise, while over-listing (inventing cvars) would make the
 * allowlist dishonest. See scripts/verify-config-scanner.mts.
 */

export type FindingSeverity = 'critical' | 'warning' | 'info'

export type FindingRule =
  | 'server-hijack'
  | 'rcon'
  | 'motd-write'
  | 'exec-outside-cstrike'
  | 'unbindall-no-restore'
  | 'alias-script'
  | 'multi-command-bind'
  | 'wait-bind'
  | 'setinfo-unknown-key'
  | 'unknown-cvar'
  | 'value-out-of-range'

export interface ScanFinding {
  severity: FindingSeverity
  rule: FindingRule
  /** Display path of the file this finding came from, e.g. "cstrike/scripts/f0rest.cfg". */
  file: string
  /** 1-indexed line in the source file. */
  line: number
  /** The offending line's trimmed source text, for the "exactly what was found" dialog. */
  text: string
  /** Rule-specific raw data (a command name, cvar name, path, or "cvar value") — never localized here; the UI maps rule+detail to copy. */
  detail: string
}

export interface FileScanInput {
  path: string
  text: string
}

export interface ScanCounts {
  critical: number
  warning: number
  info: number
}

export interface ConfigScanResult {
  findings: ScanFinding[]
  safeScore: number
  counts: ScanCounts
}

export type SeverityBand = 'ok' | 'warn' | 'danger'

const CRITICAL_HIJACK_COMMANDS = ['connect', 'connect_lan', 'retry']
const CRITICAL_RCON_COMMANDS = ['rcon', 'rcon_password']
const MOTD_COMMAND = 'motd_write'
const BUY_COMMANDS = ['buy', 'buyequip', 'buyammo1', 'buyammo2']
/** Standard GoldSrc/CS 1.6 client userinfo keys a player can legitimately set via setinfo. */
const SETINFO_ALLOWED_KEYS = ['_ah', '_vgui_menus', '_cl_autowepswitch']

/** Non-cvar commands: structural, movement/action verbs, and the ones with their own dedicated rule above. Case: lowercase. */
const KNOWN_COMMANDS = [
  'bind',
  'alias',
  'exec',
  'unbindall',
  'connect',
  'connect_lan',
  'retry',
  'rcon',
  'rcon_password',
  'motd_write',
  'setinfo',
  'wait',
  'quit',
  'echo',
  'say',
  'say_team',
  'kill',
  'spec_mode',
  'chooseteam',
  'buy',
  'buyequip',
  'buyammo1',
  'buyammo2',
  'autobuy',
  'rebuy',
  'showbriefing',
  'nightvision',
  'invnext',
  'invprev',
  'sizeup',
  'sizedown',
  'drop',
  'lastinv',
  'cancelselect',
  'messagemode',
  'messagemode2',
  'toggleconsole',
  'force_centerview',
  'snapshot',
  'impulse',
  'radio1',
  'radio2',
  'radio3',
  'pause',
  '+mlook',
  '+jlook',
  '+klook',
  '+strafe',
  '+duck',
  '+speed',
  '+jump',
  '+forward',
  '+back',
  '+moveleft',
  '+moveright',
  '+moveup',
  '+movedown',
  '+left',
  '+right',
  '+lookup',
  '+lookdown',
  '+attack',
  '+attack2',
  '+reload',
  '+use',
  '+showscores',
  '+commandmenu',
  '+voicerecord',
  ...Array.from({ length: 10 }, (_, i) => `slot${i + 1}`)
]

/** Curated from every cvar actually used across content/slots/config/*.cfg — see module doc. */
export const KNOWN_CVARS = [
  'ati_npatch',
  'bgmvolume',
  'bottomcolor',
  'brightness',
  'cl_allowdownload',
  'cl_allowupload',
  '_cl_autowepswitch',
  'cl_backspeed',
  'cl_bob',
  'cl_cmdbackup',
  'cl_cmdrate',
  'cl_corpsestay',
  'cl_crosshair_color',
  'cl_crosshair_size',
  'cl_crosshair_translucent',
  'cl_dlmax',
  'cl_download_ingame',
  'cl_dynamiccrosshair',
  'cl_filterstuffcmd',
  'cl_forwardspeed',
  'cl_himodels',
  'cl_idealpitchscale',
  'cl_lc',
  'cl_logocolor',
  'cl_logofile',
  'cl_lw',
  'cl_min_ct',
  'cl_minmodels',
  'cl_min_t',
  'cl_mousegrab',
  'cl_nosmooth',
  'cl_predict',
  'cl_radartype',
  'cl_resend',
  'cl_righthand',
  'cl_shadows',
  'cl_showfps',
  'cl_sidespeed',
  'cl_smoothtime',
  'cl_timeout',
  'cl_updaterate',
  'cl_vsmoothing',
  'cl_weather',
  'con_color',
  'con_mono',
  'console',
  'crosshair',
  'default_fov',
  'ex_interp',
  'fastsprites',
  'fps_max',
  'fps_override',
  'gamma',
  'gl_ansio',
  'gl_dither',
  'gl_flipmatrix',
  'gl_fog',
  'gl_keeptjunctions',
  'gl_lightholes',
  'gl_lowlatency',
  'gl_lowlatency_debugoutput',
  'gl_lowlatency_maxslop_ms',
  'gl_lowlatency_minslop_ms',
  'gl_max_size',
  'gl_monolights',
  'gl_overbright',
  'gl_picmip',
  'gl_polyoffset',
  'gl_round_down',
  'gl_spriteblend',
  'gl_texturemode',
  'gl_use_shaders',
  'gl_vsync',
  'gl_wateramp',
  'gl_widescreen_yfov',
  'graphheight',
  'hisound',
  'hpk_maxsize',
  'hud_capturemouse',
  'hud_centerid',
  'hud_deathnotice_time',
  'hud_draw',
  'hud_fastswitch',
  'hud_saytext_internal',
  'hud_takesshots',
  'joystick',
  'lookspring',
  'lookstrafe',
  'max_shells',
  'max_smokepuffs',
  'm_customaccel',
  'm_customaccel_exponent',
  'm_customaccel_max',
  'm_customaccel_scale',
  'm_filter',
  'm_forward',
  'model',
  'mp3fadetime',
  'mp3volume',
  'mp_decals',
  'm_pitch',
  'm_rawinput',
  'm_side',
  'm_yaw',
  'name',
  'net_graph',
  'net_graphpos',
  'net_scale',
  'rate',
  'r_decals',
  'r_detailtextures',
  'room_off',
  'r_prefertexturefiltering',
  'scoreboard_shortheaders',
  'scoreboard_showavatars',
  'scoreboard_showhealth',
  'scoreboard_showmoney',
  'sensitivity',
  'skin',
  '_snd_mixahead',
  'sp_decals',
  'spec_autodirector_internal',
  'spec_drawcone_internal',
  'spec_drawnames_internal',
  'spec_drawstatus_internal',
  'spec_mode_internal',
  'spec_pip',
  'suitvolume',
  'sv_aim',
  'sv_voiceenable',
  'team',
  'topcolor',
  'viewsize',
  'violence_ablood',
  'violence_agibs',
  'violence_hblood',
  'violence_hgibs',
  'voice_enable',
  'voice_forcemicrecord',
  'voice_modenable',
  'voice_scale',
  'volume',
  'zoom_sensitivity_ratio'
]

const KNOWN_IDENTIFIERS = new Set([...KNOWN_COMMANDS, ...KNOWN_CVARS])

interface NumericRange {
  min: number
  max: number
}

/**
 * Sane ranges for cvars where an implausible value is worth a heads-up — not
 * enforcement, just a nudge. Caps match documented client maximums (see
 * CLAUDE.md's network-cvar gotcha). Exported so cfg-builder-settings.ts (M14)
 * can reuse the exact same range data for its own hard-clamp validation
 * rather than maintaining a second, potentially-drifting copy of the same
 * numbers — see that module's doc comment.
 */
export const NUMERIC_RANGES: Record<string, NumericRange> = {
  rate: { min: 0, max: 100000 },
  cl_updaterate: { min: 0, max: 102 },
  cl_cmdrate: { min: 0, max: 105 },
  fps_max: { min: 1, max: 1000 },
  sensitivity: { min: 0.01, max: 50 },
  gamma: { min: 0.1, max: 5 },
  brightness: { min: 0, max: 5 },
  volume: { min: 0, max: 1 },
  bgmvolume: { min: 0, max: 1 },
  mp3volume: { min: 0, max: 1 },
  suitvolume: { min: 0, max: 1 },
  hisound: { min: 0, max: 1 },
  m_pitch: { min: 0, max: 1 },
  m_yaw: { min: 0, max: 1 },
  cl_dlmax: { min: 64, max: 4096 }
}

/**
 * Splits on `;` outside double quotes — the engine's own statement separator.
 * Substrings are returned un-trimmed; callers trim and drop empties.
 */
export function splitTopLevelStatements(text: string): string[] {
  const statements: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes
    if (ch === ';' && !inQuotes) {
      statements.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  statements.push(current)
  return statements
}

/**
 * Whitespace-delimited tokenizer that treats a `"..."` run as one token
 * (quotes stripped), so a bind's quoted target — including any `;` inside it
 * — comes back as a single token for further recursive scanning.
 */
export function tokenizeArgs(text: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (i >= text.length) break
    if (text[i] === '"') {
      const end = text.indexOf('"', i + 1)
      if (end === -1) {
        tokens.push(text.slice(i + 1))
        i = text.length
      } else {
        tokens.push(text.slice(i + 1, end))
        i = end + 1
      }
    } else {
      const start = i
      while (i < text.length && !/\s/.test(text[i])) i++
      tokens.push(text.slice(start, i))
    }
  }
  return tokens
}

/** Lowercased first token of a trimmed statement, or '' for a blank/unparseable one. */
export function firstToken(trimmed: string): string {
  const tokens = tokenizeArgs(trimmed)
  return (tokens[0] ?? '').toLowerCase()
}

/** A path escapes cstrike/ via traversal, an absolute root, a drive letter, or a home-relative `~`. Any relative path with no `..` segment is safe — GoldSrc's exec is always relative to the mod dir. */
function isOutsideCstrike(path: string): boolean {
  const p = path.trim()
  if (p === '') return false
  if (p.includes('..')) return true
  if (/^[/\\]/.test(p)) return true
  if (/^[A-Za-z]:[\\/]/.test(p)) return true
  if (p.startsWith('~')) return true
  return false
}

function scanStatementForCritical(cmd: string, args: string[]): { rule: FindingRule; detail: string } | null {
  if (CRITICAL_HIJACK_COMMANDS.includes(cmd)) return { rule: 'server-hijack', detail: cmd }
  if (CRITICAL_RCON_COMMANDS.includes(cmd)) return { rule: 'rcon', detail: cmd }
  if (cmd === MOTD_COMMAND) return { rule: 'motd-write', detail: cmd }
  if (cmd === 'exec') {
    const path = args[1] ?? ''
    if (isOutsideCstrike(path)) return { rule: 'exec-outside-cstrike', detail: path }
  }
  return null
}

function subStatements(raw: string): string[] {
  return splitTopLevelStatements(raw)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** Scans one file's text and returns every finding, in file order. */
export function scanConfigFile(input: FileScanInput): ScanFinding[] {
  const findings: ScanFinding[] = []
  const lines = input.text.split('\n')

  let lastUnbindallLine: number | null = null
  let sawBindAfterLastUnbindall = false

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1
    const trimmedLine = rawLine.trim()
    if (trimmedLine === '' || trimmedLine.startsWith('//')) return

    for (const rawStatement of splitTopLevelStatements(trimmedLine)) {
      const stmt = rawStatement.trim()
      if (stmt === '') continue

      const args = tokenizeArgs(stmt)
      const cmd = (args[0] ?? '').toLowerCase()
      if (cmd === '') continue

      const crit = scanStatementForCritical(cmd, args)
      if (crit) {
        findings.push({ severity: 'critical', rule: crit.rule, file: input.path, line: lineNo, text: stmt, detail: crit.detail })
      }

      if (cmd === 'unbindall') {
        lastUnbindallLine = lineNo
        sawBindAfterLastUnbindall = false
        continue
      }

      if (cmd === 'bind') {
        if (lastUnbindallLine !== null) sawBindAfterLastUnbindall = true

        const target = args[2] ?? ''
        const subs = subStatements(target)
        for (const sub of subs) {
          const subArgs = tokenizeArgs(sub)
          const subCmd = (subArgs[0] ?? '').toLowerCase()
          const subCrit = scanStatementForCritical(subCmd, subArgs)
          if (subCrit) {
            findings.push({ severity: 'critical', rule: subCrit.rule, file: input.path, line: lineNo, text: stmt, detail: subCrit.detail })
          }
        }

        if (subs.length > 1) {
          const allBuy = subs.every((s) => BUY_COMMANDS.includes((tokenizeArgs(s)[0] ?? '').toLowerCase()))
          if (!allBuy) {
            findings.push({ severity: 'warning', rule: 'multi-command-bind', file: input.path, line: lineNo, text: stmt, detail: '' })
          }
        }

        if (/\bwait\b/i.test(target)) {
          findings.push({ severity: 'warning', rule: 'wait-bind', file: input.path, line: lineNo, text: stmt, detail: '' })
        }
        continue
      }

      if (cmd === 'alias') {
        findings.push({ severity: 'warning', rule: 'alias-script', file: input.path, line: lineNo, text: stmt, detail: args[1] ?? '' })

        const body = args[2] ?? ''
        for (const sub of subStatements(body)) {
          const subArgs = tokenizeArgs(sub)
          const subCmd = (subArgs[0] ?? '').toLowerCase()
          const subCrit = scanStatementForCritical(subCmd, subArgs)
          if (subCrit) {
            findings.push({ severity: 'critical', rule: subCrit.rule, file: input.path, line: lineNo, text: stmt, detail: subCrit.detail })
          }
        }
        continue
      }

      if (cmd === 'setinfo') {
        const key = args[1] ?? ''
        if (key !== '' && !SETINFO_ALLOWED_KEYS.includes(key.toLowerCase())) {
          findings.push({ severity: 'warning', rule: 'setinfo-unknown-key', file: input.path, line: lineNo, text: stmt, detail: key })
        }
        continue
      }

      if (!KNOWN_IDENTIFIERS.has(cmd)) {
        findings.push({ severity: 'info', rule: 'unknown-cvar', file: input.path, line: lineNo, text: stmt, detail: args[0] ?? cmd })
        continue
      }

      const range = NUMERIC_RANGES[cmd]
      if (range) {
        const raw = args[1]
        const val = raw === undefined ? NaN : Number(raw)
        if (Number.isFinite(val) && (val < range.min || val > range.max)) {
          findings.push({ severity: 'info', rule: 'value-out-of-range', file: input.path, line: lineNo, text: stmt, detail: `${cmd} ${raw}` })
        }
      }
    }
  })

  if (lastUnbindallLine !== null && !sawBindAfterLastUnbindall) {
    findings.push({
      severity: 'critical',
      rule: 'unbindall-no-restore',
      file: input.path,
      line: lastUnbindallLine,
      text: 'unbindall',
      detail: ''
    })
  }

  return findings
}

export function computeSafeScore(counts: ScanCounts): number {
  const score = 100 - counts.critical * 34 - counts.warning * 10 - counts.info * 3
  return Math.max(0, Math.min(100, score))
}

/** Color band for the badge: critical always reads danger, warning always reads warn, regardless of the numeric score. */
export function classifySeverityBand(counts: ScanCounts): SeverityBand {
  if (counts.critical > 0) return 'danger'
  if (counts.warning > 0) return 'warn'
  return 'ok'
}

/**
 * Every `exec <target>` statement's target, in file order, exactly as written
 * (not normalized/lowercased — callers that compare names decide their own
 * case-folding). Used by content-sync.ts's managed-block exec-cycle
 * detection, which needs to follow a cfg's own `exec` statements into other
 * files rather than just flag findings within one file — see scanConfigFile's
 * module doc for why that's a separate concern from the rule engine above.
 */
export function extractExecTargets(text: string): string[] {
  const targets: string[] = []
  for (const rawLine of text.split('\n')) {
    const trimmedLine = rawLine.trim()
    if (trimmedLine === '' || trimmedLine.startsWith('//')) continue
    for (const rawStatement of splitTopLevelStatements(trimmedLine)) {
      const stmt = rawStatement.trim()
      if (stmt === '') continue
      const args = tokenizeArgs(stmt)
      if ((args[0] ?? '').toLowerCase() === 'exec' && args[1]) {
        targets.push(args[1])
      }
    }
  }
  return targets
}

export function scanConfigFiles(inputs: FileScanInput[]): ConfigScanResult {
  const findings = inputs.flatMap(scanConfigFile)
  const counts: ScanCounts = { critical: 0, warning: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  return { findings, safeScore: computeSafeScore(counts), counts }
}
