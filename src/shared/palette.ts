// Bảng màu dùng chung cho main (màu nền cửa sổ), cảnh 3D và CSS (tokens.css phải khớp — có test kiểm tra)

export type Theme = 'light' | 'dark'

export function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark'
}

/** Màu nền cửa sổ trước khi trang vẽ xong — trùng màu tường của cảnh để mở app không bị chớp */
export const WINDOW_BG: Record<Theme, string> = { light: '#f3e7d9', dark: '#141824' }

/** Nền màn hình máy tính 3D = nền giao diện quản lý task (lệch một pixel ở mép cũng không thấy) */
export const SCREEN_BG: Record<Theme, string> = { light: '#fffdf8', dark: '#1a1e2a' }
