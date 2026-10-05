import type { CSSProperties } from 'react'
import { Badge } from 'momi-ui'
import { isOverdue, type Now } from '../../../shared/filters'
import { tr } from '../../../shared/i18n'
import { LABEL_COLORS } from '../../../shared/palette'
import type { Task } from '../../../shared/types'
import { useData } from '../state/dataStore'
import { useTheme } from '../state/themeStore'
import { useUi } from '../state/uiStore'
import { toggleDone } from './actions'
import { dueText } from './format'
import { Icon } from './icons'

/** Một dòng task: ô hoàn thành (viền theo mức ưu tiên), tiêu đề, hạn, nhắc, lặp, checklist, dự án, nhãn */
export function TaskRow({ task, now, showProject }: { task: Task; now: Now; showProject: boolean }): React.JSX.Element {
  const project = useData((s) => (task.projectId ? s.projects[task.projectId] : undefined))
  const tags = useData((s) => s.tags)
  const theme = useTheme((s) => s.theme)
  const selected = useUi((s) => s.editingId === task.id)
  const openEditor = useUi((s) => s.openEditor)
  const done = task.status === 'done'
  const late = isOverdue(task, now)
  const checked = task.checklist.filter((c) => c.done).length
  return (
    <div
      className={`task-row ${selected ? 'selected' : ''} ${done ? 'done' : ''}`}
      role="button"
      tabIndex={0}
      data-task-id={task.id}
      onClick={() => openEditor(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openEditor(task.id)
        if (e.key === ' ') {
          e.preventDefault()
          void toggleDone(task)
        }
      }}
    >
      <button
        className={`check prio-${task.priority} ${task.status}`}
        aria-label={done ? tr('Bỏ hoàn thành') : tr('Hoàn thành')}
        onClick={(e) => {
          e.stopPropagation()
          void toggleDone(task)
        }}
      >
        {done && <Icon name="check" size={11} strokeWidth={3} />}
      </button>
      <div className="task-main">
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {task.status === 'in_progress' && (
            <Badge tone="primary" size="sm" shape="rounded" className="meta doing">
              {tr('Đang làm')}
            </Badge>
          )}
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
          {task.notes.trim() && <Icon name="note" size={12} className="meta-icon" aria-label={tr('Có ghi chú')} />}
          {showProject && project && (
            <span className="meta project">
              <i className="dot" style={{ background: LABEL_COLORS[project.color][theme] }} />
              {project.name}
            </span>
          )}
          {task.tagIds.map((id) => {
            const tag = tags[id]
            if (!tag) return null
            return (
              <span key={id} className="tag-chip" style={{ '--c': LABEL_COLORS[tag.color][theme] } as CSSProperties}>
                #{tag.name}
              </span>
            )
          })}
        </span>
      </div>
    </div>
  )
}
