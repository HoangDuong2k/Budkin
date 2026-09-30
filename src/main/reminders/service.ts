// Bộ lập lịch nhắc việc: đọc task có đặt nhắc, tính việc cần báo (shared/reminders), GHI TRẠNG THÁI TRƯỚC rồi mới báo
// (mỗi nhắc chỉ báo tối đa một lần, kể cả khi app tắt ngang), rồi hẹn giờ tới lần cần kiểm tra kế tiếp.
// Hẹn giờ tối đa 60 giây một lần: tự bắt kịp khi đồng hồ máy bị chỉnh, đổi múi giờ, máy vừa thức dậy.
import type { AlertsSnapshot } from '../../shared/api'
import { activeAlerts, planReminders, type AlertItem, type Firing, type ReminderState, type ReminderTask } from '../../shared/reminders'
import type { Clock } from '../clock'
import type { Db } from '../db/connection'
import { AppError } from '../errors'

/** Lâu nhất giữa hai lần kiểm tra */
const MAX_WAIT = 60_000

interface Deps {
  /** Giờ nhắc cho task cả ngày (thiết lập) */
  allDayTime(): string
  /** Báo cho người dùng (thông báo hệ điều hành) — không gọi khi đang tắt nhắc */
  notify(items: AlertItem[]): void
  /** Vừa có nhắc mới (renderer: chuông, robot nhún nhảy) */
  fired(items: AlertItem[], snoozed: boolean): void
  /** Danh sách nhắc đang chờ đổi */
  changed(snapshot: AlertsSnapshot): void
}

interface StateRow {
  task_id: string
  schedule_key: string
  fired_stage: number
  fired_at: number | null
  snoozed_until: number | null
  acked_at: number | null
}

export class ReminderService {
  private timer: ReturnType<typeof setTimeout> | undefined
  private pokeTimer: ReturnType<typeof setTimeout> | undefined
  private last = ''
  private stopped = false

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly deps: Deps
  ) {}

  start(): void {
    this.stopped = false
    this.run()
  }

  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
    clearTimeout(this.pokeTimer)
  }

  /** Dữ liệu đổi, máy thức dậy…: kiểm tra lại ngay (gộp các lần gọi dồn dập) */
  poke(): void {
    if (this.stopped) return
    clearTimeout(this.pokeTimer)
    this.pokeTimer = setTimeout(() => this.run(), 30)
  }

  private tasks(): ReminderTask[] {
    return this.db
      .all<{ id: string; title: string; due_date: string; due_time: string | null; remind_before_min: number }>(
        `SELECT id, title, due_date, due_time, remind_before_min FROM tasks
         WHERE deleted_at IS NULL AND status != 'done' AND due_date IS NOT NULL AND remind_before_min IS NOT NULL`
      )
      .map((r) => ({ id: r.id, title: r.title, dueDate: r.due_date, dueTime: r.due_time, remindBeforeMin: r.remind_before_min }))
  }

  private states(): Map<string, ReminderState> {
    const out = new Map<string, ReminderState>()
    for (const r of this.db.all<StateRow>('SELECT task_id, schedule_key, fired_stage, fired_at, snoozed_until, acked_at FROM reminder_state'))
      out.set(r.task_id, {
        scheduleKey: r.schedule_key,
        firedStage: r.fired_stage === 1 || r.fired_stage === 2 ? r.fired_stage : 0,
        firedAt: r.fired_at,
        snoozedUntil: r.snoozed_until,
        ackedAt: r.acked_at
      })
    return out
  }

  private writeFired(f: Firing, now: number, silent: boolean): void {
    this.db.run(
      `INSERT INTO reminder_state(task_id, schedule_key, fired_stage, fired_at, snoozed_until, acked_at) VALUES (?, ?, ?, ?, NULL, ?)
       ON CONFLICT(task_id) DO UPDATE SET schedule_key = excluded.schedule_key, fired_stage = excluded.fired_stage,
         fired_at = excluded.fired_at, snoozed_until = NULL, acked_at = excluded.acked_at`,
      f.taskId,
      f.scheduleKey,
      f.stage,
      now,
      silent ? now : null
    )
  }

  /** Đang tắt nhắc tới lúc nào (null: không tắt) */
  mutedUntil(): number | null {
    const v = Number(this.db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'muted_until'")?.value)
    return Number.isFinite(v) && v > this.clock.now() ? v : null
  }

  /** Kiểm tra, báo những nhắc đã tới giờ, hẹn lần sau. Trả về danh sách nhắc đang chờ */
  run(): AlertsSnapshot {
    clearTimeout(this.timer)
    const now = this.clock.now()
    const tasks = this.tasks()
    const allDay = this.deps.allDayTime()
    let states = this.states()
    const plan = planReminders(tasks, states, now, allDay)
    if (plan.fire.length || plan.silent.length) {
      this.db.tx(() => {
        for (const f of plan.fire) this.writeFired(f, now, false)
        for (const f of plan.silent) this.writeFired(f, now, true)
      })
      states = this.states()
    }
    const snapshot: AlertsSnapshot = { active: activeAlerts(tasks, states, allDay), mutedUntil: this.mutedUntil(), nextAt: plan.nextAt }
    if (plan.fire.length) {
      const firedIds = new Set(plan.fire.map((f) => f.taskId))
      const items = snapshot.active.filter((a) => firedIds.has(a.taskId))
      if (items.length) {
        if (snapshot.mutedUntil === null) this.deps.notify(items)
        this.deps.fired(items, plan.fire.every((f) => f.snoozed))
      }
    }
    const key = JSON.stringify([snapshot.active, snapshot.mutedUntil])
    if (key !== this.last) {
      this.last = key
      this.deps.changed(snapshot)
    }
    if (!this.stopped) {
      const wait = plan.nextAt === null ? MAX_WAIT : Math.min(MAX_WAIT, Math.max(0, plan.nextAt - now) + 20)
      this.timer = setTimeout(() => this.run(), wait)
    }
    return snapshot
  }

  /**
   * Sau khi nhập / khôi phục dữ liệu: nhắc việc đã tới giờ của các task này (null: mọi task) coi như đã báo — không
   * dồn dập báo lại việc cũ. Gọi run() / poke() sau đó để cập nhật danh sách nhắc
   */
  absorb(taskIds: readonly string[] | null): void {
    const now = this.clock.now()
    const ids = taskIds ? new Set(taskIds) : null
    const plan = planReminders(this.tasks(), this.states(), now, this.deps.allDayTime())
    const past = [...plan.fire, ...plan.silent].filter((f) => !ids || ids.has(f.taskId))
    if (!past.length) return
    this.db.tx(() => {
      for (const f of past) this.writeFired(f, now, true)
    })
  }

  /** Báo lại sau `minutes` phút */
  snooze(taskId: string, minutes: number): AlertsSnapshot {
    const changed = this.db.run('UPDATE reminder_state SET snoozed_until = ?, acked_at = NULL WHERE task_id = ? AND fired_stage > 0', this.clock.now() + minutes * 60_000, taskId)
    if (!changed) throw new AppError('NOT_FOUND', `Task ${taskId} chưa có nhắc việc nào`)
    return this.run()
  }

  /** Bỏ qua nhắc hiện tại (robot dịu lại; mốc nhắc sau vẫn báo bình thường) */
  dismiss(taskId: string): AlertsSnapshot {
    this.db.run('UPDATE reminder_state SET acked_at = ? WHERE task_id = ?', this.clock.now(), taskId)
    return this.run()
  }

  /** Tắt nhắc (vẫn ghi nhận, không hiện thông báo, không kêu) trong `minutes` phút; null: bật lại */
  mute(minutes: number | null): AlertsSnapshot {
    if (minutes === null) this.db.run("DELETE FROM meta WHERE key = 'muted_until'")
    else
      this.db.run(
        "INSERT INTO meta(key, value) VALUES ('muted_until', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        String(this.clock.now() + minutes * 60_000)
      )
    return this.run()
  }
}
