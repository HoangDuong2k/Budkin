// Kiểm tra dữ liệu renderer gửi lên (zod). Main không bao giờ tin renderer tuyệt đối.
import { z } from 'zod'
import { isValidDate } from './datetime'
import { COLOR_KEYS } from './palette'

export const LIMITS = {
  title: 500,
  notes: 20000,
  name: 120,
  tagName: 40,
  checklistText: 500,
  tagsPerTask: 20,
  checklistPerTask: 100,
  /** Nhắc trước tối đa 4 tuần */
  remindBeforeMin: 40320
} as const

export const idSchema = z.uuid()
export const dateSchema = z.string().refine(isValidDate, 'Ngày không hợp lệ (YYYY-MM-DD)')
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ không hợp lệ (HH:mm)')
export const colorSchema = z.enum(COLOR_KEYS)
export const statusSchema = z.enum(['todo', 'in_progress', 'done'])
export const prioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])

export const recurrenceSchema = z
  .strictObject({
    freq: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).max(99),
    byWeekday: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
    monthDay: z
      .number()
      .int()
      .refine((d) => d === -1 || (d >= 1 && d <= 31))
      .optional(),
    until: dateSchema.optional(),
    count: z.number().int().min(1).max(999).optional(),
    basis: z.enum(['due', 'completion'])
  })
  .superRefine((r, ctx) => {
    if (r.byWeekday && new Set(r.byWeekday).size !== r.byWeekday.length) ctx.addIssue({ code: 'custom', message: 'byWeekday bị trùng' })
    if (r.byWeekday && r.freq !== 'weekly') ctx.addIssue({ code: 'custom', message: 'byWeekday chỉ dùng với weekly' })
    if (r.monthDay !== undefined && r.freq !== 'monthly') ctx.addIssue({ code: 'custom', message: 'monthDay chỉ dùng với monthly' })
    if (r.basis === 'completion' && (r.byWeekday || r.monthDay !== undefined))
      ctx.addIssue({ code: 'custom', message: 'Lặp theo ngày hoàn thành không đi cùng thứ / ngày cố định' })
  })

const titleSchema = z.string().trim().min(1).max(LIMITS.title)
const notesSchema = z.string().max(LIMITS.notes)
const remindSchema = z.number().int().min(0).max(LIMITS.remindBeforeMin)
const tagIdsSchema = z.array(idSchema).max(LIMITS.tagsPerTask)
export const checklistTextSchema = z.string().trim().min(1).max(LIMITS.checklistText)

export const taskCreateSchema = z.strictObject({
  title: titleSchema,
  status: statusSchema.optional(),
  notes: notesSchema.optional(),
  projectId: idSchema.nullable().optional(),
  priority: prioritySchema.optional(),
  dueDate: dateSchema.nullable().optional(),
  dueTime: timeSchema.nullable().optional(),
  remindBeforeMin: remindSchema.nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  tagIds: tagIdsSchema.optional(),
  checklist: z.array(checklistTextSchema).max(LIMITS.checklistPerTask).optional()
})

/** Trạng thái không đổi qua đây (dùng tasks:setStatus / tasks:move — có xử lý task lặp lại) */
export const taskPatchSchema = z.strictObject({
  title: titleSchema.optional(),
  notes: notesSchema.optional(),
  projectId: idSchema.nullable().optional(),
  priority: prioritySchema.optional(),
  dueDate: dateSchema.nullable().optional(),
  dueTime: timeSchema.nullable().optional(),
  remindBeforeMin: remindSchema.nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  tagIds: tagIdsSchema.optional()
})

export type TaskCreateInput = z.infer<typeof taskCreateSchema>
export type TaskPatch = z.infer<typeof taskPatchSchema>

export const taskListScopeSchema = z.discriminatedUnion('scope', [
  z.strictObject({ scope: z.literal('active') }),
  z.strictObject({ scope: z.literal('range'), from: dateSchema, to: dateSchema }),
  z.strictObject({ scope: z.literal('search'), text: z.string().max(200) }),
  z.strictObject({ scope: z.literal('ids'), ids: z.array(idSchema).max(500) })
])
export type TaskListScope = z.infer<typeof taskListScopeSchema>

export const taskMoveSchema = z.strictObject({
  status: statusSchema.optional(),
  /** Phần tử ngay trên / ngay dưới ở vị trí mới (null: đầu / cuối cột) */
  beforeId: idSchema.nullable().optional(),
  afterId: idSchema.nullable().optional()
})
export type TaskMove = z.infer<typeof taskMoveSchema>

export const projectCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(LIMITS.name), color: colorSchema })
export const projectPatchSchema = z.strictObject({
  name: z.string().trim().min(1).max(LIMITS.name).optional(),
  color: colorSchema.optional(),
  archived: z.boolean().optional()
})
export const tagCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(LIMITS.tagName), color: colorSchema })
export const tagPatchSchema = z.strictObject({ name: z.string().trim().min(1).max(LIMITS.tagName).optional(), color: colorSchema.optional() })

export const checklistPatchSchema = z.strictObject({ text: checklistTextSchema.optional(), done: z.boolean().optional() })
export const orderMoveSchema = z.strictObject({ beforeId: idSchema.nullable().optional(), afterId: idSchema.nullable().optional() })

export type ProjectCreate = z.infer<typeof projectCreateSchema>
export type ProjectPatch = z.infer<typeof projectPatchSchema>
export type TagCreate = z.infer<typeof tagCreateSchema>
export type TagPatch = z.infer<typeof tagPatchSchema>
export type ChecklistPatch = z.infer<typeof checklistPatchSchema>
export type OrderMove = z.infer<typeof orderMoveSchema>

export const settingsPatchSchema = z.strictObject({
  language: z.enum(['vi', 'en']).optional(),
  weekStart: z.union([z.literal(0), z.literal(1)]).optional(),
  allDayRemindTime: timeSchema.optional(),
  defaultRemindBeforeMin: z.number().int().min(0).max(LIMITS.remindBeforeMin).nullable().optional(),
  sound: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
  closeToTray: z.boolean().nullable().optional(),
  autostart: z.boolean().optional(),
  quality: z.enum(['high', 'balanced', 'saver']).optional(),
  reducedMotion: z.enum(['auto', 'on', 'off']).optional()
})
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
