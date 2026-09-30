// Mech — người máy hai chân nghiêm túc: giáp vỏ gốm trên khung graphite, khớp nhôm, tay có kẹp, mũ graphite với dải đèn
// mắt trắng ấm quét trái phải theo hướng nhìn. Đứng nghiêm nhìn theo con trỏ. Bị chọc: chào kiểu nhà binh. Ăn mừng: giơ
// hai tay, bật nhảy. Báo động: giơ một tay xin chú ý, dải mắt đỏ nhấp nháy. Lơ mơ thì khuỵu gối, ngủ thì ngồi thụp xuống,
// mắt tắt dần. Chân gập theo độ cao hông (hai đoạn chân dài bằng nhau: góc gối tính thẳng từ độ cao).
import { easing } from 'maath'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BoxGeometry, CapsuleGeometry, Color, MeshBasicMaterial, SphereGeometry, type Group, type Sprite } from 'three'
import { merged, roundedBox } from '../geometry'
import { materials } from '../materials'
import { MAX_YAW } from '../math/lookAt'
import { ROBOT, ROBOT_EYES } from '../palette3d'
import { robot } from '../robotState'
import { haloTexture } from '../textures'
import { easeOutBack, pokeHandlers, pulse } from './common'
import { useRobotRig } from './rig'

/** Chiều dài đùi và cẳng chân */
const SEG = 0.036
/** Mắt cá chân (tâm bàn chân) cách mặt bệ */
const ANKLE = 0.006
/** Độ cao hông: đứng thẳng (gối hơi chùng), khuỵu gối (lơ mơ), ngồi thụp (ngủ) */
const HIP_STAND = ANKLE + 2 * SEG * 0.985
const HIP_DROWSY = HIP_STAND - 0.01
const HIP_SIT = ANKLE + 0.03
/** Từ hông tới cổ, từ cổ tới tâm mắt */
const TORSO_NECK = 0.07
const NECK_EYE = 0.026

/** Góc gập đùi (ra trước) để hông cao `h` trên mắt cá — gối gập gấp đôi về sau, bàn chân luôn nằm dưới hông */
function hipAngle(h: number): number {
  return Math.acos(Math.min(1, Math.max(0.2, (h - ANKLE) / (2 * SEG))))
}

export function Mech(): React.JSX.Element {
  const fx = useRef<Group>(null)
  const hips = useRef<Group>(null)
  const legs = { l: useRef<Group>(null), r: useRef<Group>(null) }
  const knees = { l: useRef<Group>(null), r: useRef<Group>(null) }
  const feet = { l: useRef<Group>(null), r: useRef<Group>(null) }
  const torso = useRef<Group>(null)
  const arms = { l: useRef<Group>(null), r: useRef<Group>(null) }
  const elbows = { l: useRef<Group>(null), r: useRef<Group>(null) }
  const headYaw = useRef<Group>(null)
  const headPitch = useRef<Group>(null)
  const eye = useRef<Group>(null)
  const eyeHalo = useRef<Sprite>(null)
  const coreHalo = useRef<Sprite>(null)
  /** Giá trị đổi từ từ: độ cao hông, tay trái / phải (vai giơ lên, khuỷu gập), hướng nhìn, vị trí dải mắt */
  const pose = useRef({ hip: HIP_STAND, lUp: 0, lBend: 0.25, rUp: 0, rBend: 0.25, rSide: 0, yaw: 0, pitch: 0, scan: 0 })
  const m = materials()
  const eyeMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT_EYES.mech, toneMapped: false }), [])
  const ledMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT.led, toneMapped: false }), [])
  const c = useMemo(() => ({ eye: new Color(ROBOT_EYES.mech), led: new Color(ROBOT.led), alert: new Color(ROBOT.alert) }), [])
  const parts = useMemo(() => {
    type V3 = [number, number, number]
    const sides = [-1, 1]
    return {
      thigh: new CapsuleGeometry(0.0082, SEG - 0.012, 4, 12),
      shin: new CapsuleGeometry(0.0088, SEG - 0.012, 4, 12),
      foot: roundedBox(0.022, 0.01, 0.034, 0.004, 2),
      upperArm: new CapsuleGeometry(0.0062, 0.018, 4, 10),
      forearm: new CapsuleGeometry(0.0068, 0.016, 4, 10),
      clamp: merged('mech-clamp', [-1, 1].map((s) => ({ geo: new BoxGeometry(0.0035, 0.012, 0.009), at: [s * 0.0045, 0, 0] as V3 }))),
      shoulders: merged('mech-shoulders', sides.map((s) => ({ geo: new SphereGeometry(0.0105, 16, 12), at: [s * 0.04, 0.056, 0] as V3 }))),
      // Khung graphite: tấm ngực, cổ
      frame: merged('mech-frame', [
        { geo: roundedBox(0.044, 0.03, 0.006, 0.006, 2), at: [0, 0.04, 0.0205] },
        { geo: roundedBox(0.014, 0.012, 0.014, 0.004, 2), at: [0, TORSO_NECK - 0.004, 0] }
      ])
    }
  }, [])

  useRobotRig({ eyeY: HIP_STAND + TORSO_NECK + NECK_EYE, zzzY: 0.23, blinks: false }, (f) => {
    const g = fx.current
    const tr = torso.current
    if (!g || !hips.current || !tr || !headYaw.current || !headPitch.current || !eye.current) return false
    const { dt, mode, t, reduced, now } = f
    const p0 = pose.current
    let moving = false
    let hipTarget = mode === 'sleep' ? HIP_SIT : mode === 'drowsy' ? HIP_DROWSY : HIP_STAND
    // Tay: 0 buông … 1 giơ thẳng lên; khuỷu gập 0 … 2.4 rad
    let lUp = 0
    let lBend = 0.25
    let rUp = 0
    let rBend = 0.25
    let rSide = 0
    let hop = 0
    let lean = 0
    if (mode === 'sleep') {
      // Ngồi thụp, hai tay đặt lên gối
      lUp = 0.28
      rUp = 0.28
      lBend = 1.1
      rBend = 1.1
    }
    if (!reduced) {
      if (mode === 'intro') {
        // Từ tư thế ngồi thụp đứng dậy
        const p = Math.min(1, t / 1.1)
        p0.hip = HIP_SIT + (HIP_STAND - HIP_SIT) * Math.min(1, easeOutBack(p))
        hipTarget = p0.hip
        moving = true
      } else if (mode === 'startled') {
        hop = 0.012 * pulse(t, 0.25)
        lUp = 0.25
        rUp = 0.25
        moving = true
      } else if (mode === 'poked') {
        // Chào kiểu nhà binh: tay phải đưa lên ngang trán, khuỷu gập, rồi hạ xuống
        const k = pulse(Math.min(1, t / 1.0), 1)
        rUp = 0.78 * Math.min(1, k * 1.6)
        rBend = 0.25 + 1.95 * Math.min(1, k * 1.6)
        rSide = 0.5 * Math.min(1, k * 1.6)
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 1.2)
        const k = Math.min(1, pulse(p, 1) * 1.8)
        lUp = k
        rUp = k
        lBend = 0.15
        rBend = 0.15
        hop = 0.022 * pulse(Math.min(1, p * 1.6), 1)
        moving = true
      } else if (mode === 'alert') {
        // Giơ tay trái xin chú ý (giữ suốt lúc báo động), mấy giây đầu nhún nhún
        lUp = 1
        lBend = 0.1
        if (f.alertHop) {
          hop = 0.005 * Math.abs(Math.sin((Math.PI * t) / 0.4))
          moving = true
        }
      }
    } else if (mode === 'alert') {
      lUp = 1
      lBend = 0.1
    }
    if (mode !== 'intro' || reduced) moving = easing.damp(p0, 'hip', hipTarget, 0.35, dt) || moving
    const arm = reduced ? 0.15 : 0.09
    moving = easing.damp(p0, 'lUp', lUp, arm, dt) || moving
    moving = easing.damp(p0, 'lBend', lBend, arm, dt) || moving
    moving = easing.damp(p0, 'rUp', rUp, arm, dt) || moving
    moving = easing.damp(p0, 'rBend', rBend, arm, dt) || moving
    moving = easing.damp(p0, 'rSide', rSide, arm, dt) || moving
    // Thở nhẹ khi cảnh đang vẽ chuyển động nền
    const breath = f.ambient ? 1 + 0.012 * Math.sin(now / 900) : 1

    g.position.y = hop
    hips.current.position.y = p0.hip
    // Chân gập theo độ cao hông: đùi ra trước, gối gập về sau gấp đôi, bàn chân nằm phẳng
    const a = hipAngle(p0.hip)
    for (const side of ['l', 'r'] as const) {
      legs[side].current?.rotation.set(-a, 0, 0)
      knees[side].current?.rotation.set(2 * a, 0, 0)
      feet[side].current?.rotation.set(-a, 0, 0)
    }
    lean = 0.35 * (a - hipAngle(HIP_STAND))
    tr.rotation.x = lean
    tr.scale.set(1, breath, 1)
    // Tay: vai giơ lên phía trước (x) rồi lên cao; khuỷu gập
    arms.l.current?.rotation.set(-Math.PI * 0.95 * p0.lUp, 0, -0.12 - 0.15 * p0.lUp)
    arms.r.current?.rotation.set(-Math.PI * 0.95 * p0.rUp, -0.3 * p0.rSide, 0.12 + 0.15 * p0.rUp + 0.4 * p0.rSide)
    elbows.l.current?.rotation.set(-p0.lBend, 0, 0)
    elbows.r.current?.rotation.set(-p0.rBend, 0, 0)

    // Nhìn theo đích: đầu quay, thân quay theo một phần; dải mắt quét sang hướng nhìn
    const smooth = reduced ? 0.25 : 0.12
    moving = easing.dampAngle(p0, 'yaw', f.look.yaw * 0.8, smooth, dt) || moving
    moving = easing.dampAngle(p0, 'pitch', f.look.pitch * 0.8, smooth, dt) || moving
    moving = easing.damp(p0, 'scan', Math.max(-1, Math.min(1, f.look.yaw / MAX_YAW)), 0.08, dt) || moving
    tr.rotation.y = p0.yaw * 0.25
    headYaw.current.rotation.y = p0.yaw * 0.75
    headPitch.current.rotation.x = -p0.pitch - lean
    eye.current.position.x = 0.012 * p0.scan

    // Dải mắt: trắng ấm; báo động đỏ nhấp nháy; lơ mơ / ngủ mờ dần. Đèn ngực và ăng-ten xanh ngọc
    if (mode === 'alert') eyeMat.color.copy(f.alertOn ? c.alert : c.eye).multiplyScalar(f.alertOn ? 1 : 0.5)
    else eyeMat.color.copy(c.eye).multiplyScalar(Math.max(0.1, f.eyeOpen))
    ledMat.color.copy(mode === 'alert' && f.alertOn ? c.alert : c.led).multiplyScalar(mode === 'sleep' ? 0.25 : 0.8)
    if (eyeHalo.current) {
      eyeHalo.current.material.opacity = (mode === 'alert' ? 0.8 : 0.45 * f.dark) * Math.max(0.1, f.eyeOpen)
      eyeHalo.current.material.color.copy(eyeMat.color)
    }
    if (coreHalo.current) coreHalo.current.material.opacity = (0.25 + 0.4 * f.dark) * (mode === 'sleep' ? 0.3 : 1)
    robot.headYaw = p0.yaw
    robot.headPitch = p0.pitch
    return moving
  })

  const leg = (s: 'l' | 'r'): React.JSX.Element => (
    <group ref={legs[s]} position={[(s === 'l' ? -1 : 1) * 0.017, 0, 0]}>
      <mesh geometry={parts.thigh} position-y={-SEG / 2} material={m.graphite} castShadow />
      <group ref={knees[s]} position-y={-SEG}>
        <mesh position-z={0.004} material={m.aluminium}>
          <sphereGeometry args={[0.0085, 12, 10]} />
        </mesh>
        <mesh geometry={parts.shin} position-y={-SEG / 2} material={m.shell} castShadow />
        <group ref={feet[s]} position-y={-SEG}>
          <mesh geometry={parts.foot} position={[0, -0.001, 0.006]} material={m.graphite} castShadow />
        </group>
      </group>
    </group>
  )

  const armOf = (s: 'l' | 'r'): React.JSX.Element => (
    <group ref={arms[s]} position={[(s === 'l' ? -1 : 1) * 0.046, 0.056, 0]}>
      <mesh geometry={parts.upperArm} position-y={-0.016} material={m.graphite} castShadow />
      <group ref={elbows[s]} position-y={-0.032}>
        <mesh geometry={parts.forearm} position-y={-0.014} material={m.shell} castShadow />
        <mesh geometry={parts.clamp} position-y={-0.03} material={m.aluminium} />
      </group>
    </group>
  )

  return (
    <group ref={fx}>
      <group ref={hips} position-y={HIP_STAND}>
        <mesh geometry={roundedBox(0.05, 0.016, 0.034, 0.006, 2)} material={m.graphite} castShadow />
        {leg('l')}
        {leg('r')}
        <group ref={torso} position-y={0.006}>
          <mesh geometry={roundedBox(0.068, 0.056, 0.042, 0.015, 4)} position-y={0.036} material={m.shell} castShadow {...pokeHandlers} />
          <mesh geometry={parts.frame} material={m.graphite} />
          <mesh geometry={parts.shoulders} material={m.aluminium} />
          {/* Đèn lõi trên ngực */}
          <mesh position={[0, 0.04, 0.0242]} material={ledMat}>
            <circleGeometry args={[0.0055, 20]} />
          </mesh>
          <sprite ref={coreHalo} position={[0, 0.04, 0.03]} scale={[0.05, 0.05, 1]}>
            <spriteMaterial map={haloTexture()} color={ROBOT.led} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0.3} />
          </sprite>
          {armOf('l')}
          {armOf('r')}
          <group ref={headYaw} position-y={TORSO_NECK}>
            <group ref={headPitch}>
              <mesh geometry={roundedBox(0.05, 0.042, 0.046, 0.014, 4)} position-y={0.022} material={m.graphite} castShadow {...pokeHandlers} />
              <mesh geometry={roundedBox(0.044, 0.014, 0.006, 0.005, 2)} position={[0, NECK_EYE, 0.021]} material={m.glass} />
              <group ref={eye} position={[0, NECK_EYE, 0.0245]}>
                <mesh material={eyeMat}>
                  <boxGeometry args={[0.013, 0.0038, 0.001]} />
                </mesh>
                <sprite ref={eyeHalo} position-z={0.004} scale={[0.05, 0.03, 1]}>
                  <spriteMaterial map={haloTexture()} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
                </sprite>
              </group>
              {/* Ăng-ten bên hông mũ, đầu có đèn */}
              <mesh position={[0.021, 0.05, -0.008]} rotation-z={-0.2} material={m.aluminium}>
                <cylinderGeometry args={[0.0012, 0.0012, 0.022, 6]} />
              </mesh>
              <mesh position={[0.0232, 0.061, -0.008]} material={ledMat}>
                <sphereGeometry args={[0.0032, 10, 8]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
