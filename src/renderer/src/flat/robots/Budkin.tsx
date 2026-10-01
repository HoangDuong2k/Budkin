// Budkin 2D — robot bánh xe vui tính (vỏ gốm trắng ngà, mặt kính đen, mắt LED xanh ngọc, ăng-ten có đèn trạng thái):
// bị chọc thì bẹp-giãn, ăn mừng thì nhảy xoay một vòng, báo động thì nhún nhảy, đèn ăng-ten đỏ nhấp nháy.
// Nhóm: fx (nhảy / bẹp / xoay) › body › head › eyes
import { useRef } from 'react'
import { damp, easeInOut, easeOutBack, op, tf, useFlatRig } from '../rig2d'
import { ledState, setLed } from './common'

const TAU = Math.PI * 2

export function Budkin(): React.JSX.Element {
  const fx = useRef<SVGGElement>(null)
  const body = useRef<SVGGElement>(null)
  const head = useRef<SVGGElement>(null)
  const eyes = useRef<SVGGElement>(null)
  const happy = useRef<SVGGElement>(null)
  const eyeHalo = useRef<SVGEllipseElement>(null)
  const ledHalo = useRef<SVGCircleElement>(null)
  const coreHalo = useRef<SVGEllipseElement>(null)
  const p = useRef({ lx: 0, ly: 0 })

  useFlatRig({ eyeY: 148, zzzY: 290 }, (f) => {
    const { dt, mode, t } = f
    const s = p.current
    let moving = damp(s, 'lx', f.look.x, f.reduced ? 0.06 : 0.12, dt)
    moving = damp(s, 'ly', f.look.y, f.reduced ? 0.06 : 0.12, dt) || moving
    const sleeping = mode === 'sleep'

    let hop = 0
    let squash = 1
    let spin = 1
    let scale = 1
    if (!f.reduced) {
      if (mode === 'intro') {
        scale = Math.max(0.01, easeOutBack(Math.min(1, t / 0.9)))
        moving = true
      } else if (mode === 'startled') {
        hop = 25 * Math.sin(Math.PI * Math.min(1, t / 0.25))
        moving = true
      } else if (mode === 'poked') {
        const k = Math.min(1, t / 0.45)
        squash = 1 - 0.16 * Math.sin(TAU * k) * (1 - k)
        moving = true
      } else if (mode === 'celebrate') {
        const k = Math.min(1, t / 0.9)
        hop = 40 * Math.sin(Math.PI * k)
        spin = Math.cos(TAU * easeInOut(k))
        moving = true
      } else if (f.alertHop) {
        hop = 12 * Math.abs(Math.sin((Math.PI * t) / 0.6))
        moving = true
      }
    }
    const sx = (scale / Math.sqrt(squash)) * spin
    tf(fx.current, `translate(0 ${-hop}) scale(${sx} ${scale * squash})`)
    tf(body.current, `rotate(${s.lx * 1.5} 0 -30)`)
    // Đầu nghiêng theo hướng nhìn; ngủ thì gục xuống
    tf(head.current, `translate(${s.lx * 5} ${-s.ly * 2 + (sleeping ? 4 : 0)}) rotate(${s.lx * 4 + (sleeping ? 6 : 0)} 0 -105)`)
    const es = mode === 'alert' ? 1.15 : 1
    tf(eyes.current, `translate(${s.lx * 7} ${-s.ly * 5 - 148}) scale(${es} ${es * f.eyeOpen})`)
    const celebrating = mode === 'celebrate'
    op(eyes.current, celebrating ? 0 : 1)
    op(happy.current, celebrating ? 1 : 0)

    const l = ledState(mode, f.alertOn)
    setLed(fx.current, l)
    op(eyeHalo.current, 0.55 * f.dark * (sleeping ? 0.2 : 1))
    op(coreHalo.current, (0.25 + 0.45 * f.dark) * (sleeping ? 0.35 : 1))
    op(ledHalo.current, (l === 'alert' ? 0.9 : 0.5 * f.dark) * (sleeping ? 0.3 : 1))
    return moving
  })

  return (
    <g ref={fx} className="rb" data-led="normal">
      {/* Gầm graphite, hai bánh xe cao su moay-ơ nhôm, dải đèn phía trước */}
      <rect className="rb-graphite" x={-33} y={-28} width={66} height={20} rx={8} />
      <rect className="rb-rubber" x={-47} y={-32} width={13} height={32} rx={5.5} />
      <rect className="rb-rubber" x={34} y={-32} width={13} height={32} rx={5.5} />
      <rect className="rb-alu" x={-44.5} y={-20} width={6} height={8} rx={2} />
      <rect className="rb-alu" x={38.5} y={-20} width={6} height={8} rx={2} />
      <rect className="rb-led" x={-17} y={-19.5} width={34} height={3} rx={1.5} />
      <g ref={body}>
        {/* Tay graphite, khớp vai nhôm, bàn tay tròn vỏ gốm */}
        <rect className="rb-graphite" x={-7.8} y={-22} width={15.6} height={44} rx={7.8} transform="translate(-52 -55) rotate(20)" />
        <rect className="rb-graphite" x={-7.8} y={-22} width={15.6} height={44} rx={7.8} transform="translate(52 -55) rotate(-20)" />
        <circle className="rb-shell" cx={-60.5} cy={-31} r={9} />
        <circle className="rb-shell" cx={60.5} cy={-31} r={9} />
        {/* Thân vỏ gốm, đai graphite, ô kính trên ngực có vạch pin */}
        <rect className="rb-shell" x={-42} y={-91} width={84} height={70} rx={20} />
        <rect className="rb-graphite" x={-42.8} y={-34} width={85.6} height={8} rx={4} />
        <circle className="rb-alu" cx={-46} cy={-72} r={8.8} />
        <circle className="rb-alu" cx={46} cy={-72} r={8.8} />
        <rect className="rb-glass" x={-21} y={-74} width={42} height={28} rx={5} />
        <ellipse ref={coreHalo} className="rb-halo-led" cx={0} cy={-60} rx={34} ry={26} />
        <rect className="rb-led" x={-11.75} y={-67.5} width={5.5} height={15} rx={1} />
        <rect className="rb-led" x={-2.75} y={-67.5} width={5.5} height={15} rx={1} />
        <rect className="rb-led" x={6.25} y={-67.5} width={5.5} height={15} rx={1} />
        {/* Cổ graphite, vòng sáng */}
        <rect className="rb-graphite" x={-11} y={-106} width={22} height={17} rx={3} />
        <path className="rb-led-line" d="M -12.6 -95 A 12.6 3 0 0 0 12.6 -95" />
        <g ref={head}>
          {/* Tai: hai khối tròn graphite, nắp nhôm anod xanh ngọc */}
          <rect className="rb-graphite" x={-64} y={-160} width={10} height={27} rx={3.5} />
          <rect className="rb-graphite" x={54} y={-160} width={10} height={27} rx={3.5} />
          <rect className="rb-anod" x={-66} y={-154} width={3.5} height={15} rx={1.5} />
          <rect className="rb-anod" x={62.5} y={-154} width={3.5} height={15} rx={1.5} />
          {/* Ăng-ten nhôm mảnh, đầu là đèn trạng thái (đỏ khi báo động) */}
          <line className="rb-alu-line" x1={0} y1={-189} x2={0} y2={-219} />
          <circle ref={ledHalo} className="rb-halo-state" cx={0} cy={-225} r={18} />
          <circle className="rb-led" cx={0} cy={-225} r={5.8} />
          {/* Đầu vỏ gốm, mặt kính đen bóng */}
          <rect className="rb-shell" x={-55} y={-190} width={110} height={85} rx={26} />
          <rect className="rb-glass" x={-47} y={-179} width={94} height={60} rx={16} />
          <rect className="rb-gloss" x={-40} y={-175} width={46} height={6} rx={3} />
          <ellipse ref={eyeHalo} className="rb-halo-eye" cx={0} cy={-148} rx={46} ry={30} />
          <g ref={eyes}>
            <rect className="rb-eye" x={-26.8} y={-12.3} width={13.6} height={24.6} rx={6.8} />
            <rect className="rb-eye" x={13.2} y={-12.3} width={13.6} height={24.6} rx={6.8} />
          </g>
          {/* Mắt cười ^^ khi ăn mừng */}
          <g ref={happy} style={{ opacity: 0 }}>
            <path className="rb-eye-line" d="M -28 -144 Q -20 -158 -12 -144" />
            <path className="rb-eye-line" d="M 12 -144 Q 20 -158 28 -144" />
          </g>
          {/* Miệng: nụ cười nhỏ */}
          <path className="rb-eye-line thin" d="M -6 -136 Q 0 -130 6 -136" />
        </g>
      </g>
    </g>
  )
}
