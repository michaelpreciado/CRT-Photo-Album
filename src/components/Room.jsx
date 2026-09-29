export default function Room() {
  return (
    <>
      {/* Floor — dark glass, slightly reflective */}
      <mesh position={[0, -1.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#0a141d" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 10, -15]} receiveShadow>
        <planeGeometry args={[50, 30]} />
        <meshStandardMaterial color="#0a1119" roughness={0.95} side={2} />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, 20, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#04060a" roughness={1} />
      </mesh>
    </>
  )
}
