import { useEffect } from 'react'
import type { ConfigScanResult, ScanFinding } from '../../electron/modules/config-scanner'
import { findingMessage, severityLabel } from '../lib/configScanner'
import { useT } from '../lib/i18n'

const SEVERITY_ORDER: Record<ScanFinding['severity'], number> = { critical: 0, warning: 1, info: 2 }

function groupByFile(findings: ScanFinding[]): [string, ScanFinding[]][] {
  const groups = new Map<string, ScanFinding[]>()
  for (const f of findings) {
    const list = groups.get(f.file) ?? []
    list.push(f)
    groups.set(f.file, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line)
  }
  return [...groups.entries()]
}

/**
 * Two roles in one component: a plain findings viewer (no `gate`), and the
 * pre-install blocking dialog (`gate` set) — same layout, since "exactly
 * what was found" (file, line, offending text) is the same content either
 * way; only the intro copy and action row differ.
 */
export default function ConfigScanModal({
  title,
  result,
  onClose,
  gate
}: {
  title: string
  result: ConfigScanResult
  onClose: () => void
  gate?: { onInstallAnyway: () => void; busy?: boolean }
}): React.JSX.Element {
  const t = useT()

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups = groupByFile(result.findings)

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{gate ? t.configScanner.gateTitle : title}</h2>

        {gate && (
          <p className="modal-message">
            {t.configScanner.gateIntro(result.counts.critical)}
            {result.counts.warning > 0 && ` ${t.configScanner.gateWarningNote(result.counts.warning)}`}
          </p>
        )}

        {result.findings.length === 0 ? (
          <p className="modal-message">{t.configScanner.noFindings}</p>
        ) : (
          <div className="scan-findings-list">
            {groups.map(([file, findings]) => (
              <div key={file} className="scan-findings-file">
                <p className="scan-findings-file-path">
                  {t.configScanner.fileLabel}: <span className="mono">{file}</span>
                </p>
                {findings.map((f, i) => (
                  <div key={i} className={`scan-finding-row scan-finding-${f.severity}`}>
                    <span className={`scan-finding-severity scan-finding-severity-${f.severity}`}>
                      {severityLabel(t, f.severity)}
                    </span>
                    <div className="scan-finding-body">
                      <p className="scan-finding-message">
                        {t.configScanner.lineLabel} {f.line} — {findingMessage(t, f.rule, f.detail)}
                      </p>
                      <p className="scan-finding-text mono">{f.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          {gate ? (
            <>
              <button className="cp-btn-secondary" onClick={onClose}>
                {t.common.cancel}
              </button>
              <button className="cp-btn-danger" disabled={gate.busy} onClick={gate.onInstallAnyway}>
                {t.configScanner.installAnyway}
              </button>
            </>
          ) : (
            <button className="cp-btn-secondary" onClick={onClose}>
              {t.common.close}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
