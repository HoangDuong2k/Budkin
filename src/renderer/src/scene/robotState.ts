// Trạng thái robot đang chạy: máy trạng thái (logic/robotMachine) + hẹn giờ + giá trị cho kiểm thử
import {
  TEST_TIMINGS,
  TIMINGS,
  initialState,
  nextDeadline,
  reduce,
  visibleMode,
  withTransients,
  type RobotEvent,
  type Transient,
  type VisibleMode
} from './logic/robotMachine'
import { showPokeSummary } from '../state/hudStore'
import { requestFrame } from './renderLoop'
import { playChirp } from './sound'

const baseCfg = window.api.boot.test ? TEST_TIMINGS : TIMINGS
let cfg = baseCfg

/** Mẫu robot đang đứng trên bệ có độ dài hoạt cảnh riêng */
export function setRobotTransients(overrides: Partial<Record<Transient, number>> | undefined): void {
  cfg = withTransients(baseCfg, overrides)
}

export const robot = {
  state: initialState(performance.now(), !window.api.boot.test),
  mode: 'intro' as VisibleMode,
  /** Lúc bắt đầu hoạt cảnh hiện tại (performance.now) */
  since: performance.now(),
  // Cho kiểm thử đọc
  headYaw: 0,
  headPitch: 0,
  settled: false,
  /** Lần bị chọc gần nhất (hoạt cảnh bẹp-giãn chỉ dài 0,45 giây — máy chậm khó bắt kịp đúng lúc) */
  lastPokeAt: -Infinity
}
robot.mode = visibleMode(robot.state)

type Listener = (mode: VisibleMode) => void
const listeners = new Set<Listener>()
let timer: ReturnType<typeof setTimeout> | undefined

/** Nghe khi hoạt cảnh đổi (HUD hiện "Zzz", bong bóng…) */
export function onRobotMode(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

const SOUND: Partial<Record<VisibleMode, Parameters<typeof playChirp>[0]>> = { poked: 'poke', startled: 'startled', celebrate: 'celebrate' }

export function dispatchRobot(e: RobotEvent): void {
  robot.state = reduce(robot.state, e, cfg)
  const mode = visibleMode(robot.state)
  const changed = mode !== robot.mode
  if (changed) {
    robot.mode = mode
    robot.since = performance.now()
    const s = SOUND[mode]
    if (s) playChirp(s)
    for (const l of listeners) l(mode)
  }
  schedule()
  // Thao tác / hẹn giờ không đổi gì trên hình (vd. gõ phím khi robot đang thức): không vẽ khung nào
  if (changed || (e.type !== 'input' && e.type !== 'tick')) requestFrame()
}

/** Hẹn đúng lúc cần kiểm tra lại (hết hoạt cảnh, tới giờ buồn ngủ) — không kiểm tra mỗi khung hình */
function schedule(): void {
  clearTimeout(timer)
  const at = nextDeadline(robot.state, cfg)
  if (!Number.isFinite(at)) return
  timer = setTimeout(() => dispatchRobot({ type: 'tick', at: performance.now() }), Math.max(0, at - performance.now()) + 5)
}

/** Có nhắc mới trong lúc đang báo động: nhún nhảy, nháy đèn nhanh lại từ đầu */
export function pingAlert(): void {
  if (robot.mode !== 'alert') return
  robot.since = performance.now()
  requestFrame()
}

/** Bấm vào robot: bẹp-giãn; không có nhắc đang chờ thì tóm tắt việc hôm nay */
export function pokeRobot(): void {
  robot.lastPokeAt = performance.now()
  dispatchRobot({ type: 'poke', at: robot.lastPokeAt })
  if (!robot.state.alert) showPokeSummary()
}

/** Người dùng thao tác: robot tỉnh (gộp bớt — chuột di liên tục không cần gọi máy trạng thái mỗi lần) */
export function robotInput(): void {
  const now = performance.now()
  if (robot.state.base === 'idle' && now - robot.state.lastInputAt < 1000) return
  dispatchRobot({ type: 'input', at: now })
}

schedule()
