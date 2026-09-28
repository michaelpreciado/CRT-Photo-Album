import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { startGlyphRain } from './GlyphRain'
import { useAppStore } from '../store/useAppStore'

const LINES = [
  ['kernel', 'preciado-os 1.0 // matrix-glass'],
  ['gpu', 'initialising render pipeline'],
  ['crt', 'warming phosphor tube'],
  ['fs', 'mounting /my-pictures'],
  ['net', 'linking album api'],
]

export default function Boot() {
  const canvasRef = useRef()
  const setBooted = useAppStore((s) => s.setBooted)
  const { progress, active } = useProgress()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    return startGlyphRain(canvasRef.current)
  }, [])

  // Reveal boot lines on a timer; finish once lines are shown and assets idle.
  useEffect(() => {
    if (done) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const id = setInterval(() => setStep((s) => Math.min(LINES.length, s + 1)), reduce ? 60 : 380)
    return () => clearInterval(id)
  }, [done])

  const ready = step >= LINES.length && !active
  useEffect(() => {
    if (!ready || done) return
    const t = setTimeout(() => {
      setDone(true)
      setBooted()
    }, 350)
    return () => clearTimeout(t)
  }, [ready, done, setBooted])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setGone(true), 1000)
    return () => clearTimeout(t)
  }, [done])

  if (gone) return null
  const pct = Math.round(Math.min(100, ((step / LINES.length) * 60) + progress * 0.4))
  const skip = () => {
    setDone(true)
    setBooted()
  }

  return (
    <div className={`boot${done ? ' done' : ''}`} role="status" aria-live="polite">
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
        <div className="boot-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <button className="boot-skip" onClick={skip}>
          skip
        </button>
      </div>
    </div>
  )
}
