import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color } from 'three'
import { useAppStore } from '../store/useAppStore'
import { useQuality } from './quality'

// Soft additive radial glow on a plane — cheap light "spill" that the
// physically-based lights alone can't sell (screen light on the desk, cyan
// haze behind the monitor). Fades in with the CRT power-on and breathes
// slightly unless reduced motion is requested.
const vert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uPower;
  varying vec2 vUv;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float d = length(c);
    float a = pow(clamp(1.0 - d, 0.0, 1.0), uPower) * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`

export default function GlowPlane({ color = '#5ce1f2', opacity = 0.2, power = 2.0, size = [4, 2], breathe = 0.12, ...props }) {
  const matRef = useRef()
  const { reduced } = useQuality()
  const uniforms = useMemo(
    () => ({ uColor: { value: new Color(color) }, uOpacity: { value: 0 }, uPower: { value: power } }),
    [color, power],
  )
  const k = useRef(0)

  useFrame((state, delta) => {
    const m = matRef.current
    if (!m) return
    const { booted, viewMode } = useAppStore.getState()
    k.current += ((booted ? 1 : 0) - k.current) * Math.min(1, delta * 1.5)
    const dim = viewMode === 'photo' ? 0.55 : 1
    const b = reduced ? 0 : Math.sin(state.clock.elapsedTime * 1.3) * breathe
    m.uniforms.uOpacity.value = opacity * k.current * dim * (1 + b)
  })

  return (
    <mesh raycast={() => null} renderOrder={1} {...props}>
      <planeGeometry args={size} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}
