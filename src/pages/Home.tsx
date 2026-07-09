import { useEffect, useState } from 'react'
import type { SteamDetectResult } from '../../electron/modules/steam-detect'

export default function Home(): React.JSX.Element {
  const [detection, setDetection] = useState<SteamDetectResult | 'loading' | 'error'>('loading')

  useEffect(() => {
    window.launcher
      .detectSteam()
      .then(setDetection)
      .catch(() => setDetection('error'))
  }, [])

  return (
    <section className="page">
      <h1>Play</h1>

      {detection === 'loading' && <p className="muted">Detecting Steam…</p>}
      {detection === 'error' && <p className="muted">Steam detection failed.</p>}
      {detection !== 'loading' && detection !== 'error' && (
        <dl className="detect-result">
          <dt>Steam path</dt>
          <dd>{detection.steamPath ?? 'not found'}</dd>
          <dt>Game path</dt>
          <dd>{detection.gamePath ?? 'not found'}</dd>
          <dt>Installed</dt>
          <dd>{detection.installed ? 'yes' : 'no'}</dd>
        </dl>
      )}

      <button className="primary" disabled>
        Play (M2)
      </button>
    </section>
  )
}
