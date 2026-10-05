// Giao diện "hệ điều hành" trên màn hình máy tính: thanh trên, thanh bên, danh sách, khung sửa, toast
import { useEffect, useRef } from 'react'
import { Button, IconButton, Input, Toaster, ToggleGroup, ToggleGroupItem } from 'momi-ui'
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
    <ToggleGroup
      type="single"
      variant="segmented"
      size="sm"
      className="view-switch ms-1"
      value={view}
      onValueChange={(v) => setView(v as View)}
      aria-label={tr('Cách xem')}
    >
      {VIEWS.map((v) => (
        <ToggleGroupItem key={v.id} value={v.id} label={tr(v.label)} shortcut={[v.key]}>
          <Icon name={v.icon} size={14} />
          <span className="label">{tr(v.label)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
      <IconButton variant="ghost" size="sm" onClick={toggleSidebar} aria-label={tr('Ẩn / hiện thanh bên')}>
        <Icon name="sidebar" />
      </IconButton>
      <span className="brand">
        <span className="brand-mark">
          <Icon name="bot" size={15} />
        </span>
        <span className="brand-name">Budkin</span>
      </span>
      <ViewSwitch />
      <div className="grow" />
      <Input
        ref={ref}
        size="sm"
        wrapperClassName="search w-60 min-w-28 shrink"
        leftSection={<Icon name="search" size={14} />}
        rightSection={
          search ? (
            <IconButton variant="ghost" size="xs" aria-label={tr('Xoá tìm kiếm')} onClick={() => setSearch('')}>
              <Icon name="x" size={12} />
            </IconButton>
          ) : undefined
        }
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
      <Button size="sm" className="add-task" onClick={startQuickAdd} title={tr('Thêm việc (N)')} leftIcon={<Icon name="plus" size={14} />}>
        <span className="label">{tr('Thêm việc')}</span>
      </Button>
      {scene && (
        <IconButton
          variant="ghost"
          size="sm"
          className="expand-btn"
          onClick={() => setExpanded(!expanded)}
          aria-pressed={expanded}
          aria-label={expanded ? tr('Thu về màn hình (F)') : tr('Mở rộng (F)')}
          title={expanded ? tr('Thu về màn hình (F)') : tr('Mở rộng (F)')}
        >
          <Icon name={expanded ? 'collapse' : 'expand'} size={15} />
        </IconButton>
      )}
      <span className="clock" aria-hidden>
        {pad2(Math.floor(now.minutes / 60))}:{pad2(now.minutes % 60)}
      </span>
    </header>
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
      {/* Thông báo nhỏ (useUi().toast): giữa mép dưới màn hình máy tính */}
      <Toaster position="bottom-center" visibleToasts={3} closeButton clearAll={false} />
    </div>
  )
}
