// Đèn ăng-ten khi robot báo động: nhấp nháy nhanh lúc đầu rồi chậm dần. Nhắc việc có thể chờ cả đêm, mà mỗi lần đèn
// đổi là một khung hình cả cảnh phải vẽ lại. Hàm thuần (test bằng vitest)

type Segments = ReadonlyArray<readonly [number, number]>

/** [từ giây thứ, nửa chu kỳ (giây)]: 15 giây đầu đổi 4 lần/giây, tới phút thứ 2 đổi 2 lần/giây, sau đó 2 giây mới đổi */
const SEGMENTS: Segments = [
  [0, 0.25],
  [15, 0.5],
  [120, 2]
]

/** Vẽ bằng CPU (máy ảo, máy cũ): mỗi khung tốn cả trăm ms — đèn đổi mỗi giây một lần, sau 2 phút thì 2 giây một lần */
const SOFTWARE_SEGMENTS: Segments = [
  [0, 1],
  [120, 2]
]

/** Số lần đèn đã đổi sau `t` giây báo động, và lúc (giây) đổi lần kế tiếp */
function toggles(t: number, software: boolean): { n: number; next: number } {
  const segments = software ? SOFTWARE_SEGMENTS : SEGMENTS
  let n = 0
  for (let i = 0; i < segments.length; i++) {
    const [from, half] = segments[i]
    const to = segments[i + 1]?.[0] ?? Infinity
    if (t < to) {
      const k = Math.floor((t - from) / half)
      return { n: n + k, next: Math.min(to, from + (k + 1) * half) }
    }
    n += Math.round((to - from) / half)
  }
  return { n, next: Infinity }
}

/** Đèn đang sáng (đỏ) sau `t` giây báo động */
export function alertLedOn(t: number, software = false): boolean {
  return toggles(Math.max(0, t), software).n % 2 === 0
}

/** Lúc (giây, tính từ khi báo động) đèn đổi lần kế tiếp — hẹn vẽ đúng lúc đó thay vì vẽ liên tục */
export function nextLedToggle(t: number, software = false): number {
  return toggles(Math.max(0, t), software).next
}

/** Robot nhún nhảy trong bấy nhiêu giây đầu báo động (máy vẽ bằng CPU: ngắn hơn — mỗi khung rất tốn) */
export function alertHopSeconds(software: boolean): number {
  return software ? 2 : 6
}
