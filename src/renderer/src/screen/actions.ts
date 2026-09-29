// Thao tác dữ liệu từ giao diện: gọi main, lỗi thì hiện toast (không bao giờ ném ra giao diện)
import type { ArgsOf, Channel, ResultOf } from '../../../shared/api'
import { tr } from '../../../shared/i18n'
import type { Task, TaskStatus } from '../../../shared/types'
import { ApiError, call } from '../ipc'
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

export async function toggleDone(task: Task): Promise<void> {
  const status: TaskStatus = task.status === 'done' ? 'todo' : 'done'
  await run('tasks:setStatus', task.id, status)
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
