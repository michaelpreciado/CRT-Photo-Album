import { Text } from '@react-three/drei'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import FolderIcon from './FolderIcon'
import Window from './Window'
import { useAppStore } from '../../store/useAppStore'
import { OS_FONT } from './constants'
import { FOLDER_POS, cursorToOS, overFolder } from './layout'
import { useReducedMotion } from '../../hooks/useReducedMotion'

function getFormattedTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Bliss-style wallpaper drawn in a single fragment shader — one draw call
 *  instead of the previous nine layered planes. */
const WallpaperShader = {
  uniforms: { time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float time;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    // Blocky pseudo-glyph: 3x5 random pixel grid inside a cell.
    float glyph(vec2 cell, vec2 f, float seed) {
      vec2 g = floor(f * vec2(3.0, 5.0));
      float on = step(0.5, hash(cell + g * 7.31 + seed));
      vec2 m = abs(fract(f * vec2(3.0, 5.0)) - 0.5);
      return on * step(max(m.x, m.y), 0.36);
    }

    void main() {
      vec2 uv = vUv;
      vec3 bg = vec3(0.016, 0.024, 0.04);
      // Lit cyan bloom centre + deep-blue falloff
      float d = length((uv - vec2(0.5, 0.55)) * vec2(1.0, 1.15));
      vec3 col = bg + vec3(0.02, 0.09, 0.13) * smoothstep(0.75, 0.0, d);

      // Glyph rain: columns of falling cells, brightest at the head
      vec2 grid = vec2(46.0, 38.0);
      vec2 p = uv * grid;
      vec2 cell = floor(p);
      vec2 f = fract(p);
      float colId = cell.x;
      float speed = 0.05 + 0.09 * hash(vec2(colId, 1.0));
      float head = fract(time * speed + hash(vec2(colId, 9.0)));
      float y = cell.y / grid.y;
      float dist = mod(head - y + 1.0, 1.0); // 0 at head, grows up the trail
      float trail = smoothstep(0.42, 0.0, dist) * step(0.02, hash(vec2(colId, 4.0)) );
      float flick = step(0.35, hash(cell + floor(time * 4.0 * hash(cell))));
      float g = glyph(cell, f, floor(time * 1.5 + hash(cell) * 6.0));
      float rain = g * trail * flick;
      vec3 rainCol = mix(vec3(0.17, 0.65, 0.77), vec3(0.36, 0.88, 0.95), smoothstep(0.1, 0.0, dist));
      rainCol = mix(rainCol, vec3(0.91, 0.95, 0.97), smoothstep(0.02, 0.0, dist));
      // Keep the centre calmer so windows/icons stay legible
      float calm = mix(0.35, 1.0, smoothstep(0.15, 0.6, abs(uv.x - 0.5)));
      col += rainCol * rain * 0.55 * calm;

      // Faint perspective grid horizon
      float gl = smoothstep(0.02, 0.0, abs(fract(uv.x * 20.0) - 0.5) - 0.48) * 0.5;
      col += vec3(0.05, 0.16, 0.2) * gl * smoothstep(0.28, 0.0, uv.y) * 0.6;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

export default function Desktop() {
  const [time, setTime] = useState(getFormattedTime)
  const [folderHighlighted, setFolderHighlighted] = useState(false)

  const windowMounted = useAppStore((s) => s.windowMounted)
  const imageCount = useAppStore((s) => s.images.length)
  const reduced = useReducedMotion()

  const cursorRef = useRef()
  const wallpaperRef = useRef()
  const highlightedRef = useRef(false)

  const wallpaperShader = useMemo(
    () => ({ ...WallpaperShader, uniforms: { time: { value: 0 } } }),
    [],
  )

  // Live clock — updates once per minute.
  useEffect(() => {
    const interval = setInterval(() => setTime(getFormattedTime()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Cursor + hover run imperatively every frame; React state only changes
  // when the hover boolean actually flips.
  useFrame((state) => {
    const { cursor, viewMode } = useAppStore.getState()
    const p = cursorToOS(cursor)

    if (cursorRef.current) {
      cursorRef.current.position.x = p.x
      cursorRef.current.position.y = p.y
    }

    // Wallpaper rain is frozen under reduced motion.
    if (wallpaperRef.current) {
      wallpaperRef.current.uniforms.time.value = reduced ? 3.7 : state.clock.elapsedTime
    }

    const over = viewMode === 'desktop' && overFolder(p)
    if (over !== highlightedRef.current) {
      highlightedRef.current = over
      setFolderHighlighted(over)
    }
  })

  return (
    <group>
      {/* Wallpaper */}
      <mesh position={[0, 0.3, -1]}>
        <planeGeometry args={[10, 8]} />
        <shaderMaterial ref={wallpaperRef} args={[wallpaperShader]} />
      </mesh>

      <FolderIcon
        position={[FOLDER_POS.x, FOLDER_POS.y, 0]}
        label="My Pictures"
        count={imageCount}
        highlighted={folderHighlighted}
      />

      {windowMounted && <Window />}

      {/* Cursor */}
      <group ref={cursorRef} position={[0, 0, 2]}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <coneGeometry args={[0.08, 0.25, 3]} />
          <meshBasicMaterial color="#5ce1f2" depthTest={false} />
        </mesh>
        <mesh position={[0.02, -0.02, 0]} rotation={[0, 0, Math.PI / 4]}>
          <coneGeometry args={[0.06, 0.2, 3]} />
          <meshBasicMaterial color="#04060a" depthTest={false} />
        </mesh>
      </group>

      {/* Taskbar — glass strip with a cyan hairline */}
      <mesh position={[0, -2.14, 0.1]}>
        <planeGeometry args={[10, 0.38]} />
        <meshBasicMaterial color="#07121a" />
      </mesh>
      <mesh position={[0, -1.95, 0.11]}>
        <planeGeometry args={[10, 0.012]} />
        <meshBasicMaterial color="#5ce1f2" transparent opacity={0.55} />
      </mesh>

      {/* Start button */}
      <mesh position={[-2.25, -2.14, 0.11]}>
        <planeGeometry args={[0.95, 0.3]} />
        <meshBasicMaterial color="#0c2a35" />
      </mesh>
      <mesh position={[-2.25, -2.14, 0.115]}>
        <planeGeometry args={[0.93, 0.28]} />
        <meshBasicMaterial color="#0a1c26" />
      </mesh>
      <Text font={OS_FONT} position={[-2.25, -2.14, 0.12]} fontSize={0.17} color="#5ce1f2" anchorX="center" anchorY="middle">
        Start
      </Text>

      {/* Clock tray */}
      <mesh position={[2.2, -2.14, 0.11]}>
        <planeGeometry args={[1.05, 0.3]} />
        <meshBasicMaterial color="#0a1c26" />
      </mesh>
      <Text font={OS_FONT} position={[2.2, -2.14, 0.12]} fontSize={0.14} color="#9db0c0" anchorX="center" anchorY="middle">
        {time}
      </Text>
    </group>
  )
}
