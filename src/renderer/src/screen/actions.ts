// Thao tác dữ liệu từ giao diện: gọi main, lỗi thì hiện toast (không bao giờ ném ra giao diện)
import type { ArgsOf, Channel, ResultOf } from '../../../shared/api'
import { tr } from '../../../shared/i18n'
import type { Task, TaskStatus } from '../../../shared/types'
import { nowParts } from '../clock'
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
