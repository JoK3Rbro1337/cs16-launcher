import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import type { LaunchOptionsCheck } from '../../electron/modules/steam-launch-options'
import { CROSSHAIR_WINDOWED_NOTICE_DISMISSED_KEY, loadJSON, saveJSON } from '../lib/storage'
import { useT } from '../lib/i18n'

const RECHECK_INTERVAL_MS = 30_000
const WINDOWED_RE = /(^|\s)-window(ed)?(\s|$)/i
const NOBORDER_RE = /(^|\s)-noborder(\s|$)/i

/**
 * Same dismissible/re-checking pattern as CondebugNotice — only shown while
 * the crosshair overlay is enabled (crosshair-overlay.ts is a separate,
 * real window; it only reliably composites above a windowed/borderless
 * game, not exclusive fullscreen — see that module's Wayland/X11 notes).
 * Recommendation only, never written: steam-launch-options.ts stays
 * read-only by design (see its module doc).
 */
export default function CrosshairWindowedNotice({ className }: { className?: string }): React.JSX.Element | null {
  const t = useT()
  const [check, setCheck] = useState<LaunchOptionsCheck | null>(null)
  const [dismissed, setDismissed] = useState(() => loadJSON(CROSSHAIR_WINDOWED_NOTICE_DISMISSED_KEY, false))
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

  if (dismissed || !check || !check.checked || (check.hasWindowed && check.hasNoBorder)) return null

  const trimmed = check.currentOptions.trim()
  const parts = trimmed ? [trimmed] : []
  if (!WINDOWED_RE.test(trimmed)) parts.push('-windowed')
  if (!NOBORDER_RE.test(trimmed)) parts.push('-noborder')
  const recommended = parts.join(' ')

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
    saveJSON(CROSSHAIR_WINDOWED_NOTICE_DISMISSED_KEY, true)
  }

  return (
    <div className={`launch-options-notice${className ? ` ${className}` : ''}`}>
      <p className="launch-options-notice-text">{t.notices.crosshairWindowedText}</p>
      <div className="launch-options-notice-row">
        <code className="launch-options-notice-value">{recommended}</code>
        <button className="cp-btn-secondary" onClick={handleCopy}>
          <Copy size={12} /> {copied ? t.notices.copied : t.notices.copy}
        </button>
        <button className="launch-options-notice-dismiss" onClick={handleDismiss} aria-label={t.notices.dismiss}>
          ×
        </button>
      </div>
    </div>
  )
}
