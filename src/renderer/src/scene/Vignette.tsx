// Vignette: mặt phẳng trong suốt ngay trước camera, tối dần ra mép — một lần vẽ, không cần postprocessing
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { MeshBasicMaterial, type Mesh } from 'three'
import { env } from './envState'
import { fromCameraAxes } from './math/framing'
import { CAMERA } from './math/layout'
import { stage } from './stage'
import { vignetteTexture } from './textures'

/** Khoảng cách tới camera (lớn hơn mặt phẳng cắt gần 0,05) */
const DIST = 0.1
/** Vẽ sau mọi thứ trong suốt; mặt màn hình (VIGNETTE_ORDER + 1) vẽ sau nữa nên không bị tối */
export const VIGNETTE_ORDER = 999

export function Vignette(): React.JSX.Element {
  const mesh = useRef<Mesh>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ map: vignetteTexture(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }), [])
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const c = stage.camera
    const fwd = fromCameraAxes({ x: 0, y: 0, z: -1 }, CAMERA.pitch)
    m.position.set(c.x + fwd.x * DIST, c.y + fwd.y * DIST, c.z + fwd.z * DIST)
    m.rotation.set(-CAMERA.pitch, 0, 0)
    const h = 2 * DIST * Math.tan(CAMERA.fovY / 2) * 1.02
    m.scale.set((h * stage.viewport.width) / Math.max(1, stage.viewport.height), h, 1)
    // Ban đêm tối mép hơn
    mat.opacity = 0.7 + 0.3 * (1 - env.env)
  })
  return (
    <mesh ref={mesh} material={mat} renderOrder={VIGNETTE_ORDER} frustumCulled={false}>
      <planeGeometry />
    </mesh>
  )
}
