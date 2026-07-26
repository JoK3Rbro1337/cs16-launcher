import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import type { LaunchOptionsCheck } from '../../electron/modules/steam-launch-options'
import { CONDEBUG_NOTICE_DISMISSED_KEY, loadJSON, saveJSON } from '../lib/storage'

/**
 * One-time, dismissible: nudges the player to add `-condebug` to their CS
 * 1.6 Steam Launch Options. Unlike LaunchOptionsNotice's autoexec.cfg flag,
 * this one is a hard requirement for session-watcher.ts (M12a) — without it
 * the engine never writes qconsole.log, so there's nothing to tail. Worded
 * accordingly, but dismissing it just means the quick-connect card falls
 * back to launcher-only history (see Home.tsx) rather than the feature
 * appearing broken.
 */
export default function CondebugNotice({ className }: { className?: string }): React.JSX.Element | null {
  const [check, setCheck] = useState<LaunchOptionsCheck | null>(null)
  const [dismissed, setDismissed] = useState(() => loadJSON(CONDEBUG_NOTICE_DISMISSED_KEY, false))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.launcher
      .checkLaunchOptions()
      .then(setCheck)
      .catch(() => setCheck(null))
  }, [])

  if (dismissed || !check || !check.checked || check.hasCondebug) return null

  const recommended = check.currentOptions.trim() ? `${check.currentOptions.trim()} -condebug` : '-condebug'

  function handleCopy(): void {
    navigator.clipboard
      .writeText(recommended)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  function handleDismiss(): void {
    setDismissed(true)
    saveJSON(CONDEBUG_NOTICE_DISMISSED_KEY, true)
  }

  return (
    <div className={`launch-options-notice${className ? ` ${className}` : ''}`}>
      <p className="launch-options-notice-text">
        Add <code>-condebug</code> to CS 1.6's Steam Launch Options (right-click in your Steam library →
        Properties → General) so the quick-connect card can track servers you join in-game, not just through
        this launcher — without it, only launcher-initiated connects are tracked.
      </p>
      <div className="launch-options-notice-row">
        <code className="launch-options-notice-value">{recommended}</code>
        <button className="cp-btn-secondary" onClick={handleCopy}>
          <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="launch-options-notice-dismiss" onClick={handleDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  )
}
