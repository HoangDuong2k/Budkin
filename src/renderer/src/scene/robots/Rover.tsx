// Rover — xe bánh xích hăng hái kiểu thiết bị hiện trường: thân graphite sọc nhôm hổ phách, hai dải xích cao su, cột kính
// tiềm vọng thò lên thụt xuống, đầu vỏ gốm với hai mắt ống kính màu hổ phách, đèn hiệu trên lưng.
// Nhìn theo con trỏ bằng đầu trên cột. Bị chọc: lùi lại rồi chạy lên, đầu gật gù. Ăn mừng: xoay tại chỗ một vòng, cột kính
// vươn cao. Báo động: cột kính vươn hết cỡ, đèn hiệu đỏ nhấp nháy, xích nhún. Lơ mơ thì cột kính hạ dần, ngủ thì thu hẳn.
import { easing } from 'maath'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, CircleGeometry, Color, CylinderGeometry, MeshBasicMaterial, RingGeometry, type Group, type Sprite } from 'three'
import { merged, roundedBox } from '../geometry'
import { materials } from '../materials'
import { ROBOT, ROBOT_EYES } from '../palette3d'
import { robot } from '../robotState'
import { haloTexture } from '../textures'
import { TAU, easeInOut, easeOutBack, pokeHandlers, pulse } from './common'
import { useRobotRig } from './rig'

/** Đỉnh thân xe (chân cột kính) so với mặt bệ */
const HULL_TOP = 0.058
/** Cột kính: thò lên thêm bao nhiêu (0 = thu hết) — bình thường / báo động */
const MAST_IDLE = 0.022
const MAST_HIGH = 0.036
/** Tâm đầu so với chân cột khi cột thu hết */
const HEAD_BASE = 0.04

export function Rover(): React.JSX.Element {
  const fx = useRef<Group>(null)
  const mast = useRef<Group>(null)
  const headYaw = useRef<Group>(null)
  const headPitch = useRef<Group>(null)
  const irisL = useRef<Group>(null)
  const irisR = useRef<Group>(null)
  const beaconHalo = useRef<Sprite>(null)
  const eyeHalo = useRef<Sprite>(null)
  const pose = useRef({ mast: MAST_IDLE, yaw: 0, pitch: 0, hull: 0 })
  const m = materials()
  const eyeMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT_EYES.rover, toneMapped: false }), [])
  const beaconMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT_EYES.rover, toneMapped: false }), [])
  const c = useMemo(() => ({ beacon: new Color(ROBOT_EYES.rover), alert: new Color(ROBOT.alert) }), [])
  const parts = useMemo(() => {
    type V3 = [number, number, number]
    const sides = [-1, 1]
    return {
      tracks: merged('rover-tracks', sides.map((s) => ({ geo: roundedBox(0.024, 0.03, 0.1, 0.012, 4), at: [s * 0.036, 0.015, 0] as V3 }))),
      wheels: merged(
        'rover-wheels',
        sides.flatMap((s) => [-0.034, 0, 0.034].map((z) => ({ geo: new CylinderGeometry(0.0085, 0.0085, 0.0255, 18), at: [s * 0.036, 0.015, z] as V3, rot: [0, 0, Math.PI / 2] as V3 })))
      ),
      stripes: merged('rover-stripes', sides.map((s) => ({ geo: roundedBox(0.0016, 0.007, 0.07, 0.0007, 1), at: [s * 0.0312, 0.047, 0] as V3 }))),
      lenses: merged('rover-lenses', sides.map((s) => ({ geo: new CylinderGeometry(0.0118, 0.0118, 0.012, 24), at: [s * 0.0165, 0, 0.018] as V3, rot: [Math.PI / 2, 0, 0] as V3 }))),
      glass: merged('rover-glass', sides.map((s) => ({ geo: new CircleGeometry(0.0096, 24), at: [s * 0.0165, 0, 0.0242] as V3 }))),
      iris: new RingGeometry(0.0025, 0.0058, 24)
    }
  }, [])

  useRobotRig({ eyeY: HULL_TOP + HEAD_BASE + MAST_IDLE, zzzY: 0.19 }, (f) => {
    const g = fx.current
    if (!g || !mast.current || !headYaw.current || !headPitch.current || !irisL.current || !irisR.current) return false
    const { dt, mode, t, reduced } = f
    const p0 = pose.current
    let moving = false
    let mastTarget = mode === 'sleep' ? 0 : mode === 'drowsy' ? 0.008 : mode === 'alert' || mode === 'celebrate' ? MAST_HIGH : MAST_IDLE
    let drive = 0
    let turn = 0
    let hop = 0
    let nod = 0
    let scale = 1
    if (!reduced) {
      if (mode === 'intro') {
        const p = Math.min(1, t / 1.0)
        scale = Math.max(0.01, easeOutBack(Math.min(1, p * 1.5)))
        p0.mast = MAST_IDLE * Math.max(0, easeOutBack(Math.max(0, (p - 0.35) / 0.65)))
        mastTarget = p0.mast
        moving = true
      } else if (mode === 'startled') {
        hop = 0.012 * pulse(t, 0.25)
        mastTarget = MAST_HIGH
        moving = true
      } else if (mode === 'poked') {
        // Lùi lại rồi chạy lên chỗ cũ, đầu gật gù
        const p = Math.min(1, t / 0.65)
        drive = -0.012 * Math.sin(Math.PI * p)
        nod = 0.25 * Math.sin(TAU * 2 * p) * (1 - p)
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 1.2)
        turn = TAU * easeInOut(p)
        hop = 0.01 * pulse(p, 1)
        moving = true
      } else if (f.alertHop) {
        hop = 0.004 * Math.abs(Math.sin((Math.PI * t) / 0.3))
        moving = true
      }
    }
    if (mode !== 'intro' || reduced) moving = easing.damp(p0, 'mast', mastTarget, 0.3, dt) || moving
    g.position.set(0, hop, drive)
    g.rotation.y = turn
    g.scale.setScalar(scale)
    mast.current.position.y = p0.mast

    // Đầu nhìn theo đích trên cột kính; thân xe xoay theo một chút
    const smooth = reduced ? 0.25 : 0.12
    moving = easing.dampAngle(p0, 'yaw', f.look.yaw * 0.9, smooth, dt) || moving
    moving = easing.dampAngle(p0, 'pitch', f.look.pitch * 0.85, smooth, dt) || moving
    headYaw.current.rotation.y = p0.yaw
    headPitch.current.rotation.x = -p0.pitch + nod

    // Mắt ống kính: nở khi báo động, khép khi chớp mắt / lơ mơ / ngủ
    const s = mode === 'alert' ? 1.2 : 1 + 0.15 * f.near
    for (const iris of [irisL.current, irisR.current]) iris.scale.set(s, s * Math.max(0.06, f.eyeOpen), 1)

    // Đèn hiệu trên lưng: hổ phách mờ; báo động đỏ nhấp nháy; ngủ thì tắt
    if (mode === 'alert') beaconMat.color.copy(f.alertOn ? c.alert : c.beacon).multiplyScalar(f.alertOn ? 1 : 0.25)
    else beaconMat.color.copy(c.beacon).multiplyScalar(mode === 'sleep' ? 0.12 : mode === 'celebrate' ? 1 : 0.45 + 0.3 * f.dark)
    if (beaconHalo.current) {
      beaconHalo.current.material.opacity = mode === 'alert' ? (f.alertOn ? 0.95 : 0.2) : mode === 'celebrate' ? 0.7 : 0.25 * f.dark
      beaconHalo.current.material.color.copy(beaconMat.color)
    }
    if (eyeHalo.current) eyeHalo.current.material.opacity = 0.45 * f.dark * f.eyeOpen
    robot.headYaw = p0.yaw
    robot.headPitch = p0.pitch
    return moving
  })

  return (
    <group ref={fx}>
      {/* Hai dải xích cao su, bánh xích nhôm */}
      <mesh geometry={parts.tracks} material={m.rubber} castShadow />
      <mesh geometry={parts.wheels} material={m.aluminium} />
      {/* Thân graphite, sọc nhôm hổ phách hai bên, dải cảm biến phía trước */}
      <mesh geometry={roundedBox(0.062, 0.034, 0.084, 0.009, 3)} position-y={0.041} material={m.graphite} castShadow {...pokeHandlers} />
      <mesh geometry={parts.stripes} material={m.amber} />
      <mesh position={[0, 0.036, 0.0425]} material={eyeMat}>
        <boxGeometry args={[0.032, 0.0035, 0.001]} />
      </mesh>
      {/* Đèn hiệu trên lưng */}
      <group position={[0.018, HULL_TOP, -0.027]}>
        <mesh position-y={0.002} material={m.graphite}>
          <cylinderGeometry args={[0.0085, 0.0095, 0.004, 20]} />
        </mesh>
        <mesh position-y={0.004} material={beaconMat}>
          <sphereGeometry args={[0.0072, 18, 10, 0, TAU, 0, Math.PI / 2]} />
        </mesh>
        <sprite ref={beaconHalo} position-y={0.009} scale={[0.05, 0.05, 1]}>
          <spriteMaterial map={haloTexture()} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
        </sprite>
      </group>
      {/* Cột kính tiềm vọng: ống nhôm cố định, ống graphite thò lên thụt xuống */}
      <group position={[0, HULL_TOP, 0.006]}>
        <mesh position-y={0.012} material={m.aluminium}>
          <cylinderGeometry args={[0.0075, 0.0085, 0.024, 16]} />
        </mesh>
        <group ref={mast}>
          <mesh position-y={0.024} material={m.graphite}>
            <cylinderGeometry args={[0.0056, 0.0056, 0.034, 14]} />
          </mesh>
          <group ref={headYaw} position-y={HEAD_BASE}>
            <group ref={headPitch}>
              <mesh geometry={roundedBox(0.066, 0.03, 0.036, 0.012, 4)} material={m.shell} castShadow {...pokeHandlers} />
              <mesh geometry={parts.lenses} material={m.graphiteGloss} />
              <mesh geometry={parts.glass} material={m.glass} />
              <group ref={irisL} position={[-0.0165, 0, 0.0246]}>
                <mesh geometry={parts.iris} material={eyeMat} />
              </group>
              <group ref={irisR} position={[0.0165, 0, 0.0246]}>
                <mesh geometry={parts.iris} material={eyeMat} />
              </group>
              <sprite ref={eyeHalo} position-z={0.03} scale={[0.08, 0.045, 1]}>
                <spriteMaterial map={haloTexture()} color={ROBOT_EYES.rover} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} opacity={0} />
              </sprite>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
