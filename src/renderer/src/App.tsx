import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { LocaleProvider, PortalProvider, TooltipProvider, en, vi } from 'momi-ui'
import type { Lang } from '../../shared/i18n'
import type { RenderDecision, RenderReason } from '../../shared/renderMode'
import { call } from './ipc'
import { renderInfo } from './scene/renderInfo'
import { SceneStage } from './scene/SceneStage'
import { Shell } from './screen/Shell'
import { useLang } from './state/langStore'

/**
 * Bối cảnh cho các thành phần momi-ui trên màn hình máy tính: ngôn ngữ theo cài đặt; menu, popover, hộp thoại, thẻ
 * đang kéo vẽ bên trong .screen và không tràn ra ngoài (không đè lên robot, mặt bàn).
 */
function ScreenProviders({ lang, children }: { lang: Lang; children: ReactNode }): React.JSX.Element {
  const [screen, setScreen] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => setScreen(document.querySelector<HTMLElement>('.screen')), [])
  return (
    <LocaleProvider locale={lang === 'en' ? 'en-US' : 'vi-VN'} messages={lang === 'en' ? en : vi}>
      <PortalProvider container={screen} collisionBoundary={screen} collisionPadding={6}>
        <TooltipProvider>{children}</TooltipProvider>
      </PortalProvider>
    </LocaleProvider>
  )
}

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
      <ScreenProviders lang={lang}>
        <Shell key={lang} />
      </ScreenProviders>
    </SceneStage>
  )
}
