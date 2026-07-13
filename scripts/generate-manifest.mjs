#!/usr/bin/env node
/**
 * generate-manifest — build a content-sync manifest.json from a local content
 * folder, for publishing a custom content pack as GitHub Release assets.
 *
 * GitHub Release assets are flat (no "/" in the filename), so this script
 * derives a flat, collision-safe asset name per file and can optionally stage
 * copies under those names for `gh release upload`. Each manifest entry's
 * `path` is relative to the game install root (see cs16-launcher-architecture.md
 * section 4), e.g. "cstrike/sound/weapons/deagle-1.wav" — by default that
 * prefix comes from the content folder's own name, so pointing --content at a
 * local `cstrike/` directory produces paths matching the game layout directly.
 *
 * Usage:
 *   node scripts/generate-manifest.mjs \
 *     --content ./content-pack/cstrike \
 *     --version 1.4.2 \
 *     --repo myuser/cs16-content \
 *     --tag v1.4.2 \
 *     [--out manifest.json] [--prefix cstrike] [--stage ./release-assets]
 *
 * Then publish with:
 *   gh release create v1.4.2 ./release-assets/* manifest.json
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
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

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
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

/** Flatten a manifest path into a safe, unique GitHub release asset filename. */
function toAssetName(manifestPath) {
  return manifestPath.replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '-')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { content, version, repo, tag } = args
  if (!content) usageError('--content <dir> is required')
  if (!version) usageError('--version <ver> is required')
  if (!repo) usageError('--repo <owner/repo> is required')
  if (!tag) usageError('--tag <tag> is required')
  if (!/^[^/]+\/[^/]+$/.test(repo)) usageError('--repo must look like <owner>/<repo>')

  const contentDir = content
  const contentStat = await stat(contentDir).catch(() => null)
  if (!contentStat?.isDirectory()) usageError(`--content "${contentDir}" is not a directory`)

  const prefix = args.prefix ?? basename(contentDir)
  const outPath = args.out ?? 'manifest.json'
  const stageDir = args.stage ?? null

  const filePaths = await walk(contentDir)
  if (filePaths.length === 0) usageError(`no files found under "${contentDir}"`)

  const baseUrl = `https://github.com/${repo}/releases/download/${tag}`

  const files = []
  for (const filePath of filePaths) {
    const relPath = relative(contentDir, filePath).split(sep).join('/')
    const manifestPath = prefix ? `${prefix}/${relPath}` : relPath
    const [sha256, { size }] = await Promise.all([hashFile(filePath), stat(filePath)])
    const assetName = toAssetName(manifestPath)

    files.push({ path: manifestPath, sha256, size, url: `${baseUrl}/${assetName}` })

    if (stageDir) {
      await mkdir(stageDir, { recursive: true })
      await copyFile(filePath, join(stageDir, assetName))
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path))

  const manifest = { version, files }
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n')

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  console.log(`Wrote ${outPath}: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`)
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
