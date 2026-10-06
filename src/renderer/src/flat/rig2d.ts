// Phần chung của mọi robot 2D, tính mỗi khung (giống scene/robots/rig.ts của cảnh 3D): nhìn đi đâu (theo con trỏ / người
// dùng / đèn / cúi ngủ), độ mở mắt (chớp, lơ mơ, ngủ), đèn báo động, vị trí chữ "Zzz". Mẫu robot áp các giá trị lên các
// nhóm SVG của mình (transform) rồi trả về "còn đang chuyển động không" — hết chuyển động thì thôi vẽ.
// Toạ độ robot: mm, gốc ở tâm mặt trên của bệ, trục y hướng xuống (như SVG).
import { useEffect, useRef } from 'react'
import { env } from '../scene/envState'
import { hud } from '../scene/hudRefs'
import { alertHopSeconds, alertLedOn, nextLedToggle } from '../scene/logic/alertBlink'
import type { VisibleMode } from '../scene/logic/robotMachine'
import { reducedMotion } from '../scene/motion'
import { pointer } from '../scene/pointer'
import { policy, requestFrame } from '../scene/renderLoop'
import { robot } from '../scene/robotState'
import { stage } from '../scene/stage'
import { useFlatFrame } from './flatLoop'

export interface FlatRigSpec {
  /** Độ cao mắt so với mặt bệ (mm) — gốc của hướng nhìn */
  eyeY: number
  /** Độ cao chữ "Zzz" khi ngủ (mm) */
  zzzY: number
  /** Chớp mắt ngẫu nhiên (robot mắt dải đèn thì không) */
  blinks?: boolean
}

export interface FlatRigFrame {
  dt: number
  now: number
  mode: VisibleMode
  /** Giây kể từ lúc vào trạng thái hiện tại */
  t: number
  reduced: boolean
  /** Hướng nhìn: x sang phải, y lên trên, mỗi trục −1..1 (đã làm mượt ở phía robot) */
  look: { x: number; y: number }
  /** Như look, nhưng khi nhìn theo con trỏ thì chia theo khoảng từ đầu robot tới mép cửa sổ ở phía đó: con trỏ ở đâu
   *  trong cửa sổ cũng làm hướng nhìn đổi rõ (look đã gần hết cỡ khi con trỏ mới ở giữa màn hình máy tính) */
  aim: { x: number; y: number }
  tracking: boolean
  /** Con trỏ gần robot: 1 ngay trên robot … 0 ở xa */
  near: number
  /** Độ mở mắt 0..1 */
  eyeOpen: number
  alertOn: boolean
  alertHop: boolean
  /** Phòng tối: 0 bật đèn … 1 mất điện */
  dark: number
  /** Đang được phép chuyển động nền (thở, bồng bềnh) */
  ambient: boolean
}

/** Lệch d (px) về một phía, chia cho khoảng tới mép cửa sổ ở phía đó (ít nhất 120px); cong nhẹ để con trỏ gần robot
 *  vẫn làm robot quay rõ */
function towardEdge(d: number, before: number, after: number): number {
  const n = Math.max(-1, Math.min(1, d / Math.max(d < 0 ? before : after, 120)))
  return Math.sign(n) * Math.pow(Math.abs(n), 0.8)
}

/** Mắt robot (cách mặt bàn y mét) → toạ độ cửa sổ */
function headPoint(eyeMm: number): { x: number; y: number } {
  return stage.robotAnchor((16 + eyeMm) / 1000)
}

export function useFlatRig(spec: FlatRigSpec, apply: (f: FlatRigFrame) => boolean): void {
  const blink = useRef({ start: -1, double: false })
  const ledTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const blinks = spec.blinks !== false

  // Chớp mắt ngẫu nhiên mỗi 2,5–6 s (20% chớp đôi) — hẹn giờ, không kiểm tra mỗi khung; Tiết kiệm thì không chớp
  useEffect(() => {
    if (!blinks) return
    let timer: ReturnType<typeof setTimeout>
    const next = (): void => {
      timer = setTimeout(
        () => {
          if (robot.mode !== 'sleep' && policy.quality !== 'saver') {
            blink.current = { start: performance.now(), double: Math.random() < 0.2 }
            requestFrame()
          }
          next()
        },
        2500 + Math.random() * 3500
      )
    }
    next()
    return () => clearTimeout(timer)
  }, [blinks])
  useEffect(() => () => clearTimeout(ledTimer.current), [])

  useFlatFrame((dt, now) => {
    const mode = robot.mode
    const t = (now - robot.since) / 1000
    const reduced = reducedMotion()
    const head = headPoint(spec.eyeY)

    // ---- Nhìn đi đâu ----
    let look: { x: number; y: number }
    let aim: { x: number; y: number } | null = null
    let tracking = false
    if (mode === 'sleep' || mode === 'drowsy') look = { x: 0.15, y: -0.7 }
    else if (mode === 'lampReact') look = { x: 1, y: 0.35 }
    else if (mode === 'alert' || mode === 'poked' || mode === 'celebrate' || mode === 'intro' || (!pointer.inside && now - pointer.lastMoveAt > 1500))
      look = { x: 0.15, y: 0 }
    else {
      const px = ((pointer.x + 1) / 2) * stage.viewport.width
      const py = ((1 - pointer.y) / 2) * stage.viewport.height
      look = { x: Math.tanh((px - head.x) / 380), y: Math.tanh((head.y - py) / 300) }
      aim = {
        x: towardEdge(px - head.x, head.x, stage.viewport.width - head.x),
        y: towardEdge(head.y - py, stage.viewport.height - head.y, head.y)
      }
      tracking = true
    }

    let near = 0
    if (pointer.inside) {
      const px = ((pointer.x + 1) / 2) * stage.viewport.width
      const py = ((1 - pointer.y) / 2) * stage.viewport.height
      near = Math.max(0, 1 - Math.hypot(px - head.x, py - head.y) / 160)
    }

    // ---- Độ mở mắt ----
    let eyeOpen = mode === 'sleep' ? 0.08 : mode === 'drowsy' ? 0.4 + 0.15 * Math.sin(now / 900) : 1
    let moving = false
    const b = blink.current
    if (b.start > 0) {
      const bt = now - b.start
      const len = b.double ? 330 : 150
      if (bt < len) {
        eyeOpen *= Math.max(0.08, Math.abs(1 - 2 * ((bt % 165) / 165)))
        moving = true
      } else b.start = -1
    }

    // ---- Báo động: đèn nhấp nháy chậm dần — hẹn vẽ đúng lúc đèn đổi ----
    const alertOn = mode === 'alert' && alertLedOn(t, policy.software)
    const alertHop = mode === 'alert' && !reduced && t < alertHopSeconds(policy.software)
    if (mode === 'alert') {
      clearTimeout(ledTimer.current)
      ledTimer.current = setTimeout(requestFrame, Math.max(0, robot.since + nextLedToggle(t, policy.software) * 1000 - now) + 5)
    }
    const ambient = !reduced && policy.quality !== 'saver' && mode !== 'sleep'

    moving = apply({ dt, now, mode, t, reduced, look, aim: aim ?? look, tracking, near, eyeOpen, alertOn, alertHop, dark: 1 - env.env, ambient }) || moving

    if (hud.zzz) {
      const p = stage.robotAnchor((16 + spec.zzzY) / 1000)
      hud.zzz.style.transform = `translate(${Math.round(p.x + 6)}px, ${Math.round(p.y - 14)}px)`
    }
    robot.headYaw = look.x * 0.5
    robot.headPitch = look.y * 0.3
    robot.settled = !moving
    if (moving) requestFrame()
  }, 0)
}

/** Đặt transform cho một nhóm SVG (bỏ qua nếu chưa gắn) */
export function tf(el: SVGElement | null, value: string): void {
  el?.setAttribute('transform', value)
}

/** Ẩn / hiện, độ mờ của một phần tử SVG */
export function op(el: SVGElement | null, value: number): void {
  if (el) el.style.opacity = value <= 0.001 ? '0' : value.toFixed(3)
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/** Lò xo hơi non tay (vọt nhẹ rồi dừng) kéo obj[key] về đích, vận tốc ở obj[vkey]; trả về true nếu còn đang chuyển động */
export function spring(obj: Record<string, number>, key: string, vkey: string, target: number, dt: number, eps = 0.001): boolean {
  // Chia nhỏ bước để vẫn ổn định khi một khung hình đến trễ
  for (let left = Math.min(dt, 0.25); left > 0; left -= 1 / 60) {
    const h = Math.min(left, 1 / 60)
    obj[vkey] += ((target - obj[key]) * 130 - obj[vkey] * 17) * h
    obj[key] += obj[vkey] * h
  }
  if (Math.abs(target - obj[key]) < eps && Math.abs(obj[vkey]) < eps * 10) {
    obj[key] = target
    obj[vkey] = 0
    return false
  }
  return true
}

/** Tiến về đích theo hàm mũ; trả về true nếu còn đang chuyển động */
export function damp(obj: Record<string, number>, key: string, target: number, smooth: number, dt: number, eps = 0.001): boolean {
  const cur = obj[key]
  const next = target + (cur - target) * Math.exp(-dt / Math.max(0.0001, smooth))
  obj[key] = Math.abs(next - target) < eps ? target : next
  return obj[key] !== target
}
