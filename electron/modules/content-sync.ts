/**
 * content-sync — keep the custom build content in sync with a CDN manifest.
 *
 * Fetches manifest.json, hashes each local file (sha256), diffs against the
 * manifest, and runs a concurrency-limited download queue for missing/changed
 * files. Downloads land in `<path>.part` and are renamed into place only after
 * their hash verifies — an interrupted sync just leaves a stray `.part` file
 * and the next run re-diffs and re-downloads it, which is the resume strategy
 * (no HTTP range requests). This is fully separate from launcher self-update
 * (electron-updater).
 *
 * Manifest hosting: GitHub Releases for now (per-file assets, flat names —
 * see scripts/generate-manifest.mjs). `path` in each entry is relative to the
 * game install root, e.g. "cstrike/sound/weapons/deagle-1.wav".
 */

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { once } from 'node:events'
import { detectSteam } from './steam-detect'

export interface ManifestFile {
  path: string
  sha256: string
  size: number
  url: string
}

export interface ContentManifest {
  version: string
  files: ManifestFile[]
}

export interface SyncProgress {
  totalFiles: number
  completedFiles: number
  totalBytes: number
  downloadedBytes: number
  currentFile: string | null
}

export interface SyncResult {
  version: string
  contentDir: string
  updatedFiles: number
  skippedFiles: number
}

const CONCURRENCY = 4

export async function fetchManifest(manifestUrl: string): Promise<ContentManifest> {
  const res = await fetch(manifestUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest: HTTP ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ContentManifest
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
  onProgress: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const detection = await detectSteam()
  if (!detection.installed || !detection.gamePath) {
    throw new Error('CS 1.6 install not found — run Steam detection first')
  }
  const contentDir = detection.gamePath

  const manifest = await fetchManifest(manifestUrl)

  // Diff pass: hash existing files to find what actually needs downloading, so
  // progress totals below reflect this run's real work (and reach 100%).
  const toDownload: ManifestFile[] = []
  let skippedFiles = 0
  await runPool(manifest.files, CONCURRENCY, async (file) => {
    const destPath = resolveContentPath(contentDir, file.path)
    const existingHash = await hashFile(destPath)
    if (existingHash === file.sha256) {
      skippedFiles++
    } else {
      toDownload.push(file)
    }
  })

  const progress: SyncProgress = {
    totalFiles: toDownload.length,
    completedFiles: 0,
    totalBytes: toDownload.reduce((sum, f) => sum + f.size, 0),
    downloadedBytes: 0,
    currentFile: null
  }
  onProgress({ ...progress })

  await runPool(toDownload, CONCURRENCY, async (file) => {
    const destPath = resolveContentPath(contentDir, file.path)
    progress.currentFile = file.path
    onProgress({ ...progress })

    await downloadFile(file, destPath, (n) => {
      progress.downloadedBytes += n
      onProgress({ ...progress })
    })

    progress.completedFiles++
    progress.currentFile = null
    onProgress({ ...progress })
  })

  return { version: manifest.version, contentDir, updatedFiles: toDownload.length, skippedFiles }
}
