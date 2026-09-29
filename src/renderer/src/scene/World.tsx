import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { Quality } from '../../../shared/types'
import { useUi } from '../state/uiStore'
import { hud } from './hudRefs'
import { Lamp } from './Lamp'
import { Lighting } from './Lighting'
import { projectPoint } from './math/framing'
import { CAMERA } from './math/layout'
import { Monitor } from './Monitor'
import { reducedMotion } from './motion'
import { installPointerTracking, onUserInput, pointer } from './pointer'
import { Props } from './Props'
import { bindRenderer, markFrame, policy, requestFrame, setMaxFps, setPaused } from './renderLoop'
import { Robot } from './Robot'
import { robot, robotInput } from './robotState'
import { Room } from './Room'
import { stage } from './stage'
import { ThemeDirector } from './ThemeDirector'
import { Vignette } from './Vignette'

/** Chuyển động nền (robot thở, ăng-ten đung đưa) — số khung mỗi giây theo mức chất lượng */
const AMBIENT_FPS: Record<Quality, number> = { high: 30, balanced: 10, saver: 0 }

function place(el: HTMLElement | null, world: { x: number; y: number; z: number }, w: number, h: number): void {
  if (!el) return
  const p = projectPoint(world, stage.camera, CAMERA, stage.viewport)
  el.style.transform = `translate(${Math.round(p.x - w / 2)}px, ${Math.round(p.y - h / 2)}px)`
  el.style.width = `${w}px`
  el.style.height = `${h}px`
}

/** Điều phối vòng vẽ: đếm khung, con trỏ, chuyển động nền, tạm dừng khi cửa sổ bị ẩn */
function Driver({ quality, software }: { quality: Quality; software: boolean }): null {
  const get = useThree((s) => s.get)
  useEffect(() => {
    bindRenderer(get)
    policy.quality = quality
    policy.software = software
    setMaxFps(software ? 20 : quality === 'saver' ? 30 : 60)
    const offPointer = installPointerTracking()
    const offInput = onUserInput(robotInput)
    const fps = software || reducedMotion() ? 0 : AMBIENT_FPS[quality]
    // Chuyển động nền chỉ khi cửa sổ đang được dùng: có focus, robot thức; "Cân bằng" thì chỉ 30 giây sau thao tác cuối
    const ambient =
      fps > 0
        ? setInterval(() => {
            if (document.hidden || !document.hasFocus() || robot.mode === 'sleep') return
            if (quality === 'balanced' && performance.now() - pointer.lastInputAt > 30_000) return
            requestFrame()
          }, 1000 / fps)
        : undefined
    const onVisibility = (): void => setPaused(document.hidden, 'hidden')
    // Chế độ Mở rộng: giao diện che gần hết cảnh — không vẽ
    setPaused(useUi.getState().expanded, 'expanded')
    const offExpanded = useUi.subscribe((s, prev) => {
      if (s.expanded !== prev.expanded) setPaused(s.expanded, 'expanded')
    })
    document.addEventListener('visibilitychange', onVisibility)
    requestFrame()
    return () => {
      clearInterval(ambient)
      offPointer()
      offInput()
      document.removeEventListener('visibilitychange', onVisibility)
      offExpanded()
      bindRenderer(null)
    }
  }, [get, quality, software])

  useFrame(() => {
    markFrame()
    const l = stage.layout
    place(hud.lampButton, { x: l.lamp.x - 0.02, y: 0.25, z: l.lamp.z }, 64, 150)
    place(hud.robotButton, { x: l.robot.x, y: 0.12, z: l.robot.z }, 70, 90)
  }, -20)
  return null
}

export function World({ quality, software }: { quality: Quality; software: boolean }): React.JSX.Element {
  return (
    <>
      <Driver quality={quality} software={software} />
      <ThemeDirector />
      <Lighting />
      <Room />
      <Monitor />
      <Props />
      <Lamp />
      <Robot />
      <Vignette />
    </>
  )
}
