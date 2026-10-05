// Hợp đồng IPC giữa renderer (window.api) và main process.
// Tên kênh và kiểu tham số/kết quả khai báo một chỗ; main thiếu handler nào là lỗi biên dịch (xem main/ipc.ts).
import type { BootInfo, BootPrefs } from './boot'
import type { EntityCounts, ImportMode, ImportPreview, ImportResult } from './exportFormat'
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

/** Thiết lập khởi động đổi được trong Cài đặt (có hiệu lực từ lần mở sau) */
export type BootPatch = Partial<Pick<BootPrefs, 'render' | 'xwayland'>>

/** Tình trạng app cho màn hình Cài đặt */
export interface AppStatus {
  /** Bản đã cài (bản đang phát triển không đăng ký tự khởi động) */
  packaged: boolean
  /** Có khay hệ thống (Ubuntu cần tiện ích AppIndicator) */
  trayHost: boolean
  /** Linux đang chạy phiên Wayland (mới có lựa chọn XWayland) */
  wayland: boolean
  /** Thiết lập khởi động đã lưu — khác `running` thì cần khởi động lại */
  boot: Pick<BootPrefs, 'render' | 'xwayland'>
  /** Thiết lập khởi động của lần chạy này */
  running: Pick<BootPrefs, 'render' | 'xwayland'>
  /** Thư mục dữ liệu (DB, bản sao lưu) */
  dataDir: string
  /** Lần mở này vừa khôi phục từ bản sao lưu nào (null: không) */
  restoredFrom: string | null
}

export type BackupKind = 'daily' | 'manual' | 'before-import' | 'before-restore' | 'pre-migration'

export interface BackupInfo {
  name: string
  kind: BackupKind
  /** Lúc tạo (ms) */
  createdAt: number
  size: number
}

export interface ExportResult {
  path: string
  counts: EntityCounts
}

/** Main bảo giao diện chuyển tới đâu (bấm thông báo, menu khay, menu Budkin → Cài đặt… trên macOS) */
export type NavigateTarget = { kind: 'task'; taskId: string } | { kind: 'today' } | { kind: 'quickAdd' } | { kind: 'settings' }

export type AiActivityKind = 'create' | 'update' | 'delete'

/** Một lần app AI (qua MCP) ghi dữ liệu: giao diện báo kèm nút Hoàn tác */
export interface AiActivity {
  id: string
  /** Tên app AI cho người dùng đọc ("Claude", "Claude Code"…) */
  client: string
  kind: AiActivityKind
  /** Số việc bị ảnh hưởng */
  count: number
  /** Tên vài việc đầu */
  titles: string[]
  taskIds: string[]
  at: number
}

/** Lệnh app AI dùng để chạy cầu nối MCP của Budkin (ghi vào cấu hình của Claude Desktop / Claude Code) */
export interface McpLaunch {
  command: string
  args: string[]
  env?: Record<string, string>
}

/** missing: chưa thấy app trên máy; available: có app, chưa kết nối; connected: đã kết nối đúng; outdated: kết nối trỏ tới chỗ cũ */
export type AiClientState = 'missing' | 'available' | 'connected' | 'outdated'

export interface AiStatus {
  launch: McpLaunch
  desktop: { state: AiClientState; configPath: string | null }
  /** cli: đường dẫn lệnh claude tìm được (null: không thấy — chỉ hiện lệnh để chép) */
  code: { state: AiClientState; cli: string | null; command: string }
  lastUse: { client: string; at: number } | null
}

/** Kênh renderer → main */
export interface InvokeMap {
  'app:info': { args: []; result: AppInfo }
  /** Đổi theme (bật/tắt đèn): lưu lại, đổi theme hệ thống của cửa sổ và màu nền */
  'app:setTheme': { args: [theme: Theme]; result: void }
  /** Cảnh 3D chạy ổn một lúc: xoá bộ đếm lỗi GPU */
  'app:sceneHealthy': { args: []; result: void }
  'app:status': { args: []; result: AppStatus }
  /** Đổi chế độ vẽ / XWayland: lưu vào boot.json, có hiệu lực từ lần mở sau */
  'app:setBoot': { args: [patch: BootPatch]; result: AppStatus }
  /** Khởi động lại app */
  'app:relaunch': { args: []; result: void }
  /** Chép chữ vào bộ nhớ tạm (lệnh, câu hỏi mẫu ở mục Kết nối AI) */
  'app:copy': { args: [text: string]; result: void }

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

  /** Xuất toàn bộ dữ liệu ra file JSON (hộp thoại chọn nơi lưu); null: người dùng huỷ */
  'data:export': { args: []; result: ExportResult | null }
  /** Chọn file để nhập, kiểm tra hợp lệ; null: người dùng huỷ */
  'data:importPick': { args: []; result: ImportPreview | null }
  /** Nhập file vừa chọn: gộp (bản mới hơn thắng) hoặc thay thế toàn bộ. Tự sao lưu trước khi nhập */
  'data:importApply': { args: [token: string, mode: ImportMode]; result: ImportResult }
  'data:backups': { args: []; result: BackupInfo[] }
  'data:backupNow': { args: []; result: BackupInfo }
  /** Khôi phục bản sao lưu: app khởi động lại rồi mới thay dữ liệu */
  'data:restoreBackup': { args: [name: string]; result: void }
  'data:openFolder': { args: [which: 'data' | 'backups']; result: void }

  'reminders:snapshot': { args: []; result: AlertsSnapshot }
  /** Báo lại sau N phút */
  'reminders:snooze': { args: [taskId: string, minutes: number]; result: AlertsSnapshot }
  /** Bỏ qua nhắc hiện tại (robot dịu lại) */
  'reminders:dismiss': { args: [taskId: string]; result: AlertsSnapshot }
  /** Tắt nhắc N phút (null: bật lại) */
  'reminders:mute': { args: [minutes: number | null]; result: AlertsSnapshot }

  /** Kết nối AI: lệnh chạy cầu nối, tình trạng kết nối với Claude Desktop / Claude Code */
  'ai:status': { args: []; result: AiStatus }
  /** Thêm Budkin vào cấu hình của Claude Desktop / Claude Code */
  'ai:connect': { args: [target: 'desktop' | 'code']; result: AiStatus }
  /** Hoàn tác một lần app AI ghi dữ liệu */
  'ai:undo': { args: [id: string]; result: void }
}

export type Channel = keyof InvokeMap
export type ArgsOf<C extends Channel> = InvokeMap[C]['args']
export type ResultOf<C extends Channel> = InvokeMap[C]['result']

/** Sự kiện main → renderer */
export interface EventMap {
  'theme:changed': Theme
  /** Dữ liệu đổi (do chính renderer, task lặp lại, nhập dữ liệu…): bản đầy đủ của các đối tượng đã đổi */
  'data:changed': { changes: ChangeSet; reason: ChangeReason }
  /** Dữ liệu đổi hàng loạt (nhập file): renderer tải lại toàn bộ */
  'data:reload': ImportMode
  'settings:changed': Settings
  /** Danh sách nhắc việc đang chờ đổi */
  'alerts:changed': AlertsSnapshot
  /** Vừa tới giờ nhắc (chuông, robot nhún nhảy); snoozed: tất cả là nhắc lại sau khi hoãn */
  'reminder:fired': { items: AlertItem[]; snoozed: boolean }
  'app:navigate': NavigateTarget
  /** Chỉ khi kiểm thử: đồng hồ bị đẩy tới */
  'clock:offset': number
  /** App AI vừa thêm / sửa / xoá việc */
  'ai:activity': AiActivity
}

/** window.api — preload mở ra cho renderer */
export interface DeskApi {
  boot: BootInfo
  invoke<C extends Channel>(channel: C, ...args: ArgsOf<C>): Promise<ApiResponse<ResultOf<C>>>
  on<K extends keyof EventMap>(channel: K, cb: (data: EventMap[K]) => void): () => void
}
