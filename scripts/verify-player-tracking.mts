/**
 * Sandbox-safe verification for M13's nickname tracking and known-players
 * profile-import merge logic (electron/modules/player-tracking.ts,
 * known-servers.ts's importKnownServers). These modules call
 * `app.getPath('userData')`, which only resolves inside a real Electron
 * process (plain `node` gets a path string, not the API) — unlike
 * verify-notifications.mts/verify-desktop-integration.mts, this must run
 * under Electron itself:
 *
 *   ./node_modules/.bin/electron --disable-gpu --no-sandbox scripts/verify-player-tracking.mts
 *
 * `app.setPath('userData', <temp dir>)` is called before any module touches
 * disk, so this only ever reads/writes a throwaway directory under the OS
 * temp dir — never the real launcher's userData, per CLAUDE.md's sandbox
 * rule (that rule is about the game install, but the same spirit applies:
 * never let a test script touch the user's real app data either).
 *
 * local-config-variant.ts's importLocalVariant is deliberately NOT exercised
 * here: that module statically imports steam-detect.ts, which Node's native
 * (extensionless-resolution-free) ESM loader can't resolve outside the
 * project's bundler — the same class of limitation verify-desktop-
 * integration.mts already documents for a different module. Its merge/
 * replace branching and re-sanitization were instead verified by direct code
 * review (sanitizeConfigCfg itself is unchanged, already relied upon
 * elsewhere; importLocalVariant is a short, easily-inspected function).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

let failures = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

const sandboxDir = mkdtempSync(join(tmpdir(), 'cs16-verify-player-tracking-'))
app.setPath('userData', sandboxDir)

const {
  recordPlayerSightings,
  getPlayerSightings,
  getKnownPlayers,
  setPlayerKnown,
  importKnownPlayers,
  getFriendsOnline
} = await import('../electron/modules/player-tracking.ts')
const { importKnownServers } = await import('../electron/modules/known-servers.ts')

async function run(): Promise<void> {
  console.log('1. recordPlayerSightings: create, re-see increments count, empty names filtered')
  {
    await recordPlayerSightings('203.0.113.10', 27015, ['Alice', 'Bob', '  ', ''])
    let sightings = await getPlayerSightings()
    check('two real names recorded, blanks filtered', sightings.length === 2)
    const alice = sightings.find((s) => s.name === 'Alice')
    check('Alice recorded with timesSeen 1', alice?.timesSeen === 1)

    await recordPlayerSightings('203.0.113.10', 27015, ['Alice'])
    sightings = await getPlayerSightings()
    const aliceAgain = sightings.find((s) => s.name === 'Alice')
    check('re-seeing Alice increments timesSeen without duplicating the entry', aliceAgain?.timesSeen === 2)
    check('still only two sightings total (Bob untouched, no dupes)', sightings.length === 2)
  }

  console.log('2. recordPlayerSightings: same name on different servers tracked separately')
  {
    await recordPlayerSightings('198.51.100.5', 27015, ['Alice'])
    const sightings = await getPlayerSightings()
    const aliceEntries = sightings.filter((s) => s.name === 'Alice')
    check('Alice has independent sightings per server', aliceEntries.length === 2)
  }

  console.log('3. retention pruning: an old sighting is dropped once past the retention window')
  {
    const sightingsPath = join(sandboxDir, 'player-sightings.json')
    const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000
    writeFileSync(
      sightingsPath,
      JSON.stringify([
        { name: 'StaleGhost', ip: '192.0.2.1', port: 27015, firstSeen: fortyDaysAgo, lastSeen: fortyDaysAgo, timesSeen: 1 }
      ])
    )
    // Any record call re-filters the whole set by retention, even for an unrelated server.
    await recordPlayerSightings('192.0.2.2', 27015, ['TriggerPrune'])
    const sightings = await getPlayerSightings()
    check('stale (40-day-old) sighting pruned', !sightings.some((s) => s.name === 'StaleGhost'))
    check('fresh trigger sighting kept', sightings.some((s) => s.name === 'TriggerPrune'))
  }

  console.log('4. setPlayerKnown: mark, note edit preserves markedAt, unmark removes')
  {
    let known = await setPlayerKnown('Alice', true, 'plays de_dust2 a lot')
    const marked = known.find((p) => p.name === 'Alice')
    check('Alice marked known with note', marked?.note === 'plays de_dust2 a lot')
    const firstMarkedAt = marked?.markedAt

    await new Promise((r) => setTimeout(r, 5))
    known = await setPlayerKnown('Alice', true, 'updated note')
    const updated = known.find((p) => p.name === 'Alice')
    check('note updated', updated?.note === 'updated note')
    check('markedAt preserved across a note-only edit', updated?.markedAt === firstMarkedAt)

    known = await setPlayerKnown('Alice', false, '')
    check('unmarking removes the entry', !known.some((p) => p.name === 'Alice'))
    const persisted = await getKnownPlayers()
    check('unmark persisted to disk', !persisted.some((p) => p.name === 'Alice'))
  }

  console.log('5. getFriendsOnline: presence window + grouping by server')
  {
    await setPlayerKnown('Alice', true, '')
    await setPlayerKnown('Bob', true, '')
    // Fresh sighting for Alice on server A (within window from step 1/2 — recorded moments ago).
    await recordPlayerSightings('203.0.113.10', 27015, ['Alice'])
    // Stale sighting for Bob, well outside the presence window.
    const sightingsPath = join(sandboxDir, 'player-sightings.json')
    const existing = await getPlayerSightings()
    const staleBob = existing.map((s) =>
      s.name === 'Bob' && s.ip === '198.51.100.5' ? { ...s, lastSeen: Date.now() - 60 * 60 * 1000 } : s
    )
    writeFileSync(sightingsPath, JSON.stringify(staleBob.length > 0 ? staleBob : existing))
    // Bob was never actually seen — seed one explicitly stale sighting for him.
    await recordPlayerSightings('198.51.100.5', 27016, ['Bob'])
    const seeded = await getPlayerSightings()
    const seededStale = seeded.map((s) =>
      s.name === 'Bob' && s.ip === '198.51.100.5' && s.port === 27016
        ? { ...s, lastSeen: Date.now() - 60 * 60 * 1000 }
        : s
    )
    writeFileSync(sightingsPath, JSON.stringify(seededStale))

    const friends = await getFriendsOnline()
    const aliceServer = friends.find((f) => f.ip === '203.0.113.10' && f.port === 27015)
    check('Alice shows as friends-online on the server she was just seen on', aliceServer?.names.includes('Alice') ?? false)
    const staleBobServer = friends.find((f) => f.ip === '198.51.100.5' && f.port === 27016)
    check('stale Bob sighting (outside presence window) does not appear', staleBobServer === undefined)
  }

  console.log('6. importKnownPlayers: merge never overwrites an existing note, replace does')
  {
    await setPlayerKnown('Carol', true, 'my note')
    let result = await importKnownPlayers([{ name: 'Carol', note: 'imported note', markedAt: Date.now() }], 'merge')
    check('merge keeps local note', result.find((p) => p.name === 'Carol')?.note === 'my note')

    result = await importKnownPlayers([{ name: 'Dave', note: 'new via merge', markedAt: Date.now() }], 'merge')
    check('merge adds a name not already known', result.some((p) => p.name === 'Dave'))
    check('merge is additive, keeps Carol too', result.some((p) => p.name === 'Carol'))

    result = await importKnownPlayers([{ name: 'OnlyThisOne', note: '', markedAt: Date.now() }], 'replace')
    check('replace wipes everything else', result.length === 1 && result[0].name === 'OnlyThisOne')
  }

  console.log('7. importKnownServers: merge keeps the fresher entry by lastSeen, replace adopts wholesale')
  {
    const now = Date.now()
    const localEntry = { ip: '203.0.113.20', port: 27015, name: 'Local Name', firstSeen: now - 1000, lastSeen: now, lastResponded: now }
    await importKnownServers([localEntry], 'replace')

    const staleImport = {
      ip: '203.0.113.20',
      port: 27015,
      name: 'Stale Imported Name',
      firstSeen: now - 100000,
      lastSeen: now - 50000,
      lastResponded: now - 50000
    }
    const freshImport = { ip: '198.51.100.9', port: 27016, name: 'New Server', firstSeen: now, lastSeen: now + 1000, lastResponded: now + 1000 }
    const merged = await importKnownServers([staleImport, freshImport], 'merge')
    const kept = merged.find((e) => e.ip === '203.0.113.20')
    check('merge keeps the LOCAL entry when it is fresher than the imported one', kept?.name === 'Local Name')
    check('merge adds a genuinely new server', merged.some((e) => e.ip === '198.51.100.9'))

    const replaced = await importKnownServers([freshImport], 'replace')
    check('replace drops entries not in the imported list', replaced.length === 1 && replaced[0].ip === '198.51.100.9')
  }
}

run()
  .then(() => {
    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
    rmSync(sandboxDir, { recursive: true, force: true })
    app.exit(failures === 0 ? 0 : 1)
  })
  .catch((err) => {
    console.error(err)
    rmSync(sandboxDir, { recursive: true, force: true })
    app.exit(1)
  })
