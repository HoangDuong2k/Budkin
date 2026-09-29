// Lịch tháng / tuần: việc theo hạn (lọc theo dự án / nhãn đang chọn và ô tìm kiếm). Kéo việc sang ngày khác để đổi hạn
// (nhắc việc tự đặt lại theo hạn mới), kéo lên dải "Chưa có hạn" để bỏ hạn, kéo việc chưa có hạn xuống một ngày để
// xếp lịch. Việc đang kéo vẽ ở #portal-root để nổi trên mọi thứ.
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { addMonths, monthGrid, tasksByDate, weekDays } from '../../../shared/board'
import { upcomingDues } from '../../../shared/recurrence'
import { addDays, isoWeekday, parseYmd } from '../../../shared/datetime'
import { compareByDue, matchesTerms } from '../../../shared/filters'
import { tr } from '../../../shared/i18n'
import { normalizeText, searchTerms } from '../../../shared/search'
import type { Task } from '../../../shared/types'
import { useNow } from '../clock'
import { useData } from '../state/dataStore'
import { useUi } from '../state/uiStore'
import { rescheduleTask } from './actions'
import { monthTitle, weekTitle, weekdayName } from './format'
import { Icon } from './icons'

/** Cao của một việc trong ô lịch tháng (px, gồm khoảng cách) và phần số ngày ở đầu ô */
const CHIP_H = 19
const CELL_HEAD = 22

function ChipBody({ task }: { task: Task }): React.JSX.Element {
  return (
    <>
      {task.dueTime && <span className="cal-chip-time">{task.dueTime}</span>}
      <span className="cal-chip-title">{task.title}</span>
    </>
  )
}

/** Lần lặp sắp tới (chưa có thật): mờ, không kéo được; bấm để mở lần hiện tại */
function GhostChip({ task }: { task: Task }): React.JSX.Element {
  const openEditor = useUi((s) => s.openEditor)
  return (
    <button className={`cal-chip ghost prio-${task.priority}`} data-ghost-of={task.id} title={tr('Lần lặp sắp tới')} onClick={() => openEditor(task.id)}>
      <ChipBody task={task} />
    </button>
  )
}

function Chip({ task }: { task: Task }): React.JSX.Element {
  const openEditor = useUi((s) => s.openEditor)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task:${task.id}` })
  return (
    <button
      ref={setNodeRef}
      className={['cal-chip', `prio-${task.priority}`, task.status === 'done' ? 'done' : '', isDragging ? 'dragging' : ''].join(' ')}
      data-task-id={task.id}
      title={task.title}
      {...attributes}
      {...listeners}
      onClick={() => openEditor(task.id)}
    >
      <ChipBody task={task} />
    </button>
  )
}

function DayCell({
  date,
  tasks,
  ghosts,
  inMonth,
  today,
  max,
  onMore
}: {
  date: string
  tasks: Task[]
  ghosts: Task[]
  inMonth: boolean
  today: string
  max: number
  onMore: (date: string) => void
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` })
  // Việc thật trước, lần lặp sắp tới sau; ô không đủ chỗ thì gộp phần còn lại vào "+N"
  const shown = tasks.slice(0, max)
  const shownGhosts = ghosts.slice(0, Math.max(0, max - shown.length))
  const hidden = tasks.length + ghosts.length - shown.length - shownGhosts.length
  const weekend = isoWeekday(date) >= 6
  return (
    <div
      ref={setNodeRef}
      className={['cal-cell', inMonth ? '' : 'other', weekend ? 'weekend' : '', date === today ? 'today' : '', isOver ? 'over' : ''].join(' ')}
      data-date={date}
    >
      {/* Dòng đầu: số ngày, và "+N việc" khi ô không đủ chỗ (bấm để xem cả tuần) */}
      <div className="cal-cell-head">
        <span className="cal-daynum">{parseYmd(date).d}</span>
        {hidden > 0 && (
          <button className="cal-more" onClick={() => onMore(date)}>
            {tr('+{n} việc', { n: hidden })}
          </button>
        )}
      </div>
      {shown.map((t) => (
        <Chip key={t.id} task={t} />
      ))}
      {shownGhosts.map((t) => (
        <GhostChip key={`ghost:${t.id}`} task={t} />
      ))}
    </div>
  )
}

function WeekColumn({ date, tasks, ghosts, today }: { date: string; tasks: Task[]; ghosts: Task[]; today: string }): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` })
  return (
    <div ref={setNodeRef} className={['cal-week-col', isoWeekday(date) >= 6 ? 'weekend' : '', date === today ? 'today' : '', isOver ? 'over' : ''].join(' ')} data-date={date}>
      <div className="cal-week-head">
        <span className="cal-dow">{weekdayName(isoWeekday(date), true)}</span>
        <span className="cal-daynum">{parseYmd(date).d}</span>
      </div>
      <div className="cal-week-body">
        {tasks.map((t) => (
          <Chip key={t.id} task={t} />
        ))}
        {ghosts.map((t) => (
          <GhostChip key={`ghost:${t.id}`} task={t} />
        ))}
      </div>
    </div>
  )
}

function UndatedStrip({ tasks }: { tasks: Task[] }): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: 'undated' })
  return (
    <div ref={setNodeRef} className={`cal-undated ${isOver ? 'over' : ''}`}>
      <span className="cal-undated-label">
        {tr('Chưa có hạn')}
        <span className="count">{tasks.length}</span>
      </span>
      <div className="cal-undated-list">
        {tasks.map((t) => (
          <Chip key={t.id} task={t} />
        ))}
        {tasks.length === 0 && <span className="cal-undated-empty">{tr('Kéo việc lên đây để bỏ hạn')}</span>}
      </div>
    </div>
  )
}

export function CalendarView(): React.JSX.Element {
  const now = useNow()
  const sel = useUi((s) => s.selection)
  const search = useUi((s) => s.search)
  const mode = useUi((s) => s.calendarMode)
  const setMode = useUi((s) => s.setCalendarMode)
  const cursor = useUi((s) => s.calendarDate) ?? now.date
  const setCursor = useUi((s) => s.setCalendarDate)
  const tasks = useData((s) => s.tasks)
  const weekStart = useData((s) => s.settings?.weekStart ?? 1)
  const terms = useMemo(() => searchTerms(search), [search])
  // Lịch lọc theo dự án / nhãn đang chọn; danh sách thông minh (Hôm nay…) thì hiện hết
  const visible = useMemo(
    () =>
      Object.values(tasks).filter(
        (t) => (sel.kind === 'project' ? t.projectId === sel.id : sel.kind === 'tag' ? t.tagIds.includes(sel.id) : true) && matchesTerms(t, terms, normalizeText)
      ),
    [tasks, sel, terms]
  )
  const { y, m } = parseYmd(cursor)
  const days = mode === 'month' ? monthGrid(y, m, weekStart) : weekDays(cursor, weekStart)
  const from = days[0]
  const to = days[days.length - 1]
  const byDate = useMemo(() => tasksByDate(visible, from, to), [visible, from, to])
  // Các lần lặp sắp tới của việc lặp lại (từ hôm nay trở đi — lần đã lỡ không hiện)
  const ghosts = useMemo(() => {
    const out = new Map<string, Task[]>()
    const start = from > now.date ? from : now.date
    for (const t of visible) {
      if (!t.recurrence || !t.dueDate || t.status === 'done') continue
      for (const d of upcomingDues(t.recurrence, t.dueDate, t.occurrenceIndex ?? 0, start, to)) {
        const list = out.get(d)
        if (list) list.push(t)
        else out.set(d, [t])
      }
    }
    return out
  }, [visible, from, to, now.date])
  const undated = useMemo(() => visible.filter((t) => !t.dueDate && t.status !== 'done').sort(compareByDue), [visible])

  // Số việc vừa một ô lịch tháng: đo chiều cao lưới
  const gridRef = useRef<HTMLDivElement>(null)
  const [cellH, setCellH] = useState(84)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCellH(el.clientHeight / 6))
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])
  const max = Math.max(1, Math.floor((cellH - CELL_HEAD) / CHIP_H))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [dragId, setDragId] = useState<string | null>(null)
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setDragId(null)
    const task = tasks[String(active.id).slice(5)]
    if (!over || !task) return
    const target = String(over.id)
    if (target === 'undated') void rescheduleTask(task, null)
    else if (target.startsWith('day:')) void rescheduleTask(task, target.slice(4))
  }

  const shift = (dir: number): void => setCursor(mode === 'month' ? addMonths(cursor, dir) : addDays(cursor, 7 * dir))
  const title = mode === 'month' ? monthTitle(y, m) : weekTitle(days[0], days[6])
  const portal = document.getElementById('portal-root')
  const dragged = dragId ? tasks[dragId] : undefined
  return (
    <div className="calendar-view">
      <header className="list-head cal-head">
        <h2>{title}</h2>
        <div className="grow" />
        <button className="btn small" onClick={() => setCursor(null)}>
          {tr('Hôm nay')}
        </button>
        <button className="icon-btn" onClick={() => shift(-1)} aria-label={mode === 'month' ? tr('Tháng trước') : tr('Tuần trước')}>
          <Icon name="chevronLeft" />
        </button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label={mode === 'month' ? tr('Tháng sau') : tr('Tuần sau')}>
          <Icon name="chevronRight" />
        </button>
        <div className="segmented" role="radiogroup" aria-label={tr('Kiểu lịch')}>
          <button role="radio" aria-checked={mode === 'month'} className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
            {tr('Tháng')}
          </button>
          <button role="radio" aria-checked={mode === 'week'} className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>
            {tr('Tuần')}
          </button>
        </div>
      </header>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={({ active }) => setDragId(String(active.id).slice(5))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <UndatedStrip tasks={undated} />
        {mode === 'month' ? (
          <>
            <div className="cal-dows">
              {days.slice(0, 7).map((d) => (
                <span key={d} className="cal-dow">
                  {weekdayName(isoWeekday(d), true)}
                </span>
              ))}
            </div>
            <div ref={gridRef} className="cal-grid">
              {days.map((d) => (
                <DayCell
                  key={d}
                  date={d}
                  tasks={byDate.get(d) ?? []}
                  ghosts={ghosts.get(d) ?? []}
                  inMonth={parseYmd(d).m === m}
                  today={now.date}
                  max={max}
                  onMore={(date) => {
                    setCursor(date)
                    setMode('week')
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="cal-week">
            {days.map((d) => (
              <WeekColumn key={d} date={d} tasks={byDate.get(d) ?? []} ghosts={ghosts.get(d) ?? []} today={now.date} />
            ))}
          </div>
        )}
        {portal &&
          createPortal(
            <DragOverlay dropAnimation={null}>
              {dragged ? (
                <div className={['cal-chip', 'overlay', `prio-${dragged.priority}`, dragged.status === 'done' ? 'done' : ''].join(' ')}>
                  <ChipBody task={dragged} />
                </div>
              ) : null}
            </DragOverlay>,
            portal
          )}
      </DndContext>
    </div>
  )
}
