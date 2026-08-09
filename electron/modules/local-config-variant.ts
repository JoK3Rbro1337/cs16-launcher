/**
 * "My Config" — a client-only local variant of the config slot, representing
 * whatever the player's own cstrike/config.cfg already contains.
 *
 * It is never part of a manifest and never written back into the game:
 * config.cfg is the engine's own file (already active — the engine loads it
 * unconditionally on startup and overwrites it on exit), so selecting My
 * Config is a pure no-op for sync. content-sync's per-slot merge already
 * gives us this for free: `LOCAL_VARIANT_ID` is a variant id no real
 * manifest will ever define, so looking it up in `slot.variants` always
 * misses, which means the slot contributes zero files — exactly "leave the
 * player's config alone." Manifests must therefore never define a real slot
 * variant with id `my-config` for the config slot; that's a curation-time
 * contract, not something enforced at runtime, the same way isExecCfg in
 * content-sync.ts relies on a path convention rather than a flag.
 *
 * The snapshot stored here exists purely so the UI can show what's active,
 * diff it against the live file on "Update snapshot", and let the player see
 * they have something to switch back to after trying a manifest variant.
 * Storage lives under Electron's userData dir — never the game install, and
 * never manifest-driven.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { detectSteam } from './steam-detect.ts'
import {
  firstToken,
  splitTopLevelStatements,
  tokenizeArgs,
  scanConfigFile,
  computeSafeScore,
  type ConfigScanResult,
  type ScanCounts
} from './config-scanner.ts'

/** Convention: the config slot's id in any manifest that defines one. */
export const CONFIG_SLOT_ID = 'config'
/** Reserved sentinel variant id for the local "My Config" pseudo-variant — see module doc. */
export const LOCAL_VARIANT_ID = 'my-config'

const CONFIG_CFG_RELPATH = 'cstrike/config.cfg'
const SNAPSHOT_FILENAME = 'my-config-snapshot.json'

/**
 * Commands that make a line unsafe to keep in a stored/displayed snapshot:
 * connecting elsewhere, loading other cfgs, redefining commands via alias,
 * or replaying rcon credentials. Applied to every line, and additionally to
 * a bind's target action string (a bind can smuggle any of these).
 */
const BLOCKED_COMMANDS = ['connect', 'connect_lan', 'exec', 'alias', 'rcon', 'rcon_password']

export interface LocalVariantSnapshot {
  label: string
  createdAt: string
  updatedAt: string
  /** Sanitized config.cfg body, header excluded — diffs compare this, not the header (whose date/count lines always differ run to run). */
  body: string
  strippedCount: number
}

export interface UpdatePreview {
  hasSnapshot: boolean
  changedLines: number
  configCfgFound: boolean
}

/**
 * Statement-level check (reuses config-scanner.ts's parser — see M12.5):
 * splits on the engine's own `;` statement separator, so a blocked command
 * chained after another statement on the same line (`name "x"; rcon ...`) is
 * caught, not just a line whose very first token is blocked. A bind's target
 * string gets the same treatment recursively, since it's executed as its own
 * command line when the key is pressed.
 */
function isLineSafe(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('//')) return true
  for (const rawStatement of splitTopLevelStatements(trimmed)) {
    const stmt = rawStatement.trim()
    if (stmt === '') continue
    const cmd = firstToken(stmt)
    if (BLOCKED_COMMANDS.includes(cmd)) return false
    if (cmd === 'bind') {
      const target = tokenizeArgs(stmt)[2] ?? ''
      for (const rawSub of splitTopLevelStatements(target)) {
        const sub = rawSub.trim()
        if (sub !== '' && BLOCKED_COMMANDS.includes(firstToken(sub))) return false
      }
    }
  }
  return true
}

export function sanitizeConfigCfg(rawText: string): { sanitized: string; strippedCount: number } {
  const lines = rawText.split('\n')
  const kept: string[] = []
  let strippedCount = 0
  for (const line of lines) {
    if (isLineSafe(line)) kept.push(line)
    else strippedCount++
  }
  return { sanitized: kept.join('\n'), strippedCount }
}

function buildHeader(snapshotDate: string, strippedCount: number): string {
  return [
    '// ============================================================================',
    '// My Config (local)',
    `// Snapshot date: ${snapshotDate}`,
    "// Source: auto-snapshot of this PC's cstrike/config.cfg",
    `// Sanitized: removed ${strippedCount} line(s) containing connect/exec/alias/rcon commands`,
    '// Stored locally only — never published, never synced from a manifest.',
    '// ============================================================================',
    ''
  ].join('\n')
}

/** Symmetric multiset diff of two texts' lines — "N lines changed" (added + removed), order-insensitive. */
export function countChangedLines(oldText: string, newText: string): number {
  const count = (text: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (const line of text.split('\n')) m.set(line, (m.get(line) ?? 0) + 1)
    return m
  }
  const oldCount = count(oldText)
  const newCount = count(newText)
  const keys = new Set([...oldCount.keys(), ...newCount.keys()])
  let changed = 0
  for (const key of keys) {
    changed += Math.abs((oldCount.get(key) ?? 0) - (newCount.get(key) ?? 0))
  }
  return changed
}

function snapshotPath(): string {
  return join(app.getPath('userData'), SNAPSHOT_FILENAME)
}

export async function loadLocalVariant(): Promise<LocalVariantSnapshot | null> {
  try {
    const text = await readFile(snapshotPath(), 'utf-8')
    return JSON.parse(text) as LocalVariantSnapshot
  } catch {
    return null
  }
}

/** M12.5 — scans the stored "My Config" snapshot's already-sanitized body. Null if no snapshot exists yet. */
export async function scanLocalVariant(): Promise<ConfigScanResult | null> {
  const snapshot = await loadLocalVariant()
  if (!snapshot) return null
  const findings = scanConfigFile({ path: 'cstrike/config.cfg', text: snapshot.body })
  const counts: ScanCounts = { critical: 0, warning: 0, info: 0 }
  for (const f of findings) counts[f.severity]++
  return { findings, safeScore: computeSafeScore(counts), counts }
}

async function saveLocalVariant(snapshot: LocalVariantSnapshot): Promise<void> {
  const dest = snapshotPath()
  await mkdir(app.getPath('userData'), { recursive: true })
  const tmp = `${dest}.part`
  await writeFile(tmp, JSON.stringify(snapshot, null, 2))
  await rename(tmp, dest)
}

async function readGameConfigCfg(): Promise<string | null> {
  const detection = await detectSteam()
  if (!detection.installed || !detection.gamePath) return null
  try {
    return await readFile(join(detection.gamePath, CONFIG_CFG_RELPATH), 'utf-8')
  } catch {
    return null
  }
}

/** Composes a snapshot's displayable/exportable text: fresh header (using its own stored metadata) + sanitized body. */
export function snapshotFullText(snapshot: LocalVariantSnapshot): string {
  return buildHeader(snapshot.updatedAt, snapshot.strippedCount) + snapshot.body
}

function snapshotFrom(rawText: string, previous: LocalVariantSnapshot | null): LocalVariantSnapshot {
  const { sanitized, strippedCount } = sanitizeConfigCfg(rawText)
  const now = new Date().toISOString()
  return {
    label: 'My Config',
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    body: sanitized,
    strippedCount
  }
}

/**
 * Called on first render/sync of the config slot: creates "My Config" from
 * the live config.cfg if one exists and no snapshot has ever been taken.
 * A no-op every time after — never overwrites an existing snapshot (that's
 * what "Update snapshot" is for).
 */
export async function ensureLocalVariant(): Promise<LocalVariantSnapshot | null> {
  const existing = await loadLocalVariant()
  if (existing) return existing
  const raw = await readGameConfigCfg()
  if (raw === null) return null
  const snapshot = snapshotFrom(raw, null)
  await saveLocalVariant(snapshot)
  return snapshot
}

/** Re-reads the live config.cfg and reports how many lines would change vs. the stored snapshot, without saving. */
export async function previewUpdateLocalVariant(): Promise<UpdatePreview> {
  const existing = await loadLocalVariant()
  const raw = await readGameConfigCfg()
  if (raw === null) {
    return { hasSnapshot: existing !== null, changedLines: 0, configCfgFound: false }
  }
  const { sanitized } = sanitizeConfigCfg(raw)
  const changedLines = existing ? countChangedLines(existing.body, sanitized) : 0
  return { hasSnapshot: existing !== null, changedLines, configCfgFound: true }
}

/**
 * Import for profile restore (M13). The snapshot is untrusted here (it came from a file on
 * disk, not straight from this machine's config.cfg), so its body is re-sanitized rather than
 * trusted as-is — defense in depth against a tampered/hand-edited export smuggling a
 * connect/exec/alias/rcon line back in. 'merge' only adopts the import if no local snapshot
 * exists yet (never clobbers one the player already has); 'replace' overwrites with the
 * imported snapshot. A null `imported` (the exported profile never had one) is always a
 * no-op in both modes — nothing to import, and there's no reason "replace" should ever
 * delete a snapshot the player has locally just because the file they're importing lacks one.
 */
export async function importLocalVariant(
  imported: LocalVariantSnapshot | null,
  mode: 'merge' | 'replace'
): Promise<LocalVariantSnapshot | null> {
  const existing = await loadLocalVariant()
  if (!imported) return existing
  if (mode === 'merge' && existing) return existing
  const { sanitized, strippedCount } = sanitizeConfigCfg(imported.body)
  const snapshot: LocalVariantSnapshot = {
    label: imported.label || 'My Config',
    createdAt: imported.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    body: sanitized,
    strippedCount
  }
  await saveLocalVariant(snapshot)
  return snapshot
}

/** Re-reads the live config.cfg and overwrites the stored snapshot. */
export async function commitUpdateLocalVariant(): Promise<LocalVariantSnapshot> {
  const raw = await readGameConfigCfg()
  if (raw === null) throw new Error("config.cfg not found — can't update the local snapshot")
  const existing = await loadLocalVariant()
  const snapshot = snapshotFrom(raw, existing)
  await saveLocalVariant(snapshot)
  return snapshot
}
