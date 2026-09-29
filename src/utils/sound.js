// Tiny WebAudio synth for UI feedback. Everything is generated at runtime
// (no audio files to ship) and the whole module is a no-op while muted,
// which is the default. The AudioContext is only created after the user
// opts in, so browsers' autoplay policies are never an issue.
const KEY = 'crt-album-sound'

let ctx = null
let master = null
let hum = null
let on = false

try {
  on = localStorage.getItem(KEY) === 'on'
} catch {
  /* storage unavailable — stay muted */
}

const listeners = new Set()

export function isSoundOn() {
  return on
}

export function subscribeSound(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function ensure() {
  if (!on) return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.35
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function setSoundOn(next) {
  on = next
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  if (next) {
    ensure()
    tone({ f: 660, to: 990, dur: 0.09, vol: 0.5 })
  } else {
    stopHum()
  }
  listeners.forEach((fn) => fn(next))
}

function tone({ f, to = f, dur = 0.08, vol = 0.4, type = 'square', delay = 0 }) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f, t)
  if (to !== f) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise({ dur = 0.2, vol = 0.2, freq = 1200, delay = 0 }) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + delay
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = c.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

export function startHum() {
  const c = ensure()
  if (!c || hum) return
  const osc = c.createOscillator()
  const osc2 = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = 50
  osc2.type = 'sine'
  osc2.frequency.value = 15734 // horizontal-scan whine, barely there
  const g2 = c.createGain()
  g2.gain.value = 0.0025
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.03, c.currentTime + 1.5)
  osc.connect(g).connect(master)
  osc2.connect(g2).connect(master)
  osc.start()
  osc2.start()
  hum = { osc, osc2, g }
}

export function stopHum() {
  if (!hum || !ctx) return
  const { osc, osc2, g } = hum
  hum = null
  g.gain.cancelScheduledValues(ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
  osc.stop(ctx.currentTime + 0.35)
  osc2.stop(ctx.currentTime + 0.35)
}

export const sfx = {
  powerOn() {
    tone({ f: 48, to: 120, dur: 0.5, vol: 0.9, type: 'sine' })
    noise({ dur: 0.35, vol: 0.25, freq: 900 })
    tone({ f: 880, to: 1320, dur: 0.12, vol: 0.4, delay: 0.55 })
    startHum()
  },
  open() {
    tone({ f: 440, to: 880, dur: 0.09, vol: 0.4 })
    tone({ f: 880, to: 1320, dur: 0.08, vol: 0.3, delay: 0.07 })
  },
  close() {
    tone({ f: 880, to: 330, dur: 0.12, vol: 0.35 })
  },
  select() {
    tone({ f: 620, to: 620, dur: 0.05, vol: 0.35 })
    tone({ f: 930, to: 930, dur: 0.07, vol: 0.3, delay: 0.05 })
  },
  tick() {
    tone({ f: 1400, to: 1000, dur: 0.03, vol: 0.2 })
  },
  error() {
    tone({ f: 200, to: 140, dur: 0.18, vol: 0.4, type: 'sawtooth' })
  },
}
