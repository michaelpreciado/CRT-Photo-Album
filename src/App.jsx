import { Canvas } from '@react-three/fiber'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { PerformanceMonitor } from '@react-three/drei'
import styled, { createGlobalStyle } from 'styled-components'
import Scene from './components/Scene'
import Boot from './components/Boot'
import { useAppStore } from './store/useAppStore'
import { exportCRTImage } from './utils/exportCRTImage'

const GlobalStyle = createGlobalStyle`
  body {
    font-family: var(--sans);
    background: var(--bg);
    overscroll-behavior: none;
  }
`

const UIContainer = styled.div`
  position: absolute;
  top: 32px;
  left: 32px;
  z-index: 10;
  color: var(--text);
  pointer-events: none;
  transition: opacity 0.4s ease;
  opacity: ${(p) => (p.$dim ? 0.15 : 1)};

  @media (max-width: 768px) {
    top: auto;
    bottom: max(16px, env(safe-area-inset-bottom));
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: center;
  }
`

const Card = styled.div.attrs({ className: 'glass' })`
  padding: 22px;
  border-radius: 16px;
  pointer-events: auto;
  max-width: 320px;
  transition: transform 0.3s ease, border-color 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(120, 214, 240, 0.3);
  }

  @media (max-width: 768px) {
    width: 100%;
    max-width: none;
    padding: 14px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16px;

    & > h1,
    & > p,
    & > div:first-child {
      display: none;
    }
  }
`

const Title = styled.h1`
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
`

const Description = styled.p`
  margin: 0 0 18px 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-dim);
`

const UploadButton = styled.label`
  position: relative;
  background: rgba(92, 225, 242, 0.1);
  color: var(--cyan);
  padding: 12px 0;
  border: 1px solid rgba(92, 225, 242, 0.4);
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-weight: 500;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  width: 100%;
  gap: 8px;

  &:hover {
    background: rgba(92, 225, 242, 0.18);
    box-shadow: 0 0 24px -6px rgba(92, 225, 242, 0.55);
  }

  &:active {
    transform: scale(0.98);
  }

  &:focus-within {
    outline: 2px solid var(--cyan);
    outline-offset: 2px;
  }
`

const HiddenInput = styled.input`
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
`

const Badge = styled.div`
  display: inline-block;
  padding: 3px 9px;
  background: rgba(92, 225, 242, 0.08);
  border-radius: 100px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--cyan);
  margin-bottom: 12px;
  border: 1px solid var(--line);
`

const ErrorMessage = styled.div`
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(255, 107, 129, 0.1);
  border: 1px solid rgba(255, 107, 129, 0.35);
  border-radius: 8px;
  font-size: 12px;
  color: #ff9aaa;
  line-height: 1.4;
`

const SaveBar = styled.div.attrs({ className: 'glass' })`
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  max-width: calc(100vw - 32px);
  border-radius: 14px;
  animation: rise 0.35s ease;

  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 12px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
`

const SaveButton = styled.button`
  background: linear-gradient(180deg, var(--cyan), var(--cyan-deep));
  color: #03141a;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-family: var(--mono);
  font-weight: 500;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover:not(:disabled) {
    transform: scale(1.03);
    box-shadow: 0 0 22px -4px rgba(92, 225, 242, 0.7);
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
`

const BackButton = styled.button`
  background: var(--glass-strong);
  color: var(--text);
  border: 1px solid var(--line);
  padding: 10px 16px;
  border-radius: 10px;
  font-family: var(--mono);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: rgba(96, 168, 200, 0.16);
    border-color: rgba(120, 214, 240, 0.35);
  }
`

const SaveHint = styled.span`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-faint);
  padding-left: 4px;

  @media (max-width: 600px) {
    display: none;
  }
`

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png',
  'image/gif', 'image/webp', 'image/avif',
])
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function uploadFile(file) {
  const base64 = await fileToBase64(file)
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64, filename: file.name }),
  })
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`)
  }
  const data = await response.json()
  return data.url
}

function App() {
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [dpr, setDpr] = useState(() => Math.min(1.5, window.devicePixelRatio || 1))

  const images = useAppStore((s) => s.images)
  const setImages = useAppStore((s) => s.setImages)
  const addImages = useAppStore((s) => s.addImages)
  const selectedImage = useAppStore((s) => s.selectedImage)
  const closePhoto = useAppStore((s) => s.closePhoto)
  const saving = useAppStore((s) => s.saving)
  const setSaving = useAppStore((s) => s.setSaving)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  const fetchImages = useCallback(async () => {
    try {
      const response = await fetch('/api/images')
      const data = await response.json()

      if (data.needsInit) {
        await fetch('/api/init-db', { method: 'POST' })
        const retryResponse = await fetch('/api/images')
        const retryData = await retryResponse.json()
        setImages(retryData.images.map(img => img.url))
      } else {
        setImages(data.images.map(img => img.url))
      }
    } catch {
      setImages([
        'https://picsum.photos/id/10/400/300',
        'https://picsum.photos/id/11/400/300',
        'https://picsum.photos/id/12/400/300',
        'https://picsum.photos/id/13/400/300',
        'https://picsum.photos/id/14/400/300',
      ])
    } finally {
      setLoading(false)
    }
  }, [setImages])

  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    const invalid = files.filter(f => !ALLOWED_TYPES.has(f.type))
    if (invalid.length > 0) {
      setError(`${invalid.length} file(s) have unsupported formats.`)
      return
    }

    const oversized = files.filter(f => f.size > MAX_FILE_SIZE)
    if (oversized.length > 0) {
      setError(`${oversized.length} file(s) exceed the 10 MB limit.`)
      return
    }

    setUploading(true)
    setError(null)

    try {
      const results = await Promise.allSettled(files.map(uploadFile))
      const urls = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
      const failures = results.filter(r => r.status === 'rejected')

      if (urls.length > 0) {
        addImages(urls)
      } else if (failures.length > 0) {
        // Fall back to local object URLs so the experience still works
        // without the upload API (e.g. running the static site alone).
        addImages(files.map(f => URL.createObjectURL(f)))
        setError('Upload API unavailable — showing images locally.')
        setUploading(false)
        e.target.value = ''
        return
      }
      if (failures.length > 0) {
        setError(`${failures.length} file(s) failed to upload.`)
      }
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (!selectedImage || saving) return
    setSaving(true)
    try {
      await exportCRTImage(selectedImage, `crt-photo-${Date.now()}.png`)
    } catch {
      setError('Could not export this image (it may block cross-origin access).')
    } finally {
      setSaving(false)
    }
  }

  const isDisabled = uploading || loading

  return (
    <>
      <GlobalStyle />
      <Boot />
      <UIContainer $dim={!!selectedImage}>
        <Card>
          <Badge>PRECIADO TECH // v1.1</Badge>
          <Title>CRT Album</Title>
          <Description>
            Upload your photos and view them on a retro CRT. Drag the cursor on
            the screen, click the folder to browse, click a photo to zoom in —
            then save it with the CRT effect baked in.
          </Description>
          <UploadButton
            style={{
              opacity: isDisabled ? 0.6 : 1,
              cursor: isDisabled ? 'wait' : 'pointer',
            }}
            aria-label="Upload images"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading ? 'Uploading…' : loading ? 'Loading…' : 'Upload Images'}
            <HiddenInput
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
              onChange={handleUpload}
              disabled={isDisabled}
            />
          </UploadButton>
          {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
        </Card>
      </UIContainer>

      {selectedImage && (
        <SaveBar>
          <BackButton onClick={closePhoto}>← Back</BackButton>
          <SaveButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save with CRT effect'}
          </SaveButton>
          <SaveHint>Exports a PNG with the CRT look applied</SaveHint>
        </SaveBar>
      )}

      <Canvas
        shadows
        dpr={dpr}
        performance={{ min: 0.6 }}
        camera={{ position: [0, 0.5, 4], fov: 50 }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 1,
        }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
          stencil: false,
        }}
      >
        {/* Adaptive resolution: back off DPR under load, restore when smooth */}
        <PerformanceMonitor
          onIncline={() => setDpr(Math.min(1.75, window.devicePixelRatio))}
          onDecline={() => setDpr(0.85)}
        >
          <Suspense fallback={null}>
            <Scene uploadedImages={images} />
          </Suspense>
        </PerformanceMonitor>
      </Canvas>
    </>
  )
}

export default App
