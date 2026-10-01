// Rover 2D — xe bánh xích hăng hái kiểu thiết bị hiện trường: thân graphite sọc hổ phách, hai dải xích cao su, cột kính
// tiềm vọng thò lên thụt xuống, đầu vỏ gốm với hai mắt ống kính màu hổ phách, đèn hiệu trên lưng.
// Nhìn theo con trỏ bằng đầu trên cột. Bị chọc: lùi lại rồi chạy lên, đầu gật gù. Ăn mừng: xoay tại chỗ một vòng, cột kính
// vươn cao. Báo động: cột kính vươn hết cỡ, đèn hiệu đỏ nhấp nháy, xích nhún. Lơ mơ thì cột kính hạ dần, ngủ thì thu hẳn.
import { useRef } from 'react'
import { damp, easeInOut, easeOutBack, op, tf, useFlatRig } from '../rig2d'
import { ledState, setLed } from './common'

const TAU = Math.PI * 2
/** Đỉnh thân xe (chân cột kính) so với mặt bệ (mm) */
const HULL_TOP = 58
/** Cột kính thò lên thêm: bình thường / báo động */
const MAST_IDLE = 22
const MAST_HIGH = 36
/** Tâm đầu so với chân cột khi cột thu hết */
const HEAD_BASE = 40

function pulse(t: number, len: number): number {
  return t >= 0 && t <= len ? Math.sin((Math.PI * t) / len) : 0
}

export function Rover(): React.JSX.Element {
  const root = useRef<SVGGElement>(null)
  const fx = useRef<SVGGElement>(null)
  const mast = useRef<SVGRectElement>(null)
  const head = useRef<SVGGElement>(null)
  const irisL = useRef<SVGGElement>(null)
  const irisR = useRef<SVGGElement>(null)
  const eyeHalo = useRef<SVGEllipseElement>(null)
  const beaconHalo = useRef<SVGCircleElement>(null)
  const pose = useRef({ mast: 0, lx: 0, ly: 0 })

  useFlatRig({ eyeY: HULL_TOP + HEAD_BASE + MAST_IDLE, zzzY: 175 }, (f) => {
    const { dt, mode, t, reduced } = f
    const p0 = pose.current
    let moving = false
    let mastTarget = mode === 'sleep' ? 0 : mode === 'drowsy' ? 8 : mode === 'alert' || mode === 'celebrate' ? MAST_HIGH : MAST_IDLE
    let back = 0
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
        hop = 12 * pulse(t, 0.25)
        mastTarget = MAST_HIGH
        moving = true
      } else if (mode === 'poked') {
        // Lùi lại (nhỏ đi, lùi sâu vào trong) rồi chạy lên chỗ cũ, đầu gật gù
        const p = Math.min(1, t / 0.65)
        back = Math.sin(Math.PI * p)
        nod = 14 * Math.sin(TAU * 2 * p) * (1 - p)
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 1.2)
        turn = TAU * easeInOut(p)
        hop = 10 * pulse(p, 1)
        moving = true
      } else if (f.alertHop) {
        hop = 4 * Math.abs(Math.sin((Math.PI * t) / 0.3))
        moving = true
      }
    }
    if (mode !== 'intro' || reduced) moving = damp(p0, 'mast', mastTarget, 0.3, dt, 0.05) || moving
    const smooth = reduced ? 0.06 : 0.12
    moving = damp(p0, 'lx', f.look.x * 0.9, smooth, dt) || moving
    moving = damp(p0, 'ly', f.look.y * 0.85, smooth, dt) || moving
    const turnX = Math.cos(turn)
    const k = scale * (1 - 0.08 * back)
    tf(fx.current, `translate(0 ${-hop - 4 * back}) scale(${(Math.abs(turnX) < 0.02 ? 0.02 : turnX) * k} ${k})`)

    const mastLen = HEAD_BASE + p0.mast
    tf(mast.current, `translate(0 ${-HULL_TOP}) scale(1 ${mastLen / 10})`)
    tf(head.current, `translate(${p0.lx * 6} ${-(HULL_TOP + mastLen) - p0.ly * 3}) rotate(${p0.lx * 5 + nod})`)
    const s = mode === 'alert' ? 1.2 : 1 + 0.15 * f.near
    const iris = `translate(${p0.lx * 3} ${-p0.ly * 3}) scale(${s} ${s * Math.max(0.06, f.eyeOpen)})`
    tf(irisL.current, `translate(-19 0) ${iris}`)
    tf(irisR.current, `translate(19 0) ${iris}`)

    const l = ledState(mode, f.alertOn)
    setLed(root.current, mode === 'celebrate' ? 'normal' : l)
    op(eyeHalo.current, 0.5 * f.dark * Math.max(0.1, f.eyeOpen))
    op(beaconHalo.current, l === 'alert' ? 0.95 : mode === 'celebrate' ? 0.7 : mode === 'sleep' ? 0 : 0.3 * f.dark)
    return moving
  })

  return (
    <g ref={root} className="rb" data-led="normal">
      <g ref={fx}>
        {/* Đèn hiệu trên lưng */}
        <circle ref={beaconHalo} className="rb-halo-beacon" cx={22} cy={-HULL_TOP - 4} r={22} />
        <rect className="rb-graphite" x={15} y={-HULL_TOP - 3} width={14} height={5} rx={2} />
        <path className="rb-beacon" d={`M 16 ${-HULL_TOP - 3} a 6 6 0 0 1 12 0 Z`} />
        {/* Cột kính tiềm vọng: thanh 10 mm, kéo dài theo độ thò */}
        <rect ref={mast} className="rb-alu" x={-3.5} y={-10} width={7} height={10} />
        <rect className="rb-graphite" x={-8} y={-HULL_TOP - 8} width={16} height={9} rx={2} />
        {/* Dải xích cao su hai bên, bánh nhôm */}
        <rect className="rb-rubber" x={-60} y={-40} width={20} height={40} rx={9} />
        <rect className="rb-rubber" x={40} y={-40} width={20} height={40} rx={9} />
        <path className="rb-tread" d="M -60 -32 h 20 M -60 -24 h 20 M -60 -16 h 20 M -60 -8 h 20 M 40 -32 h 20 M 40 -24 h 20 M 40 -16 h 20 M 40 -8 h 20" />
        <circle className="rb-alu" cx={-50} cy={-30} r={5} />
        <circle className="rb-alu" cx={50} cy={-30} r={5} />
        <circle className="rb-alu" cx={-50} cy={-10} r={5} />
        <circle className="rb-alu" cx={50} cy={-10} r={5} />
        {/* Thân xe graphite, nắp nhôm, sọc hổ phách, đèn pha phía trước */}
        <rect className="rb-graphite" x={-44} y={-HULL_TOP} width={88} height={46} rx={7} />
        <rect className="rb-alu" x={-42} y={-HULL_TOP - 2} width={84} height={6} rx={3} />
        <rect className="rb-amber" x={-36} y={-26} width={72} height={4} rx={2} />
        <rect className="rb-eye" x={-12} y={-40} width={24} height={4} rx={2} />
        <rect className="rb-gloss" x={-38} y={-52} width={30} height={4} rx={2} />
        {/* Đầu vỏ gốm trên cột kính: hai mắt ống kính hổ phách */}
        <g ref={head}>
          <ellipse ref={eyeHalo} className="rb-halo-eye" cx={0} cy={0} rx={52} ry={30} />
          <rect className="rb-shell" x={-38} y={-21} width={76} height={42} rx={21} />
          <rect className="rb-graphite" x={-38} y={8} width={76} height={6} rx={3} opacity={0.5} />
          {[-19, 19].map((x) => (
            <g key={x}>
              <circle className="rb-glass" cx={x} cy={0} r={13.5} />
              <circle className="rb-eye-ring" cx={x} cy={0} r={11} />
            </g>
          ))}
          <g ref={irisL}>
            <circle className="rb-eye" cx={0} cy={0} r={5} />
            <circle fill="#050607" cx={0} cy={0} r={2.2} />
          </g>
          <g ref={irisR}>
            <circle className="rb-eye" cx={0} cy={0} r={5} />
            <circle fill="#050607" cx={0} cy={0} r={2.2} />
          </g>
          <circle fill="#fff" opacity={0.6} cx={-23} cy={-5} r={1.8} />
          <circle fill="#fff" opacity={0.6} cx={15} cy={-5} r={1.8} />
        </g>
      </g>
    </g>
  )
}
