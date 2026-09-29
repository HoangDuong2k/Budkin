// Kanban và Lịch — hàm thuần (test bằng vitest): việc nào thuộc lựa chọn trên thanh bên, chia cột theo trạng thái,
// vị trí thả khi kéo, lưới ngày của lịch tháng / tuần, việc theo từng ngày.
import { addDays, daysInMonth, localDateOf, parseYmd, startOfWeek, ymd } from './datetime'
import { UPCOMING_DAYS, isOpen, isOverdue, type Now, type Selection } from './filters'
import type { Task, TaskStatus } from './types'

export const BOARD_COLUMNS: readonly TaskStatus[] = ['todo', 'in_progress', 'done']

/** Việc thuộc lựa chọn trên thanh bên (Kanban lọc theo đây; danh sách có cách chia nhóm riêng) */
export function matchesSelection(t: Task, sel: Selection, now: Now): boolean {
  if (sel.kind === 'project') return t.projectId === sel.id
  if (sel.kind === 'tag') return t.tagIds.includes(sel.id)
  switch (sel.id) {
    case 'today':
      // Việc còn mở đến hạn hôm nay / quá hạn, cộng việc xong trong hôm nay
      return isOpen(t) ? t.dueDate !== null && t.dueDate <= now.date : t.completedAt !== null && localDateOf(t.completedAt) === now.date
    case 'upcoming':
      return t.dueDate !== null && t.dueDate > now.date && t.dueDate <= addDays(now.date, UPCOMING_DAYS)
    case 'overdue':
      return isOverdue(t, now)
    case 'all':
      return true
    case 'done':
      return !isOpen(t)
  }
}

/** Ba cột Kanban theo trạng thái, trong mỗi cột theo thứ tự người dùng đã sắp */
export function boardColumns(tasks: readonly Task[], sel: Selection, now: Now): Record<TaskStatus, Task[]> {
  const out: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] }
  for (const t of tasks) if (matchesSelection(t, sel, now)) out[t.status].push(t)
  for (const k of BOARD_COLUMNS) out[k].sort((a, b) => a.sortOrder - b.sortOrder)
  return out
}

/** Thả vào vị trí `index` của cột (danh sách `ids` không gồm chính việc đang kéo): việc ngay trên / ngay dưới */
export function dropNeighbours(ids: readonly string[], index: number): { beforeId: string | null; afterId: string | null } {
  return { beforeId: index > 0 ? (ids[index - 1] ?? null) : null, afterId: ids[index] ?? null }
}

/** Lịch tháng: 6 tuần × 7 ngày, bắt đầu từ đầu tuần chứa ngày 1 */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): string[] {
  const start = startOfWeek(ymd(year, month, 1), weekStart)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** Lịch tuần: 7 ngày của tuần chứa `date` */
export function weekDays(date: string, weekStart: 0 | 1): string[] {
  const start = startOfWeek(date, weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Ngày cuối tháng chứa `date` */
export function monthEnd(date: string): string {
  const { y, m } = parseYmd(date)
  return ymd(y, m, daysInMonth(y, m))
}

/** Cộng / trừ tháng, giữ ngày trong tháng (kẹp về ngày cuối tháng nếu tháng đích ngắn hơn) */
export function addMonths(date: string, n: number): string {
  const { y, m, d } = parseYmd(date)
  const idx = y * 12 + (m - 1) + n
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** Thứ tự trong một ngày: việc cả ngày trước, rồi theo giờ; cùng giờ thì ưu tiên cao trước; việc xong xuống cuối */
function byDayOrder(a: Task, b: Task): number {
  const doneA = a.status === 'done' ? 1 : 0
  const doneB = b.status === 'done' ? 1 : 0
  if (doneA !== doneB) return doneA - doneB
  if (a.dueTime !== b.dueTime) {
    if (!a.dueTime) return -1
    if (!b.dueTime) return 1
    return a.dueTime < b.dueTime ? -1 : 1
  }
  return b.priority - a.priority || a.sortOrder - b.sortOrder
}

/** Việc có hạn trong khoảng [from, to], gom theo ngày */
export function tasksByDate(tasks: readonly Task[], from: string, to: string): Map<string, Task[]> {
  const out = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.dueDate || t.dueDate < from || t.dueDate > to) continue
    const list = out.get(t.dueDate)
    if (list) list.push(t)
    else out.set(t.dueDate, [t])
  }
  for (const list of out.values()) list.sort(byDayOrder)
  return out
}
