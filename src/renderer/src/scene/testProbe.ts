// Cho kiểm thử tự động (DESKBUDDY_TEST=1) đọc trạng thái cảnh, lấy mẫu điểm ảnh, giả lập mất WebGL
import { advance } from '@react-three/fiber'
import { useData } from '../state/dataStore'
import { useLang } from '../state/langStore'
import { useTheme } from '../state/themeStore'
import { env } from './envState'
import { projectPoint } from './math/framing'
import { CAMERA } from './math/layout'
import { renderInfo } from './renderInfo'
import { renderStats } from './renderLoop'
import { robot } from './robotState'
import { stage } from './stage'

type Rgb = [number, number, number]

function webglInfo(): { version: string; renderer: string } | null {
  const gl = stage.getR3F?.().gl
  if (!gl) return null
  const ctx = gl.getContext()
  const ext = ctx.getExtension('WEBGL_debug_renderer_info')
  return { version: String(ctx.getParameter(ctx.VERSION)), renderer: String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)) }
}

/** Vẽ một khung rồi đọc màu tại các điểm (CSS px) — phải đọc ngay trong cùng tác vụ, trước khi khung được hiển thị */
function samplePixels(points: Array<{ x: number; y: number }>): Rgb[] {
  const state = stage.getR3F?.()
  if (!state) return []
  advance(performance.now())
  const ctx = state.gl.getContext()
  const dpr = state.gl.getPixelRatio()
  const h = ctx.drawingBufferHeight
  const px = new Uint8Array(4)
  return points.map((p) => {
    ctx.readPixels(Math.floor(p.x * dpr), h - 1 - Math.floor(p.y * dpr), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    return [px[0], px[1], px[2]]
  })
}

/** Điểm (CSS px) để bấm vào đèn / robot */
function hit(): { lamp: { x: number; y: number }; robot: { x: number; y: number } } {
  const l = stage.layout
  return {
    lamp: projectPoint({ x: l.lamp.x - 0.01, y: 0.2, z: l.lamp.z }, stage.camera, CAMERA, stage.viewport),
    robot: projectPoint({ x: l.robot.x, y: 0.06, z: l.robot.z }, stage.camera, CAMERA, stage.viewport)
  }
}

function loseContext(): void {
  stage.getR3F?.().gl.getContext().getExtension('WEBGL_lose_context')?.loseContext()
}

export function installTestProbe(): void {
  if (!window.api.boot.test) return
  ;(window as unknown as { __deskbuddy: unknown }).__deskbuddy = {
    get renderMode() {
      return renderInfo.mode
    },
    renderInfo,
    stage,
    theme: useTheme,
    data: useData,
    lang: useLang,
    robot,
    env,
    renderStats,
    webglInfo,
    samplePixels,
    hit,
    loseContext
  }
}
