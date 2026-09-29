import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import Scene from './Scene'
import { QualityContext, TIERS, initialTierIndex } from './quality'
import { useAppStore } from '../store/useAppStore'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { cursorToOS } from './OS/layout'
import { PAGE_SIZE } from './OS/layout'

// Tells the boot overlay when the scene is genuinely on screen: a few frames
// rendered and no assets still loading.
function Ready() {
  const { progress, active } = useProgress()
  const [warm, setWarm] = useState(false)
  const frames = useRef(0)
  const setProgress = useAppStore((s) => s.setBootProgress)
  const setReady = useAppStore((s) => s.setSceneReady)

  useFrame(() => {
    if (!warm && ++frames.current > 4) setWarm(true)
  })
  useEffect(() => setProgress(progress), [progress, setProgress])
  useEffect(() => {
    if (warm && !active) setReady()
  }, [warm, active, setReady])
  return null
}

// Wheel + pinch zoom on the open photo, keyboard navigation everywhere.
function InputBridge() {
  const el = useThree((s) => s.gl.domElement)

  useEffect(() => {
    const store = useAppStore
    const anchor = () => cursorToOS(store.getState().cursor)

    const onWheel = (e) => {
      const s = store.getState()
      if (s.viewMode !== 'photo') return
      e.preventDefault()
      const a = anchor()
      s.zoomPhoto(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), a.x, a.y)
    }

    const touches = new Map()
    let lastDist = 0
    const dist = () => {
      const [a, b] = [...touches.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const onDown = (e) => {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size === 2) {
        lastDist = dist()
        store.getState().photoView.pinching = true
      }
    }
    const onMove = (e) => {
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const s = store.getState()
      if (touches.size === 2 && s.viewMode === 'photo' && lastDist > 0) {
        const d = dist()
        const a = anchor()
        s.zoomPhoto(d / lastDist, a.x, a.y)
        lastDist = d
      }
    }
    const onUp = (e) => {
      if (!touches.delete(e.pointerId)) return
      if (touches.size === 0) {
        // let the tap handler see `pinching` before it clears
        setTimeout(() => {
          store.getState().photoView.pinching = false
        }, 80)
      }
    }

    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = store.getState()
      if (!s.booted) return
      const t = e.target
      const interactive = t?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'LABEL'].includes(t?.tagName)
      const k = e.key
      const stop = () => e.preventDefault()

      if (k === 'Escape') {
        if (s.viewMode === 'photo') s.closePhoto()
        else if (s.viewMode === 'gallery') s.closeGallery()
        else return
        return stop()
      }
      if (interactive && (k === 'Enter' || k === ' ')) return

      if (s.viewMode === 'desktop') {
        if (k === 'Enter' || k === 'o' || k === 'g') {
          s.openGallery()
          stop()
        }
        return
      }

      if (s.viewMode === 'gallery') {
        const total = s.images.length
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
        const move = (dx, dy) => {
          stop()
          if (!s.kb) s.setKb(true)
          else s.moveFocus(dx, dy)
        }
        if (k === 'ArrowRight') move(1, 0)
        else if (k === 'ArrowLeft') move(-1, 0)
        else if (k === 'ArrowDown') move(0, 1)
        else if (k === 'ArrowUp') move(0, -1)
        else if (k === 'PageDown' || k === ']') (stop(), s.setPage(s.page + 1))
        else if (k === 'PageUp' || k === '[') (stop(), s.setPage(s.page - 1))
        else if (k === 'Home') (stop(), s.setPage(0), s.setKb(true))
        else if (k === 'End') (stop(), s.setPage(pages - 1), s.setKb(true))
        else if (k === 'Enter' || k === ' ') {
          const url = s.images[s.page * PAGE_SIZE + s.focusIndex]
          if (url) (stop(), s.selectPhoto(url))
        }
        return
      }

      // photo
      const pan = 0.5
      const zoomed = s.photoView.zoom > 1.05
      if (k === 'ArrowRight' && !zoomed) (stop(), s.stepPhoto(1))
      else if (k === 'ArrowLeft' && !zoomed) (stop(), s.stepPhoto(-1))
      else if (k === 'ArrowRight') (stop(), (s.photoView.x -= pan))
      else if (k === 'ArrowLeft') (stop(), (s.photoView.x += pan))
      else if (k === 'ArrowUp' && zoomed) (stop(), (s.photoView.y -= pan))
      else if (k === 'ArrowDown' && zoomed) (stop(), (s.photoView.y += pan))
      else if (k === 'n' || k === 'PageDown') (stop(), s.stepPhoto(1))
      else if (k === 'p' || k === 'PageUp') (stop(), s.stepPhoto(-1))
      else if (k === '+' || k === '=') (stop(), s.zoomPhoto(1.3))
      else if (k === '-' || k === '_') (stop(), s.zoomPhoto(1 / 1.3))
      else if (k === '0') (stop(), s.resetPhotoView())
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [el])

  return null
}

// Surfaces GL context loss (mobile tab eviction, GPU reset) as UI state; three
// restores the context on its own, so we only need to tell the user.
function ContextGuard() {
  const el = useThree((s) => s.gl.domElement)
  const setLost = useAppStore((s) => s.setContextLost)
  useEffect(() => {
    const lost = (e) => (e.preventDefault(), setLost(true))
    const restored = () => setLost(false)
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', restored)
    return () => {
      el.removeEventListener('webglcontextlost', lost)
      el.removeEventListener('webglcontextrestored', restored)
    }
  }, [el, setLost])
  return null
}

export default function SceneCanvas() {
  const reduced = useReducedMotion()
  const init = useMemo(() => initialTierIndex(), [])
  const [tierIndex, setTierIndex] = useState(init.index)
  const tier = TIERS[tierIndex]
  const ctx = useMemo(() => ({ tier, reduced }), [tier, reduced])

  const decline = useCallback(() => setTierIndex((i) => Math.max(0, i - 1)), [])
  const incline = useCallback(() => setTierIndex((i) => Math.min(TIERS.length - 1, i + 1)), [])
  const dpr = Math.min(tier.dpr, window.devicePixelRatio || 1)

  return (
    <Canvas
      className="crt-canvas"
      shadows={tier.shadows}
      dpr={dpr}
      camera={{ position: [0, 0.5, 4], fov: 50 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.25,
        stencil: false,
      }}
      onCreated={({ gl, scene }) => {
        window.__crtScene = scene
        window.__crtRenderer = gl // debugging / perf inspection
      }}
    >
      <QualityContext.Provider value={ctx}>
        {/* Adaptive quality: step a tier down when frames drop, back up when smooth */}
        {!init.locked && <PerformanceMonitor flipflops={3} onDecline={decline} onIncline={incline} onFallback={decline} />}
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
        <Ready />
        <InputBridge />
        <ContextGuard />
      </QualityContext.Provider>
    </Canvas>
  )
}
