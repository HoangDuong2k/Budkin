// Vật liệu dùng chung (ít chương trình shader hơn): đồng thau, sắt đen, men xanh ngọc, ngà, kính xanh, đồng đỏ, pha lê.
// Kim loại phản chiếu môi trường (scene.environment) — không có môi trường thì kim loại trông đen.
import { Color, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { paintTexture } from './textures'

let mats: ReturnType<typeof create> | null = null

function create() {
  const paint = paintTexture()
  return {
    brass: new MeshStandardMaterial({ color: '#a37636', metalness: 0.9, roughness: 0.32, map: paint }),
    brassDark: new MeshStandardMaterial({ color: '#6e4d22', metalness: 0.85, roughness: 0.4 }),
    copper: new MeshStandardMaterial({ color: '#a4582f', metalness: 0.85, roughness: 0.34, map: paint }),
    iron: new MeshStandardMaterial({ color: '#2c3136', metalness: 0.55, roughness: 0.5, map: paint }),
    teal: new MeshStandardMaterial({ color: '#2b6f69', metalness: 0.25, roughness: 0.45, map: paint }),
    ivory: new MeshStandardMaterial({ color: '#efe1c1', metalness: 0, roughness: 0.55 }),
    glass: new MeshStandardMaterial({ color: '#0f1a22', metalness: 0.3, roughness: 0.15 }),
    greenGlass: new MeshStandardMaterial({ color: '#1f6a4b', metalness: 0.2, roughness: 0.22, map: paint }),
    leaf: new MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.8, flatShading: true }),
    leafLight: new MeshStandardMaterial({ color: '#5c9a45', roughness: 0.8, flatShading: true }),
    /** Pha lê năng lượng xanh — tự phát sáng (không chịu ánh sáng, không tone mapping) */
    crystal: new MeshBasicMaterial({ color: new Color('#5fe3ff'), toneMapped: false }),
    amber: new MeshBasicMaterial({ color: '#ffb35c', toneMapped: false })
  }
}

export function materials(): ReturnType<typeof create> {
  mats ??= create()
  return mats
}
