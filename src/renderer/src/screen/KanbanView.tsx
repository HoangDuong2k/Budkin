// Kanban: 3 cột Cần làm / Đang làm / Đã xong theo lựa chọn trên thanh bên. Kéo thả thẻ bằng chuột, hoặc bàn phím
// (Tab tới thẻ, Space nhấc lên, phím mũi tên di chuyển, Space thả, Esc huỷ). Thẻ đang kéo vẽ ở #portal-root để nổi trên
// mọi thứ (khung màn hình cắt phần tràn ra ngoài).
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { BOARD_COLUMNS, boardColumns, dropNeighbours } from '../../../shared/board'
import { matchesTerms, type Now } from '../../../shared/filters'
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

type Columns = Record<TaskStatus, string[]>

const idsOf = (c: Record<TaskStatus, Task[]>): Columns => ({ todo: c.todo.map((t) => t.id), in_progress: c.in_progress.map((t) => t.id), done: c.done.map((t) => t.id) })

/** Cột chứa `id` (id của cột là "col:<trạng thái>", còn lại là id việc) */
function columnOf(id: UniqueIdentifier, cols: Columns): TaskStatus | null {
  const s = String(id)
  if (s.startsWith('col:')) return s.slice(4) as TaskStatus
  return BOARD_COLUMNS.find((k) => cols[k].includes(s)) ?? null
}

function SortableCard({ task, now }: { task: Task; now: Now }): React.JSX.Element {
  const openEditor = useUi((s) => s.openEditor)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      now={now}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => openEditor(task.id)}
      onKeyDown={(e) => {
        // Enter mở khung sửa; Space nhấc thẻ lên để kéo bằng bàn phím
        if (e.key === 'Enter' && !isDragging) openEditor(task.id)
        else listeners?.onKeyDown?.(e)
      }}
    />
  )
}

function BoardColumn({ status, ids, tasks, now, target }: { status: TaskStatus; ids: string[]; tasks: Record<string, Task>; now: Now; target: boolean }): React.JSX.Element {
  const { setNodeRef } = useDroppable({ id: `col:${status}` })
  return (
    <section className={`board-col col-${status} ${target ? 'target' : ''}`} data-status={status} aria-label={tr(COLUMN_TITLE[status])}>
      <header className="board-col-head">
        <span className="board-col-title">{tr(COLUMN_TITLE[status])}</span>
        <span className="count">{ids.length}</span>
      </header>
      <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="board-col-body">
          {ids.map((id) => (tasks[id] ? <SortableCard key={id} task={tasks[id]} now={now} /> : null))}
          {ids.length === 0 && <div className="board-empty">{tr('Kéo việc vào đây')}</div>}
        </div>
      </SortableContext>
    </section>
  )
}

export function KanbanView(): React.JSX.Element {
  const now = useNow()
  const sel = useUi((s) => s.selection)
  const search = useUi((s) => s.search)
  const tasks = useData((s) => s.tasks)
  const terms = useMemo(() => searchTerms(search), [search])
  const stable = useMemo(() => {
    const all = Object.values(tasks).filter((t) => matchesTerms(t, terms, normalizeText))
    return idsOf(boardColumns(all, sel, now))
  }, [tasks, sel, now, terms])
  // Trong lúc kéo: thẻ chuyển cột ngay khi con trỏ sang cột mới (thứ tự tạm, chỉ ghi lúc thả)
  const [drag, setDrag] = useState<{ id: string; cols: Columns } | null>(null)
  const cols = drag?.cols ?? stable
  const { title } = useSelectionTitle(sel, now)
  const sensors = useSensors(
    // Di chuột quá 6 px mới là kéo — bấm thường vẫn mở khung sửa
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } })
  )
  const titleOf = (id: UniqueIdentifier): string => tasks[String(id)]?.title ?? ''
  const columnName = (id: UniqueIdentifier | undefined): string => {
    const c = id === undefined ? null : columnOf(id, cols)
    return c ? tr(COLUMN_TITLE[c]) : ''
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => tr('Đã nhấc "{title}"', { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? tr('"{title}" đang ở cột {column}', { title: titleOf(active.id), column: columnName(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? tr('Đã thả "{title}" vào cột {column}', { title: titleOf(active.id), column: columnName(over.id) }) : undefined),
    onDragCancel: ({ active }) => tr('Đã huỷ kéo "{title}"', { title: titleOf(active.id) })
  }

  const onDragStart = ({ active }: DragStartEvent): void => setDrag({ id: String(active.id), cols: stable })
  const onDragOver = ({ active, over }: DragOverEvent): void => {
    if (!over) return
    setDrag((d) => {
      if (!d) return d
      const from = columnOf(active.id, d.cols)
      const to = columnOf(over.id, d.cols)
      if (!from || !to || from === to) return d
      const id = String(active.id)
      const target = d.cols[to]
      const overIndex = target.indexOf(String(over.id))
      const index = overIndex >= 0 ? overIndex : target.length
      return { ...d, cols: { ...d.cols, [from]: d.cols[from].filter((x) => x !== id), [to]: [...target.slice(0, index), id, ...target.slice(index)] } }
    })
  }
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const d = drag
    setDrag(null)
    const id = String(active.id)
    const task = tasks[id]
    if (!d || !over || !task) return
    const to = columnOf(over.id, d.cols)
    if (!to) return
    let list = d.cols[to]
    const from = list.indexOf(id)
    const overIndex = list.indexOf(String(over.id))
    if (from >= 0 && overIndex >= 0 && from !== overIndex) list = arrayMove(list, from, overIndex)
    const index = list.indexOf(id)
    // Thả lại đúng chỗ cũ: không làm gì
    if (to === task.status && stable[to].indexOf(id) === index) return
    const { beforeId, afterId } = dropNeighbours(
      list.filter((x) => x !== id),
      index
    )
    void moveTask(task, to, beforeId, afterId)
  }

  const portal = document.getElementById('portal-root')
  const active = drag ? tasks[drag.id] : undefined
  const targetColumn = drag ? columnOf(drag.id, drag.cols) : null
  const showQuickAdd = !terms.length && !(sel.kind === 'smart' && (sel.id === 'done' || sel.id === 'overdue'))
  return (
    <div className="board-view">
      <header className="list-head">
        <h2>{terms.length ? tr('Kết quả tìm kiếm') : title}</h2>
      </header>
      {showQuickAdd && <QuickAdd sel={sel} today={now.date} />}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{ announcements, screenReaderInstructions: { draggable: tr('Nhấn Space để nhấc thẻ, phím mũi tên để di chuyển, Space để thả, Esc để huỷ.') } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <div className="board">
          {BOARD_COLUMNS.map((status) => (
            <BoardColumn key={status} status={status} ids={cols[status]} tasks={tasks} now={now} target={targetColumn === status} />
          ))}
        </div>
        {portal && createPortal(<DragOverlay>{active ? <TaskCard task={active} now={now} overlay /> : null}</DragOverlay>, portal)}
      </DndContext>
    </div>
  )
}
