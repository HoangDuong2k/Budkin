import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { ApiResponse, ArgsOf, Channel, ResultOf } from '../shared/api'
import { AppError } from './errors'

interface Handler<C extends Channel> {
  /** Kiểm tra toàn bộ tham số renderer gửi lên (renderer không bao giờ được tin tuyệt đối) */
  args: z.ZodType<ArgsOf<C>>
  run: (...args: ArgsOf<C>) => ResultOf<C> | Promise<ResultOf<C>>
}

/** Mỗi kênh trong InvokeMap phải có đúng một handler — thiếu là lỗi biên dịch */
export type Handlers = { [C in Channel]: Handler<C> }

/** Một nhóm handler (ghép các nhóm lại thành Handlers đầy đủ) */
export type HandlerGroup<K extends Channel> = Pick<Handlers, K>

export function registerAll(handlers: Handlers, isTrusted: (event: IpcMainInvokeEvent) => boolean): void {
  for (const channel of Object.keys(handlers) as Channel[]) {
    const handler = handlers[channel] as unknown as Handler<Channel>
    ipcMain.handle(channel, async (event, ...raw: unknown[]): Promise<ApiResponse<unknown>> => {
      if (!isTrusted(event)) return { ok: false, error: { code: 'VALIDATION', message: 'Untrusted sender' } }
      const parsed = handler.args.safeParse(raw)
      if (!parsed.success) return { ok: false, error: { code: 'VALIDATION', message: z.prettifyError(parsed.error) } }
      try {
        return { ok: true, value: await handler.run(...(parsed.data as ArgsOf<Channel>)) }
      } catch (err) {
        if (err instanceof AppError) return { ok: false, error: { code: err.code, message: err.message } }
        console.error(`[ipc] ${channel}`, err)
        return { ok: false, error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) } }
      }
    })
  }
}
