// Budkin — robot bánh xe vui tính (vỏ gốm trắng ngà, mặt kính đen, mắt LED xanh ngọc, ăng-ten có đèn trạng thái):
// bị chọc thì bẹp-giãn, ăn mừng thì nhảy xoay một vòng, báo động thì nhún nhảy, đèn ăng-ten đỏ nhấp nháy.
// Khớp: fx (nhảy / bẹp / xoay) › body › neck › headYaw › headPitch › eyes
import { easing } from 'maath'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BoxGeometry, CapsuleGeometry, Color, CylinderGeometry, MeshBasicMaterial, SphereGeometry, TorusGeometry, type Group, type Sprite } from 'three'
import { merged, roundedBox } from '../geometry'
import { materials } from '../materials'
import { MAX_PITCH, MAX_YAW } from '../math/lookAt'
import { ROBOT } from '../palette3d'
import { robot } from '../robotState'
import { haloTexture } from '../textures'
import { TAU, easeOutBack, pokeHandlers } from './common'
import { useRobotRig } from './rig'

/** Chiều cao cổ (điểm xoay đầu) và tâm mắt, so với mặt bệ */
const NECK_Y = 0.105
const EYE_Y = 0.148

export function Budkin(): React.JSX.Element {
  const fx = useRef<Group>(null)
  const body = useRef<Group>(null)
  const headYaw = useRef<Group>(null)
  const headPitch = useRef<Group>(null)
  const eyes = useRef<Group>(null)
  const happy = useRef<Group>(null)
  const ledHalo = useRef<Sprite>(null)
  const coreHalo = useRef<Sprite>(null)
  const eyeHalo = useRef<Sprite>(null)

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

  useRobotRig({ eyeY: EYE_Y, zzzY: 0.29 }, (f) => {
    if (!fx.current || !body.current || !headYaw.current || !headPitch.current || !eyes.current) return false
    const { dt, mode, t, look } = f
    const smooth = f.reduced ? 0.25 : 0.12
    let moving = false
    moving = easing.dampAngle(body.current.rotation, 'y', look.yaw * 0.3, 0.35, dt) || moving
    moving = easing.dampAngle(headYaw.current.rotation, 'y', look.yaw * 0.7, smooth, dt) || moving
    moving = easing.dampAngle(headPitch.current.rotation, 'x', -look.pitch, smooth, dt) || moving
    moving = easing.damp(eyes.current.position, 'x', (0.0055 * look.yaw) / MAX_YAW, 0.05, dt) || moving
    moving = easing.damp(eyes.current.position, 'y', (0.004 * look.pitch) / MAX_PITCH, 0.05, dt) || moving

    // ---- Hoạt cảnh theo trạng thái ----
    let hop = 0
    let squash = 1
    let spin = 0
    let scale = 1
    if (!f.reduced) {
      if (mode === 'intro') {
        scale = Math.max(0.01, easeOutBack(Math.min(1, t / 0.9)))
        moving = true
      } else if (mode === 'startled') {
        hop = 0.025 * Math.sin(Math.PI * Math.min(1, t / 0.25))
        moving = true
      } else if (mode === 'poked') {
        squash = 1 - 0.16 * Math.sin(TAU * Math.min(1, t / 0.45)) * (1 - Math.min(1, t / 0.45))
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 0.9)
        hop = 0.04 * Math.sin(Math.PI * p)
        spin = TAU * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)
        moving = true
      } else if (f.alertHop) {
        hop = 0.012 * Math.abs(Math.sin((Math.PI * t) / 0.6))
        moving = true
      }
    }
    const eyeScale = mode === 'alert' ? 1.15 : 1
    const fxg = fx.current
    fxg.position.y = hop
    fxg.rotation.y = spin
    fxg.scale.set(scale / Math.sqrt(squash), scale * squash, scale / Math.sqrt(squash))
    eyes.current.scale.set(eyeScale, eyeScale * f.eyeOpen, eyeScale)
    const celebrating = mode === 'celebrate'
    eyes.current.visible = !celebrating
    if (happy.current) happy.current.visible = celebrating

    // Đèn ăng-ten: xanh bình thường, đỏ nhấp nháy khi báo động
    if (mode === 'alert') ledMat.color.copy(f.alertOn ? ledAlert : ledNormal).multiplyScalar(f.alertOn ? 1 : 0.35)
    else ledMat.color.copy(ledNormal)
    // Phòng tối: mắt và đèn ăng-ten phát sáng rõ hơn
    const sleeping = mode === 'sleep'
    if (eyeHalo.current) eyeHalo.current.material.opacity = 0.35 * f.dark * (sleeping ? 0.2 : 1)
    if (coreHalo.current) {
      coreHalo.current.material.opacity = (0.3 + 0.5 * f.dark) * (sleeping ? 0.35 : 1)
      coreHalo.current.material.color.copy(mode === 'alert' ? ledMat.color : ledNormal)
    }
    if (ledHalo.current) {
      ledHalo.current.material.opacity = (mode === 'alert' ? 0.9 : 0.5 * f.dark) * (sleeping ? 0.3 : 1)
      ledHalo.current.material.color.copy(ledMat.color)
    }
    robot.headYaw = body.current.rotation.y + headYaw.current.rotation.y
    robot.headPitch = -headPitch.current.rotation.x
    return moving
  })

  return (
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
            <mesh geometry={roundedBox(0.11, 0.085, 0.086, 0.026, 4)} position-y={0.043} material={m.shell} castShadow {...pokeHandlers} />
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
            <mesh position={[0, 0.12, 0]} material={ledMat}>
              <sphereGeometry args={[0.0058, 14, 10]} />
            </mesh>
            <sprite ref={ledHalo} position={[0, 0.12, 0]} scale={[0.05, 0.05, 1]}>
              <spriteMaterial map={haloTexture()} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
            </sprite>
          </group>
        </group>
        {/* Vùng bấm thân robot */}
        <mesh position-y={0.06} visible={false} {...pokeHandlers}>
          <boxGeometry args={[0.1, 0.12, 0.08]} />
        </mesh>
      </group>
    </group>
  )
}
