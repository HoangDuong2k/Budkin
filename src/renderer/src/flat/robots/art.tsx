// Hình vẽ robot 2D dùng chung cho bàn làm việc 2D của app và trang giới thiệu (site/): chỉ có SVG — không phụ thuộc
// trạng thái của app. Ai dùng thì tự làm chuyển động qua các ref (nhóm fx › body › head › eyes, tay, ăng-ten).
// Màu và lớp CSS: styles/robot-art.css (biến --rb-* trên .flat hoặc .robot-art).
import { createRef, useRef, type RefObject } from 'react'

/** Màu mắt LED xanh ngọc của Budkin (giống scene/palette3d ROBOT.eye) */
export const BUDKIN_EYE = '#5ae3d8'

/** Gradient cho các mặt vật liệu (vỏ gốm, graphite, nhôm, kính, quầng sáng) — đặt trong <defs> của SVG chứa robot */
export function RobotDefs(): React.JSX.Element {
  return (
    <>
      <linearGradient id="fr-shell" x1="0" x2="1" y1="0" y2="0.35">
        <stop offset="0" style={{ stopColor: 'var(--rb-shell-hi)' }} />
        <stop offset="0.55" style={{ stopColor: 'var(--rb-shell)' }} />
        <stop offset="1" style={{ stopColor: 'var(--rb-shell-lo)' }} />
      </linearGradient>
      <linearGradient id="fr-graphite" x1="0" x2="1" y1="0" y2="0.3">
        <stop offset="0" style={{ stopColor: 'var(--rb-gr-hi)' }} />
        <stop offset="1" style={{ stopColor: 'var(--rb-gr-lo)' }} />
      </linearGradient>
      <linearGradient id="fr-alu" x1="0" x2="1" y1="0" y2="0.6">
        <stop offset="0" style={{ stopColor: 'var(--rb-alu-hi)' }} />
        <stop offset="1" style={{ stopColor: 'var(--rb-alu-lo)' }} />
      </linearGradient>
      <linearGradient id="fr-glass" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#1b1f23" />
        <stop offset="1" stopColor="#040506" />
      </linearGradient>
      <radialGradient id="fr-halo-led">
        <stop offset="0" style={{ stopColor: 'var(--rb-led)', stopOpacity: 0.55 }} />
        <stop offset="1" style={{ stopColor: 'var(--rb-led)', stopOpacity: 0 }} />
      </radialGradient>
      <radialGradient id="fr-halo-alert">
        <stop offset="0" style={{ stopColor: 'var(--rb-alert)', stopOpacity: 0.6 }} />
        <stop offset="1" style={{ stopColor: 'var(--rb-alert)', stopOpacity: 0 }} />
      </radialGradient>
      <radialGradient id="fr-halo-eye">
        <stop offset="0" style={{ stopColor: 'var(--rb-eye)', stopOpacity: 0.5 }} />
        <stop offset="1" style={{ stopColor: 'var(--rb-eye)', stopOpacity: 0 }} />
      </radialGradient>
      <radialGradient id="fr-shadow">
        <stop offset="0" stopColor="#000" stopOpacity="0.55" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </>
  )
}

/** Các phần của Budkin có thể làm chuyển động */
export interface BudkinParts {
  /** Cả robot (nhảy, bẹp, xoay) — gốc toạ độ ở giữa hai bánh xe, trên mặt đất */
  fx: RefObject<SVGGElement | null>
  /** Thân, tay, cổ, đầu (bánh xe đứng yên) */
  body: RefObject<SVGGElement | null>
  /** Tay trái, tay phải (khớp vai ở (∓52, -72)) */
  armL: RefObject<SVGGElement | null>
  armR: RefObject<SVGGElement | null>
  head: RefObject<SVGGElement | null>
  /** Ăng-ten và đèn trạng thái (gốc ở đỉnh đầu (0, -189)) */
  antenna: RefObject<SVGGElement | null>
  /** Hai mắt (tâm ở (0, 0), đặt vào chỗ bằng transform) */
  eyes: RefObject<SVGGElement | null>
  /** Mắt cười ^^ (ẩn) */
  happy: RefObject<SVGGElement | null>
  eyeHalo: RefObject<SVGEllipseElement | null>
  ledHalo: RefObject<SVGCircleElement | null>
  coreHalo: RefObject<SVGEllipseElement | null>
}

/** Các ref của Budkin — cùng một object suốt vòng đời component (dùng được làm dependency của effect) */
export function useBudkinParts(): BudkinParts {
  const parts = useRef<BudkinParts | null>(null)
  parts.current ??= {
    fx: createRef(),
    body: createRef(),
    armL: createRef(),
    armR: createRef(),
    head: createRef(),
    antenna: createRef(),
    eyes: createRef(),
    happy: createRef(),
    eyeHalo: createRef(),
    ledHalo: createRef(),
    coreHalo: createRef()
  }
  return parts.current
}

/** Budkin — robot bánh xe vui tính: vỏ gốm trắng ngà, mặt kính đen, mắt LED xanh ngọc, ăng-ten có đèn trạng thái */
export function BudkinArt({ parts: p }: { parts: BudkinParts }): React.JSX.Element {
  return (
    <g ref={p.fx} className="rb" data-led="normal">
      {/* Gầm graphite, hai bánh xe cao su moay-ơ nhôm, dải đèn phía trước */}
      <rect className="rb-graphite" x={-33} y={-28} width={66} height={20} rx={8} />
      <rect className="rb-rubber" x={-47} y={-32} width={13} height={32} rx={5.5} />
      <rect className="rb-rubber" x={34} y={-32} width={13} height={32} rx={5.5} />
      <rect className="rb-alu" x={-44.5} y={-20} width={6} height={8} rx={2} />
      <rect className="rb-alu" x={38.5} y={-20} width={6} height={8} rx={2} />
      <rect className="rb-led" x={-17} y={-19.5} width={34} height={3} rx={1.5} />
      <g ref={p.body}>
        {/* Tay graphite, khớp vai nhôm, bàn tay tròn vỏ gốm */}
        <g ref={p.armL}>
          <rect className="rb-graphite" x={-7.8} y={-22} width={15.6} height={44} rx={7.8} transform="translate(-52 -55) rotate(20)" />
          <circle className="rb-shell" cx={-60.5} cy={-31} r={9} />
        </g>
        <g ref={p.armR}>
          <rect className="rb-graphite" x={-7.8} y={-22} width={15.6} height={44} rx={7.8} transform="translate(52 -55) rotate(-20)" />
          <circle className="rb-shell" cx={60.5} cy={-31} r={9} />
        </g>
        {/* Thân vỏ gốm, đai graphite, ô kính trên ngực có vạch pin */}
        <rect className="rb-shell" x={-42} y={-91} width={84} height={70} rx={20} />
        <rect className="rb-graphite" x={-42.8} y={-34} width={85.6} height={8} rx={4} />
        <circle className="rb-alu" cx={-46} cy={-72} r={8.8} />
        <circle className="rb-alu" cx={46} cy={-72} r={8.8} />
        <rect className="rb-glass" x={-21} y={-74} width={42} height={28} rx={5} />
        <ellipse ref={p.coreHalo} className="rb-halo-led" cx={0} cy={-60} rx={34} ry={26} />
        <rect className="rb-led" x={-11.75} y={-67.5} width={5.5} height={15} rx={1} />
        <rect className="rb-led" x={-2.75} y={-67.5} width={5.5} height={15} rx={1} />
        <rect className="rb-led" x={6.25} y={-67.5} width={5.5} height={15} rx={1} />
        {/* Cổ graphite, vòng sáng */}
        <rect className="rb-graphite" x={-11} y={-106} width={22} height={17} rx={3} />
        <path className="rb-led-line" d="M -12.6 -95 A 12.6 3 0 0 0 12.6 -95" />
        <g ref={p.head}>
          {/* Tai: hai khối tròn graphite, nắp nhôm anod xanh ngọc */}
          <rect className="rb-graphite" x={-64} y={-160} width={10} height={27} rx={3.5} />
          <rect className="rb-graphite" x={54} y={-160} width={10} height={27} rx={3.5} />
          <rect className="rb-anod" x={-66} y={-154} width={3.5} height={15} rx={1.5} />
          <rect className="rb-anod" x={62.5} y={-154} width={3.5} height={15} rx={1.5} />
          {/* Ăng-ten nhôm mảnh, đầu là đèn trạng thái (đỏ khi báo động) */}
          <g ref={p.antenna}>
            <line className="rb-alu-line" x1={0} y1={-189} x2={0} y2={-219} />
            <circle ref={p.ledHalo} className="rb-halo-state" cx={0} cy={-225} r={18} />
            <circle className="rb-led" cx={0} cy={-225} r={5.8} />
          </g>
          {/* Đầu vỏ gốm, mặt kính đen bóng */}
          <rect className="rb-shell" x={-55} y={-190} width={110} height={85} rx={26} />
          <rect className="rb-glass" x={-47} y={-179} width={94} height={60} rx={16} />
          <rect className="rb-gloss" x={-40} y={-175} width={46} height={6} rx={3} />
          <ellipse ref={p.eyeHalo} className="rb-halo-eye" cx={0} cy={-148} rx={46} ry={30} />
          <g ref={p.eyes}>
            <rect className="rb-eye" x={-26.8} y={-12.3} width={13.6} height={24.6} rx={6.8} />
            <rect className="rb-eye" x={13.2} y={-12.3} width={13.6} height={24.6} rx={6.8} />
          </g>
          {/* Mắt cười ^^ khi ăn mừng */}
          <g ref={p.happy} style={{ opacity: 0 }}>
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
