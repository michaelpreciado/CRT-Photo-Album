import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry } from 'three'

// Floating dust caught in the screen's glow. GPU-driven (one Points draw
// call, motion lives in the vertex shader). Motes brighten near the screen
// and twinkle; frozen — but still visible — under reduced motion.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  attribute vec4 aData; // x: phase, y: speed, z: size, w: twinkle
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float t = uTime * aData.y;
    p.x += sin(t * 0.7 + aData.x * 6.283) * 0.35;
    p.y += mod(t * 0.12 + aData.x, 1.0) * 3.0 - 1.5 + sin(t * 0.9 + aData.x * 12.0) * 0.12;
    p.z += cos(t * 0.5 + aData.x * 6.283) * 0.3;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // brighter where the screen light reaches (in front of the monitor)
    float lit = smoothstep(4.5, 0.6, distance(p, vec3(0.0, 0.4, 1.4)));
    float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aData.w * 2.0) + aData.x * 40.0);
    vAlpha = lit * tw * 0.9;
    gl_PointSize = max(1.0, aData.z * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const fragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(0.55, 0.9, 1.0) * a, a);
  }
`

export default function DustMotes({ count = 100, reduced = false }) {
  const matRef = useRef()
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(count * 3)
    const data = new Float32Array(count * 4)
    const rand = rng(2024)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 7
      pos[i * 3 + 1] = -0.5 + rand() * 1.5
      pos[i * 3 + 2] = -0.5 + rand() * 4.6
      data[i * 4] = rand()
      data[i * 4 + 1] = 0.4 + rand() * 0.9
      data[i * 4 + 2] = 0.012 + rand() * 0.02
      data[i * 4 + 3] = rand()
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aData', new BufferAttribute(data, 4))
    return g
  }, [count])
  const uniforms = useMemo(() => ({ uTime: { value: 8 }, uScale: { value: 900 } }), [])

  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    if (!reduced) m.uniforms.uTime.value = state.clock.elapsedTime + 8
    m.uniforms.uScale.value = state.size.height * state.viewport.dpr
  })

  if (count === 0) return null
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
