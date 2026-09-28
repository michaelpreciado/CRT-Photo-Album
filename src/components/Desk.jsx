export default function Desk() {
    return (
        <group>
            {/* Main Desk Surface */}
            <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[12, 8]} />
                <meshStandardMaterial
                    color="#0e1a24"
                    roughness={0.35}
                    metalness={0.5}
                />
            </mesh>

            {/* Cyan edge light strip along the front of the desk */}
            <mesh position={[0, -0.02, 4.005]}>
                <boxGeometry args={[12, 0.02, 0.01]} />
                <meshBasicMaterial color="#5ce1f2" toneMapped={false} />
            </mesh>

            {/* Desk Thickness/Edge */}
            <mesh receiveShadow position={[0, -0.05, 0]}>
                <boxGeometry args={[12, 0.1, 8]} />
                <meshStandardMaterial
                    color="#0a131b"
                    roughness={0.5}
                />
            </mesh>
        </group>
    )
}
