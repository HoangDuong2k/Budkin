import { Canvas, advance, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { projectPlaneRect, snapOutward } from './math/framing'
import { CAMERA, cameraFor, sceneLayout } from './math/layout'
import { stage } from './stage'
import { World } from './World'

const DPR: [number, number] = [1, 1.5]

interface StageRefs {
  stageRef: RefObject<HTMLDivElement | null>
  screenRef: RefObject<HTMLDivElement | null>
}

/**
 * Cửa sổ đổi cỡ: tính lại bố cục, camera, vị trí lớp giao diện và kích thước canvas rồi vẽ ngay trong cùng
 * một khung hình — lớp giao diện không bao giờ trễ một nhịp so với màn hình 3D bên dưới.
 */
function StageSync({ stageRef, screenRef }: StageRefs): null {
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
      state.setSize(width, height)
      state.setDpr(DPR)
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
    }
  }, [get, stageRef, screenRef])
  return null
}

export function SceneStage({ webgl, children }: { webgl: boolean; children: ReactNode }): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  return (
    <div className="stage" ref={stageRef} data-mode={webgl ? '3d' : '2d'}>
      {webgl && (
        // Bấm vào cảnh 3D (đèn, robot) không làm mất focus của ô đang gõ trên màn hình
        <div className="stage-canvas" onMouseDown={(e) => e.preventDefault()}>
          <Canvas
            frameloop="demand"
            dpr={DPR}
            camera={{ manual: true, fov: THREE.MathUtils.radToDeg(CAMERA.fovY), near: 0.05, far: 30 }}
            gl={{ antialias: true, alpha: false, stencil: false, powerPreference: 'low-power' }}
            onCreated={({ gl }) => {
              // ACES làm nhạt màu pastel
              gl.toneMapping = THREE.NeutralToneMapping
            }}
          >
            <StageSync stageRef={stageRef} screenRef={screenRef} />
            <World />
          </Canvas>
        </div>
      )}
      <div className="screen" ref={screenRef}>
        {children}
      </div>
    </div>
  )
}
