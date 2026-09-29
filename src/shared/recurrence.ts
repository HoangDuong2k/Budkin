// Việc lặp lại — hàm thuần (test bằng vitest): hạn của lần kế tiếp theo quy tắc, các lần sắp tới (hiện mờ trên Lịch).
// Ngày trong tháng luôn lấy từ quy tắc (monthDay) nên không trôi: 31/1 → 28/2 → 31/3. Lặp "hằng năm" là hằng tháng
// với interval 12.
import { addDays, daysInMonth, isoWeekday, parseYmd, ymd } from './datetime'
import type { RecurrenceRule } from './types'

/** Chặn vòng lặp (quy tắc hỏng, việc quá hạn rất lâu) */
const MAX_STEPS = 10_000

/** Ngày của lần ngay sau `date` theo nhịp quy tắc (chưa xét ngày kết thúc / số lần) */
export function stepAfter(rule: RecurrenceRule, date: string): string {
  switch (rule.freq) {
    case 'daily':
      return addDays(date, rule.interval)
    case 'weekly': {
      const wd = isoWeekday(date)
      const days = rule.byWeekday?.length ? [...rule.byWeekday].sort((a, b) => a - b) : [wd]
      // Còn thứ nào sau hôm nay trong cùng tuần thì lấy; hết thì sang tuần cách `interval` tuần, lấy thứ đầu tiên
      const later = days.find((d) => d > wd)
      if (later !== undefined) return addDays(date, later - wd)
      return addDays(date, 7 * rule.interval - (wd - days[0]))
    }
    case 'monthly': {
      const { y, m, d } = parseYmd(date)
      const idx = y * 12 + (m - 1) + rule.interval
      const ny = Math.floor(idx / 12)
      const nm = (idx % 12) + 1
      const want = rule.monthDay ?? d
      const last = daysInMonth(ny, nm)
      return ymd(ny, nm, want === -1 ? last : Math.min(want, last))
    }
  }
}

export interface NextInput {
  rule: RecurrenceRule
  /** Hạn của lần vừa xong / bỏ qua */
  due: string
  /** Thứ tự của lần đó trong chuỗi (0 = lần đầu) */
  index: number
  /** Hôm nay (giờ địa phương) — cũng là ngày hoàn thành */
  today: string
}

/**
 * Hạn của lần kế tiếp; null = chuỗi đã hết (quá ngày kết thúc hoặc đủ số lần).
 * Tính từ hạn: việc quá hạn thì lăn tới lần gần nhất tính từ hôm nay, vẫn đúng nhịp. Tính từ ngày hoàn thành: hôm nay + nhịp
 */
export function nextDue({ rule, due, index, today }: NextInput): string | null {
  if (rule.count !== undefined && index + 1 >= rule.count) return null
  let next = stepAfter(rule, rule.basis === 'completion' ? today : due)
  if (rule.basis === 'due') for (let i = 0; next < today && i < MAX_STEPS; i++) next = stepAfter(rule, next)
  if (rule.until && next > rule.until) return null
  return next
}

/** Các lần sắp tới sau lần hiện tại, nằm trong [from, to] — hiện mờ trên Lịch (chỉ quy tắc tính từ hạn) */
export function upcomingDues(rule: RecurrenceRule, due: string, index: number, from: string, to: string, limit = 62): string[] {
  const out: string[] = []
  if (rule.basis !== 'due') return out
  let d = due
  for (let i = index + 1; i < index + MAX_STEPS && out.length < limit; i++) {
    if (rule.count !== undefined && i >= rule.count) break
    d = stepAfter(rule, d)
    if ((rule.until && d > rule.until) || d > to) break
    if (d >= from) out.push(d)
  }
  return out
}
