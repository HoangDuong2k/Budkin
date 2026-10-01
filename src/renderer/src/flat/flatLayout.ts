// Bố cục bàn làm việc 2D — hàm thuần (test bằng vitest). Mọi đồ vật đo bằng mm như đồ thật (cùng kích thước với cảnh 3D)
// rồi nhân tỉ lệ px/mm: màn hình rộng theo tỉ lệ cửa sổ, robot và đèn đứng sát hai bên viền màn hình và luôn nằm trọn
// trong khung; cửa sổ thấp thì mặt bàn phía trước (bàn phím) bị cắt bớt chứ màn hình không nhỏ đi.
import { BEZEL, SCREEN_H, screenAspectFor } from '../scene/math/layout'
import type { Rect } from '../scene/math/framing'

export const MM = {
  screenH: SCREEN_H * 1000,
  bezel: BEZEL * 1000,
  /** Mép dưới phần hiển thị của màn hình, so với mặt bàn */
  screenBottom: 120,
  /** Robot (cả lúc nhảy, xoay) chiếm bề ngang 2 × 72 mm quanh tâm bệ */
  robotHalfW: 72,
  robotGap: 10,
  /** Mặt trên bệ robot (PEDESTAL.height trong scene/robots/common) */
  pedestal: 16,
  /** Đèn: từ chân đế sang trái (chụp đèn chồm về phía màn hình) / sang phải, chiều cao */
  lampLeft: 100,
  lampRight: 55,
  lampGap: 3,
  lampTop: 500,
  topMargin: 12,
  /** Mặt bàn phía trước màn hình (bàn phím, chuột) */
  deskFront: 112,
  /** Ít nhất phải thấy tới đây dưới chân robot / đèn */
  minBelow: 34
} as const

/** Màn hình không nhỏ hơn mức này (giao diện cần ≥ 594 × 396 px ở cửa sổ nhỏ nhất) */
export const MIN_SCALE = 1.1

export interface FlatLayout {
  w: number
  h: number
  /** px trên mm */
  s: number
  /** Tâm màn hình theo chiều ngang */
  cx: number
  /** Mép sau mặt bàn — nơi màn hình, robot, đèn đứng */
  base: number
  /** Phần hiển thị của màn hình (giao diện nằm ở đây) */
  screen: Rect
  /** Cả khung màn hình (gồm viền) */
  bezel: Rect
  /** Tâm mặt trên của bệ robot */
  robot: { x: number; y: number }
  /** Tâm chân đế đèn */
  lamp: { x: number; y: number }
  keyboard: { x: number; y: number; w: number; h: number }
  mouse: { x: number; y: number }
  /** Mép trước mặt bàn (có thể nằm ngoài cửa sổ) */
  deskFront: number
}

export function flatLayout(w: number, h: number): FlatLayout {
  const sw = MM.screenH * screenAspectFor(w / h)
  const outerHalf = sw / 2 + MM.bezel
  // Từ tâm màn hình tới mép ngoài robot / đèn
  const left = outerHalf + MM.robotGap + 2 * MM.robotHalfW
  const right = outerHalf + MM.lampGap + MM.lampLeft + MM.lampRight
  const top = MM.lampTop + MM.topMargin
  const sWide = (w * 0.97) / (left + right)
  const sFull = (h * 0.97) / (top + MM.deskFront)
  const sTight = (h * 0.97) / (top + MM.minBelow)
  // Ưu tiên thấy cả mặt bàn phía trước; cửa sổ thấp thì cắt bớt mặt bàn để màn hình không nhỏ quá
  const s = Math.min(sWide, sTight, Math.max(sFull, MIN_SCALE))
  const cx = w / 2 + ((left - right) * s) / 2
  const used = (top + MM.deskFront) * s
  // Dư chỗ: chia cho tường phía trên nhiều hơn một chút; thiếu chỗ: bám mép trên, mặt bàn phía trước bị cắt
  const base = used <= h ? (h - used) * 0.45 + top * s : h * 0.015 + top * s
  const screen = { x: cx - (sw * s) / 2, y: base - (MM.screenBottom + MM.screenH) * s, width: sw * s, height: MM.screenH * s }
  const b = MM.bezel * s
  const kbW = 430 * s
  return {
    w,
    h,
    s,
    cx,
    base,
    screen,
    bezel: { x: screen.x - b, y: screen.y - b, width: screen.width + 2 * b, height: screen.height + 2 * b },
    robot: { x: cx - (outerHalf + MM.robotGap + MM.robotHalfW) * s, y: base - MM.pedestal * s },
    lamp: { x: cx + (outerHalf + MM.lampGap + MM.lampLeft) * s, y: base },
    keyboard: { x: cx - kbW / 2, y: base + 24 * s, w: kbW, h: 68 * s },
    mouse: { x: cx + 262 * s, y: base + 62 * s },
    deskFront: base + MM.deskFront * s
  }
}
