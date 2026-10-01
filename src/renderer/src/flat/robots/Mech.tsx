// Mech 2D — người máy hai chân nghiêm túc: giáp vỏ gốm trên khung graphite, khớp nhôm, tay có kẹp, mũ graphite với dải đèn
// mắt trắng ấm quét trái phải theo hướng nhìn. Đứng nghiêm nhìn theo con trỏ. Bị chọc: chào kiểu nhà binh. Ăn mừng: giơ
// hai tay, bật nhảy. Báo động: giơ một tay xin chú ý, dải mắt đỏ nhấp nháy. Lơ mơ thì khuỵu gối, ngủ thì ngồi thụp xuống,
// mắt tắt dần. Nhìn từ phía trước, gối gập thì đầu gối choãi ra hai bên.
import { useRef } from 'react'
import { damp, easeOutBack, op, tf, useFlatRig } from '../rig2d'
import { ledState, setLed } from './common'

const DEG = 180 / Math.PI
/** Chiều dài đùi và cẳng chân (mm) */
const SEG = 36
/** Mắt cá chân cách mặt bệ */
const ANKLE = 6
/** Độ cao hông: đứng thẳng (gối hơi chùng), khuỵu gối (lơ mơ), ngồi thụp (ngủ) */
const HIP_STAND = ANKLE + 2 * SEG * 0.985
const HIP_DROWSY = HIP_STAND - 10
const HIP_SIT = ANKLE + 30
/** Từ hông tới cổ, từ cổ tới tâm mắt */
const TORSO_NECK = 70
const NECK_EYE = 26
const HIP_X = 12
const FOOT_X = 14

function pulse(t: number, len: number): number {
  return t >= 0 && t <= len ? Math.sin((Math.PI * t) / len) : 0
}

export function Mech(): React.JSX.Element {
  const root = useRef<SVGGElement>(null)
  const fx = useRef<SVGGElement>(null)
  const upper = useRef<SVGGElement>(null)
  const torso = useRef<SVGGElement>(null)
  const head = useRef<SVGGElement>(null)
  const eye = useRef<SVGRectElement>(null)
  const eyeHalo = useRef<SVGEllipseElement>(null)
  const coreHalo = useRef<SVGCircleElement>(null)
  const thigh = { l: useRef<SVGPathElement>(null), r: useRef<SVGPathElement>(null) }
  const shin = { l: useRef<SVGPathElement>(null), r: useRef<SVGPathElement>(null) }
  const knee = { l: useRef<SVGCircleElement>(null), r: useRef<SVGCircleElement>(null) }
  const arm = { l: useRef<SVGGElement>(null), r: useRef<SVGGElement>(null) }
  const fore = { l: useRef<SVGGElement>(null), r: useRef<SVGGElement>(null) }
  const pose = useRef({ hip: HIP_SIT, lUp: 0, lBend: 0.25, rUp: 0, rBend: 0.25, lx: 0, ly: 0 })

  useFlatRig({ eyeY: HIP_STAND + TORSO_NECK + NECK_EYE, zzzY: 215, blinks: false }, (f) => {
    const { dt, mode, t, reduced, now } = f
    const p0 = pose.current
    let moving = false
    let hipTarget = mode === 'sleep' ? HIP_SIT : mode === 'drowsy' ? HIP_DROWSY : HIP_STAND
    // Tay: 0 buông … 1 giơ thẳng lên; khuỷu gập 0 … 2.4 rad
    let lUp = 0
    let lBend = 0.25
    let rUp = 0
    let rBend = 0.25
    let hop = 0
    if (mode === 'sleep') {
      // Ngồi thụp, hai tay đặt lên gối
      lUp = 0.12
      rUp = 0.12
      lBend = 0.9
      rBend = 0.9
    }
    if (!reduced) {
      if (mode === 'intro') {
        // Từ tư thế ngồi thụp đứng dậy
        const p = Math.min(1, t / 1.1)
        p0.hip = HIP_SIT + (HIP_STAND - HIP_SIT) * Math.min(1, easeOutBack(p))
        hipTarget = p0.hip
        moving = true
      } else if (mode === 'startled') {
        hop = 12 * pulse(t, 0.25)
        lUp = 0.25
        rUp = 0.25
        moving = true
      } else if (mode === 'poked') {
        // Chào kiểu nhà binh: tay phải đưa lên ngang trán, khuỷu gập, rồi hạ xuống
        const k = Math.min(1, pulse(Math.min(1, t / 1.0), 1) * 1.6)
        rUp = 0.8 * k
        rBend = 0.25 + 2.1 * k
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 1.2)
        const k = Math.min(1, pulse(p, 1) * 1.8)
        lUp = k
        rUp = k
        lBend = 0.15
        rBend = 0.15
        hop = 22 * pulse(Math.min(1, p * 1.6), 1)
        moving = true
      } else if (mode === 'alert') {
        // Giơ tay trái xin chú ý (giữ suốt lúc báo động), mấy giây đầu nhún nhún
        lUp = 1
        lBend = 0.1
        if (f.alertHop) {
          hop = 5 * Math.abs(Math.sin((Math.PI * t) / 0.4))
          moving = true
        }
      }
    } else if (mode === 'alert') {
      lUp = 1
      lBend = 0.1
    }
    if (mode !== 'intro' || reduced) moving = damp(p0, 'hip', hipTarget, 0.35, dt, 0.05) || moving
    const armSmooth = reduced ? 0.15 : 0.09
    for (const [k, v] of [
      ['lUp', lUp],
      ['lBend', lBend],
      ['rUp', rUp],
      ['rBend', rBend]
    ] as const)
      moving = damp(p0, k, v, armSmooth, dt) || moving
    const smooth = reduced ? 0.06 : 0.12
    moving = damp(p0, 'lx', f.look.x * 0.8, smooth, dt) || moving
    moving = damp(p0, 'ly', f.look.y * 0.8, smooth, dt) || moving

    tf(fx.current, `translate(0 ${-hop})`)
    // Chân: hông hạ thì gối gập — nhìn từ trước, đầu gối choãi ra hai bên
    const bend = Math.sqrt(Math.max(0, SEG * SEG - ((p0.hip - ANKLE) / 2) ** 2))
    const kneeY = -(ANKLE + (p0.hip - ANKLE) / 2)
    for (const [side, sx] of [
      ['l', -1],
      ['r', 1]
    ] as const) {
      const kx = sx * (HIP_X + 2 + bend * 0.7)
      thigh[side].current?.setAttribute('d', `M ${sx * HIP_X} ${-p0.hip} L ${kx} ${kneeY}`)
      shin[side].current?.setAttribute('d', `M ${kx} ${kneeY} L ${sx * FOOT_X} ${-ANKLE - 2}`)
      knee[side].current?.setAttribute('cx', kx.toFixed(2))
      knee[side].current?.setAttribute('cy', kneeY.toFixed(2))
    }
    const breath = f.ambient ? 1 + 0.012 * Math.sin(now / 900) : 1
    tf(upper.current, `translate(0 ${-p0.hip})`)
    tf(torso.current, `rotate(${p0.lx * 2} 0 0) scale(1 ${breath})`)
    // Tay: vai giơ sang ngang rồi lên cao; khuỷu gập (tay phải chào thì cẳng tay đưa về phía trán)
    tf(arm.l.current, `translate(-36 -62) rotate(${8 + 165 * p0.lUp})`)
    tf(arm.r.current, `translate(36 -62) rotate(${-(8 + 165 * p0.rUp)})`)
    tf(fore.l.current, `translate(0 30) rotate(${-p0.lBend * DEG * 0.35})`)
    tf(fore.r.current, `translate(0 30) rotate(${-p0.rBend * DEG})`)
    tf(head.current, `translate(${p0.lx * 4} ${-TORSO_NECK - p0.ly * 2}) rotate(${p0.lx * 6})`)
    tf(eye.current, `translate(${Math.max(-1, Math.min(1, p0.lx * 1.4)) * 9} 0)`)

    const l = ledState(mode, f.alertOn)
    setLed(root.current, l)
    op(eye.current, mode === 'alert' ? 1 : Math.max(0.12, f.eyeOpen))
    op(eyeHalo.current, (mode === 'alert' ? 0.8 : 0.5 * f.dark) * Math.max(0.1, f.eyeOpen))
    op(coreHalo.current, (0.25 + 0.45 * f.dark) * (mode === 'sleep' ? 0.3 : 1))
    return moving
  })

  const limb = (side: 'l' | 'r'): React.JSX.Element => (
    <g key={side}>
      <path ref={thigh[side]} className="rb-limb dark" />
      <path ref={shin[side]} className="rb-limb" />
      <circle ref={knee[side]} className="rb-alu" r={6} />
      <rect className="rb-graphite" x={(side === 'l' ? -FOOT_X : FOOT_X) - 11} y={-9} width={22} height={9} rx={3} />
    </g>
  )
  const armParts = (side: 'l' | 'r'): React.JSX.Element => (
    <g ref={arm[side]} key={side}>
      <path className="rb-limb dark thin" d="M 0 0 L 0 30" />
      <g ref={fore[side]}>
        <path className="rb-limb thin" d="M 0 0 L 0 27" />
        <path className="rb-dark-line" strokeWidth={4} d="M -4 28 L -5 37 M 4 28 L 5 37" />
      </g>
      <circle className="rb-alu" cx={0} cy={30} r={5} />
      <circle className="rb-alu" cx={0} cy={0} r={8.5} />
    </g>
  )

  return (
    <g ref={root} className="rb" data-led="normal">
      <g ref={fx}>
        {limb('l')}
        {limb('r')}
        <g ref={upper}>
          <rect className="rb-graphite" x={-20} y={-10} width={40} height={14} rx={5} />
          {armParts('l')}
          {armParts('r')}
          <g ref={torso}>
            {/* Ngực giáp vỏ gốm, ô kính, lõi xanh ngọc */}
            <rect className="rb-shell" x={-30} y={-71} width={60} height={64} rx={14} />
            <rect className="rb-glass" x={-16} y={-60} width={32} height={26} rx={5} />
            <circle ref={coreHalo} className="rb-halo-led" cx={0} cy={-47} r={20} />
            <circle className="rb-led" cx={0} cy={-47} r={5} />
            <rect className="rb-graphite" x={-30} y={-24} width={60} height={6} rx={3} />
          </g>
          <g ref={head}>
            {/* Cổ, mũ graphite, kính che mắt với dải đèn quét */}
            <rect className="rb-graphite" x={-7} y={-6} width={14} height={8} rx={2} />
            <line className="rb-alu-line" x1={14} y1={-49} x2={14} y2={-64} />
            <circle className="rb-led" cx={14} cy={-66} r={3.2} />
            <rect className="rb-graphite" x={-25} y={-50} width={50} height={46} rx={13} />
            <rect className="rb-gloss" x={-18} y={-46} width={24} height={4} rx={2} />
            <rect className="rb-glass" x={-20} y={-34} width={40} height={13} rx={6} />
            <ellipse ref={eyeHalo} className="rb-halo-eye" cx={0} cy={-27.5} rx={34} ry={16} />
            <rect ref={eye} className="rb-visor-eye" x={-7.5} y={-30.5} width={15} height={6} rx={3} />
          </g>
        </g>
      </g>
    </g>
  )
}
