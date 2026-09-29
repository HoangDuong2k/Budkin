import { useCallback, useEffect, useState } from 'react'
import type { RenderDecision, RenderReason } from '../../shared/renderMode'
import { call } from './ipc'
import { renderInfo } from './scene/renderInfo'
import { SceneStage } from './scene/SceneStage'
import { Shell } from './screen/Shell'
import { useLang } from './state/langStore'

/** Cảnh 3D chạy ổn bấy lâu thì coi GPU là tốt (xoá bộ đếm lỗi GPU) */
const HEALTHY_AFTER = 60_000

export function App({ initial }: { initial: RenderDecision }): React.JSX.Element {
  // Đổi ngôn ngữ: vẽ lại toàn bộ giao diện trên màn hình (mọi chữ đi qua tr() lúc vẽ)
  const lang = useLang((s) => s.lang)
  const [decision, setDecision] = useState(initial)
  const fallback = useCallback((reason: RenderReason) => {
    console.warn(`[scene] chuyển sang 2D: ${reason}`)
    setDecision({ mode: '2d', software: false, reason })
  }, [])
  useEffect(() => {
    Object.assign(renderInfo, decision)
    if (decision.mode !== '3d') return
    const t = setTimeout(() => void call('app:sceneHealthy').catch(() => undefined), HEALTHY_AFTER)
    return () => clearTimeout(t)
  }, [decision])
  return (
    <SceneStage webgl={decision.mode === '3d'} software={decision.software} onFallback={fallback}>
      <Shell key={lang} />
    </SceneStage>
  )
}
