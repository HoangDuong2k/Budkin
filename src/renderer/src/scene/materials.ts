// Vật liệu dùng chung (ít chương trình shader hơn) — thiết bị hiện đại giữa thế giới đổ nát: nhựa graphite mờ,
// graphite bóng, nhôm xước tóc, vỏ gốm trắng ngà, nhôm anod xanh ngọc, cao su, kính đen, đèn LED tự phát sáng.
// Bề mặt phủ lớp bụi rất nhẹ. Kim loại phản chiếu môi trường (scene.environment) — không có môi trường thì kim loại trông đen.
import { MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { brushedTexture, dustTexture } from './textures'

let mats: ReturnType<typeof create> | null = null

function create() {
  const dust = dustTexture()
  const brushed = brushedTexture()
  return {
    /** Nhựa / kim loại sơn graphite mờ */
    graphite: new MeshStandardMaterial({ color: '#303235', metalness: 0.3, roughness: 0.5, map: dust }),
    /** Graphite bóng (viền màn hình, máy tính bảng, chuột) */
    graphiteGloss: new MeshStandardMaterial({ color: '#17181a', metalness: 0.25, roughness: 0.28, map: dust }),
    aluminium: new MeshStandardMaterial({ color: '#afb1b4', metalness: 0.9, roughness: 0.34, map: brushed }),
    /** Vỏ gốm trắng ngà của robot */
    shell: new MeshStandardMaterial({ color: '#d2cec7', metalness: 0.08, roughness: 0.4, map: dust }),
    /** Nhôm anod xanh ngọc — điểm nhấn nhỏ */
    anodized: new MeshStandardMaterial({ color: '#2c9e97', metalness: 0.7, roughness: 0.34 }),
    /** Nhôm anod hổ phách — sọc trên thân Rover */
    amber: new MeshStandardMaterial({ color: '#c38a3c', metalness: 0.65, roughness: 0.36 }),
    rubber: new MeshStandardMaterial({ color: '#161718', roughness: 0.9 }),
    glass: new MeshStandardMaterial({ color: '#060708', metalness: 0.25, roughness: 0.08 }),
    leaf: new MeshStandardMaterial({ color: '#5a9a58', roughness: 0.7, flatShading: true }),
    /** Đèn LED xanh ngọc (tự phát sáng, không chịu ánh sáng, không tone mapping) */
    led: new MeshBasicMaterial({ color: '#56e0d6', toneMapped: false })
  }
}

export function materials(): ReturnType<typeof create> {
  mats ??= create()
  return mats
}
