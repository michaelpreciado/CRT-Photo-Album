import { memo, useRef, useMemo } from 'react'
import { RenderTexture, PerspectiveCamera, RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color } from 'three'
import Desktop from './OS/Desktop'
import ScreenGlass from './ScreenGlass'
import { useScreenPointer } from './OS/useScreenPointer'
import { CRTEffectShader } from './shaders/CRTEffectShader'
import { useAppStore } from '../store/useAppStore'
import { useQuality } from './quality'
import { sfx } from '../utils/sound'

const BASE_BRIGHTNESS = 1.18
const POWER_ON_SECONDS = 1.25
const CASE_COLOR = new Color('#c4cdc9')
const CASE_COLOR_DIM = new Color('#4a5254')
const BEZEL_COLOR = new Color('#d0d9d5')
const BEZEL_COLOR_DIM = new Color('#525a5b')

const HALO_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const HALO_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * uOpacity;
    gl_FragColor = vec4(vec3(0.36, 0.88, 0.95) * a, a);
  }
`

const easeOut = (t) => 1 - Math.pow(1 - t, 3)

function CRTMonitor({ position }) {
  const { tier, reduced } = useQuality()
  const materialRef = useRef()
  const glowRef = useRef()
  const caseMatRef = useRef()
  const bezelMatRef = useRef()
  const haloRef = useRef()
  const dimRef = useRef(0)
  const onRef = useRef(0)
  const poweredRef = useRef(false)
  const pointer = useScreenPointer()
  const haloUniforms = useMemo(() => ({ uOpacity: { value: 0 } }), [])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const t = state.clock.elapsedTime
    const booted = useAppStore.getState().booted
    if (booted && !poweredRef.current) {
      poweredRef.current = true
      sfx.powerOn()
    }
    onRef.current = booted ? Math.min(1, onRef.current + delta / (reduced ? 0.01 : POWER_ON_SECONDS)) : 0
    const k = onRef.current

    if (materialRef.current) {
      const u = materialRef.current.uniforms
      u.time.value = reduced ? 1.35 : t
      u.power.value = k
      // Phosphor warms up with a brief overshoot flash
      u.brightness.value = BASE_BRIGHTNESS * easeOut(k) * (1 + 0.6 * Math.sin(k * Math.PI) * (1 - k))
      u.glowIntensity.value = tier.glow
      u.flickerIntensity.value = reduced ? 0 : 0.02
      u.interferenceIntensity.value = reduced ? 0 : 0.35
      u.noiseIntensity.value = reduced ? 0.015 : 0.035
    }

    // Screen light flickers in sync with the shader's mains hum
    if (glowRef.current) {
      const flick = reduced ? 0 : 0.12 * Math.sin(t * 12.0) + 0.06 * Math.sin(t * 0.7)
      glowRef.current.intensity = (1.4 + flick) * easeOut(k)
    }
    if (haloRef.current) {
      haloRef.current.uniforms.uOpacity.value = easeOut(k) * (0.75 + (reduced ? 0 : 0.25 * Math.sin(t * 2.2)))
    }

    // Dim the casing when a photo is open so the screen takes focus
    const target = useAppStore.getState().viewMode === 'photo' ? 1 : 0
    dimRef.current += (target - dimRef.current) * Math.min(1, delta * 4)
    const d = dimRef.current
    caseMatRef.current?.color.lerpColors(CASE_COLOR, CASE_COLOR_DIM, d)
    bezelMatRef.current?.color.lerpColors(BEZEL_COLOR, BEZEL_COLOR_DIM, d)
  })

  const vents = useMemo(() => Array.from({ length: 8 }, (_, i) => i), [])

  return (
    <group position={position}>
      {/* Monitor stand — tucked under the body so it never overlaps the bezel */}
      <mesh position={[0, -1.42, -0.2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.62, 0.16, 24]} />
        <meshStandardMaterial color="#aab5b2" roughness={0.6} metalness={0.08} />
      </mesh>
      <mesh position={[0, -1.26, -0.25]} castShadow>
        <cylinderGeometry args={[0.34, 0.44, 0.2, 24]} />
        <meshStandardMaterial color="#b6c0bd" roughness={0.55} metalness={0.08} />
      </mesh>

      {/* Rear casing */}
      <RoundedBox args={[2.3, 2.1, 1.5]} radius={0.08} smoothness={3} position={[0, 0, -0.85]} castShadow receiveShadow>
        <meshStandardMaterial ref={caseMatRef} color="#c4cdc9" roughness={0.45} metalness={0.06} envMapIntensity={1.8} />
      </RoundedBox>

      {/* Front bezel */}
      <RoundedBox args={[2.5, 2.3, 0.32]} radius={0.06} smoothness={3} position={[0, 0, 0.14]} castShadow>
        <meshStandardMaterial ref={bezelMatRef} color="#d0d9d5" roughness={0.3} metalness={0.08} envMapIntensity={2.2} />
      </RoundedBox>

      {/* Recessed screen surround */}
      <mesh position={[0, 0.08, 0.29]}>
        <boxGeometry args={[2.08, 1.78, 0.06]} />
        <meshStandardMaterial color="#1c2226" roughness={0.8} />
      </mesh>

      {/* CRT screen — OS rendered to texture, CRT shader on top */}
      <mesh position={[0, 0.08, 0.345]} {...pointer}>
        <planeGeometry args={[1.9, 1.6]} />
        <shaderMaterial ref={materialRef} args={[CRTEffectShader]} toneMapped={false}>
          <RenderTexture
            attach="uniforms-tDiffuse-value"
            width={tier.rtt[0]}
            height={tier.rtt[1]}
            samples={tier.samples}
            generateMipmaps={false}
            anisotropy={4}
          >
            <PerspectiveCamera makeDefault manual aspect={1.9 / 1.6} position={[0, 0, 5]} />
            <color attach="background" args={['#000']} />
            <Desktop />
          </RenderTexture>
        </shaderMaterial>
      </mesh>

      {/* Curved glass: soft-box reflections + fresnel rim */}
      <ScreenGlass position={[0, 0.08, 0.352]} />

      {/* Screen glow — light cast onto the desk and bezel */}
      <pointLight ref={glowRef} position={[0, 0.1, 1.1]} intensity={1.4} distance={3.5} decay={2} color="#7fd8ff" />

      {/* Bottom control panel */}
      <mesh position={[0, -1.02, 0.24]} castShadow>
        <boxGeometry args={[2.3, 0.26, 0.16]} />
        <meshStandardMaterial color="#b3bdba" roughness={0.55} metalness={0.05} />
      </mesh>

      {/* Control buttons */}
      {[-0.35, -0.15, 0.05].map((x) => (
        <mesh key={x} position={[x + 0.75, -1.02, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
          <meshStandardMaterial color="#7d8583" roughness={0.45} metalness={0.2} />
        </mesh>
      ))}

      {/* Brand plate */}
      <mesh position={[-0.7, -1.02, 0.325]}>
        <planeGeometry args={[0.42, 0.09]} />
        <meshStandardMaterial color="#1d2226" roughness={0.35} metalness={0.4} />
      </mesh>

      {/* Power LED + halo */}
      <mesh position={[0.95, -1.02, 0.325]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 12]} />
        <meshStandardMaterial color="#06222a" emissive="#5ce1f2" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh position={[0.95, -1.02, 0.34]} raycast={() => null}>
        <circleGeometry args={[0.16, 24]} />
        <shaderMaterial
          ref={haloRef}
          uniforms={haloUniforms}
          vertexShader={HALO_VERT}
          fragmentShader={HALO_FRAG}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Side vents */}
      {vents.map((i) => (
        <mesh key={i} position={[1.18, 0.55 - i * 0.16, -0.55]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.9, 0.045]} />
          <meshStandardMaterial color="#2a3033" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

export default memo(CRTMonitor)
