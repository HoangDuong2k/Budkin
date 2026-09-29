import { Canvas, advance, useThree } from '@react-three/fiber'
import { Component, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import type { RenderReason } from '../../../shared/renderMode'
import type { Quality } from '../../../shared/types'
import { useData } from '../state/dataStore'
import { bubbleWidthFor, useHud } from '../state/hudStore'
import { Hud } from './Hud'
import { projectPlaneRect, snapOutward } from './math/framing'
import { CAMERA, cameraFor, sceneLayout } from './math/layout'
import { requestFrame } from './renderLoop'
import { stage } from './stage'
import { World } from './World'

const DPR: Record<Quality, [number, number]> = { high: [1, 2], balanced: [1, 1.5], saver: [1, 1] }

interface StageRefs {
  stageRef: RefObject<HTMLDivElement | null>
  screenRef: RefObject<HTMLDivElement | null>
}

/**
 * Cửa sổ đổi cỡ: tính lại bố cục, camera, vị trí lớp giao diện và kích thước canvas rồi vẽ ngay trong cùng
 * một khung hình — lớp giao diện không bao giờ trễ một nhịp so với màn hình 3D bên dưới.
 */
function StageSync({ stageRef, screenRef, dpr }: StageRefs & { dpr: [number, number] }): null {
  const get = useThree((s) => s.get)
  useLayoutEffect(() => {
    const el = stageRef.current
    const screenEl = screenRef.current
    if (!el || !screenEl) return
    stage.getR3F = get
    const apply = (): void => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 1 || height < 1) return
      const aspect = width / height
      const layout = sceneLayout(aspect)
      const pos = cameraFor(layout, aspect)
      const state = get()
      const cam = state.camera as THREE.PerspectiveCamera
      cam.position.set(pos.x, pos.y, pos.z)
      cam.rotation.set(-CAMERA.pitch, 0, 0)
      cam.fov = THREE.MathUtils.radToDeg(CAMERA.fovY)
      cam.aspect = aspect
      cam.updateProjectionMatrix()
      const rect = snapOutward(
        projectPlaneRect(layout.screenCenter, { width: layout.screenW, height: layout.screenH }, pos, CAMERA, { width, height }),
        window.devicePixelRatio
      )
      const s = screenEl.style
      s.left = `${rect.x}px`
      s.top = `${rect.y}px`
      s.width = `${rect.width}px`
      s.height = `${rect.height}px`
      stage.layout = layout
      stage.camera = pos
      stage.screenRect = rect
      stage.viewport = { width, height }
      // Bong bóng thoại của robot có vừa khoảng trống bên trái màn hình không (không vừa: banner trong màn hình)
      const bubbleWidth = bubbleWidthFor(rect.x)
      if (useHud.getState().bubbleWidth !== bubbleWidth) useHud.setState({ bubbleWidth })
      state.setSize(width, height)
      state.setDpr(dpr)
      // Bố cục đổi → bóng của đèn bàn tính lại (bình thường không tính lại mỗi khung)
      state.gl.shadowMap.needsUpdate = true
      advance(performance.now())
      stage.ready = true
    }
    // device-pixel-content-box: báo cả khi chỉ đổi tỉ lệ điểm ảnh (kéo cửa sổ sang màn hình scale khác)
    const ro = new ResizeObserver(apply)
    ro.observe(el, { box: 'device-pixel-content-box' })
    apply()
    return () => {
      ro.disconnect()
      stage.getR3F = null
      stage.ready = false
      useHud.setState({ bubbleWidth: 0 })
      // Sang chế độ 2D: bỏ vị trí đặt tay để CSS của chế độ 2D có hiệu lực
      for (const k of ['left', 'top', 'width', 'height'] as const) screenEl.style[k] = ''
    }
  }, [get, stageRef, screenRef, dpr])
  return null
}

/**
 * Mất WebGL (driver lỗi, GPU bị reset): 2 lần, hoặc 2 giây không phục hồi → chuyển 2D.
 * Nằm trong Canvas để tự gỡ khi canvas được tạo lại (đổi mức chất lượng) — lúc đó R3F cố ý huỷ context cũ,
 * không phải lỗi GPU.
 */
function ContextGuard({ onFallback }: { onFallback: (reason: RenderReason) => void }): null {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    let lost = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const onLost = (e: Event): void => {
      e.preventDefault()
      lost++
      if (lost >= 2) onFallback('context-lost')
      else timer = setTimeout(() => onFallback('context-lost'), 2000)
    }
    const onRestored = (): void => {
      clearTimeout(timer)
      gl.shadowMap.needsUpdate = true
      requestFrame()
    }
    const canvas = gl.domElement
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      clearTimeout(timer)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [gl, onFallback])
  return null
}

/** Lỗi trong cảnh 3D (shader, driver…) → chuyển sang giao diện 2D thay vì màn hình trắng */
class SceneBoundary extends Component<{ onFail: (reason: RenderReason) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(err: unknown): void {
    console.error('[scene]', err)
    this.props.onFail('error')
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

interface Props {
  webgl: boolean
  software: boolean
  onFallback: (reason: RenderReason) => void
  children: ReactNode
}

export function SceneStage({ webgl, software, onFallback, children }: Props): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const settingsQuality = useData((s) => s.settings?.quality ?? 'balanced')
  const quality: Quality = software ? 'saver' : settingsQuality
  const dpr = DPR[quality]
  return (
    <div className="stage" ref={stageRef} data-mode={webgl ? '3d' : '2d'}>
      {webgl ? (
        // Bấm vào cảnh 3D (đèn, robot) không làm mất focus của ô đang gõ trên màn hình
        <div className="stage-canvas" onMouseDown={(e) => e.preventDefault()}>
          <SceneBoundary onFail={onFallback}>
            <Canvas
              // Đổi khử răng cưa (MSAA) phải tạo lại canvas
              key={quality}
              frameloop="demand"
              dpr={dpr}
              shadows={quality === 'saver' ? false : 'percentage'}
              camera={{ manual: true, fov: THREE.MathUtils.radToDeg(CAMERA.fovY), near: 0.05, far: 30 }}
              gl={{ antialias: quality !== 'saver', alpha: false, stencil: false, powerPreference: 'low-power' }}
              onCreated={({ gl }) => {
                // ACES làm bạc màu; Neutral giữ màu đậm của tranh
                gl.toneMapping = THREE.NeutralToneMapping
                gl.shadowMap.autoUpdate = false
              }}
            >
              <ContextGuard onFallback={onFallback} />
              <StageSync stageRef={stageRef} screenRef={screenRef} dpr={dpr} />
              <World quality={quality} software={software} />
            </Canvas>
          </SceneBoundary>
        </div>
      ) : null}
      {webgl && <Hud />}
      <div className="screen" ref={screenRef}>
        {children}
      </div>
    </div>
  )
}
