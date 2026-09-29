// Vị trí bong bóng thoại: điểm cố định trên đầu robot (không nhún theo robot — bong bóng đứng yên cho dễ bấm), chỉ nằm
// trong khoảng trống bên trái màn hình, đuôi chỉ xuống đầu robot. Tính thẳng từ bố cục cảnh, không chờ khung hình 3D.
import { hud } from './hudRefs'
import { projectPoint } from './math/framing'
import { CAMERA } from './math/layout'
import { stage } from './stage'

export function placeBubble(): void {
  const b = hud.bubble
  if (!b || !hud.bubbleW) return
  const l = stage.layout
  const p = projectPoint({ x: l.robot.x, y: 0.3, z: l.robot.z }, stage.camera, CAMERA, stage.viewport)
  const x = Math.round(Math.max(8, Math.min(p.x - hud.bubbleW * 0.3, stage.screenRect.x - 12 - hud.bubbleW)))
  const y = Math.round(Math.max(8, p.y - hud.bubbleH - 10))
  b.style.transform = `translate(${x}px, ${y}px)`
  b.style.setProperty('--tail', `${Math.round(Math.min(hud.bubbleW - 16, Math.max(16, p.x - x)))}px`)
}
