import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { SCREEN_BG, WINDOW_BG, type Theme } from '../../../shared/palette'
import { useTheme } from '../state/themeStore'
import { BEZEL, CAMERA, LAMP_BOX, ROBOT_BOX } from './math/layout'
import { stage } from './stage'

// Cảnh tạm của bước khởi tạo: bàn, màn hình (vị trí chính xác), khối giữ chỗ cho robot và đèn

const COLORS: Record<Theme, { desk: string; bezel: string; stand: string; robot: string; lamp: string }> = {
  light: { desk: '#e9c7a0', bezel: '#fbf8f3', stand: '#e2dace', robot: '#fff6ec', lamp: '#ffd98e' },
  dark: { desk: '#4a3d3a', bezel: '#2a2f3d', stand: '#262b37', robot: '#d9d2c8', lamp: '#caa45e' }
}

function Monitor({ theme }: { theme: Theme }): React.JSX.Element {
  const head = useRef<THREE.Group>(null)
  const bezel = useRef<THREE.Mesh>(null)
  const screen = useRef<THREE.Mesh>(null)
  const neck = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const l = stage.layout
    head.current?.position.set(l.screenCenter.x, l.screenCenter.y, l.screenCenter.z)
    bezel.current?.scale.set(l.screenW + BEZEL * 2, l.screenH + BEZEL * 2, 1)
    screen.current?.scale.set(l.screenW, l.screenH, 1)
    neck.current?.position.set(l.screenCenter.x, l.screenCenter.y / 2, l.screenCenter.z - 0.03)
  })
  const c = COLORS[theme]
  return (
    <>
      <group ref={head} rotation-x={-CAMERA.pitch}>
        <mesh ref={bezel} position-z={-0.016}>
          <boxGeometry args={[1, 1, 0.03]} />
          <meshStandardMaterial color={c.bezel} roughness={0.6} />
        </mesh>
        {/* Nền màn hình = nền giao diện: lệch một pixel ở mép cũng không thấy */}
        <mesh ref={screen} position-z={0.0005}>
          <planeGeometry />
          <meshBasicMaterial color={SCREEN_BG[theme]} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={neck}>
        <boxGeometry args={[0.05, 0.3, 0.02]} />
        <meshStandardMaterial color={c.stand} roughness={0.6} />
      </mesh>
    </>
  )
}

function Placeholder({ box, which, color }: { box: typeof ROBOT_BOX; which: 'robot' | 'lamp'; color: string }): React.JSX.Element {
  const ref = useRef<THREE.Mesh>(null)
  const size = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z }
  useFrame(() => {
    const at = stage.layout[which]
    ref.current?.position.set(at.x + (box.min.x + box.max.x) / 2, at.y + size.y / 2, at.z + (box.min.z + box.max.z) / 2)
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[size.x * 0.8, size.y * 0.8, size.z * 0.8]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  )
}

export function World(): React.JSX.Element {
  const theme = useTheme((s) => s.theme)
  const c = COLORS[theme]
  const dark = theme === 'dark'
  return (
    <>
      <color attach="background" args={[WINDOW_BG[theme]]} />
      <hemisphereLight args={['#fff6ea', '#d9c6b0', dark ? 0.35 : 1.6]} />
      <directionalLight position={[-1, 2, 1.5]} intensity={dark ? 0.25 : 1.4} />
      {/* Mặt bàn */}
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[3, 0.04, 0.8]} />
        <meshStandardMaterial color={c.desk} roughness={0.7} />
      </mesh>
      <Monitor theme={theme} />
      <Placeholder box={ROBOT_BOX} which="robot" color={c.robot} />
      <Placeholder box={LAMP_BOX} which="lamp" color={c.lamp} />
    </>
  )
}
