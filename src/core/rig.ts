import { MathUtils, PerspectiveCamera, Vector3 } from 'three'

/**
 * Camera rig in spherical coordinates around a target. Every parameter
 * eases toward a goal with frame-rate independent damping, so flying from
 * the room to the screen traces a smooth arc instead of a straight dolly,
 * and user drags carry a little inertia.
 */
export type View = 'room' | 'screen'

const damp = (a: number, b: number, k: number, dt: number) => b + (a - b) * Math.exp(-k * dt)

export class CameraRig {
  view: View = 'room'
  readonly target = new Vector3()
  yaw = 0.9
  pitch = 0.5
  dist = 3
  private goal = { target: new Vector3(0, 0.19, -0.04), yaw: 0.42, pitch: 0.2, zoom: 1 }
  private velYaw = 0
  private velPitch = 0
  private idle = 0
  private t = 0
  private speed = 2.2
  private screenCenter: Vector3
  private screenSize: { x: number; y: number }
  instant = false

  constructor(
    readonly camera: PerspectiveCamera,
    screenCenter: Vector3,
    screenSize: { x: number; y: number },
  ) {
    this.screenCenter = screenCenter.clone()
    this.screenSize = screenSize
    this.target.set(0, 0.35, -0.06)
  }

  private fitDistance(w: number, h: number) {
    const v = MathUtils.degToRad(this.camera.fov) / 2
    const hfov = Math.atan(Math.tan(v) * this.camera.aspect)
    return Math.max(w / 2 / Math.tan(hfov), h / 2 / Math.tan(v))
  }

  private roomDist() {
    const portrait = this.camera.aspect < 1
    return this.fitDistance(portrait ? 0.7 : 1.2, 0.7) * this.goal.zoom
  }

  private screenDist() {
    const portrait = this.camera.aspect < 0.8
    return this.fitDistance(this.screenSize.x * (portrait ? 1.04 : 1.22), this.screenSize.y * 1.32)
  }

  setView(view: View) {
    this.view = view
    this.idle = 0
    this.speed = view === 'screen' ? 2.6 : 2.1
    if (view === 'screen') {
      this.goal.target.copy(this.screenCenter)
      this.goal.yaw = 0
      this.goal.pitch = 0.035
    } else {
      this.roomFraming()
      this.goal.yaw = this.yaw > 0.05 || this.yaw < -0.05 ? this.yaw : 0.42
      this.goal.zoom = 1
    }
  }

  /** Portrait screens frame taller: keep the lamp shade in the top of the shot. */
  roomFraming() {
    const portrait = this.camera.aspect < 0.8
    this.goal.target.set(0, portrait ? 0.31 : 0.19, -0.04)
    this.goal.pitch = portrait ? 0.14 : 0.2
  }

  /** Start the intro flight from far and high. */
  intro() {
    this.yaw = 0.75
    this.pitch = 0.62
    this.dist = this.roomDist() * 1.9
    this.target.set(0, 0.35, -0.06)
    this.roomFraming()
    this.speed = 0.9
  }

  orbit(dx: number, dy: number) {
    if (this.view !== 'room') return
    this.idle = 0
    this.velYaw = -dx * 0.0055
    this.velPitch = dy * 0.004
    this.goal.yaw = MathUtils.clamp(this.goal.yaw - dx * 0.0055, -1.0, 1.0)
    this.goal.pitch = MathUtils.clamp(this.goal.pitch + dy * 0.004, 0.02, 0.62)
  }

  release() {
    this.goal.yaw = MathUtils.clamp(this.goal.yaw + this.velYaw * 6, -1.0, 1.0)
    this.goal.pitch = MathUtils.clamp(this.goal.pitch + this.velPitch * 6, 0.02, 0.62)
    this.velYaw = this.velPitch = 0
  }

  /** Multiplicative dolly. Returns true when pushed in past the minimum (enter screen). */
  zoomBy(factor: number): boolean {
    if (this.view !== 'room') return false
    this.idle = 0
    const z = this.goal.zoom * factor
    this.goal.zoom = MathUtils.clamp(z, 0.55, 1.8)
    return z < 0.5
  }

  update(dt: number) {
    this.t += dt
    this.idle += dt
    const k = this.instant ? 1000 : this.speed
    // Gently accelerate intro/transition flights toward normal responsiveness.
    this.speed = damp(this.speed, this.view === 'screen' ? 5 : 4, 0.6, dt)
    let yawGoal = this.goal.yaw
    let pitchGoal = this.goal.pitch
    if (this.view === 'room' && this.idle > 5) {
      // slow, breathing drift when nobody is touching anything
      const a = Math.min(1, (this.idle - 5) / 4)
      yawGoal += Math.sin(this.t * 0.11) * 0.09 * a
      pitchGoal += Math.sin(this.t * 0.07 + 1) * 0.03 * a
    }
    const distGoal = this.view === 'screen' ? this.screenDist() : this.roomDist()
    this.yaw = damp(this.yaw, yawGoal, k, dt)
    this.pitch = damp(this.pitch, pitchGoal, k, dt)
    this.dist = damp(this.dist, distGoal, k * 0.85, dt)
    this.target.x = damp(this.target.x, this.goal.target.x, k, dt)
    this.target.y = damp(this.target.y, this.goal.target.y, k, dt)
    this.target.z = damp(this.target.z, this.goal.target.z, k, dt)

    const cp = Math.cos(this.pitch)
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    )
    this.camera.lookAt(this.target)
  }

  /** 0 in the room, 1 when settled in front of the screen. */
  get screenness() {
    const d = this.screenDist()
    return MathUtils.clamp(1 - (this.dist - d) / (d * 1.2), 0, 1) * (this.view === 'screen' ? 1 : 0.999)
  }
}
