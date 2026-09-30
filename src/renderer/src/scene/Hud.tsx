// Lớp HUD trên cảnh 3D: "Zzz" khi robot ngủ (cảnh không phải vẽ khung nào), bong bóng thoại nhắc việc,
// và nút ẩn cho đèn / robot để dùng được bằng bàn phím, trình đọc màn hình
import { useEffect, useRef, useState } from 'react'
import { tr } from '../../../shared/i18n'
import { useTheme } from '../state/themeStore'
import { hud } from './hudRefs'
import { reducedMotion } from './motion'
import { onRobotMode, pokeRobot, robot } from './robotState'
import { ReminderBubble } from './ReminderBubble'

/** Nhịp hiện từng chữ z */
const ZZZ_STEP_MS = 700
/** Ngủ lâu hơn thế thì "Zzz" đứng yên: cả cửa sổ không phải vẽ lại nữa */
const ZZZ_ANIMATE_MS = 60_000

/**
 * "Zzz" khi robot ngủ: từng chữ z lần lượt hiện rồi tắt, đổi trạng thái 0,7 giây một lần trong phút đầu, sau đó đứng
 * yên. Không dùng hoạt ảnh CSS chạy mãi — trình duyệt sẽ phải ghép hình cả cửa sổ 60 lần mỗi giây suốt lúc robot ngủ
 * (máy vẽ bằng CPU tốn ~30% một lõi)
 */
function Zzz({ on }: { on: boolean }): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!on || reducedMotion()) {
      el.dataset.step = '3'
      return
    }
    let step = 0
    el.dataset.step = '0'
    const timer = setInterval(() => {
      step = (step + 1) % 4
      el.dataset.step = String(step)
    }, ZZZ_STEP_MS)
    const hold = setTimeout(() => {
      clearInterval(timer)
      el.dataset.step = '3'
    }, ZZZ_ANIMATE_MS)
    return () => {
      clearInterval(timer)
      clearTimeout(hold)
    }
  }, [on])
  return (
    <div
      ref={(el) => {
        ref.current = el
        hud.zzz = el
      }}
      className={`zzz ${on ? 'on' : ''}`}
      data-step="3"
      aria-hidden
    >
      <span>z</span>
      <span>z</span>
      <span>Z</span>
    </div>
  )
}

export function Hud(): React.JSX.Element {
  const [mode, setMode] = useState(robot.mode)
  const theme = useTheme((s) => s.target)
  const toggle = useTheme((s) => s.toggle)
  useEffect(() => onRobotMode(setMode), [])
  return (
    <>
      <div className="scene-hotspots">
        <button
          ref={(el) => {
            hud.lampButton = el
          }}
          className="hotspot"
          aria-label={theme === 'light' ? tr('Tắt đèn') : tr('Bật đèn')}
          onClick={toggle}
        />
        <button
          ref={(el) => {
            hud.robotButton = el
          }}
          className="hotspot"
          aria-label={tr('Chọc Budkin')}
          onClick={pokeRobot}
        />
      </div>
      <div className="scene-hud">
        <Zzz on={mode === 'sleep'} />
        <ReminderBubble />
      </div>
    </>
  )
}
