import { create } from 'zustand'
import type { Theme } from '../../../shared/palette'
import { call } from '../ipc'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: window.api.boot.theme,
  setTheme: (theme) => {
    if (theme === get().theme) return
    document.documentElement.dataset.theme = theme
    set({ theme })
    void call('app:setTheme', theme)
  },
  toggle: () => get().setTheme(get().theme === 'light' ? 'dark' : 'light')
}))
