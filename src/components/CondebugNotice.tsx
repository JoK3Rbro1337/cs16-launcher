import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import type { LaunchOptionsCheck } from '../../electron/modules/steam-launch-options'
import { CONDEBUG_NOTICE_DISMISSED_KEY, loadJSON, saveJSON } from '../lib/storage'

const RECHECK_INTERVAL_MS = 30_000
const CONDEBUG_RE = /(^|\s)-condebug(\s|$)/i

/**
 * One-time, dismissible: nudges the player to add `-condebug` to their CS
 * 1.6 Steam Launch Options. Unlike LaunchOptionsNotice's autoexec.cfg flag,
 * this one is a hard requirement for session-watcher.ts (M12a) — without it
 * the engine never writes qconsole.log, so there's nothing to tail. Worded
 * accordingly, but dismissing it just means the quick-connect card falls
 * back to launcher-only history (see Home.tsx) rather than the feature
 * appearing broken.
 *
 * Re-checks periodically rather than once on mount (live-use finding): Steam
 * doesn't necessarily flush localconfig.vdf to disk the instant Launch
 * Options are edited, so a check performed right after editing them can read
 * a stale on-disk copy and show this notice even though the option is
 * already set live. Polling lets it self-correct once Steam catches up,
 * without the player having to dismiss it or restart the launcher.
 */
export default function CondebugNotice({ className }: { className?: string }): React.JSX.Element | null {
  const [check, setCheck] = useState<LaunchOptionsCheck | null>(null)
  const [dismissed, setDismissed] = useState(() => loadJSON(CONDEBUG_NOTICE_DISMISSED_KEY, false))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function refresh(): void {
      window.launcher
        .checkLaunchOptions()
        .then(setCheck)
        .catch(() => setCheck(null))
    }
    refresh()
    const interval = setInterval(refresh, RECHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  if (dismissed || !check || !check.checked || check.hasCondebug) return null

  const trimmed = check.currentOptions.trim()
  // Defensive: never show a duplicated flag even if hasCondebug and this raw-string
  // check somehow disagree (e.g. a stale read resolved between the two).
  const recommended = trimmed ? (CONDEBUG_RE.test(trimmed) ? trimmed : `${trimmed} -condebug`) : '-condebug'

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
