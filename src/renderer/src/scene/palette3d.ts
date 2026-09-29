// Màu và ánh sáng của cảnh cho hai theme (cảm hứng tranh hoạt hình vẽ tay steampunk):
// ngày = thành phố vàng — nắng ấm qua cửa sổ, ánh viền xanh ngọc, sương vàng nhạt;
// đêm = khu phố ngầm — trời tím, neon hồng hắt vào từ cửa sổ, ánh viền xanh độc, khói tím.
// Cảnh trộn giữa hai bộ theo env (0 tối … 1 sáng).
import { Color } from 'three'

export interface ScenePalette {
  /** Nhân với giấy dán tường / vân gỗ — ban đêm tối và ngả tím */
  wallTint: string
  deskTint: string
  frame: string
  hemiSky: string
  hemiGround: string
  hemi: number
  /** Nắng (ngày) / ánh neon lạnh (đêm) qua cửa sổ */
  sun: string
  sunI: number
  /** Ánh viền phía sau — tạo đường sáng quanh mép vật như tranh vẽ */
  rim: string
  rimI: number
  /** Đèn neon hồng từ phố bên ngoài (chỉ ban đêm) */
  neonI: number
  /** Ánh màn hình hắt ra (ban đêm) */
  glowI: number
  fog: string
  fogD: number
  /** Độ phản chiếu môi trường (kim loại đồng thau) */
  envI: number
}

export const SCENE: { light: ScenePalette; dark: ScenePalette } = {
  light: {
    wallTint: '#ffffff',
    deskTint: '#ffffff',
    frame: '#5a3322',
    hemiSky: '#ffe3bd',
    hemiGround: '#4a2f22',
    hemi: 1.15,
    sun: '#ffc27a',
    sunI: 2.3,
    rim: '#8fdcff',
    rimI: 1.0,
    neonI: 0,
    glowI: 0,
    fog: '#58705f',
    fogD: 0.14,
    envI: 0.6
  },
  dark: {
    wallTint: '#4f5270',
    deskTint: '#5d4841',
    frame: '#24160f',
    hemiSky: '#5b3a8a',
    hemiGround: '#081210',
    hemi: 0.5,
    sun: '#5ee6ff',
    sunI: 0.4,
    rim: '#5cffc8',
    rimI: 0.55,
    neonI: 1,
    glowI: 1,
    fog: '#1b1030',
    fogD: 0.24,
    envI: 0.12
  }
}

type ColorKey = 'wallTint' | 'deskTint' | 'frame' | 'hemiSky' | 'hemiGround' | 'sun' | 'rim' | 'fog'
type NumberKey = 'hemi' | 'sunI' | 'rimI' | 'neonI' | 'glowI' | 'fogD' | 'envI'

/** Màu trộn giữa hai theme, dùng lại đối tượng Color (không cấp phát mỗi khung) */
export class ColorPair {
  private readonly a: Color
  private readonly b: Color
  constructor(dark: string, light: string) {
    this.a = new Color(dark)
    this.b = new Color(light)
  }
  apply(target: Color, t: number): Color {
    return target.lerpColors(this.a, this.b, t)
  }
}

export function pair(key: ColorKey): ColorPair {
  return new ColorPair(SCENE.dark[key], SCENE.light[key])
}

export function mix(key: NumberKey, t: number): number {
  return SCENE.dark[key] + (SCENE.light[key] - SCENE.dark[key]) * t
}

/** Robot: mắt và lõi pha lê năng lượng xanh, má hổ phách, đèn báo động đỏ cam */
export const ROBOT = {
  eye: '#5fe8ff',
  cheek: '#ffb35c',
  led: '#5fe3ff',
  alert: '#ff5a36'
}

export const LAMP = {
  inside: '#fff1cf',
  bulb: '#fff2d0',
  light: '#ffd28f'
}
