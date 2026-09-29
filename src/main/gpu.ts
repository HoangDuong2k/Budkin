import { app } from 'electron'
import type { BootPrefs } from '../shared/boot'

/** Cờ đồ hoạ — phải gọi trước khi app sẵn sàng (app.whenReady) */
export function applyGraphicsSwitches(prefs: BootPrefs): void {
  // Chromium không còn tự rơi về WebGL vẽ bằng CPU (SwiftShader) khi thiếu GPU (máy ảo, CI, driver bị chặn).
  // App chỉ nạp nội dung cục bộ của chính nó nên bật lại an toàn: vẫn có 3D (chế độ Tiết kiệm) thay vì mất hẳn WebGL
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
  if (prefs.render === 'software') app.disableHardwareAcceleration()
  if (process.platform === 'linux') {
    // Lối thoát khi Wayland có vấn đề (bộ gõ, driver): chạy qua XWayland
    if (prefs.xwayland) app.commandLine.appendSwitch('ozone-platform', 'x11')
    // Bộ gõ tiếng Việt (ibus-bamboo, fcitx5-unikey…) trên Wayland
    else app.commandLine.appendSwitch('enable-wayland-ime')
  }
}
