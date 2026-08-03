/**
 * notification-rules — pure rule-evaluation logic for the M12 background
 * poller (notification-poller.ts). Deliberately has zero Electron/Node
 * dependency (no `app`, no `Notification`, no fs) so it can be exercised
 * directly by scripts/verify-notifications.ts with fake A2S responses,
 * without spinning up Electron.
 *
 * Anti-spam design lives entirely in evaluateServer:
 *  - Fires only on a false->true transition of a rule's condition, never
 *    while the condition merely continues to hold (`prevConditions`).
 *  - At most one notification per server per tick: once a rule fires, this
 *    server's cooldown is considered consumed immediately (within the same
 *    evaluateServer call), so any other rule transitioning for the same
 *    server on the same tick is suppressed rather than queued.
 *  - Cooldown and quiet-hours/mute suppression are orthogonal: a
 *    transition still updates state (and starts the cooldown) even when
 *    the caller decides not to actually show the OS notification (muted or
 *    inside quiet hours) — otherwise every condition that changed overnight
 *    would all notify at once the moment quiet hours end.
 */

import type { FavoriteServer, GameServer } from './server-browser'

export type RuleType = 'player-threshold' | 'empty-to-active' | 'map-match'
export type RuleScope = 'global' | 'server'

export interface NotificationRule {
  id: string
  enabled: boolean
  scope: RuleScope
  /** Required when scope === 'server'; ignored (should be null) for 'global'. */
  target: FavoriteServer | null
  type: RuleType
  /** Required for 'player-threshold'. */
  threshold: number | null
  /** Required for 'map-match' — lowercase map names. */
  maps: string[]
}

export interface QuietHours {
  enabled: boolean
  /** 24h local time, "HH:MM". */
  from: string
  to: string
}

export interface NotificationSettings {
  enabled: boolean
  introSeen: boolean
  muted: boolean
  pollIntervalMinutes: number
  cooldownMinutes: number
  quietHours: QuietHours
}

export interface PerServerState {
  /** Last evaluated boolean per rule id, for transition detection. */
  conditions: Record<string, boolean>
  cooldownUntil: number
}

export interface FireDecision {
  address: FavoriteServer
  rule: NotificationRule
  title: string
  body: string
}

export function addressKey(a: FavoriteServer): string {
  return `${a.ip}:${a.port}`
}

export const DEFAULT_POLL_INTERVAL_MINUTES = 3
export const MIN_POLL_INTERVAL_MINUTES = 1
export const MAX_POLL_INTERVAL_MINUTES = 30
export const DEFAULT_COOLDOWN_MINUTES = 10

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  introSeen: false,
  muted: false,
  pollIntervalMinutes: DEFAULT_POLL_INTERVAL_MINUTES,
  cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
  quietHours: { enabled: false, from: '22:00', to: '08:00' }
}

export function clampPollInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_POLL_INTERVAL_MINUTES
  return Math.min(MAX_POLL_INTERVAL_MINUTES, Math.max(MIN_POLL_INTERVAL_MINUTES, Math.round(minutes)))
}

/** `from === to` is treated as "quiet all day" rather than "quiet zero minutes" — a degenerate but harmless input. */
export function isQuietHours(quietHours: QuietHours, now: Date): boolean {
  if (!quietHours.enabled) return false
  const from = toMinutes(quietHours.from)
  const to = toMinutes(quietHours.to)
  if (from === null || to === null) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  if (from === to) return true
  if (from < to) return cur >= from && cur < to
  return cur >= from || cur < to // wraps past midnight
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

export function ruleAppliesTo(rule: NotificationRule, address: FavoriteServer): boolean {
  if (!rule.enabled) return false
  if (rule.scope === 'global') return true
  return rule.target !== null && addressKey(rule.target) === addressKey(address)
}

/** An unreachable server (ping === null) never satisfies any condition — nothing to threshold/match against. */
function ruleCondition(rule: NotificationRule, server: GameServer): boolean {
  if (server.ping === null) return false
  switch (rule.type) {
    case 'player-threshold':
      return rule.threshold !== null && server.players >= rule.threshold
    case 'empty-to-active':
      return server.players > 0
    case 'map-match':
      return rule.maps.some((m) => m.toLowerCase() === server.map.toLowerCase())
  }
}

function describeRule(
  rule: NotificationRule,
  server: GameServer,
  address: FavoriteServer
): { title: string; body: string } {
  const label = server.name || addressKey(address)
  switch (rule.type) {
    case 'player-threshold':
      return { title: label, body: `${server.players} players online (threshold ${rule.threshold})` }
    case 'empty-to-active':
      return { title: label, body: `Active again — ${server.players} player${server.players === 1 ? '' : 's'} on ${server.map || 'unknown map'}` }
    case 'map-match':
      return { title: label, body: `Now playing ${server.map}` }
  }
}

/**
 * Evaluates every rule applicable to `address` against this tick's `server`
 * reading, returning the next per-server state to persist and, at most, one
 * notification to fire. Rule order determines which one wins when several
 * transition on the same tick (first applicable rule, in array order).
 */
export function evaluateServer(
  address: FavoriteServer,
  server: GameServer,
  rules: NotificationRule[],
  prevState: PerServerState | undefined,
  now: number,
  cooldownMs: number
): { nextState: PerServerState; fire: FireDecision | null } {
  const prevConditions = prevState?.conditions ?? {}
  const nextConditions: Record<string, boolean> = {}
  let cooldownUntil = prevState?.cooldownUntil ?? 0
  let fire: FireDecision | null = null

  for (const rule of rules) {
    if (!ruleAppliesTo(rule, address)) continue
    const condition = ruleCondition(rule, server)
    nextConditions[rule.id] = condition

    const wasTrue = prevConditions[rule.id] ?? false
    const transitioned = condition && !wasTrue
    if (transitioned && !fire && now >= cooldownUntil) {
      fire = { address, rule, ...describeRule(rule, server, address) }
      cooldownUntil = now + cooldownMs // consumed immediately — suppresses any other rule this same tick too
    }
  }

  return { nextState: { conditions: nextConditions, cooldownUntil }, fire }
}
