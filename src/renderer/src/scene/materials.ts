// Vật liệu dùng chung (ít chương trình shader hơn) — thiết bị hiện đại giữa thế giới đổ nát, tông lạnh: nhựa graphite
// mờ, graphite bóng, nhôm xước tóc, vỏ gốm xám lạnh, nhôm anod xanh cyan, cao su, kính đen, đèn LED tự phát sáng.
// Bề mặt phủ lớp bụi rất nhẹ. Kim loại phản chiếu môi trường (scene.environment) — không có môi trường thì kim loại trông đen.
import { MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { brushedTexture, dustTexture } from './textures'

let mats: ReturnType<typeof create> | null = null

function create() {
  const dust = dustTexture()
  const brushed = brushedTexture()
  return {
    /** Nhựa / kim loại sơn graphite mờ */
    graphite: new MeshStandardMaterial({ color: '#2c323a', metalness: 0.3, roughness: 0.5, map: dust }),
    /** Graphite bóng (viền màn hình, máy tính bảng, chuột) */
    graphiteGloss: new MeshStandardMaterial({ color: '#15191e', metalness: 0.25, roughness: 0.28, map: dust }),
    aluminium: new MeshStandardMaterial({ color: '#a6b0bb', metalness: 0.9, roughness: 0.34, map: brushed }),
    /** Vỏ gốm xám lạnh của robot */
    shell: new MeshStandardMaterial({ color: '#c3ccd6', metalness: 0.08, roughness: 0.4, map: dust }),
    /** Nhôm anod xanh cyan — điểm nhấn nhỏ */
    anodized: new MeshStandardMaterial({ color: '#2ba3b8', metalness: 0.7, roughness: 0.34 }),
    rubber: new MeshStandardMaterial({ color: '#14171b', roughness: 0.9 }),
    glass: new MeshStandardMaterial({ color: '#05080b', metalness: 0.25, roughness: 0.08 }),
    leaf: new MeshStandardMaterial({ color: '#4f9a62', roughness: 0.7, flatShading: true }),
    /** Đèn LED (tự phát sáng, không chịu ánh sáng, không tone mapping) */
    ledCyan: new MeshBasicMaterial({ color: '#5fe6ff', toneMapped: false })
  }
}

export function materials(): ReturnType<typeof create> {
  mats ??= create()
  return mats
}
