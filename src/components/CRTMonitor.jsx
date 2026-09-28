import { useRef, useState, useMemo } from 'react'
import { RenderTexture, PerspectiveCamera, RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Color } from 'three'
import Desktop from './OS/Desktop'
import { CRTEffectShader } from './shaders/CRTEffectShader'
import { useAppStore } from '../store/useAppStore'

const BASE_BRIGHTNESS = 1.18
const CASE_COLOR = new Color('#cdc9b4')
const CASE_COLOR_DIM = new Color('#55524a')
const BEZEL_COLOR = new Color('#d8d4c0')
const BEZEL_COLOR_DIM = new Color('#5a574e')

export default function CRTMonitor({ position, uploadedImages }) {
  const [clickTrigger, setClickTrigger] = useState(0)
  const materialRef = useRef()
  const glowRef = useRef()
  const caseMatRef = useRef()
  const bezelMatRef = useRef()
  const dimRef = useRef(0)
  const onRef = useRef(0)

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (materialRef.current) {
      const u = materialRef.current.uniforms
      u.time.value = t
      // CRT power-on: phosphor warms up after boot with a brief overshoot
      const booted = useAppStore.getState().booted
      onRef.current = booted ? Math.min(1, onRef.current + delta * 1.3) : 0
      const k = onRef.current
      u.brightness.value = BASE_BRIGHTNESS * (k < 1 ? 1 - Math.pow(1 - k, 3) : 1) * (1 + 0.6 * Math.sin(k * Math.PI) * (1 - k))
    }

    // Screen light flickers in sync with the shader's mains hum
    if (glowRef.current) {
      glowRef.current.intensity =
        1.4 + 0.12 * Math.sin(t * 12.0) + 0.06 * Math.sin(t * 0.7)
    }

    // Dim the casing when a photo is open so the screen takes focus
    const target = useAppStore.getState().viewMode === 'photo' ? 1 : 0
    dimRef.current += (target - dimRef.current) * Math.min(1, delta * 4)
    const d = dimRef.current
    if (caseMatRef.current) {
      caseMatRef.current.color.lerpColors(CASE_COLOR, CASE_COLOR_DIM, d)
    }
    if (bezelMatRef.current) {
      bezelMatRef.current.color.lerpColors(BEZEL_COLOR, BEZEL_COLOR_DIM, d)
    }
  })

  // Mutate the shared cursor object — read by the OS scene inside useFrame.
  const handlePointerMove = (e) => {
    if (e.uv) {
      const { cursor } = useAppStore.getState()
      cursor.x = (e.uv.x - 0.5) * 2
      cursor.y = (e.uv.y - 0.5) * 2
    }
  }

  const handlePointerDown = (e) => {
    e.stopPropagation()
    setClickTrigger((n) => n + 1)
  }

  const vents = useMemo(() => Array.from({ length: 8 }, (_, i) => i), [])

  return (
    <group position={position}>
      {/* Monitor stand — tucked under the body so it never overlaps the bezel */}
      <mesh position={[0, -1.42, -0.2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.62, 0.16, 24]} />
        <meshStandardMaterial color="#b8b4a0" roughness={0.65} metalness={0.05} />
      </mesh>
      <mesh position={[0, -1.26, -0.25]} castShadow>
        <cylinderGeometry args={[0.34, 0.44, 0.2, 24]} />
        <meshStandardMaterial color="#c2beaa" roughness={0.6} metalness={0.05} />
      </mesh>

      {/* Rear casing — tapered like a real tube */}
      <RoundedBox
        args={[2.3, 2.1, 1.5]}
        radius={0.08}
        smoothness={3}
        position={[0, 0, -0.85]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial ref={caseMatRef} color="#cdc9b4" roughness={0.55} metalness={0.04} />
      </RoundedBox>

      {/* Front bezel */}
      <RoundedBox
        args={[2.5, 2.3, 0.32]}
        radius={0.06}
        smoothness={3}
        position={[0, 0, 0.14]}
        castShadow
      >
        <meshStandardMaterial ref={bezelMatRef} color="#d8d4c0" roughness={0.45} metalness={0.05} />
      </RoundedBox>

      {/* Recessed screen surround */}
      <mesh position={[0, 0.08, 0.29]}>
        <boxGeometry args={[2.08, 1.78, 0.06]} />
        <meshStandardMaterial color="#26241f" roughness={0.85} />
      </mesh>

      {/* CRT screen — OS rendered to texture, CRT shader on top */}
      <mesh
        position={[0, 0.08, 0.345]}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
      >
        <planeGeometry args={[1.9, 1.6]} />
        <shaderMaterial ref={materialRef} args={[CRTEffectShader]} toneMapped={false}>
          <RenderTexture
            attach="uniforms-tDiffuse-value"
            width={1216}
            height={1024}
            anisotropy={4}
          >
            <PerspectiveCamera makeDefault manual aspect={1.9 / 1.6} position={[0, 0, 5]} />
            <color attach="background" args={['#000']} />
            <Desktop clickTrigger={clickTrigger} uploadedImages={uploadedImages} />
          </RenderTexture>
        </shaderMaterial>
      </mesh>

      {/* Screen glow — light cast onto the desk and bezel */}
      <pointLight
        ref={glowRef}
        position={[0, 0.1, 1.1]}
        intensity={1.4}
        distance={3.5}
        decay={2}
        color="#7fd8ff"
      />

      {/* Bottom control panel */}
      <mesh position={[0, -1.02, 0.24]} castShadow>
        <boxGeometry args={[2.3, 0.26, 0.16]} />
        <meshStandardMaterial color="#bebaa6" roughness={0.6} />
      </mesh>

      {/* Control buttons */}
      {[-0.35, -0.15, 0.05].map((x) => (
        <mesh key={x} position={[x + 0.75, -1.02, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
          <meshStandardMaterial color="#8a8674" roughness={0.5} />
        </mesh>
      ))}

      {/* Brand plate */}
      <mesh position={[-0.7, -1.02, 0.325]}>
        <planeGeometry args={[0.42, 0.09]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Power LED */}
      <mesh position={[0.95, -1.02, 0.325]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 12]} />
        <meshStandardMaterial color="#06222a" emissive="#5ce1f2" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>

      {/* Side vents */}
      {vents.map((i) => (
        <mesh key={i} position={[1.18, 0.55 - i * 0.16, -0.55]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.9, 0.045]} />
          <meshStandardMaterial color="#35332c" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}
