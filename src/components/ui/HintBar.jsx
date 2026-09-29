import { useAppStore } from '../../store/useAppStore'

const touch = () => window.matchMedia?.('(pointer: coarse)').matches

const HINTS = {
  desktop: ['Click the folder to open My Pictures', 'Tap the folder to open My Pictures', 'Enter to open'],
  gallery: ['Click a photo to zoom', 'Tap a photo - swipe for more pages', 'Arrows to move - Enter to open - Esc to close'],
  photo: ['Scroll to zoom - drag to pan - click to go back', 'Pinch to zoom - swipe to browse', 'Arrows browse - +/- zoom - Esc back'],
}

/** Contextual controls hint, plus a screen-reader live announcement. */
export default function HintBar() {
  const viewMode = useAppStore((s) => s.viewMode)
  const booted = useAppStore((s) => s.booted)
  const selected = useAppStore((s) => s.selectedImage)
  const images = useAppStore((s) => s.images)
  const [mouse, tch, kbd] = HINTS[viewMode]
  const text = touch() ? tch : mouse
  const idx = selected ? images.indexOf(selected) + 1 : 0
  const announce =
    viewMode === 'photo'
      ? `Photo ${idx} of ${images.length} open`
      : viewMode === 'gallery'
        ? `My Pictures open, ${images.length} photos`
        : 'Desktop'

  return (
    <>
      <div className={`hint glass${booted ? ' show' : ''}`} aria-hidden="true">
        <span>{text}</span>
        <span className="hint-kbd">{kbd}</span>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {booted ? announce : ''}
      </div>
    </>
  )
}
