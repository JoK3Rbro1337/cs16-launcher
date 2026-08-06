import { useEffect, useState } from 'react'
import { DESKTOP_INTEGRATION_NOTICE_DISMISSED_KEY, loadJSON, saveJSON } from '../lib/storage'
import { useToast } from '../lib/toast'
import { useT } from '../lib/i18n'

/**
 * One-time, dismissible: offers to register a `.desktop` entry for this
 * AppImage (see electron/modules/linux-desktop-integration.ts). Only
 * eligible on a real Linux AppImage run — never shown in dev or on other
 * platforms. Fixes notification click-to-focus on Wayland (no installed
 * entry means no app_id for the compositor to grant xdg-activation
 * against) and gives the launcher a real name/icon in the taskbar, which
 * it otherwise doesn't have either. Never installs without this explicit
 * click — see Settings' "Desktop integration" row for the same action,
 * available any time even after dismissing this banner.
 */
export default function DesktopIntegrationNotice({ className }: { className?: string }): React.JSX.Element | null {
  const t = useT()
  const { pushToast } = useToast()
  const [status, setStatus] = useState<{ eligible: boolean; installed: boolean } | null>(null)
  const [dismissed, setDismissed] = useState(() => loadJSON(DESKTOP_INTEGRATION_NOTICE_DISMISSED_KEY, false))
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    window.launcher
      .getDesktopIntegrationStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  function handleDismiss(): void {
    setDismissed(true)
    saveJSON(DESKTOP_INTEGRATION_NOTICE_DISMISSED_KEY, true)
  }

  async function handleInstall(): Promise<void> {
    setInstalling(true)
    try {
      await window.launcher.installDesktopIntegration()
      pushToast(t.settings.addedToMenuToast, 'ok')
      handleDismiss()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
    }
  }

  if (dismissed || !status || !status.eligible || status.installed) return null

  return (
    <div className={`launch-options-notice${className ? ` ${className}` : ''}`}>
      <p className="launch-options-notice-text">{t.notices.desktopIntegrationText}</p>
      <div className="launch-options-notice-row">
        <button className="cp-btn-primary" onClick={handleInstall} disabled={installing}>
          {installing ? t.notices.desktopIntegrationAdding : t.notices.desktopIntegrationAdd}
        </button>
        <button className="launch-options-notice-dismiss" onClick={handleDismiss} aria-label={t.notices.dismiss}>
          ×
        </button>
      </div>
    </div>
  )
}
