// Màu và ánh sáng của cảnh cho hai theme — thế giới hiện đại hậu tận thế, tông tối và lạnh:
// bật đèn = giờ xanh lúc chạng vạng: trời xám thép, ánh sáng lạnh lọt qua ô kính vỡ, vũng sáng trắng lạnh của đèn LED;
// tắt đèn = mất điện ban đêm: gần như tối hẳn, ánh trăng xanh, màn hình chạy nguồn dự phòng hắt cyan, đèn dự phòng xanh.
// Cảnh trộn giữa hai bộ theo env (0 tối … 1 sáng).
import { Color } from 'three'

export interface ScenePalette {
  /** Nhân với texture bê tông / thép bàn — ban đêm tối và ngả xanh */
  wallTint: string
  deskTint: string
  hemiSky: string
  hemiGround: string
  hemi: number
  /** Ánh sáng lạnh cuối ngày (bật đèn) / ánh trăng (tắt đèn) qua cửa sổ vỡ */
  sun: string
  sunI: number
  /** Ánh viền phía sau — tách vật khỏi nền tối */
  rim: string
  rimI: number
  /** Đèn dự phòng xanh (chỉ khi mất điện) */
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
    wallTint: '#e2eaf2',
    deskTint: '#ffffff',
    hemiSky: '#8aa2bf',
    hemiGround: '#0c1015',
    hemi: 0.6,
    sun: '#a9c4e2',
    sunI: 1.0,
    rim: '#79c2dc',
    rimI: 0.5,
    backupI: 0,
    glow: '#a8ecff',
    glowI: 0.3,
    fog: '#1b2633',
    fogD: 0.2,
    envI: 0.4
  },
  dark: {
    wallTint: '#4c5868',
    deskTint: '#55606e',
    hemiSky: '#162339',
    hemiGround: '#030405',
    hemi: 0.3,
    sun: '#7f9fd0',
    sunI: 0.36,
    rim: '#4f80b4',
    rimI: 0.32,
    backupI: 1,
    glow: '#5fe6ff',
    glowI: 1,
    fog: '#070b11',
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

/** Robot: mắt, đèn trạng thái cyan; báo động đỏ */
export const ROBOT = {
  eye: '#5fe6ff',
  led: '#5fe6ff',
  alert: '#ff4b4b'
}

/** Đèn LED làm việc: ánh sáng trắng lạnh */
export const LAMP = {
  panel: '#eef7ff',
  light: '#d8ebff'
}

/** Mép trong viền màn hình, hắt sáng từ màn hình — khác hẳn màu nền màn hình để nhìn ra mép */
export const SCREEN_LIP = { light: '#222b36', dark: '#0f1822' }
