// Bảng màu dùng chung cho main (màu nền cửa sổ), cảnh 3D và CSS (tokens.css phải khớp — có test kiểm tra)

export type Theme = 'light' | 'dark'

export function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark'
}

/** Màu nền cửa sổ trước khi trang vẽ xong — trùng màu tường của cảnh để mở app không bị chớp */
export const WINDOW_BG: Record<Theme, string> = { light: '#f3e7d9', dark: '#141824' }

/** Nền màn hình máy tính 3D = nền giao diện quản lý task (lệch một pixel ở mép cũng không thấy) */
export const SCREEN_BG: Record<Theme, string> = { light: '#fffdf8', dark: '#1a1e2a' }

/** Màu của dự án / nhãn lưu bằng khoá (không lưu mã màu) để tự đổi sắc độ theo theme sáng/tối */
export const COLOR_KEYS = ['lavender', 'sky', 'mint', 'sage', 'lemon', 'peach', 'coral', 'rose', 'slate'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

export const LABEL_COLORS: Record<ColorKey, Record<Theme, string>> = {
  lavender: { light: '#8b7cf6', dark: '#b3a8ff' },
  sky: { light: '#3d9be9', dark: '#7cc0ff' },
  mint: { light: '#23b39a', dark: '#6adfc8' },
  sage: { light: '#6f9b54', dark: '#a8d18d' },
  lemon: { light: '#d9a514', dark: '#f5d36b' },
  peach: { light: '#ef8a4c', dark: '#ffb48a' },
  coral: { light: '#e8615a', dark: '#ff9a93' },
  rose: { light: '#df5c98', dark: '#ff9cc8' },
  slate: { light: '#6b7285', dark: '#aab1c4' }
}
