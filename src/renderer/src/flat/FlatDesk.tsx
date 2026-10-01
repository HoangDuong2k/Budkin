// Bàn làm việc 2D (máy không có WebGL, cảnh 3D lỗi, hoặc người dùng chọn "Chỉ 2D"): cùng bàn làm việc với cảnh 3D nhưng
// vẽ bằng SVG — robot, bệ tròn, đèn bàn, màn hình (giao diện nằm khít bên trong). Dùng chung máy trạng thái robot, dòng
// thời gian bật / tắt đèn, lời thoại, âm thanh với cảnh 3D. Đứng yên thì không vẽ gì (vòng vẽ chỉ chạy khi có chuyển động).
import { useLayoutEffect, useRef, useState } from 'react'
import { useData } from '../state/dataStore'
import { bubbleWidthFor, currentRobot, useHud } from '../state/hudStore'
import { placeBubble } from '../scene/bubblePlacement'
import { env } from '../scene/envState'
import { hud } from '../scene/hudRefs'
import { snapOutward } from '../scene/math/framing'
import { ROBOTS } from '../scene/robots'
import { useSceneDriver } from '../scene/sceneDriver'
import { stage } from '../scene/stage'
import { themeTick, useThemeDirector } from '../scene/ThemeDirector'
import { flatDriver, useFlatFrame } from './flatLoop'
import { flatLayout, type FlatLayout } from './flatLayout'
import { FlatRobotStage } from './FlatRobotStage'
import { FlatRoom } from './FlatRoom'

/** Ánh sáng hiện tại → biến CSS của tranh (lớp phủ tối, ánh đèn bàn, độ sáng tấm LED) */
function applyEnv(el: HTMLElement | null): void {
  if (!el) return
  el.style.setProperty('--night', (1 - env.env).toFixed(3))
  el.style.setProperty('--lamp', env.lamp.toFixed(3))
  el.style.setProperty('--bulb', env.bulb.toFixed(3))
}

function place(el: HTMLElement | null, x: number, y: number, w: number, h: number): void {
  if (!el) return
  el.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - h / 2)}px)`
  el.style.width = `${Math.round(w)}px`
  el.style.height = `${Math.round(h)}px`
}

export function FlatDesk(): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<FlatLayout | null>(null)
  const quality = useData((s) => s.settings?.quality ?? 'balanced')
  useSceneDriver(flatDriver, quality, false, 30)
  useThemeDirector()
  // Đang bật / tắt đèn: cập nhật ánh sáng mỗi khung (trước robot — mắt robot sáng theo phòng)
  useFlatFrame(() => {
    if (themeTick() || root.current?.style.getPropertyValue('--night') !== (1 - env.env).toFixed(3)) applyEnv(root.current)
  }, -10)

  useLayoutEffect(() => {
    // Tìm thẳng trong DOM: lúc này React chưa gắn ref của sân khấu (phần tử cha) và màn hình (phần tử đứng sau)
    const el = root.current?.parentElement
    const screenEl = el?.querySelector<HTMLDivElement>(':scope > .screen')
    if (!el || !screenEl) return
    const anchor = stage.robotAnchor
    let current: FlatLayout | null = null
    const apply = (): void => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 1 || height < 1) return
      const l = (current = flatLayout(width, height))
      const rect = snapOutward(l.screen, window.devicePixelRatio)
      const s = screenEl.style
      s.left = `${rect.x}px`
      s.top = `${rect.y}px`
      s.width = `${rect.width}px`
      s.height = `${rect.height}px`
      stage.screenRect = rect
      stage.viewport = { width, height }
      const bubbleWidth = bubbleWidthFor(rect.x)
      if (useHud.getState().bubbleWidth !== bubbleWidth) useHud.setState({ bubbleWidth })
      // Nút ẩn cho bàn phím / trình đọc màn hình đặt đúng chỗ đèn, robot, bệ
      place(hud.lampButton, l.lamp.x - 20 * l.s, l.base - 260 * l.s, 110 * l.s, 470 * l.s)
      place(hud.robotButton, l.robot.x, l.robot.y - 100 * l.s, 120 * l.s, 190 * l.s)
      place(hud.pedestalButton, l.robot.x, l.robot.y + 8 * l.s, 130 * l.s, 34 * l.s)
      setLayout(l)
      placeBubble()
      stage.ready = true
    }
    // Robot đứng ở tâm bệ; mét trên mặt bàn → px theo tỉ lệ của tranh
    stage.robotAnchor = (y) => (current ? { x: current.robot.x, y: current.base - y * 1000 * current.s } : { x: 0, y: 0 })
    stage.hit = () => {
      const l = current!
      return {
        lamp: { x: l.lamp.x + 4 * l.s, y: l.base - 200 * l.s },
        robot: { x: l.robot.x, y: l.robot.y - ROBOTS[currentRobot()].hitY * 1000 * l.s },
        pedestal: { x: l.robot.x, y: l.robot.y + 10 * l.s }
      }
    }
    applyEnv(root.current)
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    apply()
    return () => {
      ro.disconnect()
      stage.robotAnchor = anchor
      stage.hit = null
      stage.ready = false
      useHud.setState({ bubbleWidth: 0 })
      for (const k of ['left', 'top', 'width', 'height'] as const) screenEl.style[k] = ''
    }
  }, [])

  return (
    <div className="flat" ref={root}>
      {layout && <FlatRoom l={layout} />}
      {layout && <FlatRobotStage l={layout} />}
    </div>
  )
}
