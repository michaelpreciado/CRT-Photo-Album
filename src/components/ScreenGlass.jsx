import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, PlaneGeometry } from 'three'
import { useAppStore } from '../store/useAppStore'

// Curved glass over the CRT: a gently bulged plane that adds only light
// (additive) — a soft-box reflection that slides as the camera moves,
// a fresnel rim, and a faint window streak. Costs one cheap draw call and
// never blocks pointer events.
const vertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const fragment = /* glsl */ `
  uniform float uStrength;
  uniform float uTime;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec2 vUv;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    vec3 R = reflect(-V, N);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    // Big overhead soft box + a narrow window strip off to the left
    float box = smoothstep(0.55, 0.92, dot(R, normalize(vec3(0.25, 0.85, 0.45))));
    float strip = smoothstep(0.90, 0.985, dot(R, normalize(vec3(-0.65, 0.25, 0.72)))) * 0.7;
    // Diagonal specular sheen that drifts with view angle
    float sheen = smoothstep(0.0, 0.5, 0.5 - abs(vUv.x * 0.9 + vUv.y * 0.55 - 0.85 - R.x * 0.6)) * 0.35;

    // Fine dust/smudge on the glass, very faint
    float g = fract(sin(dot(floor(vUv * 90.0), vec2(12.9898, 78.233))) * 43758.5453);
    float smudge = (g - 0.5) * 0.008;

    vec3 tint = vec3(0.45, 0.88, 1.0);
    vec3 col = tint * (box * 0.085 + strip * 0.1 + sheen * 0.05 + fres * 0.16) + smudge;
    // rounded corners
    vec2 d = abs(vUv - 0.5) - vec2(0.5) + 0.02;
    float m = 1.0 - smoothstep(0.0, 0.02, length(max(d, 0.0)));
    gl_FragColor = vec4(max(col, 0.0) * uStrength * m, 1.0);
  }
`

export default function ScreenGlass({ width = 1.9, height = 1.6, bulge = 0.05, ...props }) {
  const matRef = useRef()
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(width, height, 28, 24)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (width / 2)
      const y = p.getY(i) / (height / 2)
      p.setZ(i, bulge * (1 - 0.5 * (x * x + y * y)))
    }
    g.computeVertexNormals()
    return g
  }, [width, height, bulge])
  const uniforms = useMemo(() => ({ uStrength: { value: 1 }, uTime: { value: 0 } }), [])

  useFrame((state, delta) => {
    const m = matRef.current
    if (!m) return
    // Reflections calm down when a photo is open so the image reads clean.
    const photo = useAppStore.getState().viewMode === 'photo' ? 0.45 : 1
    const u = m.uniforms.uStrength
    u.value += (photo - u.value) * Math.min(1, delta * 4)
  })

  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={2} {...props}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertex}
        fragmentShader={fragment}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}
