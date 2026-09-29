// Bố cục bàn làm việc (đơn vị thế giới ≈ mét; mặt bàn ở y = 0, người ngồi phía +z) — hàm thuần.
// Màn hình rộng theo tỉ lệ cửa sổ; robot và đèn bám theo mép viền màn hình, nên màn hình luôn chiếm
// khoảng 55–60% bề ngang cửa sổ, robot và đèn luôn nằm trọn trong khung.
import { solveCameraPosition, type CameraSpec, type FrameMargins, type Vec3 } from './framing'

const DEG = Math.PI / 180

/** Camera cố định: chúc xuống 10°, góc nhìn dọc 30° (ít méo hình) */
export const CAMERA: CameraSpec = { pitch: 10 * DEG, fovY: 30 * DEG }
export const MARGINS: FrameMargins = { x: 0.97, y: 0.95 }

/** Chiều cao phần hiển thị của màn hình máy tính */
export const SCREEN_H = 0.36
/** Viền màn hình */
export const BEZEL = 0.018
/** Tâm màn hình */
export const SCREEN_Y = 0.3
export const MONITOR_Z = -0.1

export interface Box {
  min: Vec3
  max: Vec3
}

/** Khối bao robot quanh chân đế (đã tính cả lúc nhảy lên, quay người) */
export const ROBOT_BOX: Box = { min: { x: -0.068, y: 0, z: -0.055 }, max: { x: 0.068, y: 0.29, z: 0.055 } }
/** Khối bao đèn quanh chân đế (chụp đèn chồm sang trái, về phía màn hình) */
export const LAMP_BOX: Box = { min: { x: -0.1, y: 0, z: -0.06 }, max: { x: 0.055, y: 0.5, z: 0.07 } }

/** Khe hở giữa viền màn hình với robot / đèn */
const ROBOT_GAP = 0.01
const LAMP_GAP = 0.003

export interface SceneLayout {
  screenW: number
  screenH: number
  /** Tâm màn hình (thế giới); đầu màn hình xoay Rx(−pitch) quanh điểm này */
  screenCenter: Vec3
  /** Chân đế robot trên mặt bàn */
  robot: Vec3
  /** Chân đế đèn trên mặt bàn */
  lamp: Vec3
  /** Các điểm phải nằm trong khung hình */
  keyPoints: Vec3[]
}

export function screenAspectFor(winAspect: number): number {
  return Math.min(2, Math.max(1.5, winAspect))
}

function boxCorners(b: Box, at: Vec3): Vec3[] {
  const out: Vec3[] = []
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push({ x: at.x + x, y: at.y + y, z: at.z + z })
  return out
}

/** Góc của viền màn hình (đầu màn hình nghiêng ra sau theo góc chúc của camera) */
function bezelCorners(center: Vec3, halfW: number, halfH: number, pitch: number): Vec3[] {
  const c = Math.cos(pitch)
  const s = Math.sin(pitch)
  const out: Vec3[] = []
  for (const x of [-halfW, halfW]) for (const y of [-halfH, halfH]) out.push({ x: center.x + x, y: center.y + y * c, z: center.z - y * s })
  return out
}

export function sceneLayout(winAspect: number): SceneLayout {
  const screenH = SCREEN_H
  const screenW = SCREEN_H * screenAspectFor(winAspect)
  const screenCenter = { x: 0, y: SCREEN_Y, z: MONITOR_Z }
  const outerHalfW = screenW / 2 + BEZEL
  const robot = { x: -(outerHalfW + ROBOT_GAP + ROBOT_BOX.max.x), y: 0, z: -0.07 }
  const lamp = { x: outerHalfW + LAMP_GAP - LAMP_BOX.min.x, y: 0, z: -0.1 }
  const keyPoints = [
    ...boxCorners(ROBOT_BOX, robot),
    ...boxCorners(LAMP_BOX, lamp),
    ...bezelCorners(screenCenter, outerHalfW, screenH / 2 + BEZEL, CAMERA.pitch),
    // Mặt bàn phía trước bàn phím
    { x: 0, y: 0, z: 0.12 }
  ]
  return { screenW, screenH, screenCenter, robot, lamp, keyPoints }
}

/** Vị trí camera cho cửa sổ có tỉ lệ `aspect` */
export function cameraFor(layout: SceneLayout, aspect: number): Vec3 {
  return solveCameraPosition(layout.keyPoints, CAMERA, aspect, MARGINS)
}
