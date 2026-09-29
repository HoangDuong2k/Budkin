import { SceneStage } from './scene/SceneStage'
import { Shell } from './screen/Shell'
import { useLang } from './state/langStore'

export function App({ webgl }: { webgl: boolean }): React.JSX.Element {
  // Đổi ngôn ngữ: vẽ lại toàn bộ giao diện trên màn hình (mọi chữ đi qua tr() lúc vẽ)
  const lang = useLang((s) => s.lang)
  return (
    <SceneStage webgl={webgl}>
      <Shell key={lang} />
    </SceneStage>
  )
}
