// Trạng thái lớp HUD trên cảnh 3D: bong bóng thoại của robot có vừa khoảng trống bên trái màn hình không,
// câu tóm tắt khi bấm vào robot đang hiện tới lúc nào
import { create } from 'zustand'

interface HudState {
  /** Bề rộng bong bóng thoại (px); 0 = không vừa khoảng trống / chế độ 2D → nhắc việc hiện banner trong màn hình */
  bubbleWidth: number
  /** Câu tóm tắt "hôm nay còn N việc" hiện tới lúc này (performance.now) */
  summaryUntil: number
}

export const useHud = create<HudState>(() => ({ bubbleWidth: 0, summaryUntil: 0 }))

/** Bong bóng hẹp hơn chừng này thì chữ, nút bị chật: dùng banner trong màn hình */
export const BUBBLE_MIN = 168
const BUBBLE_MAX = 250

/** Khoảng trống bên trái màn hình (px) → bề rộng bong bóng */
export function bubbleWidthFor(gap: number): number {
  const w = Math.floor(Math.min(BUBBLE_MAX, gap - 20))
  return w >= BUBBLE_MIN ? w : 0
}

const SUMMARY_MS = 4000
let summaryTimer: ReturnType<typeof setTimeout> | undefined

/** Bấm vào robot: tóm tắt việc hôm nay trong bong bóng một lúc */
export function showPokeSummary(): void {
  useHud.setState({ summaryUntil: performance.now() + SUMMARY_MS })
  clearTimeout(summaryTimer)
  summaryTimer = setTimeout(() => useHud.setState({ summaryUntil: 0 }), SUMMARY_MS)
}
