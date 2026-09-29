// Màn hình máy tính kiểu steampunk: viền đồng thau bo tròn có đinh tán (ghép từ khối hộp + 4 trụ ở góc — co giãn
// theo bề ngang màn hình trong cùng khung hình khi đổi cỡ cửa sổ), pha lê năng lượng trên đỉnh, cổ sắt vòng đồng.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Matrix4, MeshBasicMaterial, type Group, type InstancedMesh, type Mesh, type Sprite } from 'three'
import { SCREEN_BG } from '../../../shared/palette'
import { useTheme } from '../state/themeStore'
import { env } from './envState'
import { crystal, roundedBox } from './geometry'
import { BEZEL, CAMERA, MONITOR_Z, SCREEN_H, SCREEN_Y } from './math/layout'
import { materials } from './materials'
import { stage } from './stage'
import { blobTexture, haloTexture } from './textures'
import { VIGNETTE_ORDER } from './Vignette'

const DEPTH = 0.03
const R = BEZEL
const MAX_RIVETS = 48

export function Monitor(): React.JSX.Element {
  const head = useRef<Group>(null)
  const hBar = useRef<Mesh>(null)
  const vBar = useRef<Mesh>(null)
  const corners = [useRef<Mesh>(null), useRef<Mesh>(null), useRef<Mesh>(null), useRef<Mesh>(null)]
  const screen = useRef<Mesh>(null)
  const rivets = useRef<InstancedMesh>(null)
  const gem = useRef<Group>(null)
  const halo = useRef<Sprite>(null)
  const lastW = useRef(0)
  const m = materials()
  // Mặt màn hình trùng màu nền giao diện: không ánh sáng, không tone mapping, không sương mù.
  // Vẽ sau vignette (transparent + renderOrder cao hơn) nên không bị tối mép
  const screenMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false, fog: false, transparent: true }), [])

  useFrame(() => {
    const l = stage.layout
    const W = l.screenW + 2 * BEZEL
    const H = SCREEN_H + 2 * BEZEL
    head.current?.position.set(l.screenCenter.x, l.screenCenter.y, l.screenCenter.z)
    // Hình chữ nhật bo góc = hộp ngang (W × H−2R) + hộp dọc (W−2R × H) + 4 trụ bán kính R ở góc
    hBar.current?.scale.set(W, H - 2 * R, 1)
    vBar.current?.scale.set(W - 2 * R, H, 1)
    corners.forEach((c, i) => c.current?.position.set((i % 2 ? 1 : -1) * (W / 2 - R), (i < 2 ? 1 : -1) * (H / 2 - R), -DEPTH / 2))
    screen.current?.scale.set(l.screenW, SCREEN_H, 1)
    // Pha lê treo dưới viền dưới (đặt trên đỉnh thì bị khung hình cắt mất)
    gem.current?.position.set(0, -H / 2 - 0.004, 0.002)
    // Đinh tán dọc viền trên / dưới — chỉ dàn lại khi bề ngang màn hình đổi
    if (rivets.current && Math.abs(lastW.current - W) > 1e-6) {
      lastW.current = W
      const mat = new Matrix4()
      const step = 0.055
      const n = Math.min(MAX_RIVETS / 2, Math.floor((W - 0.06) / step))
      let i = 0
      for (const y of [H / 2 - BEZEL / 2, -H / 2 + BEZEL / 2])
        for (let k = 0; k <= n; k++) {
          const x = -((n * step) / 2) + k * step
          // Chừa chỗ cho pha lê ở giữa viền dưới
          if (y < 0 && Math.abs(x) < 0.03) continue
          mat.makeTranslation(x, y, 0.0015)
          rivets.current.setMatrixAt(i++, mat)
        }
      rivets.current.count = i
      rivets.current.instanceMatrix.needsUpdate = true
    }
    // Theme DOM đổi đúng khung hình → mặt màn hình đổi màu cùng lúc: hai lớp luôn trùng màu
    screenMat.color.set(SCREEN_BG[useTheme.getState().theme])
    if (halo.current) halo.current.material.opacity = 0.35 + 0.45 * (1 - env.env)
  })

  const neckH = SCREEN_Y - SCREEN_H / 2 + 0.02
  return (
    <>
      <group ref={head} rotation-x={-CAMERA.pitch}>
        <mesh ref={hBar} position-z={-DEPTH / 2} material={m.brass} castShadow>
          <boxGeometry args={[1, 1, DEPTH]} />
        </mesh>
        <mesh ref={vBar} position-z={-DEPTH / 2} material={m.brass}>
          <boxGeometry args={[1, 1, DEPTH]} />
        </mesh>
        {corners.map((c, i) => (
          <mesh key={i} ref={c} rotation-x={Math.PI / 2} material={m.brass}>
            <cylinderGeometry args={[R, R, DEPTH, 16]} />
          </mesh>
        ))}
        <instancedMesh ref={rivets} args={[undefined, undefined, MAX_RIVETS]} material={m.brassDark}>
          <sphereGeometry args={[0.0032, 8, 6]} />
        </instancedMesh>
        <mesh ref={screen} position-z={0.0006} material={screenMat} renderOrder={VIGNETTE_ORDER + 1}>
          <planeGeometry />
        </mesh>
        {/* Pha lê năng lượng treo dưới viền, trong nôi đồng thau hình quạt */}
        <group ref={gem}>
          <mesh material={m.brass} rotation={[Math.PI / 2, 0, Math.PI]} position-y={0.004}>
            <cylinderGeometry args={[0.02, 0.02, 0.012, 20, 1, false, -Math.PI / 2, Math.PI]} />
          </mesh>
          <mesh geometry={crystal(0.009)} material={m.crystal} position={[0, -0.006, 0.004]} />
          <sprite ref={halo} position={[0, -0.006, 0.01]} scale={[0.07, 0.07, 1]}>
            <spriteMaterial map={haloTexture()} color="#5fe3ff" blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} />
          </sprite>
        </group>
      </group>
      {/* Cổ sắt với hai vòng đồng thau, đế đồng thau */}
      <mesh geometry={roundedBox(0.05, neckH, 0.018, 0.008, 2)} position={[0, neckH / 2, MONITOR_Z - 0.035]} material={m.iron} castShadow />
      {[0.35, 0.75].map((f) => (
        <mesh key={f} position={[0, neckH * f, MONITOR_Z - 0.035]} material={m.brass}>
          <boxGeometry args={[0.056, 0.008, 0.024]} />
        </mesh>
      ))}
      <mesh position={[0, 0.007, MONITOR_Z - 0.015]} scale={[1, 1, 0.62]} material={m.brass} receiveShadow>
        <cylinderGeometry args={[0.092, 0.1, 0.014, 40]} />
      </mesh>
      <mesh position={[0, 0.0152, MONITOR_Z - 0.015]} scale={[1, 1, 0.62]} material={m.iron}>
        <cylinderGeometry args={[0.07, 0.078, 0.004, 40]} />
      </mesh>
      <mesh position={[0, 0.0012, MONITOR_Z - 0.015]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.32, 0.18]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} opacity={0.8} />
      </mesh>
    </>
  )
}
