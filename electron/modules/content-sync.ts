/**
 * content-sync — keep the custom build content in sync with a CDN manifest.
 *
 * M3 will: fetch manifest.json, hash each local file (sha256), diff against the
 * manifest, and run a concurrent, resumable download queue for missing/changed
 * files. Optional strict-mode prunes files not present in the manifest.
 * This is fully separate from launcher self-update (electron-updater).
 */

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

export async function syncContent(): Promise<void> {
  // TODO(M3): fetch manifest, hash-diff, resumable parallel download queue
  throw new Error('content-sync not implemented yet (M3)')
}
