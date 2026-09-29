// Hợp đồng IPC giữa renderer (window.api) và main process.
// Tên kênh và kiểu tham số/kết quả khai báo một chỗ; main thiếu handler nào là lỗi biên dịch (xem main/ipc.ts).
import type { BootInfo } from './boot'
import type { Theme } from './palette'
import type { AlertItem } from './reminders'
import type {
  ChecklistPatch,
  OrderMove,
  ProjectCreate,
  ProjectPatch,
  SettingsPatch,
  TagCreate,
  TagPatch,
  TaskCreateInput,
  TaskListScope,
  TaskMove,
  TaskPatch
} from './schemas'
import type { ChangeReason, ChangeSet, Project, Settings, Tag, Task, TaskStatus } from './types'

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

export interface StatusResult {
  task: Task
  /** Lần kế tiếp vừa được tạo (task lặp lại) */
  spawned: Task | null
  /** Lần kế tiếp bị gỡ khi bỏ hoàn thành */
  removedSpawnId: string | null
}

/** Nhắc việc đang chờ người dùng xử lý + trạng thái tắt nhắc */
export interface AlertsSnapshot {
  active: AlertItem[]
  /** Đang tắt nhắc tới lúc này (null: không tắt) */
  mutedUntil: number | null
  /** Lần tới bộ nhắc việc kiểm tra lại */
  nextAt: number | null
}

/** Main bảo giao diện chuyển tới đâu (bấm thông báo, menu khay) */
export type NavigateTarget = { kind: 'task'; taskId: string } | { kind: 'today' } | { kind: 'quickAdd' }

/** Kênh renderer → main */
export interface InvokeMap {
  'app:info': { args: []; result: AppInfo }
  /** Đổi theme (bật/tắt đèn): lưu lại, đổi theme hệ thống của cửa sổ và màu nền */
  'app:setTheme': { args: [theme: Theme]; result: void }
  /** Cảnh 3D chạy ổn một lúc: xoá bộ đếm lỗi GPU */
  'app:sceneHealthy': { args: []; result: void }

  'tasks:list': { args: [scope: TaskListScope]; result: Task[] }
  'tasks:get': { args: [id: string]; result: Task }
  'tasks:create': { args: [input: TaskCreateInput]; result: Task }
  'tasks:update': { args: [id: string, patch: TaskPatch]; result: Task }
  'tasks:setStatus': { args: [id: string, status: TaskStatus]; result: StatusResult }
  'tasks:move': { args: [id: string, move: TaskMove]; result: Task }
  'tasks:delete': { args: [id: string, mode: 'one' | 'series']; result: void }
  'tasks:restore': { args: [ids: string[]]; result: Task[] }
  /** Việc lặp lại: bỏ qua lần này, dời sang lần kế tiếp (chuỗi hết thì bỏ luôn việc) */
  'tasks:skip': { args: [id: string]; result: Task }

  'projects:list': { args: []; result: Project[] }
  'projects:create': { args: [input: ProjectCreate]; result: Project }
  'projects:update': { args: [id: string, patch: ProjectPatch]; result: Project }
  'projects:delete': { args: [id: string]; result: void }

  'tags:list': { args: []; result: Tag[] }
  'tags:create': { args: [input: TagCreate]; result: Tag }
  'tags:update': { args: [id: string, patch: TagPatch]; result: Tag }
  'tags:delete': { args: [id: string]; result: void }

  'checklist:add': { args: [taskId: string, text: string]; result: Task }
  'checklist:update': { args: [id: string, patch: ChecklistPatch]; result: Task }
  'checklist:delete': { args: [id: string]; result: Task }
  'checklist:move': { args: [id: string, move: OrderMove]; result: Task }

  'settings:get': { args: []; result: Settings }
  'settings:update': { args: [patch: SettingsPatch]; result: Settings }

  'reminders:snapshot': { args: []; result: AlertsSnapshot }
  /** Báo lại sau N phút */
  'reminders:snooze': { args: [taskId: string, minutes: number]; result: AlertsSnapshot }
  /** Bỏ qua nhắc hiện tại (robot dịu lại) */
  'reminders:dismiss': { args: [taskId: string]; result: AlertsSnapshot }
  /** Tắt nhắc N phút (null: bật lại) */
  'reminders:mute': { args: [minutes: number | null]; result: AlertsSnapshot }
}

export type Channel = keyof InvokeMap
export type ArgsOf<C extends Channel> = InvokeMap[C]['args']
export type ResultOf<C extends Channel> = InvokeMap[C]['result']

/** Sự kiện main → renderer */
export interface EventMap {
  'theme:changed': Theme
  /** Dữ liệu đổi (do chính renderer, task lặp lại, nhập dữ liệu…): bản đầy đủ của các đối tượng đã đổi */
  'data:changed': { changes: ChangeSet; reason: ChangeReason }
  'settings:changed': Settings
  /** Danh sách nhắc việc đang chờ đổi */
  'alerts:changed': AlertsSnapshot
  /** Vừa tới giờ nhắc (chuông, robot nhún nhảy); snoozed: tất cả là nhắc lại sau khi hoãn */
  'reminder:fired': { items: AlertItem[]; snoozed: boolean }
  'app:navigate': NavigateTarget
  /** Chỉ khi kiểm thử: đồng hồ bị đẩy tới */
  'clock:offset': number
}

/** window.api — preload mở ra cho renderer */
export interface DeskApi {
  boot: BootInfo
  invoke<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<ApiResponse<ResultOf<C>>>
  on<K extends keyof EventMap>(channel: K, cb: (data: EventMap[K]) => void): () => void
}
