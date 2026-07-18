import { useEffect, useState } from 'react'
import { loadMapThumbnail, paletteFor } from '../lib/mapThumbnails'

interface MapThumbProps {
  map: string
  className?: string
}

/** Fills its parent — size and aspect ratio are the caller's responsibility. */
export default function MapThumb({ map, className }: MapThumbProps): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    loadMapThumbnail(map).then((result) => {
      if (!cancelled) setSrc(result)
    })
    return () => {
      cancelled = true
    }
  }, [map])

  if (src) {
    return <img className={`map-thumb-img${className ? ` ${className}` : ''}`} src={src} alt={map} draggable={false} />
  }

  return (
    <div className={`map-thumb-fallback ${paletteFor(map || '?')}${className ? ` ${className}` : ''}`}>
      <span>{map || '—'}</span>
    </div>
  )
}
