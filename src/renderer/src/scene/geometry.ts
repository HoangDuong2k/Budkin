// Hình khối dùng chung, tạo một lần.
// Không dùng <RoundedBox> của drei: nó sửa geometry (căn giữa, tính lại pháp tuyến) trong layout effect — nếu
// một khung đã vẽ trước đó (StageSync vẽ ngay để lớp giao diện khớp màn hình), GPU giữ pháp tuyến cũ → khối đen.
import { CatmullRomCurve3, Curve, Euler, Matrix4, Quaternion, TubeGeometry, Vector3, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

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

export interface Part {
  geo: BufferGeometry
  at?: [number, number, number]
  rot?: [number, number, number]
  scale?: [number, number, number]
  /** Đổi toạ độ texture: [nhân u, nhân v, cộng u, cộng v] — các mảnh dùng chung texture trông khác nhau */
  uv?: [number, number, number, number]
}

/**
 * Gộp nhiều mảnh tĩnh cùng vật liệu thành một geometry: một lần vẽ thay vì nhiều lần.
 * Mảnh phải cùng thuộc tính position / normal / uv.
 */
export function merged(key: string, parts: Part[]): BufferGeometry {
  return cached(`merged:${key}`, () => {
    const m = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    const geos = parts.map((p) => {
      const g = p.geo.clone()
      e.set(...(p.rot ?? [0, 0, 0]))
      q.setFromEuler(e)
      m.compose(new Vector3(...(p.at ?? [0, 0, 0])), q, new Vector3(...(p.scale ?? [1, 1, 1])))
      g.applyMatrix4(m)
      const uv = g.getAttribute('uv')
      if (p.uv && uv) {
        const [su, sv, ou, ov] = p.uv
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov)
      }
      return g
    })
    // Trộn mảnh có chỉ mục với mảnh không có (khối đa diện): bỏ chỉ mục hết cho cùng kiểu
    const same = geos.every((g) => g.index) ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g))
    const out = mergeGeometries(same, false)
    for (const g of [...geos, ...same]) g.dispose()
    if (!out) throw new Error(`Không gộp được geometry "${key}"`)
    return out
  })
}

class Helix extends Curve<Vector3> {
  constructor(
    private readonly radius: number,
    private readonly length: number,
    private readonly turns: number
  ) {
    super()
  }
  getPoint(t: number, target = new Vector3()): Vector3 {
    const a = t * this.turns * Math.PI * 2
    return target.set(Math.cos(a) * this.radius, (t - 0.5) * this.length, Math.sin(a) * this.radius)
  }
}

/** Lò xo dọc trục y, tâm ở gốc toạ độ */
export function spring(radius: number, length: number, turns: number, wire: number): TubeGeometry {
  return cached(`spring:${radius},${length},${turns},${wire}`, () => new TubeGeometry(new Helix(radius, length, turns), Math.round(turns * 14), wire, 5, false))
}

/** Ống mềm (dây cáp) đi qua các điểm */
export function cable(key: string, points: Array<[number, number, number]>, radius: number): TubeGeometry {
  return cached(`cable:${key}`, () => new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), points.length * 10, radius, 6, false))
}
