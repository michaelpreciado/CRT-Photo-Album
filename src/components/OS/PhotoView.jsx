import { useCallback, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { easing } from 'maath'
import PhotoPlane from './PhotoPlane'
import { useAppStore } from '../../store/useAppStore'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { FULL_SIZE } from '../../utils/textures'
import { SCREEN_WIDTH, SCREEN_HEIGHT, OS_FONT } from './constants'

const BOX_W = SCREEN_WIDTH * 0.94
const BOX_H = SCREEN_HEIGHT * 0.8
const VIEW_W = SCREEN_WIDTH * 0.98
const VIEW_H = SCREEN_HEIGHT * 0.86
const BASE_Y = 0.16
// The viewer sits at z=1.5 (camera z=5): pre-shrink so children read 1:1 in OS units.
const PERSP = (5 - 1.5) / 5

// Drawn from two bars so it stays crisp and independent of font glyph coverage.
function Chevron({ x, dir }) {
  return (
    <group position={[x, 0.1, 0.35]} scale={[dir, 1, 1]}>
      <mesh position={[0.02, 0.11, 0]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.34, 0.06]} />
        <meshBasicMaterial color="#5ce1f2" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0.02, -0.11, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <planeGeometry args={[0.34, 0.06]} />
        <meshBasicMaterial color="#5ce1f2" transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

/** Fullscreen viewer: contain-fit, eased zoom + pan (wheel, pinch, keys, drag). */
export default function PhotoView({ url }) {
  const images = useAppStore((s) => s.images)
  const reduced = useReducedMotion()
  const zoomRef = useRef()
  const hudZoom = useRef()
  const lastPct = useRef(100)
  const size = useRef({ w: BOX_W, h: BOX_H })
  const cur = useRef({ zoom: 1, x: 0, y: 0 })

  const onSize = useCallback((w, h) => {
    size.current = { w, h }
  }, [])

  useFrame((_, delta) => {
    const pv = useAppStore.getState().photoView
    const { w, h } = size.current
    // keep the image covering the viewport while zoomed
    const maxX = Math.max(0, (w * pv.zoom - VIEW_W) / 2)
    const maxY = Math.max(0, (h * pv.zoom - VIEW_H) / 2)
    pv.x = Math.max(-maxX, Math.min(maxX, pv.x))
    pv.y = Math.max(-maxY, Math.min(maxY, pv.y))

    const c = cur.current
    const tau = reduced ? 0.001 : 0.1
    easing.damp(c, 'zoom', pv.zoom, tau, delta)
    easing.damp(c, 'x', pv.x, tau, delta)
    easing.damp(c, 'y', pv.y, tau, delta)
    const g = zoomRef.current
    if (g) {
      g.scale.setScalar(c.zoom)
      g.position.set(c.x, BASE_Y + c.y, 0.05)
    }
    const t = hudZoom.current
    if (t) {
      t.visible = pv.zoom > 1.05
      const pct = Math.round(c.zoom * 10) * 10
      if (t.visible && pct !== lastPct.current) {
        lastPct.current = pct
        t.text = `${pct}%`
        t.sync()
      }
    }
  })

  const i = images.indexOf(url)
  const many = images.length > 1

  return (
    <group position={[0, 0, 1.5]} scale={PERSP}>
      <mesh>
        <planeGeometry args={[SCREEN_WIDTH * 2, SCREEN_HEIGHT * 2]} />
        <meshBasicMaterial color="#03060a" />
      </mesh>

      <group ref={zoomRef} position={[0, BASE_Y, 0.05]}>
        <PhotoPlane key={url} url={url} width={BOX_W} height={BOX_H} fit="contain" maxSize={FULL_SIZE} onSize={onSize} />
      </group>

      {/* Bottom HUD strip */}
      <mesh position={[0, -1.98, 0.3]}>
        <planeGeometry args={[SCREEN_WIDTH * 2, 0.34]} />
        <meshBasicMaterial color="#03060a" />
      </mesh>
      <Text font={OS_FONT} position={[0, -1.98, 0.35]} fontSize={0.12} color="#5ce1f2" anchorX="center" anchorY="middle">
        {`${i >= 0 ? i + 1 : '-'} / ${images.length}    scroll or pinch to zoom    ${many ? 'arrows browse    ' : ''}esc back`}
      </Text>

      {many && (
        <>
          <Chevron x={-SCREEN_WIDTH / 2 + 0.3} dir={-1} />
          <Chevron x={SCREEN_WIDTH / 2 - 0.3} dir={1} />
        </>
      )}

      <Text ref={hudZoom} visible={false} font={OS_FONT} position={[SCREEN_WIDTH / 2 - 0.5, SCREEN_HEIGHT / 2 - 0.3, 0.35]} fontSize={0.16} color="#e9f2f7" anchorX="center" anchorY="middle">
        100%
      </Text>
    </group>
  )
}
