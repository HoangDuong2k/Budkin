import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, isValidDate, isoWeekday, parseTimeInput, startOfWeek } from '../src/shared/datetime'
import { compareByDue, countsFor, isOverdue, sectionsFor, type Now } from '../src/shared/filters'
import type { Task } from '../src/shared/types'

let seq = 0
function task(p: Partial<Task>): Task {
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
    sortOrder: seq,
    completedAt: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    tagIds: [],
    checklist: [],
    ...p
  }
}

const NOW: Now = { date: '2026-09-29', minutes: 14 * 60 } // thứ Ba 14:00

describe('ngày tháng', () => {
  it('cộng ngày qua cuối tháng, cuối năm, năm nhuận', () => {
    expect(addDays('2026-09-29', 3)).toBe('2026-10-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-09-29', '2026-10-06')).toBe(7)
  })

  it('thứ trong tuần và đầu tuần', () => {
    expect(isoWeekday('2026-09-29')).toBe(2)
    expect(isoWeekday('2026-10-04')).toBe(7)
    expect(startOfWeek('2026-10-01', 1)).toBe('2026-09-28')
    expect(startOfWeek('2026-10-01', 0)).toBe('2026-09-27')
    expect(startOfWeek('2026-10-04', 1)).toBe('2026-09-28')
  })

  it('ngày hợp lệ', () => {
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('2026-1-01')).toBe(false)
  })

  it('đọc giờ người dùng gõ', () => {
    expect(parseTimeInput('9')).toBe('09:00')
    expect(parseTimeInput('9h30')).toBe('09:30')
    expect(parseTimeInput('930')).toBe('09:30')
    expect(parseTimeInput('21:15')).toBe('21:15')
    expect(parseTimeInput('21.5')).toBe('21:05')
    expect(parseTimeInput(' 7H ')).toBe('07:00')
    expect(parseTimeInput('24:00')).toBeNull()
    expect(parseTimeInput('9:75')).toBeNull()
    expect(parseTimeInput('abc')).toBeNull()
  })
})

describe('danh sách thông minh', () => {
  it('quá hạn: ngày đã qua, hoặc hôm nay đã quá giờ; việc cả ngày chỉ quá hạn từ hôm sau', () => {
    expect(isOverdue(task({ dueDate: '2026-09-28' }), NOW)).toBe(true)
    expect(isOverdue(task({ dueDate: '2026-09-29', dueTime: '13:59' }), NOW)).toBe(true)
    expect(isOverdue(task({ dueDate: '2026-09-29', dueTime: '14:00' }), NOW)).toBe(false)
    expect(isOverdue(task({ dueDate: '2026-09-29' }), NOW)).toBe(false)
    expect(isOverdue(task({ dueDate: '2026-09-28', status: 'done', completedAt: 1 }), NOW)).toBe(false)
  })

  it('sắp theo hạn: ngày, có giờ trước cả ngày, ưu tiên cao trước, không hạn cuối', () => {
    const a = task({ dueDate: '2026-09-30' })
    const b = task({ dueDate: '2026-09-30', dueTime: '09:00' })
    const c = task({ dueDate: '2026-09-30', priority: 3 })
    const d = task({})
    const e = task({ dueDate: '2026-09-29', dueTime: '23:00' })
    expect([a, b, c, d, e].sort(compareByDue).map((t) => t.id)).toEqual([e.id, b.id, c.id, a.id, d.id])
  })

  it('Hôm nay: nhóm quá hạn trước, rồi việc hôm nay; việc xong hôm nay thu gọn', () => {
    const late = task({ dueDate: '2026-09-27' })
    const lateToday = task({ dueDate: '2026-09-29', dueTime: '08:00' })
    const today = task({ dueDate: '2026-09-29' })
    const tomorrow = task({ dueDate: '2026-09-30' })
    const doneToday = task({ dueDate: '2026-09-29', status: 'done', completedAt: new Date(2026, 8, 29, 10).getTime() })
    const s = sectionsFor({ kind: 'smart', id: 'today' }, [late, lateToday, today, tomorrow, doneToday], NOW)
    expect(s.map((x) => x.key)).toEqual(['overdue', 'today', 'done-today'])
    expect(s[0].tasks.map((t) => t.id)).toEqual([late.id, lateToday.id])
    expect(s[1].tasks.map((t) => t.id)).toEqual([today.id])
    expect(s[2].collapsed).toBe(true)
  })

  it('Sắp tới: nhóm theo từng ngày trong 7 ngày tới, sau đó gộp "Sau đó"', () => {
    const d1 = task({ dueDate: '2026-09-30' })
    const d7 = task({ dueDate: '2026-10-06' })
    const later = task({ dueDate: '2026-10-07' })
    const s = sectionsFor({ kind: 'smart', id: 'upcoming' }, [d1, d7, later, task({ dueDate: '2026-09-29' })], NOW)
    expect(s.map((x) => x.key)).toEqual(['2026-09-30', '2026-10-06', 'later'])
    expect(s[0].date).toBe('2026-09-30')
  })

  it('dự án và nhãn: việc của mình, đã xong thu gọn cuối', () => {
    const mine = task({ projectId: 'p1', dueDate: '2026-10-01' })
    const mineLate = task({ projectId: 'p1', dueDate: '2026-09-01' })
    const mineDone = task({ projectId: 'p1', status: 'done', completedAt: 5 })
    const other = task({ projectId: 'p2' })
    const s = sectionsFor({ kind: 'project', id: 'p1' }, [mine, mineLate, mineDone, other], NOW)
    expect(s.map((x) => [x.key, x.tasks.map((t) => t.id)])).toEqual([
      ['overdue', [mineLate.id]],
      ['open', [mine.id]],
      ['done', [mineDone.id]]
    ])
    const tagged = task({ tagIds: ['g1'] })
    expect(sectionsFor({ kind: 'tag', id: 'g1' }, [tagged, other], NOW)[0].tasks).toEqual([tagged])
  })

  it('số trên thanh bên: Hôm nay tính cả quá hạn; Sắp tới là 7 ngày tới', () => {
    const c = countsFor(
      [
        task({ dueDate: '2026-09-27' }),
        task({ dueDate: '2026-09-29' }),
        task({ dueDate: '2026-10-01' }),
        task({ dueDate: '2026-10-20' }),
        task({}),
        task({ status: 'done', completedAt: 1 })
      ],
      NOW
    )
    expect(c).toEqual({ today: 2, upcoming: 1, overdue: 1, all: 5 })
  })
})
