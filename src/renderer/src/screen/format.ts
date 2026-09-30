// Hiển thị ngày giờ theo ngôn ngữ giao diện (tự viết để giống nhau trên mọi máy, không phụ thuộc locale hệ điều hành)
import { addDays, daysBetween, isoWeekday, localDateOf, localMinutesOf, pad2, parseYmd } from '../../../shared/datetime'
import { getLang, tr, trKey } from '../../../shared/i18n'
import { COLOR_KEYS, type ColorKey } from '../../../shared/palette'
import type { RecurrenceRule, Task } from '../../../shared/types'

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

/** Tiêu đề lịch tháng: "Tháng 10, 2026" / "October 2026" */
export function monthTitle(y: number, m: number): string {
  return getLang() === 'en' ? `${EN_MONTHS[m - 1]} ${y}` : `${tr('Tháng {m}', { m })}, ${y}`
}

/** Tiêu đề lịch tuần: "5 – 11/10/2026", "28/9 – 4/10/2026" / "Oct 5 – 11, 2026", "Sep 28 – Oct 4, 2026" */
export function weekTitle(first: string, last: string): string {
  const a = parseYmd(first)
  const b = parseYmd(last)
  if (getLang() === 'en') {
    const start = `${EN_MONTHS_SHORT[a.m - 1]} ${a.d}`
    const end = a.m === b.m ? `${b.d}` : `${EN_MONTHS_SHORT[b.m - 1]} ${b.d}`
    return `${start} – ${end}, ${b.y}`
  }
  return a.m === b.m ? `${a.d} – ${b.d}/${b.m}/${b.y}` : `${a.d}/${a.m} – ${b.d}/${b.m}/${b.y}`
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

/** Giờ phút 'HH:mm' của mốc thời gian (giờ địa phương) */
export function clockTime(ms: number): string {
  const min = localMinutesOf(ms)
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`
}

/** Ngày giờ ngắn: "Hôm nay 08:15", "T6, 26/9 09:00" */
export function shortDateTime(ms: number, today: string): string {
  return `${shortDate(localDateOf(ms), today)} ${clockTime(ms)}`
}

/** Dung lượng file: 812 KB, 3,4 MB */
export function fileSize(bytes: number): string {
  const dec = (n: number): string => (getLang() === 'en' ? n.toFixed(1) : n.toFixed(1).replace('.', ','))
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${dec(bytes / 1024 / 1024)} MB`
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

/** Ngày trong năm: "29/2" / "Feb 29" */
function dayOfYear(date: string): string {
  const { m, d } = parseYmd(date)
  return getLang() === 'en' ? `${EN_MONTHS_SHORT[m - 1]} ${d}` : `${d}/${m}`
}

/** Mô tả quy tắc lặp: "Hằng tuần vào T2, T4 · đến 31/12" / "Weekly on Mon, Wed · until Dec 31" */
export function describeRule(rule: RecurrenceRule | null, dueDate: string | null): string {
  if (!rule) return tr('Không lặp')
  const n = rule.interval
  let base: string
  if (rule.freq === 'daily') base = n === 1 ? tr('Hằng ngày') : tr('Mỗi {n} ngày', { n })
  else if (rule.freq === 'weekly') {
    const days = rule.byWeekday?.length ? [...rule.byWeekday].sort((a, b) => a - b) : dueDate ? [isoWeekday(dueDate)] : []
    if (n === 1 && days.join() === '1,2,3,4,5') base = tr('Ngày làm việc (T2–T6)')
    else {
      const names = days.map((d) => weekdayName(d, true)).join(', ')
      base = n === 1 ? tr('Hằng tuần vào {days}', { days: names }) : tr('Mỗi {n} tuần vào {days}', { n, days: names })
    }
  } else if (n % 12 === 0 && dueDate) {
    const years = n / 12
    base = years === 1 ? tr('Hằng năm vào {date}', { date: dayOfYear(dueDate) }) : tr('Mỗi {n} năm vào {date}', { n: years, date: dayOfYear(dueDate) })
  } else {
    const day = rule.monthDay ?? (dueDate ? parseYmd(dueDate).d : 1)
    if (day === -1) base = n === 1 ? tr('Hằng tháng vào ngày cuối tháng') : tr('Mỗi {n} tháng vào ngày cuối tháng', { n })
    else base = n === 1 ? tr('Hằng tháng vào ngày {d}', { d: day }) : tr('Mỗi {n} tháng vào ngày {d}', { n, d: day })
  }
  const extra: string[] = []
  if (rule.until) extra.push(tr('đến {date}', { date: dayOfYear(rule.until) }))
  if (rule.count) extra.push(tr('{n} lần', { n: rule.count }))
  if (rule.basis === 'completion') extra.push(tr('tính từ ngày hoàn thành'))
  return [base, ...extra].join(' · ')
}
