import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import Boot from './components/Boot'
import ErrorBoundary from './components/ErrorBoundary'
import Fallback from './components/Fallback'
import UploadCard from './components/ui/UploadCard'
import PhotoBar from './components/ui/PhotoBar'
import HintBar from './components/ui/HintBar'
import SoundToggle from './components/ui/SoundToggle'
import { useAppStore } from './store/useAppStore'
import { useAlbum } from './hooks/useAlbum'
import { hasWebGL } from './utils/webgl'

// The whole 3D stack (three, R3F, drei, troika) lives behind this import so
// the boot screen and UI paint from a tiny entry chunk.
const SceneCanvas = lazy(() => import('./components/SceneCanvas'))

function ContextLostBanner() {
  const lost = useAppStore((s) => s.contextLost)
  if (!lost) return null
  return (
    <div className="toast glass" role="alert">
      Graphics context lost - restoring the CRT...
    </div>
  )
}

export default function App() {
  const [webgl] = useState(hasWebGL)
  const album = useAlbum()
  const [dragging, setDragging] = useState(false)
  const selectedImage = useAppStore((s) => s.selectedImage)
  const saving = useAppStore((s) => s.saving)
  const setSaving = useAppStore((s) => s.setSaving)
  const setSceneReady = useAppStore((s) => s.setSceneReady)
  const { upload, setNotice } = album

  // No WebGL: there is no scene to wait for.
  useEffect(() => {
    if (!webgl) setSceneReady()
  }, [webgl, setSceneReady])

  // Drag & drop anywhere on the page
  useEffect(() => {
    let depth = 0
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    const enter = (e) => hasFiles(e) && (e.preventDefault(), depth++, setDragging(true))
    const over = (e) => hasFiles(e) && e.preventDefault()
    const leave = (e) => hasFiles(e) && (depth = Math.max(0, depth - 1)) === 0 && setDragging(false)
    const drop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      upload(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [upload])

  const handleSave = useCallback(async () => {
    const url = useAppStore.getState().selectedImage
    if (!url || useAppStore.getState().saving) return
    setSaving(true)
    try {
      // three is only needed for exports — keep it out of the initial load
      const { exportCRTImage } = await import('./utils/exportCRTImage')
      await exportCRTImage(url, `crt-photo-${Date.now()}.png`)
    } catch {
      setNotice({ kind: 'error', text: 'Could not export this image (it may block cross-origin access).' })
    } finally {
      setSaving(false)
    }
  }, [setSaving, setNotice])

  // S saves the open photo
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 's' || e.metaKey || e.ctrlKey || e.altKey) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
      if (useAppStore.getState().viewMode === 'photo') handleSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  const sceneFallback = (props) => <Fallback reason="error" onRetry={props.reset} />

  return (
    <>
      <Boot />
      <SoundToggle />

      {webgl ? (
        <ErrorBoundary fallback={sceneFallback}>
          <Suspense fallback={null}>
            <SceneCanvas />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <Fallback reason="nowebgl" />
      )}

      <UploadCard album={album} dim={!!selectedImage} />
      {webgl && <HintBar />}
      {selectedImage && <PhotoBar saving={saving} onSave={handleSave} />}
      <ContextLostBanner />

      {dragging && (
        <div className="dropzone" aria-hidden="true">
          <div className="glass">Drop images to upload</div>
        </div>
      )}
    </>
  )
}
