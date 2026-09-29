import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { probeWebgl } from './flat/webglProbe'
import { installTestProbe } from './scene/testProbe'
import { subscribeData, useData } from './state/dataStore'
import './styles/tokens.css'
import './styles/app.css'

const boot = window.api.boot
// Đặt theme trước lần vẽ đầu tiên (cửa sổ đã có màu nền đúng theme do main đặt)
document.documentElement.dataset.theme = boot.theme
document.documentElement.dataset.platform = boot.platform

const webgl = boot.render !== '2d' && probeWebgl().webgl2
installTestProbe(webgl ? '3d' : '2d')

subscribeData()
void useData.getState().load()

// Thả thứ mà không chỗ nào nhận (đường link, chữ, file…): chặn hành vi mặc định của Chromium là mở luôn
// thứ đó trong cửa sổ app — làm mất giao diện
window.addEventListener('dragover', (e) => {
  if (e.defaultPrevented) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
})
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App webgl={webgl} />
  </StrictMode>
)
