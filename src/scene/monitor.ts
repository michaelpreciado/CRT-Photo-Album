import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RectAreaLight,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CRT_GLSL, CRT_UNIFORMS } from '../screen/crtShader'
import { loftRoundedRect, roundedRectShape } from './geometry'

// Housing dimensions (metres) - a 15" late-90s beige CRT.
const W = 0.4
const H = 0.375
const BEZEL_D = 0.04
const HOLE_W = 0.318
const HOLE_H = 0.242
const HOLE_Y = 0.022
export const SCREEN_W = 0.334
export const SCREEN_H = 0.258
const SCREEN_Z = -0.021
const BULGE = 0.011
const BASE_H = 0.035

export interface PlasticMaps {
  map: Texture
  normalMap: Texture
  roughnessMap: Texture
}

export interface Monitor {
  group: Group
  screen: Mesh
  screenMaterial: ShaderMaterial
  glow: RectAreaLight
  led: MeshStandardMaterial
  /** screen centre and size in world units, for camera framing */
  screenCenter: Vector3
  screenSize: Vector2
}

function screenGeometry() {
  const g = new PlaneGeometry(SCREEN_W, SCREEN_H, 40, 32)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (SCREEN_W / 2)
    const y = p.getY(i) / (SCREEN_H / 2)
    // Slightly spherical faceplate
    p.setZ(i, SCREEN_Z + BULGE * (1 - 0.55 * x * x - 0.55 * y * y - 0.2 * x * x * y * y))
  }
  g.computeVertexNormals()
  return g
}

function labelTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.font = '600 34px "Inter", "Helvetica Neue", Arial, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.letterSpacing = '6px'
  ctx.fillText('PRECIADO', 8, 34)
  ctx.font = '500 22px "Inter", "Helvetica Neue", Arial, sans-serif'
  ctx.letterSpacing = '2px'
  ctx.textAlign = 'right'
  ctx.fillText('VISION 15', 504, 36)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function createMonitor(plastic: PlasticMaps, envIntensity: number): Monitor {
  const group = new Group()
  group.name = 'monitor'

  const beige = new MeshStandardMaterial({
    color: new Color('#c2b392'),
    ...plastic,
    normalScale: new Vector2(0.05, 0.05),
    roughness: 1,
    envMapIntensity: envIntensity,
  })
  const beigeDark = beige.clone()
  beigeDark.color = new Color('#a89a7c')
  const trim = new MeshStandardMaterial({ color: '#2a2724', roughness: 0.6, metalness: 0 })

  const yC = BASE_H + H / 2 // housing vertical centre

  // Bezel: rounded frame with a bevelled opening for the tube.
  const outer = roundedRectShape(W, H, 0.022, 10)
  const hole = roundedRectShape(HOLE_W, HOLE_H, 0.018, 10, 0, HOLE_Y)
  outer.holes.push(hole)
  const bezelGeo = new ExtrudeGeometry(outer, {
    depth: BEZEL_D,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.0055,
    bevelSegments: 5,
    curveSegments: 10,
  })
  // ExtrudeGeometry UVs are in shape units; scale for the plastic tile.
  const uv = bezelGeo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 10, uv.getY(i) * 10)
  const bezel = new Mesh(bezelGeo, beige)
  bezel.position.set(0, yC, -BEZEL_D - 0.006)
  bezel.castShadow = bezel.receiveShadow = true
  group.add(bezel)

  // Housing: boxy front, tapering to the neck.
  const body = new Mesh(
    loftRoundedRect(
      [
        { w: W - 0.008, h: H - 0.008, r: 0.02, z: -0.044 },
        { w: W - 0.01, h: H - 0.012, r: 0.022, z: -0.13 },
        { w: W - 0.028, h: H - 0.03, r: 0.034, z: -0.165 },
        { w: 0.3, h: 0.285, r: 0.045, z: -0.3, y: -0.01 },
        { w: 0.23, h: 0.205, r: 0.05, z: -0.405, y: -0.016 },
        { w: 0.215, h: 0.19, r: 0.05, z: -0.415, y: -0.016 },
      ],
      8,
    ),
    beige,
  )
  body.position.y = yC
  body.castShadow = body.receiveShadow = true
  group.add(body)

  // Seam groove between bezel and housing.
  const seam = new Mesh(new BoxGeometry(W - 0.006, H - 0.006, 0.003), trim)
  seam.position.set(0, yC, -0.0445)
  group.add(seam)

  // Top vents on the sloped rear shoulder.
  const ventGeo = new BoxGeometry(0.0055, 0.0025, 0.07)
  const vents = new InstancedMesh(ventGeo, trim, 30)
  const m = new Matrix4()
  const o = new Object3D()
  const slope = Math.atan2((H - 0.03) / 2 - (0.285 / 2 - 0.01), 0.135)
  let k = 0
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 15; i++) {
      const z = -0.2 - row * 0.085
      const t = (z + 0.165) / -0.135
      const top = (H - 0.03) / 2 + t * (0.285 / 2 - 0.01 - (H - 0.03) / 2)
      o.position.set((i - 7) * 0.013, yC + top - 0.0006, z)
      o.rotation.set(-slope, 0, 0)
      o.updateMatrix()
      m.copy(o.matrix)
      vents.setMatrixAt(k++, m)
    }
  }
  vents.receiveShadow = true
  group.add(vents)

  // Swivel stand.
  const stand = new Mesh(new CylinderGeometry(0.13, 0.135, 0.016, 64), beigeDark)
  stand.position.y = 0.008
  stand.castShadow = stand.receiveShadow = true
  const neck = new Mesh(new RoundedBoxGeometry(0.2, 0.024, 0.2, 3, 0.008), beigeDark)
  neck.position.set(0, 0.024, -0.13)
  neck.castShadow = neck.receiveShadow = true
  stand.position.z = -0.13
  group.add(stand, neck)

  // Chin controls: power button, LED, adjustment buttons, badge.
  const chinY = yC - H / 2 + (H / 2 - HOLE_Y - HOLE_H / 2) / 2 + 0.002
  const power = new Mesh(new RoundedBoxGeometry(0.03, 0.013, 0.01, 3, 0.004), beigeDark)
  power.position.set(0.155, chinY, 0.001)
  power.castShadow = true
  group.add(power)
  const led = new MeshStandardMaterial({ color: '#0a2a10', emissive: new Color('#39ff6a'), emissiveIntensity: 0 })
  const ledMesh = new Mesh(new SphereGeometry(0.0022, 16, 8), led)
  ledMesh.position.set(0.128, chinY, 0.0035)
  group.add(ledMesh)
  const btnGeo = new CylinderGeometry(0.0038, 0.0042, 0.004, 24)
  btnGeo.rotateX(Math.PI / 2)
  for (let i = 0; i < 4; i++) {
    const b = new Mesh(btnGeo, beigeDark)
    b.position.set(0.04 + i * 0.016, chinY, 0.0015)
    group.add(b)
  }
  const badge = new Mesh(
    new PlaneGeometry(0.12, 0.015),
    new MeshStandardMaterial({ color: '#5a5242', alphaMap: labelTexture(), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
  )
  badge.position.set(-0.105, chinY, 0.0005)
  group.add(badge)

  // The tube: CRT picture shader on a spherical faceplate.
  const screenMaterial = new ShaderMaterial({
    uniforms: CRT_UNIFORMS(),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      ${CRT_GLSL}
      void main() { gl_FragColor = vec4(crtColor(vUv), 1.0); }`,
  })
  const sGeo = screenGeometry()
  const screen = new Mesh(sGeo, screenMaterial)
  screen.position.set(0, yC + HOLE_Y, 0)
  screen.name = 'screen'
  group.add(screen)

  // Glass: black, glossy, additive - contributes only its reflections.
  const glass = new Mesh(
    sGeo.clone(),
    new MeshPhysicalMaterial({
      color: '#000000',
      roughness: 0.07,
      metalness: 0,
      specularIntensity: 1,
      clearcoat: 0.4,
      clearcoatRoughness: 0.12,
      envMapIntensity: envIntensity * 2.2,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  )
  glass.position.copy(screen.position)
  glass.position.z += 0.0008
  glass.renderOrder = 2
  group.add(glass)

  // Soft light the picture throws onto the desk and keyboard.
  const glow = new RectAreaLight('#9fc6ff', 0, SCREEN_W * 0.92, SCREEN_H * 0.92)
  glow.position.set(0, yC + HOLE_Y, 0.004)
  glow.lookAt(0, yC + HOLE_Y, 1)
  group.add(glow)

  // Video cable out of the back, down behind the desk.
  const cable = new Mesh(
    new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(0.03, yC - 0.06, -0.41),
        new Vector3(0.05, 0.05, -0.47),
        new Vector3(0.12, 0.004, -0.49),
        new Vector3(0.3, 0.004, -0.5),
        new Vector3(0.42, 0.004, -0.505),
        new Vector3(0.5, -0.1, -0.53),
      ]),
      64,
      0.0035,
      8,
    ),
    new MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.55 }),
  )
  cable.castShadow = cable.receiveShadow = true
  group.add(cable)

  group.position.set(0, 0, -0.02)
  group.updateMatrixWorld(true)
  const screenCenter = new Vector3(0, yC + HOLE_Y, SCREEN_Z + BULGE)
  group.localToWorld(screenCenter)

  return {
    group,
    screen,
    screenMaterial,
    glow,
    led,
    screenCenter,
    screenSize: new Vector2(HOLE_W, HOLE_H),
  }
}
