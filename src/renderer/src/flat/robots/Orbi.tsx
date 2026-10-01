// Orbi 2D — quả cầu bay điềm tĩnh: nửa trên vỏ gốm, nửa dưới graphite, vòng LED ở xích đạo, một mắt ống kính với mống
// mắt phát sáng (con trỏ lại gần thì mống mắt nở ra). Bồng bềnh trên bệ, mắt lướt trên mặt cầu để nhìn theo con trỏ.
// Bị chọc: xoay tròn một vòng, lắc lư. Ăn mừng: bay một vòng nhỏ, lộn một vòng. Báo động: nảy nhanh, vòng LED đỏ nhấp
// nháy. Lơ mơ thì hạ thấp dần, ngủ thì đáp xuống nằm trên bệ, khép mống mắt.
import { useRef } from 'react'
import { damp, easeInOut, easeOutBack, op, tf, useFlatRig } from '../rig2d'
import { ledState, setLed } from './common'

const TAU = Math.PI * 2
/** Bán kính quả cầu (mm) */
const R = 46
/** Tâm quả cầu khi bay / khi nằm trên bệ */
const HOVER = 112
const REST = R + 2

function pulse(t: number, len: number): number {
  return t >= 0 && t <= len ? Math.sin((Math.PI * t) / len) : 0
}

export function Orbi(): React.JSX.Element {
  const root = useRef<SVGGElement>(null)
  const fx = useRef<SVGGElement>(null)
  const lens = useRef<SVGGElement>(null)
  const iris = useRef<SVGGElement>(null)
  const band = useRef<SVGGElement>(null)
  const glow = useRef<SVGEllipseElement>(null)
  const halo = useRef<SVGEllipseElement>(null)
  const pose = useRef({ h: 30, lx: 0, ly: 0 })

  useFlatRig({ eyeY: HOVER, zzzY: HOVER + 70 }, (f) => {
    const { dt, mode, t, reduced } = f
    const p0 = pose.current
    let moving = false
    let height = mode === 'sleep' ? REST : mode === 'drowsy' ? HOVER - 24 : HOVER
    let bob = f.ambient && mode !== 'drowsy' ? 3.5 * Math.sin(f.now / 700) : 0
    let x = 0
    let spin = 0
    let flip = 0
    let tilt = 0
    let scale = 1
    let flash = 0
    if (!reduced) {
      if (mode === 'intro') {
        const p = Math.min(1, t / 1.0)
        p0.h = 30 + (HOVER - 30) * easeOutBack(p)
        height = p0.h
        scale = Math.max(0.01, Math.min(1, p * 1.8))
        moving = true
      } else if (mode === 'startled') {
        bob += 20 * pulse(t, 0.25)
        moving = true
      } else if (mode === 'poked') {
        const p = Math.min(1, t / 0.7)
        spin = TAU * easeInOut(p)
        tilt = 16 * Math.sin(TAU * 2 * p) * (1 - p)
        flash = pulse(p, 1)
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 1.3)
        x = 16 * Math.sin(TAU * easeInOut(p))
        bob += 28 * pulse(p, 1)
        flip = TAU * easeInOut(Math.min(1, Math.max(0, (p - 0.2) / 0.55)))
        flash = pulse(p, 1)
        moving = true
      } else if (f.alertHop) {
        bob += 10 * Math.abs(Math.sin((Math.PI * t) / 0.45))
        moving = true
      }
    }
    if (mode !== 'intro' || reduced) moving = damp(p0, 'h', height, 0.4, dt, 0.05) || moving
    const smooth = reduced ? 0.06 : 0.14
    moving = damp(p0, 'lx', f.look.x * 0.85, smooth, dt) || moving
    moving = damp(p0, 'ly', f.look.y * 0.8, smooth, dt) || moving
    tf(fx.current, `translate(${x} ${-(p0.h + bob)}) rotate(${tilt}) scale(${scale})`)

    // Mắt lướt trên mặt cầu theo hướng nhìn; xoay / lộn vòng thì chạy vòng ra sau rồi hiện lại (thu hẹp ở mép cầu)
    const yaw = Math.asin(Math.max(-1, Math.min(1, p0.lx))) * 0.9 + spin
    const pitch = Math.asin(Math.max(-1, Math.min(1, p0.ly))) * 0.75 + flip
    const front = Math.cos(yaw) * Math.cos(pitch)
    const ex = R * 0.62 * Math.sin(yaw)
    const ey = -R * 0.62 * Math.sin(pitch) * Math.cos(yaw) + 3
    const sx = Math.max(0.05, Math.abs(Math.cos(yaw)))
    const sy = Math.max(0.05, Math.abs(Math.cos(pitch)))
    tf(lens.current, `translate(${ex} ${ey}) scale(${sx} ${sy})`)
    op(lens.current, front > 0 ? Math.min(1, front * 4) : 0)
    tf(band.current, `translate(0 ${-p0.ly * 5})`)
    const dilate = (1 + 0.3 * f.near) * (mode === 'alert' ? 1.18 : mode === 'startled' ? 0.7 : 1)
    tf(iris.current, `scale(${dilate} ${dilate * Math.max(0.06, f.eyeOpen)})`)

    setLed(root.current, flash > 0.3 ? 'normal' : ledState(mode, f.alertOn))
    const lift = Math.min(1, Math.max(0, (p0.h - REST) / (HOVER - REST)))
    op(glow.current, mode === 'sleep' ? 0 : (0.3 + 0.45 * f.dark) * lift)
    op(halo.current, (mode === 'alert' ? 0.85 : 0.35 * f.dark + flash * 0.6) * (mode === 'sleep' ? 0.3 : 1))
    return moving
  })

  return (
    <g ref={root} className="rb" data-led="normal">
      {/* Quầng sáng hắt xuống mặt bệ khi bay */}
      <ellipse ref={glow} className="rb-halo-led" cx={0} cy={-2} rx={46} ry={9} />
      <g ref={fx}>
        <ellipse ref={halo} className="rb-halo-state" cx={0} cy={0} rx={70} ry={30} />
        {/* Hai mấu hai bên, núm ăng-ten trên đỉnh */}
        <rect className="rb-graphite" x={-53} y={-10} width={10} height={20} rx={4} />
        <rect className="rb-graphite" x={43} y={-10} width={10} height={20} rx={4} />
        <rect className="rb-graphite" x={-6} y={-R - 7} width={12} height={9} rx={3} />
        <rect className="rb-led" x={-5} y={-R - 2} width={10} height={2.4} rx={1.2} />
        {/* Thân cầu: nửa dưới graphite, nửa trên vỏ gốm */}
        <circle className="rb-graphite" cx={0} cy={0} r={R} />
        <g ref={band}>
          <path className="rb-shell" d={`M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0 A ${R} 11 0 0 1 ${-R} 0 Z`} />
          <path className="rb-led-line" d={`M ${-R + 1} 1 A ${R - 1} 11 0 0 0 ${R - 1} 1`} />
        </g>
        <ellipse className="rb-gloss" cx={-18} cy={-28} rx={14} ry={7} transform="rotate(-30 -18 -28)" />
        {/* Mắt ống kính: vòng nhôm tối, mống mắt phát sáng */}
        <g ref={lens}>
          <circle className="rb-graphite" cx={0} cy={0} r={19} />
          <circle className="rb-glass" cx={0} cy={0} r={15.5} />
          <circle className="rb-halo-eye" cx={0} cy={0} r={18} />
          <g ref={iris}>
            <circle className="rb-eye-line" cx={0} cy={0} r={8.5} />
            <circle fill="#050607" cx={0} cy={0} r={4} />
          </g>
          <circle fill="#ffffff" opacity={0.7} cx={-5.5} cy={-6} r={2} />
        </g>
      </g>
    </g>
  )
}
