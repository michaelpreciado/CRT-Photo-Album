import { memo, useRef } from 'react'
import { OrbitControls, ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { easing } from 'maath'
import Room from './Room'
import Desk from './Desk'
import CRTMonitor from './CRTMonitor'
import GlyphField from './GlyphField'
import DustMotes from './DustMotes'
import { useAppStore } from '../store/useAppStore'
import { useQuality } from './quality'

const TAN_HALF_FOV = Math.tan((50 / 2) * (Math.PI / 180))
const INTRO_POSE = new Vector3(0, 1.3, 8.5)
const _pos = new Vector3()
const _target = new Vector3()

/**
 * Camera framing per view mode, fitted to the viewport so the CRT is never
 * cropped on narrow (portrait / mobile) screens: the distance is the larger of
 * the designed desktop distance and the one needed to fit the subject's width.
 * The screen face sits at ~[0, 0.08, 0.35].
 */
function poseFor(mode, aspect) {
  const fit = (width) => width / (2 * TAN_HALF_FOV * aspect)
  const portrait = Math.max(0, 1 - aspect) // 0 on landscape .. ~0.55 on phones
  if (mode === 'desktop') {
    const z = Math.max(4, fit(3.05))
    _pos.set(0, 0.5 + portrait * 0.5, z)
    _target.set(0, -portrait * 0.55, 0)
  } else if (mode === 'gallery') {
    const z = 0.35 + Math.max(2.55, fit(2.2))
    _pos.set(0, 0.1, z)
    _target.set(0, 0.08 - portrait * 0.12, 0.35)
  } else {
    const z = 0.35 + Math.max(2.1, fit(2.02))
    _pos.set(0, 0.08, z)
    _target.set(0, 0.08 - portrait * 0.1, 0.35)
  }
  return { position: _pos, target: _target }
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
  const lastAspectRef = useRef(0)

  useFrame((state, delta) => {
    const mode = useAppStore.getState().viewMode
    const controls = controlsRef.current
    if (!controls) return
    const aspect = state.size.width / state.size.height

    // Boot intro: hold a distant framing until the boot overlay finishes,
    // then glide in to the desktop pose.
    if (!useAppStore.getState().booted) {
      if (!introRef.current) {
        introRef.current = true
        const desk = poseFor('desktop', aspect)
        if (reduced) state.camera.position.copy(desk.position)
        else state.camera.position.copy(INTRO_POSE).setZ(INTRO_POSE.z + Math.max(0, desk.position.z - 4))
        controls.target.copy(desk.target)
        controls.update()
      }
      controls.enabled = false
      return
    }

    if (mode !== lastModeRef.current || Math.abs(aspect - lastAspectRef.current) > 0.001) {
      lastModeRef.current = mode
      lastAspectRef.current = aspect
      settledRef.current = false
    }

    const zoomed = mode !== 'desktop'
    // Hand control back to the user only after the return flight settles,
    // so OrbitControls never fights the animation.
    controls.enabled = !zoomed && settledRef.current
    controls.maxDistance = Math.max(10, poseFor('desktop', aspect).position.z * 1.6)

    if (!settledRef.current) {
      const pose = poseFor(mode, aspect)
      const tau = reduced ? 0.06 : introRef.current && !introDoneRef.current ? 0.7 : 0.45
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
  const { tier } = useQuality()
  const ambientRef = useRef()
  const spotRef = useRef()
  const keyRef = useRef()
  const fillRef = useRef()
  const cursorLightRef = useRef()
  const frame = useRef(0)

  useFrame((state, delta) => {
    // The shadow map barely changes (only the subtle parallax tilt moves
    // casters), so re-render it every 6th frame instead of every frame.
    state.gl.shadowMap.autoUpdate = false
    if (frame.current++ % 6 === 0) state.gl.shadowMap.needsUpdate = true

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
        castShadow={tier.shadows}
        shadow-mapSize={[tier.shadowMap, tier.shadowMap]}
        shadow-bias={-0.0001}
        color="#cfefff"
      />
      <pointLight ref={keyRef} position={[3, 3, 5]} intensity={5} color="#9fdcff" />
      <pointLight ref={cursorLightRef} position={[0, 1, 3]} intensity={4.5} distance={9} decay={2} color="#5ce1f2" />
      <pointLight ref={fillRef} position={[-3, 3, 5]} intensity={3} color="#2ba7c4" />
    </>
  )
}

// Procedural studio reflections (no HDR download): a cool overhead soft box,
// a cyan strip and a blue rim. Rendered to a cube map once, then reused by
// every standard material — this is what gives the desk, floor and casing
// their glossy, glassy look.
function Reflections() {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={0.55}>
      <color attach="background" args={['#03060b']} />
      <Lightformer form="rect" intensity={2.4} color="#d6f3ff" position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[12, 5, 1]} />
      <Lightformer form="rect" intensity={2.2} color="#5ce1f2" position={[-6, 1.5, 3]} rotation-y={Math.PI / 2} scale={[7, 1.2, 1]} />
      <Lightformer form="rect" intensity={1.4} color="#6aa6ff" position={[6, 2, -1]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} />
      <Lightformer form="ring" intensity={1.2} color="#5ce1f2" position={[0, 1, 8]} scale={3} />
    </Environment>
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

function Scene() {
  const { tier, reduced } = useQuality()
  return (
    <>
      <fog attach="fog" args={['#04060a', 9, 30]} />
      <LightingRig />
      {tier.env && <Reflections />}
      <Room />
      <GlyphField reduced={reduced} />
      <DustMotes count={tier.dust} reduced={reduced} />

      <ParallaxGroup reduced={reduced}>
        <Desk />
        <CRTMonitor position={[0, 1.5, 0]} />
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

export default memo(Scene)
