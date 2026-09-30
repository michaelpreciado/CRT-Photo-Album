import { Matrix4, Ray, Vector2, Vector3, type Mesh, type PerspectiveCamera } from 'three'
import type { CameraRig } from '../core/rig'
import { SH, SW, type ScreenOS } from '../screen/os'
import { SCREEN_H, SCREEN_W } from '../scene/monitor'

/**
 * Routes pointer, wheel and keyboard input either to the camera (room view)
 * or to the software on the tube (screen view).
 *
 * Pointers are mapped onto the screen by intersecting the view ray with the
 * faceplate plane and running the same barrel mapping as the CRT shader, so
 * a finger lands exactly on the pixel under it and drags keep tracking even
 * when they slide off the glass.
 */
export interface InputHooks {
  focusScreen(): void
  leaveScreen(): void
  interacted(): void
}

interface RoomPtr {
  x: number
  y: number
  sx: number
  sy: number
  t: number
}

export class Input {
  private room = new Map<number, RoomPtr>()
  private os = new Set<number>()
  private pinchD = 0
  private ray = new Ray()
  private inv = new Matrix4()
  private ndc = new Vector2()
  private hit = new Vector3()
  private wheelOut = 0
  inset = 0.94
  curve = 0.07
  enabled = false

  constructor(
    private el: HTMLElement,
    private camera: PerspectiveCamera,
    private rig: CameraRig,
    private screen: Mesh,
    private screenOS: ScreenOS,
    private hooks: InputHooks,
  ) {
    el.addEventListener('pointerdown', this.down)
    window.addEventListener('pointermove', this.move, { passive: true })
    window.addEventListener('pointerup', this.up)
    window.addEventListener('pointercancel', this.cancel)
    el.addEventListener('pointerleave', () => this.screenOS.clearHover())
    el.addEventListener('wheel', this.wheel, { passive: false })
    window.addEventListener('keydown', this.key)
    // stop iOS page zoom on double-tap / pinch over the canvas
    el.addEventListener('gesturestart', (e) => e.preventDefault())
  }

  /** Canvas pixel -> OS coordinates (may be outside 0..SW / 0..SH). */
  private toScreen(clientX: number, clientY: number) {
    const r = this.el.getBoundingClientRect()
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.ray.origin.setFromMatrixPosition(this.camera.matrixWorld)
    this.ray.direction.set(this.ndc.x, this.ndc.y, 0.5).unproject(this.camera).sub(this.ray.origin).normalize()
    this.inv.copy(this.screen.matrixWorld).invert()
    this.ray.applyMatrix4(this.inv)
    // faceplate plane (between bulge crest and edge)
    const z = -0.021 + 0.011 * 0.75
    const dz = this.ray.direction.z
    if (Math.abs(dz) < 1e-5) return null
    const t = (z - this.ray.origin.z) / dz
    if (t < 0) return null
    this.ray.at(t, this.hit)
    let u = this.hit.x / SCREEN_W + 0.5
    let v = this.hit.y / SCREEN_H + 0.5
    // same mapping as crtColor(): inset then barrel
    u = (u - 0.5) / this.inset + 0.5
    v = (v - 0.5) / this.inset + 0.5
    const cx = u - 0.5
    const cy = v - 0.5
    const k = (1 + this.curve * (cx * cx + cy * cy) * 4) / (1 + this.curve)
    u = 0.5 + cx * k
    v = 0.5 + cy * k
    return { x: u * SW, y: (1 - v) * SH }
  }

  private onGlass(p: { x: number; y: number } | null, margin = 0) {
    return !!p && p.x >= -margin && p.x <= SW + margin && p.y >= -margin && p.y <= SH + margin
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return
    this.hooks.interacted()
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic or already-released pointer */
    }
    const p = this.toScreen(e.clientX, e.clientY)
    if (this.rig.view === 'screen' && (this.onGlass(p, 30) || this.os.size > 0) && this.screenOS.mode !== 'boot') {
      this.os.add(e.pointerId)
      this.screenOS.pointerDown(e.pointerId, p!.x, p!.y, e.pointerType === 'mouse', e.timeStamp)
      return
    }
    this.room.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp })
    if (this.room.size === 2) {
      const [a, b] = [...this.room.values()]
      this.pinchD = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  private move = (e: PointerEvent) => {
    if (!this.enabled) return
    if (this.os.has(e.pointerId)) {
      const p = this.toScreen(e.clientX, e.clientY)
      if (p) this.screenOS.pointerMove(e.pointerId, p.x, p.y, e.timeStamp)
      return
    }
    const r = this.room.get(e.pointerId)
    if (!r) {
      // hover (mouse only)
      if (e.pointerType !== 'mouse' || e.target !== this.el) return
      const p = this.toScreen(e.clientX, e.clientY)
      const over = this.onGlass(p)
      if (this.rig.view === 'screen' && over) {
        this.screenOS.pointerMove(-1, p!.x, p!.y, e.timeStamp)
        this.el.style.cursor = this.screenOS.clickable(p!.x, p!.y) ? 'pointer' : 'default'
      } else {
        this.screenOS.clearHover()
        this.el.style.cursor = over ? 'zoom-in' : this.rig.view === 'room' ? 'grab' : 'zoom-out'
      }
      return
    }
    const dx = e.clientX - r.x
    const dy = e.clientY - r.y
    r.x = e.clientX
    r.y = e.clientY
    if (this.room.size === 1) {
      this.rig.orbit(dx, dy)
      if (e.pointerType === 'mouse') this.el.style.cursor = 'grabbing'
    } else if (this.room.size === 2) {
      const [a, b] = [...this.room.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (this.pinchD > 0 && this.rig.zoomBy(this.pinchD / d)) this.enterFromZoom()
      this.pinchD = d
    }
  }

  private up = (e: PointerEvent) => {
    if (this.os.has(e.pointerId)) {
      this.os.delete(e.pointerId)
      const p = this.toScreen(e.clientX, e.clientY)
      if (p) this.screenOS.pointerUp(e.pointerId, p.x, p.y, e.timeStamp)
      else this.screenOS.pointerCancel(e.pointerId)
      return
    }
    const r = this.room.get(e.pointerId)
    if (!r) return
    this.room.delete(e.pointerId)
    const tap = Math.hypot(e.clientX - r.sx, e.clientY - r.sy) < 10 && e.timeStamp - r.t < 500
    if (this.room.size === 0) this.rig.release()
    if (e.pointerType === 'mouse') this.el.style.cursor = 'grab'
    if (!tap || this.room.size > 0) return
    const p = this.toScreen(e.clientX, e.clientY)
    if (this.rig.view === 'room' && this.onGlass(p, 60)) this.hooks.focusScreen()
    else if (this.rig.view === 'screen' && !this.onGlass(p, 30)) this.hooks.leaveScreen()
  }

  private cancel = (e: PointerEvent) => {
    if (this.os.delete(e.pointerId)) this.screenOS.pointerCancel(e.pointerId)
    this.room.delete(e.pointerId)
  }

  private enterFromZoom() {
    this.room.clear()
    this.hooks.focusScreen()
  }

  private wheel = (e: WheelEvent) => {
    if (!this.enabled) return
    e.preventDefault()
    this.hooks.interacted()
    const scale = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1
    const dx = e.deltaX * scale
    const dy = e.deltaY * scale
    const p = this.toScreen(e.clientX, e.clientY)
    if (this.rig.view === 'screen') {
      if (this.onGlass(p) && !(this.screenOS.mode === 'gallery' && e.ctrlKey && dy > 0)) {
        this.screenOS.wheel(dx, dy, p!.x, p!.y, e.ctrlKey)
        this.wheelOut = 0
      } else if (dy > 0) {
        this.wheelOut += dy
        if (this.wheelOut > 120) {
          this.wheelOut = 0
          this.hooks.leaveScreen()
        }
      }
      return
    }
    const factor = Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0012))
    if (this.rig.zoomBy(factor)) this.enterFromZoom()
  }

  private key = (e: KeyboardEvent) => {
    if (!this.enabled) return
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON' || t.tagName === 'TEXTAREA') && e.key !== 'Escape') return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    this.hooks.interacted()
    if (this.rig.view === 'screen') {
      if (this.screenOS.key(e.key)) {
        e.preventDefault()
        return
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        this.hooks.leaveScreen()
      }
      return
    }
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        this.hooks.focusScreen()
        break
      case 'ArrowLeft':
        this.rig.orbit(40, 0)
        break
      case 'ArrowRight':
        this.rig.orbit(-40, 0)
        break
      case 'ArrowUp':
        this.rig.orbit(0, 30)
        break
      case 'ArrowDown':
        this.rig.orbit(0, -30)
        break
    }
  }
}
