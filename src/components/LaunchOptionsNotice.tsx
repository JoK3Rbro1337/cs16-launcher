import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import type { LaunchOptionsCheck } from '../../electron/modules/steam-launch-options'
import { LAUNCH_OPTIONS_NOTICE_DISMISSED_KEY, loadJSON, saveJSON } from '../lib/storage'
import { useT } from '../lib/i18n'

/**
 * One-time, dismissible: nudges the player to add `+exec autoexec.cfg` to
 * their CS 1.6 Steam Launch Options. Config variants now also exec via
 * userconfig.cfg (zero setup on most builds — see content-sync.ts), so this
 * is redundancy/reliability, not a hard requirement — worded accordingly.
 */
export default function LaunchOptionsNotice({ className }: { className?: string }): React.JSX.Element | null {
  const t = useT()
  const [check, setCheck] = useState<LaunchOptionsCheck | null>(null)
  const [dismissed, setDismissed] = useState(() => loadJSON(LAUNCH_OPTIONS_NOTICE_DISMISSED_KEY, false))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.launcher
      .checkLaunchOptions()
      .then(setCheck)
      .catch(() => setCheck(null))
  }, [])

  if (dismissed || !check || !check.checked || check.hasExecAutoexec) return null

  const recommended = check.currentOptions.trim()
    ? `${check.currentOptions.trim()} +exec autoexec.cfg`
    : '+exec autoexec.cfg'

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
    saveJSON(LAUNCH_OPTIONS_NOTICE_DISMISSED_KEY, true)
  }

  return (
    <div className={`launch-options-notice${className ? ` ${className}` : ''}`}>
      <p className="launch-options-notice-text">
        {t.notices.launchOptionsTextBefore} <code>{t.notices.launchOptionsCode}</code> {t.notices.launchOptionsTextAfter}
      </p>
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
