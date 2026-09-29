// Thao tác dữ liệu từ giao diện: gọi main, lỗi thì hiện toast (không bao giờ ném ra giao diện)
import type { ArgsOf, Channel, ResultOf } from '../../../shared/api'
import { tr } from '../../../shared/i18n'
import { orderBetween } from '../../../shared/ordering'
import type { TaskPatch } from '../../../shared/schemas'
import type { Task, TaskStatus } from '../../../shared/types'
import { now, nowParts } from '../clock'
import { ApiError, call } from '../ipc'
import { dispatchRobot } from '../scene/robotState'
import { useData } from '../state/dataStore'
import { useUi } from '../state/uiStore'

export type RunResult<T> = { ok: true; value: T } | { ok: false }

function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION') return tr('Dữ liệu không hợp lệ')
    if (err.code === 'NOT_FOUND') return tr('Không tìm thấy (có thể đã bị xoá)')
    if (err.code === 'CONFLICT') return tr('Bị trùng hoặc xung đột dữ liệu')
  }
  return tr('Có lỗi xảy ra: {detail}', { detail: err instanceof Error ? err.message : String(err) })
}

/** Gọi main; lỗi → toast */
export async function run<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<RunResult<ResultOf<C>>> {
  try {
    return { ok: true, value: await call(channel, ...args) }
  } catch (err) {
    console.error(`[${channel}]`, err)
    useUi.getState().toast({ text: errorText(err), tone: 'error' })
    return { ok: false }
  }
}

/** Hoàn thành việc: robot ăn mừng */
function celebrate(): void {
  dispatchRobot({ type: 'celebrate', at: performance.now() })
}

export async function toggleDone(task: Task): Promise<void> {
  const status: TaskStatus = task.status === 'done' ? 'todo' : 'done'
  const res = await run('tasks:setStatus', task.id, status)
  if (res.ok && status === 'done') celebrate()
}

/** Thêm việc nhanh (phím N, nút trên thanh trên, menu khay): "Đã xong" / "Quá hạn" không có ô thêm việc → chuyển sang Hôm nay */
export function startQuickAdd(): void {
  const ui = useUi.getState()
  if (ui.selection.kind === 'smart' && (ui.selection.id === 'done' || ui.selection.id === 'overdue')) ui.select({ kind: 'smart', id: 'today' })
  if (ui.search) ui.setSearch('')
  ui.focusQuickAdd()
}

/** Mở một việc trên màn hình: chọn danh sách có chứa nó rồi mở khung sửa */
export function openTask(taskId: string): void {
  const ui = useUi.getState()
  const task = useData.getState().tasks[taskId]
  ui.select({ kind: 'smart', id: task?.dueDate && task.dueDate <= nowParts().date ? 'today' : 'all' })
  ui.openEditor(taskId)
}

/** Đặt lại một việc trong bộ đệm (trả lại khi thao tác lạc quan bị lỗi) */
function putTask(task: Task): void {
  useData.setState({ tasks: { ...useData.getState().tasks, [task.id]: task } })
}

/**
 * Kéo thẻ trên Kanban: sang cột `status`, nằm giữa beforeId / afterId. Hiện ngay trên màn hình (lạc quan), main trả về
 * bản chuẩn qua data:changed; lỗi thì trả thẻ về chỗ cũ. Kéo sang "Đã xong" thì robot ăn mừng
 */
export async function moveTask(task: Task, status: TaskStatus, beforeId: string | null, afterId: string | null): Promise<void> {
  const tasks = useData.getState().tasks
  const prev = tasks[task.id] ?? task
  const order = orderBetween(beforeId ? (tasks[beforeId]?.sortOrder ?? null) : null, afterId ? (tasks[afterId]?.sortOrder ?? null) : null)
  putTask({ ...prev, status, sortOrder: order ?? prev.sortOrder, completedAt: status === 'done' ? (prev.completedAt ?? now()) : null })
  const res = await run('tasks:move', task.id, { status, beforeId, afterId })
  if (!res.ok) putTask(prev)
  else if (status === 'done' && prev.status !== 'done') celebrate()
}

/** Kéo việc trên Lịch sang ngày khác (null: bỏ hạn). Việc chưa có hạn được xếp lịch thì nhắc trong ngày đến hạn */
export async function rescheduleTask(task: Task, dueDate: string | null): Promise<void> {
  const prev = useData.getState().tasks[task.id] ?? task
  if (prev.dueDate === dueDate) return
  const patch: TaskPatch = { dueDate }
  if (dueDate && !prev.dueDate) patch.remindBeforeMin = 0
  putTask({
    ...prev,
    dueDate,
    dueTime: dueDate ? prev.dueTime : null,
    remindBeforeMin: dueDate ? (patch.remindBeforeMin ?? prev.remindBeforeMin) : null
  })
  const res = await run('tasks:update', task.id, patch)
  if (!res.ok) putTask(prev)
}

// ---- Nhắc việc (bong bóng thoại của robot, banner trong màn hình) ----

export async function completeReminder(taskId: string): Promise<void> {
  const res = await run('tasks:setStatus', taskId, 'done')
  if (res.ok) celebrate()
}

export async function snoozeReminder(taskId: string, minutes: number): Promise<void> {
  await run('reminders:snooze', taskId, minutes)
}

export async function dismissReminder(taskId: string): Promise<void> {
  await run('reminders:dismiss', taskId)
}

function short(title: string): string {
  return title.length > 40 ? `${title.slice(0, 40)}…` : title
}

/** Xoá task, kèm nút hoàn tác trên toast */
export async function deleteTask(task: Task, mode: 'one' | 'series' = 'one'): Promise<void> {
  const ui = useUi.getState()
  if (ui.editingId === task.id) ui.openEditor(null)
  const res = await run('tasks:delete', task.id, mode)
  if (!res.ok) return
  useUi.getState().toast({
    text: tr('Đã xoá "{title}"', { title: short(task.title) }),
    action: { label: tr('Hoàn tác'), run: () => void run('tasks:restore', [task.id]) }
  })
}
