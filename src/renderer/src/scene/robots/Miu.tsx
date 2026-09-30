// Miu — mèo máy tinh nghịch: thân vỏ gốm, mặt kính đen, tai graphite có dải LED bên trong, mắt xanh bạc hà, ria nhôm,
// đuôi graphite có đèn ở chóp. Ngồi nhìn theo con trỏ; con trỏ lại gần thì vểnh tai, dựng đuôi. Bị chọc: rung rừ rừ, mắt
// cười. Ăn mừng: nhảy lên, đuôi quẫy một vòng. Báo động: ngồi thẳng lưng, tai đỏ nhấp nháy, vẫy đuôi. Lơ mơ thì cụp tai,
// ngủ thì nằm xuống, đuôi quấn lại.
import { easing } from 'maath'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BoxGeometry, CapsuleGeometry, Color, ConeGeometry, MeshBasicMaterial, SphereGeometry, TorusGeometry, type Group, type Sprite } from 'three'
import { cable, merged, roundedBox } from '../geometry'
import { materials } from '../materials'
import { ROBOT, ROBOT_EYES } from '../palette3d'
import { robot } from '../robotState'
import { haloTexture } from '../textures'
import { TAU, easeOutBack, pokeHandlers, pulse } from './common'
import { useRobotRig } from './rig'

/** Cổ (điểm xoay đầu) và tâm mắt, so với mặt bệ */
const NECK = { y: 0.066, z: 0.012 }
const EYE_Y = NECK.y + 0.021
/** Chóp đuôi (so với gốc đuôi) */
const TAIL_TIP: [number, number, number] = [0.02, 0.06, -0.002]

export function Miu(): React.JSX.Element {
  const fx = useRef<Group>(null)
  const body = useRef<Group>(null)
  const legs = useRef<Group>(null)
  const headYaw = useRef<Group>(null)
  const headPitch = useRef<Group>(null)
  const earL = useRef<Group>(null)
  const earR = useRef<Group>(null)
  const eyes = useRef<Group>(null)
  const happy = useRef<Group>(null)
  const tail = useRef<Group>(null)
  const eyeHalo = useRef<Sprite>(null)
  /** Các giá trị đổi từ từ: nằm xuống (0 ngồi … 1 nằm), độ cụp tai, góc đuôi, hướng nhìn */
  const pose = useRef({ crouch: 0, ear: 0.25, tailUp: 0, curl: 0, yaw: 0, pitch: 0 })
  const m = materials()
  const eyeMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT_EYES.miu, toneMapped: false }), [])
  const ledMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT.led, toneMapped: false }), [])
  const c = useMemo(() => ({ led: new Color(ROBOT.led), alert: new Color(ROBOT.alert) }), [])
  const parts = useMemo(() => {
    type V3 = [number, number, number]
    const sides = [-1, 1]
    const arc = new TorusGeometry(0.0072, 0.0019, 6, 14, Math.PI)
    const whisker = new BoxGeometry(0.019, 0.0006, 0.0006)
    return {
      // Thân ngồi, hai đùi sau, hai bàn chân trước: cùng vỏ gốm, một lần vẽ
      shell: merged('miu-shell', [
        { geo: roundedBox(0.05, 0.058, 0.05, 0.02, 4), at: [0, 0.04, -0.008], rot: [-0.22, 0, 0] },
        ...sides.map((s) => ({ geo: new SphereGeometry(0.019, 18, 12), at: [s * 0.021, 0.02, -0.02] as V3, scale: [0.9, 1, 1.25] as V3 })),
        ...sides.map((s) => ({ geo: new SphereGeometry(0.0078, 14, 10), at: [s * 0.013, 0.0045, 0.022] as V3, scale: [1, 0.6, 1.3] as V3 }))
      ]),
      chest: roundedBox(0.03, 0.03, 0.004, 0.006, 2),
      legs: merged('miu-legs', sides.map((s) => ({ geo: new CapsuleGeometry(0.0062, 0.024, 4, 10), at: [s * 0.013, 0.018, 0.018] as V3 }))),
      ear: new ConeGeometry(0.0125, 0.026, 14).scale(1, 1, 0.45),
      earLed: new ConeGeometry(0.0068, 0.016, 12).scale(1, 1, 0.3),
      eyes: merged('miu-eyes', sides.map((s) => ({ geo: new CapsuleGeometry(0.0052, 0.0068, 4, 10), at: [s * 0.0135, 0, 0] as V3 }))),
      happy: merged('miu-happy', sides.map((s) => ({ geo: arc, at: [s * 0.0135, -0.002, 0] as V3 }))),
      // Mũi và miệng hình "w"
      mouth: merged('miu-mouth', [
        { geo: new SphereGeometry(0.0024, 10, 8), at: [0, 0.0035, 0.001], scale: [1.2, 0.8, 1] },
        ...sides.map((s) => ({ geo: new TorusGeometry(0.0034, 0.0009, 6, 10, Math.PI), at: [s * 0.0034, -0.0012, 0] as V3, rot: [0, 0, Math.PI] as V3 }))
      ]),
      whiskers: merged(
        'miu-whiskers',
        sides.flatMap((s) => [-0.18, 0, 0.18].map((a, i) => ({ geo: whisker, at: [s * 0.036, 0.009 - i * 0.0035, 0.024] as V3, rot: [0, s * 0.35, s * a] as V3 })))
      ),
      tail: cable(
        'miu-tail',
        [
          [0, 0, 0],
          [0.006, 0.006, -0.012],
          [0.016, 0.024, -0.018],
          [0.022, 0.045, -0.012],
          TAIL_TIP
        ],
        0.0045
      )
    }
  }, [])

  useRobotRig({ eyeY: EYE_Y, zzzY: 0.16 }, (f) => {
    const g = fx.current
    if (!g || !body.current || !legs.current || !headYaw.current || !headPitch.current || !earL.current || !earR.current || !eyes.current || !tail.current) return false
    const { dt, mode, t, reduced, now } = f
    const p0 = pose.current
    let moving = false
    const sleeping = mode === 'sleep'
    // Tai: 0 vểnh thẳng … 0.6 cụp ra sau; con trỏ lại gần thì vểnh
    const earTarget = sleeping ? 0.6 : mode === 'drowsy' ? 0.45 : mode === 'alert' || mode === 'startled' ? 0.02 : mode === 'poked' ? 0.42 : 0.25 - 0.18 * f.near
    moving = easing.damp(p0, 'crouch', sleeping ? 1 : mode === 'drowsy' ? 0.35 : 0, 0.5, dt) || moving
    moving = easing.damp(p0, 'ear', earTarget, 0.12, dt) || moving
    moving = easing.damp(p0, 'tailUp', mode === 'alert' || mode === 'startled' ? 1 : f.near * 0.6, 0.25, dt) || moving
    moving = easing.damp(p0, 'curl', sleeping ? 1 : 0, 0.6, dt) || moving

    let hop = 0
    let jitter = 0
    let stretch = 1
    let swirl = 0
    let wag = f.ambient ? 0.15 * Math.sin(now / 800) : 0
    const happyEyes = mode === 'poked' || mode === 'celebrate'
    if (!reduced) {
      if (mode === 'intro') {
        // Vươn vai: từ thấp lên cao, tai bật dựng
        stretch = Math.max(0.05, easeOutBack(Math.min(1, t / 0.9)))
        moving = true
      } else if (mode === 'startled') {
        hop = 0.02 * pulse(t, 0.25)
        moving = true
      } else if (mode === 'poked') {
        // Rừ rừ: rung rất nhanh, rất nhẹ
        jitter = 0.0007 * Math.sin(now * 0.09) * (1 - Math.min(1, t / 0.9))
        wag = 0.1 * Math.sin(now / 300)
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 1.0)
        hop = 0.03 * pulse(p, 1)
        swirl = TAU * p
        moving = true
      } else if (f.alertHop) {
        hop = 0.006 * Math.abs(Math.sin((Math.PI * t) / 0.5))
        wag = 0.5 * Math.sin((TAU * t) / 0.35)
        moving = true
      }
    }
    g.position.set(jitter, hop, 0)
    g.scale.set(1, stretch * (mode === 'alert' ? 1.05 : 1), 1)
    // Nằm xuống: thân hạ thấp, chân trước ngắn lại (gập dưới thân), đầu gục xuống
    body.current.position.y = -0.012 * p0.crouch
    legs.current.scale.y = 1 - 0.65 * p0.crouch
    headYaw.current.position.y = NECK.y - 0.024 * p0.crouch

    const smooth = reduced ? 0.25 : 0.12
    moving = easing.dampAngle(p0, 'yaw', f.look.yaw * 0.85, smooth, dt) || moving
    moving = easing.dampAngle(p0, 'pitch', f.look.pitch * 0.85, smooth, dt) || moving
    headYaw.current.rotation.y = p0.yaw
    headPitch.current.rotation.x = -p0.pitch + 0.25 * p0.crouch
    body.current.rotation.y = p0.yaw * 0.15

    earL.current.rotation.set(-p0.ear * 0.6, 0, 0.28 + p0.ear * 0.5)
    earR.current.rotation.set(-p0.ear * 0.6, 0, -(0.28 + p0.ear * 0.5))
    // Đuôi: dựng lên khi báo động / con trỏ lại gần, vẫy, quẫy một vòng khi ăn mừng, quấn quanh người khi ngủ
    tail.current.rotation.set(-0.35 * p0.tailUp, 1.7 * p0.curl + swirl, wag * (1 - p0.curl))

    const eyeScale = mode === 'alert' ? 1.15 : 1
    eyes.current.scale.set(eyeScale, eyeScale * Math.max(0.08, f.eyeOpen), eyeScale)
    eyes.current.visible = !happyEyes
    if (happy.current) happy.current.visible = happyEyes

    // Tai và chóp đuôi: đèn xanh ngọc; báo động đỏ nhấp nháy; ngủ thì mờ
    if (mode === 'alert') ledMat.color.copy(f.alertOn ? c.alert : c.led).multiplyScalar(f.alertOn ? 1 : 0.3)
    else ledMat.color.copy(c.led).multiplyScalar(sleeping ? 0.2 : 0.7 + 0.3 * f.dark)
    if (eyeHalo.current) eyeHalo.current.material.opacity = 0.4 * f.dark * (happyEyes ? 1 : f.eyeOpen)
    robot.headYaw = p0.yaw
    robot.headPitch = p0.pitch
    return moving
  })

  const ear = (s: number, ref: React.RefObject<Group | null>): React.JSX.Element => (
    <group ref={ref} position={[s * 0.02, 0.043, 0]}>
      <mesh position-y={0.012} geometry={parts.ear} material={m.graphite} castShadow />
      <mesh position={[0, 0.01, 0.0045]} geometry={parts.earLed} material={ledMat} />
    </group>
  )

  return (
    <group ref={fx}>
      <group ref={body}>
        <mesh geometry={parts.shell} material={m.shell} castShadow {...pokeHandlers} />
        <mesh geometry={parts.chest} position={[0, 0.043, 0.017]} rotation-x={-0.22} material={m.graphite} />
        <group ref={legs}>
          <mesh geometry={parts.legs} material={m.graphite} />
        </group>
        {/* Đuôi mọc từ sau lưng, chóp đuôi có đèn */}
        <group ref={tail} position={[0, 0.016, -0.038]}>
          <mesh geometry={parts.tail} material={m.graphite} castShadow />
          <mesh position={TAIL_TIP} material={ledMat}>
            <sphereGeometry args={[0.005, 12, 8]} />
          </mesh>
        </group>
      </group>
      <group ref={headYaw} position={[0, NECK.y, NECK.z]}>
        <group ref={headPitch}>
          <mesh geometry={roundedBox(0.066, 0.05, 0.052, 0.02, 4)} position-y={0.022} material={m.shell} castShadow {...pokeHandlers} />
          <mesh geometry={roundedBox(0.054, 0.032, 0.006, 0.011, 3)} position={[0, 0.019, 0.025]} material={m.glass} />
          {ear(-1, earL)}
          {ear(1, earR)}
          <group position={[0, 0.021, 0.0285]}>
            <group ref={eyes}>
              <mesh geometry={parts.eyes} material={eyeMat} />
            </group>
            {/* Mắt cười ^^ khi được chọc (rừ rừ) / ăn mừng */}
            <group ref={happy} visible={false}>
              <mesh geometry={parts.happy} material={eyeMat} />
            </group>
            <sprite ref={eyeHalo} position-z={0.004} scale={[0.07, 0.045, 1]}>
              <spriteMaterial map={haloTexture()} color={ROBOT_EYES.miu} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
            </sprite>
          </group>
          <mesh geometry={parts.mouth} position={[0, 0.009, 0.0285]} material={eyeMat} />
          <mesh geometry={parts.whiskers} material={m.aluminium} />
        </group>
      </group>
    </group>
  )
}
