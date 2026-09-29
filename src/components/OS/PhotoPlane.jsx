import { memo, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useImageTexture, THUMB_SIZE } from '../../utils/textures'
import { OS_FONT } from './constants'

/**
 * A photo in the OS plane with a loading placeholder, an error tile and a
 * fade-in. `fit="cover"` crops to fill the box (gallery), `fit="contain"`
 * letterboxes to the image's own aspect (fullscreen viewer).
 */
function PhotoPlane({ url, width, height, fit = 'cover', maxSize = THUMB_SIZE, onSize }) {
  const { status, texture, aspect } = useImageTexture(url, maxSize)
  const matRef = useRef()
  const shimmerRef = useRef()
  const fade = useRef(0)

  useFrame((state, delta) => {
    if (status === 'ready' && matRef.current) {
      fade.current = Math.min(1, fade.current + delta * 4)
      matRef.current.opacity = 1 - Math.pow(1 - fade.current, 3)
    }
    if (status === 'loading' && shimmerRef.current) {
      const t = state.clock.elapsedTime
      shimmerRef.current.opacity = 0.1 + 0.07 * Math.sin(t * 5)
    }
  })

  const boxAspect = width / height
  let w = width
  let h = height
  let repeatX = 1
  let repeatY = 1
  if (fit === 'contain') {
    if (aspect > boxAspect) h = width / aspect
    else w = height * aspect
  } else if (aspect > boxAspect) {
    repeatX = boxAspect / aspect
  } else {
    repeatY = aspect / boxAspect
  }

  // Crop (cover) via texture transform — applied outside render.
  useLayoutEffect(() => {
    if (!texture) return
    texture.repeat.set(repeatX, repeatY)
    texture.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2)
  }, [texture, repeatX, repeatY])

  useLayoutEffect(() => {
    if (status === 'ready') onSize?.(w, h)
  }, [status, w, h, onSize])

  if (status === 'error') {
    return (
      <group key="error">
        <mesh>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial color="#1a0d12" />
        </mesh>
        <Text font={OS_FONT} fontSize={Math.min(width, height) * 0.13} color="#ff6b81" anchorX="center" anchorY="middle" position={[0, 0, 0.01]}>
          {'unavailable'}
        </Text>
      </group>
    )
  }

  if (status !== 'ready') {
    return (
      <mesh key="loading">
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial ref={shimmerRef} color="#5ce1f2" transparent opacity={0.12} />
      </mesh>
    )
  }

  // Distinct keys matter: swapping a material without `map` for one with it
  // in place would keep the old (map-less) shader program.
  return (
    <mesh key="ready" scale={[w / width, h / height, 1]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial ref={matRef} map={texture} transparent opacity={0} toneMapped={false} />
    </mesh>
  )
}

export default memo(PhotoPlane)
