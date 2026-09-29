// Nhắc việc — hàm thuần (test bằng vitest): lúc nào nhắc, nhắc gì, nhắc cũ quá thì chỉ ghi nhận, nhiều nhắc cùng lúc
// thì gộp. Hạn là giờ địa phương "trôi nổi": thời điểm tuyệt đối tính lại mỗi lần theo múi giờ hiện tại của máy.
import { addDays, localDateOf, minutesOfTime, parseYmd } from './datetime'
import { tr } from './i18n'

/** Nhắc trễ hơn khoảng này (máy ngủ, app tắt) thì ghi nhận mà không báo */
export const GRACE_MS = 6 * 3600_000
/** Từ chừng này nhắc cùng lúc trở lên thì gộp thành một thông báo */
export const BATCH_MIN = 3

/** 1: sắp đến hạn (nhắc trước), 2: đến hạn */
export type ReminderStage = 1 | 2

/** Task chưa xong, có hạn và có đặt nhắc */
export interface ReminderTask {
  id: string
  title: string
  dueDate: string
  dueTime: string | null
  remindBeforeMin: number
}

/** Trạng thái đã lưu (bảng reminder_state) */
export interface ReminderState {
  scheduleKey: string
  firedStage: 0 | ReminderStage
  firedAt: number | null
  snoozedUntil: number | null
  ackedAt: number | null
}

/** Nhắc cần báo */
export interface Firing {
  taskId: string
  stage: ReminderStage
  /** Lúc lẽ ra phải nhắc */
  at: number
  scheduleKey: string
  /** Nhắc lại sau khi người dùng bấm "báo lại" */
  snoozed: boolean
}

export interface ReminderPlan {
  /** Báo ngay */
  fire: Firing[]
  /** Trễ quá lâu: ghi nhận, không báo */
  silent: Firing[]
  /** Lần tới cần kiểm tra lại (null: không còn nhắc nào đang chờ) */
  nextAt: number | null
}

/** Nhắc việc đang chờ người dùng xử lý (robot báo động, bong bóng thoại) */
export interface AlertItem {
  taskId: string
  title: string
  stage: ReminderStage
  dueAt: number
  dueDate: string
  dueTime: string | null
  firedAt: number
}

/** Đổi hạn / giờ / mức nhắc là khoá đổi → nhắc việc đặt lại từ đầu */
export function scheduleKey(t: Pick<ReminderTask, 'dueDate' | 'dueTime' | 'remindBeforeMin'>): string {
  return `${t.dueDate}|${t.dueTime ?? ''}|${t.remindBeforeMin}`
}

/**
 * Thời điểm đến hạn theo múi giờ hiện tại; task cả ngày tính theo giờ nhắc chung `allDayTime`.
 * Giờ không tồn tại (chuyển sang giờ mùa hè) lùi về sau; giờ bị lặp (chuyển về giờ chuẩn) lấy lần đầu.
 */
export function dueAt(dueDate: string, dueTime: string | null, allDayTime: string): number {
  const { y, m, d } = parseYmd(dueDate)
  const min = minutesOfTime(dueTime ?? allDayTime)
  return new Date(y, m - 1, d, Math.floor(min / 60), min % 60).getTime()
}

export function planReminders(tasks: readonly ReminderTask[], states: ReadonlyMap<string, ReminderState>, now: number, allDayTime: string): ReminderPlan {
  const fire: Firing[] = []
  const silent: Firing[] = []
  let nextAt: number | null = null
  const later = (t: number): void => {
    if (nextAt === null || t < nextAt) nextAt = t
  }
  for (const t of tasks) {
    const key = scheduleKey(t)
    const saved = states.get(t.id)
    // Đã sửa hạn / mức nhắc: trạng thái cũ không còn giá trị
    const st = saved && saved.scheduleKey === key ? saved : null
    const due = dueAt(t.dueDate, t.dueTime, allDayTime)
    const early = t.remindBeforeMin > 0 ? due - t.remindBeforeMin * 60_000 : null
    let firing: Firing | null = null
    if (st?.snoozedUntil != null) {
      // Đang hoãn: im lặng tới hết giờ hoãn, rồi nhắc lại (qua giờ hạn trong lúc hoãn thì nhắc "đến hạn")
      if (now < st.snoozedUntil) {
        later(st.snoozedUntil)
        continue
      }
      firing = { taskId: t.id, stage: due <= now ? 2 : st.firedStage || 1, at: st.snoozedUntil, scheduleKey: key, snoozed: true }
    } else {
      const fired = st?.firedStage ?? 0
      // Mốc muộn nhất đã tới (lỡ cả hai thì chỉ nhắc "đến hạn")
      if (fired < 2 && due <= now) firing = { taskId: t.id, stage: 2, at: due, scheduleKey: key, snoozed: false }
      else if (fired < 1 && early !== null && early <= now) firing = { taskId: t.id, stage: 1, at: early, scheduleKey: key, snoozed: false }
    }
    const reached = firing?.stage ?? st?.firedStage ?? 0
    if (reached < 1 && early !== null && early > now) later(early)
    if (reached < 2 && due > now) later(due)
    if (firing) (now - firing.at > GRACE_MS ? silent : fire).push(firing)
  }
  fire.sort((a, b) => a.at - b.at)
  return { fire, silent, nextAt }
}

/** Nhắc đã báo mà người dùng chưa xử lý (chưa bỏ qua, không đang hoãn), sắp theo hạn */
export function activeAlerts(tasks: readonly ReminderTask[], states: ReadonlyMap<string, ReminderState>, allDayTime: string): AlertItem[] {
  const out: AlertItem[] = []
  for (const t of tasks) {
    const st = states.get(t.id)
    if (!st || st.scheduleKey !== scheduleKey(t) || st.firedStage === 0 || st.firedAt === null) continue
    if (st.snoozedUntil !== null) continue
    if (st.ackedAt !== null && st.ackedAt >= st.firedAt) continue
    out.push({ taskId: t.id, title: t.title, stage: st.firedStage, dueAt: dueAt(t.dueDate, t.dueTime, allDayTime), dueDate: t.dueDate, dueTime: t.dueTime, firedAt: st.firedAt })
  }
  return out.sort((a, b) => a.dueAt - b.dueAt || a.title.localeCompare(b.title))
}

/** Hạn đọc cho người dùng, so với hôm nay: "10:30", "ngày mai 10:30", "02/10", "hôm nay" */
export function dueLabel(item: Pick<AlertItem, 'dueDate' | 'dueTime'>, now: number): string {
  const today = localDateOf(now)
  const day =
    item.dueDate === today ? '' : item.dueDate === addDays(today, 1) ? tr('ngày mai') : `${item.dueDate.slice(8, 10)}/${item.dueDate.slice(5, 7)}`
  if (item.dueTime) return day ? `${day} ${item.dueTime}` : item.dueTime
  return day || tr('hôm nay')
}

export interface Notice {
  /** Thông báo cho một việc; null = thông báo gộp */
  taskId: string | null
  title: string
  body: string
}

/** Nội dung thông báo hệ điều hành: mỗi việc một thông báo, từ BATCH_MIN việc trở lên thì gộp một */
export function buildNotices(items: readonly AlertItem[], now: number): Notice[] {
  if (items.length >= BATCH_MIN) {
    const shown = items.slice(0, 3).map((i) => `• ${i.title}`)
    if (items.length > 3) shown.push(tr('và {n} việc khác', { n: items.length - 3 }))
    return [{ taskId: null, title: tr('Bạn có {n} việc cần làm', { n: items.length }), body: shown.join('\n') }]
  }
  return items.map((i) => ({
    taskId: i.taskId,
    title: i.title,
    body: i.stage === 1 ? tr('Sắp đến hạn: {when}', { when: dueLabel(i, now) }) : tr('Đã đến hạn: {when}', { when: dueLabel(i, now) })
  }))
}
