// Bệ tròn bên trái màn hình và robot đứng trên đó. Bấm vào bệ: robot đang đứng xoay rồi chìm vào bệ, robot kế tiếp
// trồi lên và chào (robotSwap — dùng chung với bàn làm việc 2D).
// Bệ: khối graphite vát cạnh, mặt kính đen, vòng LED quanh thân (sáng lên khi rê chuột, loé khi đổi robot, đỏ nhấp nháy
// theo robot khi báo động).
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, LatheGeometry, MeshBasicMaterial, Vector2, type Group } from 'three'
import { env } from '../envState'
import { alertLedOn } from '../logic/alertBlink'
import { materials } from '../materials'
import { ROBOT } from '../palette3d'
import { policy, requestFrame } from '../renderLoop'
import { robot } from '../robotState'
import { stage } from '../stage'
import { blobTexture } from '../textures'
import { PEDESTAL, ROOT_YAW, setCursor } from './common'
import { ROBOTS } from './index'
import { FLARE_MS, switchRobot, useRobotSwap } from './robotSwap'

export { switchRobot }

/** Bóng đổ của đèn bàn chỉ tính lại khi cần: robot đổi dáng thì tính lại */
function refreshShadow(): void {
  const gl = stage.getR3F?.().gl
  if (gl) gl.shadowMap.needsUpdate = true
  requestFrame()
}

function Pedestal({ flareAt }: { flareAt: React.RefObject<number> }): React.JSX.Element {
  const group = useRef<Group>(null)
  const hover = useRef(false)
  const m = materials()
  const ledMat = useMemo(() => new MeshBasicMaterial({ color: ROBOT.led, toneMapped: false }), [])
  const colors = useMemo(() => ({ led: new Color(ROBOT.led), alert: new Color(ROBOT.alert), white: new Color('#e9fffc') }), [])
  // Khối bệ: vát cạnh trên và dưới (tiện quanh trục đứng)
  const puck = useMemo(() => {
    const r = PEDESTAL.radius
    const h = PEDESTAL.height
    const profile = [
      [0, 0],
      [r - 0.003, 0],
      [r, 0.003],
      [r, h - 0.004],
      [r - 0.0025, h - 0.0005],
      [r - 0.006, h],
      [0, h]
    ].map(([x, y]) => new Vector2(x, y))
    return new LatheGeometry(profile, 56)
  }, [])

  useFrame(() => {
    const g = group.current
    if (!g) return
    const l = stage.layout
    g.position.set(l.robot.x, 0, l.robot.z)
    const dark = 1 - env.env
    const flare = Math.max(0, 1 - (performance.now() - (flareAt.current ?? -Infinity)) / FLARE_MS)
    const t = (performance.now() - robot.since) / 1000
    const on = alertLedOn(t, policy.software)
    if (robot.mode === 'alert') ledMat.color.copy(on ? colors.alert : colors.led).multiplyScalar(on ? 1 : 0.3)
    else {
      ledMat.color.copy(colors.led).lerp(colors.white, flare * 0.7)
      ledMat.color.multiplyScalar((0.45 + 0.4 * dark) * (hover.current ? 1.6 : 1) * (1 + flare))
    }
    if (flare > 0) requestFrame()
  })

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>): void => {
      e.stopPropagation()
      switchRobot()
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>): void => {
      e.stopPropagation()
      hover.current = true
      setCursor(true)
      requestFrame()
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>): void => {
      e.stopPropagation()
      hover.current = false
      setCursor(false)
      requestFrame()
    }
  }

  return (
    <group ref={group}>
      <mesh position={[0, 0.0012, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.19, 0.16]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} opacity={0.85} />
      </mesh>
      <mesh geometry={puck} material={m.graphite} castShadow receiveShadow {...handlers} />
      <mesh position-y={PEDESTAL.height + 0.0003} material={m.glass} {...handlers}>
        <cylinderGeometry args={[PEDESTAL.radius - 0.009, PEDESTAL.radius - 0.009, 0.0008, 48]} />
      </mesh>
      <mesh position-y={0.0078} rotation-x={Math.PI / 2} material={ledMat}>
        <torusGeometry args={[PEDESTAL.radius + 0.0002, 0.0011, 6, 72]} />
      </mesh>
    </group>
  )
}

export function RobotStage(): React.JSX.Element {
  const holder = useRef<Group>(null)
  // Robot mới lên bệ: tính lại bóng đổ; hết hoạt cảnh xuất hiện thì tính lại theo dáng đứng yên
  const { shown, flareAt, sinkStep } = useRobotSwap((introduced) => {
    refreshShadow()
    if (!introduced) return
    const timer = setTimeout(refreshShadow, 1400)
    return () => clearTimeout(timer)
  })

  useFrame(() => {
    const g = holder.current
    if (!g) return
    const l = stage.layout
    const e = sinkStep(performance.now()) ?? 0
    g.position.set(l.robot.x, PEDESTAL.height - 0.02 * e, l.robot.z)
    g.rotation.y = ROOT_YAW + e * Math.PI * 1.5
    g.scale.setScalar(Math.max(0.001, 1 - e))
  })

  const Model = shown ? ROBOTS[shown].Model : null
  return (
    <>
      <Pedestal flareAt={flareAt} />
      <group ref={holder} name="robot-holder" rotation-y={ROOT_YAW}>
        {Model && <Model key={shown} />}
      </group>
    </>
  )
}
