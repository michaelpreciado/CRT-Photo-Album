export default function UploadCard({ album, dim }) {
  const { loading, progress, notice, dismiss, upload } = album
  const busy = !!progress || loading
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className={`ui-card-wrap${dim ? ' dim' : ''}`}>
      <div className="card glass">
        <div className="badge">PRECIADO TECH // v1.2</div>
        <h1 className="title">CRT Album</h1>
        <p className="desc">
          Upload your photos and view them on a retro CRT. Click the folder to browse, click a photo to zoom in,
          then save it with the CRT effect baked in. Arrow keys work too.
        </p>
        <label className={`upload-btn${busy ? ' busy' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>
            {progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : loading ? 'Loading album' : 'Upload Images'}
          </span>
          <input
            className="hidden-input"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
            aria-label="Upload images"
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files)
              e.target.value = ''
            }}
          />
          {progress && <i className="upload-progress" style={{ width: `${pct}%` }} />}
        </label>
        <p className="drop-hint">or drop images anywhere - JPG, PNG, GIF, WebP, AVIF up to 10 MB</p>
        {notice && (
          <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span>{notice.text}</span>
            <button className="notice-x" onClick={dismiss} aria-label="Dismiss message">
              x
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
