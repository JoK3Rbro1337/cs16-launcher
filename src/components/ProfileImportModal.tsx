import { useEffect, useState } from 'react'
import type { ImportMode, ProfileSummary } from '../lib/profile'
import { useT } from '../lib/i18n'

export default function ProfileImportModal({
  summary,
  onConfirm,
  onCancel
}: {
  summary: ProfileSummary
  onConfirm: (mode: ImportMode) => void
  onCancel: () => void
}): React.JSX.Element {
  const t = useT()
  const [mode, setMode] = useState<ImportMode>('merge')

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{t.profileImportModal.title}</h2>
        <p className="modal-message">
          {t.profileImportModal.summary({
            exportedAt: new Date(summary.exportedAt).toLocaleString(),
            favorites: t.profileImportModal.favorites(summary.favorites),
            subscriptions: t.profileImportModal.subscriptions(summary.subscriptions),
            knownServers: t.profileImportModal.knownServers(summary.knownServers),
            knownPlayers: t.profileImportModal.knownPlayers(summary.knownPlayers),
            notificationRules: t.profileImportModal.notificationRules(summary.notificationRules),
            hasLocalConfigVariant: summary.hasLocalConfigVariant
          })}
        </p>

        <div className="profile-import-modes">
          <label className="profile-import-mode">
            <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            <span>
              <strong>{t.profileImportModal.mergeLabel}</strong> {t.profileImportModal.mergeDesc}
            </span>
          </label>
          <label className="profile-import-mode">
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>
              <strong>{t.profileImportModal.replaceLabel}</strong> {t.profileImportModal.replaceDesc}
            </span>
          </label>
        </div>

        <div className="modal-actions">
          <button className="cp-btn-secondary" onClick={onCancel}>
            {t.profileImportModal.cancel}
          </button>
          <button className="cp-btn-primary" onClick={() => onConfirm(mode)}>
            {t.profileImportModal.import}
          </button>
        </div>
      </div>
    </div>
  )
}
