// Dùng chung cho các mẫu robot: bệ tròn, hướng đứng, hàm easing, xử lý bấm / rê chuột vào robot
import type { ThreeEvent } from '@react-three/fiber'
import { pokeRobot } from '../robotState'

/** Robot xoay 12° về phía màn hình */
export const ROOT_YAW = (12 * Math.PI) / 180

/** Bệ tròn dưới chân robot (bấm vào để đổi robot). Robot đứng trên mặt bệ, ở độ cao `height` */
export const PEDESTAL = { radius: 0.06, height: 0.016 }

export const TAU = Math.PI * 2

export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/** 0 → 1 → 0 theo hình sin trong khoảng [0, len] giây (ngoài khoảng: 0) */
export function pulse(t: number, len: number): number {
  return t >= 0 && t <= len ? Math.sin((Math.PI * t) / len) : 0
}

function setCursor(on: boolean): void {
  const canvas = document.querySelector('.stage-canvas') as HTMLElement | null
  if (canvas) canvas.style.cursor = on ? 'pointer' : ''
}

/** Gắn vào mesh của robot: bấm là chọc robot, rê chuột vào thì con trỏ thành bàn tay */
export const pokeHandlers = {
  onClick: (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation()
    pokeRobot()
  },
  onPointerOver: (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    setCursor(true)
  },
  onPointerOut: (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation()
    setCursor(false)
  }
}

export { setCursor }
