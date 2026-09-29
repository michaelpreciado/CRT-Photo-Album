import { useAppStore } from '../../store/useAppStore'

/** DOM controls for the open photo: back, browse, zoom, and export. */
export default function PhotoBar({ saving, onSave }) {
  const closePhoto = useAppStore((s) => s.closePhoto)
  const stepPhoto = useAppStore((s) => s.stepPhoto)
  const zoomPhoto = useAppStore((s) => s.zoomPhoto)
  const resetPhotoView = useAppStore((s) => s.resetPhotoView)
  const many = useAppStore((s) => s.images.length > 1)

  return (
    <div className="savebar glass" role="toolbar" aria-label="Photo controls">
      <button className="btn" onClick={closePhoto}>
        Back
      </button>
      {many && (
        <div className="btn-group">
          <button className="btn icon" onClick={() => stepPhoto(-1)} aria-label="Previous photo">
            &lsaquo;
          </button>
          <button className="btn icon" onClick={() => stepPhoto(1)} aria-label="Next photo">
            &rsaquo;
          </button>
        </div>
      )}
      <div className="btn-group">
        <button className="btn icon" onClick={() => zoomPhoto(1 / 1.4)} aria-label="Zoom out">
          &minus;
        </button>
        <button className="btn icon" onClick={resetPhotoView} aria-label="Reset zoom">
          1:1
        </button>
        <button className="btn icon" onClick={() => zoomPhoto(1.4)} aria-label="Zoom in">
          +
        </button>
      </div>
      <button className="btn primary" onClick={onSave} disabled={saving}>
        {saving ? (
          'Saving...'
        ) : (
          <>
            <span className="long">Save with CRT effect</span>
            <span className="short">Save PNG</span>
          </>
        )}
      </button>
    </div>
  )
}
