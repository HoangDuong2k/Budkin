// Hiển thị ngày giờ theo ngôn ngữ giao diện (tự viết để giống nhau trên mọi máy, không phụ thuộc locale hệ điều hành)
import { addDays, daysBetween, isoWeekday, parseYmd } from '../../../shared/datetime'
import { getLang, tr, trKey } from '../../../shared/i18n'
import { COLOR_KEYS, type ColorKey } from '../../../shared/palette'
import type { Task } from '../../../shared/types'

const VI_DAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']
const VI_DAYS_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const EN_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const EN_DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Tên thứ (ISO 1 = thứ Hai … 7 = Chủ nhật) */
export function weekdayName(iso: number, short = false): string {
  if (getLang() === 'en') return (short ? EN_DAYS_SHORT : EN_DAYS)[iso - 1]
  return (short ? VI_DAYS_SHORT : VI_DAYS)[iso - 1]
}

export function monthName(month: number, short = false): string {
  if (getLang() === 'en') return (short ? EN_MONTHS_SHORT : EN_MONTHS)[month - 1]
  return short ? `Th${month}` : tr('tháng {m}', { m: month })
}

/** Hôm nay / Ngày mai / Hôm qua, hoặc tên thứ nếu trong 6 ngày tới */
function relative(date: string, today: string): string | null {
  const diff = daysBetween(today, date)
  if (diff === 0) return tr('Hôm nay')
  if (diff === 1) return tr('Ngày mai')
  if (diff === -1) return tr('Hôm qua')
  return null
}

/** Ngày ngắn: "Hôm nay", "Ngày mai", "T6, 3/10" / "Fri, Oct 3" (khác năm thì thêm năm) */
export function shortDate(date: string, today: string): string {
  const rel = relative(date, today)
  if (rel) return rel
  const { y, m, d } = parseYmd(date)
  const diff = daysBetween(today, date)
  const wd = weekdayName(isoWeekday(date), true)
  if (diff > 1 && diff < 7) return weekdayName(isoWeekday(date))
  const sameYear = y === parseYmd(today).y
  if (getLang() === 'en') return `${wd}, ${EN_MONTHS_SHORT[m - 1]} ${d}${sameYear ? '' : `, ${y}`}`
  return `${wd}, ${d}/${m}${sameYear ? '' : `/${y}`}`
}

/** Ngày đầy đủ: "Thứ Sáu, 3 tháng 10" / "Friday, October 3" (khác năm thì thêm năm) */
export function fullDate(date: string, today: string): string {
  const { y, m, d } = parseYmd(date)
  const sameYear = y === parseYmd(today).y
  return getLang() === 'en'
    ? `${weekdayName(isoWeekday(date))}, ${EN_MONTHS[m - 1]} ${d}${sameYear ? '' : `, ${y}`}`
    : `${weekdayName(isoWeekday(date))}, ${d} ${tr('tháng {m}', { m })}${sameYear ? '' : ` ${y}`}`
}

/** Tiêu đề nhóm theo ngày: "Ngày mai · Thứ Sáu, 3 tháng 10" */
export function longDate(date: string, today: string): string {
  const rel = relative(date, today)
  return rel ? `${rel} · ${fullDate(date, today)}` : fullDate(date, today)
}

/** Hạn của task: "Hôm nay 10:00", "T6, 3/10" */
export function dueText(t: Pick<Task, 'dueDate' | 'dueTime'>, today: string): string {
  if (!t.dueDate) return ''
  const d = shortDate(t.dueDate, today)
  return t.dueTime ? `${d} ${t.dueTime}` : d
}

/** Mốc nhắc có sẵn (phút trước hạn); task cả ngày dùng mốc theo ngày */
export const REMIND_TIMED = [0, 5, 10, 15, 30, 60, 120, 1440]
export const REMIND_ALL_DAY = [0, 1440, 2880, 10080]

export function reminderText(min: number | null, allDay: boolean): string {
  if (min === null) return tr('Không nhắc')
  if (min === 0) return allDay ? tr('Trong ngày đến hạn') : tr('Đúng giờ')
  // Số ít tách riêng để tiếng Anh không thành "1 days"
  if (min % 10080 === 0) return min === 10080 ? tr('Trước 1 tuần') : tr('Trước {n} tuần', { n: min / 10080 })
  if (min % 1440 === 0) return min === 1440 ? tr('Trước 1 ngày') : tr('Trước {n} ngày', { n: min / 1440 })
  if (min % 60 === 0) return min === 60 ? tr('Trước 1 giờ') : tr('Trước {n} giờ', { n: min / 60 })
  return tr('Trước {n} phút', { n: min })
}

/** Màu kế tiếp cho nhãn / dự án mới (xoay vòng bảng màu) */
export function nextColor(count: number): ColorKey {
  return COLOR_KEYS[count % COLOR_KEYS.length]
}

/** Nhãn mức ưu tiên 0–3 (dịch lúc hiển thị bằng tr()) */
export const PRIORITY_LABELS = [trKey('Không ưu tiên'), trKey('Ưu tiên thấp'), trKey('Ưu tiên vừa'), trKey('Ưu tiên cao')]

/** Các lựa chọn hạn nhanh: hôm nay, ngày mai, thứ Hai tới */
export function quickDates(today: string): Array<{ label: string; date: string }> {
  const toMonday = ((8 - isoWeekday(today)) % 7) || 7
  return [
    { label: tr('Hôm nay'), date: today },
    { label: tr('Ngày mai'), date: addDays(today, 1) },
    { label: tr('Thứ Hai tới'), date: addDays(today, toMonday) }
  ]
}
