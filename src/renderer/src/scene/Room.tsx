// Căn phòng: tường bê tông đúc sẵn nứt, loang vệt nước; cửa sổ khung thép hiện đại, ô kính nứt, ô vỡ — nhìn ra thành phố
// đổ nát trong sương bụi (bật đèn: chạng vạng, chân trời còn ấm, mặt trời nhạt sau khói; tắt đèn: trăng, sao, vài ánh
// đèn của người sống sót), vệt nắng chiều nhạt lọt qua ô vỡ, dấu sơn xịt của đội cứu hộ và hình vẽ sơn dạ quang phát
// sáng khi mất điện, bàn gỗ óc chó sẫm.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  type Group,
  type Mesh
} from 'three'
import { env } from './envState'
import { merged, roundedBox } from './geometry'
import { BEZEL } from './math/layout'
import { materials } from './materials'
import { pair } from './palette3d'
import { stage } from './stage'
import { beamTexture, concreteTexture, crackedPaneTexture, deskTexture, markingsGlowTexture, markingsTexture } from './textures'

const WALL_Z = -0.36
const wallTint = pair('wallTint')
const deskTint = pair('deskTint')

/** Thành phố đổ nát ngoài cửa sổ: tính hết trong shader (1 lần vẽ, không cần ảnh, không chuyển động) */
const CITY_FRAG = /* glsl */ `
  uniform float uNight;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  // Toà nhà đổ nát: đỉnh gãy lởm chởm hoặc cắt xiên, có toà chỉ còn trơ khung cột
  float ruins(vec2 uv, float k, float base, float amp, float seed, out float skeleton) {
    float id = floor(uv.x * k);
    float f = fract(uv.x * k);
    float h = base + amp * hash(id * 1.37 + seed);
    float kind = hash(id * 3.1 + seed);
    float top = h;
    if (kind > 0.7) top = h - 0.12 * f;
    else if (kind > 0.4) top = h - 0.05 * abs(sin(f * 9.0 + id)) - 0.03 * step(0.5, f);
    top -= 0.02 * noise(vec2(uv.x * 90.0, seed));
    float gap = step(0.06, f) * step(f, 0.94);
    float body = step(uv.y, top) * gap;
    // Phần trên của toà "khung trơ": chỉ còn vài cột mảnh
    skeleton = 0.0;
    if (kind < 0.18 && uv.y > top - 0.1) {
      float col = step(0.8, fract(f * 5.0));
      skeleton = body * col;
      body *= col;
    }
    return body;
  }
  void main() {
    vec2 uv = vUv;
    float n = uNight;
    // Trời: chạng vạng ấm ở chân trời, lạnh dần lên cao / đêm xanh đen
    vec3 duskLow = vec3(0.62, 0.52, 0.45), duskTop = vec3(0.13, 0.15, 0.2);
    vec3 nightLow = vec3(0.05, 0.055, 0.07), nightTop = vec3(0.012, 0.015, 0.025);
    vec3 col = mix(mix(duskLow, duskTop, smoothstep(0.05, 0.9, uv.y)), mix(nightLow, nightTop, smoothstep(0.0, 0.7, uv.y)), n);
    // Mặt trời nhạt sau lớp khói / trăng lạnh (đặt ở chỗ ô kính vỡ, nhìn thấy được)
    float dSun = distance(uv, vec2(0.7, 0.36));
    col += (1.0 - n) * vec3(0.3, 0.24, 0.18) * smoothstep(0.45, 0.0, dSun);
    col = mix(col, vec3(0.97, 0.9, 0.8), (1.0 - n) * smoothstep(0.06, 0.048, dSun));
    float dMoon = distance(uv, vec2(0.62, 0.28));
    col += n * vec3(0.3, 0.33, 0.4) * 0.3 * smoothstep(0.3, 0.0, dMoon);
    col = mix(col, vec3(0.8, 0.82, 0.86), n * smoothstep(0.05, 0.04, dMoon));
    col += n * step(0.992, hash2(floor(uv * vec2(110.0, 90.0)))) * smoothstep(0.5, 0.9, uv.y) * 0.5;
    // Khói bốc lên từ các đám cháy, trôi sang phải
    float smoke = 0.0;
    for (int i = 0; i < 3; i++) {
      float x0 = 0.18 + 0.33 * float(i);
      float y = uv.y - 0.08;
      float dx = uv.x - x0 - 0.18 * y * y - 0.06 * (fbm(vec2(uv.y * 6.0, float(i) * 7.0)) - 0.5);
      float w = 0.015 + 0.2 * max(y, 0.0);
      smoke += smoothstep(w, 0.0, abs(dx)) * smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.55, 1.0, uv.y)) * fbm(vec2(uv.x * 7.0, uv.y * 5.0 - float(i)));
    }
    col = mix(col, mix(vec3(0.2, 0.2, 0.22), vec3(0.03, 0.03, 0.04), n), clamp(smoke * 1.3, 0.0, 0.85));
    // Toà xa mờ trong bụi, toà gần tối, sàn trơ ra thành vệt ngang, ô cửa trống
    float sk;
    float far = ruins(uv, 13.0, 0.26, 0.2, 3.0, sk);
    col = mix(col, mix(vec3(0.36, 0.35, 0.38), vec3(0.04, 0.045, 0.055), n), far * 0.85);
    float nearB = ruins(uv, 6.0, 0.12, 0.3, 11.0, sk);
    vec3 nearCol = mix(vec3(0.08, 0.085, 0.1), vec3(0.01, 0.012, 0.016), n);
    vec2 wg = vec2(uv.x * 58.0, uv.y * 40.0);
    float holes = step(0.35, fract(wg.x)) * step(fract(wg.x), 0.75) * step(0.35, fract(wg.y)) * step(fract(wg.y), 0.8);
    nearCol *= 1.0 - 0.35 * holes * (1.0 - sk);
    nearCol += 0.03 * (1.0 - n) * step(0.9, fract(uv.y * 40.0)) * (1.0 - sk);
    col = mix(col, nearCol, nearB);
    // Vài ô cửa còn ánh đèn của người sống sót (rõ hơn khi trời tối)
    float lit = step(0.975, hash2(floor(wg) + 3.0)) * holes * nearB * (1.0 - sk);
    col = mix(col, vec3(1.0, 0.84, 0.62), lit * mix(0.35, 0.9, n));
    // Vài đám cháy nhỏ âm ỉ sát chân trời (điểm ấm duy nhất, rất nhỏ)
    for (int i = 0; i < 3; i++) {
      vec2 p = vec2(0.18 + 0.33 * float(i), 0.06);
      float d = length((uv - p) * vec2(1.0, 1.8));
      col += vec3(1.0, 0.45, 0.2) * (0.06 + 0.22 * n) * smoothstep(0.08, 0.0, d) * (0.6 + 0.4 * fbm(uv * 30.0));
    }
    // Sương bụi sát mặt đất
    col = mix(col, mix(vec3(0.5, 0.46, 0.43), vec3(0.05, 0.06, 0.08), n), 0.35 * smoothstep(0.3, 0.0, uv.y));
    gl_FragColor = vec4(col, 1.0);
  }
`
const PLAIN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const W = 0.4
const H = 0.34
/** Đố ngang chia cửa sổ thành 4 ô */
const MID_Y = 0.02

/** Mảnh kính vỡ còn dính ở góc ô dưới bên phải (ô đã vỡ hẳn) — tam giác, toạ độ trong khung cửa sổ */
function shardGeometry(): BufferGeometry {
  const tris = [
    [W / 2 - 0.01, -H / 2 + 0.01, W / 2 - 0.09, -H / 2 + 0.01, W / 2 - 0.01, -H / 2 + 0.12],
    [0.012, MID_Y - 0.006, 0.09, MID_Y - 0.006, 0.03, MID_Y - 0.1],
    [0.012, -H / 2 + 0.01, 0.06, -H / 2 + 0.01, 0.012, -H / 2 + 0.05]
  ]
  const pos: number[] = []
  for (const t of tris) for (let i = 0; i < 3; i++) pos.push(t[i * 2], t[i * 2 + 1], 0.004)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function Window(): React.JSX.Element {
  const group = useRef<Group>(null)
  const city = useMemo(() => new ShaderMaterial({ uniforms: { uNight: { value: 0 } }, vertexShader: PLAIN_VERT, fragmentShader: CITY_FRAG }), [])
  const glassMat = useMemo(
    () => new MeshStandardMaterial({ color: '#a9bfd0', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.3, depthWrite: false, side: DoubleSide }),
    []
  )
  // Ô kính nứt còn trên khung: lớp kính bụi + vết rạn
  const paneMat = useMemo(
    () => new MeshStandardMaterial({ map: crackedPaneTexture(), transparent: true, roughness: 0.1, metalness: 0.2, depthWrite: false }),
    []
  )
  const shards = useMemo(shardGeometry, [])
  const m = materials()
  const { frame, panes } = useMemo(() => {
    const T = 0.018
    const bar = (w: number, h: number): BoxGeometry => new BoxGeometry(w, h, 0.03)
    return {
      // Khung thép sơn graphite: 4 cạnh + đố đứng + đố ngang — gộp một lần vẽ
      frame: merged('window-frame', [
        { geo: bar(W + T, T), at: [0, H / 2, 0.015] },
        { geo: bar(W + T, T), at: [0, -H / 2, 0.015] },
        { geo: bar(T, H + T), at: [-W / 2, 0, 0.015] },
        { geo: bar(T, H + T), at: [W / 2, 0, 0.015] },
        { geo: bar(T * 0.55, H), at: [0, 0, 0.015] },
        { geo: bar(W, T * 0.55), at: [0, MID_Y, 0.015] }
      ]),
      // Ba ô còn kính (nứt); ô dưới bên phải đã vỡ hẳn
      panes: merged('window-panes', [
        { geo: new PlaneGeometry(W / 2, H / 2 - MID_Y), at: [-W / 4, (H / 2 + MID_Y) / 2, 0.012] },
        { geo: new PlaneGeometry(W / 2, H / 2 - MID_Y), at: [W / 4, (H / 2 + MID_Y) / 2, 0.012], uv: [-1, 1, 1, 0] },
        { geo: new PlaneGeometry(W / 2, H / 2 + MID_Y), at: [-W / 4, (MID_Y - H / 2) / 2, 0.012], uv: [1, -1, 0, 1] }
      ])
    }
  }, [])
  useFrame(() => {
    city.uniforms.uNight.value = 1 - env.env
    // Cửa sổ trên tường bên trái, sau lưng robot — ló ra sau mép màn hình
    group.current?.position.set(-(stage.layout.screenW / 2 + BEZEL + 0.2), 0.46, WALL_Z + 0.004)
  })
  return (
    <group ref={group}>
      <mesh material={city}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh geometry={panes} material={paneMat} />
      <mesh geometry={shards} material={glassMat} />
      <mesh geometry={frame} material={m.graphite} />
    </group>
  )
}

export function Room(): React.JSX.Element {
  const wallMat = useMemo(() => {
    const map = concreteTexture()
    map.repeat.set(8, 3)
    return new MeshStandardMaterial({ map, roughness: 0.95 })
  }, [])
  const deskMat = useMemo(() => {
    const map = deskTexture()
    map.repeat.set(4, 1)
    return new MeshStandardMaterial({ map, roughness: 0.5 })
  }, [])
  // Dấu sơn xịt: chịu ánh sáng như sơn thường; phần sơn dạ quang tự sáng khi mất điện
  const markMat = useMemo(
    () =>
      new MeshStandardMaterial({
        map: markingsTexture(),
        emissiveMap: markingsGlowTexture(),
        emissive: new Color('#ffffff'),
        emissiveIntensity: 0,
        transparent: true,
        depthWrite: false,
        roughness: 0.9
      }),
    []
  )
  const beamMat = useMemo(() => new MeshBasicMaterial({ map: beamTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }), [])
  const marks = useRef<Mesh>(null)
  const beam = useRef<Mesh>(null)
  useFrame(() => {
    const t = env.env
    const l = stage.layout
    wallTint.apply(wallMat.color, t)
    deskTint.apply(deskMat.color, t)
    markMat.emissiveIntensity = 2 * Math.max(0, 1 - t * 1.4)
    marks.current?.position.set(l.screenW / 2 + 0.2, 0.44, WALL_Z + 0.003)
    // Vệt nắng qua ô kính vỡ: chỉ lúc còn ánh trời
    beamMat.opacity = t * 0.5
    beam.current?.position.set(-(l.screenW / 2 + 0.13), 0.3, -0.17)
  })
  return (
    <>
      <mesh position={[0, 0.6, WALL_Z]} material={wallMat}>
        <planeGeometry args={[8, 3]} />
      </mesh>
      <Window />
      <mesh ref={marks} material={markMat}>
        <planeGeometry args={[0.5, 0.25]} />
      </mesh>
      <mesh ref={beam} material={beamMat} rotation={[0.25, 0.45, 0.95]}>
        <planeGeometry args={[0.26, 0.95]} />
      </mesh>
      {/* Mặt bàn gỗ óc chó, nẹp nhôm ở cạnh trước */}
      <mesh geometry={roundedBox(4, 0.05, 0.92, 0.006, 2)} position={[0, -0.025, 0.05]} material={deskMat} receiveShadow />
      <mesh position={[0, -0.012, 0.512]} material={materials().aluminium}>
        <boxGeometry args={[4, 0.026, 0.008]} />
      </mesh>
    </>
  )
}
