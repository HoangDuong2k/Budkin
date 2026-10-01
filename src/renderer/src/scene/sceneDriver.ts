// Điều phối vòng vẽ của bàn làm việc, dùng chung cho cảnh 3D và tranh 2D: con trỏ, thao tác đánh thức robot,
// chuyển động nền, tạm dừng khi cửa sổ bị ẩn / chế độ Mở rộng.
import { useEffect } from 'react'
import type { Quality } from '../../../shared/types'
import { useUi } from '../state/uiStore'
import { reducedMotion } from './motion'
import { installPointerTracking, onUserInput, pointer } from './pointer'
import { bindRenderer, policy, requestFrame, setMaxFps, setPaused, type FrameDriver } from './renderLoop'
import { robot, robotInput } from './robotState'

/** Chuyển động nền (robot thở, ăng-ten đung đưa) — số khung mỗi giây theo mức chất lượng */
const AMBIENT_FPS: Record<Quality, number> = { high: 30, balanced: 10, saver: 0 }

/** maxFps: trần số khung mỗi giây (bàn 2D: 30 — thường chạy trên máy không có GPU, mỗi khung vẽ bằng CPU) */
export function useSceneDriver(driver: FrameDriver | null, quality: Quality, software: boolean, maxFps = 60): void {
  useEffect(() => {
    if (!driver) return
    bindRenderer(driver)
    policy.quality = quality
    policy.software = software
    setMaxFps(Math.min(maxFps, software ? 20 : quality === 'saver' ? 30 : 60))
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
    // Chế độ Mở rộng: giao diện che gần hết bàn làm việc — không vẽ
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
  }, [driver, quality, software, maxFps])
}
