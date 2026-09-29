// Hình khối dùng chung, tạo một lần.
// Không dùng <RoundedBox> của drei: nó sửa geometry (căn giữa, tính lại pháp tuyến) trong layout effect — nếu
// một khung đã vẽ trước đó (StageSync vẽ ngay để lớp giao diện khớp màn hình), GPU giữ pháp tuyến cũ → khối đen.
import { ExtrudeGeometry, OctahedronGeometry, Shape, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const cache = new Map<string, BufferGeometry>()

function cached<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key) as T | undefined
  if (!g) {
    g = make()
    cache.set(key, g)
  }
  return g
}

/** Hộp bo góc; bán kính tự kẹp ≤ nửa cạnh nhỏ nhất (bán kính lớn hơn làm hình bị lộn) */
export function roundedBox(w: number, h: number, d: number, r: number, segments = 3): RoundedBoxGeometry {
  const radius = Math.min(r, Math.min(w, h, d) / 2 - 1e-4)
  return cached(`rbox:${w},${h},${d},${radius},${segments}`, () => new RoundedBoxGeometry(w, h, d, segments, radius))
}

/** Bánh răng dẹt (trục z), có lỗ giữa */
export function gear(radius: number, teeth: number, depth: number, hole = radius * 0.35): ExtrudeGeometry {
  return cached(`gear:${radius},${teeth},${depth},${hole}`, () => {
    const s = new Shape()
    const inner = radius * 0.8
    const steps = teeth * 4
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI * 2 * i) / steps
      const r = i % 4 < 2 ? radius : inner
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) s.moveTo(x, y)
      else s.lineTo(x, y)
    }
    const h = new Shape()
    h.absarc(0, 0, hole, 0, Math.PI * 2, true)
    s.holes.push(h)
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.15, bevelSize: depth * 0.15, bevelSegments: 1, curveSegments: 12 })
    g.translate(0, 0, -depth / 2)
    return g
  })
}

/** Pha lê (bát diện kéo dài theo chiều đứng) */
export function crystal(radius: number): OctahedronGeometry {
  return cached(`crystal:${radius}`, () => {
    const g = new OctahedronGeometry(radius, 0)
    g.scale(1, 1.6, 1)
    return g
  })
}
