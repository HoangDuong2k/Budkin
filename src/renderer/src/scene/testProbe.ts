// Cho kiểm thử tự động (BUDKIN_TEST=1) đọc trạng thái cảnh, lấy mẫu điểm ảnh, giả lập mất WebGL
import { advance } from '@react-three/fiber'
import { Box3, type Mesh } from 'three'
import { useAlerts } from '../state/alertStore'
import { useData } from '../state/dataStore'
import { currentRobot, useHud } from '../state/hudStore'
import { useLang } from '../state/langStore'
import { useTheme } from '../state/themeStore'
import { useUi } from '../state/uiStore'
import { env } from './envState'
import { projectPoint } from './math/framing'
import { CAMERA } from './math/layout'
import { renderInfo } from './renderInfo'
import { renderStats } from './renderLoop'
import { ROBOTS } from './robots'
import { PEDESTAL } from './robots/common'
import { dispatchRobot, robot } from './robotState'
import { stage, type HitPoints } from './stage'

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

/** Điểm (CSS px) để bấm vào đèn / robot / bệ robot (mặt trước của bệ, phía dưới chân robot) */
function hit(): HitPoints {
  if (stage.hit) return stage.hit()
  const l = stage.layout
  return {
    lamp: projectPoint({ x: l.lamp.x - 0.01, y: 0.2, z: l.lamp.z }, stage.camera, CAMERA, stage.viewport),
    robot: projectPoint({ x: l.robot.x, y: PEDESTAL.height + ROBOTS[currentRobot()].hitY, z: l.robot.z }, stage.camera, CAMERA, stage.viewport),
    pedestal: projectPoint({ x: l.robot.x, y: PEDESTAL.height * 0.5, z: l.robot.z + PEDESTAL.radius * 0.75 }, stage.camera, CAMERA, stage.viewport)
  }
}

/**
 * Khối bao robot đang đứng trên bệ (mọi mesh đang hiện, không tính quầng sáng, vùng bấm ẩn), tính theo chân bệ trên mặt
 * bàn — để kiểm tra robot nằm gọn trong ROBOT_BOX (khối bao dùng để đặt camera, robot không lấn vào màn hình)
 */
function robotBounds(): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null {
  const holder = stage.getR3F?.().scene.getObjectByName('robot-holder')
  if (!holder) return null
  holder.updateWorldMatrix(true, true)
  const box = new Box3()
  const part = new Box3()
  holder.traverseVisible((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    mesh.geometry.computeBoundingBox()
    if (mesh.geometry.boundingBox) box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld))
  })
  const b = stage.layout.robot
  return { min: { x: box.min.x - b.x, y: box.min.y - b.y, z: box.min.z - b.z }, max: { x: box.max.x - b.x, y: box.max.y - b.y, z: box.max.z - b.z } }
}

function loseContext(): void {
  stage.getR3F?.().gl.getContext().getExtension('WEBGL_lose_context')?.loseContext()
}

/** Mọi toast đã hiện (toast tự tắt sau vài giây — máy chậm thì kiểm thử đọc không kịp) */
const toastLog: string[] = []

export function installTestProbe(): void {
  if (!window.api.boot.test) return
  useUi.subscribe((s, prev) => {
    if (s.lastToast && s.lastToast !== prev.lastToast) toastLog.push(s.lastToast.text)
  })
  ;(window as unknown as { __budkin: unknown }).__budkin = {
    get renderMode() {
      return renderInfo.mode
    },
    renderInfo,
    stage,
    theme: useTheme,
    data: useData,
    lang: useLang,
    robot,
    alerts: useAlerts,
    hudState: useHud,
    env,
    renderStats,
    webglInfo,
    samplePixels,
    hit,
    robotBounds,
    /** Kiểm thử / chụp ảnh: phát sự kiện cho robot (chọc, ăn mừng, báo động, đẩy tới lúc ngủ) */
    robotEvent: dispatchRobot,
    toastLog,
    loseContext
  }
}
