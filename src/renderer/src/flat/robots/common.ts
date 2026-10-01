// Dùng chung cho robot 2D: trạng thái đèn LED (xanh ngọc bình thường, đỏ nhấp nháy khi báo động, mờ khi ngủ)
import type { VisibleMode } from '../../scene/logic/robotMachine'

/** normal: xanh ngọc; alert: đỏ (nhịp sáng); dim: nhịp tối lúc báo động; sleep: mờ */
export type LedState = 'normal' | 'alert' | 'dim' | 'sleep'

export function ledState(mode: VisibleMode, alertOn: boolean): LedState {
  if (mode === 'alert') return alertOn ? 'alert' : 'dim'
  return mode === 'sleep' ? 'sleep' : 'normal'
}

/** Đổi màu mọi đèn của robot bằng một thuộc tính trên nhóm gốc (CSS chọn màu theo data-led) */
export function setLed(el: SVGElement | null, state: LedState): void {
  if (el && el.dataset.led !== state) el.dataset.led = state
}
