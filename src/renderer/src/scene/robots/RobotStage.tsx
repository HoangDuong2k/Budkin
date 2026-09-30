// Bệ tròn bên trái màn hình và robot đứng trên đó. Bấm vào bệ: robot đang đứng xoay rồi chìm vào bệ, robot kế tiếp
// trồi lên và chào. Robot đang chọn lưu trong thiết lập (settings.robot) — chọn ở Cài đặt cũng diễn y như vậy.
// Bệ: khối graphite vát cạnh, mặt kính đen, vòng LED quanh thân (sáng lên khi rê chuột, loé khi đổi robot, đỏ nhấp nháy
// theo robot khi báo động).
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Color, LatheGeometry, MeshBasicMaterial, Vector2, type Group } from 'three'
import { DEFAULT_ROBOT, nextRobot, type RobotModel } from '../../../../shared/robots'
import { run } from '../../screen/actions'
import { useData } from '../../state/dataStore'
import { say, useHud } from '../../state/hudStore'
import { placeBubble } from '../bubblePlacement'
import { env } from '../envState'
import { alertLedOn } from '../logic/alertBlink'
import { materials } from '../materials'
import { reducedMotion } from '../motion'
import { ROBOT } from '../palette3d'
import { requestFrame } from '../renderLoop'
import { dispatchRobot, robot, setRobotTransients } from '../robotState'
import { playChirp } from '../sound'
import { stage } from '../stage'
import { blobTexture } from '../textures'
import { PEDESTAL, ROOT_YAW, setCursor } from './common'
import { ROBOTS } from './index'

/** Robot cũ xoay rồi chìm vào bệ trong bấy nhiêu ms; sau đó robot mới trồi lên bằng hoạt cảnh xuất hiện của chính nó */
const SINK_MS = 380
/** Vòng LED loé sáng khi đổi robot */
const FLARE_MS = 1200

/** Đổi sang robot kế tiếp (bấm vào bệ, nút ẩn cho bàn phím): lưu vào thiết lập, cảnh đổi theo */
export function switchRobot(): void {
  const current = useData.getState().settings?.robot ?? DEFAULT_ROBOT
  void run('settings:update', { robot: nextRobot(current) })
}

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
    if (robot.mode === 'alert') ledMat.color.copy(alertLedOn(t) ? colors.alert : colors.led).multiplyScalar(alertLedOn(t) ? 1 : 0.3)
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
  const loaded = useData((s) => s.settings !== null)
  const target = useData((s) => s.settings?.robot ?? DEFAULT_ROBOT)
  const [shown, setShown] = useState<RobotModel | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target
  const holder = useRef<Group>(null)
  /** Lúc robot cũ bắt đầu chìm (null: không đang đổi) */
  const sinkAt = useRef<number | null>(null)
  const flareAt = useRef(-Infinity)
  const swapped = useRef(false)

  // Thiết lập đổi (bấm bệ, Cài đặt, nhập dữ liệu): robot cũ chìm xuống rồi robot mới trồi lên.
  // Lần đầu (mở app) thì hiện luôn robot đã chọn
  useEffect(() => {
    if (!loaded) return
    if (shown === null) {
      setShown(target)
      return
    }
    if (target === shown || sinkAt.current !== null) return
    flareAt.current = performance.now()
    if (reducedMotion()) setShown(target)
    else sinkAt.current = performance.now()
    requestFrame()
  }, [loaded, target, shown])

  // Robot mới lên bệ: giọng, lời thoại, độ dài hoạt cảnh theo robot đó; chào (trừ lần mở app)
  useEffect(() => {
    if (!shown) return
    setRobotTransients(ROBOTS[shown].transients)
    useHud.setState({ robot: shown })
    placeBubble()
    refreshShadow()
    if (!swapped.current) return
    dispatchRobot({ type: 'intro', at: performance.now() })
    say('greeting')
    playChirp('hello')
    // Hoạt cảnh xuất hiện xong: tính lại bóng đổ theo dáng đứng yên
    const timer = setTimeout(refreshShadow, 1400)
    return () => clearTimeout(timer)
  }, [shown])

  useFrame(() => {
    const g = holder.current
    if (!g) return
    const l = stage.layout
    let scale = 1
    let sink = 0
    let spin = 0
    const s0 = sinkAt.current
    if (s0 !== null) {
      const k = Math.min(1, (performance.now() - s0) / SINK_MS)
      const e = k * k
      scale = Math.max(0.001, 1 - e)
      sink = 0.02 * e
      spin = e * Math.PI * 1.5
      if (k >= 1) {
        sinkAt.current = null
        swapped.current = true
        setShown(targetRef.current)
      }
      requestFrame()
    }
    g.position.set(l.robot.x, PEDESTAL.height - sink, l.robot.z)
    g.rotation.y = ROOT_YAW + spin
    g.scale.setScalar(scale)
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
