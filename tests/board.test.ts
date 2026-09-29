import { describe, expect, it } from 'vitest'
import { addMonths, boardColumns, dropNeighbours, matchesSelection, monthEnd, monthGrid, tasksByDate, weekDays } from '../src/shared/board'
import type { Task } from '../src/shared/types'

let seq = 0
function task(over: Partial<Task> = {}): Task {
  seq++
  return {
    id: `t${seq}`,
    projectId: null,
    title: `Việc ${seq}`,
    notes: '',
    status: 'todo',
    priority: 0,
    dueDate: null,
    dueTime: null,
    remindBeforeMin: null,
    recurrence: null,
    seriesId: null,
    occurrenceIndex: null,
    nextSpawnedId: null,
    sortOrder: seq * 1024,
    completedAt: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    tagIds: [],
    checklist: [],
    ...over
  }
}

const now = { date: '2026-10-05', minutes: 9 * 60 }

describe('Kanban', () => {
  it('lọc theo lựa chọn trên thanh bên', () => {
    const late = task({ dueDate: '2026-10-04' })
    const today = task({ dueDate: '2026-10-05', dueTime: '18:00' })
    const soon = task({ dueDate: '2026-10-08' })
    const undated = task({ projectId: 'p1', tagIds: ['g1'] })
    const doneToday = task({ status: 'done', completedAt: new Date(2026, 9, 5, 8).getTime(), dueDate: '2026-10-01' })
    const doneBefore = task({ status: 'done', completedAt: new Date(2026, 9, 3, 8).getTime() })
    const all = [late, today, soon, undated, doneToday, doneBefore]
    const pick = (sel: Parameters<typeof matchesSelection>[1]): string[] => all.filter((t) => matchesSelection(t, sel, now)).map((t) => t.id)
    expect(pick({ kind: 'smart', id: 'today' })).toEqual([late.id, today.id, doneToday.id])
    expect(pick({ kind: 'smart', id: 'upcoming' })).toEqual([soon.id])
    expect(pick({ kind: 'smart', id: 'overdue' })).toEqual([late.id])
    expect(pick({ kind: 'smart', id: 'done' })).toEqual([doneToday.id, doneBefore.id])
    expect(pick({ kind: 'smart', id: 'all' })).toHaveLength(6)
    expect(pick({ kind: 'project', id: 'p1' })).toEqual([undated.id])
    expect(pick({ kind: 'tag', id: 'g1' })).toEqual([undated.id])
  })

  it('chia cột theo trạng thái, trong cột theo thứ tự đã sắp', () => {
    const a = task({ sortOrder: 3 })
    const b = task({ sortOrder: 1 })
    const c = task({ status: 'in_progress' })
    const d = task({ status: 'done', completedAt: 1 })
    const cols = boardColumns([a, b, c, d], { kind: 'smart', id: 'all' }, now)
    expect(cols.todo.map((t) => t.id)).toEqual([b.id, a.id])
    expect(cols.in_progress.map((t) => t.id)).toEqual([c.id])
    expect(cols.done.map((t) => t.id)).toEqual([d.id])
  })

  it('vị trí thả: việc ngay trên / ngay dưới', () => {
    expect(dropNeighbours(['a', 'b', 'c'], 0)).toEqual({ beforeId: null, afterId: 'a' })
    expect(dropNeighbours(['a', 'b', 'c'], 2)).toEqual({ beforeId: 'b', afterId: 'c' })
    expect(dropNeighbours(['a', 'b', 'c'], 3)).toEqual({ beforeId: 'c', afterId: null })
    expect(dropNeighbours([], 0)).toEqual({ beforeId: null, afterId: null })
  })
})

describe('Lịch', () => {
  it('lưới tháng 6 tuần bắt đầu từ đầu tuần (thứ Hai / Chủ nhật)', () => {
    const mon = monthGrid(2026, 10, 1)
    expect(mon).toHaveLength(42)
    // 1/10/2026 là thứ Năm → lưới bắt đầu thứ Hai 28/9
    expect(mon[0]).toBe('2026-09-28')
    expect(mon[3]).toBe('2026-10-01')
    expect(monthGrid(2026, 10, 0)[0]).toBe('2026-09-27')
  })

  it('tuần chứa một ngày, cộng tháng giữ ngày (kẹp cuối tháng), cuối tháng', () => {
    expect(weekDays('2026-10-07', 1)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(monthEnd('2028-02-10')).toBe('2028-02-29')
  })

  it('việc theo ngày: cả ngày trước, rồi theo giờ, việc xong cuối; ngoài khoảng thì bỏ', () => {
    const timed = task({ dueDate: '2026-10-05', dueTime: '09:00' })
    const early = task({ dueDate: '2026-10-05', dueTime: '07:30' })
    const allDay = task({ dueDate: '2026-10-05' })
    const done = task({ dueDate: '2026-10-05', dueTime: '06:00', status: 'done', completedAt: 1 })
    const outside = task({ dueDate: '2026-11-05' })
    const byDate = tasksByDate([timed, early, allDay, done, outside], '2026-10-01', '2026-10-31')
    expect(byDate.get('2026-10-05')?.map((t) => t.id)).toEqual([allDay.id, early.id, timed.id, done.id])
    expect(byDate.has('2026-11-05')).toBe(false)
  })
})
