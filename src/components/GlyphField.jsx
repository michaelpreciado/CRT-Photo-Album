import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture } from 'three'

// Ambient blue glyph rain in the 3D room. One Points draw call; the fall
// animation lives entirely in the vertex shader (zero per-frame CPU work
// beyond a time uniform). Frozen under reduced motion.
const COUNT = 220
const ATLAS = 8
const GLYPHS = 'アイウエカキクケ01ABCDEF<>/{}=+*#$%&?ヲソタチ23456789ｱｲｳｴｵｶｷｸ'.split('')

// Deterministic PRNG (mulberry32) keeps render pure and the field stable.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeAtlas() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const x = c.getContext('2d')
  x.fillStyle = '#fff'
  x.font = '44px monospace'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  for (let i = 0; i < ATLAS * ATLAS; i++) {
    x.fillText(GLYPHS[i % GLYPHS.length], (i % ATLAS) * 64 + 32, Math.floor(i / ATLAS) * 64 + 34)
  }
  const t = new CanvasTexture(c)
  t.anisotropy = 2
  return t
}

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute vec4 aData; // x: speed, y: phase, z: size, w: glyph index
  varying float vGlyph;
  varying float vFade;
  void main() {
    vec3 p = position;
    float span = 10.0;
    p.y = mod(p.y - uTime * aData.x - aData.y * span, span) - 2.0;
    vFade = smoothstep(-2.0, -0.8, p.y) * smoothstep(8.0, 5.5, p.y);
    vGlyph = aData.w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aData.z * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`
const fragment = /* glsl */ `
  uniform sampler2D uMap;
  varying float vGlyph;
  varying float vFade;
  void main() {
    float i = floor(vGlyph);
    vec2 cell = vec2(mod(i, ${ATLAS}.0), floor(i / ${ATLAS}.0));
    vec2 uv = (cell + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)) / ${ATLAS}.0;
    float a = texture2D(uMap, uv).r * vFade;
    if (a < 0.02) discard;
    vec3 col = mix(vec3(0.17, 0.65, 0.77), vec3(0.36, 0.88, 0.95), fract(vGlyph * 0.37));
    gl_FragColor = vec4(col * a, a * 0.6);
  }
`

export default function GlyphField({ reduced = false }) {
  const matRef = useRef()
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(COUNT * 3)
    const data = new Float32Array(COUNT * 4)
    const rand = rng(1997)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (rand() - 0.5) * 24
      pos[i * 3 + 1] = rand() * 10
      pos[i * 3 + 2] = -1.5 - rand() * 11
      data[i * 4] = 0.25 + rand() * 0.55
      data[i * 4 + 1] = rand()
      data[i * 4 + 2] = 0.16 + rand() * 0.24
      data[i * 4 + 3] = Math.floor(rand() * ATLAS * ATLAS)
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aData', new BufferAttribute(data, 4))
    return g
  }, [])
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uScale: { value: 900 }, uMap: { value: makeAtlas() } }),
    [],
  )

  useFrame((state) => {
    if (!matRef.current || reduced) return
    const u = matRef.current.uniforms
    u.uTime.value = state.clock.elapsedTime
    // Keep glyph size stable relative to the viewport height
    u.uScale.value = state.size.height * state.viewport.dpr * 1.07
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={fragment}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}
