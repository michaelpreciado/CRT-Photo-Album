import { Text, Image } from '@react-three/drei'
import { useState, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAppStore } from '../../store/useAppStore'
import { SCREEN_WIDTH, SCREEN_HEIGHT, OS_FONT } from './constants'

const CLOSE_BTN = { x: 2.2, y: 1.5 }
const CLOSE_HIT_RADIUS = 0.2
const GRID_COLS = 3
const CELL_W = 1.5
const CELL_H = 1.2
const MAX_VISIBLE = 6

function cellPosition(i) {
  const row = Math.floor(i / GRID_COLS)
  const col = i % GRID_COLS
  return { x: -1.5 + col * CELL_W, y: 0.6 - row * CELL_H }
}

export default function Window({ clickTrigger, images }) {
  const selectedImage = useAppStore((s) => s.selectedImage)
  const [hovered, setHovered] = useState(-1) // -2 = close button

  const groupRef = useRef()
  const hoveredRef = useRef(-1)
  const imagesRef = useRef(images)
  useEffect(() => { imagesRef.current = images }, [images])

  const visibleImages = images ? images.slice(0, MAX_VISIBLE) : []
  const hiddenCount = images ? images.length - visibleImages.length : 0

  // Pop-open animation + hover tracking, all inside the frame loop.
  useFrame((_, delta) => {
    if (groupRef.current) {
      const s = groupRef.current.scale
      const k = 1 - Math.exp(-delta * 12)
      s.x = s.y = s.z = Math.min(1, s.x + (1 - s.x) * k + delta * 0.15)
    }

    const { cursor, viewMode } = useAppStore.getState()
    let next = -1
    if (viewMode === 'gallery') {
      const cx = cursor.x * (SCREEN_WIDTH / 2)
      const cy = cursor.y * (SCREEN_HEIGHT / 2)
      const dx = cx - CLOSE_BTN.x
      const dy = cy - CLOSE_BTN.y
      if (Math.sqrt(dx * dx + dy * dy) < CLOSE_HIT_RADIUS + 0.05) {
        next = -2
      } else {
        const imgs = imagesRef.current || []
        for (let i = 0; i < Math.min(imgs.length, MAX_VISIBLE); i++) {
          const p = cellPosition(i)
          if (Math.abs(cx - p.x) < 0.65 && Math.abs(cy - p.y) < 0.52) {
            next = i
            break
          }
        }
      }
    }
    if (next !== hoveredRef.current) {
      hoveredRef.current = next
      setHovered(next)
    }
  })

  // Fires only on click events (clickTrigger changes).
  useEffect(() => {
    if (clickTrigger === 0) return
    const { viewMode, cursor, closeGallery, closePhoto, selectPhoto } =
      useAppStore.getState()

    if (viewMode === 'photo') {
      closePhoto()
      return
    }
    if (viewMode !== 'gallery') return

    const cx = cursor.x * (SCREEN_WIDTH / 2)
    const cy = cursor.y * (SCREEN_HEIGHT / 2)

    const dx = cx - CLOSE_BTN.x
    const dy = cy - CLOSE_BTN.y
    if (Math.sqrt(dx * dx + dy * dy) < CLOSE_HIT_RADIUS) {
      closeGallery()
      return
    }

    const imgs = imagesRef.current || []
    for (let i = 0; i < Math.min(imgs.length, MAX_VISIBLE); i++) {
      const p = cellPosition(i)
      if (Math.abs(cx - p.x) < 0.6 && Math.abs(cy - p.y) < 0.5) {
        selectPhoto(imgs[i])
        break
      }
    }
  }, [clickTrigger])

  return (
    <>
      <group ref={groupRef} position={[0, 0, 0.5]} scale={0.85}>
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
        <Text
        font={OS_FONT}
          position={[-2.35, 1.6, 0.06]}
          fontSize={0.17}
          color="white"
          anchorX="left"
          anchorY="middle"
        >
          My Pictures
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
        <Text
        font={OS_FONT}
          position={[CLOSE_BTN.x, 1.6, 0.07]}
          fontSize={0.15}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          ×
        </Text>

        {/* Content area */}
        <mesh position={[0, -0.15, 0.04]}>
          <planeGeometry args={[4.8, 3]} />
          <meshBasicMaterial color="#050d14" />
        </mesh>

        {/* Gallery grid */}
        <group position={[0, 0, 0.1]}>
          {visibleImages.map((img, i) => {
            const p = cellPosition(i)
            const isHovered = hovered === i
            return (
              <group key={`${img}-${i}`} position={[p.x, p.y, 0]}>
                {isHovered && (
                  <mesh position={[0, -0.03, -0.01]}>
                    <planeGeometry args={[1.36, 1.12]} />
                    <meshBasicMaterial color="#5ce1f2" transparent opacity={0.14} />
                  </mesh>
                )}
                <Image url={img} scale={isHovered ? [1.26, 0.945] : [1.2, 0.9]} />
                <Text
        font={OS_FONT}
                  position={[0, -0.58, 0]}
                  fontSize={0.11}
                  color={isHovered ? '#5ce1f2' : '#9db0c0'}
                  anchorX="center"
                >
                  Image {i + 1}
                </Text>
              </group>
            )
          })}

          {hiddenCount > 0 && (
            <Text font={OS_FONT} position={[0, -1.35, 0]} fontSize={0.11} color="#67798a" anchorX="center">
              +{hiddenCount} more image{hiddenCount > 1 ? 's' : ''}
            </Text>
          )}

          {visibleImages.length === 0 && (
            <Text font={OS_FONT} position={[0, 0, 0]} color="#67798a" fontSize={0.2} anchorX="center">
              No images uploaded
            </Text>
          )}
        </group>
      </group>

      {/* Fullscreen photo view — fills the whole CRT screen */}
      {selectedImage && (
        <group position={[0, 0, 1.5]}>
          <mesh>
            <planeGeometry args={[SCREEN_WIDTH + 0.6, SCREEN_HEIGHT + 0.6]} />
            <meshBasicMaterial color="#03060a" />
          </mesh>
          <Image
            url={selectedImage}
            scale={[SCREEN_WIDTH * 0.92, SCREEN_HEIGHT * 0.82]}
            position={[0, 0.15, 0.05]}
          />
          <Text
        font={OS_FONT}
            position={[0, -2.0, 0.1]}
            fontSize={0.15}
            color="#5ce1f2"
            anchorX="center"
          >
            Click screen to go back · Save button exports this photo
          </Text>
        </group>
      )}
    </>
  )
}
