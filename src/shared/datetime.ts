// Ngày giờ "trôi nổi" theo giờ địa phương: hạn chỉ lưu 'YYYY-MM-DD' + 'HH:mm', thời điểm tuyệt đối tính khi cần.

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
