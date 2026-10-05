// Kanban: 3 cột Cần làm / Đang làm / Đã xong theo lựa chọn trên thanh bên, dựng trên Kanban của momi-ui. Kéo thả thẻ
// bằng chuột, chạm giữ, hoặc bàn phím (Tab tới thẻ, Space nhấc lên, phím mũi tên di chuyển, Space thả, Esc huỷ). Thẻ
// đang kéo vẽ trong màn hình máy tính (PortalProvider), khung màn hình cắt phần tràn ra ngoài.
import { useMemo } from 'react'
import { Kanban, moveKanbanItem, type KanbanColumn } from 'momi-ui'
import { BOARD_COLUMNS, boardColumns, dropNeighbours } from '../../../shared/board'
import { matchesTerms } from '../../../shared/filters'
import { tr, trKey } from '../../../shared/i18n'
import { normalizeText, searchTerms } from '../../../shared/search'
import type { Task, TaskStatus } from '../../../shared/types'
import { useNow } from '../clock'
import { useData } from '../state/dataStore'
import { useUi } from '../state/uiStore'
import { moveTask } from './actions'
import { QuickAdd, useSelectionTitle } from './ListView'
import { TaskCard } from './TaskCard'

const COLUMN_TITLE: Record<TaskStatus, string> = { todo: trKey('Cần làm'), in_progress: trKey('Đang làm'), done: trKey('Đã xong') }
/** Màu chấm đèn ở đầu cột */
const COLUMN_TONE: Record<TaskStatus, KanbanColumn['tone']> = { todo: 'neutral', in_progress: 'primary', done: 'success' }

export function KanbanView(): React.JSX.Element {
  const now = useNow()
  const sel = useUi((s) => s.selection)
  const search = useUi((s) => s.search)
  const openEditor = useUi((s) => s.openEditor)
  const tasks = useData((s) => s.tasks)
  const terms = useMemo(() => searchTerms(search), [search])
  const value = useMemo(() => {
    const all = Object.values(tasks).filter((t) => matchesTerms(t, terms, normalizeText))
    return boardColumns(all, sel, now) as Record<string, Task[]>
  }, [tasks, sel, now, terms])
  const columns: KanbanColumn[] = BOARD_COLUMNS.map((s) => ({ id: s, title: tr(COLUMN_TITLE[s]), tone: COLUMN_TONE[s] }))
  const { title } = useSelectionTitle(sel, now)
  const showQuickAdd = !terms.length && !(sel.kind === 'smart' && (sel.id === 'done' || sel.id === 'overdue'))
  return (
    <div className="board-view">
      <header className="list-head">
        <h2>{terms.length ? tr('Kết quả tìm kiếm') : title}</h2>
      </header>
      {showQuickAdd && <QuickAdd sel={sel} today={now.date} />}
      <Kanban<Task>
        className="board"
        columns={columns}
        value={value}
        columnWidth="fill"
        minColumnWidth={150}
        maxHeight="100%"
        getItemId={(t) => t.id}
        getItemLabel={(t) => t.title}
        onCardClick={(t) => openEditor(t.id)}
        // Thả: đổi trạng thái và thứ tự (theo hai thẻ hai bên chỗ thả) — dữ liệu đổi ngay, ghi xuống sau
        onCardMove={({ item, from, to }) => {
          if (from.columnId === to.columnId && from.index === to.index) return
          const list = moveKanbanItem(value, from, to)[to.columnId].map((t) => t.id)
          const index = list.indexOf(item.id)
          const { beforeId, afterId } = dropNeighbours(
            list.filter((id) => id !== item.id),
            index
          )
          void moveTask(item, to.columnId as TaskStatus, beforeId, afterId)
        }}
        emptyState={<span className="board-empty">{tr('Kéo việc vào đây')}</span>}
        renderCard={(task, ctx) => <TaskCard task={task} now={now} overlay={ctx.overlay} />}
      />
    </div>
  )
}
