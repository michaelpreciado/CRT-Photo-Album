import { Text } from '@react-three/drei'
import { useEffect, useState, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import PhotoPlane from './PhotoPlane'
import PhotoView from './PhotoView'
import { useAppStore } from '../../store/useAppStore'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { OS_FONT } from './constants'
import { CLOSE_BTN, PAGE_SIZE, PAGER_PREV, PAGER_NEXT, cellAt, cellPosition, cursorToOS, overClose, overPager } from './layout'

// Content sits at z=0.5 in the OS scene (camera at z=5), so the window group is
// pre-shrunk by this factor: every child then reads 1:1 in OS units, which keeps
// pointer hit-testing exact.
const WIN_SCALE = (5 - 0.55) / 5

const easeOutBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2)
const easeInCubic = (t) => t * t * t

/** "My Pictures" window: pop-open / shrink-close, paged grid, hover + keyboard focus. */
export default function Window() {
  const images = useAppStore((s) => s.images)
  const imagesLoaded = useAppStore((s) => s.imagesLoaded)
  const page = useAppStore((s) => s.page)
  const selectedImage = useAppStore((s) => s.selectedImage)
  const focusIndex = useAppStore((s) => s.focusIndex)
  const kb = useAppStore((s) => s.kb)
  const reduced = useReducedMotion()
  const [hovered, setHovered] = useState(-1) // -2 = close, -3/-4 = pager prev/next

  const groupRef = useRef()
  const hoveredRef = useRef(-1)
  const progress = useRef(0)
  const countRef = useRef(0)

  const pages = Math.max(1, Math.ceil(images.length / PAGE_SIZE))
  const visible = images.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  useEffect(() => {
    countRef.current = visible.length
  }, [visible.length])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1) // a hitch must never skip the animation
    const { viewMode, cursor } = useAppStore.getState()
    const open = viewMode !== 'desktop'

    // Pop-open with a little overshoot; shrink away on close.
    const dur = reduced ? 0.001 : open ? 0.32 : 0.22
    progress.current = Math.max(0, Math.min(1, progress.current + (open ? delta : -delta) / dur))
    const g = groupRef.current
    if (g) {
      const p = progress.current
      const e = open ? easeOutBack(p) : easeInCubic(p)
      const s = reduced ? p : 0.55 + 0.45 * e
      g.scale.set(s * WIN_SCALE, s * WIN_SCALE, 1)
      g.position.y = (1 - Math.min(1, e)) * -0.7
      g.visible = p > 0.001
    }

    let next = -1
    if (viewMode === 'gallery') {
      const p = cursorToOS(cursor)
      if (overClose(p, 0.05)) next = -2
      else if (overPager(p, -1)) next = -3
      else if (overPager(p, 1)) next = -4
      else next = cellAt(p, countRef.current)
    }
    if (next !== hoveredRef.current) {
      hoveredRef.current = next
      setHovered(next)
    }
  })

  const active = kb ? focusIndex : hovered

  return (
    <>
      <group ref={groupRef} position={[0, 0, 0.5]} scale={0.55 * WIN_SCALE}>
        {/* Drop shadow */}
        <mesh position={[0.06, -0.08, -0.05]}>
          <planeGeometry args={[5.1, 3.6]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>

        {/* Border */}
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[5.05, 3.55]} />
          <meshBasicMaterial color="#5ce1f2" transparent opacity={0.45} />
        </mesh>

        {/* Body */}
        <mesh position={[0, 0, 0.03]}>
          <planeGeometry args={[5, 3.5]} />
          <meshBasicMaterial color="#08131b" />
        </mesh>

        {/* Title bar */}
        <mesh position={[0, 1.6, 0.04]}>
          <planeGeometry args={[4.9, 0.3]} />
          <meshBasicMaterial color="#0d2431" />
        </mesh>
        <mesh position={[0, 1.68, 0.041]}>
          <planeGeometry args={[4.9, 0.12]} />
          <meshBasicMaterial color="#5ce1f2" transparent opacity={0.08} />
        </mesh>
        <Text font={OS_FONT} position={[-2.35, 1.6, 0.06]} fontSize={0.17} color="white" anchorX="left" anchorY="middle">
          {images.length ? `My Pictures (${images.length})` : 'My Pictures'}
        </Text>

        {/* Window controls */}
        <mesh position={[1.8, 1.6, 0.06]}>
          <planeGeometry args={[0.2, 0.2]} />
          <meshBasicMaterial color="#163a4a" />
        </mesh>
        <mesh position={[2.0, 1.6, 0.06]}>
          <planeGeometry args={[0.2, 0.2]} />
          <meshBasicMaterial color="#163a4a" />
        </mesh>
        <mesh position={[CLOSE_BTN.x, 1.6, 0.06]}>
          <planeGeometry args={[0.2, 0.2]} />
          <meshBasicMaterial color={hovered === -2 ? '#ff6b81' : '#7a2f3d'} />
        </mesh>
        <Text font={OS_FONT} position={[CLOSE_BTN.x, 1.6, 0.07]} fontSize={0.15} color="white" anchorX="center" anchorY="middle">
          x
        </Text>

        {/* Content area */}
        <mesh position={[0, -0.15, 0.04]}>
          <planeGeometry args={[4.8, 3]} />
          <meshBasicMaterial color="#050d14" />
        </mesh>

        {/* Gallery grid */}
        <group position={[0, 0, 0.1]}>
          {visible.map((img, i) => {
            const p = cellPosition(i)
            const on = active === i
            return (
              <group key={img} position={[p.x, p.y, 0]} scale={on ? 1.05 : 1}>
                <mesh position={[0, -0.03, -0.01]}>
                  <planeGeometry args={[1.36, 1.12]} />
                  <meshBasicMaterial color="#5ce1f2" transparent opacity={on ? (kb ? 0.5 : 0.18) : 0} />
                </mesh>
                <PhotoPlane url={img} width={1.2} height={0.9} />
                <Text font={OS_FONT} position={[0, -0.58, 0]} fontSize={0.11} color={on ? '#5ce1f2' : '#9db0c0'} anchorX="center">
                  {`Image ${page * PAGE_SIZE + i + 1}`}
                </Text>
              </group>
            )
          })}

          {pages > 1 && (
            <>
              <Text font={OS_FONT} position={[PAGER_PREV.x, PAGER_PREV.y, 0]} fontSize={0.13} color={page === 0 ? '#2b3a46' : hovered === -3 ? '#e9f2f7' : '#5ce1f2'} anchorX="center" anchorY="middle">
                {'< prev'}
              </Text>
              <Text font={OS_FONT} position={[0, PAGER_PREV.y, 0]} fontSize={0.12} color="#67798a" anchorX="center" anchorY="middle">
                {`page ${page + 1} / ${pages}`}
              </Text>
              <Text font={OS_FONT} position={[PAGER_NEXT.x, PAGER_NEXT.y, 0]} fontSize={0.13} color={page >= pages - 1 ? '#2b3a46' : hovered === -4 ? '#e9f2f7' : '#5ce1f2'} anchorX="center" anchorY="middle">
                {'next >'}
              </Text>
            </>
          )}

          {images.length === 0 && (
            <Text font={OS_FONT} position={[0, 0, 0]} color="#67798a" fontSize={0.18} anchorX="center" maxWidth={4}>
              {imagesLoaded ? 'No images yet - use Upload Images' : 'Loading images...'}
            </Text>
          )}
        </group>
      </group>

      {/* Fullscreen photo view — fills the whole CRT screen */}
      {selectedImage && <PhotoView url={selectedImage} />}
    </>
  )
}
