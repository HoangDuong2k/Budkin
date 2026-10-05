// Khung sửa task (trượt ra bên phải màn hình). Tự lưu: tiêu đề khi rời ô / Enter, ghi chú sau 0,5 s, còn lại lưu ngay.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, Checkbox, Combobox, IconButton, Textarea, ToggleGroup, ToggleGroupItem, cn } from 'momi-ui'
import { tr, trKey } from '../../../shared/i18n'
import { LABEL_COLORS } from '../../../shared/palette'
import type { TaskPatch } from '../../../shared/schemas'
import { DEFAULT_SETTINGS, type Priority, type Task, type TaskStatus } from '../../../shared/types'
import { useNow } from '../clock'
import { useData } from '../state/dataStore'
import { useTheme } from '../state/themeStore'
import { useUi } from '../state/uiStore'
import { completeTask, deleteTask, run, skipOccurrence } from './actions'
import { DuePicker, type Due } from './DuePicker'
import { PRIORITY_LABELS, REMIND_ALL_DAY, REMIND_TIMED, describeRule, dueText, nextColor, reminderText } from './format'
import { Icon } from './icons'
import { RecurrencePicker } from './RecurrencePicker'
import { MenuItem, Popover } from './ui'

const STATUSES: Array<{ id: TaskStatus; label: string }> = [
  { id: 'todo', label: trKey('Cần làm') },
  { id: 'in_progress', label: trKey('Đang làm') },
  { id: 'done', label: trKey('Xong') }
]

/** Ô nhập tự giãn theo nội dung */
function useAutosize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [ref, value])
}

/** Nút mở bộ chọn của một trường (Hạn, Nhắc, Lặp lại, Dự án): nút ghost, chưa có giá trị thì chữ nhạt */
function ValueButton({ empty, className, ...props }: React.ComponentProps<typeof Button> & { empty?: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('value-btn max-w-full justify-start px-2.5 font-normal', empty && 'is-empty text-muted-foreground', className)}
      {...props}
    />
  )
}

function Field({ name, icon, label, children }: { name: string; icon: Parameters<typeof Icon>[0]['name']; label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="field" data-field={name}>
      <span className="field-label">
        <Icon name={icon} size={14} />
        {label}
      </span>
      <div className="field-value">{children}</div>
    </div>
  )
}

/** Nhãn của việc: Combobox chọn nhiều của momi-ui — gõ để lọc (không dấu cũng được), Enter tạo nhãn mới khi chưa có */
function TagPicker({ task, patch }: { task: Task; patch: (p: TaskPatch) => void }): React.JSX.Element {
  const tags = useData((s) => s.tags)
  const theme = useTheme((s) => s.theme)
  const options = Object.values(tags)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ value: t.id, label: t.name, icon: <span style={{ color: LABEL_COLORS[t.color][theme] }}>#</span> }))
  return (
    <Combobox
      multiple
      size="sm"
      className="tag-picker w-full font-normal"
      // Đóng là biến mất ngay: lúc đang chạy hiệu ứng đóng, popover vẫn bắt phím Esc (Esc kế tiếp phải đóng khung sửa)
      contentClassName="data-[state=closed]:animate-none!"
      value={task.tagIds}
      onValueChange={(tagIds) => patch({ tagIds })}
      options={options}
      placeholder={tr('Thêm nhãn…')}
      aria-label={tr('Nhãn')}
      labels={{ create: (query) => tr('Tạo nhãn "{name}"', { name: query.trim().replace(/^#/, '') }) }}
      onCreate={async (query) => {
        const name = query.trim().replace(/^#/, '').slice(0, 40)
        if (!name) return
        const res = await run('tags:create', { name, color: nextColor(Object.keys(tags).length) })
        return res.ok ? { value: res.value.id, label: res.value.name } : undefined
      }}
      renderChip={(option, remove) => {
        const tag = tags[option.value]
        return (
          <span key={option.value} className="tag-chip removable" style={{ '--c': tag ? LABEL_COLORS[tag.color][theme] : 'var(--bk-muted)' } as CSSProperties}>
            #{option.label}
            <span
              role="button"
              aria-label={tr('Gỡ nhãn')}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                remove()
              }}
            >
              <Icon name="x" size={11} />
            </span>
          </span>
        )
      }}
    />
  )
}

function Checklist({ task }: { task: Task }): React.JSX.Element {
  const [text, setText] = useState('')
  const add = async (): Promise<void> => {
    const t = text.trim()
    if (!t) return
    setText('')
    await run('checklist:add', task.id, t)
  }
  return (
    <div className="checklist">
      {task.checklist.map((item) => (
        <ChecklistRow key={item.id} id={item.id} text={item.text} done={item.done} />
      ))}
      <div className="checklist-add">
        <Icon name="plus" size={13} />
        <input
          className="inline-input"
          value={text}
          maxLength={500}
          placeholder={tr('Thêm mục…')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void add()
          }}
        />
      </div>
    </div>
  )
}

function ChecklistRow({ id, text, done }: { id: string; text: string; done: boolean }): React.JSX.Element {
  const [value, setValue] = useState(text)
  useEffect(() => setValue(text), [text])
  const save = (): void => {
    const t = value.trim()
    if (!t) setValue(text)
    else if (t !== text) void run('checklist:update', id, { text: t })
  }
  return (
    <div className={`checklist-item ${done ? 'done' : ''}`}>
      <Checkbox size="sm" checked={done} aria-label={tr('Đánh dấu xong')} onCheckedChange={() => void run('checklist:update', id, { done: !done })} />
      <input
        className="inline-input"
        value={value}
        maxLength={500}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur()
        }}
      />
      <IconButton variant="ghost" size="xs" className="checklist-del" aria-label={tr('Xoá mục')} onClick={() => void run('checklist:delete', id)}>
        <Icon name="x" size={12} />
      </IconButton>
    </div>
  )
}

function EditorBody({ task, onClose }: { task: Task; onClose: () => void }): React.JSX.Element {
  const now = useNow()
  const settings = useData((s) => s.settings) ?? DEFAULT_SETTINGS
  const projects = useData((s) => s.projects)
  const theme = useTheme((s) => s.theme)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [pop, setPop] = useState<null | 'due' | 'remind' | 'repeat' | 'project' | 'delete'>(null)
  const anchors = {
    due: useRef<HTMLButtonElement>(null),
    remind: useRef<HTMLButtonElement>(null),
    repeat: useRef<HTMLButtonElement>(null),
    project: useRef<HTMLButtonElement>(null),
    delete: useRef<HTMLButtonElement>(null)
  }
  useAutosize(titleRef, title)

  // Dữ liệu đổi từ nơi khác (robot, Kanban…) khi không đang gõ thì cập nhật ô nhập
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(task.title)
  }, [task.title])
  useEffect(() => {
    if (document.activeElement !== notesRef.current) setNotes(task.notes)
  }, [task.notes])
  useEffect(() => {
    if (notes === task.notes) return
    const h = setTimeout(() => void run('tasks:update', task.id, { notes }), 500)
    return () => clearTimeout(h)
  }, [notes, task.id, task.notes])
  // Mở task: đưa con trỏ vào cuối tiêu đề (chỉ lúc mở, không phải mỗi lần tiêu đề đổi)
  useEffect(() => {
    const el = titleRef.current
    el?.focus({ preventScroll: true })
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [task.id])

  const patch = (p: TaskPatch): void => void run('tasks:update', task.id, p)
  const saveTitle = (): void => {
    const t = title.replace(/\s+/g, ' ').trim()
    if (!t) setTitle(task.title)
    else if (t !== task.title) patch({ title: t })
  }
  const setDue = (d: Due): void => {
    const p: TaskPatch = { dueDate: d.dueDate, dueTime: d.dueDate ? d.dueTime : null }
    const allDay = !p.dueTime
    const options = allDay ? REMIND_ALL_DAY : REMIND_TIMED
    const fallback = allDay ? 0 : (settings.defaultRemindBeforeMin ?? 0)
    // Lần đầu có hạn: nhắc theo mặc định; đổi giữa cả ngày ↔ có giờ mà mốc cũ không hợp thì về mặc định
    if (d.dueDate && !task.dueDate) p.remindBeforeMin = allDay ? 0 : settings.defaultRemindBeforeMin
    else if (d.dueDate && task.remindBeforeMin !== null && !options.includes(task.remindBeforeMin)) p.remindBeforeMin = fallback
    patch(p)
  }
  const allDay = !task.dueTime
  const project = task.projectId ? projects[task.projectId] : undefined

  return (
    <aside className="editor" aria-label={tr('Chi tiết việc')}>
      <div className="editor-top">
        <IconButton variant="ghost" size="sm" onClick={onClose} aria-label={tr('Đóng')}>
          <Icon name="x" />
        </IconButton>
        <div className="grow" />
        {task.recurrence && task.status !== 'done' && (
          <IconButton variant="ghost" size="sm" onClick={() => void skipOccurrence(task)} aria-label={tr('Bỏ qua lần này')} title={tr('Bỏ qua lần này')}>
            <Icon name="skip" />
          </IconButton>
        )}
        <IconButton
          ref={anchors.delete}
          variant="ghost"
          tone="danger"
          size="sm"
          className="delete-task"
          // Việc lặp lại: hỏi xoá lần này hay cả chuỗi
          onClick={() => (task.seriesId ? setPop(pop === 'delete' ? null : 'delete') : void deleteTask(task))}
          aria-label={tr('Xoá việc')}
          title={tr('Xoá việc')}
        >
          <Icon name="trash" />
        </IconButton>
        <Popover anchor={anchors.delete.current} open={pop === 'delete'} onClose={() => setPop(null)} align="end">
          <div className="menu">
            <MenuItem danger onClick={() => void deleteTask(task, 'one')}>
              {tr('Chỉ xoá lần này')}
            </MenuItem>
            <MenuItem danger onClick={() => void deleteTask(task, 'series')}>
              {tr('Xoá cả chuỗi lặp lại')}
            </MenuItem>
            <div className="menu-note">{tr('Các lần đã xong vẫn được giữ lại.')}</div>
          </div>
        </Popover>
      </div>
      <textarea
        ref={titleRef}
        className="editor-title"
        rows={1}
        value={title}
        maxLength={500}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            titleRef.current?.blur()
          }
        }}
      />
      <ToggleGroup
        type="single"
        variant="segmented"
        size="sm"
        className="status-switch mb-1 self-start"
        value={task.status}
        // Xong: robot ăn mừng, việc lặp lại báo lần tới
        onValueChange={(v) => void (v === 'done' && task.status !== 'done' ? completeTask(task) : run('tasks:setStatus', task.id, v as TaskStatus))}
        aria-label={tr('Trạng thái')}
      >
        {STATUSES.map((s) => (
          <ToggleGroupItem key={s.id} value={s.id}>
            {tr(s.label)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Field name="due" icon="calendar" label={tr('Hạn')}>
        <ValueButton ref={anchors.due} empty={!task.dueDate} onClick={() => setPop(pop === 'due' ? null : 'due')}>
          {task.dueDate ? dueText(task, now.date) : tr('Thêm hạn')}
        </ValueButton>
        <Popover anchor={anchors.due.current} open={pop === 'due'} onClose={() => setPop(null)}>
          <DuePicker value={{ dueDate: task.dueDate, dueTime: task.dueTime }} today={now.date} weekStart={settings.weekStart} onChange={setDue} />
        </Popover>
      </Field>

      <Field name="remind" icon="bell" label={tr('Nhắc')}>
        <ValueButton
          ref={anchors.remind}
          empty={task.remindBeforeMin === null}
          disabled={!task.dueDate}
          title={task.dueDate ? undefined : tr('Đặt hạn trước để nhắc việc')}
          onClick={() => setPop(pop === 'remind' ? null : 'remind')}
        >
          {task.dueDate ? reminderText(task.remindBeforeMin, allDay) : tr('Cần có hạn')}
        </ValueButton>
        <Popover anchor={anchors.remind.current} open={pop === 'remind'} onClose={() => setPop(null)}>
          <div className="menu">
            {[null, ...(allDay ? REMIND_ALL_DAY : REMIND_TIMED)].map((m) => (
              <MenuItem
                key={String(m)}
                on={task.remindBeforeMin === m}
                onClick={() => {
                  patch({ remindBeforeMin: m })
                  setPop(null)
                }}
              >
                {reminderText(m, allDay)}
              </MenuItem>
            ))}
            {allDay && <div className="menu-note">{tr('Việc cả ngày nhắc lúc {time}', { time: settings.allDayRemindTime })}</div>}
          </div>
        </Popover>
      </Field>

      <Field name="repeat" icon="repeat" label={tr('Lặp lại')}>
        <ValueButton
          ref={anchors.repeat}
          empty={!task.recurrence}
          disabled={!task.dueDate}
          title={task.dueDate ? undefined : tr('Đặt hạn trước để lặp lại')}
          onClick={() => setPop(pop === 'repeat' ? null : 'repeat')}
        >
          {task.dueDate ? describeRule(task.recurrence, task.dueDate) : tr('Cần có hạn')}
        </ValueButton>
        {task.dueDate && (
          <Popover anchor={anchors.repeat.current} open={pop === 'repeat'} onClose={() => setPop(null)} width={290}>
            <RecurrencePicker
              value={task.recurrence}
              dueDate={task.dueDate}
              weekStart={settings.weekStart}
              onChange={(rule) => {
                patch({ recurrence: rule })
                setPop(null)
              }}
            />
          </Popover>
        )}
      </Field>

      <Field name="priority" icon="flag" label={tr('Ưu tiên')}>
        <div className="prio-picker">
          {([0, 1, 2, 3] as Priority[]).map((p) => (
            <IconButton
              key={p}
              variant={task.priority === p ? 'outline' : 'ghost'}
              size="sm"
              className={`prio-btn prio-${p} ${task.priority === p ? 'on' : ''}`}
              // Màu cờ theo mức ưu tiên (đang chọn thì có viền và nền pha cùng màu)
              style={{ color: p ? `var(--prio-${p})` : 'var(--faint)' }}
              aria-pressed={task.priority === p}
              title={tr(PRIORITY_LABELS[p])}
              aria-label={tr(PRIORITY_LABELS[p])}
              onClick={() => patch({ priority: p })}
            >
              <Icon name="flag" size={14} />
            </IconButton>
          ))}
        </div>
      </Field>

      <Field name="project" icon="folder" label={tr('Dự án')}>
        <ValueButton ref={anchors.project} empty={!project} onClick={() => setPop(pop === 'project' ? null : 'project')}>
          {project ? (
            <>
              <i className="dot" style={{ background: LABEL_COLORS[project.color][theme] }} />
              {project.name}
            </>
          ) : (
            tr('Hộp thư')
          )}
        </ValueButton>
        <Popover anchor={anchors.project.current} open={pop === 'project'} onClose={() => setPop(null)}>
          <div className="menu">
            <MenuItem
              on={task.projectId === null}
              onClick={() => {
                patch({ projectId: null })
                setPop(null)
              }}
            >
              <Icon name="inbox" size={13} />
              {tr('Hộp thư (không dự án)')}
            </MenuItem>
            {Object.values(projects)
              .filter((p) => p.archivedAt === null)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((p) => (
                <MenuItem
                  key={p.id}
                  on={task.projectId === p.id}
                  onClick={() => {
                    patch({ projectId: p.id })
                    setPop(null)
                  }}
                >
                  <i className="dot" style={{ background: LABEL_COLORS[p.color][theme] }} />
                  {p.name}
                </MenuItem>
              ))}
          </div>
        </Popover>
      </Field>

      <Field name="tags" icon="hash" label={tr('Nhãn')}>
        <TagPicker task={task} patch={patch} />
      </Field>

      <div className="editor-block">
        <div className="block-title">
          <Icon name="checklist" size={14} />
          {tr('Checklist')}
          {task.checklist.length > 0 && (
            <span className="muted">
              {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
            </span>
          )}
        </div>
        <Checklist task={task} />
      </div>

      <div className="editor-block">
        <div className="block-title">
          <Icon name="note" size={14} />
          {tr('Ghi chú')}
        </div>
        <Textarea
          ref={notesRef}
          className="notes"
          rows={3}
          autoResize
          value={notes}
          maxLength={20000}
          placeholder={tr('Thêm ghi chú…')}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== task.notes) patch({ notes })
          }}
        />
      </div>
    </aside>
  )
}

export function TaskEditor(): React.JSX.Element | null {
  const id = useUi((s) => s.editingId)
  const task = useData((s) => (id ? s.tasks[id] : undefined))
  const loaded = useData((s) => s.loaded)
  const close = useUi((s) => s.openEditor)
  // Task không còn (bị xoá ở nơi khác) → đóng khung sửa
  useEffect(() => {
    if (id && loaded && !task) close(null)
  }, [id, task, loaded, close])
  if (!id || !task) return null
  return <EditorBody key={task.id} task={task} onClose={() => close(null)} />
}
