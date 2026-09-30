// Orbi — quả cầu bay điềm tĩnh: nửa trên vỏ gốm, nửa dưới graphite, vòng LED ở xích đạo, một mắt ống kính với mống
// mắt phát sáng (con trỏ lại gần thì mống mắt nở ra). Bồng bềnh trên bệ, xoay cả thân để nhìn theo con trỏ như một máy
// quay. Bị chọc: xoay tròn một vòng, lắc lư. Ăn mừng: bay một vòng nhỏ quanh bệ, lộn một vòng. Báo động: nảy nhanh, vòng
// LED đỏ nhấp nháy. Lơ mơ thì hạ thấp dần, ngủ thì đáp xuống nằm trên bệ, khép mống mắt.
import { easing } from 'maath'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Color, CylinderGeometry, MeshBasicMaterial, SphereGeometry, type Group, type Sprite } from 'three'
import { merged } from '../geometry'
import { materials } from '../materials'
import { ROBOT, ROBOT_EYES } from '../palette3d'
import { robot } from '../robotState'
import { haloTexture } from '../textures'
import { TAU, easeInOut, easeOutBack, pokeHandlers, pulse } from './common'
import { useRobotRig } from './rig'

/** Bán kính quả cầu */
const R = 0.046
/** Tâm quả cầu khi bay / khi nằm trên bệ (so với mặt bệ) */
const HOVER = 0.112
const REST = R + 0.002

export function Orbi(): React.JSX.Element {
  const fx = useRef<Group>(null)
  const body = useRef<Group>(null)
  const iris = useRef<Group>(null)
  const glow = useRef<Sprite>(null)
  const eyeHalo = useRef<Sprite>(null)
  const ledHalo = useRef<Sprite>(null)
  /** Độ cao và hướng nhìn đổi từ từ */
  const pose = useRef({ h: HOVER, yaw: 0, pitch: 0 })
  const m = materials()
  const eyeMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT_EYES.orbi, toneMapped: false }), [])
  const ledMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT.led, toneMapped: false }), [])
  const sparkMat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), [])
  const c = useMemo(() => ({ led: new Color(ROBOT.led), alert: new Color(ROBOT.alert), white: new Color('#e8fffd') }), [])
  const parts = useMemo(() => {
    type V3 = [number, number, number]
    return {
      top: new SphereGeometry(R, 40, 14, 0, TAU, 0, Math.PI / 2),
      bottom: new SphereGeometry(R * 0.996, 40, 14, 0, TAU, Math.PI / 2, Math.PI / 2),
      // Hai hốc cảm biến hai bên, nắp nhôm anod
      pods: merged('orbi-pods', [-1, 1].map((s) => ({ geo: new CylinderGeometry(0.012, 0.012, 0.008, 24), at: [s * (R + 0.001), 0, 0] as V3, rot: [0, 0, Math.PI / 2] as V3 }))),
      podCaps: merged('orbi-pod-caps', [-1, 1].map((s) => ({ geo: new CylinderGeometry(0.0075, 0.0075, 0.002, 20), at: [s * (R + 0.0055), 0, 0] as V3, rot: [0, 0, Math.PI / 2] as V3 })))
    }
  }, [])
  // Xoay ngang trước rồi mới ngẩng / cúi (như máy quay trên giá)
  useLayoutEffect(() => {
    if (body.current) body.current.rotation.order = 'YXZ'
  }, [])

  useRobotRig({ eyeY: HOVER, zzzY: HOVER + 0.07 }, (f) => {
    const g = fx.current
    const b = body.current
    const ir = iris.current
    if (!g || !b || !ir) return false
    const { dt, mode, t, reduced } = f
    const p0 = pose.current
    let moving = false
    let height = mode === 'sleep' ? REST : mode === 'drowsy' ? HOVER - 0.024 : HOVER
    // Bồng bềnh chỉ khi cảnh đang vẽ chuyển động nền (không tự xin vẽ thêm khung)
    let bob = f.ambient && mode !== 'drowsy' ? 0.0035 * Math.sin(f.now / 700) : 0
    let x = 0
    let z = 0
    let spin = 0
    let flip = 0
    let tilt = 0
    let scale = 1
    let flash = 0
    if (!reduced) {
      if (mode === 'intro') {
        // Trồi lên từ bệ, nảy nhẹ rồi lơ lửng
        const p = Math.min(1, t / 1.0)
        p0.h = 0.03 + (HOVER - 0.03) * easeOutBack(p)
        height = p0.h
        scale = Math.max(0.01, Math.min(1, p * 1.8))
        moving = true
      } else if (mode === 'startled') {
        bob += 0.02 * pulse(t, 0.25)
        moving = true
      } else if (mode === 'poked') {
        const p = Math.min(1, t / 0.7)
        spin = TAU * easeInOut(p)
        tilt = 0.28 * Math.sin(TAU * 2 * p) * (1 - p)
        flash = pulse(p, 1)
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 1.3)
        const a = TAU * easeInOut(p)
        x = 0.01 * Math.sin(a)
        z = 0.008 * (1 - Math.cos(a))
        bob += 0.028 * pulse(p, 1)
        flip = TAU * easeInOut(Math.min(1, Math.max(0, (p - 0.2) / 0.55)))
        flash = pulse(p, 1)
        moving = true
      } else if (f.alertHop) {
        bob += 0.01 * Math.abs(Math.sin((Math.PI * t) / 0.45))
        moving = true
      }
    }
    if (mode !== 'intro' || reduced) moving = easing.damp(p0, 'h', height, 0.4, dt) || moving
    g.position.set(x, p0.h + bob, z)
    g.scale.setScalar(scale)

    // Xoay cả quả cầu nhìn theo đích
    const smooth = reduced ? 0.25 : 0.14
    moving = easing.dampAngle(p0, 'yaw', f.look.yaw * 0.85, smooth, dt) || moving
    moving = easing.dampAngle(p0, 'pitch', f.look.pitch * 0.8, smooth, dt) || moving
    b.rotation.set(-p0.pitch + flip, p0.yaw + spin, tilt)

    // Mống mắt: nở khi con trỏ lại gần / báo động, co khi giật mình; khép lại khi chớp mắt, lơ mơ, ngủ
    const dilate = (1 + 0.3 * f.near) * (mode === 'alert' ? 1.18 : mode === 'startled' ? 0.7 : 1)
    ir.scale.set(dilate, dilate * Math.max(0.06, f.eyeOpen), 1)

    // Vòng LED xích đạo và đèn đỉnh: xanh ngọc; đỏ nhấp nháy khi báo động; loé trắng khi bị chọc / ăn mừng; mờ khi ngủ
    if (mode === 'alert') ledMat.color.copy(f.alertOn ? c.alert : c.led).multiplyScalar(f.alertOn ? 1 : 0.3)
    else ledMat.color.copy(c.led).lerp(c.white, flash * 0.7).multiplyScalar(mode === 'sleep' ? 0.25 : 0.75 + 0.25 * f.dark)
    if (glow.current) glow.current.material.opacity = mode === 'sleep' ? 0 : (0.25 + 0.4 * f.dark) * Math.min(1, (p0.h - REST) / (HOVER - REST))
    if (eyeHalo.current) eyeHalo.current.material.opacity = 0.4 * f.dark * f.eyeOpen
    if (ledHalo.current) {
      ledHalo.current.material.opacity = mode === 'alert' ? 0.9 : 0.4 * f.dark * (mode === 'sleep' ? 0.3 : 1)
      ledHalo.current.material.color.copy(ledMat.color)
    }
    robot.headYaw = p0.yaw
    robot.headPitch = p0.pitch
    return moving
  })

  return (
    <>
      {/* Luồng sáng đẩy hắt xuống mặt bệ khi đang bay */}
      <sprite ref={glow} position-y={0.012} scale={[0.1, 0.045, 1]}>
        <spriteMaterial map={haloTexture()} color={ROBOT_EYES.orbi} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0.3} />
      </sprite>
      <group ref={fx} position-y={HOVER}>
        <group ref={body}>
          <mesh geometry={parts.top} material={m.shell} castShadow {...pokeHandlers} />
          <mesh geometry={parts.bottom} material={m.graphite} castShadow {...pokeHandlers} />
          <mesh rotation-x={Math.PI / 2} material={ledMat}>
            <torusGeometry args={[R + 0.0004, 0.0016, 6, 64]} />
          </mesh>
          <mesh geometry={parts.pods} material={m.graphite} />
          <mesh geometry={parts.podCaps} material={m.anodized} />
          {/* Mắt ống kính: viền nhôm, kính đen, mống mắt phát sáng, đốm phản chiếu */}
          <group position-z={R - 0.004}>
            <mesh rotation-x={Math.PI / 2} material={m.aluminium}>
              <cylinderGeometry args={[0.021, 0.022, 0.012, 32]} />
            </mesh>
            <mesh position-z={0.0062} material={m.glass}>
              <circleGeometry args={[0.017, 32]} />
            </mesh>
            <group ref={iris} position-z={0.0066}>
              <mesh material={eyeMat}>
                <ringGeometry args={[0.0046, 0.0098, 32]} />
              </mesh>
            </group>
            <mesh position={[-0.0068, 0.0068, 0.0069]} material={sparkMat}>
              <circleGeometry args={[0.0022, 12]} />
            </mesh>
            <sprite ref={eyeHalo} position-z={0.012} scale={[0.07, 0.07, 1]}>
              <spriteMaterial map={haloTexture()} color={ROBOT_EYES.orbi} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
            </sprite>
          </group>
          {/* Đèn trạng thái trên đỉnh */}
          <mesh position-y={R + 0.0012} material={ledMat}>
            <sphereGeometry args={[0.005, 14, 10]} />
          </mesh>
          <sprite ref={ledHalo} position-y={R + 0.003} scale={[0.04, 0.04, 1]}>
            <spriteMaterial map={haloTexture()} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
          </sprite>
        </group>
      </group>
    </>
  )
}
