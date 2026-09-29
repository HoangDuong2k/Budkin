// Máy trạng thái của robot — reducer thuần (test bằng vitest). Hoạt cảnh đọc `visibleMode` để biết đang làm gì.

/** Trạng thái nền theo mức độ "thức" */
export type BaseMode = 'idle' | 'drowsy' | 'sleep'
/** Hoạt cảnh ngắn, tự hết sau một khoảng */
export type Transient = 'intro' | 'startled' | 'lampReact' | 'poked' | 'celebrate'
export type VisibleMode = BaseMode | Transient | 'alert'

export interface RobotTimings {
  drowsyAfter: number
  sleepAfter: number
  transient: Record<Transient, number>
  /** Ăn mừng tối đa một lần mỗi khoảng này */
  celebrateGap: number
}

export const TIMINGS: RobotTimings = {
  drowsyAfter: 120_000,
  sleepAfter: 60_000,
  transient: { intro: 1200, startled: 250, lampReact: 800, poked: 450, celebrate: 900 },
  celebrateGap: 2000
}

/** Kiểm thử: rút ngắn thời gian buồn ngủ / ngủ */
export const TEST_TIMINGS: RobotTimings = { ...TIMINGS, drowsyAfter: 4000, sleepAfter: 1500 }

export interface RobotState {
  base: BaseMode
  transient: Transient | null
  transientUntil: number
  /** Có nhắc việc đang chờ người dùng xử lý */
  alert: boolean
  lastInputAt: number
  lastCelebrateAt: number
}

export type RobotEvent =
  | { type: 'input'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'poke'; at: number }
  | { type: 'lamp'; at: number }
  | { type: 'celebrate'; at: number }
  | { type: 'alert'; at: number; active: boolean }

export function initialState(at: number, withIntro = true): RobotState {
  return {
    base: 'idle',
    transient: withIntro ? 'intro' : null,
    transientUntil: withIntro ? at + TIMINGS.transient.intro : 0,
    alert: false,
    lastInputAt: at,
    lastCelebrateAt: -Infinity
  }
}

function start(s: RobotState, t: Transient, at: number, cfg: RobotTimings): RobotState {
  return { ...s, transient: t, transientUntil: at + cfg.transient[t] }
}

/** Robot đang ngủ / lơ mơ thì bị đánh thức: giật mình rồi về trạng thái bình thường */
function wake(s: RobotState, at: number, cfg: RobotTimings): RobotState {
  const woke = { ...s, base: 'idle' as const, lastInputAt: at }
  return s.base === 'sleep' ? start(woke, 'startled', at, cfg) : woke
}

export function reduce(s: RobotState, e: RobotEvent, cfg: RobotTimings = TIMINGS): RobotState {
  switch (e.type) {
    case 'input':
      return s.base === 'idle' ? { ...s, lastInputAt: e.at } : wake(s, e.at, cfg)
    case 'poke':
      return start(wake(s, e.at, cfg), 'poked', e.at, cfg)
    case 'lamp':
      return start(wake(s, e.at, cfg), 'lampReact', e.at, cfg)
    case 'celebrate': {
      if (e.at - s.lastCelebrateAt < cfg.celebrateGap) return s
      return { ...start(wake(s, e.at, cfg), 'celebrate', e.at, cfg), lastCelebrateAt: e.at }
    }
    case 'alert': {
      if (e.active === s.alert) return s
      // Có nhắc việc: đánh thức (nếu đang ngủ) và không cho ngủ tiếp
      return e.active ? { ...wake(s, e.at, cfg), alert: true } : { ...s, alert: false, lastInputAt: e.at }
    }
    case 'tick': {
      let next = s
      if (next.transient && e.at >= next.transientUntil) next = { ...next, transient: null, transientUntil: 0 }
      if (next.alert) return next.base === 'idle' ? next : { ...next, base: 'idle' }
      const idleFor = e.at - next.lastInputAt
      const base: BaseMode = idleFor >= cfg.drowsyAfter + cfg.sleepAfter ? 'sleep' : idleFor >= cfg.drowsyAfter ? 'drowsy' : 'idle'
      return base === next.base ? next : { ...next, base }
    }
  }
}

/** Hoạt cảnh đang hiện, theo thứ tự ưu tiên: alert > celebrate > poked/lampReact/startled/intro > nền */
export function visibleMode(s: RobotState): VisibleMode {
  if (s.transient === 'celebrate') return 'celebrate'
  if (s.alert) return s.transient && s.transient !== 'intro' ? s.transient : 'alert'
  return s.transient ?? s.base
}

/** Thời điểm tới gần nhất cần kiểm tra lại (hết hoạt cảnh, tới giờ buồn ngủ / ngủ) — để đặt hẹn giờ thay vì kiểm tra mỗi khung */
export function nextDeadline(s: RobotState, cfg: RobotTimings = TIMINGS): number {
  const times: number[] = []
  if (s.transient) times.push(s.transientUntil)
  if (!s.alert) {
    if (s.base === 'idle') times.push(s.lastInputAt + cfg.drowsyAfter)
    else if (s.base === 'drowsy') times.push(s.lastInputAt + cfg.drowsyAfter + cfg.sleepAfter)
  }
  return times.length ? Math.min(...times) : Infinity
}
