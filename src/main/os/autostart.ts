// Tự khởi động cùng máy (chạy ẩn dưới khay với --hidden để nhắc việc đúng giờ).
// Windows: mục Run trong registry (tên mục = AppUserModelId, bộ gỡ cài đặt xoá đúng mục này — build/installer.nsh).
// Linux: file ~/.config/autostart/budkin.desktop; bản AppImage trỏ tới chính file .AppImage (không phải thư mục giải nén tạm).
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { APP_NAME } from '../../shared/constants'

export const HIDDEN_ARG = '--hidden'

function desktopFile(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'autostart', 'budkin.desktop')
}

/** Tham số trong dòng Exec của file .desktop: bọc ngoặc kép, thoát các ký tự đặc biệt */
export function desktopExecArg(arg: string): string {
  return /[\s"'\\$`]/.test(arg) ? `"${arg.replace(/(["`$\\])/g, '\\$1')}"` : arg
}

export function setAutostart(enabled: boolean): void {
  // Bản đang phát triển (npm run dev): không đăng ký chạy file electron trần
  if (!app.isPackaged) return
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] })
    return
  }
  if (process.platform !== 'linux') return
  const file = desktopFile()
  if (!enabled) {
    rmSync(file, { force: true })
    return
  }
  const exe = process.env.APPIMAGE || process.execPath
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(
    file,
    ['[Desktop Entry]', 'Type=Application', `Name=${APP_NAME}`, `Exec=${desktopExecArg(exe)} ${HIDDEN_ARG}`, 'Terminal=false', 'X-GNOME-Autostart-enabled=true', ''].join('\n')
  )
}

/** Đang bật tự khởi động không (theo hệ điều hành — người dùng có thể đã tắt ở ngoài app) */
export function isAutostartOn(): boolean {
  if (!app.isPackaged) return false
  if (process.platform === 'win32') return app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin
  if (process.platform === 'linux') return existsSync(desktopFile())
  return false
}
