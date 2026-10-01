// Bật / tắt đèn: chạy dòng thời gian (logic/themeTimeline) trong vòng vẽ; đổi theme DOM đúng khung hình
// bóng đèn đổi — giao diện và bàn làm việc (cảnh 3D hoặc tranh 2D) đổi cùng lúc, không lệch nhau.
import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { useTheme } from '../state/themeStore'
import { env, resetEnv } from './envState'
import { themeFrame } from './logic/themeTimeline'
import { reducedMotion } from './motion'
import { requestFrame } from './renderLoop'
import { dispatchRobot } from './robotState'
import { playClick } from './sound'

/** Mỗi khung khi đang chuyển theme: cập nhật ánh sáng; trả về true nếu còn đang chuyển */
export function themeTick(): boolean {
  const a = env.anim
  if (!a) return false
  const f = themeFrame(a, performance.now())
  env.env = f.env
  env.lamp = f.lamp
  env.bulb = f.bulb
  env.press = f.press
  if (f.flipped) useTheme.getState().applyDom(a.to)
  if (f.done) env.anim = null
  else requestFrame()
  return true
}

/** Nhận việc đổi theme (bấm đèn, nút trên giao diện) về cho bàn làm việc điều khiển */
export function useThemeDirector(): void {
  useEffect(() => {
    const store = useTheme.getState()
    resetEnv(store.target)
    store.setDirected(true)
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const unsub = useTheme.subscribe((s, prev) => {
      if (s.target === prev.target) return
      env.anim = { to: s.target, startedAt: performance.now(), fromEnv: env.env, fromLamp: env.lamp, reduced: reducedMotion() }
      playClick(s.target === 'light')
      dispatchRobot({ type: 'lamp', at: performance.now() })
      clearTimeout(watchdog)
      // Phòng khi không vẽ được (mất WebGL, cửa sổ đang ẩn): vẫn đổi theme sau 1 giây
      watchdog = setTimeout(() => useTheme.getState().applyDom(s.target), 1000)
      requestFrame()
    })
    return () => {
      unsub()
      clearTimeout(watchdog)
      useTheme.getState().setDirected(false)
    }
  }, [])
}

export function ThemeDirector(): null {
  useThemeDirector()
  useFrame(() => void themeTick(), -10)
  return null
}
