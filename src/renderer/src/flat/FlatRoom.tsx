// Căn phòng của bàn làm việc 2D (tranh vector, cùng phong cách với cảnh 3D): tường bê tông nứt, cửa sổ vỡ nhìn ra thành
// phố đổ nát, hình vẽ robot trên tường, mặt bàn gỗ óc chó sẫm, màn hình (giao diện nằm khít trong khung), bàn phím, chuột,
// cây trong lọ, hộp thiết bị, dây cáp, đèn bàn (bấm để bật / tắt). Vẽ một lần theo bố cục; bật / tắt đèn chỉ đổi vài biến
// CSS (--night, --lamp, --bulb) trên lớp phủ tối và các vùng sáng — tranh tĩnh thì không vẽ lại gì.
import { memo, useMemo } from 'react'
import { tr } from '../../../shared/i18n'
import { useTheme } from '../state/themeStore'
import type { FlatLayout } from './flatLayout'

/** Số giả ngẫu nhiên lặp lại được (cùng bố cục → cùng thành phố, cùng bầu trời sao) */
function rng(seed: number): () => number {
  let x = seed >>> 0
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 4294967296
  }
}

interface City {
  far: string
  near: string
  windows: Array<{ x: number; y: number; w: number; h: number }>
}

/** Hai lớp nhà đổ nát: mái gãy, tầng sụt; vài ô cửa còn ánh đèn */
function city(x1: number, x2: number, ground: number, s: number): City {
  const r = rng(7)
  const layer = (minH: number, maxH: number, ruin: number, lit: boolean): { d: string; windows: City['windows'] } => {
    const windows: City['windows'] = []
    let x = x1 - 20 * s
    let d = `M ${x} ${ground}`
    while (x < x2) {
      const bw = (45 + r() * 95) * s
      const top = ground - (minH + r() * (maxH - minH)) * s
      d += ` L ${x} ${top}`
      if (r() < ruin) {
        // Mái gãy răng cưa
        d += ` L ${x + bw * 0.25} ${top + r() * 22 * s} L ${x + bw * 0.45} ${top - r() * 8 * s} L ${x + bw * 0.62} ${top + (10 + r() * 30) * s} L ${x + bw * 0.8} ${top + r() * 12 * s}`
      }
      d += ` L ${x + bw} ${top + (r() < 0.3 ? r() * 26 * s : 0)} L ${x + bw} ${ground}`
      if (lit && r() < 0.55)
        for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++)
          windows.push({ x: x + (0.15 + r() * 0.6) * bw, y: top + (25 + r() * Math.max(10, (ground - top) / s - 45)) * s, w: 5 * s, h: 7 * s })
      x += bw
    }
    return { d: `${d} L ${x2 + 20 * s} ${ground} Z`, windows }
  }
  const far = layer(70, 190, 0.5, false)
  const near = layer(40, 140, 0.65, true)
  return { far: far.d, near: near.d, windows: near.windows }
}

/** Phím trên bàn phím: một path cho cả bàn phím (vẽ một lần, ban đêm dùng lại làm đèn nền) */
function keysPath(k: FlatLayout['keyboard'], s: number): string {
  const rows = 5
  const pad = 7 * s
  const rowH = (k.h - 2 * pad) / rows
  const parts: string[] = []
  for (let i = 0; i < rows; i++) {
    const y = k.y + pad + i * rowH
    // Phối cảnh: hàng sau hẹp hơn hàng trước
    const width = k.w * (0.88 + (0.08 * (i + 0.5)) / rows)
    const x0 = k.x + (k.w - width) / 2
    const kh = rowH - 2.2 * s
    const keys = i === rows - 1 ? [1.3, 1.3, 1.3, 6.4, 1.3, 1.3, 1.3] : Array.from({ length: 14 }, (_, j) => (j === 13 && i > 0 ? 1.6 : 1))
    const total = keys.reduce((a, b) => a + b, 0)
    const unit = width / total
    let x = x0
    for (const kw of keys) {
      const ww = kw * unit - 2.2 * s
      const rr = Math.min(2.2 * s, ww / 4)
      parts.push(`M ${x + rr} ${y} h ${ww - 2 * rr} q ${rr} 0 ${rr} ${rr} v ${kh - 2 * rr} q 0 ${rr} ${-rr} ${rr} h ${-(ww - 2 * rr)} q ${-rr} 0 ${-rr} ${-rr} v ${-(kh - 2 * rr)} q 0 ${-rr} ${rr} ${-rr} z`)
      x += kw * unit
    }
  }
  return parts.join(' ')
}

export const FlatRoom = memo(function FlatRoom({ l }: { l: FlatLayout }): React.JSX.Element {
  const { w, h, s, cx, base, deskBack, screen, bezel, keyboard: kb } = l
  const toggle = useTheme((x) => x.toggle)
  const theme = useTheme((x) => x.target)

  const geo = useMemo(() => {
    // Cửa sổ vỡ phía trên robot, mép phải khuất sau màn hình
    const win = { x2: bezel.x + 40 * s, y1: Math.max(base - 640 * s, h * 0.035), y2: base - 335 * s, x1: 0 }
    win.x1 = Math.max(-30, win.x2 - 760 * s)
    const r = rng(11)
    const stars = Array.from({ length: 46 }, () => ({ x: win.x1 + r() * (win.x2 - win.x1), y: win.y1 + r() * (win.y2 - win.y1) * 0.62, r: (0.6 + r() * 1.1) * Math.max(1, s * 0.9) }))
    // Đèn bàn: chân đế, khớp, chụp đèn (tấm LED tròn chúc xuống về phía màn hình)
    const lx = l.lamp.x
    const lamp = { joint: { x: lx + 10 * s, y: base - 300 * s }, head: { x: lx - 40 * s, y: base - 455 * s } }
    // Hình vẽ trên tường phía sau đèn (đèn che bớt một phần, như vẽ trên tường thật)
    const graffiti = { x: Math.min(w - 110 * s, l.lamp.x + 18 * s), y: Math.max(base - 560 * s, h * 0.06 + 40 * s) }
    return { win, stars, city: city(win.x1, win.x2, win.y2 - 4 * s, s), keys: keysPath(kb, s), lamp, graffiti }
  }, [w, h, base, s, bezel.x, kb, l.lamp.x])
  const { win, lamp, graffiti: g } = geo
  const seamXs: number[] = []
  for (let x = cx - Math.ceil(cx / (600 * s)) * 600 * s; x < w; x += 600 * s) seamXs.push(x)
  const holes: Array<{ x: number; y: number }> = []
  for (const x of seamXs) for (const dy of [470, 770, 1070]) for (const dx of [150, 450]) holes.push({ x: x + dx * s, y: base - dy * s })
  const lx = l.lamp.x
  const standTop = bezel.y + bezel.height - 8 * s

  return (
    <svg className="flat-room" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id="fd-wall" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2f3134" />
          <stop offset="1" stopColor="#3a3c3f" />
        </linearGradient>
        <linearGradient id="fd-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1d2730" />
          <stop offset="0.5" stopColor="#3e4550" />
          <stop offset="0.82" stopColor="#7b6152" />
          <stop offset="1" stopColor="#a87656" />
        </linearGradient>
        <linearGradient id="fd-desk" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3a2a20" />
          <stop offset="1" stopColor="#2b1e17" />
        </linearGradient>
        <linearGradient id="fd-alu-h" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#4f5358" />
          <stop offset="0.45" stopColor="#8f9398" />
          <stop offset="1" stopColor="#45494e" />
        </linearGradient>
        <linearGradient id="fd-foot" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8d9196" />
          <stop offset="1" stopColor="#4f5358" />
        </linearGradient>
        <radialGradient id="fd-warm">
          <stop offset="0" stopColor="#ffe3c2" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#ffd9ad" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffd9ad" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fd-teal">
          <stop offset="0" stopColor="#4fe0d4" stopOpacity="0.38" />
          <stop offset="0.55" stopColor="#4fe0d4" stopOpacity="0.1" />
          <stop offset="1" stopColor="#4fe0d4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fd-vignette" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
        <clipPath id="fd-win">
          <rect x={win.x1} y={win.y1} width={win.x2 - win.x1} height={win.y2 - win.y1} />
        </clipPath>
        {/* Vùng sáng của màn hình hắt ra tường / bàn: không phủ lên khung màn hình */}
        <clipPath id="fd-off-monitor">
          <path clipRule="evenodd" d={`M 0 0 H ${w} V ${h} H 0 Z M ${bezel.x} ${bezel.y} h ${bezel.width} v ${bezel.height} h ${-bezel.width} Z`} />
        </clipPath>
        <path id="fd-keys" d={geo.keys} />
        {/* Trăng lưỡi liềm */}
        <mask id="fd-crescent" maskUnits="userSpaceOnUse">
          <rect x={0} y={0} width={w} height={h} fill="#fff" />
          <circle cx={win.x1 + (win.x2 - win.x1) * 0.78 + 4.5 * s} cy={win.y1 + 57 * s} r={9 * s} fill="#000" />
        </mask>
      </defs>

      {/* ---- Tường bê tông: vách đúc, mạch ghép, lỗ ty, vết ố, vết nứt ---- */}
      <rect x={0} y={0} width={w} height={deskBack + 2} fill="url(#fd-wall)" />
      {seamXs.map((x) => (
        <line key={x} className="fd-seam" x1={x} y1={0} x2={x} y2={deskBack} />
      ))}
      <line className="fd-seam" x1={0} y1={base - 620 * s} x2={w} y2={base - 620 * s} />
      <line className="fd-seam" x1={0} y1={base - 1240 * s} x2={w} y2={base - 1240 * s} />
      {holes.map((p, i) => (
        <circle key={i} className="fd-hole" cx={p.x} cy={p.y} r={4.2 * s} />
      ))}
      <ellipse className="fd-stain" cx={cx + 140 * s} cy={base - 820 * s} rx={220 * s} ry={90 * s} />
      <ellipse className="fd-stain" cx={l.lamp.x + 60 * s} cy={base - 200 * s} rx={120 * s} ry={160 * s} />
      <path
        className="fd-crack"
        d={`M ${win.x2 - 10 * s} ${win.y1 + 20 * s} l ${40 * s} ${-35 * s} l ${18 * s} ${-8 * s} l ${30 * s} ${-42 * s} m ${-30 * s} ${42 * s} l ${26 * s} ${6 * s} M ${cx + 360 * s} ${base - 940 * s} l ${-22 * s} ${60 * s} l ${14 * s} ${38 * s} l ${-30 * s} ${70 * s} m ${16 * s} ${-108 * s} l ${34 * s} ${22 * s}`}
      />

      {/* ---- Cửa sổ vỡ: trời chạng vạng, thành phố đổ nát ---- */}
      <g clipPath="url(#fd-win)">
        <rect x={win.x1} y={win.y1} width={win.x2 - win.x1} height={win.y2 - win.y1} fill="url(#fd-sky)" />
        <ellipse className="fd-smoke" cx={win.x1 + (win.x2 - win.x1) * 0.32} cy={win.y1 + 120 * s} rx={46 * s} ry={110 * s} />
        <path className="fd-city-far" d={geo.city.far} />
        <path className="fd-city-near" d={geo.city.near} />
        {geo.city.windows.map((q, i) => (
          <rect key={i} className="fd-city-lit" x={q.x} y={q.y} width={q.w} height={q.h} />
        ))}
        {/* Kính vỡ: mảnh còn sót ở góc, lỗ thủng giữa */}
        <path
          className="fd-glass"
          fillRule="evenodd"
          d={`M ${win.x1} ${win.y1} H ${win.x2} V ${win.y2} H ${win.x1} Z M ${win.x1 + 120 * s} ${win.y1 + 60 * s} l ${90 * s} ${-30 * s} l ${70 * s} ${80 * s} l ${110 * s} ${-20 * s} l ${-30 * s} ${120 * s} l ${80 * s} ${70 * s} l ${-160 * s} ${30 * s} l ${-60 * s} ${-90 * s} l ${-90 * s} ${20 * s} Z`}
        />
        <path className="fd-shard" d={`M ${win.x1 + 120 * s} ${win.y1 + 60 * s} l ${90 * s} ${-30 * s} l ${70 * s} ${80 * s} m ${110 * s} ${-20 * s} l ${-30 * s} ${120 * s} l ${80 * s} ${70 * s}`} />
      </g>
      <rect className="fd-frame" x={win.x1} y={win.y1} width={win.x2 - win.x1} height={win.y2 - win.y1} strokeWidth={9 * s} />
      <line className="fd-frame" x1={(win.x1 + win.x2) / 2} y1={win.y1} x2={(win.x1 + win.x2) / 2} y2={win.y2} strokeWidth={6 * s} />
      <line className="fd-frame" x1={win.x1} y1={win.y1 + (win.y2 - win.y1) * 0.38} x2={win.x2} y2={win.y1 + (win.y2 - win.y1) * 0.38} strokeWidth={5 * s} />
      <rect className="fd-sill" x={win.x1 - 10 * s} y={win.y2 + 3 * s} width={win.x2 - win.x1 + 20 * s} height={12 * s} />

      {/* ---- Hình vẽ phun sơn trên tường: mặt robot, "OK", vạch đếm ---- */}
      <g className="fd-graffiti" strokeWidth={4 * s} transform={`translate(${g.x} ${g.y}) scale(0.72) translate(${-g.x} ${-g.y})`}>
        <rect x={g.x} y={g.y} width={92 * s} height={74 * s} rx={16 * s} />
        <path d={`M ${g.x + 46 * s} ${g.y} v ${-28 * s} M ${g.x + 28 * s} ${g.y + 30 * s} v ${14 * s} M ${g.x + 64 * s} ${g.y + 30 * s} v ${14 * s} M ${g.x + 30 * s} ${g.y + 56 * s} q ${16 * s} ${12 * s} ${32 * s} 0`} />
        <circle cx={g.x + 46 * s} cy={g.y - 36 * s} r={8 * s} />
        <path d={`M ${g.x - 70 * s} ${g.y + 92 * s} q ${-22 * s} ${10 * s} ${-14 * s} ${32 * s} q ${12 * s} ${18 * s} ${30 * s} ${-2 * s} q ${8 * s} ${-26 * s} ${-16 * s} ${-30 * s} M ${g.x - 24 * s} ${g.y + 88 * s} v ${40 * s} M ${g.x - 4 * s} ${g.y + 86 * s} l ${-20 * s} ${22 * s} l ${22 * s} ${20 * s}`} />
        <path d={`M ${g.x + 20 * s} ${g.y + 110 * s} v ${44 * s} M ${g.x + 34 * s} ${g.y + 108 * s} v ${44 * s} M ${g.x + 48 * s} ${g.y + 112 * s} v ${40 * s} M ${g.x + 62 * s} ${g.y + 110 * s} v ${44 * s} M ${g.x + 12 * s} ${g.y + 140 * s} l ${60 * s} ${-16 * s}`} />
        <path d={`M ${w - 6 * s} ${g.y - 40 * s} l ${-70 * s} ${70 * s} l ${70 * s} ${70 * s}`} strokeWidth={9 * s} />
      </g>

      {/* ---- Hộp thiết bị sau robot, dây cáp ---- */}
      {/* ---- Mặt bàn gỗ óc chó (mép sau chạm tường, nằm sau màn hình / robot / đèn) ---- */}
      <rect x={0} y={deskBack} width={w} height={h - deskBack} fill="url(#fd-desk)" />
      <rect className="fd-contact" x={0} y={deskBack} width={w} height={9 * s} />
      <line className="fd-desk-back" x1={0} y1={deskBack + 0.5} x2={w} y2={deskBack + 0.5} />

      {/* ---- Hộp thiết bị trên bàn, sát tường, phía sau robot ---- */}
      <ellipse className="fd-shadow" cx={l.robot.x - 101 * s} cy={deskBack + 24 * s} rx={72 * s} ry={8 * s} />
      <path className="fd-box-top" d={`M ${l.robot.x - 160 * s} ${deskBack - 78 * s} l ${10 * s} ${-12 * s} h ${118 * s} l ${-10 * s} ${12 * s} Z`} />
      <rect className="fd-box" x={l.robot.x - 160 * s} y={deskBack - 78 * s} width={118 * s} height={102 * s} rx={3 * s} />
      <path className="fd-vent" d={`M ${l.robot.x - 148 * s} ${deskBack - 58 * s} h ${70 * s} M ${l.robot.x - 148 * s} ${deskBack - 48 * s} h ${70 * s} M ${l.robot.x - 148 * s} ${deskBack - 38 * s} h ${70 * s}`} />
      {[0.12, 0.27, 0.41, 0.58, 0.74, 0.9].map((k, i) => (
        <path
          key={k}
          className={i % 2 ? 'fd-grain dark' : 'fd-grain'}
          d={`M 0 ${deskBack + (l.deskFront - deskBack) * k} C ${w * 0.25} ${deskBack + (l.deskFront - deskBack) * (k - 0.05)}, ${w * 0.6} ${deskBack + (l.deskFront - deskBack) * (k + 0.06)}, ${w} ${deskBack + (l.deskFront - deskBack) * (k + 0.01)}`}
        />
      ))}
      {l.deskFront < h && (
        <>
          <rect className="fd-desk-front" x={0} y={l.deskFront} width={w} height={h - l.deskFront} />
          <line className="fd-desk-edge" x1={0} y1={l.deskFront} x2={w} y2={l.deskFront} />
        </>
      )}
      <path className="fd-cable" d={`M ${l.robot.x - 46 * s} ${deskBack + 14 * s} C ${l.robot.x + 60 * s} ${deskBack + 30 * s}, ${cx - 260 * s} ${deskBack + 12 * s}, ${cx - 40 * s} ${base - 4 * s}`} strokeWidth={5 * s} />
      <path className="fd-cable" d={`M ${lx + 30 * s} ${base - 4 * s} C ${lx + 80 * s} ${base - 14 * s}, ${w - 60 * s} ${deskBack + 14 * s}, ${w + 10} ${deskBack + 10 * s}`} strokeWidth={4.5 * s} />

      {/* ---- Ánh đèn bàn hắt lên tường và mặt bàn (tắt đèn thì tắt) ---- */}
      <g className="fd-lamplight">
        <ellipse cx={lamp.head.x} cy={lamp.head.y + 60 * s} rx={560 * s} ry={420 * s} fill="url(#fd-warm)" />
        <ellipse cx={lamp.head.x - 60 * s} cy={base + 40 * s} rx={340 * s} ry={70 * s} fill="url(#fd-warm)" />
        <ellipse cx={lamp.head.x - 60 * s} cy={base + 40 * s} rx={180 * s} ry={38 * s} fill="url(#fd-warm)" />
      </g>

      {/* ---- Màn hình: chân đế nhôm, khung kính đen (giao diện nằm khít bên trong) ---- */}
      <ellipse className="fd-shadow" cx={cx} cy={base + 10 * s} rx={170 * s} ry={14 * s} />
      <rect x={cx - 34 * s} y={standTop} width={68 * s} height={base - 2 * s - standTop} fill="url(#fd-alu-h)" />
      <rect x={cx - 130 * s} y={base - 6 * s} width={260 * s} height={18 * s} rx={9 * s} fill="url(#fd-foot)" />
      <line className="fd-foot-hi" x1={cx - 118 * s} y1={base - 5 * s} x2={cx + 118 * s} y2={base - 5 * s} />
      <rect className="fd-bezel" x={bezel.x} y={bezel.y} width={bezel.width} height={bezel.height} rx={9 * s} />
      <rect className="fd-bezel-edge" x={bezel.x + 0.5} y={bezel.y + 0.5} width={bezel.width - 1} height={bezel.height - 1} rx={9 * s} />
      <rect className="fd-lip" x={screen.x - 1.5} y={screen.y - 1.5} width={screen.width + 3} height={screen.height + 3} rx={2} />
      <circle className="fd-cam" cx={cx} cy={bezel.y + 9 * s} r={2.4 * s} />

      {/* ---- Bàn phím, chuột ---- */}
      <ellipse className="fd-shadow" cx={kb.x + kb.w / 2} cy={kb.y + kb.h + 4 * s} rx={kb.w * 0.55} ry={10 * s} />
      <path className="fd-kb" d={`M ${kb.x + kb.w * 0.035} ${kb.y} H ${kb.x + kb.w * 0.965} L ${kb.x + kb.w} ${kb.y + kb.h} H ${kb.x} Z`} />
      <path className="fd-kb-edge" d={`M ${kb.x} ${kb.y + kb.h} H ${kb.x + kb.w}`} strokeWidth={3 * s} />
      <use href="#fd-keys" className="fd-keys" />
      <ellipse className="fd-shadow" cx={l.mouse.x} cy={l.mouse.y + 10 * s} rx={30 * s} ry={8 * s} />
      <ellipse className="fd-mouse" cx={l.mouse.x} cy={l.mouse.y} rx={24 * s} ry={15 * s} />
      <ellipse className="fd-mouse-hi" cx={l.mouse.x - 6 * s} cy={l.mouse.y - 6 * s} rx={10 * s} ry={4 * s} />

      {/* ---- Cây non trong lọ thuỷ tinh ---- */}
      <g transform={`translate(${lx - 92 * s} ${base + 34 * s}) scale(${s * 0.85})`}>
        <ellipse className="fd-shadow" cx={0} cy={4} rx={36} ry={7} />
        <rect className="fd-jar" x={-28} y={-92} width={56} height={94} rx={12} />
        <ellipse className="fd-soil" cx={0} cy={-18} rx={24} ry={6} />
        <path className="fd-stem" d="M 0 -20 C -2 -48 4 -70 -2 -98" />
        <path className="fd-leaf" d="M -1 -60 C -24 -66 -34 -84 -30 -96 C -14 -92 -2 -80 -1 -60 Z" />
        <path className="fd-leaf b" d="M 1 -76 C 22 -82 34 -100 30 -114 C 12 -108 2 -96 1 -76 Z" />
        <path className="fd-leaf" d="M -2 -96 C -10 -112 -6 -126 2 -132 C 8 -118 6 -106 -2 -96 Z" />
        <rect className="fd-jar-hi" x={-22} y={-84} width={5} height={60} rx={2.5} />
      </g>

      {/* ---- Đèn bàn: bấm để bật / tắt ---- */}
      <g
        className="fd-lamp"
        role="presentation"
        onClick={toggle}
        onMouseDown={(e) => e.preventDefault()}
        data-on={theme === 'light' ? '1' : '0'}
      >
        <title>{theme === 'light' ? tr('Tắt đèn') : tr('Bật đèn')}</title>
        <ellipse className="fd-shadow" cx={lx} cy={base + 6 * s} rx={70 * s} ry={12 * s} />
        <path className="fd-lamp-base" d={`M ${lx - 50 * s} ${base - 12 * s} V ${base - 2 * s} A ${50 * s} ${9 * s} 0 0 0 ${lx + 50 * s} ${base - 2 * s} V ${base - 12 * s} Z`} />
        <ellipse className="fd-lamp-top" cx={lx} cy={base - 12 * s} rx={50 * s} ry={9 * s} />
        <path className="fd-lamp-arm" d={`M ${lx} ${base - 14 * s} L ${lamp.joint.x} ${lamp.joint.y} L ${lamp.head.x + 20 * s} ${lamp.head.y - 6 * s}`} strokeWidth={6.5 * s} />
        <circle className="fd-lamp-joint" cx={lamp.joint.x} cy={lamp.joint.y} r={7.5 * s} />
        <circle className="fd-lamp-joint" cx={lx} cy={base - 16 * s} r={6 * s} />
        <g transform={`translate(${lamp.head.x} ${lamp.head.y}) rotate(-24)`}>
          <ellipse className="fd-lamp-head" cx={0} cy={-3 * s} rx={60 * s} ry={14 * s} />
          <ellipse className="fd-lamp-rim" cx={0} cy={2 * s} rx={55 * s} ry={8.5 * s} />
        </g>
        {/* Vùng bấm rộng hơn thân đèn mảnh */}
        <path className="fd-hit" d={`M ${lx - 60 * s} ${base + 4 * s} L ${lamp.head.x - 58 * s} ${lamp.head.y - 10 * s} L ${lamp.head.x + 60 * s} ${lamp.head.y - 50 * s} L ${lx + 60 * s} ${base + 4 * s} Z`} />
      </g>

      {/* ---- Tắt đèn: phòng tối hẳn, chỉ còn những thứ tự phát sáng ---- */}
      <rect className="fd-night" x={0} y={0} width={w} height={h} />
      <g className="fd-glow">
        <g clipPath="url(#fd-win)" className="fd-stars">
          {geo.stars.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.r} />
          ))}
          <circle className="fd-moon" cx={win.x1 + (win.x2 - win.x1) * 0.78} cy={win.y1 + 60 * s} r={10 * s} mask="url(#fd-crescent)" />
        </g>
        <g className="fd-city-glow">
          {geo.city.windows.map((q, i) => (
            <rect key={i} x={q.x} y={q.y} width={q.w} height={q.h} />
          ))}
        </g>
        <g clipPath="url(#fd-off-monitor)" className="fd-screen-glow">
          <ellipse cx={screen.x + screen.width / 2} cy={screen.y + screen.height * 0.55} rx={bezel.width * 0.78} ry={bezel.height * 0.92} fill="url(#fd-teal)" />
        </g>
        <ellipse className="fd-kb-glow" cx={kb.x + kb.w / 2} cy={kb.y + kb.h / 2} rx={kb.w * 0.62} ry={kb.h * 0.9} fill="url(#fd-teal)" />
        <use href="#fd-keys" className="fd-keys-lit" />
        <g className="fd-graffiti-glow" strokeWidth={4 * s} transform={`translate(${g.x} ${g.y}) scale(0.72) translate(${-g.x} ${-g.y})`}>
          <rect x={g.x} y={g.y} width={92 * s} height={74 * s} rx={16 * s} />
          <path d={`M ${g.x + 28 * s} ${g.y + 30 * s} v ${14 * s} M ${g.x + 64 * s} ${g.y + 30 * s} v ${14 * s} M ${g.x + 30 * s} ${g.y + 56 * s} q ${16 * s} ${12 * s} ${32 * s} 0`} />
        </g>
        <rect className="fd-led" x={bezel.x + bezel.width - 70 * s} y={bezel.y + bezel.height - 7 * s} width={20 * s} height={2.6 * s} rx={1.3 * s} />
        <rect className="fd-led" x={l.robot.x - 150 * s} y={deskBack - 18 * s} width={36 * s} height={3 * s} rx={1.5 * s} />
        <rect className="fd-led" x={l.mouse.x - 1.5 * s} y={l.mouse.y - 11 * s} width={3 * s} height={8 * s} rx={1.5 * s} />
        <circle className="fd-led warm" cx={lx + 30 * s} cy={base - 8 * s} r={2.6 * s} />
        {/* Tấm LED của đèn bàn và quầng sáng (theo độ sáng bóng — chớp lúc bật) */}
        <g className="fd-bulb">
          <ellipse cx={lamp.head.x} cy={lamp.head.y + 10 * s} rx={130 * s} ry={70 * s} fill="url(#fd-warm)" />
          <ellipse className="fd-panel" cx={0} cy={0} rx={47 * s} ry={6 * s} transform={`translate(${lamp.head.x} ${lamp.head.y + 3 * s}) rotate(-24)`} />
        </g>
      </g>
      <rect x={0} y={0} width={w} height={h} fill="url(#fd-vignette)" className="fd-vignette" />
    </svg>
  )
})
