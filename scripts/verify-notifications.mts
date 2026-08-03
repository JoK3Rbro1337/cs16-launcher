/**
 * Sandbox-safe verification harness for M12's anti-spam logic
 * (electron/modules/notification-rules.ts). Pure logic, fake A2S responses —
 * no Electron runtime, no network, no game files touched, so this is safe to
 * run outside any sandbox. Run with `node scripts/verify-notifications.mts`
 * (Node 22.18+/24+ native TS support, no build step needed).
 *
 * Exercises: threshold rules, empty-to-active rules, map-match rules,
 * transition-only firing (no re-fire while a condition holds), per-server
 * cooldown suppressing a second rule on the same tick, quiet-hours
 * suppression that still consumes the transition (no backlog dump when
 * quiet hours end), and a a 100-tick steady-state stress run asserting zero
 * notification storms.
 */

import {
  evaluateServer,
  isQuietHours,
  type NotificationRule,
  type PerServerState
} from '../electron/modules/notification-rules.ts'
import type { GameServer } from '../electron/modules/server-browser.ts'

let failures = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

function server(overrides: Partial<GameServer>): GameServer {
  return {
    ip: '203.0.113.10',
    port: 27015,
    name: 'Fake Server',
    map: 'de_dust2',
    players: 0,
    maxPlayers: 32,
    ping: 40,
    locked: false,
    ...overrides
  }
}

const ADDRESS = { ip: '203.0.113.10', port: 27015 }
const COOLDOWN_MS = 10 * 60_000

console.log('1. player-threshold: fires once on crossing, not while it holds')
{
  const rule: NotificationRule = {
    id: 'r1',
    enabled: true,
    scope: 'global',
    target: null,
    type: 'player-threshold',
    threshold: 10,
    maps: []
  }
  let state: PerServerState | undefined
  let now = 0

  // Below threshold — no fire.
  let r = evaluateServer(ADDRESS, server({ players: 5 }), [rule], state, now, COOLDOWN_MS)
  check('below threshold does not fire', r.fire === null)
  state = r.nextState

  // Crosses threshold — fires.
  now += 60_000
  r = evaluateServer(ADDRESS, server({ players: 12 }), [rule], state, now, COOLDOWN_MS)
  check('crossing threshold fires', r.fire !== null && r.fire.rule.id === 'r1')
  state = r.nextState

  // Stays above threshold on the next tick, but within cooldown — must not re-fire.
  now += 60_000
  r = evaluateServer(ADDRESS, server({ players: 15 }), [rule], state, now, COOLDOWN_MS)
  check('holding above threshold within cooldown does not re-fire', r.fire === null)
  state = r.nextState

  // Still holding, cooldown now elapsed — still must not re-fire (no new transition).
  now += COOLDOWN_MS + 1
  r = evaluateServer(ADDRESS, server({ players: 15 }), [rule], state, now, COOLDOWN_MS)
  check('holding above threshold after cooldown elapses still does not re-fire (not a transition)', r.fire === null)
  state = r.nextState

  // Drops below, then crosses again — new transition, fires.
  now += 60_000
  r = evaluateServer(ADDRESS, server({ players: 3 }), [rule], state, now, COOLDOWN_MS)
  check('dropping below resets the condition', r.fire === null)
  state = r.nextState
  now += 60_000
  r = evaluateServer(ADDRESS, server({ players: 11 }), [rule], state, now, COOLDOWN_MS)
  check('re-crossing after a real drop fires again', r.fire !== null)
}

console.log('2. per-server cooldown suppresses a second rule firing on the same server')
{
  const thresholdRule: NotificationRule = {
    id: 'threshold',
    enabled: true,
    scope: 'global',
    target: null,
    type: 'player-threshold',
    threshold: 5,
    maps: []
  }
  const mapRule: NotificationRule = {
    id: 'map',
    enabled: true,
    scope: 'global',
    target: null,
    type: 'map-match',
    threshold: null,
    maps: ['de_inferno']
  }
  let state: PerServerState | undefined
  let now = 0
  // Baseline: empty, wrong map.
  let r = evaluateServer(ADDRESS, server({ players: 0, map: 'de_dust2' }), [thresholdRule, mapRule], state, now, COOLDOWN_MS)
  state = r.nextState

  // Both conditions transition true on the same tick (players jump AND map changes).
  now += 60_000
  r = evaluateServer(ADDRESS, server({ players: 8, map: 'de_inferno' }), [thresholdRule, mapRule], state, now, COOLDOWN_MS)
  check('only one notification fires when two rules transition simultaneously', r.fire !== null && r.fire.rule.id === 'threshold')
  state = r.nextState

  // A moment later the map rule's condition is still true from this tick's perspective in
  // a real run it would already be captured — but simulate a subsequent tick where map rule
  // would have transitioned on its own (already true from prior tick, no new transition) to
  // confirm cooldown having been consumed didn't leave the map rule pending oddly.
  now += 60_000
  r = evaluateServer(ADDRESS, server({ players: 8, map: 'de_inferno' }), [thresholdRule, mapRule], state, now, COOLDOWN_MS)
  check('no leftover fire once state has settled', r.fire === null)
}

console.log('3. quiet hours: suppression is a caller-side decision, transition still consumes cooldown')
{
  const rule: NotificationRule = {
    id: 'empty-active',
    enabled: true,
    scope: 'global',
    target: null,
    type: 'empty-to-active',
    threshold: null,
    maps: []
  }
  let state: PerServerState | undefined
  let now = 0
  let r = evaluateServer(ADDRESS, server({ players: 0 }), [rule], state, now, COOLDOWN_MS)
  state = r.nextState

  // Transitions to active "during quiet hours" — evaluateServer doesn't know about quiet
  // hours (that's the caller's job, see notification-poller.ts's `suppressed` check), but it
  // must still register the transition + cooldown so a flood doesn't fire when quiet hours end.
  now += 60_000
  r = evaluateServer(ADDRESS, server({ players: 4 }), [rule], state, now, COOLDOWN_MS)
  check('transition detected (caller decides whether to actually show it)', r.fire !== null)
  state = r.nextState

  // Quiet hours end shortly after — condition still holds (not a new transition), so even
  // though the caller would now show notifications again, nothing should fire.
  now += 5 * 60_000
  r = evaluateServer(ADDRESS, server({ players: 6 }), [rule], state, now, COOLDOWN_MS)
  check('no backlog notification once quiet hours end (condition never dropped)', r.fire === null)
}

console.log('4. isQuietHours: same-day and overnight-wrapping windows')
{
  const overnight = { enabled: true, from: '22:00', to: '08:00' }
  const sameDay = { enabled: true, from: '09:00', to: '17:00' }
  check('overnight window: 23:00 is quiet', isQuietHours(overnight, new Date(2026, 0, 1, 23, 0)))
  check('overnight window: 03:00 is quiet', isQuietHours(overnight, new Date(2026, 0, 1, 3, 0)))
  check('overnight window: 12:00 is not quiet', !isQuietHours(overnight, new Date(2026, 0, 1, 12, 0)))
  check('same-day window: 12:00 is quiet', isQuietHours(sameDay, new Date(2026, 0, 1, 12, 0)))
  check('same-day window: 20:00 is not quiet', !isQuietHours(sameDay, new Date(2026, 0, 1, 20, 0)))
  check('disabled window is never quiet', !isQuietHours({ enabled: false, from: '22:00', to: '08:00' }, new Date(2026, 0, 1, 23, 0)))
}

console.log('5. unreachable server never satisfies any condition (no false "empty->active" from a timed-out ping)')
{
  const rule: NotificationRule = {
    id: 'r',
    enabled: true,
    scope: 'global',
    target: null,
    type: 'empty-to-active',
    threshold: null,
    maps: []
  }
  const r = evaluateServer(ADDRESS, server({ players: 8, ping: null }), [rule], undefined, 0, COOLDOWN_MS)
  check('a server with ping === null never fires', r.fire === null)
}

console.log('6. disabled rule never fires, server-scoped rule ignores other addresses')
{
  const disabled: NotificationRule = {
    id: 'd',
    enabled: false,
    scope: 'global',
    target: null,
    type: 'empty-to-active',
    threshold: null,
    maps: []
  }
  const scoped: NotificationRule = {
    id: 's',
    enabled: true,
    scope: 'server',
    target: { ip: '198.51.100.1', port: 27015 },
    type: 'empty-to-active',
    threshold: null,
    maps: []
  }
  let state: PerServerState | undefined
  let r = evaluateServer(ADDRESS, server({ players: 0 }), [disabled, scoped], state, 0, COOLDOWN_MS)
  state = r.nextState
  r = evaluateServer(ADDRESS, server({ players: 8 }), [disabled, scoped], state, 60_000, COOLDOWN_MS)
  check('disabled rule does not fire even though its condition would transition', r.fire === null)

  const scopedAddress = { ip: '198.51.100.1', port: 27015 }
  let scopedState: PerServerState | undefined
  r = evaluateServer(scopedAddress, server({ ...scopedAddress, players: 0 }), [disabled, scoped], scopedState, 0, COOLDOWN_MS)
  scopedState = r.nextState
  r = evaluateServer(scopedAddress, server({ ...scopedAddress, players: 8 }), [disabled, scoped], scopedState, 60_000, COOLDOWN_MS)
  check('server-scoped rule fires for its own address', r.fire !== null && r.fire.rule.id === 's')
}

console.log('7. stress run: 100 ticks of a server sitting steadily above threshold — exactly one notification total')
{
  const rule: NotificationRule = {
    id: 'stress',
    enabled: true,
    scope: 'global',
    target: null,
    type: 'player-threshold',
    threshold: 10,
    maps: []
  }
  let state: PerServerState | undefined
  let fires = 0
  let now = 0
  for (let tick = 0; tick < 100; tick++) {
    const players = tick === 0 ? 2 : 20 // jumps above threshold on tick 1 and stays there
    const r = evaluateServer(ADDRESS, server({ players }), [rule], state, now, COOLDOWN_MS)
    if (r.fire) fires++
    state = r.nextState
    now += 30_000 // 30s between ticks — much faster than the 10min cooldown, worst case for storms
  }
  check(`exactly one notification fired across 100 ticks (got ${fires})`, fires === 1)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
