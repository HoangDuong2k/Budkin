// Lớp HUD trên cảnh 3D: "Zzz" khi robot ngủ (hoạt ảnh CSS — cảnh không phải vẽ khung nào),
// và nút ẩn cho đèn / robot để dùng được bằng bàn phím, trình đọc màn hình
import { useEffect, useState } from 'react'
import { tr } from '../../../shared/i18n'
import { useTheme } from '../state/themeStore'
import { hud } from './hudRefs'
import { dispatchRobot, onRobotMode, robot } from './robotState'

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
          aria-label={tr('Chọc robot')}
          onClick={() => dispatchRobot({ type: 'poke', at: performance.now() })}
        />
      </div>
      <div className="scene-hud">
        <div
          ref={(el) => {
            hud.zzz = el
          }}
          className={`zzz ${mode === 'sleep' ? 'on' : ''}`}
          aria-hidden
        >
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </div>
      </div>
    </>
  )
}
