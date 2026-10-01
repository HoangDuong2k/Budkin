// Trạng thái giao diện trên màn hình: đang xem gì, đang sửa task nào, thông báo nhỏ (toast)
import { create } from 'zustand'
import type { Selection } from '../../../shared/filters'

export type View = 'list' | 'kanban' | 'calendar'
export type CalendarMode = 'month' | 'week'
export type SettingsSection = 'general' | 'reminders' | 'display' | 'ai' | 'data' | 'about'

export interface Toast {
  id: number
  text: string
  tone?: 'error'
  action?: { label: string; run: () => void }
}

interface UiState {
  view: View
  selection: Selection
  search: string
  /** Task đang mở trong khung sửa */
  editingId: string | null
  sidebarOpen: boolean
  toasts: Toast[]
  /** Đếm tăng mỗi lần muốn đưa con trỏ vào ô thêm việc nhanh (phím N) */
  quickAddFocus: number
  searchFocus: number
  /** Chế độ Mở rộng (phím F): giao diện phủ gần kín cửa sổ, cảnh 3D tạm dừng */
  expanded: boolean
  calendarMode: CalendarMode
  /** Lịch đang xem tháng / tuần chứa ngày này (null: hôm nay) */
  calendarDate: string | null
  /** Màn hình Cài đặt (phủ lên giao diện trên màn hình máy tính) */
  settingsOpen: boolean
  settingsSection: SettingsSection
  setView: (view: View) => void
  select: (selection: Selection) => void
  setSearch: (search: string) => void
  openEditor: (id: string | null) => void
  toggleSidebar: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  /** Con trỏ đang ở trên toast: không tự tắt (đang định bấm "Hoàn tác"); rời ra thì tắt sau một lúc */
  holdToast: (id: number, hold: boolean) => void
  focusQuickAdd: () => void
  focusSearch: () => void
  setExpanded: (expanded: boolean) => void
  setCalendarMode: (mode: CalendarMode) => void
  setCalendarDate: (date: string | null) => void
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
}

const KEY = 'budkin.ui'

/** Nhớ lựa chọn xem cho lần mở sau (chỉ là tiện lợi — đọc/ghi lỗi thì bỏ qua) */
function loadPrefs(): Partial<Pick<UiState, 'view' | 'selection' | 'sidebarOpen' | 'calendarMode'>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<UiState>
  } catch {
    return {}
  }
}

const prefs = loadPrefs()
let toastSeq = 0
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>()
/** Kiểm thử trên máy ảo chậm: toast ở lâu hơn để kịp bấm */
const TOAST_SCALE = window.api.boot.test ? 3 : 1

function armToast(id: number, ms: number): void {
  clearTimeout(toastTimers.get(id))
  toastTimers.set(id, setTimeout(() => useUi.getState().dismissToast(id), ms * TOAST_SCALE))
}

export const useUi = create<UiState>((set, get) => ({
  view: prefs.view === 'kanban' || prefs.view === 'calendar' ? prefs.view : 'list',
  selection: prefs.selection && typeof prefs.selection === 'object' ? prefs.selection : { kind: 'smart', id: 'today' },
  search: '',
  editingId: null,
  sidebarOpen: prefs.sidebarOpen ?? true,
  toasts: [],
  quickAddFocus: 0,
  searchFocus: 0,
  expanded: false,
  calendarMode: prefs.calendarMode === 'week' ? 'week' : 'month',
  calendarDate: null,
  settingsOpen: false,
  settingsSection: 'general',
  setView: (view) => set({ view, settingsOpen: false }),
  // Chọn danh sách, mở một việc, thêm việc (kể cả từ thông báo / khay): rời màn hình Cài đặt
  select: (selection) => set({ selection, search: '', settingsOpen: false }),
  setSearch: (search) => set({ search }),
  openEditor: (editingId) => set(editingId ? { editingId, settingsOpen: false } : { editingId }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  toast: (t) => {
    const id = ++toastSeq
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] })
    armToast(id, t.action ? 6000 : 3500)
  },
  dismissToast: (id) => {
    clearTimeout(toastTimers.get(id))
    toastTimers.delete(id)
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
  holdToast: (id, hold) => {
    if (!get().toasts.some((t) => t.id === id)) return
    if (hold) clearTimeout(toastTimers.get(id))
    else armToast(id, 2500)
  },
  focusQuickAdd: () => set({ quickAddFocus: get().quickAddFocus + 1, editingId: null, settingsOpen: false }),
  focusSearch: () => set({ searchFocus: get().searchFocus + 1, settingsOpen: false }),
  setExpanded: (expanded) => set({ expanded }),
  setCalendarMode: (calendarMode) => set({ calendarMode }),
  setCalendarDate: (calendarDate) => set({ calendarDate }),
  openSettings: (section) => set({ settingsOpen: true, editingId: null, settingsSection: section ?? get().settingsSection }),
  closeSettings: () => set({ settingsOpen: false })
}))

useUi.subscribe((s, prev) => {
  if (s.view === prev.view && s.selection === prev.selection && s.sidebarOpen === prev.sidebarOpen && s.calendarMode === prev.calendarMode) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ view: s.view, selection: s.selection, sidebarOpen: s.sidebarOpen, calendarMode: s.calendarMode }))
  } catch {
    // bộ nhớ trình duyệt bị chặn: không nhớ được, không sao
  }
})
