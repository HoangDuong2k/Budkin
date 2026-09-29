// Đồ trên bàn kiểu xưởng chế tác: bàn phím máy đánh chữ (phím tròn ngà viền đồng thau — mỗi loại vẽ một lần bằng
// InstancedMesh), bản vẽ kỹ thuật, bánh răng, cốc đồng đỏ, chậu dương xỉ đồng thau, chuột — kèm bóng mờ bên dưới.
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, MeshStandardMaterial, type Group, type InstancedMesh } from 'three'
import { gear, roundedBox } from './geometry'
import { materials } from './materials'
import { stage } from './stage'
import { blobTexture, blueprintTexture } from './textures'

function Blob({ w, d, at, opacity = 0.7 }: { w: number; d: number; at: [number, number]; opacity?: number }): React.JSX.Element {
  return (
    <mesh position={[at[0], 0.0014, at[1]]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} opacity={opacity} />
    </mesh>
  )
}

const ROWS = [11, 11, 10, 9]
const KEYS = ROWS.reduce((a, b) => a + b, 0)
const PITCH = 0.03

/** Bàn phím máy đánh chữ: thân sắt, nẹp đồng thau, phím tròn so le theo hàng */
function Typewriter(): React.JSX.Element {
  const caps = useRef<InstancedMesh>(null)
  const rims = useRef<InstancedMesh>(null)
  const m = materials()
  useLayoutEffect(() => {
    const mat = new Matrix4()
    let i = 0
    ROWS.forEach((n, r) => {
      const z = (r - (ROWS.length - 1) / 2) * 0.028 - 0.01
      const offset = r * 0.008
      for (let c = 0; c < n; c++) {
        const x = (c - (n - 1) / 2) * PITCH + offset - 0.012
        const y = 0.024 + r * 0.004
        mat.makeTranslation(x, y, z)
        caps.current?.setMatrixAt(i, mat)
        mat.makeTranslation(x, y - 0.0035, z)
        rims.current?.setMatrixAt(i, mat)
        i++
      }
    })
    if (caps.current) caps.current.instanceMatrix.needsUpdate = true
    if (rims.current) rims.current.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group position={[0, 0, 0.08]}>
      {/* Thân dốc về phía trước như máy đánh chữ */}
      <mesh geometry={roundedBox(0.4, 0.022, 0.15, 0.008, 2)} position-y={0.011} rotation-x={-0.06} material={m.iron} castShadow receiveShadow />
      <mesh position={[0, 0.006, 0.078]} material={m.brass}>
        <boxGeometry args={[0.4, 0.008, 0.006]} />
      </mesh>
      <instancedMesh ref={rims} args={[undefined, undefined, KEYS]} material={m.brass}>
        <cylinderGeometry args={[0.0118, 0.0118, 0.004, 16]} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, KEYS]} material={m.ivory} castShadow>
        <cylinderGeometry args={[0.0098, 0.0104, 0.006, 16]} />
      </instancedMesh>
      {/* Phím cách */}
      <mesh geometry={roundedBox(0.16, 0.007, 0.018, 0.0035, 2)} position={[0, 0.02, 0.06]} material={m.ivory} />
      <Blob w={0.5} d={0.24} at={[0, 0]} opacity={0.6} />
    </group>
  )
}

export function Props(): React.JSX.Element {
  const mouse = useRef<Group>(null)
  const mug = useRef<Group>(null)
  const plant = useRef<Group>(null)
  const sheet = useRef<Group>(null)
  const m = materials()
  const paper = useMemo(() => new MeshStandardMaterial({ map: blueprintTexture(), roughness: 0.85 }), [])
  useFrame(() => {
    const l = stage.layout
    mouse.current?.position.set(0.27, 0, 0.1)
    // Cốc bên phải, giữa chuột và đèn — bên trái để trống cho robot
    mug.current?.position.set(Math.min(0.38, l.screenW / 2 + 0.05), 0, 0.03)
    plant.current?.position.set(l.robot.x - 0.15, 0, -0.2)
    sheet.current?.position.set(-Math.min(0.32, l.screenW / 2 - 0.02), 0, 0.14)
  })
  return (
    <>
      <Typewriter />
      {/* Bản vẽ kỹ thuật nằm chéo trên bàn, bánh răng chặn giấy */}
      <group ref={sheet}>
        <mesh rotation={[-Math.PI / 2, 0, 0.18]} position-y={0.0016} material={paper} receiveShadow>
          <planeGeometry args={[0.24, 0.17]} />
        </mesh>
        <mesh geometry={gear(0.028, 10, 0.006)} rotation-x={-Math.PI / 2} position={[0.06, 0.005, 0.03]} material={m.brass} castShadow />
        <mesh geometry={gear(0.016, 8, 0.005)} rotation-x={-Math.PI / 2} position={[0.1, 0.004, 0.058]} material={m.copper} castShadow />
      </group>
      <group ref={mouse}>
        <mesh position-y={0.011} scale={[0.023, 0.013, 0.035]} material={m.ivory} castShadow>
          <sphereGeometry args={[1, 20, 12]} />
        </mesh>
        <mesh position={[0, 0.021, -0.012]} rotation-z={Math.PI / 2} material={m.brass}>
          <cylinderGeometry args={[0.004, 0.004, 0.006, 12]} />
        </mesh>
        <Blob w={0.08} d={0.1} at={[0, 0]} />
      </group>
      {/* Cốc đồng đỏ */}
      <group ref={mug}>
        <mesh position-y={0.03} material={m.copper} castShadow>
          <cylinderGeometry args={[0.026, 0.024, 0.06, 28]} />
        </mesh>
        <mesh position={[0.028, 0.032, 0]} rotation-z={Math.PI / 2} material={m.brassDark}>
          <torusGeometry args={[0.013, 0.0035, 8, 16, Math.PI]} />
        </mesh>
        <mesh position-y={0.056}>
          <cylinderGeometry args={[0.022, 0.022, 0.004, 20]} />
          <meshStandardMaterial color="#3b2014" roughness={0.25} />
        </mesh>
        <Blob w={0.09} d={0.09} at={[0, 0]} />
      </group>
      {/* Dương xỉ trong chậu đồng thau */}
      <group ref={plant}>
        <mesh position-y={0.028} material={m.brass} castShadow>
          <cylinderGeometry args={[0.034, 0.026, 0.056, 24]} />
        </mesh>
        {[
          [0, 0.1, 0, 0.034],
          [-0.024, 0.085, 0.01, 0.026],
          [0.025, 0.09, -0.008, 0.028],
          [0.004, 0.125, 0.006, 0.022]
        ].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} scale={[1, 1.25, 1]} material={i % 2 ? m.leafLight : m.leaf} castShadow>
            <icosahedronGeometry args={[r, 0]} />
          </mesh>
        ))}
        <Blob w={0.11} d={0.11} at={[0, 0]} />
      </group>
    </>
  )
}
