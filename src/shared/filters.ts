// Chia task vào các danh sách trên màn hình (Hôm nay, Sắp tới, Quá hạn…) — hàm thuần, test bằng vitest
import { addDays, localDateOf, minutesOfTime } from './datetime'
import { trKey } from './i18n'
import type { Task } from './types'

export type SmartListId = 'today' | 'upcoming' | 'overdue' | 'all' | 'done'

export type Selection = { kind: 'smart'; id: SmartListId } | { kind: 'project'; id: string } | { kind: 'tag'; id: string }

/** "Bây giờ" theo giờ địa phương: ngày và số phút từ nửa đêm */
export interface Now {
  date: string
  minutes: number
}

export interface Section {
  key: string
  /** Câu tiếng Việt (dịch lúc hiển thị bằng tr()); với nhóm theo ngày thì dùng `date` */
  title: string
  date?: string
  tasks: Task[]
  /** Nhóm phụ (vd. đã xong) mặc định thu gọn */
  collapsed?: boolean
  /** Hiện tên nhóm màu cảnh báo */
  tone?: 'danger'
}

/** Sắp tới: 7 ngày kể từ ngày mai */
export const UPCOMING_DAYS = 7

export function isOpen(t: Task): boolean {
  return t.status !== 'done'
}

/** Quá hạn: ngày đã qua; hoặc hôm nay mà đã quá giờ (task cả ngày chỉ quá hạn từ ngày hôm sau) */
export function isOverdue(t: Task, now: Now): boolean {
  if (!isOpen(t) || !t.dueDate) return false
  if (t.dueDate < now.date) return true
  return t.dueDate === now.date && t.dueTime !== null && minutesOfTime(t.dueTime) < now.minutes
}

/** Theo hạn: ngày tăng dần (không có hạn xuống cuối); cùng ngày thì có giờ trước, cả ngày sau; rồi ưu tiên cao trước */
export function compareByDue(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  if (a.dueTime !== b.dueTime) {
    if (!a.dueTime) return 1
    if (!b.dueTime) return -1
    return a.dueTime < b.dueTime ? -1 : 1
  }
  return b.priority - a.priority || a.sortOrder - b.sortOrder
}

function byCompletedDesc(a: Task, b: Task): number {
  return (b.completedAt ?? 0) - (a.completedAt ?? 0)
}

function nonEmpty(sections: Section[]): Section[] {
  return sections.filter((s) => s.tasks.length > 0)
}

/** Các nhóm task của lựa chọn trên thanh bên */
export function sectionsFor(sel: Selection, all: Task[], now: Now): Section[] {
  const open = all.filter(isOpen)
  const done = all.filter((t) => !isOpen(t)).sort(byCompletedDesc)
  if (sel.kind === 'project' || sel.kind === 'tag') {
    const mine = (t: Task): boolean => (sel.kind === 'project' ? t.projectId === sel.id : t.tagIds.includes(sel.id))
    return nonEmpty([
      { key: 'overdue', title: trKey('Quá hạn'), tone: 'danger', tasks: open.filter((t) => mine(t) && isOverdue(t, now)).sort(compareByDue) },
      { key: 'open', title: trKey('Cần làm'), tasks: open.filter((t) => mine(t) && !isOverdue(t, now)).sort(compareByDue) },
      { key: 'done', title: trKey('Đã xong'), collapsed: true, tasks: done.filter(mine) }
    ])
  }
  switch (sel.id) {
    case 'today':
      return nonEmpty([
        { key: 'overdue', title: trKey('Quá hạn'), tone: 'danger', tasks: open.filter((t) => isOverdue(t, now)).sort(compareByDue) },
        { key: 'today', title: trKey('Hôm nay'), tasks: open.filter((t) => t.dueDate === now.date && !isOverdue(t, now)).sort(compareByDue) },
        {
          key: 'done-today',
          title: trKey('Đã xong hôm nay'),
          collapsed: true,
          tasks: done.filter((t) => t.completedAt !== null && t.dueDate !== null && t.dueDate <= now.date && completedToday(t, now))
        }
      ])
    case 'upcoming': {
      const days = Array.from({ length: UPCOMING_DAYS }, (_, i) => addDays(now.date, i + 1))
      const last = days[days.length - 1]
      return nonEmpty([
        ...days.map((date) => ({ key: date, title: '', date, tasks: open.filter((t) => t.dueDate === date).sort(compareByDue) })),
        { key: 'later', title: trKey('Sau đó'), tasks: open.filter((t) => t.dueDate !== null && t.dueDate > last).sort(compareByDue) }
      ])
    }
    case 'overdue':
      return nonEmpty([{ key: 'overdue', title: trKey('Quá hạn'), tone: 'danger', tasks: open.filter((t) => isOverdue(t, now)).sort(compareByDue) }])
    case 'all':
      return nonEmpty([
        { key: 'dated', title: trKey('Có hạn'), tasks: open.filter((t) => t.dueDate !== null).sort(compareByDue) },
        { key: 'undated', title: trKey('Không có hạn'), tasks: open.filter((t) => t.dueDate === null).sort(compareByDue) }
      ])
    case 'done':
      return nonEmpty([{ key: 'done', title: trKey('Đã xong'), tasks: done }])
  }
}

/** Hoàn thành trong hôm nay (theo giờ địa phương) — dùng cho nhóm "Đã xong hôm nay" */
function completedToday(t: Task, now: Now): boolean {
  return t.completedAt !== null && localDateOf(t.completedAt) === now.date
}

export interface Counts {
  today: number
  upcoming: number
  overdue: number
  all: number
}

/** Số trên thanh bên: Hôm nay tính cả việc quá hạn */
export function countsFor(all: Task[], now: Now): Counts {
  const last = addDays(now.date, UPCOMING_DAYS)
  let today = 0
  let upcoming = 0
  let overdue = 0
  let open = 0
  for (const t of all) {
    if (!isOpen(t)) continue
    open++
    const late = isOverdue(t, now)
    if (late) overdue++
    if (late || t.dueDate === now.date) today++
    else if (t.dueDate && t.dueDate > now.date && t.dueDate <= last) upcoming++
  }
  return { today, upcoming, overdue, all: open }
}

/** Lọc theo từ khoá (đã chuẩn hoá) trên tiêu đề + ghi chú */
export function matchesTerms(t: Task, terms: string[], normalize: (s: string) => string): boolean {
  if (!terms.length) return true
  const hay = normalize(`${t.title} ${t.notes}`)
  return terms.every((term) => hay.includes(term))
}
