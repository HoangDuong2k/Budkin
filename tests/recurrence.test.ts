import { describe, expect, it } from 'vitest'
import { nextDue, stepAfter, upcomingDues } from '../src/shared/recurrence'
import type { RecurrenceRule } from '../src/shared/types'

const rule = (over: Partial<RecurrenceRule>): RecurrenceRule => ({ freq: 'daily', interval: 1, basis: 'due', ...over })

/** Chuỗi các lần liên tiếp từ `start` */
function series(r: RecurrenceRule, start: string, n: number): string[] {
  const out = [start]
  for (let i = 1; i < n; i++) out.push(stepAfter(r, out[i - 1]))
  return out
}

describe('nhịp lặp', () => {
  it('hằng tháng ngày 31: không trôi — 31/1 → 28/2 → 31/3 → 30/4', () => {
    expect(series(rule({ freq: 'monthly', monthDay: 31 }), '2026-01-31', 4)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('ngày cuối tháng (-1), năm nhuận', () => {
    expect(series(rule({ freq: 'monthly', monthDay: -1 }), '2028-01-31', 3)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
  })

  it('hằng năm (12 tháng) từ 29/2: năm không nhuận lùi về 28/2, năm nhuận lại 29/2', () => {
    expect(series(rule({ freq: 'monthly', interval: 12, monthDay: 29 }), '2028-02-29', 5)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })

  it('mỗi N ngày', () => {
    expect(series(rule({ interval: 3 }), '2026-12-30', 3)).toEqual(['2026-12-30', '2027-01-02', '2027-01-05'])
  })

  it('hằng tuần theo các thứ (T2, T4, T6); mỗi 2 tuần', () => {
    // 5/10/2026 là thứ Hai
    expect(series(rule({ freq: 'weekly', byWeekday: [5, 1, 3] }), '2026-10-05', 5)).toEqual(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14'])
    expect(series(rule({ freq: 'weekly', interval: 2, byWeekday: [1, 3] }), '2026-10-05', 4)).toEqual(['2026-10-05', '2026-10-07', '2026-10-19', '2026-10-21'])
    // Không chọn thứ: cùng thứ với hạn
    expect(series(rule({ freq: 'weekly', interval: 1 }), '2026-10-08', 3)).toEqual(['2026-10-08', '2026-10-15', '2026-10-22'])
  })
})

describe('lần kế tiếp khi hoàn thành', () => {
  it('đúng hạn: lần sau theo nhịp từ hạn', () => {
    expect(nextDue({ rule: rule({ freq: 'weekly', byWeekday: [1] }), due: '2026-10-05', index: 0, today: '2026-10-05' })).toBe('2026-10-12')
  })

  it('việc quá hạn: lăn tới lần gần nhất tính từ hôm nay, vẫn đúng nhịp', () => {
    // Hằng tuần thứ Hai, quá hạn từ 5/10, hoàn thành thứ Tư 21/10 → thứ Hai 26/10
    expect(nextDue({ rule: rule({ freq: 'weekly', byWeekday: [1] }), due: '2026-10-05', index: 0, today: '2026-10-21' })).toBe('2026-10-26')
    // Mỗi 3 ngày từ 1/10, hoàn thành 9/10 → 10/10 (1, 4, 7, 10…)
    expect(nextDue({ rule: rule({ interval: 3 }), due: '2026-10-01', index: 0, today: '2026-10-09' })).toBe('2026-10-10')
    // Hằng ngày quá hạn: lần hôm nay vẫn còn phải làm
    expect(nextDue({ rule: rule({}), due: '2026-10-01', index: 0, today: '2026-10-09' })).toBe('2026-10-09')
  })

  it('tính từ ngày hoàn thành: hôm nay + nhịp', () => {
    expect(nextDue({ rule: rule({ interval: 10, basis: 'completion' }), due: '2026-10-01', index: 0, today: '2026-10-04' })).toBe('2026-10-14')
    expect(nextDue({ rule: rule({ freq: 'monthly', basis: 'completion' }), due: '2026-10-01', index: 0, today: '2026-01-31' })).toBe('2026-02-28')
  })

  it('ngày kết thúc (tính cả ngày đó) và số lần', () => {
    const until = rule({ until: '2026-10-07' })
    expect(nextDue({ rule: until, due: '2026-10-06', index: 5, today: '2026-10-06' })).toBe('2026-10-07')
    expect(nextDue({ rule: until, due: '2026-10-07', index: 6, today: '2026-10-07' })).toBeNull()
    const three = rule({ count: 3 })
    expect(nextDue({ rule: three, due: '2026-10-02', index: 1, today: '2026-10-02' })).toBe('2026-10-03')
    expect(nextDue({ rule: three, due: '2026-10-03', index: 2, today: '2026-10-03' })).toBeNull()
  })
})

describe('các lần sắp tới trên Lịch', () => {
  it('trong khoảng đang xem, dừng ở ngày kết thúc / số lần; tính từ ngày hoàn thành thì không đoán trước', () => {
    expect(upcomingDues(rule({ interval: 7 }), '2026-10-01', 0, '2026-10-05', '2026-10-31')).toEqual(['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'])
    expect(upcomingDues(rule({ interval: 7, until: '2026-10-20' }), '2026-10-01', 0, '2026-10-01', '2026-10-31')).toEqual(['2026-10-08', '2026-10-15'])
    expect(upcomingDues(rule({ count: 3 }), '2026-10-01', 0, '2026-10-01', '2026-10-31')).toEqual(['2026-10-02', '2026-10-03'])
    expect(upcomingDues(rule({ basis: 'completion' }), '2026-10-01', 0, '2026-10-01', '2026-10-31')).toEqual([])
  })
})
