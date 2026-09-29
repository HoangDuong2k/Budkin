import { create } from 'zustand'
import { setLang, type Lang } from '../../../shared/i18n'
import { call } from '../ipc'

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

/** Ngôn ngữ giao diện; đổi thì toàn bộ giao diện vẽ lại (App dùng lang làm key) */
export const useLang = create<LangState>((set, get) => ({
  lang: window.api.boot.lang,
  setLang: (lang) => {
    if (lang === get().lang) return
    setLang(lang)
    document.documentElement.lang = lang
    set({ lang })
    void call('settings:update', { language: lang })
  }
}))
