// Icon app (mặt robot, sinh từ build/icon-src bằng npm run icons): icon cửa sổ trên Linux (bản chưa cài / AppImage
// chưa có file .desktop), icon trong thông báo
import { nativeImage, type NativeImage } from 'electron'
import iconPath from '../../../resources/icon.png?asset'

let icon: NativeImage | null = null

export function appIcon(): NativeImage {
  icon ??= nativeImage.createFromPath(iconPath)
  return icon
}
