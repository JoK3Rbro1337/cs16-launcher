import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { NotificationRule, RuleType } from '../../electron/modules/notification-poller'
import type { FavoriteServer } from '../../electron/modules/server-browser'
import { useT, type Messages } from '../lib/i18n'

function typeLabels(t: Messages): Record<RuleType, string> {
  return {
    'player-threshold': t.notificationRules.typePlayerThreshold,
    'empty-to-active': t.notificationRules.typeEmptyToActive,
    'map-match': t.notificationRules.typeMapMatch
  }
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

function ruleSummary(t: Messages, rule: NotificationRule): string {
  switch (rule.type) {
    case 'player-threshold':
      return t.notificationRules.summaryThreshold(rule.threshold ?? '?')
    case 'empty-to-active':
      return t.notificationRules.summaryEmptyToActive
    case 'map-match':
      return rule.maps.length > 0
        ? t.notificationRules.summaryMapMatch(rule.maps.join(', '))
        : t.notificationRules.summaryMapMatchUnset
  }
}

function ruleTarget(t: Messages, rule: NotificationRule): string {
  return rule.scope === 'global'
    ? t.notificationRules.targetAll
    : rule.target
      ? `${rule.target.ip}:${rule.target.port}`
      : t.notificationRules.targetUnknown
}

export default function NotificationRules({
  rules,
  onChange
}: {
  rules: NotificationRule[]
  onChange: (rules: NotificationRule[]) => void
}): React.JSX.Element {
  const t = useT()
  const TYPE_LABELS = typeLabels(t)
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
        setError(t.notificationRules.errorAddress)
        return
      }
    }
    if (type === 'map-match' && mapsInput.trim().length === 0) {
      setError(t.notificationRules.errorMaps)
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
        <p className="muted">{t.notificationRules.empty}</p>
      ) : (
        <ul className="notification-rules-list">
          {rules.map((rule) => (
            <li key={rule.id} className="notification-rules-item">
              <div>
                <p className="settings-row-label">{ruleSummary(t, rule)}</p>
                <p className="settings-row-desc">
                  {TYPE_LABELS[rule.type]} · {ruleTarget(t, rule)}
                </p>
              </div>
              <div className="notification-rules-item-actions">
                <button
                  className={`toggle-switch${rule.enabled ? ' on' : ''}`}
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={t.notificationRules.enableRuleAriaLabel(ruleSummary(t, rule))}
                  onClick={() => handleToggle(rule.id)}
                >
                  <span className="toggle-switch-thumb" />
                </button>
                <button
                  className="cp-btn-secondary notification-rules-remove"
                  onClick={() => handleRemove(rule.id)}
                  title={t.notificationRules.removeRule}
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
            <option value="global">{t.notificationRules.scopeAll}</option>
            <option value="server">{t.notificationRules.scopeServer}</option>
          </select>
          {scope === 'server' && (
            <input
              type="text"
              className="cp-input"
              placeholder={t.notificationRules.addressPlaceholder}
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
            />
          )}
          <select className="cp-input" value={type} onChange={(e) => setType(e.target.value as RuleType)}>
            <option value="player-threshold">{t.notificationRules.typePlayerThreshold}</option>
            <option value="empty-to-active">{t.notificationRules.summaryEmptyToActive}</option>
            <option value="map-match">{t.notificationRules.typeMapMatch}</option>
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
              placeholder={t.notificationRules.mapsPlaceholder}
              value={mapsInput}
              onChange={(e) => setMapsInput(e.target.value)}
            />
          )}
          <button className="cp-btn-secondary" onClick={handleAdd}>
            {t.notificationRules.addRule}
          </button>
          {error && <span className="cp-inline-error">{error}</span>}
        </div>
      </div>
    </div>
  )
}
