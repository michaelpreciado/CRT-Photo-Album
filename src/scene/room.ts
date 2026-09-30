import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  Vector2,
  Vector3,
  type Texture,
  BackSide,
  FrontSide,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export const DESK = { w: 1.6, d: 0.85, zc: -0.095, thick: 0.034 }
export const WALL_Z = -0.56
export const LAMP_POS = new Vector3(0.02, 0.98, 0.09)
export const LAMP_COLOR = new Color().setRGB(1.0, 0.7, 0.42)

interface Maps {
  map: Texture
  normalMap: Texture
  roughnessMap: Texture
}

export function createDesk(wood: Maps) {
  const group = new Group()
  const top = new Mesh(
    new PlaneGeometry(DESK.w - 0.006, DESK.d - 0.006),
    new MeshPhysicalMaterial({
      ...wood,
      roughness: 1,
      normalScale: new Vector2(0.55, 0.55),
      clearcoat: 0.35,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.6,
    }),
  )
  top.rotation.x = -Math.PI / 2
  top.position.set(0, 0.0004, DESK.zc)
  top.receiveShadow = true
  top.name = 'desktop'

  // Slab for the bevelled edges; same wood, rougher edge grain.
  const edgeMat = new MeshStandardMaterial({ ...wood, roughness: 1, normalScale: new Vector2(0.4, 0.4), envMapIntensity: 0.5 })
  const slab = new Mesh(new RoundedBoxGeometry(DESK.w, DESK.thick, DESK.d, 4, 0.006), edgeMat)
  slab.position.set(0, -DESK.thick / 2, DESK.zc)
  slab.receiveShadow = true
  slab.castShadow = true

  // Side panels (only glimpsed from low angles)
  const panelMat = new MeshStandardMaterial({ color: '#0d0a08', roughness: 0.7 })
  for (const sx of [-1, 1]) {
    const leg = new Mesh(new RoundedBoxGeometry(0.03, 0.72, DESK.d - 0.06, 2, 0.004), panelMat)
    leg.position.set(sx * (DESK.w / 2 - 0.05), -DESK.thick - 0.36, DESK.zc)
    leg.receiveShadow = true
    group.add(leg)
  }
  group.add(top, slab)
  return { group, top }
}

export function createWalls(plaster: Maps) {
  const group = new Group()
  const wallMat = new MeshStandardMaterial({ ...plaster, roughness: 1, normalScale: new Vector2(0.9, 0.9), envMapIntensity: 0.3 })
  for (const t of [plaster.map, plaster.normalMap, plaster.roughnessMap]) t.repeat.set(4, 3)
  const wall = new Mesh(new PlaneGeometry(4.8, 3.6), wallMat)
  wall.position.set(0, 0.9, WALL_Z)
  wall.receiveShadow = true

  const floor = new Mesh(new PlaneGeometry(6, 6), new MeshStandardMaterial({ color: '#050505', roughness: 0.9 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.76
  floor.receiveShadow = true

  // Skirting board catching a whisper of light.
  const skirt = new Mesh(new RoundedBoxGeometry(4.8, 0.09, 0.018, 2, 0.004), new MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.45 }))
  skirt.position.set(0, -0.715, WALL_Z + 0.009)
  group.add(wall, floor, skirt)
  return group
}

/** Pendant lamp: enamel bell shade, brass socket, warm bulb, spot light. */
export function createLamp(enamel: Maps, shadowMapSize: number) {
  const group = new Group()
  group.position.copy(LAMP_POS)

  // Bell profile (r, y) from the rim up to the crown.
  const prof: Vector2[] = []
  const N = 40
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const r = 0.036 + 0.138 * Math.pow(1 - t, 1.8) * (1 - 0.1 * Math.sin(t * Math.PI))
    prof.push(new Vector2(r, t * 0.19 - 0.02))
  }
  prof[0].x += 0.004 // rolled rim
  const shadeGeo = new LatheGeometry(prof, 96)
  const outer = new Mesh(
    shadeGeo,
    new MeshPhysicalMaterial({
      ...enamel,
      color: '#1d2b26',
      roughness: 1,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      normalScale: new Vector2(0.15, 0.15),
      side: FrontSide,
      envMapIntensity: 1.2,
    }),
  )
  outer.castShadow = true
  const inner = new Mesh(
    shadeGeo,
    new MeshStandardMaterial({ color: '#f3ede2', emissive: LAMP_COLOR, emissiveIntensity: 0.55, roughness: 0.5, side: BackSide }),
  )
  inner.scale.setScalar(0.985)
  group.add(outer, inner)

  const brass = new MeshStandardMaterial({ color: '#b08d57', metalness: 1, roughness: 0.32, envMapIntensity: 1.6 })
  const socket = new Mesh(new CylinderGeometry(0.018, 0.02, 0.06, 32), brass)
  socket.position.y = 0.16
  const cord = new Mesh(new CylinderGeometry(0.0025, 0.0025, 2.4, 8), new MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.5 }))
  cord.position.y = 0.19 + 1.2
  group.add(socket, cord)

  // The bulb is far brighter than 1.0 so bloom turns it into a real glare.
  const bulb = new Mesh(
    new SphereGeometry(0.032, 32, 16),
    new MeshStandardMaterial({ color: '#000', emissive: LAMP_COLOR.clone().lerp(new Color(1, 1, 1), 0.35), emissiveIntensity: 60 }),
  )
  bulb.position.y = 0.09
  group.add(bulb)

  const spot = new SpotLight(LAMP_COLOR, 7.5, 3.2, 0.92, 0.78, 1.6)
  spot.position.set(0, 0.07, 0)
  spot.castShadow = true
  spot.shadow.mapSize.set(shadowMapSize, shadowMapSize)
  spot.shadow.camera.near = 0.08
  spot.shadow.camera.far = 2.2
  spot.shadow.bias = -0.00025
  spot.shadow.normalBias = 0.004
  spot.shadow.radius = 3
  group.add(spot)
  group.add(spot.target)
  spot.target.position.set(-0.02, -LAMP_POS.y, -0.12)

  return { group, spot, bulb }
}

/**
 * Dust drifting through the lamp's cone. Each mote is a soft sprite that is
 * only visible where the spot light actually reaches it, and glints as it
 * tumbles (flat flakes catch the light at some angles only).
 */
export function createDust(count: number) {
  const pos: number[] = []
  const seed: number[] = []
  for (let i = 0; i < count; i++) {
    pos.push((Math.random() - 0.5) * 1.3, Math.random() * 0.95 + 0.02, -0.45 + Math.random() * 1.0)
    seed.push(Math.random(), Math.random(), Math.random())
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('seed', new Float32BufferAttribute(seed, 3))
  const mat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLight: { value: LAMP_POS.clone().add(new Vector3(0, 0.07, 0)) },
      uDir: { value: new Vector3(-0.02, -LAMP_POS.y - 0.07, -0.12).normalize() },
      uColor: { value: LAMP_COLOR.clone().multiplyScalar(1.6) },
      uScale: { value: 1 },
      uOn: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 seed;
      uniform float uTime, uScale;
      uniform vec3 uLight, uDir;
      varying float vBright;
      void main() {
        vec3 p = position;
        float t = uTime * (0.25 + seed.x * 0.25);
        p += vec3(sin(t + seed.y * 40.0) * 0.05 + sin(t * 0.37 + seed.z * 9.0) * 0.08,
                  mod(-uTime * 0.004 * (0.5 + seed.z) + seed.x, 1.0) * 0.12 - 0.06 + sin(t * 0.8 + seed.x * 30.0) * 0.03,
                  cos(t * 0.9 + seed.z * 20.0) * 0.05);
        vec3 L = p - uLight;
        float d = length(L);
        float cone = smoothstep(0.7, 0.9, dot(L / d, uDir));
        float glint = pow(0.5 + 0.5 * sin(uTime * (1.0 + seed.y * 3.0) + seed.z * 50.0), 6.0);
        vBright = cone * (0.08 + glint * 0.5) / (0.3 + d * d);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, uScale * (0.0012 + seed.y * 0.0014) / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOn;
      varying float vBright;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(uColor * vBright * a * a * uOn, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geo, mat)
  points.frustumCulled = false
  return { points, material: mat }
}
