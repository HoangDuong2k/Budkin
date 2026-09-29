// Căn phòng: tường giấy dán art deco, cửa sổ nhìn ra thành phố (ngày: tháp vàng, khinh khí cầu; đêm: cửa sổ
// neon, khói xanh độc), graffiti phát sáng khi tắt đèn, vệt nắng xuyên cửa sổ, bàn gỗ gụ viền đồng thau.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, ShaderMaterial, type Group, type Mesh } from 'three'
import { env } from './envState'
import { roundedBox } from './geometry'
import { BEZEL } from './math/layout'
import { materials } from './materials'
import { pair } from './palette3d'
import { stage } from './stage'
import { beamTexture, graffitiTexture, wallpaperTexture, woodTexture } from './textures'

const WALL_Z = -0.36
const wallTint = pair('wallTint')
const deskTint = pair('deskTint')
const frameColor = pair('frame')

/** Thành phố ngoài cửa sổ: tính hết trong shader (1 lần vẽ, không cần ảnh) */
const CITY_FRAG = /* glsl */ `
  uniform float uNight;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // Tháp: cao theo hash, đỉnh vót nhọn hoặc mái vòm
  float towers(vec2 uv, float k, float base, float amp, float seed) {
    float id = floor(uv.x * k);
    float f = fract(uv.x * k);
    float h = base + amp * hash(id * 1.37 + seed);
    float kind = hash(id * 3.1 + seed);
    float top = h;
    if (kind > 0.66) top = h + 0.08 * max(0.0, 1.0 - abs(f - 0.5) * 6.0);
    else if (kind > 0.33) top = h + 0.035 * sqrt(max(0.0, 1.0 - pow((f - 0.5) * 2.6, 2.0)));
    float gap = step(0.08, f) * step(f, 0.92);
    return step(uv.y, top) * gap;
  }
  void main() {
    vec2 uv = vUv;
    vec3 dayTop = vec3(0.44, 0.68, 0.74), dayLow = vec3(0.99, 0.79, 0.5);
    vec3 nightTop = vec3(0.06, 0.03, 0.13), nightLow = vec3(0.32, 0.1, 0.33);
    vec3 day = mix(dayLow, dayTop, smoothstep(0.05, 0.95, uv.y));
    vec3 night = mix(nightLow, nightTop, smoothstep(0.0, 0.8, uv.y));
    vec3 col = mix(day, night, uNight);
    // Nắng chiều sau các tháp
    col += (1.0 - uNight) * vec3(1.0, 0.72, 0.38) * 0.45 * smoothstep(0.45, 0.0, distance(uv, vec2(0.72, 0.36)));
    // Sao đêm
    float st = step(0.985, hash2(floor(uv * vec2(90.0, 70.0)))) * smoothstep(0.45, 0.9, uv.y);
    col += st * uNight * 0.8;
    // Khinh khí cầu
    vec2 d = (uv - vec2(0.3, 0.78)) / vec2(0.13, 0.045);
    float ship = step(dot(d, d), 1.0);
    float gondola = step(abs(uv.x - 0.3), 0.03) * step(abs(uv.y - 0.72), 0.012);
    vec3 shipCol = mix(vec3(0.42, 0.33, 0.28), vec3(0.08, 0.05, 0.1), uNight);
    col = mix(col, shipCol, max(ship, gondola));
    col += uNight * vec3(1.0, 0.3, 0.6) * step(dot(d - vec2(0.55, -0.2), d - vec2(0.55, -0.2)), 0.02);
    // Tháp xa (mờ trong sương) và tháp gần (có cửa sổ sáng)
    float far = towers(uv, 11.0, 0.3, 0.22, 3.0);
    col = mix(col, mix(vec3(0.62, 0.72, 0.7), vec3(0.14, 0.08, 0.2), uNight), far * 0.85);
    float nearT = towers(uv, 6.0, 0.14, 0.26, 11.0);
    vec3 nearCol = mix(vec3(0.24, 0.35, 0.36), vec3(0.03, 0.04, 0.07), uNight);
    col = mix(col, nearCol, nearT);
    vec2 wg = vec2(uv.x * 60.0, uv.y * 44.0);
    float win = step(0.62, hash2(floor(wg))) * step(0.3, fract(wg.x)) * step(fract(wg.x), 0.7) * step(0.3, fract(wg.y)) * step(fract(wg.y), 0.7);
    float pick = hash2(floor(wg) + 7.0);
    vec3 neon = pick < 0.33 ? vec3(1.0, 0.31, 0.64) : pick < 0.66 ? vec3(0.27, 0.89, 1.0) : vec3(0.49, 1.0, 0.62);
    vec3 winCol = mix(vec3(1.0, 0.85, 0.5) * 0.55, neon, uNight);
    col = mix(col, winCol, win * nearT * mix(0.35, 1.0, uNight));
    // Khói xanh độc + tím sát mặt đất ban đêm
    col += uNight * (vec3(0.18, 0.95, 0.55) * 0.22 * smoothstep(0.22, 0.0, uv.y) + vec3(0.6, 0.2, 0.7) * 0.12 * smoothstep(0.5, 0.1, uv.y));
    gl_FragColor = vec4(col, 1.0);
  }
`
const PLAIN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

function Window(): React.JSX.Element {
  const group = useRef<Group>(null)
  const city = useMemo(() => new ShaderMaterial({ uniforms: { uNight: { value: 0 } }, vertexShader: PLAIN_VERT, fragmentShader: CITY_FRAG }), [])
  const frameMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.6, map: woodTexture() }), [])
  const W = 0.4
  const H = 0.34
  const T = 0.018
  useFrame(() => {
    city.uniforms.uNight.value = 1 - env.env
    frameColor.apply(frameMat.color, env.env)
    // Cửa sổ trên tường bên trái, phía sau robot (lộ ra ở khoảng trống bên trái màn hình)
    group.current?.position.set(-(stage.layout.screenW / 2 + BEZEL + 0.32), 0.55, WALL_Z + 0.004)
  })
  const brass = materials().brass
  return (
    <group ref={group}>
      <mesh material={city}>
        <planeGeometry args={[W, H]} />
      </mesh>
      {[
        [0, H / 2, W + T, T],
        [0, -H / 2, W + T, T],
        [-W / 2, 0, T, H + T],
        [W / 2, 0, T, H + T],
        [0, 0, T * 0.55, H]
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.008]} material={frameMat}>
          <boxGeometry args={[w, h, 0.016]} />
        </mesh>
      ))}
      {/* Vòm art deco trên đỉnh cửa sổ + bậu đồng thau */}
      <mesh position={[0, H / 2 + T / 2, 0.01]} rotation-x={Math.PI / 2} material={brass}>
        <cylinderGeometry args={[W / 2 + T / 2, W / 2 + T / 2, 0.012, 32, 1, false, -Math.PI / 2, Math.PI]} />
      </mesh>
      <mesh position={[0, -H / 2 - T, 0.022]} material={brass}>
        <boxGeometry args={[W + 0.06, 0.012, 0.04]} />
      </mesh>
    </group>
  )
}

export function Room(): React.JSX.Element {
  const wallMat = useMemo(() => {
    const map = wallpaperTexture()
    map.repeat.set(24, 9)
    return new MeshStandardMaterial({ map, roughness: 0.92 })
  }, [])
  const deskMat = useMemo(() => {
    const map = woodTexture()
    map.repeat.set(5, 1.2)
    return new MeshStandardMaterial({ map, roughness: 0.55 })
  }, [])
  const graffitiMat = useMemo(() => new MeshBasicMaterial({ map: graffitiTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), [])
  const beamMat = useMemo(() => new MeshBasicMaterial({ map: beamTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }), [])
  const graffiti = useRef<Mesh>(null)
  const beam = useRef<Mesh>(null)
  useFrame(() => {
    const t = env.env
    const l = stage.layout
    wallTint.apply(wallMat.color, t)
    deskTint.apply(deskMat.color, t)
    // Sơn phát quang: chỉ thấy khi phòng tối
    graffitiMat.opacity = Math.max(0, 1 - t * 1.6)
    graffiti.current?.position.set(l.screenW / 2 + 0.34, 0.5, WALL_Z + 0.003)
    // Vệt nắng: chỉ ban ngày
    beamMat.opacity = t * 0.55
    beam.current?.position.set(-(l.screenW / 2 + 0.12), 0.3, -0.16)
  })
  return (
    <>
      <mesh position={[0, 0.6, WALL_Z]} material={wallMat}>
        <planeGeometry args={[8, 3]} />
      </mesh>
      <Window />
      <mesh ref={graffiti} material={graffitiMat}>
        <planeGeometry args={[0.5, 0.25]} />
      </mesh>
      <mesh ref={beam} material={beamMat} rotation={[0.25, 0.45, 0.95]}>
        <planeGeometry args={[0.22, 0.95]} />
      </mesh>
      {/* Mặt bàn gỗ gụ, nẹp đồng thau ở cạnh trước */}
      <mesh geometry={roundedBox(4, 0.05, 0.92, 0.012, 3)} position={[0, -0.025, 0.05]} material={deskMat} receiveShadow />
      <mesh position={[0, -0.01, 0.512]} material={materials().brass}>
        <boxGeometry args={[4, 0.012, 0.01]} />
      </mesh>
    </>
  )
}
