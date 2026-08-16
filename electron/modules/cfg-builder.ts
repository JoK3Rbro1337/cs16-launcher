/**
 * cfg-builder — M14: the Electron-side driver for the CFG Builder (the
 * form-driven personal-config generator). Same "independent leaf cfg + its
 * own independently-marked managed exec block" pattern native-crosshair.ts
 * established for the same reason: this feature toggles/regenerates on its
 * own schedule, unrelated to any manifest/profile selection, so folding it
 * into content-sync.ts's execPaths/manifest/cycle-detection pipeline would
 * only add coupling for no benefit. Deliberately never anything but cvar and
 * bind lines in the generated leaf cfg (see cfg-builder-settings.ts's
 * buildCfgBuilderCfgText) — no exec/alias/unbindall — so it can never
 * participate in the userconfig.cfg/autoexec.cfg exec-cycle hazard
 * documented in content-sync.ts and CLAUDE.md, regardless of what a player
 * types into a custom bind's command field.
 *
 * The one field in the whole builder that isn't drawn from a curated-safe
 * catalog is a custom bind's command text — that's real free-form input, so
 * applyCfgBuilderToPath always scans the fully generated cfg (M12.5's
 * config-scanner) before writing anything, and refuses outright on any
 * critical finding (never an "install anyway" override — this is entirely
 * self-authored content, so the right fix is editing the offending bind, not
 * bypassing the check). A curated bind can never itself produce a critical
 * finding (its command always comes from BIND_ACTIONS, a fixed, verified-safe
 * list), so in practice a refusal always points at a custom bind.
 *
 * Only resolveContentPath/backupIfNeeded are reused from content-sync.ts —
 * same as native-crosshair.ts, for the same reason (path-escape safety and
 * preserve-on-first-write, nothing manifest/profile-related).
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'
import { getActiveInstall } from './game-install.ts'
import { resolveContentPath, backupIfNeeded, type ManifestFile } from './content-sync.ts'
import { scanConfigFile, computeSafeScore, type ConfigScanResult, type ScanCounts } from './config-scanner.ts'
import { getLocaleSync } from './locale-store.ts'
import { CATALOGS } from '../../locales/index.ts'
import {
  DEFAULT_CFG_BUILDER_SETTINGS,
  sanitizeCfgBuilderSettings,
  buildCfgBuilderCfgText,
  parseCfgBuilderBaseFromText,
  diffCfgBuilderSettings,
  MAX_CUSTOM_BINDS,
  type CfgBuilderSettings,
  type BindActionId
} from './cfg-builder-settings.ts'

export type {
  CfgBuilderSettings,
  CfgBuilderSection,
  CfgBuilderNumberKey,
  CfgBuilderBoolKey,
  NumberFieldDef,
  BoolFieldDef,
  BindActionId,
  BindActionDef,
  CustomBind
} from './cfg-builder-settings.ts'
export type { ConfigScanResult } from './config-scanner.ts'

const FILENAME = 'cfg-builder-settings.json'
const TARGETS = ['cstrike/autoexec.cfg', 'cstrike/userconfig.cfg']
const CFG_RELPATH = 'cstrike/16x-cfgbuilder.cfg'
const CFG_EXEC_NAME = '16x-cfgbuilder.cfg'
const BLOCK_BEGIN = '// === 16X LAUNCHER CFG BUILDER — DO NOT EDIT BELOW THIS LINE ==='
const BLOCK_END = '// === 16X LAUNCHER CFG BUILDER — END ==='

export interface CfgBuilderBase {
  settings: CfgBuilderSettings
  label: string
}

interface PersistedState {
  settings: CfgBuilderSettings
  base: CfgBuilderBase | null
  lastAppliedAt: string | null
}

export interface CfgBuilderStatus {
  settings: CfgBuilderSettings
  base: CfgBuilderBase | null
  lastAppliedAt: string | null
  /** Field keys (cvar names, `bind:<actionId>`, or `customBinds`) that differ from `base` — computed here, not in the renderer, so the diff logic (diffCfgBuilderSettings) has exactly one caller. Always empty when base is null. */
  changedKeys: string[]
}

export interface CfgBuilderApplyResult {
  ok: boolean
  scan: ConfigScanResult
}

let state: PersistedState = { settings: DEFAULT_CFG_BUILDER_SETTINGS, base: null, lastAppliedAt: null }
let writeQueue: Promise<void> = Promise.resolve()

function userDataDir(): string {
  return app.getPath('userData')
}

async function persist(): Promise<void> {
  const dest = `${userDataDir()}/${FILENAME}`
  const snapshot = state
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
    const text = await readFile(`${userDataDir()}/${FILENAME}`, 'utf-8')
    const parsed = JSON.parse(text) as Partial<PersistedState>
    const settings = sanitizeCfgBuilderSettings(parsed.settings ?? {}, DEFAULT_CFG_BUILDER_SETTINGS)
    const base = parsed.base
      ? { settings: sanitizeCfgBuilderSettings(parsed.base.settings, DEFAULT_CFG_BUILDER_SETTINGS), label: String(parsed.base.label ?? '') }
      : null
    const lastAppliedAt = typeof parsed.lastAppliedAt === 'string' ? parsed.lastAppliedAt : null
    state = { settings, base, lastAppliedAt }
  } catch {
    state = { settings: DEFAULT_CFG_BUILDER_SETTINGS, base: null, lastAppliedAt: null }
  }
}

export async function initCfgBuilder(): Promise<void> {
  await loadPersisted()
}

export function getCfgBuilderStatus(): CfgBuilderStatus {
  const changedKeys = state.base ? [...diffCfgBuilderSettings(state.base.settings, state.settings)] : []
  return { settings: state.settings, base: state.base, lastAppliedAt: state.lastAppliedAt, changedKeys }
}

export async function updateCfgBuilderSettings(partial: Partial<CfgBuilderSettings>): Promise<CfgBuilderStatus> {
  state = { ...state, settings: sanitizeCfgBuilderSettings(partial, state.settings) }
  await persist()
  return getCfgBuilderStatus()
}

export async function resetCfgBuilderToDefault(): Promise<CfgBuilderStatus> {
  state = { settings: DEFAULT_CFG_BUILDER_SETTINGS, base: null, lastAppliedAt: null }
  await persist()
  return getCfgBuilderStatus()
}

/** The generated cfg text for the *current* (persisted) settings — used for the export panel's live preview, "Copy to clipboard", and as the basis for scanCfgBuilder. */
export function previewCfgBuilderText(): string {
  return buildCfgBuilderCfgText(state.settings)
}

function scanText(text: string): ConfigScanResult {
  const findings = scanConfigFile({ path: CFG_RELPATH, text })
  const counts: ScanCounts = { critical: 0, warning: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  return { findings, safeScore: computeSafeScore(counts), counts }
}

/** Scans the current settings' generated text without writing anything — lets the UI show a live "would be blocked" state before the player even clicks Apply. */
export function scanCfgBuilder(): ConfigScanResult {
  return scanText(buildCfgBuilderCfgText(state.settings))
}

async function fetchFileText(file: ManifestFile): Promise<string> {
  const res = await fetch(file.url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${file.path} for CFG Builder preset: HTTP ${res.status}`)
  }
  return res.text()
}

/** Merges two parse results field-by-field: `binds` merges key-by-key (a later file's action override wins per-action, not the whole record), customBinds concatenate (capped) — a plain object spread would let a later file with no binds at all silently wipe an earlier file's binds. */
function mergePresetPartials(a: Partial<CfgBuilderSettings>, b: Partial<CfgBuilderSettings>): Partial<CfgBuilderSettings> {
  const merged: Partial<CfgBuilderSettings> = { ...a, ...b }
  if (a.binds || b.binds) {
    merged.binds = { ...(a.binds ?? {}), ...(b.binds ?? {}) } as Record<BindActionId, string>
  }
  if (a.customBinds || b.customBinds) {
    merged.customBinds = [...(a.customBinds ?? []), ...(b.customBinds ?? [])].slice(0, MAX_CUSTOM_BINDS)
  }
  return merged
}

/**
 * "Load preset as base": fetches every file in a config-slot variant (a
 * manifest variant is commonly one file, but this handles more), parses each
 * for known cvars/binds (best-effort — see parseCfgBuilderBaseFromText),
 * merges them in file order, and adopts the sanitized result as both the new
 * live settings and the new diff base. Loading a preset always replaces the
 * current settings outright (not merged onto them) — "start from this, then
 * modify" per the M14 spec, not a partial overlay of two unrelated configs.
 */
export async function loadCfgBuilderPreset(files: ManifestFile[], label: string): Promise<CfgBuilderStatus> {
  const texts = await Promise.all(files.map(fetchFileText))
  let parsed: Partial<CfgBuilderSettings> = {}
  for (const text of texts) {
    parsed = mergePresetPartials(parsed, parseCfgBuilderBaseFromText(text))
  }
  const settings = sanitizeCfgBuilderSettings(parsed, DEFAULT_CFG_BUILDER_SETTINGS)
  state = { settings, base: { settings, label }, lastAppliedAt: state.lastAppliedAt }
  await persist()
  return getCfgBuilderStatus()
}

/** Removes a prior instance of *this module's own* block only — content-sync's and native-crosshair's separately-marked blocks, and the player's own lines, are untouched regardless of what's found here. */
function stripOwnBlock(lines: string[]): string[] {
  const beginIndex = lines.findIndex((line) => line.trim() === BLOCK_BEGIN)
  if (beginIndex === -1) return lines
  let endIndex = lines.findIndex((line, i) => i > beginIndex && line.trim() === BLOCK_END)
  if (endIndex === -1) endIndex = lines.length - 1
  const before = lines.slice(0, beginIndex)
  const after = lines.slice(endIndex + 1)
  if (before.length > 0 && before[before.length - 1].trim() === '') before.pop()
  return [...before, ...after]
}

function buildTargetContent(existingText: string, enabled: boolean): string {
  const lines = existingText.length > 0 ? existingText.split('\n') : []
  const stripped = stripOwnBlock(lines)
  if (!enabled) {
    return stripped.join('\n')
  }
  const block = [BLOCK_BEGIN, `exec ${CFG_EXEC_NAME}`, BLOCK_END]
  const needsGap = stripped.length > 0 && stripped[stripped.length - 1].trim() !== ''
  const nextLines = needsGap ? [...stripped, '', ...block] : [...stripped, ...block]
  return `${nextLines.join('\n')}\n`
}

async function writeManagedTargets(gamePath: string, enabled: boolean): Promise<void> {
  for (const targetRelPath of TARGETS) {
    const destPath = resolveContentPath(gamePath, targetRelPath)
    const existingText = await readFile(destPath, 'utf-8').catch((err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw err
    })
    const nextText = buildTargetContent(existingText, enabled)
    if (nextText === existingText) continue

    await backupIfNeeded(gamePath, targetRelPath, destPath)
    await mkdir(dirname(destPath), { recursive: true })
    const tmp = `${destPath}.part`
    await writeFile(tmp, nextText)
    await rename(tmp, destPath)
  }
}

/**
 * Exported (not just an internal helper) so a verify script can exercise it
 * directly against a throwaway sandbox game directory — see CLAUDE.md's
 * sandbox-only testing rule, and native-crosshair.ts's applyNativeCrosshair
 * for the same convention. Scans before writing anything: on a critical
 * finding, neither the leaf cfg nor either managed target is touched.
 */
export async function applyCfgBuilderToPath(gamePath: string, settings: CfgBuilderSettings): Promise<CfgBuilderApplyResult> {
  const text = buildCfgBuilderCfgText(settings)
  const scan = scanText(text)
  if (scan.counts.critical > 0) {
    return { ok: false, scan }
  }

  const cfgDestPath = resolveContentPath(gamePath, CFG_RELPATH)
  await mkdir(dirname(cfgDestPath), { recursive: true })
  const tmp = `${cfgDestPath}.part`
  await writeFile(tmp, text)
  await rename(tmp, cfgDestPath)

  await writeManagedTargets(gamePath, true)

  return { ok: true, scan }
}

/** Removes the CFG Builder's managed block from both targets (the generated leaf cfg itself is left in place — harmless once nothing execs it — same "remove the pointer, not the file" stance content-sync's prune takes for its own managed block). */
export async function removeCfgBuilderFromPath(gamePath: string): Promise<void> {
  await writeManagedTargets(gamePath, false)
}

async function requireGamePath(): Promise<string> {
  const install = await getActiveInstall()
  if (!install.installed || !install.gamePath) {
    throw new Error('CS 1.6 install not found — set one up in Settings')
  }
  return install.gamePath
}

/** Applies the current persisted settings to the real, detected game install. */
export async function applyCfgBuilder(): Promise<CfgBuilderApplyResult> {
  const gamePath = await requireGamePath()
  const result = await applyCfgBuilderToPath(gamePath, state.settings)
  if (result.ok) {
    state = { ...state, lastAppliedAt: new Date().toISOString() }
    await persist()
  }
  return result
}

export async function removeCfgBuilderFromGame(): Promise<void> {
  const gamePath = await requireGamePath()
  await removeCfgBuilderFromPath(gamePath)
  state = { ...state, lastAppliedAt: null }
  await persist()
}

const EXPORT_FILE_FILTERS = [
  { name: 'Config', extensions: ['cfg'] },
  { name: 'All files', extensions: ['*'] }
]

export async function exportCfgBuilderFile(window: BrowserWindow | null): Promise<{ canceled: boolean }> {
  const title = CATALOGS[getLocaleSync()].dialogs.exportCfgBuilderTitle
  const result = window
    ? await dialog.showSaveDialog(window, { title, defaultPath: '1.6x-cfgbuilder.cfg', filters: EXPORT_FILE_FILTERS })
    : await dialog.showSaveDialog({ title, defaultPath: '1.6x-cfgbuilder.cfg', filters: EXPORT_FILE_FILTERS })
  if (result.canceled || !result.filePath) return { canceled: true }
  await writeFile(result.filePath, previewCfgBuilderText())
  return { canceled: false }
}
