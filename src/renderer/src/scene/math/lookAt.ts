// Robot nhìn theo con trỏ — hàm thuần (test bằng vitest)
import { fromCameraAxes, type CameraSpec, type Vec3 } from './framing'

const DEG = Math.PI / 180
export const MAX_YAW = 70 * DEG
export const MIN_PITCH = -25 * DEG
export const MAX_PITCH = 35 * DEG

/** Giới hạn mềm: gần 0 thì gần như tuyến tính, ra xa thì tiệm cận ±max (không bị "đập" vào giới hạn) */
export function softClamp(v: number, max: number): number {
  return max * Math.tanh(v / max)
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * Góc quay đầu (yaw quanh trục đứng, pitch ngẩng lên dương) để nhìn từ `head` tới `target`,
 * tính trong hệ trục của gốc robot (gốc đã xoay `rootYaw` quanh trục đứng). Hướng mặt robot là +z.
 */
export function lookAngles(head: Vec3, target: Vec3, rootYaw: number): { yaw: number; pitch: number } {
  const dx = target.x - head.x
  const dy = target.y - head.y
  const dz = target.z - head.z
  const c = Math.cos(-rootYaw)
  const s = Math.sin(-rootYaw)
  const lx = dx * c + dz * s
  const lz = -dx * s + dz * c
  const yaw = Math.atan2(lx, lz)
  const pitch = Math.atan2(dy, Math.hypot(lx, lz))
  return { yaw: softClamp(yaw, MAX_YAW), pitch: clamp(pitch, MIN_PITCH, MAX_PITCH) }
}

/**
 * Điểm con trỏ đang chỉ: tia từ camera qua con trỏ (toạ độ NDC −1..1) cắt mặt phẳng vuông góc trục nhìn
 * đặt trước đầu robot `glass` đơn vị — như thể con trỏ nằm trên "tấm kính" giữa người dùng và robot.
 */
export function pointerTarget(ndc: { x: number; y: number }, camPos: Vec3, cam: CameraSpec, aspect: number, head: Vec3, glass = 0.35): Vec3 {
  const t = Math.tan(cam.fovY / 2)
  // Hướng tia trong hệ camera rồi đổi sang thế giới
  const dir = fromCameraAxes({ x: ndc.x * t * aspect, y: ndc.y * t, z: -1 }, cam.pitch)
  const fwd = fromCameraAxes({ x: 0, y: 0, z: -1 }, cam.pitch)
  // Mặt phẳng qua P0 = head − fwd·glass, pháp tuyến fwd
  const p0 = { x: head.x - fwd.x * glass, y: head.y - fwd.y * glass, z: head.z - fwd.z * glass }
  const denom = dir.x * fwd.x + dir.y * fwd.y + dir.z * fwd.z
  const k = ((p0.x - camPos.x) * fwd.x + (p0.y - camPos.y) * fwd.y + (p0.z - camPos.z) * fwd.z) / denom
  return { x: camPos.x + dir.x * k, y: camPos.y + dir.y * k, z: camPos.z + dir.z * k }
}
