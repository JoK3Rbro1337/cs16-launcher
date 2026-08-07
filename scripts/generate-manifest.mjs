#!/usr/bin/env node
/**
 * generate-manifest — build a schemaVersion-2 content-sync manifest.json
 * from a local content folder, for publishing a custom content pack as
 * GitHub Release assets.
 *
 * Folder convention (point --content at the directory containing these):
 *   base/                    always-synced base pack
 *   slots/<slot>/<variant>/  one folder per selectable variant of a slot
 *   features/<feature>/      one folder per optional toggle
 * Every one of those leaf folders is walked exactly like the old flat
 * layout: files inside it map straight to their in-game relative path, so
 * a file at base/cstrike/sound/x.wav or slots/weapons/b1/cstrike/sound/x.wav
 * both produce the manifest path "cstrike/sound/x.wav" (deliberately, for
 * variants — that's what lets content-sync swap one variant's copy of a
 * path for another's). An optional meta.json ({"label": "..."}) in a slot/
 * variant/feature folder overrides its display label; otherwise the label
 * is derived from the folder name.
 *
 * Any file landing at cstrike/*.cfg (other than config.cfg/autoexec.cfg) is
 * automatically tagged "type": "exec-cfg" — content-sync execs those from a
 * managed block it maintains in the player's cstrike/autoexec.cfg whenever
 * they're part of the active profile.
 *
 * If none of base/, slots/, features/ exist under --content, falls back to
 * the old flat/legacy mode: --content is treated as a single base pack
 * (same as content-sync schemaVersion 1), with --prefix behaving as before.
 *
 * GitHub Release assets are flat (no "/" in the filename). Since the same
 * manifest `path` deliberately repeats across a slot's variants, the asset
 * name is derived from the file's location on disk (unique by construction)
 * rather than from its manifest path, and can optionally be staged under
 * those names for `gh release upload`.
 *
 * Usage:
 *   node scripts/generate-manifest.mjs \
 *     --content ./content \
 *     --version 1.4.2 \
 *     --repo myuser/cs16-content \
 *     --tag v1.4.2 \
 *     [--out manifest.json] [--stage ./release-assets]
 *
 *   # legacy flat mode (no base/slots/features under --content):
 *   node scripts/generate-manifest.mjs --content ./content-pack/cstrike \
 *     --version 1.4.2 --repo myuser/cs16-content --tag v1.4.2 [--prefix cstrike]
 *
 * Then publish with:
 *   gh release create v1.4.2 ./release-assets/* manifest.json
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const value = argv[i + 1]
    args[key] = value
    i++
  }
  return args
}

function usageError(message) {
  console.error(`Error: ${message}\n`)
  console.error(
    'Usage: node scripts/generate-manifest.mjs --content <dir> --version <ver> --repo <owner/repo> --tag <tag> [--out manifest.json] [--prefix <prefix>] [--stage <dir>]'
  )
  process.exit(1)
}

function fatalError(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

/**
 * Must match LOCAL_VARIANT_ID in src/lib/configVariant.ts and
 * electron/modules/local-config-variant.ts — reserved for the client-only
 * "My Config" pseudo-variant (whatever the player's own config.cfg already
 * has). A real manifest defining a slot variant with this id would collide
 * with that sentinel: content-sync.ts's slot lookup and Content.tsx's
 * item list both assume no manifest variant ever uses it (see
 * local-config-variant.ts's module doc for the full contract).
 */
const RESERVED_LOCAL_VARIANT_ID = 'my-config'

async function isDir(path) {
  const s = await stat(path).catch(() => null)
  return s?.isDirectory() ?? false
}

async function listDirs(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'meta.json') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(full)))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

/** Flatten a path into a safe, unique GitHub release asset filename. */
function toAssetName(rawPath) {
  return rawPath.replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '-')
}

/** Mirrors content-sync.ts's isExecCfg convention: any cstrike/*.cfg other than config.cfg/autoexec.cfg/userconfig.cfg. */
function inferFileType(manifestPath) {
  const lower = manifestPath.toLowerCase()
  if (!lower.startsWith('cstrike/') || !lower.endsWith('.cfg')) return undefined
  const base = lower.slice(lower.lastIndexOf('/') + 1)
  if (base === 'config.cfg' || base === 'autoexec.cfg' || base === 'userconfig.cfg') return undefined
  return 'exec-cfg'
}

function humanize(id) {
  return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

async function readLabel(dir, fallbackId) {
  try {
    const text = await readFile(join(dir, 'meta.json'), 'utf-8')
    const meta = JSON.parse(text)
    if (typeof meta.label === 'string' && meta.label) return meta.label
  } catch {
    // no meta.json, or it's malformed — fall back to a humanized id
  }
  return humanize(fallbackId)
}

/**
 * Walks `sourceDir` and emits manifest file entries. `manifestPrefix` is
 * prepended to each file's in-game path (used only by legacy flat mode);
 * `assetNamespace` uniquely identifies where this file came from on disk,
 * so the same in-game path from two different variants gets two different
 * (and correctly distinct) release asset names.
 */
async function collectFiles(sourceDir, manifestPrefix, assetNamespace, baseUrl, stageDir) {
  const filePaths = await walk(sourceDir)
  const files = []
  for (const filePath of filePaths) {
    const relPath = relative(sourceDir, filePath).split(sep).join('/')
    const manifestPath = manifestPrefix ? `${manifestPrefix}/${relPath}` : relPath
    const assetName = toAssetName(`${assetNamespace}/${relPath}`)
    const [sha256, { size }] = await Promise.all([hashFile(filePath), stat(filePath)])
    const type = inferFileType(manifestPath)

    files.push({ path: manifestPath, sha256, size, url: `${baseUrl}/${assetName}`, ...(type ? { type } : {}) })

    if (stageDir) {
      await mkdir(stageDir, { recursive: true })
      await copyFile(filePath, join(stageDir, assetName))
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return files
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { content, version, repo, tag } = args
  if (!content) usageError('--content <dir> is required')
  if (!version) usageError('--version <ver> is required')
  if (!repo) usageError('--repo <owner/repo> is required')
  if (!tag) usageError('--tag <tag> is required')
  if (!/^[^/]+\/[^/]+$/.test(repo)) usageError('--repo must look like <owner>/<repo>')

  const contentRoot = content
  if (!(await isDir(contentRoot))) usageError(`--content "${contentRoot}" is not a directory`)

  const outPath = args.out ?? 'manifest.json'
  const stageDir = args.stage ?? null
  const baseUrl = `https://github.com/${repo}/releases/download/${tag}`

  const baseDir = join(contentRoot, 'base')
  const slotsDir = join(contentRoot, 'slots')
  const featuresDir = join(contentRoot, 'features')
  const isV2Layout = (await isDir(baseDir)) || (await isDir(slotsDir)) || (await isDir(featuresDir))

  let files = []
  let slots = []
  let features = []

  if (isV2Layout) {
    if (await isDir(baseDir)) {
      files = await collectFiles(baseDir, '', 'base', baseUrl, stageDir)
    }

    for (const slotId of (await listDirs(slotsDir)).sort()) {
      const slotDir = join(slotsDir, slotId)
      const slotLabel = await readLabel(slotDir, slotId)
      const variants = []
      for (const variantId of (await listDirs(slotDir)).sort()) {
        if (variantId === RESERVED_LOCAL_VARIANT_ID) {
          fatalError(
            `slots/${slotId}/${RESERVED_LOCAL_VARIANT_ID}/ collides with the reserved local-variant id "${RESERVED_LOCAL_VARIANT_ID}" ` +
              `(see LOCAL_VARIANT_ID in src/lib/configVariant.ts / electron/modules/local-config-variant.ts). ` +
              `A manifest can never publish a variant with this id — it's reserved for the client-only "My Config" ` +
              `pseudo-variant, and content-sync/Content.tsx both assume no real variant ever uses it. ` +
              `Rename or remove slots/${slotId}/${RESERVED_LOCAL_VARIANT_ID}/ and try again.`
          )
        }
        const variantDir = join(slotDir, variantId)
        const variantLabel = await readLabel(variantDir, variantId)
        const variantFiles = await collectFiles(
          variantDir,
          '',
          `slots/${slotId}/${variantId}`,
          baseUrl,
          stageDir
        )
        variants.push({ id: variantId, label: variantLabel, files: variantFiles })
      }
      slots.push({ id: slotId, label: slotLabel, variants })
    }

    for (const featureId of (await listDirs(featuresDir)).sort()) {
      const featureDir = join(featuresDir, featureId)
      const featureLabel = await readLabel(featureDir, featureId)
      const featureFiles = await collectFiles(featureDir, '', `features/${featureId}`, baseUrl, stageDir)
      features.push({ id: featureId, label: featureLabel, files: featureFiles })
    }

    if (files.length === 0 && slots.length === 0 && features.length === 0) {
      usageError(`no content found under "${contentRoot}" (expected base/, slots/, or features/)`)
    }
  } else {
    const prefix = args.prefix ?? basename(contentRoot)
    files = await collectFiles(contentRoot, prefix, 'base', baseUrl, stageDir)
    if (files.length === 0) usageError(`no files found under "${contentRoot}"`)
  }

  const manifest = { schemaVersion: 2, version, files, slots, features }
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n')

  const variantCount = slots.reduce((sum, s) => sum + s.variants.length, 0)
  const allFiles = [
    ...files,
    ...slots.flatMap((s) => s.variants.flatMap((v) => v.files)),
    ...features.flatMap((f) => f.files)
  ]
  const totalBytes = allFiles.reduce((sum, f) => sum + f.size, 0)

  console.log(
    `Wrote ${outPath}: ${files.length} base files, ${slots.length} slots (${variantCount} variants), ` +
      `${features.length} features, ${allFiles.length} files total, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`
  )
  if (stageDir) {
    console.log(`Staged flattened assets under ${stageDir}/`)
    console.log(`Publish with: gh release create ${tag} ${stageDir}/* ${outPath}`)
  } else {
    console.log(`Assets expected at: ${baseUrl}/<flattened-name> — pass --stage to prepare them for upload`)
  }
}

main().catch((err) => {
  console.error(err.stack ?? err.message)
  process.exit(1)
})
