import { useEffect, useState } from 'react'
import type { ImportMode, ProfileSummary } from '../lib/profile'

export default function ProfileImportModal({
  summary,
  onConfirm,
  onCancel
}: {
  summary: ProfileSummary
  onConfirm: (mode: ImportMode) => void
  onCancel: () => void
}): React.JSX.Element {
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
        <h2 className="modal-title">Import Profile</h2>
        <p className="modal-message">
          Exported {new Date(summary.exportedAt).toLocaleString()} — {summary.favorites} favorite
          {summary.favorites === 1 ? '' : 's'}, {summary.subscriptions} server source
          {summary.subscriptions === 1 ? '' : 's'}, {summary.knownServers} known server
          {summary.knownServers === 1 ? '' : 's'}, {summary.knownPlayers} known player
          {summary.knownPlayers === 1 ? '' : 's'}, {summary.notificationRules} notification rule
          {summary.notificationRules === 1 ? '' : 's'}
          {summary.hasLocalConfigVariant ? ', and a My Config snapshot' : ''}.
        </p>

        <div className="profile-import-modes">
          <label className="profile-import-mode">
            <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            <span>
              <strong>Merge</strong> — add what's new, never overwrite anything you already have.
            </span>
          </label>
          <label className="profile-import-mode">
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>
              <strong>Replace</strong> — the imported profile overwrites your current data entirely.
            </span>
          </label>
        </div>

        <div className="modal-actions">
          <button className="cp-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="cp-btn-primary" onClick={() => onConfirm(mode)}>
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
