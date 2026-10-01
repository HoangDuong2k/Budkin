// Giao diện "hệ điều hành" trên màn hình máy tính: thanh trên, thanh bên, danh sách, khung sửa, toast
import { useEffect, useRef } from 'react'
import { pad2 } from '../../../shared/datetime'
import { tr, trKey } from '../../../shared/i18n'
import { useNow } from '../clock'
import { useHud } from '../state/hudStore'
import { useTheme } from '../state/themeStore'
import { useUi, type View } from '../state/uiStore'
import { startQuickAdd } from './actions'
import { CalendarView } from './CalendarView'
import { Icon, type IconName } from './icons'
import { KanbanView } from './KanbanView'
import { ListView } from './ListView'
import { ReminderBanner } from './ReminderBanner'
import { SettingsPanel } from './SettingsPanel'
import { Sidebar } from './Sidebar'
import { TaskEditor } from './TaskEditor'

const VIEWS: Array<{ id: View; icon: IconName; label: string; key: string }> = [
  { id: 'list', icon: 'list', label: trKey('Danh sách'), key: '1' },
  { id: 'kanban', icon: 'kanban', label: trKey('Kanban'), key: '2' },
  { id: 'calendar', icon: 'calendar', label: trKey('Lịch'), key: '3' }
]

/** Chuyển cách xem: Danh sách / Kanban / Lịch (phím 1 / 2 / 3) */
function ViewSwitch(): React.JSX.Element {
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  return (
    <div className="view-switch" role="radiogroup" aria-label={tr('Cách xem')}>
      {VIEWS.map((v) => (
        <button
          key={v.id}
          role="radio"
          aria-checked={view === v.id}
          className={view === v.id ? 'on' : ''}
          title={`${tr(v.label)} (${v.key})`}
          onClick={() => setView(v.id)}
        >
          <Icon name={v.icon} size={14} />
          <span className="label">{tr(v.label)}</span>
        </button>
      ))}
    </div>
  )
}

function TopBar(): React.JSX.Element {
  const search = useUi((s) => s.search)
  const setSearch = useUi((s) => s.setSearch)
  const toggleSidebar = useUi((s) => s.toggleSidebar)
  const searchFocus = useUi((s) => s.searchFocus)
  const expanded = useUi((s) => s.expanded)
  const setExpanded = useUi((s) => s.setExpanded)
  const scene = useHud((s) => s.scene)
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
      <span className="brand">
        <span className="brand-mark">
          <Icon name="bot" size={15} />
        </span>
        <span className="brand-name">Budkin</span>
      </span>
      <ViewSwitch />
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
      {scene && (
        <button
          className="icon-btn expand-btn"
          onClick={() => setExpanded(!expanded)}
          aria-pressed={expanded}
          aria-label={expanded ? tr('Thu về màn hình (F)') : tr('Mở rộng (F)')}
          title={expanded ? tr('Thu về màn hình (F)') : tr('Mở rộng (F)')}
        >
          <Icon name={expanded ? 'collapse' : 'expand'} size={15} />
        </button>
      )}
      <span className="clock" aria-hidden>
        {pad2(Math.floor(now.minutes / 60))}:{pad2(now.minutes % 60)}
      </span>
    </header>
  )
}

function Toasts(): React.JSX.Element {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  const hold = useUi((s) => s.holdToast)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`} onPointerEnter={() => hold(t.id, true)} onPointerLeave={() => hold(t.id, false)}>
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
      // Cài đặt: Ctrl+, (kể cả khi đang gõ)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault()
        if (ui.settingsOpen) ui.closeSettings()
        else ui.openSettings()
        return
      }
      const el = e.target as HTMLElement
      const typing = !!el.closest?.('input, textarea, [contenteditable="true"]')
      if (e.key === 'Escape') {
        if (typing) el.blur()
        else if (ui.settingsOpen) ui.closeSettings()
        else if (ui.editingId) ui.openEditor(null)
        else if (ui.search) ui.setSearch('')
        else if (ui.expanded) ui.setExpanded(false)
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        startQuickAdd()
      } else if (e.key === '/') {
        e.preventDefault()
        ui.focusSearch()
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault()
        ui.setView(VIEWS[Number(e.key) - 1].id)
      } else if ((e.key === 'f' || e.key === 'F') && useHud.getState().scene) {
        // Chế độ Mở rộng chỉ có nghĩa khi có cảnh 3D (giao diện 2D đã phủ kín cửa sổ)
        e.preventDefault()
        ui.setExpanded(!ui.expanded)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function Shell(): React.JSX.Element {
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const editing = useUi((s) => s.editingId !== null)
  const view = useUi((s) => s.view)
  const settingsOpen = useUi((s) => s.settingsOpen)
  useShortcuts()
  return (
    <div className={`screen-app ${sidebarOpen ? '' : 'sidebar-closed'} ${editing ? 'editing' : ''}`}>
      <TopBar />
      <Sidebar />
      <main className={`main view-${view}`}>
        <ReminderBanner />
        {view === 'kanban' ? <KanbanView /> : view === 'calendar' ? <CalendarView /> : <ListView />}
      </main>
      <TaskEditor />
      {settingsOpen && <SettingsPanel />}
      <Toasts />
    </div>
  )
}
