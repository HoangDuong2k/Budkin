// Thông báo hệ điều hành cho nhắc việc — chỉ khi cửa sổ đang ẩn / không có focus (lúc đang dùng app thì robot báo).
// Ubuntu / GNOME: bắt buộc urgency 'normal' (mặc định của Electron là 'low', GNOME không hiện banner), chỉ bấm được.
// Windows: nút [Hoãn 10 phút] [Xong]; id theo từng task (thông báo mới thay thông báo cũ của cùng task).
// macOS: chỉ bấm được — nút trên thông báo của macOS chỉ chạy khi app được ký bằng chứng chỉ Apple Developer.
import { Notification, type BrowserWindow, type NativeImage } from 'electron'
import { tr } from '../../shared/i18n'
import { buildNotices, type AlertItem } from '../../shared/reminders'

export interface NoticeLog {
  taskId: string | null
  title: string
  body: string
}

interface Deps {
  /** Kiểm thử: ghi lại thay vì hiện */
  test: boolean
  window(): BrowserWindow | null
  icon(): NativeImage | undefined
  /** Bấm vào thông báo: mở app (tới đúng task nếu có) */
  open(taskId: string | null): void
  /** Bấm nút trên thông báo (Windows) */
  act(taskId: string, action: 'snooze' | 'done'): void
}

/** Nháy cửa sổ trên thanh tác vụ (macOS: biểu tượng trên Dock nảy lên). Wayland không có (flashFrame không làm gì hoặc lỗi) */
export const canFlash =
  process.platform === 'win32' ||
  process.platform === 'darwin' ||
  (process.platform === 'linux' && process.env.XDG_SESSION_TYPE !== 'wayland' && !process.env.WAYLAND_DISPLAY)

export class Notifier {
  /** Kiểm thử đọc các thông báo đã "hiện" */
  readonly log: NoticeLog[] = []
  /** Giữ tham chiếu tới thông báo đang hiện: bị thu gom rác thì bấm vào không còn phản hồi */
  private readonly live = new Map<string, Notification>()

  constructor(private readonly deps: Deps) {
    // Windows: bấm thông báo sau khi đối tượng đã bị thu gom (hoặc app vừa được mở từ thông báo): chỉ cần mở cửa sổ
    if (process.platform === 'win32' && !deps.test) Notification.handleActivation(() => deps.open(null))
  }

  notify(items: AlertItem[], now: number): void {
    const win = this.deps.window()
    if (win && win.isVisible() && !win.isMinimized() && win.isFocused()) return
    for (const n of buildNotices(items, now)) {
      if (this.deps.test) {
        this.log.push(n)
        continue
      }
      if (!Notification.isSupported()) continue
      this.show(n.taskId, n.title, n.body)
    }
    if (win && !this.deps.test && canFlash) win.flashFrame(true)
  }

  private show(taskId: string | null, title: string, body: string): void {
    const key = taskId ?? 'summary'
    this.live.get(key)?.close()
    const n = new Notification({
      title,
      body,
      icon: this.deps.icon(),
      urgency: 'normal',
      timeoutType: 'default',
      ...(process.platform === 'win32'
        ? {
            id: `budkin-${key}`,
            actions: taskId
              ? [
                  { type: 'button' as const, text: tr('Hoãn 10 phút') },
                  { type: 'button' as const, text: tr('Xong') }
                ]
              : []
          }
        : {})
    })
    n.on('click', () => this.deps.open(taskId))
    n.on('action', (e) => {
      if (!taskId) return
      if (e.actionIndex === 0) this.deps.act(taskId, 'snooze')
      else if (e.actionIndex === 1) this.deps.act(taskId, 'done')
    })
    n.on('close', () => {
      if (this.live.get(key) === n) this.live.delete(key)
    })
    this.live.set(key, n)
    n.show()
  }
}
