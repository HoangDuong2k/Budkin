// Đèn LED làm việc hiện đại = công tắc theme: đế tròn graphite có nút cảm ứng và vòng sáng báo trạng thái, tay đòn nhôm
// đôi song song, khớp graphite viền xanh ngọc, đầu đèn nhôm dẹt với tấm tản quang trắng ấm. Bấm vào đèn (hoặc Ctrl+Shift+L)
// để bật / tắt: nút lún, tiếng tách, đèn chớp khi bật; SpotLight của đèn là đèn duy nhất đổ bóng.
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  MeshBasicMaterial,
  Quaternion,
  TorusGeometry,
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
import { merged, roundedBox, type Part } from './geometry'
import { materials } from './materials'
import { LAMP } from './palette3d'
import { requestFrame } from './renderLoop'
import { stage } from './stage'
import { blobTexture, haloTexture } from './textures'

/** Cường độ đèn bàn (candela, mét) */
const LAMP_I = 1.0

// Khung đèn trong toạ độ của đế (đơn vị mét): đế → khuỷu → khớp đầu đèn
const BASE_TOP = new Vector3(0, 0.024, 0)
const ELBOW = new Vector3(0.028, 0.26, -0.02)
const HEADJ = new Vector3(-0.04, 0.42, 0.012)
/** Hướng đầu đèn: chúc xuống, về phía bàn phím */
const AIM = new Vector3(-0.55, -1, 0.42).normalize()
/** Tâm tấm tản quang (mặt dưới đầu đèn) */
const PANEL = HEADJ.clone().addScaledVector(AIM, 0.019)

type V3 = [number, number, number]
const xyz = (v: Vector3): V3 => [v.x, v.y, v.z]
const eulerOf = (q: Quaternion): V3 => {
  const e = new Euler().setFromQuaternion(q)
  return [e.x, e.y, e.z]
}

/** Thanh nối a → b: vị trí giữa, hướng (trục y dọc thanh), chiều dài */
function segment(a: Vector3, b: Vector3): { mid: Vector3; quat: Quaternion; len: number } {
  const dir = b.clone().sub(a)
  return { mid: a.clone().add(b).multiplyScalar(0.5), quat: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()), len: dir.length() }
}

/** Hai thanh nhôm song song (lệch ±7,5 mm theo trục z của thanh) */
function twinBars(a: Vector3, b: Vector3): Part[] {
  const s = segment(a, b)
  return [-1, 1].map((k) => ({
    geo: roundedBox(0.0085, s.len + 0.012, 0.005, 0.002, 1),
    at: xyz(s.mid.clone().add(new Vector3(0, 0, 0.0075 * k).applyQuaternion(s.quat))),
    rot: eulerOf(s.quat)
  }))
}

/** Khớp: trụ ngắn trục z */
function knuckle(at: Vector3, r: number): Part {
  return { geo: new CylinderGeometry(r, r, 0.02, 20), at: xyz(at), rot: [Math.PI / 2, 0, 0] }
}

export function Lamp(): React.JSX.Element {
  const group = useRef<Group>(null)
  const sw = useRef<Mesh>(null)
  const spot = useRef<SpotLight>(null)
  const target = useRef<Object3D>(null)
  const halo = useRef<Sprite>(null)
  const toggle = useTheme((s) => s.toggle)
  const headQuat = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), AIM), [])
  const geo = useMemo(() => {
    const headRot = eulerOf(headQuat)
    // Viền nhôm quanh tấm tản quang, trong toạ độ đầu đèn rồi đưa về toạ độ đế
    const bezel = new TorusGeometry(0.039, 0.0016, 6, 40)
    bezel.rotateX(Math.PI / 2)
    bezel.translate(0, -0.0185, 0)
    return {
      // Đế tròn dẹt, mép vát
      base: new LatheGeometry([new Vector2(0, 0), new Vector2(0.054, 0), new Vector2(0.054, 0.013), new Vector2(0.05, 0.0172), new Vector2(0, 0.0172)], 40),
      // Mọi phần nhôm gộp một lần vẽ: viền trên đế, 2 cặp tay đòn, viền tấm tản quang
      aluminium: merged('lamp-aluminium', [
        { geo: new TorusGeometry(0.0505, 0.0014, 6, 48), at: [0, 0.0166, 0], rot: [Math.PI / 2, 0, 0] },
        ...twinBars(BASE_TOP, ELBOW),
        ...twinBars(ELBOW, HEADJ),
        { geo: bezel, at: xyz(HEADJ), rot: headRot }
      ]),
      // Khớp graphite ở chân, khuỷu, đầu
      knuckles: merged('lamp-knuckles', [knuckle(BASE_TOP, 0.0085), knuckle(ELBOW, 0.0095), knuckle(HEADJ, 0.0095)]),
      // Viền xanh ngọc hai bên mỗi khớp
      rings: merged(
        'lamp-rings',
        [ELBOW, HEADJ].flatMap((p) => [-1, 1].map((k) => ({ geo: new TorusGeometry(0.0096, 0.0011, 5, 24), at: [p.x, p.y, p.z + 0.0101 * k] as V3 })))
      )
    }
  }, [headQuat])
  // Đế và đầu đèn riêng của đèn (rê chuột thì ánh lên — không làm sáng lây vật khác dùng chung vật liệu)
  const bodyMat = useMemo(() => materials().graphite.clone(), [])
  const headMat = useMemo(() => materials().aluminium.clone(), [])
  const m = materials()
  const panelMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
  const panelOff = useMemo(() => new Color('#3a4450'), [])
  const panelOn = useMemo(() => new Color(LAMP.panel), [])
  // Vòng sáng quanh nút cảm ứng: tắt thì mờ, bật thì xanh ngọc
  const ringMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
  const ringOff = useMemo(() => new Color('#10302d'), [])
  const ringOn = useMemo(() => new Color('#56e0d6'), [])

  useFrame(() => {
    const l = stage.layout
    group.current?.position.set(l.lamp.x, 0, l.lamp.z)
    if (sw.current) sw.current.position.y = 0.0185 - 0.0015 * env.press
    // Rê chuột lên đèn: đế và đầu đèn ánh xanh ngọc
    const glow = env.lampHover ? 1 : 0
    bodyMat.emissive.setRGB(0.01 * glow, 0.06 * glow, 0.055 * glow)
    headMat.emissive.setRGB(0.01 * glow, 0.06 * glow, 0.055 * glow)
    panelMat.color.lerpColors(panelOff, panelOn, env.bulb)
    ringMat.color.lerpColors(ringOff, ringOn, env.bulb)
    if (halo.current) {
      halo.current.material.opacity = 0.85 * env.bulb
      halo.current.scale.setScalar(0.11 + 0.04 * env.bulb)
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
      <mesh geometry={geo.base} material={bodyMat} castShadow receiveShadow />
      <mesh geometry={geo.aluminium} material={m.aluminium} castShadow />
      <mesh geometry={geo.knuckles} material={m.graphite} />
      <mesh geometry={geo.rings} material={m.anodized} />
      {/* Nút cảm ứng + vòng sáng trạng thái */}
      <mesh ref={sw} position={[0, 0.0185, 0.028]} material={m.graphiteGloss}>
        <cylinderGeometry args={[0.0085, 0.0085, 0.003, 24]} />
      </mesh>
      <mesh position={[0, 0.0174, 0.028]} rotation-x={Math.PI / 2} material={ringMat}>
        <torusGeometry args={[0.0102, 0.0012, 6, 28]} />
      </mesh>
      {/* Đầu đèn: đĩa nhôm dẹt, mặt dưới là tấm tản quang */}
      <group position={HEADJ} quaternion={headQuat}>
        <mesh position-y={-0.0115} material={headMat} castShadow>
          <cylinderGeometry args={[0.042, 0.044, 0.013, 40]} />
        </mesh>
        <mesh position-y={-0.0182} rotation-x={Math.PI / 2} material={panelMat}>
          <circleGeometry args={[0.037, 40]} />
        </mesh>
      </group>
      <sprite ref={halo} position={PANEL}>
        <spriteMaterial map={haloTexture()} color={LAMP.light} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} />
      </sprite>
      <spotLight
        ref={spot}
        position={PANEL}
        color={LAMP.light}
        angle={0.66}
        penumbra={0.8}
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
        <planeGeometry args={[0.16, 0.16]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} opacity={0.8} />
      </mesh>
      {/* Vùng bấm rộng hơn thân đèn (dễ trúng) — vô hình nhưng vẫn nhận tia chuột */}
      <mesh position={[-0.015, 0.25, 0]} visible={false} onClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
        <boxGeometry args={[0.13, 0.5, 0.12]} />
      </mesh>
    </group>
  )
}
