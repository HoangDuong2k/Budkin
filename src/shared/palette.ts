// Bảng màu dùng chung cho main (màu nền cửa sổ), cảnh 3D và CSS (tokens.css phải khớp — có test kiểm tra)

export type Theme = 'light' | 'dark'

export function isTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark'
}

/** Màu nền cửa sổ trước khi trang vẽ xong — gần màu tường của cảnh để mở app không bị chớp */
export const WINDOW_BG: Record<Theme, string> = { light: '#11161c', dark: '#06080b' }

/** Nền màn hình máy tính 3D = nền giao diện quản lý task (lệch một pixel ở mép cũng không thấy) */
export const SCREEN_BG: Record<Theme, string> = { light: '#131920', dark: '#080b0f' }

/** Màu của dự án / nhãn lưu bằng khoá (không lưu mã màu) để tự đổi sắc độ theo theme sáng/tối */
export const COLOR_KEYS = ['lavender', 'sky', 'mint', 'sage', 'lemon', 'peach', 'coral', 'rose', 'slate'] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

/** Cả hai theme đều nền tối, tông lạnh: bật đèn dịu hơn; tắt đèn sáng hơn như đèn báo trong bóng tối */
export const LABEL_COLORS: Record<ColorKey, Record<Theme, string>> = {
  lavender: { light: '#a99cf0', dark: '#b8aaff' },
  sky: { light: '#6fb4f0', dark: '#72c8ff' },
  mint: { light: '#5fcfb4', dark: '#5ff0cc' },
  sage: { light: '#9cc486', dark: '#aee89a' },
  lemon: { light: '#e0c860', dark: '#ffe070' },
  peach: { light: '#e8a070', dark: '#ffb07a' },
  coral: { light: '#ec6f68', dark: '#ff7470' },
  rose: { light: '#df7fa8', dark: '#ff86b8' },
  slate: { light: '#98a6b4', dark: '#a8b8c8' }
}
