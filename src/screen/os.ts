import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'
import type { ImageStore, Item, Pic } from './images'

/**
 * The software running on the tube: a tiny photo OS drawn with Canvas2D and
 * shown through the CRT shader. It owns its own gesture handling so the
 * screen feels like a phone photo app: momentum scrolling with rubber-band
 * edges, a photo that zooms out of its thumbnail, swipe paging that follows
 * the finger, pinch / double-tap / wheel zoom anchored on the fingers, and
 * swipe-down to dismiss.
 */

export const SW = 1024
export const SH = 768
const HEADER = 74
const PAD = 30
const GAP = 18
const COLS = 4
const TILE = (SW - PAD * 2 - GAP * (COLS - 1)) / COLS
const PAGE_GAP = 60

const C = {
  bg0: '#050b14',
  bg1: '#0a1a2c',
  ink: '#e9f4ff',
  dim: '#7f9bb8',
  accent: '#5fe3ff',
  warn: '#ffb45f',
}

type Mode = 'off' | 'boot' | 'gallery' | 'viewer'

export interface OSHooks {
  upload(): void
  save(url: string): void
  exit(): void
  mode(mode: Mode): void
  sound(name: 'tick' | 'open' | 'close' | 'select' | 'error'): void
}

interface Ptr {
  x: number
  y: number
  sx: number
  sy: number
  lx: number
  ly: number
  t: number
  lt: number
  vx: number
  vy: number
  mouse: boolean
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const damp = (a: number, b: number, k: number, dt: number) => b + (a - b) * Math.exp(-k * dt)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export class ScreenOS {
  readonly canvas = document.createElement('canvas')
  readonly texture: CanvasTexture
  private ctx: CanvasRenderingContext2D
  mode: Mode = 'off'
  private dirty = true
  private time = 0
  private font = 'monospace'
  private fontScale = 1

  // boot
  private bootT = 0

  // gallery
  private scroll = 0
  private scrollV = 0
  private focus = -1 // keyboard focus (grid index, 0 = add tile)
  private hover = -1
  private press = -1

  // viewer
  private index = 0
  private slide = 0
  private slideTarget = 0
  private slideAnimating = false
  private zoom = 1
  private zoomTarget = 1
  private panX = 0
  private panY = 0
  private panTX = 0
  private panTY = 0
  private zoomAnimating = false
  private dismiss = 0
  private dismissAnimating = false
  private chrome = 1
  private chromeTarget = 1
  private chromeTimer = 0
  private open = 0 // 0 = grid, 1 = viewer
  private openDir = 0
  private hoverBtn = ''

  // gestures
  private ptrs = new Map<number, Ptr>()
  private gesture: '' | 'scroll' | 'swipe' | 'dismiss' | 'pan' | 'pinch' = ''
  private pinch0 = { d: 1, zoom: 1, cx: 0, cy: 0, panX: 0, panY: 0 }
  private lastTap = { t: 0, x: 0, y: 0 }
  private tapTimer = 0

  uploading: { done: number; total: number } | null = null

  constructor(
    private store: ImageStore,
    private hooks: OSHooks,
  ) {
    this.canvas.width = SW
    this.canvas.height = SH
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.minFilter = LinearMipmapLinearFilter
    this.texture.magFilter = LinearFilter
    this.texture.anisotropy = 4
    store.onChange = () => (this.dirty = true)
  }

  setFont(family: string, scale = 1) {
    this.font = family
    this.fontScale = scale
    this.dirty = true
  }

  private get items() {
    return this.store.items
  }

  // ---------------------------------------------------------------- state

  boot() {
    this.mode = 'boot'
    this.bootT = 0
    this.dirty = true
    this.hooks.mode('boot')
  }

  powerOff() {
    this.mode = 'off'
    this.dirty = true
  }

  get viewing() {
    return this.mode === 'viewer'
  }

  private setMode(m: Mode) {
    this.mode = m
    this.dirty = true
    this.hooks.mode(m)
  }

  private openPhoto(i: number) {
    if (!this.items[i]) return
    this.index = i
    this.zoom = this.zoomTarget = 1
    this.panX = this.panY = this.panTX = this.panTY = 0
    this.slide = this.slideTarget = 0
    this.dismiss = 0
    this.openDir = 1
    this.chrome = this.chromeTarget = 1
    this.chromeTimer = 2.8
    this.store.request(this.items[i], true, 10)
    this.setMode('viewer')
    this.hooks.sound('open')
  }

  closePhoto() {
    if (this.mode !== 'viewer' || this.openDir === -1) return
    this.ensureTileVisible(this.index + 1, true)
    this.openDir = -1
    this.hooks.sound('close')
    this.dirty = true
  }

  /** Back / Escape semantics shared with the DOM controls. */
  back(): boolean {
    if (this.mode === 'viewer') {
      if (this.zoom > 1.01) this.animateZoom(1, 0, 0)
      else this.closePhoto()
      return true
    }
    return false
  }

  current(): Item | undefined {
    return this.mode === 'viewer' ? this.items[this.index] : undefined
  }

  step(dir: number) {
    if (this.mode !== 'viewer') return
    const next = this.index + dir
    if (next < 0 || next >= this.items.length) {
      this.slideTarget = 0
      this.slide += dir * -40
      this.slideAnimating = true
      this.hooks.sound('error')
      return
    }
    this.slideTarget = -dir * (SW + PAGE_GAP)
    this.slideAnimating = true
    this.animateZoom(1, 0, 0)
    this.hooks.sound('tick')
  }

  /** Called after new uploads land at the front of the album. */
  showNewest(count: number) {
    if (this.mode === 'viewer') this.index += count
    else this.scroll = 0
    this.dirty = true
  }

  // --------------------------------------------------------------- layout

  private tileRect(gi: number) {
    const col = gi % COLS
    const row = Math.floor(gi / COLS)
    return { x: PAD + col * (TILE + GAP), y: HEADER + PAD - 6 + row * (TILE + GAP) - this.scroll, w: TILE, h: TILE }
  }

  private get maxScroll() {
    const rows = Math.ceil((this.items.length + 1) / COLS)
    return Math.max(0, HEADER + PAD - 6 + rows * (TILE + GAP) - GAP + PAD - SH)
  }

  private tileAt(x: number, y: number) {
    if (y < HEADER) return -1
    const n = this.items.length + 1
    for (let i = 0; i < n; i++) {
      const r = this.tileRect(i)
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i
    }
    return -1
  }

  private ensureTileVisible(gi: number, instant = false) {
    const r = this.tileRect(gi)
    let target = this.scroll
    if (r.y < HEADER + 10) target += r.y - HEADER - 10
    else if (r.y + r.h > SH - 10) target += r.y + r.h - SH + 10
    target = clamp(target, 0, this.maxScroll)
    if (instant) this.scroll = target
    else this.scrollV = (target - this.scroll) * 6
    this.dirty = true
  }

  private fitRect(pic: Pic | undefined) {
    const w = pic?.width ?? 4
    const h = pic?.height ?? 3
    const s = Math.min(SW / w, SH / h)
    return { w: w * s, h: h * s }
  }

  private clampPan(z = this.zoom) {
    const f = this.fitRect(this.items[this.index]?.full ?? this.items[this.index]?.thumb)
    const mx = Math.max(0, (f.w * z - SW) / 2)
    const my = Math.max(0, (f.h * z - SH) / 2)
    return { mx, my }
  }

  private animateZoom(z: number, px: number, py: number) {
    this.zoomTarget = z
    const { mx, my } = this.clampPan(z)
    this.panTX = clamp(px, -mx, mx)
    this.panTY = clamp(py, -my, my)
    this.zoomAnimating = true
    this.dirty = true
  }

  /** Pan that keeps the image point under (x, y) fixed while zooming z0 -> z1. */
  private zoomAbout(x: number, y: number, z0: number, z1: number, panX: number, panY: number) {
    const cx = x - SW / 2
    const cy = y - SH / 2
    return { x: cx - (cx - panX) * (z1 / z0), y: cy - (cy - panY) * (z1 / z0) }
  }

  // --------------------------------------------------------------- input

  pointerDown(id: number, x: number, y: number, mouse: boolean, now = performance.now()) {
    this.ptrs.set(id, { x, y, sx: x, sy: y, lx: x, ly: y, t: now, lt: now, vx: 0, vy: 0, mouse })
    this.dirty = true
    if (this.mode === 'gallery') {
      this.scrollV = 0
      if (this.ptrs.size === 1) this.press = this.tileAt(x, y)
    }
    if (this.mode === 'viewer' && this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()]
      this.gesture = 'pinch'
      this.pinch0 = {
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: this.zoom,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        panX: this.panX,
        panY: this.panY,
      }
      this.zoomAnimating = false
    }
  }

  pointerMove(id: number, x: number, y: number, now = performance.now()) {
    const p = this.ptrs.get(id)
    if (!p) {
      this.hoverAt(x, y)
      return
    }
    const dt = Math.max(1, now - p.lt)
    const dx = x - p.x
    const dy = y - p.y
    // low-passed velocity in px/ms for flicks
    p.vx = p.vx * 0.6 + (dx / dt) * 0.4
    p.vy = p.vy * 0.6 + (dy / dt) * 0.4
    p.lx = p.x
    p.ly = p.y
    p.x = x
    p.y = y
    p.lt = now
    const tx = x - p.sx
    const ty = y - p.sy
    this.dirty = true

    if (this.mode === 'gallery') {
      if (!this.gesture && Math.hypot(tx, ty) > 8) {
        this.gesture = 'scroll'
        this.press = -1
      }
      if (this.gesture === 'scroll') {
        const over = this.scroll < 0 || this.scroll > this.maxScroll
        this.scroll -= over ? dy * 0.4 : dy
      }
      return
    }

    if (this.mode !== 'viewer' || this.openDir !== 0) return

    if (this.gesture === 'pinch' && this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const z = clamp((this.pinch0.zoom * d) / this.pinch0.d, 0.7, 5)
      const pan = this.zoomAbout(this.pinch0.cx, this.pinch0.cy, this.pinch0.zoom, z, this.pinch0.panX, this.pinch0.panY)
      this.zoom = z
      this.panX = pan.x + (cx - this.pinch0.cx)
      this.panY = pan.y + (cy - this.pinch0.cy)
      return
    }

    if (!this.gesture && Math.hypot(tx, ty) > 8) {
      if (this.zoom > 1.02) this.gesture = 'pan'
      else if (Math.abs(tx) > Math.abs(ty)) this.gesture = 'swipe'
      else this.gesture = 'dismiss'
      this.slideAnimating = this.dismissAnimating = this.zoomAnimating = false
    }
    if (this.gesture === 'swipe') {
      const atEdge = (this.index === 0 && this.slide > 0) || (this.index === this.items.length - 1 && this.slide < 0)
      this.slide += atEdge ? dx * 0.35 : dx
    } else if (this.gesture === 'dismiss') {
      this.dismiss += dy
      this.chromeTarget = 0
    } else if (this.gesture === 'pan') {
      const { mx, my } = this.clampPan()
      const rub = (v: number, m: number, d: number) => (Math.abs(v) > m ? d * 0.35 : d)
      this.panX += rub(this.panX, mx, dx)
      this.panY += rub(this.panY, my, dy)
      // dragging a zoomed photo past its edge pages to the neighbour
      if (Math.abs(this.panX) > mx + 140) {
        this.step(this.panX > 0 ? -1 : 1)
        this.gesture = ''
        this.ptrs.clear()
      }
    }
  }

  pointerUp(id: number, x: number, y: number, now = performance.now()) {
    const p = this.ptrs.get(id)
    if (!p) return
    this.ptrs.delete(id)
    this.dirty = true
    // a finger that stopped before lifting shouldn't fling
    if (now - p.lt > 90) p.vx = p.vy = 0
    const moved = Math.hypot(x - p.sx, y - p.sy)
    const dur = now - p.t
    const isTap = !this.gesture && moved < 12 && dur < 500

    if (this.mode === 'gallery') {
      if (this.gesture === 'scroll' && this.ptrs.size === 0) {
        this.scrollV = -p.vy * 1000 // px/s
      }
      if (isTap) {
        const gi = this.tileAt(x, y)
        if (gi === 0) {
          this.hooks.sound('select')
          this.hooks.upload()
        } else if (gi > 0 && gi === this.press) {
          this.focus = gi
          this.openPhoto(gi - 1)
        }
      }
      this.press = -1
      if (this.ptrs.size === 0) this.gesture = ''
      return
    }

    if (this.mode !== 'viewer') return

    if (this.gesture === 'pinch') {
      if (this.ptrs.size < 2) {
        if (this.zoom < 0.85 && this.ptrs.size === 0) {
          this.closePhoto()
        } else if (this.zoom < 1) this.animateZoom(1, 0, 0)
        else {
          const { mx, my } = this.clampPan()
          this.animateZoom(this.zoom, clamp(this.panX, -mx, mx), clamp(this.panY, -my, my))
        }
        this.gesture = this.ptrs.size ? 'pan' : ''
        // restart pan from the remaining finger
        for (const q of this.ptrs.values()) {
          q.sx = q.x
          q.sy = q.y
        }
      }
      return
    }

    if (this.gesture === 'swipe') {
      const v = p.vx
      const threshold = SW * 0.18
      if ((this.slide < -threshold || v < -0.45) && this.index < this.items.length - 1) this.step(1)
      else if ((this.slide > threshold || v > 0.45) && this.index > 0) this.step(-1)
      else {
        this.slideTarget = 0
        this.slideAnimating = true
      }
    } else if (this.gesture === 'dismiss') {
      if (Math.abs(this.dismiss) > 120 || Math.abs(p.vy) > 0.7) this.closePhoto()
      else this.dismissAnimating = true
    } else if (this.gesture === 'pan') {
      const { mx, my } = this.clampPan()
      // fling with a little momentum
      this.animateZoom(this.zoom, clamp(this.panX + p.vx * 180, -mx, mx), clamp(this.panY + p.vy * 180, -my, my))
    } else if (isTap) {
      this.tap(x, y, p.mouse, now)
    }
    if (this.ptrs.size === 0) this.gesture = ''
  }

  pointerCancel(id: number) {
    const p = this.ptrs.get(id)
    if (p) this.pointerUp(id, p.x, p.y, p.lt)
  }

  private tap(x: number, y: number, mouse: boolean, now: number) {
    // chrome buttons respond instantly
    if (this.chrome > 0.5) {
      const btn = this.chromeHit(x, y)
      if (btn === 'back') return this.closePhoto()
      if (btn === 'save') {
        this.hooks.sound('select')
        const it = this.items[this.index]
        if (it) this.hooks.save(it.url)
        return
      }
    }
    if (mouse && this.zoom <= 1.01) {
      if (x < SW * 0.14) return this.step(-1)
      if (x > SW * 0.86) return this.step(1)
    }
    const dbl = now - this.lastTap.t < 320 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 60
    this.lastTap = { t: dbl ? 0 : now, x, y }
    clearTimeout(this.tapTimer)
    if (dbl) {
      if (this.zoom > 1.05) this.animateZoom(1, 0, 0)
      else {
        const pan = this.zoomAbout(x, y, 1, 2.6, 0, 0)
        this.animateZoom(2.6, pan.x, pan.y)
      }
      this.hooks.sound('tick')
      return
    }
    this.tapTimer = window.setTimeout(() => {
      this.chromeTarget = this.chromeTarget > 0.5 ? 0 : 1
      this.chromeTimer = 3.5
      this.dirty = true
    }, 260)
  }

  wheel(dx: number, dy: number, x: number, y: number, pinch: boolean) {
    this.dirty = true
    if (this.mode === 'gallery') {
      this.scroll = clamp(this.scroll + dy, -60, this.maxScroll + 60)
      this.scrollV = 0
      return
    }
    if (this.mode !== 'viewer' || this.openDir !== 0) return
    if (!pinch && Math.abs(dx) > Math.abs(dy) * 1.5 && this.zoom <= 1.01) {
      // trackpad horizontal swipe
      this.slide -= dx
      this.slideAnimating = false
      clearTimeout(this.tapTimer)
      this.tapTimer = window.setTimeout(() => {
        if (this.slide < -SW * 0.12) this.step(1)
        else if (this.slide > SW * 0.12) this.step(-1)
        else {
          this.slideTarget = 0
          this.slideAnimating = true
        }
      }, 90)
      return
    }
    const z0 = this.zoom
    const z1 = clamp(z0 * Math.exp(-dy * (pinch ? 0.01 : 0.0022)), 1, 5)
    const pan = this.zoomAbout(x, y, z0, z1, this.panX, this.panY)
    this.zoom = this.zoomTarget = z1
    const { mx, my } = this.clampPan(z1)
    this.panX = this.panTX = clamp(pan.x, -mx, mx)
    this.panY = this.panTY = clamp(pan.y, -my, my)
    this.zoomAnimating = false
  }

  /** Returns true when the key was consumed. */
  key(k: string): boolean {
    if (this.mode === 'gallery') {
      const n = this.items.length + 1
      const move = (d: number) => {
        this.focus = clamp((this.focus < 0 ? 0 : this.focus) + d, 0, n - 1)
        this.ensureTileVisible(this.focus)
        this.hooks.sound('tick')
      }
      switch (k) {
        case 'ArrowRight': move(1); return true
        case 'ArrowLeft': move(-1); return true
        case 'ArrowDown': move(COLS); return true
        case 'ArrowUp': move(-COLS); return true
        case 'Enter':
        case ' ':
          if (this.focus === 0) this.hooks.upload()
          else if (this.focus > 0) this.openPhoto(this.focus - 1)
          else move(1)
          return true
        case 'Home': this.focus = 0; this.ensureTileVisible(0); return true
        case 'End': this.focus = n - 1; this.ensureTileVisible(n - 1); return true
      }
      return false
    }
    if (this.mode === 'viewer') {
      switch (k) {
        case 'ArrowRight': this.step(1); return true
        case 'ArrowLeft': this.step(-1); return true
        case 'Escape':
        case 'Backspace': this.back(); return true
        case '+':
        case '=': this.animateZoom(clamp(this.zoomTarget * 1.5, 1, 5), this.panTX, this.panTY); return true
        case '-': this.animateZoom(clamp(this.zoomTarget / 1.5, 1, 5), this.panTX, this.panTY); return true
        case '0': this.animateZoom(1, 0, 0); return true
        case 's':
        case 'S': {
          const it = this.items[this.index]
          if (it) this.hooks.save(it.url)
          return true
        }
      }
    }
    return false
  }

  private hoverAt(x: number, y: number) {
    let h = -1
    let b = ''
    if (this.mode === 'gallery') h = this.tileAt(x, y)
    if (this.mode === 'viewer') {
      b = this.chrome > 0.5 ? this.chromeHit(x, y) : ''
      if (!b && this.zoom <= 1.01) b = x < SW * 0.14 ? 'prev' : x > SW * 0.86 ? 'next' : ''
    }
    if (h !== this.hover || b !== this.hoverBtn) {
      this.hover = h
      this.hoverBtn = b
      this.dirty = true
      if (h >= 0) this.hooks.sound('tick')
    }
  }

  clearHover() {
    if (this.hover !== -1 || this.hoverBtn) {
      this.hover = -1
      this.hoverBtn = ''
      this.dirty = true
    }
  }

  /** Whether the point is over something clickable (for the CSS cursor). */
  clickable(x: number, y: number) {
    if (this.mode === 'gallery') return this.tileAt(x, y) >= 0
    if (this.mode === 'viewer') return !!this.chromeHit(x, y) || x < SW * 0.14 || x > SW * 0.86
    return false
  }

  private chromeHit(x: number, y: number) {
    if (y > 78) return ''
    if (x < 230) return 'back'
    if (x > SW - 200) return 'save'
    return ''
  }

  // -------------------------------------------------------------- update

  update(dt: number) {
    this.time += dt
    // clock tick
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) {
      if (this.mode !== 'off' && Math.floor(this.time) % 15 === 0) this.dirty = true
    }

    if (this.mode === 'boot') {
      this.bootT += dt
      this.dirty = true
      if (this.bootT > 3.1) {
        this.setMode('gallery')
        this.open = 0
      }
    }

    if (this.mode === 'gallery' || (this.mode === 'viewer' && this.open < 1)) {
      if (!this.ptrs.size || this.gesture !== 'scroll') {
        const max = this.maxScroll
        if (this.scroll < 0 || this.scroll > max) {
          const edge = this.scroll < 0 ? 0 : max
          this.scroll = damp(this.scroll, edge, 14, dt)
          this.scrollV *= Math.exp(-20 * dt)
          if (Math.abs(this.scroll - edge) < 0.3) this.scroll = edge
          this.dirty = true
        }
        if (Math.abs(this.scrollV) > 2) {
          this.scroll += this.scrollV * dt
          this.scrollV *= Math.exp(-3.2 * dt)
          this.dirty = true
        } else this.scrollV = 0
      }
      this.requestVisible()
    }

    if (this.mode === 'viewer') {
      if (this.openDir !== 0) {
        this.open = clamp(this.open + this.openDir * dt / 0.42, 0, 1)
        this.dirty = true
        if (this.open >= 1 && this.openDir === 1) this.openDir = 0
        if (this.open <= 0 && this.openDir === -1) {
          this.openDir = 0
          this.dismiss = 0
          this.focus = this.index + 1
          this.setMode('gallery')
        }
      }
      if (this.slideAnimating) {
        this.slide = damp(this.slide, this.slideTarget, 16, dt)
        if (Math.abs(this.slide - this.slideTarget) < 0.5) {
          this.slide = this.slideTarget
          this.slideAnimating = false
          if (this.slideTarget !== 0) {
            const dir = this.slideTarget < 0 ? 1 : -1
            this.index = clamp(this.index + dir, 0, this.items.length - 1)
            this.slide = 0
            this.slideTarget = 0
            this.zoom = this.zoomTarget = 1
            this.panX = this.panY = this.panTX = this.panTY = 0
            this.store.trimFull(this.index)
          }
        }
        this.dirty = true
      }
      if (this.zoomAnimating) {
        this.zoom = damp(this.zoom, this.zoomTarget, 14, dt)
        this.panX = damp(this.panX, this.panTX, 14, dt)
        this.panY = damp(this.panY, this.panTY, 14, dt)
        if (Math.abs(this.zoom - this.zoomTarget) < 0.002 && Math.abs(this.panX - this.panTX) < 0.3 && Math.abs(this.panY - this.panTY) < 0.3) {
          this.zoom = this.zoomTarget
          this.panX = this.panTX
          this.panY = this.panTY
          this.zoomAnimating = false
        }
        this.dirty = true
      }
      if (this.dismissAnimating) {
        this.dismiss = damp(this.dismiss, 0, 16, dt)
        if (Math.abs(this.dismiss) < 0.5) {
          this.dismiss = 0
          this.dismissAnimating = false
          this.chromeTarget = 1
        }
        this.dirty = true
      }
      if (this.chromeTimer > 0 && !this.ptrs.size) {
        this.chromeTimer -= dt
        if (this.chromeTimer <= 0 && this.hoverBtn === '') this.chromeTarget = 0
      }
      if (Math.abs(this.chrome - this.chromeTarget) > 0.01) {
        this.chrome = damp(this.chrome, this.chromeTarget, 10, dt)
        this.dirty = true
      }
      for (const d of [-1, 0, 1]) {
        const it = this.items[this.index + d]
        if (it) this.store.request(it, true, d === 0 ? 10 : 5)
      }
    }

    if (this.uploading) this.dirty = true
    if (this.dirty) {
      this.draw()
      this.dirty = false
      this.texture.needsUpdate = true
      return true
    }
    return false
  }

  private requestVisible() {
    const first = Math.max(0, Math.floor((this.scroll - TILE) / (TILE + GAP)) * COLS)
    const last = Math.min(this.items.length, first + COLS * 6)
    for (let i = first; i < last; i++) {
      const it = this.items[i]
      if (it) this.store.request(it, false, -i)
    }
  }

  // ---------------------------------------------------------------- draw

  private px(size: number, weight = '') {
    return `${weight} ${Math.round(size * this.fontScale)}px ${this.font}`
  }

  private draw() {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    if (this.mode === 'off') {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, SW, SH)
      return
    }
    if (this.mode === 'boot') return this.drawBoot()
    this.drawGallery()
    if (this.mode === 'viewer') this.drawViewer()
  }

  private drawBoot() {
    const ctx = this.ctx
    ctx.fillStyle = '#020406'
    ctx.fillRect(0, 0, SW, SH)
    const t = this.bootT
    const lines = [
      'PRECIADO SYSTEMS  BIOS v4.51',
      '',
      `MEMORY TEST ........ ${Math.min(65536, Math.floor(t * 90000))} KB ${t > 0.75 ? 'OK' : ''}`,
      t > 0.9 ? 'VIDEO ............... VGA 1024x768 OK' : '',
      t > 1.15 ? 'DISK C: ............. PHOTOS OK' : '',
      t > 1.45 ? `ALBUM ............... ${this.items.length} IMAGES FOUND` : '',
      '',
      t > 1.8 ? 'C:\\> ALBUM.EXE' : '',
    ]
    ctx.font = this.px(30)
    ctx.textBaseline = 'top'
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? C.accent : C.ink
      ctx.fillText(l, 64, 70 + i * 48)
    })
    if (Math.floor(t * 2.5) % 2 === 0 && t < 2.2) {
      ctx.fillStyle = C.ink
      ctx.fillRect(64 + (t > 1.8 ? 330 : 0), 70 + 8 * 48 + 4, 18, 28)
    }
    if (t > 2.2) {
      const k = clamp((t - 2.2) / 0.8, 0, 1)
      ctx.fillStyle = C.dim
      ctx.fillRect(64, 560, 896, 6)
      ctx.fillStyle = C.accent
      ctx.fillRect(64, 560, 896 * easeInOut(k), 6)
      ctx.fillStyle = C.dim
      ctx.fillText('LOADING', 64, 590)
    }
    // energy logo
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = C.accent
    ctx.lineWidth = 4
    ctx.strokeRect(SW - 190, 62, 120, 76)
    ctx.font = this.px(22)
    ctx.fillStyle = C.accent
    ctx.fillText('PT-97', SW - 170, 88)
    ctx.globalAlpha = 1
  }

  private drawBackground() {
    const ctx = this.ctx
    const g = ctx.createLinearGradient(0, 0, 0, SH)
    g.addColorStop(0, C.bg1)
    g.addColorStop(1, C.bg0)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SW, SH)
    ctx.fillStyle = 'rgba(95,227,255,0.06)'
    for (let y = 12; y < SH; y += 32) for (let x = 12; x < SW; x += 32) ctx.fillRect(x, y, 2, 2)
  }

  private drawGallery() {
    const ctx = this.ctx
    this.drawBackground()
    const n = this.items.length + 1
    const first = Math.max(0, Math.floor((this.scroll - PAD) / (TILE + GAP)) * COLS)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, HEADER, SW, SH - HEADER)
    ctx.clip()
    for (let gi = first; gi < Math.min(n, first + COLS * 5); gi++) {
      const r = this.tileRect(gi)
      if (r.y > SH) break
      if (r.y + r.h < HEADER) continue
      const hot = gi === this.hover || gi === this.focus
      const pressed = gi === this.press
      const s = pressed ? 0.95 : 1
      const x = r.x + (r.w * (1 - s)) / 2
      const y = r.y + (r.h * (1 - s)) / 2
      const w = r.w * s
      if (gi === 0) {
        ctx.fillStyle = hot ? 'rgba(95,227,255,0.16)' : 'rgba(95,227,255,0.06)'
        ctx.fillRect(x, y, w, w)
        ctx.setLineDash([14, 10])
        ctx.strokeStyle = hot ? C.accent : 'rgba(95,227,255,0.55)'
        ctx.lineWidth = 3
        ctx.strokeRect(x + 1.5, y + 1.5, w - 3, w - 3)
        ctx.setLineDash([])
        ctx.fillStyle = hot ? C.accent : C.ink
        ctx.fillRect(x + w / 2 - 26, y + w / 2 - 34, 52, 8)
        ctx.fillRect(x + w / 2 - 4, y + w / 2 - 60, 8, 60)
        ctx.font = this.px(22)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(this.uploading ? `${this.uploading.done}/${this.uploading.total}` : 'ADD PHOTO', x + w / 2, y + w / 2 + 44)
        ctx.textAlign = 'left'
        continue
      }
      const it = this.items[gi - 1]
      if (this.mode === 'viewer' && gi - 1 === this.index && this.open > 0) {
        ctx.fillStyle = '#02060a'
        ctx.fillRect(x, y, w, w)
        continue
      }
      if (it.thumb) {
        ctx.drawImage(it.thumb, x, y, w, w)
      } else {
        ctx.fillStyle = '#0d2236'
        ctx.fillRect(x, y, w, w)
        ctx.fillStyle = it.state === 'error' ? C.warn : C.dim
        ctx.font = this.px(20)
        ctx.textAlign = 'center'
        const dots = '.'.repeat(1 + (Math.floor(this.time * 3) % 3))
        ctx.fillText(it.state === 'error' ? 'NO SIGNAL' : `LOADING${dots}`, x + w / 2, y + w / 2 + 6)
        ctx.textAlign = 'left'
        if (it.state !== 'error') this.dirty = true
      }
      ctx.lineWidth = hot ? 6 : 2
      ctx.strokeStyle = hot ? C.accent : 'rgba(233,244,255,0.14)'
      ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, w - ctx.lineWidth)
    }
    ctx.restore()

    // scrollbar
    const max = this.maxScroll
    if (max > 0) {
      const trackH = SH - HEADER - 24
      const h = Math.max(60, (trackH * (SH - HEADER)) / (SH - HEADER + max))
      const y = HEADER + 12 + (trackH - h) * clamp(this.scroll / max, 0, 1)
      ctx.fillStyle = 'rgba(95,227,255,0.12)'
      ctx.fillRect(SW - 12, HEADER + 12, 5, trackH)
      ctx.fillStyle = 'rgba(95,227,255,0.7)'
      ctx.fillRect(SW - 12, y, 5, h)
    }

    // header
    const g = ctx.createLinearGradient(0, 0, 0, HEADER)
    g.addColorStop(0, '#0f2740')
    g.addColorStop(1, '#0b1d31')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SW, HEADER)
    ctx.fillStyle = C.accent
    ctx.fillRect(0, HEADER - 3, SW, 3)
    ctx.textBaseline = 'middle'
    ctx.font = this.px(30)
    ctx.fillStyle = C.accent
    ctx.fillRect(PAD, HEADER / 2 - 13, 26, 26)
    ctx.fillStyle = C.bg0
    ctx.fillRect(PAD + 6, HEADER / 2 - 7, 14, 14)
    ctx.fillStyle = C.ink
    ctx.fillText('PHOTO ALBUM', PAD + 42, HEADER / 2 + 2)
    const d = new Date()
    const clock = `${String(d.getHours()).padStart(2, '0')}${d.getSeconds() % 2 ? ':' : ' '}${String(d.getMinutes()).padStart(2, '0')}`
    ctx.textAlign = 'right'
    ctx.font = this.px(24)
    ctx.fillStyle = C.dim
    const status = this.uploading ? `UPLOADING ${this.uploading.done}/${this.uploading.total}` : `${this.items.length} PHOTOS`
    ctx.fillText(`${status}   ${clock}`, SW - PAD, HEADER / 2 + 2)
    ctx.textAlign = 'left'

    if (this.items.length === 0) {
      ctx.font = this.px(26)
      ctx.fillStyle = C.dim
      ctx.textAlign = 'center'
      ctx.fillText('NO PHOTOS YET', SW / 2, SH - 180)
      ctx.fillText('TAP  +  OR DROP IMAGES HERE', SW / 2, SH - 130)
      ctx.textAlign = 'left'
    }
  }

  private drawViewer() {
    const ctx = this.ctx
    const it = this.items[this.index]
    if (!it) return
    const o = easeOut(this.open)
    const dismissK = clamp(Math.abs(this.dismiss) / (SH * 0.8), 0, 1)
    ctx.fillStyle = `rgba(0,0,0,${(o * (1 - dismissK * 1.2)).toFixed(3)})`
    ctx.fillRect(0, 0, SW, SH)

    const draw = (item: Item | undefined, offset: number, main: boolean) => {
      if (!item) return
      const pic = item.full ?? item.thumb
      const f = this.fitRect(pic)
      let w = f.w
      let h = f.h
      let cx = SW / 2 + offset
      let cy = SH / 2
      if (main) {
        w *= this.zoom
        h *= this.zoom
        cx += this.panX
        cy += this.panY + this.dismiss
        const ds = 1 - dismissK * 0.35
        w *= ds
        h *= ds
        if (this.open < 1) {
          // grow out of (or shrink back into) the thumbnail
          const r = this.tileRect(this.index + 1)
          const s = Math.max(r.w / w, r.h / h)
          const tw = w * s
          const th = h * s
          cx = r.x + r.w / 2 + (cx - r.x - r.w / 2) * o
          cy = r.y + r.h / 2 + (cy - r.y - r.h / 2) * o
          w = tw + (w - tw) * o
          h = th + (h - th) * o
          ctx.save()
          // crop to a square that relaxes into the full frame
          const cw = r.w + (w - r.w) * o
          const ch = r.h + (h - r.h) * o
          ctx.beginPath()
          ctx.rect(cx - cw / 2, cy - ch / 2, cw, ch)
          ctx.clip()
        }
      }
      if (pic) {
        ctx.drawImage(pic, cx - w / 2, cy - h / 2, w, h)
      } else {
        ctx.fillStyle = C.dim
        ctx.font = this.px(26)
        ctx.textAlign = 'center'
        ctx.fillText(item.state === 'error' ? 'NO SIGNAL' : 'LOADING...', cx, cy)
        ctx.textAlign = 'left'
      }
      if (main && this.open < 1) ctx.restore()
    }
    const pageW = SW + PAGE_GAP
    if (this.slide > 0 || this.slideTarget > 0) draw(this.items[this.index - 1], this.slide - pageW, false)
    if (this.slide < 0 || this.slideTarget < 0) draw(this.items[this.index + 1], this.slide + pageW, false)
    draw(it, this.slide, true)
    if (!it.full && it.fullState === 'loading') this.dirty = true

    // chrome
    const a = this.chrome * o * (1 - dismissK)
    if (a > 0.01) {
      ctx.globalAlpha = a
      const g = ctx.createLinearGradient(0, 0, 0, 110)
      g.addColorStop(0, 'rgba(2,8,16,0.85)')
      g.addColorStop(1, 'rgba(2,8,16,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, SW, 110)
      ctx.font = this.px(28)
      ctx.textBaseline = 'middle'
      ctx.fillStyle = this.hoverBtn === 'back' ? C.accent : C.ink
      ctx.fillText('< BACK', PAD, 40)
      ctx.textAlign = 'center'
      ctx.fillStyle = C.dim
      ctx.fillText(`${this.index + 1} / ${this.items.length}`, SW / 2, 40)
      ctx.textAlign = 'right'
      ctx.fillStyle = this.hoverBtn === 'save' ? C.accent : C.ink
      ctx.fillText('SAVE', SW - PAD, 40)
      ctx.textAlign = 'left'
      if (this.zoom > 1.05) {
        ctx.fillStyle = 'rgba(2,8,16,0.7)'
        ctx.fillRect(SW / 2 - 60, SH - 64, 120, 40)
        ctx.fillStyle = C.accent
        ctx.textAlign = 'center'
        ctx.fillText(`${this.zoom.toFixed(1)}x`, SW / 2, SH - 44)
        ctx.textAlign = 'left'
      }
      ctx.globalAlpha = 1
    }
    // hover arrows for mouse users
    if (this.hoverBtn === 'prev' || this.hoverBtn === 'next') {
      const left = this.hoverBtn === 'prev'
      const x = left ? 56 : SW - 56
      const can = left ? this.index > 0 : this.index < this.items.length - 1
      ctx.globalAlpha = can ? 0.9 : 0.25
      ctx.fillStyle = 'rgba(2,8,16,0.6)'
      ctx.beginPath()
      ctx.arc(x, SH / 2, 34, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 6
      ctx.beginPath()
      const d = left ? 1 : -1
      ctx.moveTo(x + d * 8, SH / 2 - 16)
      ctx.lineTo(x - d * 8, SH / 2)
      ctx.lineTo(x + d * 8, SH / 2 + 16)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

}
