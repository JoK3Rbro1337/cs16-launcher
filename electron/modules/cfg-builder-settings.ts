/**
 * cfg-builder-settings — M14: pure types/defaults/validation/generation for
 * the CFG Builder. Same zero-Electron/Node-dependency pattern as
 * crosshair-settings.ts, native-crosshair-settings.ts, and config-scanner.ts
 * (which this module imports from — also zero-dependency, so the property
 * holds transitively) so it's verify-scriptable with a plain `node` process.
 *
 * A CfgBuilderSettings is a flat bag of real GoldSrc cvars (using the cvar's
 * own name as the object key, not a translated field id — this is a config
 * generator, so the 1:1 mapping is the whole point) plus a curated set of
 * movement/action/buy key binds and a free-form "custom binds" list for
 * anything the curated catalog doesn't cover.
 *
 * Every numeric field's hard [min, max] either comes directly from
 * config-scanner.ts's own NUMERIC_RANGES (for a cvar the M12.5 scanner
 * already tracks — rate/cl_updaterate/cl_cmdrate/fps_max/sensitivity/gamma/
 * brightness/volume/bgmvolume/mp3volume/suitvolume) or a locally-defined one
 * for cvars the scanner has no opinion on (see NUMBER_FIELDS below) — reusing
 * the scanner's own numbers where they exist, rather than inventing a second
 * set that could quietly drift from it, per the M14 spec's "using the same
 * sane range logic the M12.5 scanner already has." A handful of fields also
 * carry a narrower, non-blocking `advisoryMin`/`advisoryMax`: values outside
 * the hard range are rejected (clamped back to the previous value), values
 * outside the advisory band are still written as-is but the UI shows a
 * "legal but unusual" hint — e.g. fps_max far above 100 is valid GoldSrc but
 * uncommon enough to be worth a nudge.
 *
 * The four cl_crosshair_* cvars are deliberately NOT modeled here even
 * though the M14 spec's HUD section mentions crosshair controls: they're
 * already owned end-to-end by native-crosshair.ts's own independent
 * settings/managed-block pair. If this module also generated cl_crosshair_*
 * lines into its own leaf cfg, two independently-marked managed blocks in
 * the same autoexec.cfg/userconfig.cfg would both be setting the same cvars
 * with no defined ordering between them — a real footgun, not a hypothetical
 * one, given this codebase's history of exec-block incidents (see CLAUDE.md).
 * The renderer instead reuses native-crosshair's own controls/settings
 * object directly inside the HUD section (see NativeCrosshairEditor.tsx) —
 * "reuse the controls" in the literal sense, not a lookalike reimplementation.
 */

import { NUMERIC_RANGES, splitTopLevelStatements, tokenizeArgs } from './config-scanner.ts'

export type CfgBuilderSection = 'mouse' | 'network' | 'video' | 'audio' | 'hud'

export type CfgBuilderNumberKey =
  | 'sensitivity'
  | 'zoom_sensitivity_ratio'
  | 'rate'
  | 'cl_updaterate'
  | 'cl_cmdrate'
  | 'ex_interp'
  | 'cl_cmdbackup'
  | 'cl_timeout'
  | 'fps_max'
  | 'gl_picmip'
  | 'gamma'
  | 'brightness'
  | 'r_decals'
  | 'volume'
  | 'bgmvolume'
  | 'mp3volume'
  | 'suitvolume'

export type CfgBuilderBoolKey =
  | 'm_filter'
  | 'm_customaccel'
  | 'cl_lc'
  | 'cl_lw'
  | 'cl_predict'
  | 'gl_vsync'
  | 'cl_minmodels'
  | 'cl_weather'
  | 'hisound'
  | 'hud_fastswitch'
  | 'hud_centerid'
  | 'cl_righthand'
  | 'cl_radartype'

export interface NumberFieldDef {
  key: CfgBuilderNumberKey
  section: CfgBuilderSection
  min: number
  max: number
  step: number
  default: number
  /** Non-blocking "unusual but legal" band, narrower than [min, max]. Undefined = the hard range is the only band. */
  advisoryMin?: number
  advisoryMax?: number
}

export interface BoolFieldDef {
  key: CfgBuilderBoolKey
  section: CfgBuilderSection
  default: boolean
}

/** Cvar name -> its scanner-verified sane range, reused directly rather than re-declared — see module doc. */
function scannerRange(cvar: string): { min: number; max: number } {
  const r = NUMERIC_RANGES[cvar]
  if (!r) throw new Error(`cfg-builder-settings: expected config-scanner.ts to have a NUMERIC_RANGES entry for "${cvar}"`)
  return r
}

export const NUMBER_FIELDS: NumberFieldDef[] = [
  { key: 'sensitivity', section: 'mouse', ...scannerRange('sensitivity'), step: 0.1, default: 3 },
  { key: 'zoom_sensitivity_ratio', section: 'mouse', min: 0.1, max: 5, step: 0.1, default: 1 },
  { key: 'rate', section: 'network', ...scannerRange('rate'), step: 1000, default: 25000, advisoryMin: 20000 },
  { key: 'cl_updaterate', section: 'network', ...scannerRange('cl_updaterate'), step: 1, default: 102 },
  { key: 'cl_cmdrate', section: 'network', ...scannerRange('cl_cmdrate'), step: 1, default: 102 },
  { key: 'ex_interp', section: 'network', min: 0.01, max: 0.1, step: 0.001, default: 0.01 },
  { key: 'cl_cmdbackup', section: 'network', min: 0, max: 90, step: 1, default: 10 },
  { key: 'cl_timeout', section: 'network', min: 5, max: 300, step: 5, default: 60 },
  { key: 'fps_max', section: 'video', ...scannerRange('fps_max'), step: 1, default: 100, advisoryMax: 300 },
  { key: 'gl_picmip', section: 'video', min: 0, max: 4, step: 1, default: 0 },
  { key: 'gamma', section: 'video', ...scannerRange('gamma'), step: 0.1, default: 2.5 },
  { key: 'brightness', section: 'video', ...scannerRange('brightness'), step: 0.1, default: 2 },
  { key: 'r_decals', section: 'video', min: 0, max: 4096, step: 50, default: 300 },
  { key: 'volume', section: 'audio', ...scannerRange('volume'), step: 0.05, default: 0.8 },
  { key: 'bgmvolume', section: 'audio', ...scannerRange('bgmvolume'), step: 0.05, default: 0.5 },
  { key: 'mp3volume', section: 'audio', ...scannerRange('mp3volume'), step: 0.05, default: 0.5 },
  { key: 'suitvolume', section: 'audio', ...scannerRange('suitvolume'), step: 0.05, default: 0.25 }
]

export const BOOL_FIELDS: BoolFieldDef[] = [
  { key: 'm_filter', section: 'mouse', default: false },
  { key: 'm_customaccel', section: 'mouse', default: false },
  { key: 'cl_lc', section: 'network', default: true },
  { key: 'cl_lw', section: 'network', default: true },
  { key: 'cl_predict', section: 'network', default: true },
  { key: 'gl_vsync', section: 'video', default: false },
  { key: 'cl_minmodels', section: 'video', default: false },
  { key: 'cl_weather', section: 'video', default: true },
  { key: 'hisound', section: 'audio', default: true },
  { key: 'hud_fastswitch', section: 'hud', default: true },
  { key: 'hud_centerid', section: 'hud', default: false },
  { key: 'cl_righthand', section: 'hud', default: true },
  { key: 'cl_radartype', section: 'hud', default: true }
]

export type BindActionId =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'duck'
  | 'walk'
  | 'use'
  | 'attack'
  | 'attack2'
  | 'reload'
  | 'buyMenu'
  | 'autobuy'
  | 'rebuy'
  | 'buyAmmoPrimary'
  | 'buyAmmoSecondary'

export interface BindActionDef {
  id: BindActionId
  /** The exact command this action's bind executes — always a single, curated, known-safe command (never a ';'-chain), so a curated bind can never itself be a scanner finding. */
  command: string
  defaultKey: string
  group: 'movement' | 'action' | 'buy'
}

export const BIND_ACTIONS: BindActionDef[] = [
  { id: 'moveForward', command: '+forward', defaultKey: 'w', group: 'movement' },
  { id: 'moveBack', command: '+back', defaultKey: 's', group: 'movement' },
  { id: 'moveLeft', command: '+moveleft', defaultKey: 'a', group: 'movement' },
  { id: 'moveRight', command: '+moveright', defaultKey: 'd', group: 'movement' },
  { id: 'jump', command: '+jump', defaultKey: 'space', group: 'movement' },
  { id: 'duck', command: '+duck', defaultKey: 'ctrl', group: 'movement' },
  { id: 'walk', command: '+speed', defaultKey: 'shift', group: 'movement' },
  { id: 'use', command: '+use', defaultKey: 'e', group: 'action' },
  { id: 'attack', command: '+attack', defaultKey: 'mouse1', group: 'action' },
  { id: 'attack2', command: '+attack2', defaultKey: 'mouse2', group: 'action' },
  { id: 'reload', command: '+reload', defaultKey: 'r', group: 'action' },
  { id: 'buyMenu', command: 'buy', defaultKey: 'b', group: 'buy' },
  { id: 'autobuy', command: 'autobuy', defaultKey: 'f1', group: 'buy' },
  { id: 'rebuy', command: 'rebuy', defaultKey: 'f2', group: 'buy' },
  { id: 'buyAmmoPrimary', command: 'buyammo1', defaultKey: 'f3', group: 'buy' },
  { id: 'buyAmmoSecondary', command: 'buyammo2', defaultKey: 'f4', group: 'buy' }
]

const BIND_ACTION_BY_ID = new Map(BIND_ACTIONS.map((a) => [a.id, a]))
const BIND_ACTION_BY_COMMAND = new Map(BIND_ACTIONS.map((a) => [a.command, a]))

export interface CustomBind {
  key: string
  /** Free-form command text — the reason applyCfgBuilder scans the generated cfg before writing (see cfg-builder.ts): this is the one field in the whole builder that isn't drawn from a curated-safe catalog. */
  command: string
}

export type CfgBuilderSettings = {
  [K in CfgBuilderNumberKey]: number
} & {
  [K in CfgBuilderBoolKey]: boolean
} & {
  /** action id -> key name, '' meaning "unbound" (no bind line emitted for it). */
  binds: Record<BindActionId, string>
  customBinds: CustomBind[]
}

export const MAX_CUSTOM_BINDS = 50
export const MAX_CUSTOM_BIND_COMMAND_LENGTH = 200

/** GoldSrc key names are lowercase alnum/underscore (letters, digits, "space", "ctrl", "mouse1".."mouse5", "f1".."f12", "kp_end", etc.) — this covers all of them and rejects anything that could break out of a `bind "<key>" "..."` line. */
const KEY_NAME_RE = /^[a-z0-9_]{1,20}$/

export function isValidKeyName(value: string): boolean {
  return KEY_NAME_RE.test(value)
}

function defaultBinds(): Record<BindActionId, string> {
  const binds = {} as Record<BindActionId, string>
  for (const action of BIND_ACTIONS) binds[action.id] = action.defaultKey
  return binds
}

export function defaultCfgBuilderSettings(): CfgBuilderSettings {
  const settings = {} as CfgBuilderSettings
  for (const f of NUMBER_FIELDS) (settings as Record<string, unknown>)[f.key] = f.default
  for (const f of BOOL_FIELDS) (settings as Record<string, unknown>)[f.key] = f.default
  settings.binds = defaultBinds()
  settings.customBinds = []
  return settings
}

export const DEFAULT_CFG_BUILDER_SETTINGS: CfgBuilderSettings = defaultCfgBuilderSettings()

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** A command line is only well-formed inside `"..."` if it has no embedded quote or newline — GoldSrc has no in-string escape for either. Newlines are folded to a space (never silently truncated); a quote drops the whole entry (see sanitizeCfgBuilderSettings). */
function cleanCommandText(raw: string): string {
  return raw.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_CUSTOM_BIND_COMMAND_LENGTH)
}

/**
 * The only way a CfgBuilderSettings should ever be produced from untrusted
 * input (an IPC call, or a persisted/imported JSON file). Every numeric
 * field is clamped to its hard [min, max] (falling back to `base`'s value,
 * never a hardcoded default, so a partial update never disturbs unrelated
 * fields); every bool is coerced; every bind key is validated against
 * isValidKeyName or dropped back to base; customBinds entries with an
 * invalid key, an empty command, or a command containing a `"` are dropped
 * outright (never partially cleaned into something that could still be
 * misread) rather than kept in a corrupted form.
 */
export function sanitizeCfgBuilderSettings(
  partial: Partial<CfgBuilderSettings>,
  base: CfgBuilderSettings = DEFAULT_CFG_BUILDER_SETTINGS
): CfgBuilderSettings {
  const merged = { ...base, ...partial } as CfgBuilderSettings
  const result = {} as CfgBuilderSettings

  for (const f of NUMBER_FIELDS) {
    ;(result as Record<string, unknown>)[f.key] = clamp((merged as Record<string, unknown>)[f.key], f.min, f.max, base[f.key])
  }
  for (const f of BOOL_FIELDS) {
    ;(result as Record<string, unknown>)[f.key] = !!(merged as Record<string, unknown>)[f.key]
  }

  const mergedBinds = merged.binds ?? base.binds
  const binds = {} as Record<BindActionId, string>
  for (const action of BIND_ACTIONS) {
    const key = mergedBinds[action.id]
    binds[action.id] = key === '' || (typeof key === 'string' && isValidKeyName(key)) ? key : (base.binds[action.id] ?? '')
  }
  result.binds = binds

  const mergedCustom = Array.isArray(merged.customBinds) ? merged.customBinds : base.customBinds
  const customBinds: CustomBind[] = []
  for (const entry of mergedCustom.slice(0, MAX_CUSTOM_BINDS)) {
    if (!entry || typeof entry.key !== 'string' || typeof entry.command !== 'string') continue
    const key = entry.key.toLowerCase()
    if (!isValidKeyName(key)) continue
    const command = cleanCommandText(entry.command)
    if (command === '' || command.includes('"')) continue
    customBinds.push({ key, command })
  }
  result.customBinds = customBinds

  return result
}

/** True when `value` falls outside a field's advisory band (still legal — never blocks anything, just a UI hint). */
export function isNumberFieldAdvisoryOk(field: NumberFieldDef, value: number): boolean {
  if (field.advisoryMin !== undefined && value < field.advisoryMin) return false
  if (field.advisoryMax !== undefined && value > field.advisoryMax) return false
  return true
}

const CFG_HEADER = [
  '// ============================================================================',
  '// 1.6X Launcher — CFG Builder (managed, do not edit)',
  '// Regenerated whenever these settings change in the CFG Builder tab.',
  '// ============================================================================'
]

/**
 * The full, standalone text of the generated leaf cfg — every field is a
 * cvar line or a bind line, nothing else (no exec/alias/unbindall), so this
 * text is also exactly what "Copy to clipboard" / "Save to file" export:
 * a clean, shareable cfg with no launcher-specific markers, valid on its own
 * if a player drops it straight into their cstrike/ folder.
 */
export function buildCfgBuilderCfgText(settings: CfgBuilderSettings): string {
  const lines = [...CFG_HEADER, '']

  for (const f of NUMBER_FIELDS) {
    lines.push(`${f.key} "${settings[f.key]}"`)
  }
  for (const f of BOOL_FIELDS) {
    lines.push(`${f.key} "${settings[f.key] ? 1 : 0}"`)
  }

  const bindLines: string[] = []
  for (const action of BIND_ACTIONS) {
    const key = settings.binds[action.id]
    if (key === '') continue
    bindLines.push(`bind "${key}" "${action.command}"`)
  }
  for (const custom of settings.customBinds) {
    bindLines.push(`bind "${custom.key}" "${custom.command}"`)
  }
  if (bindLines.length > 0) {
    lines.push('', ...bindLines)
  }

  lines.push('')
  return lines.join('\n')
}

const NUMBER_FIELD_KEYS = new Set(NUMBER_FIELDS.map((f) => f.key))
const BOOL_FIELD_KEYS = new Set(BOOL_FIELDS.map((f) => f.key))

/**
 * Best-effort reader for "load a preset as a base": scans a cfg's top-level
 * statements (reusing config-scanner.ts's own tokenizer, same convention as
 * local-config-variant.ts) for lines that set one of this builder's known
 * cvars, and for `bind` lines whose target matches one of BIND_ACTIONS'
 * curated commands exactly. Any `bind` that doesn't match a curated action
 * is carried over as a customBind instead of dropped — this is what lets
 * loading a real player-authored cfg bring its whole keyset into the
 * builder, not just the handful of actions this module curates. The result
 * is a Partial, always passed through sanitizeCfgBuilderSettings by the
 * caller — this function never validates ranges itself.
 */
export function parseCfgBuilderBaseFromText(text: string): Partial<CfgBuilderSettings> {
  const result: Partial<CfgBuilderSettings> = {}
  const binds = {} as Record<BindActionId, string>
  const customBinds: CustomBind[] = []

  for (const rawLine of text.split('\n')) {
    const trimmedLine = rawLine.trim()
    if (trimmedLine === '' || trimmedLine.startsWith('//')) continue
    for (const rawStatement of splitTopLevelStatements(trimmedLine)) {
      const stmt = rawStatement.trim()
      if (stmt === '') continue
      const args = tokenizeArgs(stmt)
      const cmd = (args[0] ?? '').toLowerCase()
      if (cmd === '') continue

      if (cmd === 'bind') {
        const key = (args[1] ?? '').toLowerCase()
        const target = (args[2] ?? '').trim()
        if (key === '' || target === '') continue
        const action = BIND_ACTION_BY_COMMAND.get(target)
        if (action) {
          binds[action.id] = key
        } else if (customBinds.length < MAX_CUSTOM_BINDS) {
          customBinds.push({ key, command: target })
        }
        continue
      }

      const raw = args[1]
      if (raw === undefined) continue
      if (NUMBER_FIELD_KEYS.has(cmd as CfgBuilderNumberKey)) {
        const n = Number(raw)
        if (Number.isFinite(n)) (result as Record<string, unknown>)[cmd] = n
      } else if (BOOL_FIELD_KEYS.has(cmd as CfgBuilderBoolKey)) {
        (result as Record<string, unknown>)[cmd] = raw !== '0'
      }
    }
  }

  if (Object.keys(binds).length > 0) result.binds = { ...defaultBinds(), ...binds }
  if (customBinds.length > 0) result.customBinds = customBinds
  return result
}

export type CfgBuilderDiff = Set<string>

/** Field keys (cvar names, `bind:<actionId>` for a curated bind, or `customBinds` for the whole list) that differ between `base` and `current` — drives the per-field "changed from base" indicator. Never itself validates anything. */
export function diffCfgBuilderSettings(base: CfgBuilderSettings, current: CfgBuilderSettings): CfgBuilderDiff {
  const changed: CfgBuilderDiff = new Set()
  for (const f of NUMBER_FIELDS) if (base[f.key] !== current[f.key]) changed.add(f.key)
  for (const f of BOOL_FIELDS) if (base[f.key] !== current[f.key]) changed.add(f.key)
  for (const action of BIND_ACTIONS) {
    if (base.binds[action.id] !== current.binds[action.id]) changed.add(`bind:${action.id}`)
  }
  if (JSON.stringify(base.customBinds) !== JSON.stringify(current.customBinds)) changed.add('customBinds')
  return changed
}

export { BIND_ACTION_BY_ID }
