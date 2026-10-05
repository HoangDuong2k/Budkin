// Riêng macOS: thanh menu của ứng dụng (thiếu menu Sửa thì ⌘C / ⌘V / ⌘Z không chạy trong ô nhập), menu của biểu tượng
// trên Dock, và đề nghị chuyển app vào thư mục Applications khi đang chạy thẳng từ file .dmg / thư mục tải về.
import { Menu, app, dialog } from 'electron'
import { APP_NAME } from '../../shared/constants'
import { tr } from '../../shared/i18n'

interface MenuDeps {
  openSettings(): void
  quickAdd(): void
}

/** Thanh menu và menu Dock theo ngôn ngữ đang dùng (đổi ngôn ngữ thì gọi lại) */
export function setMacMenus(deps: MenuDeps): void {
  const menu = Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: tr('Giới thiệu {name}', { name: APP_NAME }) },
        { type: 'separator' },
        // ⌘, do giao diện tự xử lý (mở / đóng Cài đặt, cả khi đang gõ): menu chỉ hiện phím tắt, không đăng ký lại
        { label: tr('Cài đặt…'), accelerator: 'Cmd+,', registerAccelerator: false, click: () => deps.openSettings() },
        { type: 'separator' },
        { role: 'services', label: tr('Dịch vụ') },
        { type: 'separator' },
        { role: 'hide', label: tr('Ẩn {name}', { name: APP_NAME }) },
        { role: 'hideOthers', label: tr('Ẩn các ứng dụng khác') },
        { role: 'unhide', label: tr('Hiện tất cả') },
        { type: 'separator' },
        // Thoát hẳn (nút đóng cửa sổ chỉ ẩn để còn nhắc việc)
        { role: 'quit', label: tr('Thoát {name}', { name: APP_NAME }) }
      ]
    },
    {
      label: tr('Sửa'),
      submenu: [
        { role: 'undo', label: tr('Hoàn tác') },
        { role: 'redo', label: tr('Làm lại') },
        { type: 'separator' },
        { role: 'cut', label: tr('Cắt') },
        { role: 'copy', label: tr('Sao chép') },
        { role: 'paste', label: tr('Dán') },
        { role: 'selectAll', label: tr('Chọn tất cả') }
      ]
    },
    {
      role: 'window',
      label: tr('Cửa sổ'),
      submenu: [
        { role: 'minimize', label: tr('Thu nhỏ') },
        { role: 'zoom', label: tr('Phóng to') },
        { type: 'separator' },
        { role: 'close', label: tr('Đóng cửa sổ') },
        { role: 'front', label: tr('Đưa tất cả lên trước') }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
  // Bấm chuột phải vào biểu tượng trên Dock (như jump list trên Windows, mục trên dock của Ubuntu)
  app.dock?.setMenu(Menu.buildFromTemplate([{ label: tr('Thêm việc nhanh'), click: () => deps.quickAdd() }]))
}

/**
 * Đang chạy từ chỗ tạm: ổ đĩa của file .dmg, hoặc app tải về chưa được kéo vào Applications mà macOS chạy ở một thư mục
 * ngẫu nhiên chỉ đọc (App Translocation, mỗi lần mở một khác) — Claude không tìm lại được Budkin ở đường dẫn đó.
 */
export function runningFromTemporaryPath(execPath: string): boolean {
  return execPath.startsWith('/Volumes/') || execPath.includes('/AppTranslocation/')
}

/** Hỏi chuyển Budkin vào Applications. Đồng ý thì app tự thoát rồi mở lại từ Applications */
export async function offerMoveToApplications(): Promise<void> {
  if (app.isInApplicationsFolder() || !runningFromTemporaryPath(process.execPath)) return
  const { response } = await dialog.showMessageBox({
    type: 'question',
    message: tr('Chuyển Budkin vào thư mục Applications?'),
    detail: tr('Budkin đang chạy thẳng từ file tải về. Chuyển vào Applications để mở lại dễ dàng và để Claude tìm thấy Budkin.'),
    buttons: [tr('Chuyển vào Applications'), tr('Để sau')],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (response !== 0) return
  try {
    app.moveToApplicationsFolder()
  } catch (err) {
    dialog.showErrorBox(
      tr('Không chuyển được Budkin'),
      tr('Hãy tự kéo Budkin vào thư mục Applications rồi mở lại. ({detail})', { detail: err instanceof Error ? err.message : String(err) })
    )
  }
}
