// Phần chung của mọi mẫu robot, tính mỗi khung: nhìn đi đâu (theo con trỏ / người dùng / đèn / cúi ngủ), độ mở mắt
// (chớp mắt, lơ mơ, ngủ), đèn báo động, vị trí chữ "Zzz". Mẫu robot chỉ áp các giá trị đó lên khớp của mình theo cách
// riêng rồi trả về "còn đang chuyển động không" — hết chuyển động thì cảnh thôi vẽ (đứng yên = 0 khung hình).
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { env } from '../envState'
import { hud } from '../hudRefs'
import { alertHopSeconds, alertLedOn, nextLedToggle } from '../logic/alertBlink'
import type { VisibleMode } from '../logic/robotMachine'
import { projectPoint, type Vec3 } from '../math/framing'
import { CAMERA } from '../math/layout'
import { lookAngles, pointerTarget } from '../math/lookAt'
import { reducedMotion } from '../motion'
import { pointer } from '../pointer'
import { policy, requestFrame } from '../renderLoop'
import { robot } from '../robotState'
import { stage } from '../stage'
import { PEDESTAL, ROOT_YAW } from './common'

export interface RigSpec {
  /** Độ cao mắt so với mặt bệ — tâm của hướng nhìn */
  eyeY: number
  /** Độ cao chữ "Zzz" khi ngủ, so với mặt bệ */
  zzzY: number
  /** Chớp mắt ngẫu nhiên (robot mắt dải đèn thì không) */
  blinks?: boolean
}

export interface RigFrame {
  /** Giây từ khung trước (đã giới hạn — khung đầu sau lúc đứng yên có delta rất lớn) */
  dt: number
  now: number
  mode: VisibleMode
  /** Giây kể từ lúc vào trạng thái hiện tại */
  t: number
  reduced: boolean
  /** Góc quay đầu cần có để nhìn tới đích (yaw quanh trục đứng, pitch ngẩng lên dương), đã giới hạn */
  look: { yaw: number; pitch: number }
  /** Đang nhìn theo con trỏ (không phải nhìn người dùng, nhìn đèn, cúi ngủ) */
  tracking: boolean
  /** Con trỏ gần robot: 1 ngay trên robot … 0 ở xa (mèo vểnh tai, mống mắt co giãn…) */
  near: number
  /** Độ mở mắt 0..1: chớp mắt, lơ mơ, ngủ */
  eyeOpen: number
  /** Báo động: đèn đang sáng (nhịp chậm dần theo thời gian), còn trong mấy giây nhún nhảy đầu */
  alertOn: boolean
  alertHop: boolean
  /** Phòng tối: 0 bật đèn … 1 mất điện — mắt, đèn phát sáng rõ hơn */
  dark: number
  /** Đang chuyển động nền (thở, bồng bềnh): mẫu robot tự quyết, chỉ vẽ khi cảnh đang được vẽ */
  ambient: boolean
}

/** Chân bệ (thế giới) + độ cao → điểm trên robot */
export function robotPoint(y: number): Vec3 {
  const l = stage.layout
  return { x: l.robot.x, y: PEDESTAL.height + y, z: l.robot.z }
}

export function useRobotRig(spec: RigSpec, apply: (f: RigFrame) => boolean): void {
  const blink = useRef({ start: -1, double: false })
  const ledTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const blinks = spec.blinks !== false

  // Chớp mắt ngẫu nhiên mỗi 2,5–6 s (20% chớp đôi) — hẹn giờ, không kiểm tra mỗi khung
  useEffect(() => {
    if (!blinks) return
    let timer: ReturnType<typeof setTimeout>
    const next = (): void => {
      timer = setTimeout(
        () => {
          // Tiết kiệm / vẽ bằng CPU: không chớp mắt (đứng yên = 0 khung hình)
          if (robot.mode !== 'sleep' && policy.quality !== 'saver' && !policy.software) {
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

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.1)
    const now = performance.now()
    const mode = robot.mode
    const t = (now - robot.since) / 1000
    const reduced = reducedMotion()
    const head = robotPoint(spec.eyeY)

    // ---- Nhìn đi đâu ----
    const aspect = stage.viewport.width / Math.max(1, stage.viewport.height)
    let target: Vec3
    let tracking = false
    if (mode === 'sleep' || mode === 'drowsy') target = { x: head.x + 0.1, y: -0.3, z: head.z + 0.6 }
    else if (mode === 'lampReact') target = { x: stage.layout.lamp.x, y: 0.4, z: stage.layout.lamp.z }
    else if (mode === 'alert' || mode === 'poked' || mode === 'celebrate' || mode === 'intro' || (!pointer.inside && now - pointer.lastMoveAt > 1500))
      target = stage.camera
    else {
      target = pointerTarget({ x: pointer.x, y: pointer.y }, stage.camera, CAMERA, aspect, head)
      tracking = true
    }
    const look = lookAngles(head, target, ROOT_YAW)

    // Con trỏ gần robot (theo khoảng cách trên khung nhìn)
    let near = 0
    if (pointer.inside) {
      const p = projectPoint(head, stage.camera, CAMERA, stage.viewport)
      const px = ((pointer.x + 1) / 2) * stage.viewport.width
      const py = ((1 - pointer.y) / 2) * stage.viewport.height
      near = Math.max(0, 1 - Math.hypot(px - p.x, py - p.y) / 160)
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

    // ---- Báo động: đèn nhấp nháy chậm dần — hẹn vẽ đúng lúc đèn đổi, không vẽ liên tục ----
    const alertOn = mode === 'alert' && alertLedOn(t)
    const alertHop = mode === 'alert' && !reduced && t < alertHopSeconds(policy.software)
    if (mode === 'alert') {
      clearTimeout(ledTimer.current)
      ledTimer.current = setTimeout(requestFrame, Math.max(0, robot.since + nextLedToggle(t) * 1000 - now) + 5)
    }
    const ambient = !reduced && !policy.software && policy.quality !== 'saver' && mode !== 'sleep'

    moving = apply({ dt, now, mode, t, reduced, look, tracking, near, eyeOpen, alertOn, alertHop, dark: 1 - env.env, ambient }) || moving

    // Vị trí "Zzz" trên đầu robot (lớp HUD)
    if (hud.zzz) {
      const p = projectPoint(robotPoint(spec.zzzY), stage.camera, CAMERA, stage.viewport)
      hud.zzz.style.transform = `translate(${Math.round(p.x + 6)}px, ${Math.round(p.y - 14)}px)`
    }
    robot.settled = !moving
    if (moving) requestFrame()
  })
}
