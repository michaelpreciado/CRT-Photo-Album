// WebAudio foley, synthesised at runtime (nothing to download): the lamp's
// pull-chain click and filament buzz, the CRT's degauss thump, flyback whine
// and mains hum, plus soft UI ticks. Silent until the user turns it on.
const KEY = 'crt-album-sound'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let hum: { stop(): void } | null = null
let on = true
try {
  on = localStorage.getItem(KEY) !== 'off'
} catch {
  /* storage unavailable */
}

const listeners = new Set<(on: boolean) => void>()
export const isSoundOn = () => on
export function onSoundChange(fn: (on: boolean) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function ensure(): AudioContext | null {
  if (!on) return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.4
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Call from a user gesture so iOS allows audio. */
export function unlockAudio() {
  ensure()
}

let humWanted = false

export function setSoundOn(next: boolean) {
  on = next
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  if (next) {
    ensure()
    sfx.tick()
    if (humWanted) startHum()
  } else stopHum(true)
  listeners.forEach((fn) => fn(next))
}

interface ToneOpts {
  f: number
  to?: number
  dur?: number
  vol?: number
  type?: OscillatorType
  delay?: number
}
function tone({ f, to = f, dur = 0.08, vol = 0.4, type = 'square', delay = 0 }: ToneOpts) {
  const c = ensure()
  if (!c || !master) return
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

function noise({ dur = 0.2, vol = 0.2, freq = 1200, q = 1, delay = 0, type = 'bandpass' as BiquadFilterType }) {
  const c = ensure()
  if (!c || !master) return
  const t = c.currentTime + delay
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

export function startHum() {
  humWanted = true
  const c = ensure()
  if (!c || !master || hum) return
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.2)
  g.connect(master)
  const mk = (type: OscillatorType, f: number, v: number) => {
    const o = c.createOscillator()
    const og = c.createGain()
    o.type = type
    o.frequency.value = f
    og.gain.value = v
    o.connect(og).connect(g)
    o.start()
    return o
  }
  const oscs = [mk('sine', 60, 0.035), mk('sine', 120, 0.012), mk('sine', 15734, 0.0022)]
  hum = {
    stop() {
      const t = c.currentTime
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(g.gain.value, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
      oscs.forEach((o) => o.stop(t + 0.45))
    },
  }
}

export function stopHum(keepWanted = false) {
  if (!keepWanted) humWanted = false
  hum?.stop()
  hum = null
}

export const sfx = {
  lampOn() {
    // pull-chain click, then the filament's faint buzz settling
    noise({ dur: 0.03, vol: 0.9, freq: 3200, q: 2 })
    noise({ dur: 0.05, vol: 0.5, freq: 1800, q: 3, delay: 0.035 })
    tone({ f: 100, to: 100, dur: 0.5, vol: 0.12, type: 'sawtooth', delay: 0.05 })
  },
  powerOn() {
    // relay clunk + degauss "thoom" + flyback whine
    noise({ dur: 0.05, vol: 0.9, freq: 900, q: 2 })
    tone({ f: 55, to: 42, dur: 0.9, vol: 1.2, type: 'sine', delay: 0.05 })
    noise({ dur: 0.8, vol: 0.35, freq: 180, q: 0.7, delay: 0.05, type: 'lowpass' })
    tone({ f: 9000, to: 15700, dur: 0.6, vol: 0.05, type: 'sine', delay: 0.3 })
    startHum()
  },
  powerOff() {
    tone({ f: 15700, to: 4000, dur: 0.4, vol: 0.05, type: 'sine' })
    noise({ dur: 0.08, vol: 0.5, freq: 700, q: 2 })
    stopHum()
  },
  open() {
    tone({ f: 520, to: 1040, dur: 0.08, vol: 0.25 })
  },
  close() {
    tone({ f: 900, to: 380, dur: 0.1, vol: 0.22 })
  },
  select() {
    tone({ f: 660, dur: 0.045, vol: 0.25 })
    tone({ f: 990, dur: 0.06, vol: 0.2, delay: 0.045 })
  },
  tick() {
    noise({ dur: 0.012, vol: 0.25, freq: 4000, q: 4 })
  },
  whoosh() {
    noise({ dur: 0.5, vol: 0.12, freq: 500, q: 0.6, type: 'bandpass' })
  },
  error() {
    tone({ f: 200, to: 140, dur: 0.18, vol: 0.3, type: 'sawtooth' })
  },
}
