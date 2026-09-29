import { useEffect, useRef, useState } from 'react'
import { startGlyphRain } from './GlyphRain'
import { useAppStore } from '../store/useAppStore'
import { useReducedMotion } from '../hooks/useReducedMotion'

const LINES = [
  ['kernel', 'preciado-os 1.0 // matrix-glass'],
  ['gpu', 'initialising render pipeline'],
  ['crt', 'warming phosphor tube'],
  ['fs', 'mounting /my-pictures'],
  ['net', 'linking album api'],
]
const FAILSAFE_MS = 9000

export default function Boot() {
  const canvasRef = useRef()
  const setBooted = useAppStore((s) => s.setBooted)
  const sceneReady = useAppStore((s) => s.sceneReady)
  const progress = useAppStore((s) => s.bootProgress)
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    return startGlyphRain(canvasRef.current)
  }, [])

  // Reveal boot lines on a timer; finish once lines are shown and the scene
  // is actually on screen (chunk loaded, textures uploaded, frames rendering).
  useEffect(() => {
    if (done) return
    const id = setInterval(() => setStep((s) => Math.min(LINES.length, s + 1)), reduced ? 40 : 380)
    return () => clearInterval(id)
  }, [done, reduced])

  const ready = step >= LINES.length && sceneReady
  useEffect(() => {
    if (!ready || done) return
    const t = setTimeout(() => {
      setDone(true)
      setBooted()
    }, reduced ? 0 : 350)
    return () => clearTimeout(t)
  }, [ready, done, setBooted, reduced])

  // Never trap the user behind a boot screen.
  useEffect(() => {
    const t = setTimeout(() => {
      setDone(true)
      setBooted()
    }, FAILSAFE_MS)
    return () => clearTimeout(t)
  }, [setBooted])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setGone(true), reduced ? 50 : 1000)
    return () => clearTimeout(t)
  }, [done, reduced])

  if (gone) return null
  const pct = Math.round(Math.min(100, (step / LINES.length) * 55 + (sceneReady ? 45 : progress * 0.4)))
  const skip = () => {
    setDone(true)
    setBooted()
  }

  return (
    <div className={`boot${done ? ' done' : ''}`} role="status" aria-live="polite" aria-label="Starting CRT Album">
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="boot-panel glass">
        <div className="boot-brand">
          Preciado<span>Tech</span> // CRT Album
        </div>
        {LINES.slice(0, step).map(([k, v]) => (
          <div className="boot-line" key={k}>
            <b>[{k}]</b> {v}
          </div>
        ))}
        <div className="boot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <button className="boot-skip" onClick={skip}>
          skip
        </button>
      </div>
    </div>
  )
}
