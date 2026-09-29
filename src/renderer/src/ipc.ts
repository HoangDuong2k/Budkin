import type { ArgsOf, Channel, ErrorCode, ResultOf } from '../../shared/api'

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string
  ) {
    super(message)
  }
}

/** Gọi main process; lỗi main trả về được ném thành ApiError (kèm mã lỗi) */
export async function call<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<ResultOf<C>> {
  const res = await window.api.invoke(channel, ...args)
  if (!res.ok) throw new ApiError(res.error.code, res.error.message)
  return res.value
}
