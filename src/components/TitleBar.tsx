import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'

export default function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.launcher.isWindowMaximized().then(setMaximized)
    return window.launcher.onWindowMaximizedChange(setMaximized)
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag" onDoubleClick={() => window.launcher.toggleMaximizeWindow()}>
        <span className="titlebar-brand">1.6X</span>
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={() => window.launcher.minimizeWindow()}
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          className="titlebar-btn"
          onClick={() => window.launcher.toggleMaximizeWindow()}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={() => window.launcher.closeWindow()}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
