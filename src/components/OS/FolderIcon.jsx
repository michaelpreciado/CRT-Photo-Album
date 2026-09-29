import { memo } from 'react'
import { Text } from '@react-three/drei'
import { OS_FONT } from './constants'

function FolderIcon({ position, label, highlighted, count }) {
  const scale = highlighted ? 1.08 : 1
  return (
    <group position={position} scale={scale}>
      {/* Selection highlight */}
      {highlighted && (
        <mesh position={[0, -0.1, -0.02]}>
          <planeGeometry args={[0.85, 0.95]} />
          <meshBasicMaterial color="#5ce1f2" transparent opacity={0.16} />
        </mesh>
      )}

      {/* Folder back panel */}
      <mesh position={[0, 0.02, -0.01]}>
        <boxGeometry args={[0.52, 0.42, 0.02]} />
        <meshBasicMaterial color={highlighted ? '#2ba7c4' : '#1a6a80'} />
      </mesh>

      {/* Folder tab */}
      <mesh position={[-0.13, 0.24, -0.01]}>
        <boxGeometry args={[0.22, 0.09, 0.02]} />
        <meshBasicMaterial color={highlighted ? '#2ba7c4' : '#1a6a80'} />
      </mesh>

      {/* Folder front panel — lighter, XP style */}
      <mesh position={[0, -0.02, 0.01]}>
        <boxGeometry args={[0.52, 0.36, 0.02]} />
        <meshBasicMaterial color={highlighted ? '#5ce1f2' : '#2e9db6'} />
      </mesh>

      <Text
        font={OS_FONT}
        position={[0, -0.38, 0.02]}
        fontSize={0.15}
        color="white"
        anchorX="center"
        anchorY="top"
        outlineWidth={0.012}
        outlineColor="#04060a"
      >
        {label}
      </Text>
      {count > 0 && (
        <Text font={OS_FONT} position={[0, -0.58, 0.02]} fontSize={0.1} color="#67798a" anchorX="center" anchorY="top">
          {`${count} item${count === 1 ? '' : 's'}`}
        </Text>
      )}
    </group>
  )
}

export default memo(FolderIcon)
