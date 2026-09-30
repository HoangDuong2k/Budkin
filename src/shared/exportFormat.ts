// Định dạng file xuất / nhập dữ liệu (JSON). Gồm cả bản ghi đã xoá (để gộp dữ liệu giữa hai máy thì việc đã xoá bên
// này cũng bị xoá bên kia). Không có trạng thái nhắc việc (thuộc riêng từng máy) và các thiết lập riêng của máy
// (khay, tự khởi động, chất lượng 3D).
import { z } from 'zod'
import {
  LIMITS,
  checklistTextSchema,
  colorSchema,
  dateSchema,
  idSchema,
  prioritySchema,
  recurrenceSchema,
  settingsPatchSchema,
  statusSchema,
  timeSchema
} from './schemas'

export const EXPORT_FORMAT = 'budkin'
export const EXPORT_VERSION = 1
/** File lớn hơn thế này chắc chắn không phải dữ liệu Budkin */
export const EXPORT_MAX_BYTES = 50 * 1024 * 1024

/** Thiết lập đi theo dữ liệu khi chuyển máy (còn lại là của riêng từng máy) */
export const PORTABLE_SETTINGS = ['language', 'weekStart', 'allDayRemindTime', 'defaultRemindBeforeMin', 'sound', 'volume', 'reducedMotion', 'robot'] as const
export type PortableSetting = (typeof PORTABLE_SETTINGS)[number]

const stamp = z.number().int().min(0)
const order = z.number().finite()
/** Màu lạ (bảng màu của bản app khác): dùng màu trung tính thay vì từ chối cả file */
const color = colorSchema.catch('slate')

const projectSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(LIMITS.name),
  color,
  sortOrder: order,
  archivedAt: stamp.nullable(),
  createdAt: stamp,
  updatedAt: stamp,
  deletedAt: stamp.nullable()
})

const tagSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(LIMITS.tagName),
  color,
  createdAt: stamp,
  updatedAt: stamp,
  deletedAt: stamp.nullable()
})

const checklistItemSchema = z.object({ id: idSchema, text: checklistTextSchema, done: z.boolean(), sortOrder: order })

const taskSchema = z
  .object({
    id: idSchema,
    projectId: idSchema.nullable(),
    title: z.string().trim().min(1).max(LIMITS.title),
    notes: z.string().max(LIMITS.notes),
    status: statusSchema,
    priority: prioritySchema,
    dueDate: dateSchema.nullable(),
    dueTime: timeSchema.nullable(),
    remindBeforeMin: z.number().int().min(0).max(LIMITS.remindBeforeMin).nullable(),
    recurrence: recurrenceSchema.nullable(),
    seriesId: idSchema.nullable(),
    occurrenceIndex: z.number().int().min(0).nullable(),
    nextSpawnedId: idSchema.nullable(),
    sortOrder: order,
    completedAt: stamp.nullable(),
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: stamp.nullable(),
    tagIds: z.array(idSchema).max(LIMITS.tagsPerTask),
    checklist: z.array(checklistItemSchema).max(LIMITS.checklistPerTask)
  })
  .superRefine((t, ctx) => {
    // Cùng các ràng buộc với bảng tasks (CHECK trong SQLite) — báo lỗi rõ ràng thay vì lỗi SQL lúc ghi
    if ((t.status === 'done') !== (t.completedAt !== null)) ctx.addIssue({ code: 'custom', message: 'status/completedAt không khớp' })
    if (!t.dueDate && (t.dueTime || t.remindBeforeMin !== null || t.recurrence)) ctx.addIssue({ code: 'custom', message: 'giờ / nhắc / lặp lại cần có hạn' })
  })

/** Thiết lập trong file: chỉ lấy các khoá đi theo dữ liệu, bỏ qua khoá lạ (bản app mới hơn thêm vào) */
const settingsSchema = settingsPatchSchema.pick(Object.fromEntries(PORTABLE_SETTINGS.map((k) => [k, true])) as Record<PortableSetting, true>).strip()

export const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: stamp,
  appVersion: z.string().max(40).optional(),
  settings: settingsSchema.optional(),
  projects: z.array(projectSchema).max(10_000),
  tags: z.array(tagSchema).max(10_000),
  tasks: z.array(taskSchema).max(200_000)
})

export type ExportFile = z.infer<typeof exportFileSchema>
export type ExportedTask = ExportFile['tasks'][number]

export type ImportMode = 'merge' | 'replace'

/** Đếm theo loại đối tượng (chỉ tính bản ghi chưa xoá) */
export interface EntityCounts {
  tasks: number
  projects: number
  tags: number
}

/** File vừa chọn để nhập, đã kiểm tra hợp lệ — chờ người dùng chọn Gộp hay Thay thế */
export interface ImportPreview {
  token: string
  fileName: string
  exportedAt: number
  appVersion: string | null
  counts: EntityCounts
}

export interface ImportStats {
  added: number
  updated: number
  /** Có sẵn và bản trên máy mới hơn (hoặc bằng) */
  kept: number
}

export interface ImportResult {
  mode: ImportMode
  tasks: ImportStats
  projects: ImportStats
  tags: ImportStats
  /** Bản sao lưu tự động ngay trước khi nhập (khôi phục lại được) */
  backup: string | null
}

export type ParseError = 'not-json' | 'not-budkin' | 'newer' | 'invalid' | 'duplicate'

/** Đọc nội dung file: trả về dữ liệu hợp lệ hoặc lý do không nhận (kèm chi tiết để chẩn đoán) */
export function parseExportFile(text: string): { ok: true; file: ExportFile } | { ok: false; error: ParseError; detail?: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not-json' }
  }
  const head = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (head.format !== EXPORT_FORMAT) return { ok: false, error: 'not-budkin' }
  if (typeof head.version === 'number' && head.version > EXPORT_VERSION) return { ok: false, error: 'newer' }
  const parsed = exportFileSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: 'invalid', detail: `${issue.path.join('.')}: ${issue.message}` }
  }
  const file = parsed.data
  for (const [kind, list] of [
    ['projects', file.projects],
    ['tags', file.tags],
    ['tasks', file.tasks]
  ] as const) {
    const ids = new Set(list.map((x) => x.id))
    if (ids.size !== list.length) return { ok: false, error: 'duplicate', detail: kind }
  }
  return { ok: true, file }
}

export function liveCounts(file: Pick<ExportFile, 'tasks' | 'projects' | 'tags'>): EntityCounts {
  const live = (list: Array<{ deletedAt: number | null }>): number => list.filter((x) => x.deletedAt === null).length
  return { tasks: live(file.tasks), projects: live(file.projects), tags: live(file.tags) }
}
