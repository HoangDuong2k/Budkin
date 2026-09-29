import type { ErrorCode } from '../shared/api'

/** Lỗi nghiệp vụ trả về renderer kèm mã (renderer hiện thông báo phù hợp) */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string
  ) {
    super(message)
  }
}
