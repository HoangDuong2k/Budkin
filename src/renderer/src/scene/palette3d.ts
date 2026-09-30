// Màu và ánh sáng của cảnh cho hai theme — thế giới hiện đại hậu tận thế, tông tối, trung tính hơi lạnh:
// bật đèn = chạng vạng: trời ấm ở chân trời, lạnh dần lên cao; vũng sáng trắng ấm của đèn LED trên bàn gỗ sẫm;
// tắt đèn = mất điện ban đêm: gần như tối hẳn, ánh trăng xanh xám, màn hình và bàn phím hắt ánh xanh ngọc.
// Cảnh trộn giữa hai bộ theo env (0 tối … 1 sáng).
import { Color } from 'three'

export interface ScenePalette {
  /** Nhân với texture bê tông / gỗ bàn — ban đêm tối và ngả xanh xám */
  wallTint: string
  deskTint: string
  hemiSky: string
  hemiGround: string
  hemi: number
  /** Ánh chạng vạng (bật đèn) / ánh trăng (tắt đèn) qua cửa sổ vỡ */
  sun: string
  sunI: number
  /** Ánh viền phía sau — tách vật khỏi nền tối */
  rim: string
  rimI: number
  /** Đèn dự phòng xanh ngọc mờ (chỉ khi mất điện) */
  backupI: number
  /** Ánh màn hình hắt ra */
  glow: string
  glowI: number
  fog: string
  fogD: number
  /** Độ phản chiếu môi trường (kim loại, kính) */
  envI: number
}

export const SCENE: { light: ScenePalette; dark: ScenePalette } = {
  light: {
    wallTint: '#ffffff',
    deskTint: '#ffffff',
    hemiSky: '#a39d95',
    hemiGround: '#131210',
    hemi: 0.6,
    sun: '#dccab2',
    sunI: 0.95,
    rim: '#8aa6bd',
    rimI: 0.45,
    backupI: 0,
    glow: '#c4efe9',
    glowI: 0.3,
    fog: '#232427',
    fogD: 0.2,
    envI: 0.4
  },
  dark: {
    wallTint: '#565c66',
    deskTint: '#5a5e66',
    hemiSky: '#1e2530',
    hemiGround: '#040405',
    hemi: 0.3,
    sun: '#8d9cb5',
    sunI: 0.36,
    rim: '#556f8c',
    rimI: 0.3,
    backupI: 1,
    glow: '#5fe0d6',
    glowI: 1,
    fog: '#0a0c0f',
    fogD: 0.26,
    envI: 0.1
  }
}

type ColorKey = 'wallTint' | 'deskTint' | 'hemiSky' | 'hemiGround' | 'sun' | 'rim' | 'glow' | 'fog'
type NumberKey = 'hemi' | 'sunI' | 'rimI' | 'backupI' | 'glowI' | 'fogD' | 'envI'

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

/** Robot: mắt, đèn trạng thái xanh ngọc; báo động đỏ */
export const ROBOT = {
  eye: '#5ae3d8',
  led: '#5ae3d8',
  alert: '#ff4b4b'
}

/** Màu mắt riêng của từng robot (đèn trạng thái đều xanh ngọc, báo động đều đỏ) */
export const ROBOT_EYES = {
  orbi: '#5ae3d8',
  /** Rover: đèn hổ phách như thiết bị ngoài hiện trường */
  rover: '#ffb65c',
  /** Miu: xanh bạc hà như mắt mèo trong đêm */
  miu: '#8cf2c4',
  /** Mech: dải đèn trắng ấm */
  mech: '#ffe4bd'
}

/** Đèn LED làm việc: ánh sáng trắng ấm */
export const LAMP = {
  panel: '#fff5e8',
  light: '#ffe3c2'
}

/** Mép trong viền màn hình, hắt sáng từ màn hình — khác hẳn màu nền màn hình để nhìn ra mép */
export const SCREEN_LIP = { light: '#2b2e33', dark: '#171b1e' }
