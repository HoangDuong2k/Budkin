// Nội dung thẻ việc trên Kanban (ô thẻ do Kanban của momi-ui vẽ): dự án ở dòng trên, tiêu đề, hạn (kèm "Quá hạn"),
// nhắc, lặp, checklist; chân thẻ có mức ưu tiên và nhãn. Dùng chung cho thẻ trong cột và bản sao nổi khi kéo
import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react'
import { Badge } from 'momi-ui'
import { isOverdue, type Now } from '../../../shared/filters'
import { tr, trKey } from '../../../shared/i18n'
import { LABEL_COLORS } from '../../../shared/palette'
import type { Task } from '../../../shared/types'
import { useData } from '../state/dataStore'
import { useTheme } from '../state/themeStore'
import { useUi } from '../state/uiStore'
import { dueText } from './format'
import { Icon } from './icons'

/** Hiện tối đa chừng này nhãn trên thẻ (còn lại gộp "+N") */
const MAX_TAGS = 2

/** Tên mức ưu tiên trên chân thẻ (0: không hiện) */
const PRIORITY_LABEL = ['', trKey('Thấp'), trKey('Vừa'), trKey('Cao')]

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
      {project && (
        <div className="card-top">
          <i className="dot" style={{ background: LABEL_COLORS[project.color][theme] }} />
          <span className="label">{project.name}</span>
        </div>
      )}
      <div className="card-title">{task.title}</div>
      <div className="card-meta">
        {task.dueDate && (
          <span className={`meta due ${late ? 'late' : task.dueDate === now.date ? 'today' : ''}`}>
            <Icon name="calendar" size={12} />
            {dueText(task, now.date)}
          </span>
        )}
        {task.remindBeforeMin !== null && !done && <Icon name="bell" size={12} className="meta-icon" aria-label={tr('Có nhắc việc')} />}
        {task.recurrence && <Icon name="repeat" size={12} className="meta-icon" aria-label={tr('Lặp lại')} />}
        {task.checklist.length > 0 && (
          <span className={`meta ${checked === task.checklist.length ? 'complete' : ''}`}>
            <Icon name="checklist" size={12} />
            {checked}/{task.checklist.length}
          </span>
        )}
        {late && (
          <Badge tone="danger" size="sm" shape="rounded" className="card-late ms-auto">
            {tr('Quá hạn')}
          </Badge>
        )}
      </div>
      {(task.priority > 0 || tagList.length > 0) && (
        <div className="card-foot">
          {task.priority > 0 && (
            <Badge variant="outline" size="sm" shape="rounded" className="prio-pill">
              <Icon name="flag" size={11} />
              {tr(PRIORITY_LABEL[task.priority])}
            </Badge>
          )}
          {tagList.length > 0 && (
            <span className="card-tags">
              {tagList.slice(0, MAX_TAGS).map((tag) => (
                <span key={tag.id} className="tag-chip" style={{ '--c': LABEL_COLORS[tag.color][theme] } as CSSProperties}>
                  #{tag.name}
                </span>
              ))}
              {tagList.length > MAX_TAGS && <span>+{tagList.length - MAX_TAGS}</span>}
            </span>
          )}
        </div>
      )}
    </div>
  )
})
