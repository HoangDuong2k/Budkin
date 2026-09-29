import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/api'
import { tr } from '../../shared/i18n'
import { call } from './ipc'
import { SceneStage } from './scene/SceneStage'
import { useTheme } from './state/themeStore'

export function App({ webgl }: { webgl: boolean }): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  useEffect(() => {
    void call('app:info').then(setInfo)
  }, [])
  return (
    <SceneStage webgl={webgl}>
      <div className="screen-ui">
        <h1>{tr('Bàn làm việc của bạn')}</h1>
        {info ? (
          <p className="muted app-info">
            Electron {info.electron} · Chrome {info.chrome} · Node {info.node} · SQLite {info.sqlite}
          </p>
        ) : (
          <p className="muted">{tr('Đang chuẩn bị bàn làm việc…')}</p>
        )}
        <button className="btn theme-toggle" onClick={toggle}>
          {theme === 'light' ? tr('Tắt đèn') : tr('Bật đèn')}
        </button>
      </div>
    </SceneStage>
  )
}
