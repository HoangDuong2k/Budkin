// Ánh sáng chung: trời, ánh sáng lạnh cuối ngày / ánh trăng qua cửa sổ vỡ, ánh viền phía sau, đèn dự phòng xanh khi
// mất điện, ánh màn hình, môi trường phản chiếu cho kim loại và kính, sương bụi tạo chiều sâu.
// Mọi đèn luôn được mount, chỉ đổi cường độ và màu (thêm / bớt đèn bắt biên dịch lại shader — giật hình).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { FogExp2, PMREMGenerator, type DirectionalLight, type HemisphereLight, type Object3D, type PointLight, type SpotLight } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { env } from './envState'
import { mix, pair } from './palette3d'
import { stage } from './stage'

const hemiSky = pair('hemiSky')
const hemiGround = pair('hemiGround')
const sunColor = pair('sun')
const rimColor = pair('rim')
const fogColor = pair('fog')
const glowColor = pair('glow')
/** Cường độ (candela, đơn vị mét) */
const GLOW = 0.22
const BACKUP = 0.14

export function Lighting(): React.JSX.Element {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const hemi = useRef<HemisphereLight>(null)
  const sun = useRef<DirectionalLight>(null)
  const rim = useRef<DirectionalLight>(null)
  const backup = useRef<PointLight>(null)
  const glow = useRef<SpotLight>(null)
  const glowTarget = useRef<Object3D>(null)
  const fog = useMemo(() => new FogExp2('#1b2633', 0.2), [])

  // Môi trường phản chiếu dựng bằng code (không tải ảnh HDR): kim loại cần có gì để phản chiếu
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const tex = pmrem.fromScene(room, 0.04).texture
    scene.environment = tex
    scene.fog = fog
    room.dispose()
    return () => {
      scene.environment = null
      scene.fog = null
      tex.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, fog])

  useFrame(() => {
    const t = env.env
    const l = stage.layout
    if (hemi.current) {
      hemiSky.apply(hemi.current.color, t)
      hemiGround.apply(hemi.current.groundColor, t)
      hemi.current.intensity = mix('hemi', t)
    }
    if (sun.current) {
      sunColor.apply(sun.current.color, t)
      sun.current.intensity = mix('sunI', t)
    }
    if (rim.current) {
      rimColor.apply(rim.current.color, t)
      rim.current.intensity = mix('rimI', t)
    }
    if (backup.current) {
      backup.current.intensity = BACKUP * mix('backupI', t)
      backup.current.position.set(l.screenW / 2 + 0.3, 0.55, -0.26)
    }
    if (glow.current && glowTarget.current) {
      glowColor.apply(glow.current.color, t)
      glow.current.intensity = GLOW * mix('glowI', t)
      glow.current.position.set(0, l.screenCenter.y, l.screenCenter.z + 0.02)
      glowTarget.current.position.set(0, 0.02, 0.4)
      glow.current.target = glowTarget.current
    }
    fogColor.apply(fog.color, t)
    fog.density = mix('fogD', t)
    scene.environmentIntensity = mix('envI', t)
  })
  return (
    <>
      <hemisphereLight ref={hemi} />
      {/* Ánh sáng cuối ngày / ánh trăng chiếu xiên từ cửa sổ bên trái */}
      <directionalLight ref={sun} position={[-1.4, 1.5, 0.6]} />
      {/* Ánh viền từ phía sau bên phải — viền sáng quanh robot, đèn, màn hình */}
      <directionalLight ref={rim} position={[0.8, 0.12, -1.6]} />
      {/* Đèn dự phòng xanh đâu đó phía trên bên phải, ngoài khung hình */}
      <pointLight ref={backup} color="#2f7bff" distance={1.4} decay={2} />
      <spotLight ref={glow} angle={1.2} penumbra={1} distance={2} decay={2} />
      <object3D ref={glowTarget} />
    </>
  )
}
