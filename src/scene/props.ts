import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

interface Maps {
  map: Texture
  normalMap: Texture
  roughnessMap: Texture
}

const shadow = <T extends Object3D>(o: T) => {
  o.traverse((c) => {
    c.castShadow = true
    c.receiveShadow = true
  })
  return o
}

/** Full-size 90s keyboard: beige case, instanced sculpted keycaps. */
export function createKeyboard(plastic: Maps) {
  const group = new Group()
  const caseMat = new MeshStandardMaterial({ ...plastic, color: '#c9bea2', roughness: 1, normalScale: new Vector2(0.08, 0.08) })
  const base = new Mesh(new RoundedBoxGeometry(0.455, 0.024, 0.17, 4, 0.007), caseMat)
  base.position.y = 0.012
  group.add(base)
  const well = new Mesh(new BoxGeometry(0.43, 0.004, 0.128), new MeshStandardMaterial({ color: '#57503f', roughness: 0.8 }))
  well.position.set(0, 0.0235, 0.012)
  group.add(well)

  const u = 0.0188
  type Key = [number, number, number, boolean] // x (u), row, width (u), modifier
  const keys: Key[] = []
  const row = (y: number, x0: number, spec: [number, boolean?][], gap = 0) => {
    let x = x0
    for (const [w, mod] of spec) {
      keys.push([x + w / 2, y, w, !!mod])
      x += w + gap
    }
  }
  const n = (count: number, w = 1, mod = false) => Array.from({ length: count }, () => [w, mod] as [number, boolean])
  // Function row with its classic gaps
  row(0, 0, [[1, true]])
  row(0, 2, n(4, 1, true))
  row(0, 6.5, n(4, 1, true))
  row(0, 11, n(4, 1, true))
  row(1.25, 0, [...n(13), [2, true]])
  row(2.25, 0, [[1.5, true], ...n(12), [1.5]])
  row(3.25, 0, [[1.75, true], ...n(11), [2.25, true]])
  row(4.25, 0, [[2.25, true], ...n(10), [2.75, true]])
  row(5.25, 0, [[1.5, true], [1.5, true], [7], [1.5, true], [1.5, true]])
  // Navigation cluster + arrows
  for (let r = 0; r < 2; r++) row(1.25 + r, 15.25, n(3, 1, true))
  row(4.25, 16.25, [[1, true]])
  row(5.25, 15.25, n(3, 1, true))
  // Numpad
  for (let r = 0; r < 4; r++) row(1.25 + r, 18.5, n(r === 0 ? 4 : 3, 1, r === 0))
  row(5.25, 18.5, [[2], [1]])

  const capGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.14)
  // Taper the top of each cap for a sculpted look.
  const p = capGeo.attributes.position
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.84)
      p.setZ(i, p.getZ(i) * 0.8)
    }
  }
  capGeo.computeVertexNormals()
  const capMat = new MeshStandardMaterial({ ...plastic, color: '#d3c8ae', roughness: 1, normalScale: new Vector2(0.08, 0.08) })
  const caps = new InstancedMesh(capGeo, capMat, keys.length)
  const o = new Object3D()
  const light = new Color('#ffffff')
  const dark = new Color('#b4ab96')
  const totalW = 22.5
  keys.forEach(([x, y, w, mod], i) => {
    o.position.set((x - totalW / 2) * u, 0.031, (y - 3.1) * u * 0.98 + 0.012)
    o.scale.set(w * u - 0.0026, 0.011, u - 0.0026)
    // each row sits at its own angle (cylindrical profile)
    o.rotation.set((y - 3) * -0.03, 0, 0)
    o.updateMatrix()
    caps.setMatrixAt(i, o.matrix)
    caps.setColorAt(i, mod ? dark : light)
  })
  group.add(caps)
  // Three status LEDs
  for (let i = 0; i < 3; i++) {
    const l = new Mesh(new BoxGeometry(0.004, 0.001, 0.0025), new MeshStandardMaterial({ color: '#111', emissive: '#3dff6a', emissiveIntensity: i === 0 ? 3 : 0 }))
    l.position.set(0.155 + i * 0.019, 0.0245, -0.064)
    group.add(l)
  }
  group.rotation.x = 0.05
  return shadow(group)
}

export function createMug() {
  const group = new Group()
  const pts: Vector2[] = []
  // outer wall (bottom -> rim), then inner wall back down
  const R = 0.041
  pts.push(new Vector2(0, 0), new Vector2(R - 0.004, 0), new Vector2(R - 0.001, 0.002), new Vector2(R, 0.006))
  for (let i = 0; i <= 10; i++) pts.push(new Vector2(R + 0.0015 * Math.sin((i / 10) * Math.PI), 0.006 + (i / 10) * 0.088))
  pts.push(new Vector2(R - 0.001, 0.0955), new Vector2(R - 0.0045, 0.0955), new Vector2(R - 0.005, 0.093))
  pts.push(new Vector2(R - 0.005, 0.012), new Vector2(0, 0.01))
  const glaze = new MeshPhysicalMaterial({ color: '#e9e3d8', roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 })
  const body = new Mesh(new LatheGeometry(pts, 64), glaze)
  const handle = new Mesh(new TorusGeometry(0.025, 0.0065, 16, 32, Math.PI * 1.15), glaze)
  handle.rotation.z = -Math.PI / 2 - 0.08
  handle.position.set(R + 0.004, 0.05, 0)
  const coffee = new Mesh(
    new CircleGeometry(R - 0.0052, 48),
    new MeshPhysicalMaterial({ color: '#120904', roughness: 0.05, clearcoat: 1, envMapIntensity: 1.5 }),
  )
  coffee.rotation.x = -Math.PI / 2
  coffee.position.y = 0.074
  group.add(body, handle, coffee)
  group.rotation.y = 2.4
  return shadow(group)
}

function floppyLabel(text: string, hue: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 200
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#efeadf'
  ctx.fillRect(0, 0, 256, 200)
  ctx.fillStyle = hue
  ctx.fillRect(0, 0, 256, 26)
  ctx.strokeStyle = 'rgba(40,60,120,0.25)'
  for (let y = 58; y < 200; y += 30) {
    ctx.beginPath()
    ctx.moveTo(10, y)
    ctx.lineTo(246, y)
    ctx.stroke()
  }
  ctx.fillStyle = '#1d2a6b'
  ctx.font = 'italic 34px "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive'
  ctx.fillText(text, 18, 82)
  ctx.font = 'italic 24px "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive'
  ctx.fillText('backup - do not erase', 18, 140)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** A small stack of 3.5" floppy disks. */
export function createFloppies(brushed: Maps) {
  const group = new Group()
  const metal = new MeshStandardMaterial({ ...brushed, color: '#c9ccd1', metalness: 1, roughness: 1, envMapIntensity: 1.4 })
  const colors = ['#141414', '#1b2a4a', '#6d6f72', '#141414']
  colors.forEach((col, i) => {
    const d = new Group()
    const shell = new Mesh(new RoundedBoxGeometry(0.09, 0.0033, 0.094, 2, 0.0012), new MeshStandardMaterial({ color: col, roughness: 0.45 }))
    d.add(shell)
    const shutter = new Mesh(new BoxGeometry(0.05, 0.0036, 0.03), metal)
    shutter.position.set(0.005, 0, -0.032)
    d.add(shutter)
    if (i === colors.length - 1) {
      const label = new Mesh(new PlaneGeometry(0.068, 0.054), new MeshStandardMaterial({ map: floppyLabel('PHOTOS 97', '#c73b2b'), roughness: 0.9 }))
      label.rotation.x = -Math.PI / 2
      label.position.set(0, 0.00172, 0.016)
      d.add(label)
    }
    d.position.y = 0.00166 + i * 0.0034
    d.rotation.y = (Math.random() - 0.5) * 0.25 + i * 0.07
    group.add(d)
  })
  return shadow(group)
}

export function createPencil() {
  const group = new Group()
  const paint = new MeshStandardMaterial({ color: '#e0a21a', roughness: 0.35 })
  const shaft = new Mesh(new CylinderGeometry(0.0036, 0.0036, 0.16, 6), paint)
  const wood = new Mesh(new ConeGeometry(0.0036, 0.018, 6), new MeshStandardMaterial({ color: '#d9b48a', roughness: 0.8 }))
  wood.position.y = 0.089
  const lead = new Mesh(new ConeGeometry(0.0011, 0.0055, 8), new MeshStandardMaterial({ color: '#222', metalness: 0.4, roughness: 0.4 }))
  lead.position.y = 0.0955
  const ferrule = new Mesh(new CylinderGeometry(0.0039, 0.0039, 0.011, 16), new MeshStandardMaterial({ color: '#b9b2a2', metalness: 1, roughness: 0.3 }))
  ferrule.position.y = -0.0855
  const eraser = new Mesh(new CylinderGeometry(0.0037, 0.0037, 0.008, 16), new MeshStandardMaterial({ color: '#d77b86', roughness: 0.9 }))
  eraser.position.y = -0.095
  group.add(shaft, wood, lead, ferrule, eraser)
  group.rotation.set(0, 0, Math.PI / 2)
  const holder = new Group()
  holder.add(group)
  holder.position.y = 0.0036
  return shadow(holder)
}

/** Polaroid prints that mirror the newest photos in the album. */
export class Polaroids {
  readonly group = new Group()
  private prints: { canvas: HTMLCanvasElement; texture: CanvasTexture }[] = []

  constructor() {
    const layout: [number, number, number][] = [
      [-0.43, 0.2, 0.32],
      [-0.345, 0.255, -0.2],
      [0.38, 0.3, 0.12],
    ]
    const paper = new MeshStandardMaterial({ color: '#d9d3c7', roughness: 0.85 })
    layout.forEach(([x, z, r], i) => {
      const canvas = document.createElement('canvas')
      canvas.width = 352
      canvas.height = 428
      const texture = new CanvasTexture(canvas)
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = 8
      this.paint(canvas, null)
      texture.needsUpdate = true
      const face = new MeshPhysicalMaterial({ map: texture, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 })
      const print = new Mesh(new BoxGeometry(0.088, 0.0011, 0.107), [paper, paper, face, paper, paper, paper])
      print.position.set(x, 0.0006 + i * 0.0012, z)
      print.rotation.y = r
      print.castShadow = print.receiveShadow = true
      this.group.add(print)
      this.prints.push({ canvas, texture })
    })
  }

  private paint(canvas: HTMLCanvasElement, img: CanvasImageSource | null, w = 1, h = 1) {
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e4dfd4'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const px = 22
    const size = canvas.width - px * 2
    ctx.fillStyle = '#1a1714'
    ctx.fillRect(px, px, size, size)
    if (img) {
      const s = Math.max(size / w, size / h)
      const sw = size / s
      const sh = size / s
      ctx.save()
      ctx.filter = 'sepia(0.18) saturate(0.9) contrast(1.05)'
      ctx.drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh, px, px, size, size)
      ctx.restore()
      // chemical vignette
      const g = ctx.createRadialGradient(canvas.width / 2, px + size / 2, size * 0.3, canvas.width / 2, px + size / 2, size * 0.75)
      g.addColorStop(0, 'rgba(255,240,210,0)')
      g.addColorStop(1, 'rgba(60,30,10,0.35)')
      ctx.fillStyle = g
      ctx.fillRect(px, px, size, size)
    }
  }

  set(images: (HTMLCanvasElement | ImageBitmap)[]) {
    this.prints.forEach((p, i) => {
      const img = images[i] ?? null
      this.paint(p.canvas, img, img?.width, img?.height)
      p.texture.needsUpdate = true
    })
  }
}

export function keyboardCable() {
  const m = new Mesh(
    new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(0.0, 0.012, 0.115),
        new Vector3(0.02, 0.003, 0.07),
        new Vector3(0.1, 0.003, 0.03),
        new Vector3(0.2, 0.003, 0.02),
        new Vector3(0.24, 0.003, -0.2),
        new Vector3(0.28, 0.003, -0.46),
        new Vector3(0.3, -0.05, -0.53),
      ]),
      80,
      0.0028,
      8,
    ),
    new MeshStandardMaterial({ color: '#cfc5ad', roughness: 0.5 }),
  )
  return shadow(m)
}
