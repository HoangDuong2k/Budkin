// Bệ tròn và robot đứng trên đó (bàn làm việc 2D). Bấm vào bệ: robot đang đứng xoay rồi chìm vào bệ, robot kế tiếp trồi
// lên và chào (robotSwap — dùng chung với cảnh 3D). Bấm vào robot: chọc robot. Vòng LED quanh bệ sáng lên khi rê chuột,
// loé khi đổi robot, đỏ nhấp nháy theo robot khi báo động.
import { useRef } from 'react'
import { env } from '../scene/envState'
import { alertLedOn } from '../scene/logic/alertBlink'
import { policy, requestFrame } from '../scene/renderLoop'
import { pokeRobot, robot } from '../scene/robotState'
import { FLARE_MS, switchRobot, useRobotSwap } from '../scene/robots/robotSwap'
import { useFlatFrame } from './flatLoop'
import type { FlatLayout } from './flatLayout'
import { op, tf } from './rig2d'
import { EYE_COLOR, FLAT_ROBOTS } from './robots'
import { RobotDefs } from './robots/art'

/** Khung vẽ của robot (mm, gốc ở tâm mặt bệ): đủ chỗ cho lúc nhảy, xoay, bay vòng */
export const ROBOT_VIEW = { x: -140, y: -300, w: 280, h: 340 }
/** Bệ: bán kính, độ dẹt của mặt elip (camera chúc xuống), chiều cao */
const PED = { r: 60, ry: 13, h: 16 }

function Pedestal({ flareAt }: { flareAt: React.RefObject<number> }): React.JSX.Element {
  const ring = useRef<SVGPathElement>(null)
  const glow = useRef<SVGEllipseElement>(null)
  const hover = useRef(false)
  useFlatFrame((_dt, now) => {
    const flare = Math.max(0, 1 - (now - (flareAt.current ?? -Infinity)) / FLARE_MS)
    const el = ring.current
    if (!el) return
    if (robot.mode === 'alert') {
      const on = alertLedOn((now - robot.since) / 1000, policy.software)
      el.style.stroke = on ? 'var(--rb-alert)' : 'var(--rb-led)'
      op(el, on ? 1 : 0.35)
      op(glow.current, on ? 0.7 : 0)
    } else {
      el.style.stroke = flare > 0 ? `color-mix(in srgb, var(--rb-led), #ffffff ${Math.round(flare * 70)}%)` : 'var(--rb-led)'
      const dark = 1 - env.env
      op(el, Math.min(1, (0.55 + 0.35 * dark) * (hover.current ? 1.5 : 1) + flare))
      op(glow.current, Math.min(1, (0.15 + 0.35 * dark) * (hover.current ? 1.6 : 1) + flare * 0.8))
    }
    if (flare > 0) requestFrame()
  }, 5)
  const enter = (on: boolean): void => {
    hover.current = on
    requestFrame()
  }
  return (
    <g className="fr-pedestal" onClick={switchRobot} onPointerEnter={() => enter(true)} onPointerLeave={() => enter(false)}>
      <ellipse className="fr-ped-shadow" cx={0} cy={PED.h + 1} rx={PED.r + 34} ry={PED.ry + 9} />
      <ellipse ref={glow} className="fr-ped-glow" cx={0} cy={PED.h * 0.6} rx={PED.r + 22} ry={PED.ry + 10} />
      <path className="fr-ped-side" d={`M ${-PED.r} 0 V ${PED.h - 3} A ${PED.r} ${PED.ry} 0 0 0 ${PED.r} ${PED.h - 3} V 0 Z`} />
      <path ref={ring} className="fr-ped-led" d={`M ${-PED.r} ${PED.h * 0.45} A ${PED.r} ${PED.ry} 0 0 0 ${PED.r} ${PED.h * 0.45}`} />
      <ellipse className="fr-ped-top" cx={0} cy={0} rx={PED.r} ry={PED.ry} />
      <ellipse className="fr-ped-glass" cx={0} cy={0} rx={PED.r - 9} ry={PED.ry - 2.6} />
    </g>
  )
}

export function FlatRobotStage({ l }: { l: FlatLayout }): React.JSX.Element {
  const holder = useRef<SVGGElement>(null)
  const { shown, flareAt, sinkStep } = useRobotSwap()
  // Robot cũ xoay (lật mặt) rồi thu nhỏ, chìm xuống bệ
  useFlatFrame((_dt, now) => {
    const e = sinkStep(now)
    const g = holder.current
    if (!g) return
    if (e === null) {
      // Robot mới đã lên bệ: bỏ dáng chìm của robot cũ
      if (g.hasAttribute('transform')) g.removeAttribute('transform')
      return
    }
    const k = Math.max(0.001, 1 - e)
    const turn = Math.cos(e * Math.PI * 1.5)
    tf(g, `translate(0 ${18 * e}) scale(${(Math.abs(turn) < 0.01 ? 0.01 : turn) * k} ${k})`)
  }, 10)
  const Model = shown ? FLAT_ROBOTS[shown] : null
  const v = ROBOT_VIEW
  return (
    <svg
      className="flat-robot"
      viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
      style={{ left: l.robot.x + v.x * l.s, top: l.robot.y + v.y * l.s, width: v.w * l.s, height: v.h * l.s, ['--rb-eye' as string]: shown ? EYE_COLOR[shown] : undefined }}
      data-robot={shown ?? undefined}
      aria-hidden
    >
      <defs>
        <clipPath id="fr-sink">
          <rect x={v.x} y={v.y} width={v.w} height={-v.y} />
          <ellipse cx={0} cy={0} rx={PED.r} ry={PED.ry} />
        </clipPath>
        <RobotDefs />
      </defs>
      <Pedestal flareAt={flareAt} />
      <g clipPath="url(#fr-sink)">
        <g ref={holder}>
          <g className="fr-robot" onClick={pokeRobot}>
            {Model && <Model key={shown} />}
          </g>
        </g>
      </g>
    </svg>
  )
}
