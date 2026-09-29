import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

const COPY = {
  nowebgl: {
    title: '3D view unavailable',
    body: 'Your browser or device could not start WebGL, which the CRT room needs. Your album still works - browse it below.',
  },
  error: {
    title: 'The CRT lost its signal',
    body: 'Something went wrong while drawing the 3D room. Your photos are safe - browse them below or try again.',
  },
}

/**
 * Accessible 2D album shown when WebGL is missing or the scene crashes.
 * Lazy-loaded thumbnails + a keyboard-friendly lightbox.
 */
export default function Fallback({ reason = 'nowebgl', onRetry }) {
  const images = useAppStore((s) => s.images)
  const [open, setOpen] = useState(-1)
  const copy = COPY[reason] ?? COPY.error

  useEffect(() => {
    if (open < 0) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(-1)
      else if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % images.length)
      else if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, images.length])

  return (
    <div className="fallback" role="region" aria-label="Photo album">
      <div className="fallback-head glass">
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        {onRetry && (
          <button className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>

      {images.length === 0 ? (
        <p className="fallback-empty">No photos yet - use Upload Images to add some.</p>
      ) : (
        <ul className="fallback-grid">
          {images.map((url, i) => (
            <li key={url}>
              <button className="fallback-thumb" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${images.length}`}>
                <img src={url} alt={`Photo ${i + 1}`} loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open >= 0 && images[open] && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Photo ${open + 1} of ${images.length}`} onClick={() => setOpen(-1)}>
          <img src={images[open]} alt={`Photo ${open + 1}`} />
          <button className="btn lightbox-close" onClick={() => setOpen(-1)} autoFocus>
            Close
          </button>
        </div>
      )}
    </div>
  )
}
