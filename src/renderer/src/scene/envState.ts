// Trạng thái ánh sáng dùng chung trong cảnh (đọc trong useFrame): phòng sáng/tối, đèn bàn, công tắc.
// ThemeDirector là nơi duy nhất ghi vào đây khi bật/tắt đèn.
import { envOf, type ThemeAnim } from './logic/themeTimeline'
import type { Theme } from '../../../shared/palette'

export const env = {
  /** 0 = phòng tối (theme tối) … 1 = phòng sáng */
  env: 1,
  /** Công suất đèn bàn 0..1 */
  lamp: 1,
  /** Độ sáng bóng đèn nhìn thấy (kể cả lúc dây tóc còn âm ỉ) */
  bulb: 1,
  /** Công tắc đang lún 0..1 */
  press: 0,
  /** Đang chuyển theme */
  anim: null as ThemeAnim | null,
  /** Rê chuột lên đèn */
  lampHover: false
}

export function resetEnv(theme: Theme): void {
  const v = envOf(theme)
  env.env = v
  env.lamp = v
  env.bulb = v
  env.press = 0
  env.anim = null
}
