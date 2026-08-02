/**
 * known-servers — a local, self-growing pool of server addresses the player
 * has actually connected to, observed via session-watcher.ts's qconsole.log
 * tail. Merged into every server-list refresh alongside favorites and other
 * sources (see Servers.tsx), so discovery improves purely from normal play —
 * no network dependency, unlike every other source.
 *
 * Only public addresses whose own A2S query (already performed by
 * session-watcher's handleConnect, reused rather than duplicated here)
 * succeeded are recorded — loopback/private-LAN sessions and connects to
 * servers that didn't even answer A2S never enter the pool. See
 * session-watcher.ts's classifyAddress / handleConnect for the filtering.
 *
 * Entries are pruned once they haven't answered A2S in a while (see
 * recordQueryResults). The pool is merged into the seed of *every* refresh
 * (Servers.tsx), so "hasn't answered" is measured directly off real refresh
 * results rather than a separate tracked "N refreshes" counter — simpler,
 * and behaves the same whether the user refreshes once an hour or once a
 * day. Default retention is ~30 days; configurable in Settings.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

export interface KnownServerEntry {
  ip: string
  port: number
  name: string | null
  firstSeen: number
  lastSeen: number
  lastResponded: number
}

const FILENAME = 'known-servers.json'
export const DEFAULT_RETENTION_DAYS = 30

function userDataDir(): string {
  return app.getPath('userData')
}

function addressKey(ip: string, port: number): string {
  return `${ip}:${port}`
}

// Serializes writes the same way session-watcher.ts's saveJSONFile does — a
// connect event and a post-refresh prune could otherwise race on the same
// .part tmp file.
let writeQueue: Promise<void> = Promise.resolve()

async function save(entries: KnownServerEntry[]): Promise<void> {
  const dest = join(userDataDir(), FILENAME)
  const next = writeQueue.then(async () => {
    await mkdir(userDataDir(), { recursive: true })
    const tmp = `${dest}.part`
    await writeFile(tmp, JSON.stringify(entries, null, 2))
    await rename(tmp, dest)
  })
  writeQueue = next.catch(() => {})
  return next
}

async function load(): Promise<KnownServerEntry[]> {
  try {
    const text = await readFile(join(userDataDir(), FILENAME), 'utf-8')
    return JSON.parse(text) as KnownServerEntry[]
  } catch {
    return []
  }
}

export async function getKnownServers(): Promise<KnownServerEntry[]> {
  return load()
}

/** Called from session-watcher once a public connect's own A2S query has already succeeded. */
export async function recordKnownServer(ip: string, port: number, name: string | null): Promise<void> {
  const entries = await load()
  const key = addressKey(ip, port)
  const now = Date.now()
  const existing = entries.find((e) => addressKey(e.ip, e.port) === key)
  if (existing) {
    existing.name = name ?? existing.name
    existing.lastSeen = now
    existing.lastResponded = now
  } else {
    entries.push({ ip, port, name, firstSeen: now, lastSeen: now, lastResponded: now })
  }
  await save(entries)
}

/**
 * Called after every server-list refresh with the ping outcome for whatever
 * subset of the pool was queried — in practice always the whole pool, since
 * it's merged into every refresh's seed (see Servers.tsx). Responding
 * entries get `lastResponded` bumped to now; entries that haven't answered
 * within `retentionDays` are dropped.
 */
export async function recordQueryResults(
  results: { ip: string; port: number; responded: boolean }[],
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<void> {
  const entries = await load()
  const now = Date.now()
  const respondedKeys = new Set(results.filter((r) => r.responded).map((r) => addressKey(r.ip, r.port)))
  const maxAgeMs = Math.max(1, retentionDays) * 24 * 60 * 60 * 1000
  const next = entries
    .map((e) => (respondedKeys.has(addressKey(e.ip, e.port)) ? { ...e, lastResponded: now } : e))
    .filter((e) => now - e.lastResponded <= maxAgeMs)
  await save(next)
}
