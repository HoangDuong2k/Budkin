// Thẻ việc trên Kanban: vạch màu theo mức ưu tiên, tiêu đề, hạn, nhắc, lặp, checklist, dự án, nhãn.
// Dùng chung cho thẻ nằm trong cột và bản sao nổi đi theo con trỏ khi kéo (DragOverlay)
import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react'
import { isOverdue, type Now } from '../../../shared/filters'
import { tr } from '../../../shared/i18n'
import { LABEL_COLORS } from '../../../shared/palette'
import type { Task } from '../../../shared/types'
import { useData } from '../state/dataStore'
import { useTheme } from '../state/themeStore'
import { useUi } from '../state/uiStore'
import { dueText } from './format'
import { Icon } from './icons'

/** Hiện tối đa chừng này nhãn trên thẻ (còn lại gộp "+N") */
const MAX_TAGS = 2

interface Props extends HTMLAttributes<HTMLDivElement> {
  task: Task
  now: Now
  /** Thẻ gốc đang được kéo (mờ đi, chừa chỗ) */
  dragging?: boolean
  /** Bản sao nổi đi theo con trỏ */
  overlay?: boolean
}

export const TaskCard = forwardRef<HTMLDivElement, Props>(function TaskCard({ task, now, dragging, overlay, className = '', ...rest }, ref) {
  const project = useData((s) => (task.projectId ? s.projects[task.projectId] : undefined))
  const tags = useData((s) => s.tags)
  const theme = useTheme((s) => s.theme)
  const selected = useUi((s) => s.editingId === task.id)
  const done = task.status === 'done'
  const late = isOverdue(task, now)
  const checked = task.checklist.filter((c) => c.done).length
  const tagList = task.tagIds.map((id) => tags[id]).filter((t) => t !== undefined)
  return (
    <div
      ref={ref}
      className={['task-card', `prio-${task.priority}`, done ? 'done' : '', selected ? 'selected' : '', dragging ? 'dragging' : '', overlay ? 'overlay' : '', className].join(' ')}
      data-task-id={task.id}
      {...rest}
    >
      <div className="card-title">{task.title}</div>
      <div className="card-meta">
        {task.dueDate && (
          <span className={`meta due ${late ? 'late' : task.dueDate === now.date ? 'today' : ''}`}>
            <Icon name="calendar" size={11} />
            {dueText(task, now.date)}
          </span>
        )}
        {task.remindBeforeMin !== null && !done && <Icon name="bell" size={11} className="meta-icon" aria-label={tr('Có nhắc việc')} />}
        {task.recurrence && <Icon name="repeat" size={11} className="meta-icon" aria-label={tr('Lặp lại')} />}
        {task.checklist.length > 0 && (
          <span className={`meta ${checked === task.checklist.length ? 'complete' : ''}`}>
            <Icon name="checklist" size={11} />
            {checked}/{task.checklist.length}
          </span>
        )}
      </div>
      {(project || tagList.length > 0) && (
        <div className="card-meta">
          {project && (
            <span className="meta project">
              <i className="dot" style={{ background: LABEL_COLORS[project.color][theme] }} />
              {project.name}
            </span>
          )}
          {tagList.slice(0, MAX_TAGS).map((tag) => (
            <span key={tag.id} className="tag-chip" style={{ '--c': LABEL_COLORS[tag.color][theme] } as CSSProperties}>
              #{tag.name}
            </span>
          ))}
          {tagList.length > MAX_TAGS && <span className="meta">+{tagList.length - MAX_TAGS}</span>}
        </div>
      )}
    </div>
  )
})
