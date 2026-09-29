// Đèn bàn = công tắc theme. Bấm vào đèn (hoặc Ctrl+Shift+L) để bật / tắt: công tắc lún, tiếng tách,
// bóng chớp khi bật; SpotLight của đèn là đèn duy nhất đổ bóng.
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  Color,
  LatheGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type Object3D,
  type SpotLight,
  type Sprite
} from 'three'
import { useTheme } from '../state/themeStore'
import { env } from './envState'
import { materials } from './materials'
import { LAMP } from './palette3d'
import { requestFrame } from './renderLoop'
import { stage } from './stage'
import { blobTexture, haloTexture } from './textures'

/** Cường độ đèn bàn (candela, mét) */
const LAMP_I = 0.9

// Khung đèn trong toạ độ của đế (đơn vị mét): đế → khuỷu → khớp đầu đèn
const BASE_TOP = new Vector3(0, 0.024, 0)
const ELBOW = new Vector3(0.028, 0.26, -0.02)
const HEADJ = new Vector3(-0.04, 0.42, 0.012)
/** Hướng chụp đèn: chúc xuống, về phía bàn phím */
const AIM = new Vector3(-0.55, -1, 0.42).normalize()

/** Đoạn thẳng a → b: vị trí giữa, hướng, chiều dài (dựng khối trụ dọc theo đoạn) */
function segment(a: Vector3, b: Vector3): { mid: Vector3; quat: Quaternion; len: number } {
  const dir = b.clone().sub(a)
  return { mid: a.clone().add(b).multiplyScalar(0.5), quat: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()), len: dir.length() }
}

export function Lamp(): React.JSX.Element {
  const group = useRef<Group>(null)
  const sw = useRef<Mesh>(null)
  const spot = useRef<SpotLight>(null)
  const target = useRef<Object3D>(null)
  const halo = useRef<Sprite>(null)
  const toggle = useTheme((s) => s.toggle)
  const arm1 = useMemo(() => segment(BASE_TOP, ELBOW), [])
  const arm2 = useMemo(() => segment(ELBOW, HEADJ), [])
  const shadeQuat = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), AIM), [])
  const bulbPos = useMemo(() => HEADJ.clone().addScaledVector(AIM, 0.034), [])
  const baseGeo = useMemo(
    () => new LatheGeometry([new Vector2(0, 0), new Vector2(0.052, 0), new Vector2(0.052, 0.007), new Vector2(0.044, 0.016), new Vector2(0.022, 0.024), new Vector2(0, 0.026)], 28),
    []
  )
  // Chụp đèn hình chuông, mở về phía dưới (trục −y trước khi xoay). Điểm đi từ dưới lên để mặt ngoài quay ra ngoài
  const shadeGeo = useMemo(
    () => new LatheGeometry([new Vector2(0.047, -0.066), new Vector2(0.044, -0.058), new Vector2(0.032, -0.03), new Vector2(0.02, -0.006), new Vector2(0.012, 0.004)], 28),
    []
  )
  // Thân đồng thau riêng của đèn (rê chuột thì sáng lên — không làm sáng lây đồng thau của màn hình, robot)
  const bodyMat = useMemo(() => materials().brass.clone(), [])
  const jointMat = materials().brassDark
  // Chụp kính xanh lục kiểu đèn bàn làm việc cổ điển
  const shadeMat = materials().greenGlass
  const insideMat = useMemo(() => new MeshStandardMaterial({ color: LAMP.inside, side: BackSide, roughness: 0.6, emissive: new Color(LAMP.light) }), [])
  const bulbMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
  const bulbOff = useMemo(() => new Color('#8a857c'), [])
  const bulbOn = useMemo(() => new Color(LAMP.bulb), [])

  useFrame(() => {
    const l = stage.layout
    group.current?.position.set(l.lamp.x, 0, l.lamp.z)
    if (sw.current) sw.current.position.y = 0.028 - 0.004 * env.press
    // Rê chuột lên đèn: thân đồng thau ánh lên
    bodyMat.emissive.setRGB(env.lampHover ? 0.12 : 0, env.lampHover ? 0.08 : 0, 0)
    insideMat.emissiveIntensity = 0.9 * env.bulb
    bulbMat.color.lerpColors(bulbOff, bulbOn, env.bulb)
    if (halo.current) {
      halo.current.material.opacity = 0.9 * env.bulb
      halo.current.scale.setScalar(0.09 + 0.03 * env.bulb)
    }
    if (spot.current && target.current) {
      spot.current.intensity = LAMP_I * env.lamp
      spot.current.target = target.current
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation()
    toggle()
  }
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    env.lampHover = on
    const canvas = document.querySelector('.stage-canvas') as HTMLElement | null
    if (canvas) canvas.style.cursor = on ? 'pointer' : ''
    requestFrame()
  }

  return (
    <group ref={group}>
      <mesh geometry={baseGeo} material={bodyMat} castShadow receiveShadow />
      {/* Công tắc */}
      <mesh ref={sw} position={[0, 0.028, 0.024]} material={jointMat}>
        <cylinderGeometry args={[0.009, 0.009, 0.008, 16]} />
      </mesh>
      <mesh position={arm1.mid} quaternion={arm1.quat} material={bodyMat} castShadow>
        <capsuleGeometry args={[0.008, arm1.len, 4, 12]} />
      </mesh>
      <mesh position={ELBOW} material={jointMat}>
        <sphereGeometry args={[0.013, 16, 12]} />
      </mesh>
      <mesh position={arm2.mid} quaternion={arm2.quat} material={bodyMat} castShadow>
        <capsuleGeometry args={[0.008, arm2.len, 4, 12]} />
      </mesh>
      <mesh position={HEADJ} material={jointMat}>
        <sphereGeometry args={[0.012, 16, 12]} />
      </mesh>
      <group position={HEADJ} quaternion={shadeQuat}>
        <mesh geometry={shadeGeo} material={shadeMat} castShadow />
        <mesh geometry={shadeGeo} material={insideMat} />
      </group>
      <mesh position={bulbPos} material={bulbMat}>
        <sphereGeometry args={[0.013, 16, 12]} />
      </mesh>
      <sprite ref={halo} position={bulbPos}>
        <spriteMaterial map={haloTexture()} color={LAMP.light} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} />
      </sprite>
      <spotLight
        ref={spot}
        position={bulbPos}
        color={LAMP.light}
        angle={0.62}
        penumbra={0.75}
        distance={1.6}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-camera-near={0.02}
        shadow-camera-far={1.2}
      />
      <object3D ref={target} position={[-0.3, 0, 0.18]} />
      <mesh position={[0, 0.0012, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.15, 0.15]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} opacity={0.75} />
      </mesh>
      {/* Vùng bấm rộng hơn thân đèn (dễ trúng) — vô hình nhưng vẫn nhận tia chuột */}
      <mesh position={[-0.015, 0.25, 0]} visible={false} onClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
        <boxGeometry args={[0.13, 0.5, 0.12]} />
      </mesh>
    </group>
  )
}
