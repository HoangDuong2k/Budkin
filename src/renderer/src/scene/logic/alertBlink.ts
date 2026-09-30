// Đèn ăng-ten khi robot báo động: nhấp nháy nhanh lúc đầu rồi chậm dần. Nhắc việc có thể chờ cả đêm, mà mỗi lần đèn
// đổi là một khung hình cả cảnh phải vẽ lại. Hàm thuần (test bằng vitest)

/** [từ giây thứ, nửa chu kỳ (giây)]: 15 giây đầu đổi 4 lần/giây, tới phút thứ 2 đổi 2 lần/giây, sau đó 2 giây mới đổi */
const SEGMENTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.25],
  [15, 0.5],
  [120, 2]
]

/** Số lần đèn đã đổi sau `t` giây báo động, và lúc (giây) đổi lần kế tiếp */
function toggles(t: number): { n: number; next: number } {
  let n = 0
  for (let i = 0; i < SEGMENTS.length; i++) {
    const [from, half] = SEGMENTS[i]
    const to = SEGMENTS[i + 1]?.[0] ?? Infinity
    if (t < to) {
      const k = Math.floor((t - from) / half)
      return { n: n + k, next: Math.min(to, from + (k + 1) * half) }
    }
    n += Math.round((to - from) / half)
  }
  return { n, next: Infinity }
}

/** Đèn đang sáng (đỏ) sau `t` giây báo động */
export function alertLedOn(t: number): boolean {
  return toggles(Math.max(0, t)).n % 2 === 0
}

/** Lúc (giây, tính từ khi báo động) đèn đổi lần kế tiếp — hẹn vẽ đúng lúc đó thay vì vẽ liên tục */
export function nextLedToggle(t: number): number {
  return toggles(Math.max(0, t)).next
}

/** Robot nhún nhảy trong bấy nhiêu giây đầu báo động (máy vẽ bằng CPU: ngắn hơn — mỗi khung rất tốn) */
export function alertHopSeconds(software: boolean): number {
  return software ? 2 : 6
}
