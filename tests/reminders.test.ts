// Múi giờ có đổi giờ mùa hè để kiểm tra giờ không tồn tại / bị lặp (mỗi file test chạy trong tiến trình riêng)
process.env.TZ = 'Europe/Berlin'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AlertsSnapshot } from '../src/shared/api'
import { setLang } from '../src/shared/i18n'
import {
  BATCH_MIN,
  GRACE_MS,
  activeAlerts,
  buildNotices,
  dueAt,
  dueLabel,
  planReminders,
  scheduleKey,
  type AlertItem,
  type ReminderState,
  type ReminderTask
} from '../src/shared/reminders'
import { TestClock } from '../src/main/clock'
import { Db } from '../src/main/db/connection'
import { migrate } from '../src/main/db/migrations'
import { ReminderService } from '../src/main/reminders/service'
import { DataService } from '../src/main/services/data'

const MIN = 60_000
const at = (date: string, time: string): number => dueAt(date, time, '09:00')

function task(over: Partial<ReminderTask> = {}): ReminderTask {
  return { id: 't1', title: 'Gửi báo cáo', dueDate: '2026-10-05', dueTime: '10:00', remindBeforeMin: 15, ...over }
}

function state(t: ReminderTask, over: Partial<ReminderState> = {}): Map<string, ReminderState> {
  return new Map([[t.id, { scheduleKey: scheduleKey(t), firedStage: 0, firedAt: null, snoozedUntil: null, ackedAt: null, ...over }]])
}

describe('lúc nào nhắc', () => {
  it('nhắc trước N phút rồi nhắc lúc đến hạn; chưa tới giờ thì hẹn đúng mốc kế tiếp', () => {
    const t = task()
    const due = at('2026-10-05', '10:00')
    const before = planReminders([t], new Map(), due - 20 * MIN, '09:00')
    expect(before.fire).toEqual([])
    expect(before.nextAt).toBe(due - 15 * MIN)

    const early = planReminders([t], new Map(), due - 10 * MIN, '09:00')
    expect(early.fire).toMatchObject([{ taskId: 't1', stage: 1, at: due - 15 * MIN }])
    expect(early.nextAt).toBe(due)

    // Đã nhắc "sắp đến hạn": tới giờ hạn thì nhắc "đến hạn"
    const due2 = planReminders([t], state(t, { firedStage: 1, firedAt: due - 10 * MIN }), due + MIN, '09:00')
    expect(due2.fire).toMatchObject([{ stage: 2, at: due }])
    expect(due2.nextAt).toBeNull()
  })

  it('mức 0: chỉ nhắc lúc đến hạn', () => {
    const t = task({ remindBeforeMin: 0 })
    const due = at('2026-10-05', '10:00')
    expect(planReminders([t], new Map(), due - MIN, '09:00')).toMatchObject({ fire: [], nextAt: due })
    expect(planReminders([t], new Map(), due, '09:00').fire).toMatchObject([{ stage: 2 }])
  })

  it('lỡ cả hai mốc (máy tắt): chỉ nhắc "đến hạn" một lần', () => {
    const t = task()
    const due = at('2026-10-05', '10:00')
    const plan = planReminders([t], new Map(), due + 30 * MIN, '09:00')
    expect(plan.fire).toHaveLength(1)
    expect(plan.fire[0].stage).toBe(2)
  })

  it('task cả ngày nhắc theo giờ trong thiết lập', () => {
    const t = task({ dueTime: null, remindBeforeMin: 0 })
    expect(planReminders([t], new Map(), at('2026-10-05', '07:00'), '08:30').nextAt).toBe(at('2026-10-05', '08:30'))
  })

  it('đã nhắc xong cả hai mốc thì không nhắc nữa', () => {
    const t = task()
    const plan = planReminders([t], state(t, { firedStage: 2, firedAt: 1 }), at('2026-10-06', '10:00'), '09:00')
    expect(plan).toEqual({ fire: [], silent: [], nextAt: null })
  })
})

describe('sửa hạn, báo lại, nhắc cũ', () => {
  it('sửa hạn (khoá lịch đổi): trạng thái cũ bỏ đi, nhắc lại từ đầu theo hạn mới', () => {
    const old = task()
    const moved = task({ dueDate: '2026-10-06' })
    const saved = state(old, { firedStage: 2, firedAt: 1 })
    const plan = planReminders([moved], saved, at('2026-10-06', '09:50'), '09:00')
    expect(plan.fire).toMatchObject([{ stage: 1, scheduleKey: scheduleKey(moved) }])
    // Đổi mức nhắc cũng là đổi khoá
    expect(scheduleKey(task({ remindBeforeMin: 30 }))).not.toBe(scheduleKey(old))
  })

  it('báo lại: im lặng tới hết giờ hoãn rồi nhắc lại; qua giờ hạn trong lúc hoãn thì nhắc "đến hạn"', () => {
    const t = task()
    const due = at('2026-10-05', '10:00')
    const snoozed = state(t, { firedStage: 1, firedAt: due - 15 * MIN, snoozedUntil: due - 5 * MIN })
    expect(planReminders([t], snoozed, due - 10 * MIN, '09:00')).toMatchObject({ fire: [], nextAt: due - 5 * MIN })
    expect(planReminders([t], snoozed, due - 5 * MIN, '09:00').fire).toMatchObject([{ stage: 1, snoozed: true }])

    const pastDue = state(t, { firedStage: 1, firedAt: due - 15 * MIN, snoozedUntil: due + 5 * MIN })
    expect(planReminders([t], pastDue, due + 5 * MIN, '09:00').fire).toMatchObject([{ stage: 2, snoozed: true }])
  })

  it('nhắc trễ quá 6 giờ (máy ngủ qua đêm): ghi nhận mà không báo', () => {
    const t = task()
    const due = at('2026-10-05', '10:00')
    const late = planReminders([t], new Map(), due + GRACE_MS + MIN, '09:00')
    expect(late.fire).toEqual([])
    expect(late.silent).toMatchObject([{ taskId: 't1', stage: 2 }])
    expect(planReminders([t], new Map(), due + GRACE_MS - MIN, '09:00').fire).toHaveLength(1)
  })
})

describe('nhắc đang chờ, nội dung thông báo', () => {
  it('đã báo, chưa bỏ qua, không đang hoãn thì còn chờ; bỏ qua thì robot dịu lại', () => {
    const t = task()
    const fired = state(t, { firedStage: 2, firedAt: 100 })
    expect(activeAlerts([t], fired, '09:00')).toMatchObject([{ taskId: 't1', stage: 2, title: 'Gửi báo cáo' }])
    expect(activeAlerts([t], state(t, { firedStage: 2, firedAt: 100, ackedAt: 200 }), '09:00')).toEqual([])
    expect(activeAlerts([t], state(t, { firedStage: 1, firedAt: 100, snoozedUntil: 500 }), '09:00')).toEqual([])
    // Bỏ qua mốc 1, rồi mốc 2 báo sau đó: lại chờ
    expect(activeAlerts([t], state(t, { firedStage: 2, firedAt: 300, ackedAt: 200 }), '09:00')).toHaveLength(1)
    // Sửa hạn: nhắc cũ không còn
    expect(activeAlerts([task({ dueTime: '11:00' })], fired, '09:00')).toEqual([])
  })

  it(`mỗi việc một thông báo; từ ${BATCH_MIN} việc trở lên gộp thành một`, () => {
    setLang('vi')
    const now = at('2026-10-05', '09:50')
    const item = (id: string, title: string, stage: 1 | 2): AlertItem => ({ taskId: id, title, stage, dueAt: 0, dueDate: '2026-10-05', dueTime: '10:00', firedAt: now })
    expect(buildNotices([item('a', 'Họp', 1), item('b', 'Gọi điện', 2)], now)).toEqual([
      { taskId: 'a', title: 'Họp', body: 'Sắp đến hạn: 10:00' },
      { taskId: 'b', title: 'Gọi điện', body: 'Đã đến hạn: 10:00' }
    ])
    const many = buildNotices(['A', 'B', 'C', 'D'].map((x, i) => item(x, `Việc ${x}`, 2)), now)
    expect(many).toHaveLength(1)
    expect(many[0]).toMatchObject({ taskId: null, title: 'Bạn có 4 việc cần làm' })
    expect(many[0].body.split('\n')).toEqual(['• Việc A', '• Việc B', '• Việc C', 'và 1 việc khác'])
  })

  it('hạn đọc theo hôm nay: giờ, "ngày mai", ngày/tháng', () => {
    setLang('vi')
    const now = at('2026-10-05', '08:00')
    expect(dueLabel({ dueDate: '2026-10-05', dueTime: '10:30' }, now)).toBe('10:30')
    expect(dueLabel({ dueDate: '2026-10-05', dueTime: null }, now)).toBe('hôm nay')
    expect(dueLabel({ dueDate: '2026-10-06', dueTime: '10:30' }, now)).toBe('ngày mai 10:30')
    expect(dueLabel({ dueDate: '2026-10-09', dueTime: null }, now)).toBe('09/10')
  })
})

describe('giờ mùa hè (Europe/Berlin)', () => {
  it('giờ không tồn tại (29/3 02:30) lùi về sau thành 03:30', () => {
    const t = new Date(at('2026-03-29', '02:30'))
    expect([t.getHours(), t.getMinutes()]).toEqual([3, 30])
  })

  it('giờ bị lặp (25/10 02:30) lấy lần đầu (còn giờ mùa hè, UTC+2)', () => {
    expect(new Date(at('2026-10-25', '02:30')).toISOString()).toBe('2026-10-25T00:30:00.000Z')
  })

  it('ngày đổi giờ vẫn nhắc đúng giờ địa phương', () => {
    const t = task({ dueDate: '2026-03-29', dueTime: '09:00', remindBeforeMin: 0 })
    const due = new Date(planReminders([t], new Map(), at('2026-03-29', '08:00'), '09:00').nextAt ?? 0)
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([29, 9, 0])
  })
})

describe('bộ lập lịch trên DB thật', () => {
  let db: Db
  let clock: TestClock
  let data: DataService
  let service: ReminderService
  let notified: AlertItem[][]
  let fired: Array<{ items: AlertItem[]; snoozed: boolean }>
  let snapshots: AlertsSnapshot[]

  beforeEach(() => {
    db = new Db(':memory:')
    migrate(db, null)
    // 2026-10-05 08:00 giờ Berlin
    clock = new TestClock(at('2026-10-05', '08:00') - Date.now())
    data = new DataService(db, clock, () => undefined)
    notified = []
    fired = []
    snapshots = []
    service = new ReminderService(db, clock, {
      allDayTime: () => '09:00',
      notify: (items) => notified.push(items),
      fired: (items, snoozed) => fired.push({ items, snoozed }),
      changed: (s) => snapshots.push(s)
    })
  })

  afterEach(() => {
    service.stop()
    db.close()
  })

  it('ghi trạng thái rồi mới báo: chạy lại không báo trùng', () => {
    const t = data.createTask({ title: 'Họp', dueDate: '2026-10-05', dueTime: '08:10', remindBeforeMin: 15 })
    const snap = service.run()
    expect(notified).toHaveLength(1)
    expect(notified[0]).toMatchObject([{ taskId: t.id, stage: 1 }])
    expect(snap.active).toHaveLength(1)
    service.run()
    expect(notified).toHaveLength(1)
    expect(db.get<{ fired_stage: number }>('SELECT fired_stage FROM reminder_state WHERE task_id = ?', t.id)?.fired_stage).toBe(1)
  })

  it('xong việc: hết chờ; báo lại, bỏ qua, tắt nhắc', () => {
    const a = data.createTask({ title: 'A', dueDate: '2026-10-05', dueTime: '08:00', remindBeforeMin: 0 })
    const b = data.createTask({ title: 'B', dueDate: '2026-10-05', dueTime: '08:00', remindBeforeMin: 0 })
    expect(service.run().active.map((x) => x.title)).toEqual(['A', 'B'])

    data.setStatus(a.id, 'done')
    expect(service.run().active.map((x) => x.title)).toEqual(['B'])

    expect(service.snooze(b.id, 10).active).toEqual([])
    clock.advance(10 * 60_000)
    const again = service.run()
    expect(again.active.map((x) => x.title)).toEqual(['B'])
    expect(fired.at(-1)).toMatchObject({ snoozed: true })

    expect(service.dismiss(b.id).active).toEqual([])

    // Tắt nhắc: vẫn ghi nhận, không gọi thông báo
    service.mute(60)
    data.createTask({ title: 'C', dueDate: '2026-10-05', dueTime: '08:10', remindBeforeMin: 0 })
    const count = notified.length
    clock.advance(5 * 60_000)
    const muted = service.run()
    expect(muted.mutedUntil).not.toBeNull()
    expect(muted.active.map((x) => x.title)).toEqual(['C'])
    expect(notified).toHaveLength(count)
    expect(service.mute(null).mutedUntil).toBeNull()
  })

  it('mở lại app sau khi tắt máy: nhắc trong 6 giờ gộp một lần, cũ hơn thì chỉ ghi nhận', () => {
    for (const [title, time] of [
      ['Một', '06:00'],
      ['Hai', '07:00'],
      ['Ba', '07:30']
    ])
      data.createTask({ title, dueDate: '2026-10-05', dueTime: time, remindBeforeMin: 0 })
    data.createTask({ title: 'Hôm qua', dueDate: '2026-10-04', dueTime: '08:00', remindBeforeMin: 0 })
    const snap = service.run()
    expect(notified).toHaveLength(1)
    expect(notified[0].map((x) => x.title)).toEqual(['Một', 'Hai', 'Ba'])
    expect(buildNotices(notified[0], clock.now())).toHaveLength(1)
    // Việc hôm qua: ghi nhận, không báo, không làm robot báo động
    expect(snap.active.map((x) => x.title)).toEqual(['Một', 'Hai', 'Ba'])
    expect(db.get<{ n: number }>('SELECT count(*) AS n FROM reminder_state')?.n).toBe(4)
  })
})
