// Lịch vẽ của bàn làm việc (cảnh 3D với frameloop="demand", hoặc tranh 2D): chỉ vẽ khi có gì đổi. App mở cả ngày nên
// đứng yên = 0 khung hình. Mọi yêu cầu vẽ đi qua requestFrame(): gộp lại, tôn trọng giới hạn fps (Tiết kiệm 30, vẽ bằng CPU 20).
import type { Quality } from '../../../shared/types'

/** Thứ thật sự vẽ: cảnh 3D (React Three Fiber) hoặc bàn làm việc 2D (flat/flatLoop) */
export interface FrameDriver {
  /** Xin vẽ khung kế tiếp */
  invalidate(): void
  /** false: dừng hẳn (cửa sổ ẩn, chế độ Mở rộng) — xin vẽ cũng không vẽ */
  setRunning(running: boolean): void
}

let driver: FrameDriver | null = null
let minInterval = 1000 / 60
/** Các lý do đang dừng vẽ hẳn (cửa sổ ẩn, chế độ Mở rộng…) — còn lý do nào thì còn dừng */
const pauses = new Set<string>()
let lastFrameAt = 0
let pending: ReturnType<typeof setTimeout> | null = null

/** Mức chất lượng đang dùng (Driver đặt) — hoạt cảnh nhỏ như chớp mắt tắt ở chế độ Tiết kiệm */
export const policy: { quality: Quality; software: boolean } = { quality: 'balanced', software: false }

/** Số khung đã vẽ (kiểm thử đo "đứng yên thì không vẽ") */
export const renderStats = { frames: 0 }

export function bindRenderer(d: FrameDriver | null): void {
  driver = d
  // Canvas tạo lại (đổi mức chất lượng) trong lúc đang dừng: vẫn dừng
  if (d && pauses.size) d.setRunning(false)
}

export function setMaxFps(fps: number): void {
  minInterval = 1000 / fps
}

/** Xin vẽ một khung. Gọi trong useFrame khi hoạt cảnh chưa xong để vẽ tiếp khung sau */
export function requestFrame(): void {
  if (!driver) return
  // 60 fps: để vòng vẽ tự canh theo requestAnimationFrame
  if (minInterval <= 17) {
    driver.invalidate()
    return
  }
  if (pending) return
  const wait = lastFrameAt + minInterval - performance.now()
  if (wait <= 1) driver.invalidate()
  else
    pending = setTimeout(() => {
      pending = null
      driver?.invalidate()
    }, wait)
}

/** Gọi ở đầu mỗi khung (useFrame ưu tiên thấp nhất) */
export function markFrame(): void {
  lastFrameAt = performance.now()
  renderStats.frames++
}

/** Dừng hẳn / chạy lại vòng vẽ vì một lý do (cửa sổ ẩn, chế độ Mở rộng); hết mọi lý do thì vẽ lại */
export function setPaused(paused: boolean, reason: string): void {
  const was = pauses.size > 0
  if (paused) pauses.add(reason)
  else pauses.delete(reason)
  const now = pauses.size > 0
  if (!driver || was === now) return
  driver.setRunning(!now)
  if (!now) driver.invalidate()
}
