// Dòng thời gian bật / tắt đèn (= đổi theme) — hàm thuần (test bằng vitest).
// env: 0 = phòng tối (theme tối) … 1 = phòng sáng; lamp: công suất đèn bàn 0..1; bulb: độ sáng bóng đèn nhìn thấy.
import type { Theme } from '../../../../shared/palette'

export interface ThemeAnim {
  to: Theme
  startedAt: number
  /** Giá trị lúc bắt đầu — bấm lại giữa chừng thì đi tiếp từ đây, không nhảy */
  fromEnv: number
  fromLamp: number
  reduced: boolean
}

export interface ThemeFrame {
  env: number
  lamp: number
  bulb: number
  /** Đã tới lúc đổi theme của giao diện DOM */
  flipped: boolean
  done: boolean
  /** Công tắc đang lún xuống 0..1 */
  press: number
}

/** Thời điểm đổi theme DOM (ms sau khi bấm) */
export const FLIP_AT = { toLight: 170, toDark: 100 } as const

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function envOf(theme: Theme): number {
  return theme === 'light' ? 1 : 0
}

export function themeFrame(a: ThemeAnim, now: number): ThemeFrame {
  const t = now - a.startedAt
  const press = t >= 0 && t < 120 ? Math.sin((Math.PI * t) / 120) : 0
  if (a.reduced) {
    // Giảm chuyển động: đổi theme ngay, phòng sáng / tối dần trong 200 ms, không nhấp nháy
    const p = clamp01(t / 200)
    const target = envOf(a.to)
    return { env: lerp(a.fromEnv, target, p), lamp: target, bulb: target, flipped: true, done: p >= 1, press: 0 }
  }
  if (a.to === 'light') {
    // Bóng chớp như đèn thật: 0 → 1 → 0,25 → 1
    const lamp = t < 50 ? a.fromLamp : t < 80 ? lerp(a.fromLamp, 1, (t - 50) / 30) : t < 120 ? lerp(1, 0.25, (t - 80) / 40) : t < 170 ? lerp(0.25, 1, (t - 120) / 50) : 1
    const env = lerp(a.fromEnv, 1, ease(clamp01((t - FLIP_AT.toLight) / 580)))
    return { env, lamp, bulb: lamp, flipped: t >= FLIP_AT.toLight, done: t >= 750, press }
  }
  // Tắt: đèn tắt dần, dây tóc còn âm ỉ một chút, phòng tối dần, sao hiện dần
  const lamp = lerp(a.fromLamp, 0, ease(clamp01((t - 60) / 80)))
  const glow = t < 140 ? lamp : lerp(0.18 * a.fromLamp, 0, clamp01((t - 140) / 220))
  const env = lerp(a.fromEnv, 0, ease(clamp01((t - FLIP_AT.toDark) / 550)))
  return { env, lamp, bulb: Math.max(lamp, glow), flipped: t >= FLIP_AT.toDark, done: t >= 650, press }
}
