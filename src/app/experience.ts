import {
  ACESFilmicToneMapping,
  BackSide,
  BoxGeometry,
  Color,
  DepthTexture,
  HalfFloatType,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type MeshPhysicalMaterial,
  type Texture,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { Baker } from '../core/bake'
import { installPCSS } from '../core/pcss'
import { FinalPass, VolumetricPass } from '../core/post'
import { TIERS, initialTier, isTouch, pinnedTier, reducedMotion, type QualitySettings, type Tier } from '../core/quality'
import { PlanarReflection } from '../core/reflector'
import { CameraRig } from '../core/rig'
import { createMonitor } from '../scene/monitor'
import { Polaroids, createFloppies, createKeyboard, createMug, createPencil, keyboardCable } from '../scene/props'
import { LAMP_COLOR, createDesk, createDust, createLamp, createWalls } from '../scene/room'
import { BRUSHED, ENAMEL, PLASTER, PLASTIC, WALNUT } from '../scene/surfaces'
import { ImageStore } from '../screen/images'
import { ScreenOS } from '../screen/os'
import { Input } from './input'
import { sfx } from './sound'

// ?capture lets slow software renderers (screenshots, CI) advance real time.
const LAMP_INTENSITY = 11
const MAX_DT = new URLSearchParams(location.search).has('capture') ? 0.6 : 0.05

export interface ExperienceHooks {
  progress(p: number): void
  view(v: 'room' | 'screen'): void
  mode(m: string): void
  upload(): void
  save(url: string): void
  contextLost(): void
}

/** Dark-room environment for reflections: a warm lamp overhead, a dim door-crack behind the viewer. */
function buildEnvironment(renderer: WebGLRenderer): Texture {
  const env = new Scene()
  env.add(new Mesh(new SphereGeometry(10, 32, 16), new MeshBasicMaterial({ color: new Color(0.004, 0.0045, 0.006), side: BackSide })))
  const lamp = new Mesh(new SphereGeometry(0.9, 24, 12), new MeshBasicMaterial({ color: LAMP_COLOR.clone().multiplyScalar(24) }))
  lamp.position.set(0, 8, 0.6)
  const bounce = new Mesh(new PlaneGeometry(9, 9), new MeshBasicMaterial({ color: new Color(0.05, 0.03, 0.018) }))
  bounce.rotation.x = -Math.PI / 2
  bounce.position.y = -3
  const door = new Mesh(new BoxGeometry(1.2, 6, 0.1), new MeshBasicMaterial({ color: new Color(0.22, 0.28, 0.4) }))
  door.position.set(-3.5, 1, 9)
  const screenGlow = new Mesh(new PlaneGeometry(3, 2.2), new MeshBasicMaterial({ color: new Color(0.08, 0.14, 0.22) }))
  screenGlow.position.set(0, 0, -9.5)
  env.add(lamp, bounce, door, screenGlow)
  const pm = new PMREMGenerator(renderer)
  const tex = pm.fromScene(env, 0.02).texture
  pm.dispose()
  return tex
}

export class Experience {
  readonly renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(34, 1, 0.02, 30)
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  private volumetric!: VolumetricPass
  private final!: FinalPass
  private reflection!: PlanarReflection
  private rig!: CameraRig
  private input!: Input
  private q: QualitySettings
  readonly store = new ImageStore()
  os!: ScreenOS
  private monitor!: ReturnType<typeof createMonitor>
  private lamp!: ReturnType<typeof createLamp>
  private dust!: ReturnType<typeof createDust>
  private polaroids = new Polaroids()
  private clock = 0
  private last = 0
  private raf = 0
  private power = 0
  private powerTarget = 0
  private lampLevel = 0
  private lampTarget = 0
  private lampFlicker = 0
  private glowColor = new Color(0.6, 0.75, 1)
  private lumaCanvas = document.createElement('canvas')
  private lumaCtx: CanvasRenderingContext2D
  private frame = 0
  private frameTimes: number[] = []
  private reduced = reducedMotion()
  private polaroidKey = ''
  private visible = true

  constructor(
    private host: HTMLElement,
    private hooks: ExperienceHooks,
  ) {
    this.q = TIERS[initialTier()]
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.q.maxDpr))
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = this.q.pcssSamples > 0 ? PCFShadowMap : PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.domElement.className = 'gl'
    this.renderer.domElement.setAttribute('aria-label', 'A CRT monitor on a desk in a dark room. Tap the screen to use the photo album.')
    this.renderer.domElement.setAttribute('role', 'img')
    host.prepend(this.renderer.domElement)
    this.lumaCanvas.width = 8
    this.lumaCanvas.height = 6
    this.lumaCtx = this.lumaCanvas.getContext('2d', { willReadFrequently: true })!
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      cancelAnimationFrame(this.raf)
      hooks.contextLost()
    })
    document.addEventListener('visibilitychange', () => {
      this.visible = document.visibilityState === 'visible'
      if (this.visible) this.last = performance.now()
    })
  }

  /** Build everything, yielding between steps so the loader can animate. */
  async init() {
    const tick = () => new Promise((r) => requestAnimationFrame(() => r(null)))
    const q = this.q
    installPCSS(q.pcssSamples, 0.08, 2.2, 0.085)
    RectAreaLightUniformsLib.init()
    this.hooks.progress(0.1)
    await tick()

    const r = this.renderer
    this.scene.background = new Color(0, 0, 0)
    this.scene.environment = buildEnvironment(r)
    this.scene.environmentIntensity = 0.55
    this.hooks.progress(0.2)
    await tick()

    const baker = new Baker(r)
    const s = q.bakeSize
    const wood = baker.set(WALNUT, s, s / 2, 5)
    this.hooks.progress(0.35)
    await tick()
    const plastic = baker.set(PLASTIC, s / 2, s / 2, 3)
    const plaster = baker.set(PLASTER, s / 2, s / 2, 5)
    this.hooks.progress(0.5)
    await tick()
    const brushed = baker.set(BRUSHED, 256, 256, 2)
    const enamel = baker.set(ENAMEL, 256, 256, 2)
    for (const t of Object.values(plastic)) t.repeat.set(1, 1)
    baker.dispose()
    this.hooks.progress(0.6)
    await tick()

    // --- scene
    const desk = createDesk(wood)
    this.scene.add(desk.group)
    this.scene.add(createWalls(plaster))
    this.monitor = createMonitor(plastic, 0.8)
    this.scene.add(this.monitor.group)
    this.lamp = createLamp(enamel, q.shadowMapSize)
    this.scene.add(this.lamp.group)
    this.dust = createDust(this.reduced ? Math.round(q.dust / 3) : q.dust)
    this.scene.add(this.dust.points)
    const hemi = new HemisphereLight('#1a2233', '#0a0604', 0.25)
    this.scene.add(hemi)

    const kb = createKeyboard(plastic)
    kb.position.set(0.0, 0, 0.245)
    const mug = createMug()
    mug.position.set(0.43, 0, 0.1)
    const floppies = createFloppies(brushed)
    floppies.position.set(-0.37, 0, 0.02)
    floppies.rotation.y = 0.35
    const pencil = createPencil()
    pencil.position.set(0.31, 0, 0.3)
    pencil.rotation.y = 0.5
    this.scene.add(kb, mug, floppies, pencil, keyboardCable(), this.polaroids.group)
    this.hooks.progress(0.72)
    await tick()

    // --- screen software
    this.os = new ScreenOS(this.store, {
      upload: () => this.hooks.upload(),
      save: (url) => this.hooks.save(url),
      exit: () => this.setView('room'),
      mode: (m) => this.hooks.mode(m),
      sound: (n) => sfx[n](),
    })
    this.monitor.screenMaterial.uniforms.tScreen.value = this.os.texture
    this.store.onChange = ((prev) => () => {
      prev()
      this.syncPolaroids()
    })(this.store.onChange)

    // --- reflection
    this.reflection = new PlanarReflection(r, desk.top, 256, 256)
    this.reflection.every = q.reflectionEvery
    this.reflection.apply(desk.top.material as MeshPhysicalMaterial, 1.6)

    // --- camera + input
    this.rig = new CameraRig(this.camera, this.monitor.screenCenter, this.monitor.screenSize)
    this.rig.instant = this.reduced
    this.input = new Input(r.domElement, this.camera, this.rig, this.monitor.screen, this.os, {
      focusScreen: () => this.setView('screen'),
      leaveScreen: () => this.setView('room'),
      interacted: () => {},
    })

    this.buildComposer()
    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.hooks.progress(0.85)
    await tick()

    // Shadows are static: render once, then only on demand.
    r.shadowMap.needsUpdate = true
    // Pre-compile every material so the first real frame doesn't hitch.
    this.rig.intro()
    this.rig.update(0)
    await r.compileAsync(this.scene, this.camera)
    this.render(0)
    this.hooks.progress(1)
  }

  private buildComposer() {
    const r = this.renderer
    const size = r.getDrawingBufferSize(new Vector2())
    const halfFloat = r.extensions.has('EXT_color_buffer_half_float') || r.extensions.has('EXT_color_buffer_float')
    const rt = new WebGLRenderTarget(size.x, size.y, {
      type: halfFloat ? HalfFloatType : UnsignedByteType,
      samples: this.q.msaa,
      depthTexture: new DepthTexture(size.x, size.y),
    })
    this.composer = new EffectComposer(r, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.volumetric = new VolumetricPass(this.camera, this.lamp.spot, this.q.tier === 'high' ? 32 : this.q.tier === 'medium' ? 20 : 12)
    this.composer.addPass(this.volumetric)
    this.bloom = new UnrealBloomPass(new Vector2(size.x * this.q.bloomScale, size.y * this.q.bloomScale), 0.5, 0.55, 1.4)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.final = new FinalPass()
    this.composer.addPass(this.final)
  }

  private resize() {
    const w = this.host.clientWidth || innerWidth
    const h = this.host.clientHeight || innerHeight
    const dpr = Math.min(devicePixelRatio, this.q.maxDpr)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.8 ? 44 : 34
    this.camera.updateProjectionMatrix()
    if (this.rig?.view === 'room') this.rig.roomFraming()
    if (!this.composer) return
    this.composer.setPixelRatio(dpr)
    this.composer.setSize(w, h)
    this.bloom.resolution.set(w * dpr * this.q.bloomScale, h * dpr * this.q.bloomScale)
    this.final.setSize(w * dpr, h * dpr)
    this.reflection.setSize(w * dpr * this.q.reflectionScale, h * dpr * this.q.reflectionScale)
    this.dust.material.uniforms.uScale.value = (h * dpr * this.camera.projectionMatrix.elements[5]) / 2
  }

  private setTier(t: Tier) {
    if (t === this.q.tier) return
    this.q = TIERS[t]
    this.reflection.every = this.q.reflectionEvery
    this.resize()
  }

  setView(v: 'room' | 'screen') {
    if (!this.rig || this.rig.view === v) return
    if (v === 'screen' && this.os.mode === 'off') return
    this.rig.setView(v)
    if (v === 'room') this.os.clearHover()
    sfx.whoosh()
    this.hooks.view(v)
  }

  get view() {
    return this.rig?.view ?? 'room'
  }

  /** Cinematic start: lamp flickers on, the camera settles, then the tube warms up. */
  async powerUp() {
    this.last = performance.now()
    this.loop()
    this.rig.setView('room')
    this.input.enabled = true
    const wait = (ms: number) => new Promise((r) => setTimeout(r, this.reduced ? 0 : ms))
    await wait(250)
    sfx.lampOn()
    this.lampTarget = 1
    this.lampFlicker = this.reduced ? 0 : 1
    await wait(1500)
    sfx.powerOn()
    this.powerTarget = 1
    this.monitor.led.emissiveIntensity = 6
    this.os.boot()
  }

  private syncPolaroids() {
    const pics = this.store.items.slice(0, 3)
    const key = pics.map((p) => (p.thumb ? p.url : '')).join('|')
    if (key === this.polaroidKey) return
    this.polaroidKey = key
    this.polaroids.set(pics.map((p) => p.thumb).filter((p) => !!p))
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    if (!this.visible) return
    const now = performance.now()
    const dt = Math.min(MAX_DT, (now - this.last) / 1000)
    this.last = now
    this.render(dt)
    this.adapt(now)
  }

  /** Step quality down if the device can't hold ~45 fps. */
  private adapt(now: number) {
    if (pinnedTier() || this.clock < 4) return
    this.frameTimes.push(now)
    while (this.frameTimes.length && now - this.frameTimes[0] > 2000) this.frameTimes.shift()
    if (this.frameTimes.length < 20 || this.frame % 60 !== 0) return
    const fps = (this.frameTimes.length - 1) / ((now - this.frameTimes[0]) / 1000)
    if (fps < 40) {
      if (this.q.tier === 'high') this.setTier('medium')
      else if (this.q.tier === 'medium') this.setTier('low')
      this.frameTimes = []
    }
  }

  private render(dt: number) {
    this.clock += dt
    this.frame++
    const u = this.monitor.screenMaterial.uniforms

    // Lamp: filament flicker on the way up, then steady.
    this.lampLevel += (this.lampTarget - this.lampLevel) * (1 - Math.exp(-dt * 5))
    let lamp = this.lampLevel
    if (this.lampFlicker > 0) {
      this.lampFlicker = Math.max(0, this.lampFlicker - dt * 0.9)
      const f = this.lampFlicker
      lamp *= f > 0.75 ? (Math.sin(this.clock * 90) > 0.2 ? 1 : 0.05) : f > 0.55 ? 0.35 + 0.65 * Math.abs(Math.sin(this.clock * 40)) : 1 - f * 0.2
    }
    this.lamp.spot.intensity = LAMP_INTENSITY * lamp
    ;(this.lamp.bulb.material as { emissiveIntensity: number }).emissiveIntensity = 60 * lamp
    this.dust.material.uniforms.uOn.value = lamp * (1 - this.rig.screenness * 0.85)
    this.dust.material.uniforms.uTime.value = this.reduced ? 0 : this.clock

    // Tube power + picture
    const pRate = this.powerTarget > this.power ? 0.55 : 2.5
    this.power = this.reduced ? this.powerTarget : Math.min(1, Math.max(0, this.power + Math.sign(this.powerTarget - this.power) * dt * pRate))
    u.uPower.value = this.power
    u.uTime.value = this.clock
    u.uJitter.value = this.reduced ? 0 : 1
    this.os.update(dt)
    // drive activity LED flickers while photos are being written
    if (this.power > 0.5) this.monitor.led.emissiveIntensity = this.os.uploading && Math.random() < 0.5 ? 1.5 : 6
    this.rig.update(dt)

    // Light the tube throws into the room follows the picture.
    if (this.frame % 6 === 0 && this.power > 0.3) {
      try {
        this.lumaCtx.drawImage(this.os.canvas, 0, 0, 8, 6)
        const d = this.lumaCtx.getImageData(0, 0, 8, 6).data
        let rr = 0
        let gg = 0
        let bb = 0
        for (let i = 0; i < d.length; i += 4) {
          rr += d[i]
          gg += d[i + 1]
          bb += d[i + 2]
        }
        const n = (d.length / 4) * 255
        this.glowColor.setRGB(rr / n, gg / n, bb / n).convertSRGBToLinear()
      } catch {
        /* tainted canvas - keep last colour */
      }
    }
    const g = this.monitor.glow
    const lum = this.glowColor.r * 0.3 + this.glowColor.g * 0.6 + this.glowColor.b * 0.1
    g.color.lerp(this.glowColor.clone().multiplyScalar(1 / Math.max(0.05, lum)), 0.15)
    g.intensity += (Math.min(1, this.power) * (6 + lum * 55) - g.intensity) * 0.2

    // Screen view: pull back the vignette and grain so the photo reads clean.
    const sv = this.rig.screenness
    this.final.material.uniforms.uTime.value = this.clock
    this.final.material.uniforms.uVignette.value = 1 - sv * 0.55
    this.final.material.uniforms.uGrain.value = (isTouch ? 0.035 : 0.045) * (1 - sv * 0.5)
    this.volumetric.material.uniforms.uTime.value = this.clock
    this.volumetric.material.uniforms.uDensity.value = 0.008 * (1 - sv * 0.6)
    this.bloom.strength = 0.5 - sv * 0.25
    // Up close the tube is a photo viewer: keep it inside the tone curve's linear range.
    u.uBrightness.value = 1.8 - sv * 0.62

    this.camera.updateMatrixWorld()
    this.reflection.update(this.scene, this.camera)
    this.composer.render(dt)
  }

  async exportPhoto(url: string) {
    const { exportCRT } = await import('./export')
    await exportCRT(this.renderer, url)
  }
}
