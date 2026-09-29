// Đồ trên bàn — thiết bị hiện đại của người sống sót: bàn phím nhôm mỏng có đèn nền xanh ngọc (mọi phím vẽ một lần bằng
// InstancedMesh), chuột, chậu thuỷ canh kính có mầm cây, máy tính bảng hiện bản đồ địa hình, trạm sạc di động nuôi
// màn hình — kèm bóng mờ bên dưới.
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Group,
  type InstancedMesh
} from 'three'
import { env } from './envState'
import { cable, merged, roundedBox } from './geometry'
import { materials } from './materials'
import { stage } from './stage'
import { blobTexture, dustTexture, powerDisplayTexture, tabletMapTexture } from './textures'

function Blob({ w, d, at, opacity = 0.7 }: { w: number; d: number; at: [number, number]; opacity?: number }): React.JSX.Element {
  return (
    <mesh position={[at[0], 0.0014, at[1]]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} opacity={opacity} />
    </mesh>
  )
}

const ROWS = [12, 12, 11, 10]
const KEYS = ROWS.reduce((a, b) => a + b, 0)
const PITCH = 0.027
const KEY_COLOR = '#252629'
/** Phím Esc màu nhấn */
const ACCENT_KEY = 0

/** Bàn phím nhôm mỏng, phím graphite, đèn nền xanh ngọc lọt qua khe phím (sáng rõ khi mất điện) */
function Keyboard(): React.JSX.Element {
  const keys = useRef<InstancedMesh>(null)
  const m = materials()
  // Màu từng phím nằm trong instanceColor → vật liệu để trắng
  const capMat = useMemo(() => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.2, map: dustTexture() }), [])
  const backlight = useMemo(
    () => new MeshBasicMaterial({ color: '#46d9cf', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    []
  )
  useLayoutEffect(() => {
    const k = keys.current
    if (!k) return
    const mat = new Matrix4()
    const color = new Color()
    let i = 0
    ROWS.forEach((n, r) => {
      const z = (r - (ROWS.length - 1) / 2) * PITCH - 0.012
      const offset = r * 0.0065
      for (let c = 0; c < n; c++) {
        mat.makeTranslation((c - (n - 1) / 2) * PITCH + offset - 0.008, 0.0185, z)
        k.setMatrixAt(i, mat)
        k.setColorAt(i, color.set(i === ACCENT_KEY ? '#2c9e97' : KEY_COLOR))
        i++
      }
    })
    k.instanceMatrix.needsUpdate = true
    if (k.instanceColor) k.instanceColor.needsUpdate = true
  }, [])
  useFrame(() => {
    backlight.opacity = 0.08 + 0.42 * (1 - env.env)
  })
  return (
    <group position={[0, 0, 0.08]}>
      <group rotation-x={0.05}>
        <mesh geometry={roundedBox(0.4, 0.012, 0.14, 0.004, 2)} position-y={0.006} material={m.aluminium} castShadow receiveShadow />
        <mesh geometry={roundedBox(0.378, 0.002, 0.122, 0.001, 1)} position-y={0.0121} material={m.graphite} />
        <mesh position-y={0.0134} rotation-x={-Math.PI / 2} material={backlight}>
          <planeGeometry args={[0.37, 0.114]} />
        </mesh>
        <instancedMesh ref={keys} args={[roundedBox(0.0242, 0.007, 0.0242, 0.0028, 1), capMat, KEYS]} castShadow />
        {/* Phím cách */}
        <mesh geometry={roundedBox(0.14, 0.007, 0.0242, 0.0028, 1)} position={[0.004, 0.0185, 0.0555]} material={m.graphite} />
      </group>
      <Blob w={0.5} d={0.24} at={[0, 0]} opacity={0.6} />
    </group>
  )
}

/** Mầm cây: thân + 3 lá (gộp một lần vẽ) */
function sproutGeometry(): ReturnType<typeof merged> {
  const leaf = new IcosahedronGeometry(1, 0)
  return merged('sprout', [
    { geo: new CylinderGeometry(0.0016, 0.002, 0.05, 6), at: [0, 0.025, 0] },
    { geo: leaf, at: [-0.011, 0.047, 0.002], rot: [0, 0, 0.5], scale: [0.012, 0.004, 0.008] },
    { geo: leaf, at: [0.012, 0.052, -0.002], rot: [0, 0.4, -0.45], scale: [0.013, 0.004, 0.008] },
    { geo: leaf, at: [0.001, 0.058, 0.006], rot: [0.6, 0, 0.1], scale: [0.007, 0.003, 0.009] }
  ])
}

export function Props(): React.JSX.Element {
  const mouse = useRef<Group>(null)
  const pod = useRef<Group>(null)
  const power = useRef<Group>(null)
  const tablet = useRef<Group>(null)
  const m = materials()
  // Màn hình máy tính bảng: tự phát sáng, sáng rõ hơn khi phòng tối
  const mapMat = useMemo(() => {
    const map = tabletMapTexture()
    return new MeshStandardMaterial({ map, emissiveMap: map, emissive: new Color('#ffffff'), roughness: 0.25 })
  }, [])
  const displayMat = useMemo(() => new MeshBasicMaterial({ map: powerDisplayTexture(), toneMapped: false }), [])
  const jarMat = useMemo(
    () => new MeshStandardMaterial({ color: '#bcd6e8', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false, side: DoubleSide }),
    []
  )
  const soil = useMemo(() => new MeshStandardMaterial({ color: '#1d1b1a', roughness: 1 }), [])
  const geo = useMemo(
    () => ({
      sprout: sproutGeometry(),
      // Quai xách nhôm của trạm sạc
      handle: merged('power-handle', [
        { geo: roundedBox(0.012, 0.022, 0.014, 0.003, 1), at: [-0.036, 0.084, 0] },
        { geo: roundedBox(0.012, 0.022, 0.014, 0.003, 1), at: [0.036, 0.084, 0] },
        { geo: roundedBox(0.084, 0.01, 0.014, 0.003, 1), at: [0, 0.097, 0] }
      ]),
      // Dây nguồn từ hông trạm sạc luồn dưới đế màn hình (đủ dài ở mọi tỉ lệ cửa sổ)
      cord: cable(
        'power',
        [
          [0.056, 0.03, 0],
          [0.08, 0.008, 0.02],
          [0.16, 0.004, 0.05],
          [0.34, 0.004, 0.09],
          [0.6, 0.004, 0.14]
        ],
        0.0035
      )
    }),
    []
  )
  useFrame(() => {
    const l = stage.layout
    mapMat.emissiveIntensity = 0.55 + 0.45 * (1 - env.env)
    mouse.current?.position.set(0.27, 0, 0.1)
    // Chậu mầm cây bên phải, giữa chuột và đèn — bên trái để trống cho robot
    pod.current?.position.set(Math.min(0.38, l.screenW / 2 + 0.05), 0, 0.03)
    power.current?.position.set(l.robot.x - 0.16, 0, -0.2)
    tablet.current?.position.set(-Math.min(0.32, l.screenW / 2 - 0.02), 0, 0.14)
  })
  return (
    <>
      <Keyboard />
      {/* Máy tính bảng nằm chéo trên bàn, hiện bản đồ địa hình */}
      <group ref={tablet} rotation-y={0.14}>
        <mesh geometry={roundedBox(0.2, 0.008, 0.136, 0.006, 2)} position-y={0.004} material={m.graphiteGloss} castShadow receiveShadow />
        <mesh position-y={0.0082} rotation-x={-Math.PI / 2} material={mapMat}>
          <planeGeometry args={[0.186, 0.122]} />
        </mesh>
      </group>
      <group ref={mouse}>
        <mesh position-y={0.011} scale={[0.022, 0.012, 0.034]} material={m.graphiteGloss} castShadow>
          <sphereGeometry args={[1, 20, 12]} />
        </mesh>
        <mesh position={[0, 0.0225, -0.012]} rotation-z={Math.PI / 2} material={m.led}>
          <cylinderGeometry args={[0.0035, 0.0035, 0.004, 12]} />
        </mesh>
        <Blob w={0.08} d={0.1} at={[0, 0]} />
      </group>
      {/* Chậu thuỷ canh: đế nhôm có vòng LED, ống kính, mầm cây — dấu hiệu của hy vọng */}
      <group ref={pod}>
        <mesh position-y={0.005} material={m.aluminium} castShadow>
          <cylinderGeometry args={[0.028, 0.029, 0.01, 28]} />
        </mesh>
        <mesh position-y={0.0105} rotation-x={Math.PI / 2} material={m.led}>
          <torusGeometry args={[0.0262, 0.0011, 5, 32]} />
        </mesh>
        <mesh position-y={0.019} material={soil}>
          <cylinderGeometry args={[0.022, 0.022, 0.018, 20]} />
        </mesh>
        <mesh geometry={geo.sprout} position-y={0.028} material={m.leaf} castShadow />
        <mesh position-y={0.04} material={jarMat}>
          <cylinderGeometry args={[0.024, 0.024, 0.06, 28, 1, true]} />
        </mesh>
        <Blob w={0.09} d={0.09} at={[0, 0]} />
      </group>
      {/* Trạm sạc di động: vỏ graphite, quai nhôm, màn hình nhỏ, dải đèn trạng thái */}
      <group ref={power} rotation-y={0.12}>
        <mesh geometry={roundedBox(0.11, 0.075, 0.075, 0.012, 3)} position-y={0.0375} material={m.graphite} castShadow />
        <mesh geometry={geo.handle} material={m.aluminium} castShadow />
        <mesh position={[-0.02, 0.046, 0.0377]} material={displayMat}>
          <planeGeometry args={[0.046, 0.023]} />
        </mesh>
        <mesh position={[0.024, 0.046, 0.0376]} material={m.led}>
          <boxGeometry args={[0.022, 0.0022, 0.001]} />
        </mesh>
        <mesh geometry={geo.cord} material={m.rubber} />
        <Blob w={0.15} d={0.12} at={[0, 0]} />
      </group>
    </>
  )
}
