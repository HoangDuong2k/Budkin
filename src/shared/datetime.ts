// Ngày giờ "trôi nổi" theo giờ địa phương: hạn chỉ lưu 'YYYY-MM-DD' + 'HH:mm', thời điểm tuyệt đối tính khi cần.
// Chuỗi ngày ISO so sánh được trực tiếp bằng < > (thứ tự chữ = thứ tự ngày).

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  return d <= daysInMonth(y, mo)
}

export function isValidTime(s: string): boolean {
  return TIME_RE.test(s)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Ngày 'YYYY-MM-DD' của thời điểm `ms` theo giờ địa phương của máy */
export function localDateOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Số phút từ nửa đêm (giờ địa phương) của thời điểm `ms` */
export function localMinutesOf(ms: number): number {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

export function parseYmd(s: string): { y: number; m: number; d: number } {
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)) }
}

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** Đối tượng Date lúc 12:00 trưa của ngày đó (giữa ngày: tránh lệch ngày khi đổi giờ mùa hè) */
export function dateAtNoon(s: string): Date {
  const { y, m, d } = parseYmd(s)
  return new Date(y, m - 1, d, 12)
}

/** Cộng / trừ ngày trên lịch (không phụ thuộc múi giờ) */
export function addDays(s: string, n: number): string {
  const { y, m, d } = parseYmd(s)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** Số ngày từ a tới b (b − a) */
export function daysBetween(a: string, b: string): number {
  const pa = parseYmd(a)
  const pb = parseYmd(b)
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000)
}

/** Thứ theo ISO: 1 = thứ Hai … 7 = Chủ nhật */
export function isoWeekday(s: string): number {
  const { y, m, d } = parseYmd(s)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return w === 0 ? 7 : w
}

/** Ngày đầu tuần chứa `s` (weekStart 1 = thứ Hai, 0 = Chủ nhật) */
export function startOfWeek(s: string, weekStart: 0 | 1): string {
  const w = isoWeekday(s) % 7 // 0 = CN, 1 = T2 …
  const back = (w - weekStart + 7) % 7
  return addDays(s, -back)
}

export function minutesOfTime(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
}

/**
 * Đọc giờ người dùng gõ: "9", "09", "930", "9:30", "9h", "9h30", "21.15" → 'HH:mm'; không đọc được → null
 */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')
  let m = /^(\d{1,2})(?:[:h.](\d{1,2})?)?$/.exec(s)
  if (!m) {
    const compact = /^(\d{1,2})(\d{2})$/.exec(s)
    if (compact) m = compact
  }
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  if (h > 23 || min > 59) return null
  return `${pad2(h)}:${pad2(min)}`
}
