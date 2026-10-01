// Miu 2D — mèo máy tinh nghịch: thân vỏ gốm, mặt kính đen, tai graphite có dải LED bên trong, mắt xanh bạc hà, ria nhôm,
// đuôi graphite có đèn ở chóp. Ngồi nhìn theo con trỏ; con trỏ lại gần thì vểnh tai, dựng đuôi. Bị chọc: rung rừ rừ, mắt
// cười. Ăn mừng: nhảy lên, đuôi quẫy một vòng. Báo động: ngồi thẳng lưng, tai đỏ nhấp nháy, vẫy đuôi. Lơ mơ thì cụp tai,
// ngủ thì nằm xuống, đuôi quấn lại.
import { useRef } from 'react'
import { damp, easeOutBack, op, tf, useFlatRig } from '../rig2d'
import { ledState, setLed } from './common'

const DEG = 180 / Math.PI
/** Cổ (điểm xoay đầu) so với mặt bệ, mm */
const NECK = 62

function pulse(t: number, len: number): number {
  return t >= 0 && t <= len ? Math.sin((Math.PI * t) / len) : 0
}

export function Miu(): React.JSX.Element {
  const root = useRef<SVGGElement>(null)
  const fx = useRef<SVGGElement>(null)
  const body = useRef<SVGGElement>(null)
  const legs = useRef<SVGGElement>(null)
  const head = useRef<SVGGElement>(null)
  const eyes = useRef<SVGGElement>(null)
  const happy = useRef<SVGGElement>(null)
  const earL = useRef<SVGGElement>(null)
  const earR = useRef<SVGGElement>(null)
  const tail = useRef<SVGGElement>(null)
  const eyeHalo = useRef<SVGEllipseElement>(null)
  const pose = useRef({ crouch: 0, ear: 0.25, tailUp: 0, curl: 0, lx: 0, ly: 0 })

  useFlatRig({ eyeY: 95, zzzY: 165 }, (f) => {
    const { dt, mode, t, reduced, now } = f
    const p0 = pose.current
    let moving = false
    const sleeping = mode === 'sleep'
    // Tai: 0 vểnh thẳng … 0.6 cụp ra sau; con trỏ lại gần thì vểnh
    const earTarget = sleeping ? 0.6 : mode === 'drowsy' ? 0.45 : mode === 'alert' || mode === 'startled' ? 0.02 : mode === 'poked' ? 0.42 : 0.25 - 0.18 * f.near
    moving = damp(p0, 'crouch', sleeping ? 1 : mode === 'drowsy' ? 0.35 : 0, 0.5, dt) || moving
    moving = damp(p0, 'ear', earTarget, 0.12, dt) || moving
    moving = damp(p0, 'tailUp', mode === 'alert' || mode === 'startled' ? 1 : f.near * 0.6, 0.25, dt) || moving
    moving = damp(p0, 'curl', sleeping ? 1 : 0, 0.6, dt) || moving

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
        hop = 20 * pulse(t, 0.25)
        moving = true
      } else if (mode === 'poked') {
        // Rừ rừ: rung rất nhanh, rất nhẹ
        jitter = 0.8 * Math.sin(now * 0.09) * (1 - Math.min(1, t / 0.9))
        wag = 0.1 * Math.sin(now / 300)
        moving = true
      } else if (mode === 'celebrate') {
        const p = Math.min(1, t / 1.0)
        hop = 30 * pulse(p, 1)
        swirl = 360 * p
        moving = true
      } else if (f.alertHop) {
        hop = 6 * Math.abs(Math.sin((Math.PI * t) / 0.5))
        wag = 0.5 * Math.sin((2 * Math.PI * t) / 0.35)
        moving = true
      }
    }
    const smooth = reduced ? 0.06 : 0.12
    moving = damp(p0, 'lx', f.look.x * 0.85, smooth, dt) || moving
    moving = damp(p0, 'ly', f.look.y * 0.85, smooth, dt) || moving
    tf(fx.current, `translate(${jitter} ${-hop}) scale(1 ${stretch * (mode === 'alert' ? 1.05 : 1)})`)
    // Nằm xuống: thân hạ thấp, chân trước gập dưới thân, đầu gục xuống
    tf(body.current, `translate(0 ${12 * p0.crouch})`)
    tf(legs.current, `scale(1 ${1 - 0.65 * p0.crouch})`)
    tf(head.current, `translate(${p0.lx * 5} ${12 * p0.crouch - p0.ly * 2}) rotate(${p0.lx * 5 + 8 * p0.crouch} 0 ${-NECK})`)
    const es = mode === 'alert' ? 1.15 : 1
    tf(eyes.current, `translate(${p0.lx * 5} ${-95 - p0.ly * 3}) scale(${es} ${es * Math.max(0.08, f.eyeOpen)})`)
    op(eyes.current, happyEyes ? 0 : 1)
    op(happy.current, happyEyes ? 1 : 0)
    const ear = 16 + p0.ear * 40
    tf(earL.current, `translate(-24 -116) rotate(${-ear})`)
    tf(earR.current, `translate(24 -116) rotate(${ear})`)
    // Đuôi: dựng lên khi báo động / con trỏ lại gần, vẫy, quẫy một vòng khi ăn mừng, quấn quanh người khi ngủ
    tf(tail.current, `translate(26 -12) rotate(${(wag * (1 - p0.curl) - 0.35 * p0.tailUp) * DEG + 100 * p0.curl + swirl})`)

    setLed(root.current, ledState(mode, f.alertOn))
    op(eyeHalo.current, 0.5 * f.dark * Math.max(0.15, f.eyeOpen))
    return moving
  })

  return (
    <g ref={root} className="rb" data-led="normal">
      <g ref={fx}>
        {/* Đuôi graphite, chóp có đèn */}
        <g ref={tail}>
          <path className="rb-tail" d="M 0 0 C 24 -2 40 -28 30 -62" />
          <circle className="rb-led" cx={30} cy={-63} r={4.5} />
        </g>
        <g ref={body}>
          {/* Thân ngồi, hai đùi sau, ô kính trước ngực */}
          <ellipse className="rb-shell" cx={-24} cy={-15} rx={15} ry={15} />
          <ellipse className="rb-shell" cx={24} cy={-15} rx={15} ry={15} />
          <path className="rb-shell" d="M -28 -2 C -36 -22 -32 -52 -18 -64 L 18 -64 C 32 -52 36 -22 28 -2 Z" />
          <rect className="rb-glass" x={-13} y={-52} width={26} height={30} rx={6} />
          <rect className="rb-led" x={-6} y={-30} width={12} height={2.4} rx={1.2} />
          <g ref={legs}>
            <rect className="rb-shell" x={-17} y={-30} width={11} height={30} rx={5.5} />
            <rect className="rb-shell" x={6} y={-30} width={11} height={30} rx={5.5} />
            <ellipse className="rb-shell" cx={-11.5} cy={-2.5} rx={8} ry={5} />
            <ellipse className="rb-shell" cx={11.5} cy={-2.5} rx={8} ry={5} />
          </g>
        </g>
        <g ref={head}>
          {/* Tai graphite có dải LED bên trong */}
          <g ref={earL}>
            <path className="rb-graphite" d="M -13 6 L -1 -34 L 13 6 Z" />
            <path className="rb-led" d="M -6 2 L -1 -20 L 5 2 Z" />
          </g>
          <g ref={earR}>
            <path className="rb-graphite" d="M -13 6 L 1 -34 L 13 6 Z" />
            <path className="rb-led" d="M -5 2 L 1 -20 L 6 2 Z" />
          </g>
          {/* Đầu vỏ gốm, mặt kính đen, ria nhôm */}
          <rect className="rb-shell" x={-40} y={-122} width={80} height={58} rx={22} />
          <rect className="rb-glass" x={-32} y={-114} width={64} height={38} rx={13} />
          <rect className="rb-gloss" x={-25} y={-111} width={26} height={4} rx={2} />
          <path className="rb-alu-line thin" d="M 38 -88 L 56 -92 M 38 -84 L 57 -83 M -38 -88 L -56 -92 M -38 -84 L -57 -83" />
          <ellipse ref={eyeHalo} className="rb-halo-eye" cx={0} cy={-95} rx={38} ry={22} />
          <g ref={eyes}>
            <rect className="rb-eye" x={-20} y={-7} width={12} height={14} rx={6} />
            <rect className="rb-eye" x={8} y={-7} width={12} height={14} rx={6} />
          </g>
          <g ref={happy} style={{ opacity: 0 }}>
            <path className="rb-eye-line" d="M -20 -92 Q -14 -102 -8 -92" />
            <path className="rb-eye-line" d="M 8 -92 Q 14 -102 20 -92" />
          </g>
          {/* Miệng mèo "ω" */}
          <path className="rb-eye-line thin" d="M -7 -84 q 3.5 4 7 0 q 3.5 4 7 0" />
        </g>
      </g>
    </g>
  )
}
