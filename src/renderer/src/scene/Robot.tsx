// Robot nhỏ bên trái (robot hiện đại: vỏ gốm trắng ngà, mặt kính đen, mắt LED xanh ngọc, bánh xe gọn): nhìn theo con trỏ,
// chớp mắt, buồn ngủ rồi ngủ khi lâu không thao tác, bị chọc thì bẹp-giãn, báo động khi có việc đến hạn (đèn trạng thái
// chuyển đỏ nhấp nháy, nhún nhảy), ăn mừng khi hoàn thành việc.
// Khớp: root (xoay về phía màn hình) › fx (nhảy / bẹp / xoay) › body › neck › headYaw › headPitch › eyes
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { easing } from 'maath'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  MeshBasicMaterial,
  SphereGeometry,
  TorusGeometry,
  type Group,
  type Mesh,
  type Sprite
} from 'three'
import { env } from './envState'
import { merged, roundedBox } from './geometry'
import { hud } from './hudRefs'
import { materials } from './materials'
import { projectPoint } from './math/framing'
import { CAMERA } from './math/layout'
import { MAX_PITCH, MAX_YAW, lookAngles, pointerTarget } from './math/lookAt'
import { reducedMotion } from './motion'
import { ROBOT } from './palette3d'
import { pointer } from './pointer'
import { policy, requestFrame } from './renderLoop'
import { pokeRobot, robot } from './robotState'
import { stage } from './stage'
import { blobTexture, haloTexture } from './textures'

/** Robot xoay 12° về phía màn hình */
const ROOT_YAW = (12 * Math.PI) / 180
/** Chiều cao cổ (điểm xoay đầu) và tâm mắt */
const NECK_Y = 0.105
const EYE_Y = 0.148

const TAU = Math.PI * 2

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function Robot(): React.JSX.Element {
  const root = useRef<Group>(null)
  const fx = useRef<Group>(null)
  const body = useRef<Group>(null)
  const headYaw = useRef<Group>(null)
  const headPitch = useRef<Group>(null)
  const eyes = useRef<Group>(null)
  const happy = useRef<Group>(null)
  const led = useRef<Mesh>(null)
  const ledHalo = useRef<Sprite>(null)
  const coreHalo = useRef<Sprite>(null)
  const eyeHalo = useRef<Sprite>(null)
  const blink = useRef({ start: -1, double: false })

  // Robot hiện đại: vỏ gốm trắng ngà, đai và khớp graphite, mặt kính đen bóng, mắt LED xanh ngọc, vòng sáng ở cổ, bánh xe gọn
  const m = materials()
  const eyeMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT.eye, toneMapped: false }), [])
  // Đèn trạng thái (vạch pin, dải đèn trước, vòng cổ, đầu ăng-ten): xanh ngọc, đỏ nhấp nháy khi báo động
  const ledMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT.led, toneMapped: false }), [])
  const ledNormal = useMemo(() => new Color(ROBOT.led), [])
  const ledAlert = useMemo(() => new Color(ROBOT.alert), [])
  // Mảnh tĩnh cùng khớp, cùng vật liệu gộp chung một lần vẽ
  const parts = useMemo(() => {
    type V3 = [number, number, number]
    const side = (s: number, x: number, y: number, z: number): V3 => [s * x, y, z]
    const eye = new CapsuleGeometry(0.0068, 0.011, 4, 10)
    const smile = new TorusGeometry(0.008, 0.0022, 6, 16, Math.PI)
    return {
      wheels: merged('robot-wheels', [-1, 1].map((s) => ({ geo: new CylinderGeometry(0.016, 0.016, 0.012, 24), at: side(s, 0.039, 0.016, 0), rot: [0, 0, Math.PI / 2] as V3 }))),
      hubs: merged('robot-hubs', [-1, 1].map((s) => ({ geo: new CylinderGeometry(0.008, 0.008, 0.002, 18), at: side(s, 0.0455, 0.016, 0), rot: [0, 0, Math.PI / 2] as V3 }))),
      arms: merged('robot-arms', [-1, 1].map((s) => ({ geo: new CapsuleGeometry(0.0078, 0.028, 4, 10), at: side(s, 0.052, 0.055, 0.004), rot: [0, 0, s * 0.35] as V3 }))),
      shoulders: merged('robot-shoulders', [-1, 1].map((s) => ({ geo: new SphereGeometry(0.0088, 14, 10), at: side(s, 0.046, 0.072, 0.004) }))),
      hands: merged('robot-hands', [-1, 1].map((s) => ({ geo: new SphereGeometry(0.009, 14, 10), at: side(s, 0.0605, 0.031, 0.004) }))),
      // Ba vạch pin trên ngực
      bars: merged('robot-bars', [-0.009, 0, 0.009].map((x) => ({ geo: new BoxGeometry(0.0055, 0.015, 0.001), at: [x, 0, 0] as V3 }))),
      // Tai: hai khối tròn graphite, nắp nhôm anod xanh ngọc
      ears: merged('robot-ears', [-1, 1].map((s) => ({ geo: new CylinderGeometry(0.013, 0.013, 0.008, 24), at: side(s, 0.058, 0.046, 0), rot: [0, 0, Math.PI / 2] as V3 }))),
      earCaps: merged('robot-ear-caps', [-1, 1].map((s) => ({ geo: new CylinderGeometry(0.008, 0.008, 0.002, 20), at: side(s, 0.0625, 0.046, 0), rot: [0, 0, Math.PI / 2] as V3 }))),
      eyes: merged('robot-eyes', [-1, 1].map((s) => ({ geo: eye, at: side(s, 0.02, 0, 0) }))),
      happy: merged('robot-happy', [-1, 1].map((s) => ({ geo: smile, at: side(s, 0.02, -0.003, 0) })))
    }
  }, [])

  // Chớp mắt ngẫu nhiên mỗi 2,5–6 s (20% chớp đôi) — hẹn giờ, không kiểm tra mỗi khung
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const next = (): void => {
      t = setTimeout(
        () => {
          // Tiết kiệm / vẽ bằng CPU: không chớp mắt (đứng yên = 0 khung hình)
          if (robot.mode !== 'sleep' && policy.quality !== 'saver' && !policy.software) {
            blink.current = { start: performance.now(), double: Math.random() < 0.2 }
            requestFrame()
          }
          next()
        },
        2500 + Math.random() * 3500
      )
    }
    next()
    return () => clearTimeout(t)
  }, [])

  // Đang báo động: nhấp nháy đèn ăng-ten (2 lần/giây, sau 15 giây thì chậm lại) — chỉ vẽ lúc đèn đổi
  useEffect(() => {
    const iv = setInterval(() => {
      if (robot.mode === 'alert') requestFrame()
    }, 250)
    return () => clearInterval(iv)
  }, [])

  useFrame((_state, delta) => {
    // Khung đầu tiên sau một lúc đứng yên có delta rất lớn → giới hạn để hoạt cảnh không nhảy
    const dt = Math.min(delta, 0.1)
    const l = stage.layout
    const now = performance.now()
    const mode = robot.mode
    const t = (now - robot.since) / 1000
    const reduced = reducedMotion()
    const r = root.current
    if (!r || !fx.current || !body.current || !headYaw.current || !headPitch.current || !eyes.current) return
    r.position.set(l.robot.x, 0, l.robot.z)

    // ---- Nhìn đi đâu ----
    const head = { x: l.robot.x, y: EYE_Y, z: l.robot.z }
    const aspect = stage.viewport.width / Math.max(1, stage.viewport.height)
    let target: { x: number; y: number; z: number }
    if (mode === 'sleep' || mode === 'drowsy') target = { x: head.x + 0.1, y: -0.3, z: head.z + 0.6 }
    else if (mode === 'lampReact') target = { x: l.lamp.x, y: 0.4, z: l.lamp.z }
    else if (mode === 'alert' || mode === 'poked' || mode === 'celebrate' || mode === 'intro' || (!pointer.inside && now - pointer.lastMoveAt > 1500))
      target = stage.camera
    else target = pointerTarget({ x: pointer.x, y: pointer.y }, stage.camera, CAMERA, aspect, head)
    const look = lookAngles(head, target, ROOT_YAW)
    const smooth = reduced ? 0.25 : 0.12
    let moving = false
    moving = easing.dampAngle(body.current.rotation, 'y', look.yaw * 0.3, 0.35, dt) || moving
    moving = easing.dampAngle(headYaw.current.rotation, 'y', look.yaw * 0.7, smooth, dt) || moving
    moving = easing.dampAngle(headPitch.current.rotation, 'x', -look.pitch, smooth, dt) || moving
    moving = easing.damp(eyes.current.position, 'x', (0.0055 * look.yaw) / MAX_YAW, 0.05, dt) || moving
    moving = easing.damp(eyes.current.position, 'y', (0.004 * look.pitch) / MAX_PITCH, 0.05, dt) || moving

    // ---- Hoạt cảnh theo trạng thái ----
    const f = fx.current
    let hop = 0
    let squash = 1
    let spin = 0
    let scale = 1
    let eyeOpen = 1
    let eyeScale = 1
    if (!reduced) {
      if (mode === 'intro') {
        scale = Math.max(0.01, easeOutBack(Math.min(1, t / 0.9)))
        moving = true
      } else if (mode === 'startled') {
        hop = 0.025 * Math.sin(Math.PI * Math.min(1, t / 0.25))
        moving = true
      } else if (mode === 'poked') {
        squash = 1 - 0.16 * Math.sin(TAU * Math.min(1, t / 0.45)) * (1 - t / 0.45)
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 0.9)
        hop = 0.04 * Math.sin(Math.PI * p)
        spin = TAU * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
        moving = true
      } else if (mode === 'alert' && t < 15) {
        hop = 0.012 * Math.abs(Math.sin((Math.PI * t) / 0.6))
        moving = true
      }
    }
    if (mode === 'drowsy') eyeOpen = 0.4 + 0.15 * Math.sin(now / 900)
    if (mode === 'sleep') eyeOpen = 0.08
    if (mode === 'alert') eyeScale = 1.15
    // Chớp mắt
    const b = blink.current
    if (b.start > 0) {
      const bt = now - b.start
      const len = b.double ? 330 : 150
      if (bt < len) {
        const phase = (bt % 165) / 165
        eyeOpen *= Math.max(0.08, Math.abs(1 - 2 * phase))
        moving = true
      } else b.start = -1
    }
    f.position.y = hop
    f.rotation.y = spin
    f.scale.set(scale / Math.sqrt(squash), scale * squash, scale / Math.sqrt(squash))
    eyes.current.scale.set(eyeScale, eyeScale * eyeOpen, eyeScale)
    const celebrating = mode === 'celebrate'
    eyes.current.visible = !celebrating
    if (happy.current) happy.current.visible = celebrating

    // Đèn ăng-ten: xanh bình thường, đỏ nhấp nháy khi báo động
    if (mode === 'alert') {
      const rate = t < 15 ? 2 : 1
      const on = Math.floor(t * rate * 2) % 2 === 0
      ledMat.color.copy(on ? ledAlert : ledNormal).multiplyScalar(on ? 1 : 0.35)
    } else ledMat.color.copy(ledNormal)
    // Phòng tối: mắt và đèn ăng-ten phát sáng rõ hơn
    const dark = 1 - env.env
    if (eyeHalo.current) eyeHalo.current.material.opacity = 0.35 * dark * (mode === 'sleep' ? 0.2 : 1)
    if (coreHalo.current) {
      coreHalo.current.material.opacity = (0.3 + 0.5 * dark) * (mode === 'sleep' ? 0.35 : 1)
      coreHalo.current.material.color.copy(mode === 'alert' ? ledMat.color : ledNormal)
    }
    if (ledHalo.current) {
      ledHalo.current.material.opacity = (mode === 'alert' ? 0.9 : 0.5 * dark) * (mode === 'sleep' ? 0.3 : 1)
      ledHalo.current.material.color.copy(ledMat.color)
    }

    // Vị trí "Zzz" và bong bóng thoại trên đầu robot (lớp HUD)
    if (hud.zzz || hud.bubble) {
      // Điểm cố định trên đầu robot (không nhún theo robot: bong bóng đứng yên cho dễ bấm)
      const p = projectPoint({ x: l.robot.x, y: 0.3, z: l.robot.z }, stage.camera, CAMERA, stage.viewport)
      if (hud.zzz) hud.zzz.style.transform = `translate(${Math.round(p.x + 6)}px, ${Math.round(p.y - 14)}px)`
      const b = hud.bubble
      if (b && hud.bubbleW) {
        // Chỉ nằm trong khoảng trống bên trái màn hình, đuôi chỉ xuống đầu robot
        const x = Math.round(Math.max(8, Math.min(p.x - hud.bubbleW * 0.3, stage.screenRect.x - 12 - hud.bubbleW)))
        const y = Math.round(Math.max(8, p.y - hud.bubbleH - 10))
        b.style.transform = `translate(${x}px, ${y}px)`
        b.style.setProperty('--tail', `${Math.round(Math.min(hud.bubbleW - 16, Math.max(16, p.x - x)))}px`)
      }
    }

    robot.headYaw = body.current.rotation.y + headYaw.current.rotation.y
    robot.headPitch = -headPitch.current.rotation.x
    robot.settled = !moving
    if (moving) requestFrame()
  })

  const poke = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation()
    pokeRobot()
  }
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const canvas = document.querySelector('.stage-canvas') as HTMLElement | null
    if (canvas) canvas.style.cursor = on ? 'pointer' : ''
  }

  return (
    <group ref={root} rotation-y={ROOT_YAW}>
      <mesh position={[0, 0.0012, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.16, 0.13]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} opacity={0.8} />
      </mesh>
      <group ref={fx}>
        {/* Gầm graphite, hai bánh xe cao su moay-ơ nhôm, dải đèn phía trước */}
        <mesh geometry={roundedBox(0.066, 0.02, 0.07, 0.008, 3)} position-y={0.018} material={m.graphite} castShadow />
        <mesh geometry={parts.wheels} material={m.rubber} castShadow />
        <mesh geometry={parts.hubs} material={m.aluminium} />
        <mesh position={[0, 0.018, 0.0356]} material={ledMat}>
          <boxGeometry args={[0.034, 0.003, 0.0015]} />
        </mesh>
        <group ref={body}>
          {/* Thân vỏ gốm, đai graphite, ô kính trên ngực có vạch pin */}
          <mesh geometry={roundedBox(0.084, 0.07, 0.066, 0.02, 4)} position-y={0.056} material={m.shell} castShadow />
          <mesh geometry={roundedBox(0.0856, 0.008, 0.0676, 0.004, 2)} position-y={0.03} material={m.graphite} />
          <mesh geometry={roundedBox(0.042, 0.028, 0.004, 0.005, 2)} position={[0, 0.06, 0.032]} material={m.glass} />
          <mesh geometry={parts.bars} position={[0, 0.06, 0.0343]} material={ledMat} />
          <sprite ref={coreHalo} position={[0, 0.06, 0.04]} scale={[0.06, 0.06, 1]}>
            <spriteMaterial map={haloTexture()} color={ROBOT.led} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0.5} />
          </sprite>
          {/* Tay graphite, khớp vai nhôm, bàn tay tròn vỏ gốm */}
          <mesh geometry={parts.arms} material={m.graphite} castShadow />
          <mesh geometry={parts.shoulders} material={m.aluminium} />
          <mesh geometry={parts.hands} material={m.shell} />
          {/* Cổ graphite, vòng sáng */}
          <mesh position-y={0.097} material={m.graphite}>
            <cylinderGeometry args={[0.011, 0.012, 0.016, 16]} />
          </mesh>
          <mesh position-y={0.094} rotation-x={Math.PI / 2} material={ledMat}>
            <torusGeometry args={[0.0126, 0.0015, 6, 28]} />
          </mesh>
          <group ref={headYaw} position-y={NECK_Y}>
            <group ref={headPitch}>
              {/* Đầu vỏ gốm, mặt kính đen bóng */}
              <mesh geometry={roundedBox(0.11, 0.085, 0.086, 0.026, 4)} position-y={0.043} material={m.shell} castShadow onClick={poke} onPointerOver={hover(true)} onPointerOut={hover(false)} />
              <mesh geometry={roundedBox(0.094, 0.06, 0.012, 0.016, 3)} position={[0, 0.044, 0.038]} material={m.glass} />
              <group position={[0, EYE_Y - NECK_Y, 0.0445]}>
                <group ref={eyes}>
                  <mesh geometry={parts.eyes} material={eyeMat} />
                </group>
                {/* Mắt cười ^^ khi ăn mừng */}
                <group ref={happy} visible={false}>
                  <mesh geometry={parts.happy} material={eyeMat} />
                </group>
                <sprite ref={eyeHalo} scale={[0.09, 0.06, 1]}>
                  <spriteMaterial map={haloTexture()} color={ROBOT.eye} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
                </sprite>
                {/* Miệng: nụ cười nhỏ */}
                <mesh position={[0, -0.013, 0]} rotation-z={Math.PI} material={eyeMat}>
                  <torusGeometry args={[0.0055, 0.0015, 6, 12, Math.PI]} />
                </mesh>
              </group>
              <mesh geometry={parts.ears} material={m.graphite} />
              <mesh geometry={parts.earCaps} material={m.anodized} />
              {/* Ăng-ten nhôm mảnh, đầu là đèn trạng thái (đỏ khi báo động) */}
              <mesh position={[0, 0.1025, 0]} material={m.aluminium}>
                <cylinderGeometry args={[0.0014, 0.0014, 0.034, 8]} />
              </mesh>
              <mesh ref={led} position={[0, 0.12, 0]} material={ledMat}>
                <sphereGeometry args={[0.0058, 14, 10]} />
              </mesh>
              <sprite ref={ledHalo} position={[0, 0.12, 0]} scale={[0.05, 0.05, 1]}>
                <spriteMaterial map={haloTexture()} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
              </sprite>
            </group>
          </group>
          {/* Vùng bấm thân robot */}
          <mesh position-y={0.06} visible={false} onClick={poke} onPointerOver={hover(true)} onPointerOut={hover(false)}>
            <boxGeometry args={[0.1, 0.12, 0.08]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
