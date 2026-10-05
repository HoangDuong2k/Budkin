// Theme = đèn bàn. Có cảnh 3D thì ThemeDirector đổi theme DOM đúng khung hình bóng đèn tắt / bật;
// chế độ 2D thì đổi ngay.
import { withoutTransitions } from 'momi-ui'
import { create } from 'zustand'
import type { Theme } from '../../../shared/palette'
import { call } from '../ipc'

interface ThemeState {
  /** Theme đang hiện trên giao diện DOM */
  theme: Theme
  /** Theme đích (vừa bật / tắt đèn) — cảnh 3D chuyển dần tới đây */
  target: Theme
  /** Cảnh 3D đang điều khiển việc đổi theme */
  directed: boolean
  setDirected: (directed: boolean) => void
  /** Bật / tắt đèn */
  toggle: () => void
  request: (theme: Theme) => void
  /** Đổi theme DOM (ThemeDirector gọi đúng khung hình), lưu lại, báo main đổi theme cửa sổ */
  applyDom: (theme: Theme) => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: window.api.boot.theme,
  target: window.api.boot.theme,
  directed: false,
  setDirected: (directed) => {
    set({ directed })
    if (!directed) get().applyDom(get().target)
  },
  toggle: () => get().request(get().target === 'light' ? 'dark' : 'light'),
  request: (theme) => {
    set({ target: theme })
    if (!get().directed) get().applyDom(theme)
  },
  applyDom: (theme) => {
    if (theme === get().theme) return
    // Màu đổi tức thì, đúng khung hình bóng đèn tắt / sáng (không để nút, ô nhập… chuyển màu dần)
    withoutTransitions(() => (document.documentElement.dataset.theme = theme))
    set({ theme })
    void call('app:setTheme', theme)
  }
}))
