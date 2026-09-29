// Toán khung hình cho camera cố định — hàm thuần, không phụ thuộc three.js (test bằng vitest).
//
// Camera và đầu màn hình máy tính cùng xoay Rx(−pitch) (chúc xuống), không xoay ngang, không nghiêng.
// Mặt màn hình vì vậy luôn vuông góc với trục nhìn → chiếu ra đúng một hình chữ nhật thẳng, nên giao diện
// quản lý task là một lớp DOM bình thường đặt khít lên đó (chữ sắc nét, bộ gõ tiếng Việt chạy bình thường).

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CameraSpec {
  /** Góc chúc xuống (radian) */
  pitch: number
  /** Góc nhìn dọc (radian) */
  fovY: number
}

/** Tỉ lệ nửa khung hình được dùng (phần còn lại là lề) */
export interface FrameMargins {
  x: number
  y: number
}

/** Rx(pitch)·p — toạ độ theo các trục của camera (chưa trừ vị trí camera) */
export function toCameraAxes(p: Vec3, pitch: number): Vec3 {
  const c = Math.cos(pitch)
  const s = Math.sin(pitch)
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }
}

/** Rx(−pitch)·q — ngược lại của toCameraAxes */
export function fromCameraAxes(q: Vec3, pitch: number): Vec3 {
  return toCameraAxes(q, -pitch)
}

/**
 * Vị trí camera (hướng cố định) để mọi điểm mốc nằm trong khung với lề cho trước.
 * Chiều bị giới hạn (ngang hoặc dọc) được lấp khít, chiều còn dư thì căn giữa.
 *
 * Với q = Rx(pitch)·P và camera ở c (cùng hệ trục), điểm nằm trong khung ngang khi
 * |q.x − c.x| ≤ kx·(c.z − q.z), kx = lề·tan(fov/2)·aspect. Gom lại theo mọi điểm:
 *   c.x + kx·c.z ≥ max(q.x + kx·q.z) = Rt,   c.x − kx·c.z ≤ min(q.x − kx·q.z) = L
 * → c.z ≥ (Rt − L)/(2kx), c.x = (Rt + L)/2 (tương tự cho chiều dọc).
 */
export function solveCameraPosition(points: readonly Vec3[], cam: CameraSpec, aspect: number, margins: FrameMargins): Vec3 {
  const t = Math.tan(cam.fovY / 2)
  const kx = margins.x * t * aspect
  const ky = margins.y * t
  let left = Infinity
  let right = -Infinity
  let bottom = Infinity
  let top = -Infinity
  for (const p of points) {
    const q = toCameraAxes(p, cam.pitch)
    left = Math.min(left, q.x - kx * q.z)
    right = Math.max(right, q.x + kx * q.z)
    bottom = Math.min(bottom, q.y - ky * q.z)
    top = Math.max(top, q.y + ky * q.z)
  }
  const cz = Math.max((right - left) / (2 * kx), (top - bottom) / (2 * ky))
  return fromCameraAxes({ x: (right + left) / 2, y: (top + bottom) / 2, z: cz }, cam.pitch)
}

/** Toạ độ CSS px của một điểm trên khung nhìn (gốc ở góc trên trái) */
export function projectPoint(p: Vec3, camPos: Vec3, cam: CameraSpec, viewport: { width: number; height: number }): { x: number; y: number } {
  const t = Math.tan(cam.fovY / 2)
  const q = toCameraAxes({ x: p.x - camPos.x, y: p.y - camPos.y, z: p.z - camPos.z }, cam.pitch)
  const k = viewport.height / (2 * -q.z * t)
  return { x: viewport.width / 2 + q.x * k, y: viewport.height / 2 - q.y * k }
}

/**
 * Hình chữ nhật (CSS px) mà một mặt phẳng vuông góc trục nhìn — tâm `center`, kích thước `size` (đơn vị thế giới) —
 * chiếm trên khung nhìn. Mặt phẳng vuông góc trục nhìn nên mọi điểm cùng độ sâu: phép chiếu chỉ là phóng to + dời.
 */
export function projectPlaneRect(
  center: Vec3,
  size: { width: number; height: number },
  camPos: Vec3,
  cam: CameraSpec,
  viewport: { width: number; height: number }
): Rect {
  const t = Math.tan(cam.fovY / 2)
  const s = toCameraAxes({ x: center.x - camPos.x, y: center.y - camPos.y, z: center.z - camPos.z }, cam.pitch)
  const k = viewport.height / (2 * -s.z * t)
  const w = size.width * k
  const h = size.height * k
  return { x: viewport.width / 2 + s.x * k - w / 2, y: viewport.height / 2 - s.y * k - h / 2, width: w, height: h }
}

/**
 * Làm tròn ra ngoài theo pixel thật của màn hình (devicePixelRatio 1.25/1.5 trên Windows, số lẻ trên Wayland):
 * lớp giao diện luôn phủ kín màn hình 3D, không lộ viền một pixel nào.
 */
export function snapOutward(r: Rect, dpr: number): Rect {
  const eps = 1e-3
  const x0 = Math.floor(r.x * dpr + eps) / dpr
  const y0 = Math.floor(r.y * dpr + eps) / dpr
  const x1 = Math.ceil((r.x + r.width) * dpr - eps) / dpr
  const y1 = Math.ceil((r.y + r.height) * dpr - eps) / dpr
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
