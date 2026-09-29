// Hợp đồng IPC giữa renderer (window.api) và main process.
// Tên kênh và kiểu tham số/kết quả khai báo một chỗ; main thiếu handler nào là lỗi biên dịch (xem main/ipc.ts).
import type { BootInfo } from './boot'
import type { Theme } from './palette'

export interface AppInfo {
  version: string
  platform: string
  electron: string
  chrome: string
  node: string
  /** Phiên bản SQLite của node:sqlite trong Electron */
  sqlite: string
  /** app.getGPUFeatureStatus() — để chẩn đoán máy không có WebGL */
  gpu: Record<string, string>
  test: boolean
}

export type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL'

/** Kết quả mọi lời gọi IPC: lỗi đi kèm mã (Error ném qua contextBridge sẽ mất các trường riêng) */
export type ApiResponse<T> = { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string } }

/** Kênh renderer → main */
export interface InvokeMap {
  'app:info': { args: []; result: AppInfo }
  /** Đổi theme (bật/tắt đèn): lưu lại, đổi theme hệ thống của cửa sổ và màu nền */
  'app:setTheme': { args: [theme: Theme]; result: void }
}

export type Channel = keyof InvokeMap
export type ArgsOf<C extends Channel> = InvokeMap[C]['args']
export type ResultOf<C extends Channel> = InvokeMap[C]['result']

/** Sự kiện main → renderer */
export interface EventMap {
  'theme:changed': Theme
}

/** window.api — preload mở ra cho renderer */
export interface DeskApi {
  boot: BootInfo
  invoke<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<ApiResponse<ResultOf<C>>>
  on<K extends keyof EventMap>(channel: K, cb: (data: EventMap[K]) => void): () => void
}
