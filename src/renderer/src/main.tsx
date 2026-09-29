import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setLang } from '../../shared/i18n'
import { decideRenderMode } from '../../shared/renderMode'
import { App } from './App'
import { probeWebgl } from './flat/webglProbe'
import { renderInfo } from './scene/renderInfo'
import { installTestProbe } from './scene/testProbe'
import { subscribeData, useData } from './state/dataStore'
import { installGrain } from './styles/grain'
import './styles/tokens.css'
import './styles/app.css'
import './styles/screen.css'

const boot = window.api.boot
// Đặt theme, ngôn ngữ trước lần vẽ đầu tiên (cửa sổ đã có màu nền đúng theme do main đặt)
document.documentElement.dataset.theme = boot.theme
document.documentElement.dataset.platform = boot.platform
document.documentElement.lang = boot.lang
setLang(boot.lang)
installGrain()

// 3D hay 2D: có WebGL2 không, vẽ bằng GPU hay CPU, GPU đã lỗi mấy lần, người dùng chọn gì
const facts = boot.render === '2d' ? { webgl2: false, renderer: '', software: false } : probeWebgl()
const decision = decideRenderMode(boot.render, { ...facts, gpuCrashes: boot.gpuCrashes })
renderInfo.renderer = facts.renderer
installTestProbe()

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
    <App initial={decision} />
  </StrictMode>
)
