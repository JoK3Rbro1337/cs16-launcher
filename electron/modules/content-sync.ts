/**
 * content-sync — keep the custom build content in sync with a CDN manifest,
 * variant-aware.
 *
 * Manifest schema v2 layers three kinds of file sets over the game install
 * root:
 *   - `files`   — the base pack, always synced (this is the entire v1
 *                 schema; v1 manifests — no `schemaVersion`, or `files` with
 *                 no `slots`/`features` — still work unchanged, they just
 *                 normalize to empty slots/features).
 *   - `slots`   — named categories (e.g. a weapon-skin slot), each with
 *                 variants; exactly one variant per slot is "active" per the
 *                 caller-supplied BuildProfile, and its files are merged in.
 *   - `features`— optional toggles, each with a files array merged in when
 *                 the profile has that feature enabled.
 *
 * The three layers are merged path-by-path, in order base -> slots ->
 * features (each layer's file for a given path wins over the previous
 * layer's), into one "desired" file set for the current profile. Base
 * therefore reappears automatically for a path once nothing else claims it,
 * which is what makes switching a variant "restore" the base file with no
 * special-case logic: it's just what the merge computes when the old
 * variant is no longer part of the profile.
 *
 * What the merge can't recover on its own is a path a variant/feature
 * introduced with *no* base equivalent — dropping that layer just makes the
 * path vanish from "desired", with nothing to fall back to. `<gamePath>/
 * .16x-launcher-state.json` exists for exactly this: it's the set of paths
 * this launcher has itself written, so a sync can tell "no longer desired,
 * safe to reclaim because we're the ones who put it there" apart from any
 * other file sitting in the install (world files, configs, whatever) that
 * we must never touch. A path only enters the state file when we actually
 * verify writing it ourselves (a fresh download, or a hash match on a path
 * that was already in the state file) — never merely because it happens to
 * already match by coincidence (e.g. a base entry that's byte-identical to
 * the vanilla Steam install). That asymmetry matters: adopting a coincidental
 * match into "things we own" would make a later prune delete a file this
 * launcher never actually put there.
 *
 * "Reclaim" is a restore, not always a delete — a manifest's `files` (base)
 * commonly does not enumerate every stock game file (a real pack only lists
 * what it manages), so the very first time we're about to overwrite a path,
 * whatever is already sitting there (a stock Steam-installed file, or a
 * player's own file) might be the *only* copy of it that exists — there's no
 * base entry to fall back to. Before that first overwrite, we copy the
 * existing file to `<gamePath>/.16x-launcher-backups/`, mirroring its
 * relative path. Once a path has a backup, later overwrites of it (e.g.
 * switching between variants that both touch the same path) never re-back it
 * up — the backup must stay the *original*, pre-launcher content, not some
 * intermediate variant's. When a path is later orphaned, prune restores from
 * the backup (and removes it) if one exists, and only deletes outright when
 * there's no backup — meaning the path never had prior content, so it's
 * purely launcher-introduced and safe to remove entirely.
 *
 * Downloads land in `<path>.part` and are renamed into place only after
 * their hash verifies — an interrupted sync just leaves a stray `.part`
 * file and the next run re-diffs and re-downloads it (no HTTP range
 * requests; that's the resume story). This is fully separate from launcher
 * self-update (electron-updater).
 *
 * Manifest hosting: GitHub Releases (per-file assets, flat names — see
 * scripts/generate-manifest.mjs). Every file's `path` is relative to the
 * game install root, e.g. "cstrike/sound/weapons/deagle-1.wav".
 *
 * Config files get one more layer on top: any desired file that is a game
 * config (`type: "exec-cfg"`, or by convention any cstrike/*.cfg other than
 * config.cfg/autoexec.cfg) syncs as a normal file through the same
 * base/slot/feature pipeline above — nothing special there — but is also
 * `exec`'d automatically by writing an `exec <path>` line into a clearly
 * delimited block inside cstrike/autoexec.cfg, which the engine already
 * execs on startup. The block is fully recomputed from the current desired
 * set on every sync (rewritten on variant switch, emptied on deselect) and
 * everything outside its BEGIN/END markers — a player's own autoexec lines
 * — is left untouched. autoexec.cfg is backed up on its first-ever write via
 * the same backupIfNeeded used for regular files, but is deliberately never
 * added to the state file's whole-file ownership map: we only ever own the
 * block inside it, never the file itself, so it must never go through
 * pruneOrphans' restore-or-delete. config.cfg is excluded from this
 * mechanism entirely and must never be written by the launcher — the engine
 * overwrites it on exit, so anything we wrote there would just be lost.
 */

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { once } from 'node:events'
import { detectSteam } from './steam-detect'

export interface ManifestFile {
  path: string
  sha256: string
  size: number
  url: string
  /**
   * 'exec-cfg' marks a file as a game config that the managed autoexec.cfg
   * block should `exec` when this file is part of the active profile — see
   * isExecCfg below for the equivalent folder/extension convention that
   * applies even when this is unset.
   */
  type?: 'exec-cfg'
}

export interface ManifestVariant {
  id: string
  label: string
  files: ManifestFile[]
}

export interface ManifestSlot {
  id: string
  label: string
  variants: ManifestVariant[]
}

export interface ManifestFeature {
  id: string
  label: string
  files: ManifestFile[]
}

/** Manifest as fetched and normalized — v1 manifests just get empty slots/features. */
export interface ContentManifest {
  version: string
  files: ManifestFile[]
  slots: ManifestSlot[]
  features: ManifestFeature[]
}

/** The renderer's Home-page selections, keyed by slot/feature id. */
export interface BuildProfile {
  /** slotId -> selected variantId */
  selections: Record<string, string>
  /** featureId -> enabled */
  features: Record<string, boolean>
}

export interface SyncProgressItem {
  path: string
  size: number
  downloadedBytes: number
  status: 'pending' | 'downloading' | 'done'
}

export interface SyncProgress {
  totalFiles: number
  completedFiles: number
  totalBytes: number
  downloadedBytes: number
  currentFile: string | null
  /** Per-file detail for the sync screen's item rows — active item(s) first. */
  items: SyncProgressItem[]
}

export interface SyncResult {
  version: string
  contentDir: string
  updatedFiles: number
  skippedFiles: number
  removedFiles: number
  restoredFiles: number
}

type FileOwner =
  | { kind: 'base' }
  | { kind: 'slot'; slotId: string; variantId: string }
  | { kind: 'feature'; featureId: string }

interface StateFile {
  /** manifest-relative path -> the file this launcher last verified writing there */
  files: Record<string, { sha256: string; owner: FileOwner }>
}

const STATE_FILENAME = '.16x-launcher-state.json'
export const BACKUP_DIRNAME = '.16x-launcher-backups'
const CONCURRENCY = 4

const AUTOEXEC_PATH = 'cstrike/autoexec.cfg'
const BLOCK_BEGIN = '// === 16X LAUNCHER MANAGED BLOCK — DO NOT EDIT BELOW THIS LINE ==='
const BLOCK_END = '// === 16X LAUNCHER MANAGED BLOCK — END ==='

interface RawManifestInput {
  version: string
  files?: ManifestFile[]
  slots?: ManifestSlot[]
  features?: ManifestFeature[]
}

export async function fetchManifest(manifestUrl: string): Promise<ContentManifest> {
  const res = await fetch(manifestUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest: HTTP ${res.status} ${res.statusText}`)
  }
  const raw = (await res.json()) as RawManifestInput
  return {
    version: raw.version,
    files: raw.files ?? [],
    slots: raw.slots ?? [],
    features: raw.features ?? []
  }
}

async function hashFile(path: string): Promise<string | null> {
  try {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk)
    }
    return hash.digest('hex')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Resolve a manifest-relative path under `root`, rejecting any escape via `..`. */
function resolveContentPath(root: string, relPath: string): string {
  const rootResolved = resolve(root)
  const dest = resolve(rootResolved, relPath)
  if (dest !== rootResolved && !dest.startsWith(rootResolved + sep)) {
    throw new Error(`Manifest file path escapes content root: ${relPath}`)
  }
  return dest
}

function resolveBackupPath(contentDir: string, relPath: string): string {
  return resolveContentPath(join(contentDir, BACKUP_DIRNAME), relPath)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Preserves whatever is currently at `destPath` before we overwrite it, but
 * only the first time: if a backup already exists for this path, it's the
 * true pre-launcher original and must not be clobbered by an intermediate
 * variant's bytes. If nothing exists at `destPath` yet, there's nothing to
 * preserve.
 */
async function backupIfNeeded(contentDir: string, path: string, destPath: string): Promise<void> {
  const backupPath = resolveBackupPath(contentDir, path)
  if (await pathExists(backupPath)) return
  if (!(await pathExists(destPath))) return
  await mkdir(dirname(backupPath), { recursive: true })
  await copyFile(destPath, backupPath)
}

async function loadState(contentDir: string): Promise<StateFile> {
  try {
    const text = await readFile(join(contentDir, STATE_FILENAME), 'utf-8')
    const parsed = JSON.parse(text) as StateFile
    return { files: parsed.files ?? {} }
  } catch {
    return { files: {} }
  }
}

async function saveState(contentDir: string, state: StateFile): Promise<void> {
  const destPath = join(contentDir, STATE_FILENAME)
  const tmpPath = `${destPath}.part`
  await writeFile(tmpPath, JSON.stringify(state, null, 2))
  await rename(tmpPath, destPath)
}

/**
 * Layer base -> slots -> features into one path -> file map for the given
 * profile. An unknown/unselected slot (stale variant id, or no selection
 * yet) simply contributes nothing, leaving base (or nothing) for its paths.
 */
function computeDesiredFiles(
  manifest: ContentManifest,
  profile: BuildProfile
): Map<string, { file: ManifestFile; owner: FileOwner }> {
  const desired = new Map<string, { file: ManifestFile; owner: FileOwner }>()

  for (const file of manifest.files) {
    desired.set(file.path, { file, owner: { kind: 'base' } })
  }

  for (const slot of manifest.slots) {
    const variant = slot.variants.find((v) => v.id === profile.selections[slot.id])
    if (!variant) continue
    for (const file of variant.files) {
      desired.set(file.path, { file, owner: { kind: 'slot', slotId: slot.id, variantId: variant.id } })
    }
  }

  for (const feature of manifest.features) {
    if (!profile.features[feature.id]) continue
    for (const file of feature.files) {
      desired.set(file.path, { file, owner: { kind: 'feature', featureId: feature.id } })
    }
  }

  return desired
}

/** True for a game config that the managed autoexec.cfg block should `exec`. */
function isExecCfg(file: ManifestFile): boolean {
  if (file.type === 'exec-cfg') return true
  const lower = file.path.toLowerCase()
  if (!lower.startsWith('cstrike/')) return false
  if (!lower.endsWith('.cfg')) return false
  const base = lower.slice(lower.lastIndexOf('/') + 1)
  return base !== 'config.cfg' && base !== 'autoexec.cfg'
}

/** A manifest path relative to the game root -> the name the engine's `exec` expects (relative to cstrike/). */
function toExecName(path: string): string {
  const prefix = 'cstrike/'
  return path.toLowerCase().startsWith(prefix) ? path.slice(prefix.length) : path
}

/** Removes a prior managed block (if any), leaving everything else untouched. */
function stripManagedBlock(lines: string[]): string[] {
  const beginIndex = lines.findIndex((line) => line.trim() === BLOCK_BEGIN)
  if (beginIndex === -1) return lines
  let endIndex = lines.findIndex((line, i) => i > beginIndex && line.trim() === BLOCK_END)
  if (endIndex === -1) endIndex = lines.length - 1
  const before = lines.slice(0, beginIndex)
  const after = lines.slice(endIndex + 1)
  // Drop the single blank separator line we insert before a freshly written
  // block, so repeated rewrites don't accumulate blank lines over time.
  if (before.length > 0 && before[before.length - 1].trim() === '') before.pop()
  return [...before, ...after]
}

/** Recomputes autoexec.cfg's full text: existing content untouched, managed block rewritten (or removed). */
function buildAutoexecContent(existingText: string, execPaths: string[]): string {
  const lines = existingText.length > 0 ? existingText.split('\n') : []
  const stripped = stripManagedBlock(lines)
  if (execPaths.length === 0) {
    // stripped's array shape already encodes the original trailing-newline
    // state (a trailing '' element means the source text ended with '\n'),
    // so join alone reproduces it exactly — appending another '\n' here
    // would add a blank line the player never had.
    return stripped.join('\n')
  }
  const block = [BLOCK_BEGIN, ...execPaths.map((path) => `exec ${path}`), BLOCK_END]
  const needsGap = stripped.length > 0 && stripped[stripped.length - 1].trim() !== ''
  const nextLines = needsGap ? [...stripped, '', ...block] : [...stripped, ...block]
  return `${nextLines.join('\n')}\n`
}

/**
 * Rewrites the managed block inside cstrike/autoexec.cfg from the current
 * desired exec-cfg set. Deliberately outside the state-file/pruneOrphans
 * ownership model — see the module doc comment for why.
 */
async function syncAutoexec(contentDir: string, execPaths: string[]): Promise<void> {
  const destPath = resolveContentPath(contentDir, AUTOEXEC_PATH)
  const existingText = await readFile(destPath, 'utf-8').catch((err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw err
  })
  const nextText = buildAutoexecContent(existingText, execPaths)
  if (nextText === existingText) return

  await backupIfNeeded(contentDir, AUTOEXEC_PATH, destPath)
  await mkdir(dirname(destPath), { recursive: true })
  const tmpPath = `${destPath}.part`
  await writeFile(tmpPath, nextText)
  await rename(tmpPath, destPath)
}

/**
 * Reclaims paths the launcher previously wrote that the current profile no
 * longer wants: restored from `.16x-launcher-backups/` when a backup exists
 * (there was real pre-launcher content at this path), deleted outright only
 * when there isn't (the path was purely launcher-introduced).
 */
async function pruneOrphans(
  contentDir: string,
  desired: Map<string, { file: ManifestFile; owner: FileOwner }>,
  state: StateFile
): Promise<{ removed: string[]; restored: string[] }> {
  const removed: string[] = []
  const restored: string[] = []
  for (const path of Object.keys(state.files)) {
    if (desired.has(path)) continue
    const destPath = resolveContentPath(contentDir, path)
    const backupPath = resolveBackupPath(contentDir, path)
    if (await pathExists(backupPath)) {
      await mkdir(dirname(destPath), { recursive: true })
      await rename(backupPath, destPath)
      restored.push(path)
    } else {
      await rm(destPath, { force: true })
      removed.push(path)
    }
    delete state.files[path]
  }
  return { removed, restored }
}

async function downloadFile(
  file: ManifestFile,
  destPath: string,
  onBytes: (n: number) => void
): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true })
  const tmpPath = `${destPath}.part`

  const res = await fetch(file.url)
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${file.path}: HTTP ${res.status}`)
  }

  const writeStream = createWriteStream(tmpPath)
  const hash = createHash('sha256')
  const reader = res.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      onBytes(value.byteLength)
      if (!writeStream.write(value)) {
        await once(writeStream, 'drain')
      }
    }
    writeStream.end()
    await once(writeStream, 'close')
  } catch (err) {
    writeStream.destroy()
    await rm(tmpPath, { force: true })
    throw err
  }

  const actualSha256 = hash.digest('hex')
  if (actualSha256 !== file.sha256) {
    await rm(tmpPath, { force: true })
    throw new Error(
      `Checksum mismatch for ${file.path}: expected ${file.sha256}, got ${actualSha256}`
    )
  }

  await rename(tmpPath, destPath)
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  async function next(): Promise<void> {
    while (index < items.length) {
      const item = items[index++]
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
}

export async function syncContent(
  manifestUrl: string,
  profile: BuildProfile,
  onProgress: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const detection = await detectSteam()
  if (!detection.installed || !detection.gamePath) {
    throw new Error('CS 1.6 install not found — run Steam detection first')
  }
  const contentDir = detection.gamePath

  const manifest = await fetchManifest(manifestUrl)
  const desired = computeDesiredFiles(manifest, profile)
  const state = await loadState(contentDir)

  const { removed: removedPaths, restored: restoredPaths } = await pruneOrphans(contentDir, desired, state)

  // Diff pass: hash existing files to find what actually needs downloading, so
  // progress totals below reflect this run's real work (and reach 100%).
  const entries = [...desired.entries()]
  const toDownload: { path: string; file: ManifestFile; owner: FileOwner }[] = []
  let skippedFiles = 0
  await runPool(entries, CONCURRENCY, async ([path, { file, owner }]) => {
    const destPath = resolveContentPath(contentDir, path)
    const existingHash = await hashFile(destPath)
    if (existingHash === file.sha256) {
      skippedFiles++
      // Only refresh ownership for a path we already tracked — never adopt a
      // path into "things we own" just because it happens to already match.
      if (path in state.files) {
        state.files[path] = { sha256: file.sha256, owner }
      }
    } else {
      toDownload.push({ path, file, owner })
    }
  })

  const items: SyncProgressItem[] = toDownload.map(({ path, file }) => ({
    path,
    size: file.size,
    downloadedBytes: 0,
    status: 'pending'
  }))
  const itemByPath = new Map(items.map((item) => [item.path, item]))

  const progress: SyncProgress = {
    totalFiles: toDownload.length,
    completedFiles: 0,
    totalBytes: toDownload.reduce((sum, d) => sum + d.file.size, 0),
    downloadedBytes: 0,
    currentFile: null,
    items
  }
  onProgress({ ...progress, items: [...items] })

  await runPool(toDownload, CONCURRENCY, async ({ path, file, owner }) => {
    const destPath = resolveContentPath(contentDir, path)
    await backupIfNeeded(contentDir, path, destPath)
    const item = itemByPath.get(path)!
    item.status = 'downloading'
    progress.currentFile = path
    onProgress({ ...progress, items: [...items] })

    await downloadFile(file, destPath, (n) => {
      progress.downloadedBytes += n
      item.downloadedBytes += n
      onProgress({ ...progress, items: [...items] })
    })

    item.status = 'done'
    state.files[path] = { sha256: file.sha256, owner }
    progress.completedFiles++
    progress.currentFile = null
    onProgress({ ...progress, items: [...items] })
  })

  const execPaths = [...desired.values()]
    .filter(({ file }) => isExecCfg(file))
    .map(({ file }) => toExecName(file.path))
    .sort()
  await syncAutoexec(contentDir, execPaths)

  await saveState(contentDir, state)

  return {
    version: manifest.version,
    contentDir,
    updatedFiles: toDownload.length,
    skippedFiles,
    removedFiles: removedPaths.length,
    restoredFiles: restoredPaths.length
  }
}
