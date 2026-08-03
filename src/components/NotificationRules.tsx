import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { NotificationRule, RuleType } from '../../electron/modules/notification-poller'
import type { FavoriteServer } from '../../electron/modules/server-browser'

const TYPE_LABELS: Record<RuleType, string> = {
  'player-threshold': 'Player count threshold',
  'empty-to-active': 'Empty → active',
  'map-match': 'Map appears'
}

/** Parses "ip:port", same convention as Servers.tsx's own address input. */
function parseAddress(value: string): FavoriteServer | null {
  const idx = value.lastIndexOf(':')
  if (idx === -1) return null
  const ip = value.slice(0, idx).trim()
  const port = Number(value.slice(idx + 1).trim())
  if (!ip || !Number.isInteger(port) || port <= 0 || port > 65535) return null
  return { ip, port }
}

function ruleSummary(rule: NotificationRule): string {
  switch (rule.type) {
    case 'player-threshold':
      return `${rule.threshold ?? '?'}+ players`
    case 'empty-to-active':
      return 'Goes from empty to active'
    case 'map-match':
      return rule.maps.length > 0 ? `Map is ${rule.maps.join(', ')}` : 'Map is (none set)'
  }
}

function ruleTarget(rule: NotificationRule): string {
  return rule.scope === 'global' ? 'All watched servers' : rule.target ? `${rule.target.ip}:${rule.target.port}` : 'Unknown server'
}

export default function NotificationRules({
  rules,
  onChange
}: {
  rules: NotificationRule[]
  onChange: (rules: NotificationRule[]) => void
}): React.JSX.Element {
  const [scope, setScope] = useState<'global' | 'server'>('global')
  const [addressInput, setAddressInput] = useState('')
  const [type, setType] = useState<RuleType>('player-threshold')
  const [threshold, setThreshold] = useState(10)
  const [mapsInput, setMapsInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleAdd(): void {
    let target: FavoriteServer | null = null
    if (scope === 'server') {
      target = parseAddress(addressInput)
      if (!target) {
        setError('Enter the server address as ip:port')
        return
      }
    }
    if (type === 'map-match' && mapsInput.trim().length === 0) {
      setError('Enter at least one map name')
      return
    }

    const rule: NotificationRule = {
      id: crypto.randomUUID(),
      enabled: true,
      scope,
      target,
      type,
      threshold: type === 'player-threshold' ? Math.max(1, Math.round(threshold)) : null,
      maps:
        type === 'map-match'
          ? mapsInput
              .split(',')
              .map((m) => m.trim().toLowerCase())
              .filter((m) => m.length > 0)
          : []
    }
    onChange([...rules, rule])
    setAddressInput('')
    setMapsInput('')
    setError(null)
  }

  function handleRemove(id: string): void {
    onChange(rules.filter((r) => r.id !== id))
  }

  function handleToggle(id: string): void {
    onChange(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  return (
    <div className="notification-rules">
      {rules.length === 0 ? (
        <p className="muted">No rules yet — add one below.</p>
      ) : (
        <ul className="notification-rules-list">
          {rules.map((rule) => (
            <li key={rule.id} className="notification-rules-item">
              <div>
                <p className="settings-row-label">{ruleSummary(rule)}</p>
                <p className="settings-row-desc">
                  {TYPE_LABELS[rule.type]} · {ruleTarget(rule)}
                </p>
              </div>
              <div className="notification-rules-item-actions">
                <button
                  className={`toggle-switch${rule.enabled ? ' on' : ''}`}
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={`Enable rule: ${ruleSummary(rule)}`}
                  onClick={() => handleToggle(rule.id)}
                >
                  <span className="toggle-switch-thumb" />
                </button>
                <button
                  className="cp-btn-secondary notification-rules-remove"
                  onClick={() => handleRemove(rule.id)}
                  title="Remove rule"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="notification-rule-form">
        <div className="notification-rule-form-row">
          <select className="cp-input" value={scope} onChange={(e) => setScope(e.target.value as 'global' | 'server')}>
            <option value="global">All watched servers</option>
            <option value="server">Specific server…</option>
          </select>
          {scope === 'server' && (
            <input
              type="text"
              className="cp-input"
              placeholder="ip:port"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
            />
          )}
          <select className="cp-input" value={type} onChange={(e) => setType(e.target.value as RuleType)}>
            <option value="player-threshold">Player count threshold</option>
            <option value="empty-to-active">Goes from empty to active</option>
            <option value="map-match">Map appears</option>
          </select>
        </div>
        <div className="notification-rule-form-row">
          {type === 'player-threshold' && (
            <input
              type="number"
              min={1}
              className="cp-input settings-number-input"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          )}
          {type === 'map-match' && (
            <input
              type="text"
              className="cp-input notification-rule-maps-input"
              placeholder="de_dust2, de_inferno"
              value={mapsInput}
              onChange={(e) => setMapsInput(e.target.value)}
            />
          )}
          <button className="cp-btn-secondary" onClick={handleAdd}>
            Add rule
          </button>
          {error && <span className="cp-inline-error">{error}</span>}
        </div>
      </div>
    </div>
  )
}
