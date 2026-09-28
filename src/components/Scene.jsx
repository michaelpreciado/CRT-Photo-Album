import { useRef, useEffect, useState } from 'react'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { easing } from 'maath'
import Room from './Room'
import Desk from './Desk'
import CRTMonitor from './CRTMonitor'
import GlyphField from './GlyphField'
import { useAppStore } from '../store/useAppStore'

// Camera framing per view mode. The screen face sits at ~[0, 0.08, 0.35].
const CAMERA_POSES = {
  desktop: { position: new Vector3(0, 0.5, 4), target: new Vector3(0, 0, 0) },
  gallery: { position: new Vector3(0, 0.1, 2.9), target: new Vector3(0, 0.08, 0.35) },
  photo: { position: new Vector3(0, 0.08, 2.45), target: new Vector3(0, 0.08, 0.35) },
}

// Light intensities: [normal, photo mode] — the room darkens around the
// screen when a photo is open.
const INTRO_POSE = new Vector3(0, 1.3, 8.5)

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

const LIGHT_LEVELS = {
  ambient: [0.3, 0.1],
  spot: [25, 8],
  key: [5, 1.2],
  fill: [3, 0.8],
}

function CameraRig({ reduced }) {
  const controlsRef = useRef()
  const settledRef = useRef(false)
  const introRef = useRef(false)
  const introDoneRef = useRef(false)
  const lastModeRef = useRef('desktop')

  useFrame((state, delta) => {
    const mode = useAppStore.getState().viewMode
    const controls = controlsRef.current
    if (!controls) return

    // Boot intro: hold a distant framing until the boot overlay finishes,
    // then glide in to the desktop pose.
    if (!useAppStore.getState().booted) {
      if (!introRef.current) {
        introRef.current = true
        state.camera.position.copy(reduced ? CAMERA_POSES.desktop.position : INTRO_POSE)
        controls.update()
      }
      controls.enabled = false
      return
    }

    if (mode !== lastModeRef.current) {
      lastModeRef.current = mode
      settledRef.current = false
    }

    const zoomed = mode !== 'desktop'
    // Hand control back to the user only after the return flight settles,
    // so OrbitControls never fights the animation.
    controls.enabled = !zoomed && settledRef.current

    if (!settledRef.current) {
      const pose = CAMERA_POSES[mode]
      const tau = reduced ? 0.08 : introRef.current && !introDoneRef.current ? 0.7 : 0.45
      easing.damp3(state.camera.position, pose.position, tau, delta)
      easing.damp3(controls.target, pose.target, tau, delta)
      controls.update()
      if (
        state.camera.position.distanceTo(pose.position) < 0.01 &&
        controls.target.distanceTo(pose.target) < 0.01
      ) {
        settledRef.current = true
        introDoneRef.current = true
      }
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minPolarAngle={0}
      maxPolarAngle={Math.PI / 2 - 0.1}
      enableZoom={true}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      maxDistance={10}
      minDistance={1.2}
    />
  )
}

function LightingRig() {
  const ambientRef = useRef()
  const spotRef = useRef()
  const keyRef = useRef()
  const fillRef = useRef()
  const cursorLightRef = useRef()

  useFrame((state, delta) => {
    const photo = useAppStore.getState().viewMode === 'photo' ? 1 : 0
    const damp = (light, [hi, lo]) => {
      if (!light) return
      easing.damp(light, 'intensity', photo ? lo : hi, 0.35, delta)
    }
    damp(ambientRef.current, LIGHT_LEVELS.ambient)
    damp(spotRef.current, LIGHT_LEVELS.spot)
    damp(keyRef.current, LIGHT_LEVELS.key)
    damp(fillRef.current, LIGHT_LEVELS.fill)

    // Cursor-reactive cyan light that follows the pointer across the room
    const l = cursorLightRef.current
    if (l) {
      const { pointer } = state
      easing.damp3(l.position, [pointer.x * 4, 1 + pointer.y * 2.5, 3], 0.25, delta)
      easing.damp(l, 'intensity', photo ? 0.5 : 4.5, 0.35, delta)
    }
  })

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.3} />
      <spotLight
        ref={spotRef}
        position={[0, 8, 2]}
        angle={0.6}
        penumbra={0.8}
        intensity={25}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
        color="#cfefff"
      />
      <pointLight ref={keyRef} position={[3, 3, 5]} intensity={5} color="#9fdcff" />
      <pointLight ref={cursorLightRef} position={[0, 1, 3]} intensity={4.5} distance={9} decay={2} color="#5ce1f2" />
      <pointLight ref={fillRef} position={[-3, 3, 5]} intensity={3} color="#2ba7c4" />
    </>
  )
}

// Subtle pointer parallax: the desk + monitor tilt a few degrees toward the
// cursor while browsing the desktop; eased out when zoomed in.
function ParallaxGroup({ reduced, children }) {
  const ref = useRef()
  useFrame((state, delta) => {
    const g = ref.current
    if (!g) return
    const active = !reduced && useAppStore.getState().viewMode === 'desktop'
    const tx = active ? state.pointer.x * 0.07 : 0
    const ty = active ? -state.pointer.y * 0.03 : 0
    easing.damp(g.rotation, 'y', tx, 0.35, delta)
    easing.damp(g.rotation, 'x', ty, 0.35, delta)
  })
  return (
    <group ref={ref} position={[0, -1.5, 0]}>
      {children}
    </group>
  )
}

export default function Scene({ uploadedImages }) {
  const reduced = useReducedMotion()
  return (
    <>
      <fog attach="fog" args={['#04060a', 9, 30]} />
      <LightingRig />
      <Room />
      <GlyphField reduced={reduced} />

      <ParallaxGroup reduced={reduced}>
        <Desk />
        <CRTMonitor position={[0, 1.5, 0]} uploadedImages={uploadedImages} />
      </ParallaxGroup>

      <ContactShadows
        position={[0, -1.49, 0]}
        opacity={0.8}
        scale={15}
        blur={2}
        far={10}
        resolution={512}
        frames={1}
        color="#000000"
      />

      <CameraRig reduced={reduced} />
    </>
  )
}
