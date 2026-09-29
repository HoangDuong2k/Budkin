// Cho kiểm thử tự động (DESKBUDDY_TEST=1) đọc trạng thái cảnh và lấy mẫu điểm ảnh của canvas
import { advance } from '@react-three/fiber'
import { useTheme } from '../state/themeStore'
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

export function installTestProbe(renderMode: '3d' | '2d'): void {
  if (!window.api.boot.test) return
  ;(window as unknown as { __deskbuddy: unknown }).__deskbuddy = {
    renderMode,
    stage,
    theme: useTheme,
    webglInfo,
    samplePixels
  }
}
