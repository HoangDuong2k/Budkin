// Biểu tượng ở khay hệ thống: mặt robot (chấm đỏ khi có nhắc chưa xử lý), menu mở app / thêm việc / tắt nhắc / thoát.
// GNOME mặc định KHÔNG có khay: cần tiện ích AppIndicator (dịch vụ D-Bus org.kde.StatusNotifierWatcher). Không có
// thì Tray vẫn tạo được nhưng không hiện ở đâu cả — nên phải dò trước để biết nút đóng nên ẩn xuống khay hay thu nhỏ.
// macOS: biểu tượng trên thanh menu là ảnh "template" đơn sắc (hệ thống tự tô theo thanh menu sáng / tối); có nhắc
// chưa xử lý thì đổi sang ảnh màu có chấm đỏ cho nổi bật.
import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import { tr } from '../../shared/i18n'
import alert1x from '../../../resources/tray/tray-alert.png?asset'
import alert2x from '../../../resources/tray/tray-alert@2x.png?asset'
import normal1x from '../../../resources/tray/tray.png?asset'
import normal2x from '../../../resources/tray/tray@2x.png?asset'
import macAlert1x from '../../../resources/tray/mac/tray-alert.png?asset'
import macAlert2x from '../../../resources/tray/mac/tray-alert@2x.png?asset'
import macNormal1x from '../../../resources/tray/mac/trayTemplate.png?asset'
import macNormal2x from '../../../resources/tray/mac/trayTemplate@2x.png?asset'

const MAC = process.platform === 'darwin'

/** Máy có khay hệ thống không (Windows, macOS luôn có; Linux dò trên D-Bus) */
export function hasTrayHost(): Promise<boolean> {
  if (process.platform !== 'linux') return Promise.resolve(true)
  return new Promise((resolve) => {
    execFile(
      'gdbus',
      ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner', 'org.kde.StatusNotifierWatcher'],
      { timeout: 2000 },
      // Không dò được (máy không có gdbus): cứ coi như có khay — KDE, XFCE… đều có sẵn
      (err, stdout) => resolve(err ? true : /true/.test(stdout))
    )
  })
}

function load(one: string, two: string, template = false): NativeImage {
  const img = nativeImage.createFromPath(one)
  img.addRepresentation({ scaleFactor: 2, buffer: readFileSync(two) })
  if (template) img.setTemplateImage(true)
  return img
}

let icons: { normal: NativeImage; alert: NativeImage } | null = null

export function trayIcons(): { normal: NativeImage; alert: NativeImage } {
  icons ??= MAC
    ? { normal: load(macNormal1x, macNormal2x, true), alert: load(macAlert1x, macAlert2x) }
    : { normal: load(normal1x, normal2x), alert: load(alert1x, alert2x) }
  return icons
}

export interface TrayState {
  alert: boolean
  /** Việc chưa xong đến hạn hôm nay hoặc đã quá hạn */
  due: number
  muted: boolean
  autostart: boolean
}

interface Deps {
  show(): void
  quickAdd(): void
  openToday(): void
  setMuted(muted: boolean): void
  setAutostart(on: boolean): void
  quit(): void
}

export class AppTray {
  private tray: Tray | null = null
  private state: TrayState = { alert: false, due: 0, muted: false, autostart: false }

  constructor(private readonly deps: Deps) {}

  create(): void {
    if (this.tray) return
    this.tray = new Tray(trayIcons().normal)
    // Windows: bấm biểu tượng mở cửa sổ (Linux / AppIndicator, macOS: bấm là hiện menu)
    if (!MAC) this.tray.on('click', () => this.deps.show())
    this.render()
  }

  update(patch: Partial<TrayState>): void {
    this.state = { ...this.state, ...patch }
    this.render()
  }

  /** Vẽ lại menu (đổi ngôn ngữ cũng gọi) */
  render(): void {
    const t = this.tray
    if (!t) return
    const s = this.state
    t.setImage(s.alert ? trayIcons().alert : trayIcons().normal)
    const dueText = s.due > 0 ? tr('{n} việc cần làm hôm nay', { n: s.due }) : tr('Không có việc đến hạn')
    t.setToolTip(`Budkin — ${dueText}`)
    t.setContextMenu(
      Menu.buildFromTemplate([
        { label: tr('Mở Budkin'), click: () => this.deps.show() },
        { label: tr('Thêm việc nhanh'), click: () => this.deps.quickAdd() },
        { type: 'separator' },
        { label: dueText, click: () => this.deps.openToday() },
        { type: 'separator' },
        { label: s.muted ? tr('Bật lại nhắc việc') : tr('Tắt nhắc 1 giờ'), click: () => this.deps.setMuted(!s.muted) },
        { label: tr('Khởi động cùng máy'), type: 'checkbox', checked: s.autostart, click: (item) => this.deps.setAutostart(item.checked) },
        { type: 'separator' },
        { label: tr('Thoát'), click: () => this.deps.quit() }
      ])
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
