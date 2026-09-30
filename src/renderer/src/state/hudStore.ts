// Trạng thái lớp HUD trên cảnh 3D: bong bóng thoại của robot có vừa khoảng trống bên trái màn hình không, robot nào
// đang đứng trên bệ, robot đang nói gì (tóm tắt khi bấm vào, lời chào khi vừa đổi sang)
import { create } from 'zustand'
import { DEFAULT_ROBOT, type RobotModel } from '../../../shared/robots'

/** Lời robot nói trong bong bóng (ngoài nhắc việc): tóm tắt việc hôm nay, lời chào khi vừa lên bệ */
export type Speech = 'summary' | 'greeting'

interface HudState {
  /** Đang có cảnh 3D (không phải giao diện 2D) — nút Mở rộng chỉ có ý nghĩa khi có cảnh */
  scene: boolean
  /** Bề rộng bong bóng thoại (px); 0 = không vừa khoảng trống / chế độ 2D → nhắc việc hiện banner trong màn hình */
  bubbleWidth: number
  /** Robot đang đứng trên bệ (giọng, lời thoại, kiểu bong bóng theo robot này) */
  robot: RobotModel
  speech: Speech | null
}

export const useHud = create<HudState>(() => ({ scene: false, bubbleWidth: 0, robot: DEFAULT_ROBOT, speech: null }))

/** Robot đang đứng trên bệ (đọc ngoài React: âm thanh, vị trí bong bóng) */
export function currentRobot(): RobotModel {
  return useHud.getState().robot
}

/** Bong bóng hẹp hơn chừng này thì chữ, nút bị chật: dùng banner trong màn hình */
export const BUBBLE_MIN = 168
const BUBBLE_MAX = 250

/** Khoảng trống bên trái màn hình (px) → bề rộng bong bóng */
export function bubbleWidthFor(gap: number): number {
  const w = Math.floor(Math.min(BUBBLE_MAX, gap - 20))
  return w >= BUBBLE_MIN ? w : 0
}

const SPEECH_MS: Record<Speech, number> = { summary: 4000, greeting: 4500 }
let speechTimer: ReturnType<typeof setTimeout> | undefined

/** Robot nói một lúc trong bong bóng (nhắc việc đang chờ thì nhắc việc được ưu tiên hiện) */
export function say(speech: Speech): void {
  useHud.setState({ speech })
  clearTimeout(speechTimer)
  speechTimer = setTimeout(() => useHud.setState({ speech: null }), SPEECH_MS[speech])
}

/** Bấm vào robot: tóm tắt việc hôm nay trong bong bóng một lúc */
export function showPokeSummary(): void {
  say('summary')
}
