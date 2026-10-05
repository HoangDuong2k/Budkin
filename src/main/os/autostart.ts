// Tự khởi động cùng máy (chạy ẩn dưới khay với --hidden để nhắc việc đúng giờ).
// Windows: mục Run trong registry (tên mục = AppUserModelId, bộ gỡ cài đặt xoá đúng mục này — build/installer.nsh).
// Linux: file ~/.config/autostart/budkin.desktop; bản AppImage trỏ tới chính file .AppImage (không phải thư mục giải nén tạm).
// macOS: LaunchAgent ~/Library/LaunchAgents/com.budkin.app.login.plist chạy `open -b com.budkin.app --args --hidden` —
// mở theo mã định danh của app nên kéo Budkin sang thư mục khác vẫn đúng; Mục đăng nhập trong Cài đặt hệ thống ghi tên
// Budkin (AssociatedBundleIdentifiers). Không dùng app.setLoginItemSettings: trên macOS nó không truyền được --hidden.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { APP_ID, APP_NAME, HIDDEN_ARG } from '../../shared/constants'

function desktopFile(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'autostart', 'budkin.desktop')
}

const AGENT_LABEL = `${APP_ID}.login`

function launchAgentFile(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`)
}

function launchAgentPlist(): string {
  // -g: mở mà không đưa lên trước (chạy ẩn, chỉ có biểu tượng trên thanh menu)
  const args = ['/usr/bin/open', '-g', '-b', APP_ID, '--args', HIDDEN_ARG]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${AGENT_LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...args.map((a) => `    <string>${a}</string>`),
    '  </array>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>AssociatedBundleIdentifiers</key>',
    `  <string>${APP_ID}</string>`,
    '</dict>',
    '</plist>',
    ''
  ].join('\n')
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
  if (process.platform === 'darwin') {
    const file = launchAgentFile()
    if (!enabled) rmSync(file, { force: true })
    else {
      mkdirSync(join(file, '..'), { recursive: true })
      writeFileSync(file, launchAgentPlist())
    }
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
  if (process.platform === 'darwin') return existsSync(launchAgentFile())
  return false
}
