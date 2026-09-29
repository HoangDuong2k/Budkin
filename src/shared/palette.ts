// Bảng màu dùng chung cho main (màu nền cửa sổ), cảnh 3D và CSS (tokens.css phải khớp — có test kiểm tra)

export type Theme = 'light' | 'dark'

export function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark'
}

/** Màu nền cửa sổ trước khi trang vẽ xong — gần màu tường của cảnh để mở app không bị chớp */
export const WINDOW_BG: Record<Theme, string> = { light: '#2f5550', dark: '#0e1716' }

/** Nền màn hình máy tính 3D = nền giao diện quản lý task (lệch một pixel ở mép cũng không thấy) */
export const SCREEN_BG: Record<Theme, string> = { light: '#f3ead5', dark: '#121a1d' }

/** Màu của dự án / nhãn lưu bằng khoá (không lưu mã màu) để tự đổi sắc độ theo theme sáng/tối */
export const COLOR_KEYS = ['lavender', 'sky', 'mint', 'sage', 'lemon', 'peach', 'coral', 'rose', 'slate'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

/** Tông màu đậm kiểu tranh vẽ: ban ngày đủ tương phản trên nền giấy da, ban đêm sáng như neon */
export const LABEL_COLORS: Record<ColorKey, Record<Theme, string>> = {
  lavender: { light: '#7247ad', dark: '#c49bff' },
  sky: { light: '#2a7fa6', dark: '#46e3ff' },
  mint: { light: '#1c8378', dark: '#5ff2d6' },
  sage: { light: '#5b7a2a', dark: '#b5e06a' },
  lemon: { light: '#a8761f', dark: '#ffd166' },
  peach: { light: '#b35a25', dark: '#ffa56b' },
  coral: { light: '#ad2f28', dark: '#ff6b6b' },
  rose: { light: '#a82b73', dark: '#ff4fa3' },
  slate: { light: '#555b63', dark: '#a9b2bd' }
}
