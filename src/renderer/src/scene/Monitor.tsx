// Màn hình máy tính hiện đại: viền graphite bóng mảnh (ghép từ khối hộp + 4 trụ ở góc — co giãn theo bề ngang màn hình
// trong cùng khung hình khi đổi cỡ cửa sổ), camera nhỏ ở cạnh trên, đèn nguồn cyan, chân nhôm xước tóc, dây cáp thả xuống bàn.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, CylinderGeometry, Euler, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Group, type InstancedMesh, type Mesh, type Sprite } from 'three'
import { SCREEN_BG } from '../../../shared/palette'
import { useTheme } from '../state/themeStore'
import { env } from './envState'
import { cable, roundedBox } from './geometry'
import { BEZEL, CAMERA, MONITOR_Z, SCREEN_H, SCREEN_Y } from './math/layout'
import { materials } from './materials'
import { SCREEN_LIP } from './palette3d'
import { stage } from './stage'
import { blobTexture, haloTexture } from './textures'
import { VIGNETTE_ORDER } from './Vignette'

const DEPTH = 0.024
const R = BEZEL
/** Mép trong quanh màn hình (ánh màn hình hắt lên) */
const LIP = 0.006

export function Monitor(): React.JSX.Element {
  const head = useRef<Group>(null)
  const hBar = useRef<Mesh>(null)
  const vBar = useRef<Mesh>(null)
  const corners = useRef<InstancedMesh>(null)
  const lip = useRef<Mesh>(null)
  const screen = useRef<Mesh>(null)
  const cam = useRef<Group>(null)
  const led = useRef<Group>(null)
  const halo = useRef<Sprite>(null)
  const lastW = useRef(0)
  const m = materials()
  // Mặt màn hình trùng màu nền giao diện: không ánh sáng, không tone mapping, không sương mù.
  // Mặt màn hình và mép trong phát sáng của nó vẽ sau vignette (transparent + renderOrder cao hơn) nên không bị tối mép —
  // mép trong luôn khác hẳn màu nền màn hình, kể cả ở cạnh trên sát khung hình
  const screenMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false, fog: false, transparent: true }), [])
  const lipMat = useMemo(() => new MeshBasicMaterial({ toneMapped: false, fog: false, transparent: true }), [])
  const parts = useMemo(
    () => ({
      corner: new CylinderGeometry(R, R, DEPTH, 16),
      cord: cable(
        'monitor',
        [
          [0.02, 0.2, -0.13],
          [0.05, 0.11, -0.16],
          [0.08, 0.006, -0.2],
          [0.2, 0.006, -0.27],
          [0.34, 0.006, -0.33]
        ],
        0.004
      )
    }),
    []
  )

  useFrame(() => {
    const l = stage.layout
    const W = l.screenW + 2 * BEZEL
    const H = SCREEN_H + 2 * BEZEL
    head.current?.position.set(l.screenCenter.x, l.screenCenter.y, l.screenCenter.z)
    // Hình chữ nhật bo góc = hộp ngang (W × H−2R) + hộp dọc (W−2R × H) + 4 trụ bán kính R ở góc
    hBar.current?.scale.set(W, H - 2 * R, 1)
    vBar.current?.scale.set(W - 2 * R, H, 1)
    lip.current?.scale.set(l.screenW + 2 * LIP, SCREEN_H + 2 * LIP, 1)
    screen.current?.scale.set(l.screenW, SCREEN_H, 1)
    cam.current?.position.set(0, H / 2 - BEZEL / 2, 0.0006)
    led.current?.position.set(W / 2 - 0.045, -H / 2 + BEZEL / 2, 0.0006)
    // 4 trụ góc — chỉ dàn lại khi bề ngang màn hình đổi
    if (corners.current && Math.abs(lastW.current - W) > 1e-6) {
      lastW.current = W
      const mat = new Matrix4()
      const q = new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0))
      const one = new Vector3(1, 1, 1)
      const p = new Vector3()
      for (let c = 0; c < 4; c++) {
        mat.compose(p.set((c % 2 ? 1 : -1) * (W / 2 - R), (c < 2 ? 1 : -1) * (H / 2 - R), -DEPTH / 2), q, one)
        corners.current.setMatrixAt(c, mat)
      }
      corners.current.instanceMatrix.needsUpdate = true
    }
    // Theme DOM đổi đúng khung hình → mặt màn hình đổi màu cùng lúc: hai lớp luôn trùng màu
    const theme = useTheme.getState().theme
    screenMat.color.set(SCREEN_BG[theme])
    lipMat.color.set(SCREEN_LIP[theme])
    if (halo.current) halo.current.material.opacity = 0.15 + 0.5 * (1 - env.env)
  })

  const neckH = SCREEN_Y - SCREEN_H / 2 + 0.02
  const standZ = MONITOR_Z - 0.03
  return (
    <>
      <group ref={head} rotation-x={-CAMERA.pitch}>
        <mesh ref={hBar} position-z={-DEPTH / 2} material={m.graphiteGloss} castShadow>
          <boxGeometry args={[1, 1, DEPTH]} />
        </mesh>
        <mesh ref={vBar} position-z={-DEPTH / 2} material={m.graphiteGloss}>
          <boxGeometry args={[1, 1, DEPTH]} />
        </mesh>
        <instancedMesh ref={corners} args={[parts.corner, m.graphiteGloss, 4]} />
        {/* Camera: ống kính kính đen, đèn báo nhỏ */}
        <group ref={cam}>
          <mesh rotation-x={Math.PI / 2} material={m.glass}>
            <cylinderGeometry args={[0.0034, 0.0034, 0.001, 16]} />
          </mesh>
          <mesh position-x={0.008} material={m.ledCyan}>
            <boxGeometry args={[0.0014, 0.0014, 0.0012]} />
          </mesh>
        </group>
        {/* Đèn nguồn cyan */}
        <group ref={led}>
          <mesh material={m.ledCyan}>
            <boxGeometry args={[0.009, 0.0016, 0.0012]} />
          </mesh>
          <sprite ref={halo} position-z={0.003} scale={[0.03, 0.03, 1]}>
            <spriteMaterial map={haloTexture()} color="#5fe6ff" blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} fog={false} />
          </sprite>
        </group>
        <mesh ref={lip} position-z={0.0003} material={lipMat} renderOrder={VIGNETTE_ORDER + 1}>
          <planeGeometry />
        </mesh>
        <mesh ref={screen} position-z={0.0006} material={screenMat} renderOrder={VIGNETTE_ORDER + 1}>
          <planeGeometry />
        </mesh>
      </group>
      {/* Chân nhôm: tấm đứng nghiêng nhẹ, đế phẳng mỏng */}
      <mesh geometry={roundedBox(0.056, neckH + 0.02, 0.012, 0.004, 2)} position={[0, neckH / 2, standZ]} rotation-x={-0.08} material={m.aluminium} castShadow />
      <mesh geometry={roundedBox(0.23, 0.007, 0.14, 0.0034, 2)} position={[0, 0.0035, MONITOR_Z - 0.03]} material={m.aluminium} receiveShadow />
      <mesh geometry={parts.cord} material={m.rubber} />
      <mesh position={[0, 0.0012, MONITOR_Z - 0.02]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.36, 0.22]} />
        <meshBasicMaterial map={blobTexture()} transparent depthWrite={false} opacity={0.8} />
      </mesh>
    </>
  )
}
