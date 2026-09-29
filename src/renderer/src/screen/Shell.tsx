// Giao diện "hệ điều hành" trên màn hình máy tính: thanh trên, thanh bên, danh sách, khung sửa, toast
import { useEffect, useRef } from 'react'
import { pad2 } from '../../../shared/datetime'
import { tr } from '../../../shared/i18n'
import { useNow } from '../clock'
import { useTheme } from '../state/themeStore'
import { useUi } from '../state/uiStore'
import { startQuickAdd } from './actions'
import { Icon } from './icons'
import { ListView } from './ListView'
import { ReminderBanner } from './ReminderBanner'
import { Sidebar } from './Sidebar'
import { TaskEditor } from './TaskEditor'

function TopBar(): React.JSX.Element {
  const search = useUi((s) => s.search)
  const setSearch = useUi((s) => s.setSearch)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const searchFocus = useUi((s) => s.searchFocus)
  const now = useNow()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (searchFocus) ref.current?.focus()
  }, [searchFocus])
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={toggleSidebar} aria-label={tr('Ẩn / hiện thanh bên')}>
        <Icon name="sidebar" />
      </button>
      <span className="brand">Budkin</span>
      <div className="grow" />
      <div className="search">
        <Icon name="search" size={14} />
        <input
          ref={ref}
          value={search}
          maxLength={200}
          placeholder={tr('Tìm việc… ( / )')}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setSearch('')
              ref.current?.blur()
            }
          }}
        />
        {search && (
          <button className="icon-btn subtle" aria-label={tr('Xoá tìm kiếm')} onClick={() => setSearch('')}>
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
      <button className="btn primary small add-task" onClick={startQuickAdd} title={tr('Thêm việc (N)')}>
        <Icon name="plus" size={14} />
        <span className="label">{tr('Thêm việc')}</span>
      </button>
      <span className="clock" aria-hidden>
        {pad2(Math.floor(now.minutes / 60))}:{pad2(now.minutes % 60)}
      </span>
    </header>
  )
}

function Toasts(): React.JSX.Element {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action?.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon-btn subtle" aria-label={tr('Đóng')} onClick={() => dismiss(t.id)}>
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Phím tắt chung. Đang gõ chữ (kể cả bộ gõ tiếng Việt đang ghép dấu) thì chỉ nhận Esc */
function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing) return
      // Bật / tắt đèn: dùng được cả khi đang gõ
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyL') {
        e.preventDefault()
        useTheme.getState().toggle()
        return
      }
      const ui = useUi.getState()
      const el = e.target as HTMLElement
      const typing = !!el.closest?.('input, textarea, [contenteditable="true"]')
      if (e.key === 'Escape') {
        if (typing) el.blur()
        else if (ui.editingId) ui.openEditor(null)
        else if (ui.search) ui.setSearch('')
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        startQuickAdd()
      } else if (e.key === '/') {
        e.preventDefault()
        ui.focusSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function Shell(): React.JSX.Element {
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const editing = useUi((s) => s.editingId !== null)
  useShortcuts()
  return (
    <div className={`screen-app ${sidebarOpen ? '' : 'sidebar-closed'} ${editing ? 'editing' : ''}`}>
      <TopBar />
      <Sidebar />
      <main className="main">
        <ReminderBanner />
        <ListView />
      </main>
      <TaskEditor />
      <Toasts />
    </div>
  )
}
