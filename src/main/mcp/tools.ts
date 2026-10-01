// Các công cụ Budkin mở cho app AI qua MCP (Claude Desktop, Claude Code…): tên, mô tả, tham số.
// Dùng chung cho cầu nối (liệt kê, kiểm tra tham số) và main (chạy công cụ). Mô tả viết bằng tiếng Anh: người đọc là mô hình AI.
import { z } from 'zod'
import { isValidDate } from '../../shared/datetime'
import { LIMITS } from '../../shared/schemas'

/** Tên máy chủ MCP trong cấu hình của app AI (tên công cụ hiện ra kiểu mcp__budkin__list_tasks) */
export const SERVER_NAME = 'budkin'

export const SERVER_INSTRUCTIONS = [
  "Budkin is the user's personal task manager, a desktop app running on this computer.",
  'Use these tools to answer questions about their tasks and to create or change tasks when they ask.',
  "Call get_overview first: it gives today's local date and weekday, the projects and the tags. Resolve relative dates",
  '("tomorrow", "next Friday", "thứ 6 tuần sau") against that date. All dates and times are the user\'s local time.',
  'Only delete tasks or change many tasks at once when the user clearly asked for it; every change can be undone inside Budkin.',
  "Reply in the user's language."
].join(' ')

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isValidDate, 'Invalid date')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)')
const taskId = z.uuid()
const priority = z.enum(['none', 'low', 'medium', 'high'])
const status = z.enum(['todo', 'in_progress', 'done'])
const title = z.string().trim().min(1).max(LIMITS.title)
const notes = z.string().max(LIMITS.notes)
const names = (max: number): z.ZodArray<z.ZodString> => z.array(z.string().trim().min(1).max(LIMITS.name)).max(max)
const checklistTexts = z.array(z.string().trim().min(1).max(LIMITS.checklistText)).max(LIMITS.checklistPerTask)

export const repeatSchema = z
  .strictObject({
    every: z.enum(['day', 'week', 'month', 'year']),
    interval: z.number().int().min(1).max(99).optional().describe('Every N days/weeks/months/years (default 1)'),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional().describe('every=week only: ISO weekdays, 1 = Monday … 7 = Sunday'),
    month_day: z.number().int().min(-1).max(31).optional().describe('every=month only: day of the month, -1 = last day'),
    until: date.optional().describe('Last possible date (inclusive)'),
    count: z.number().int().min(1).max(999).optional().describe('Total number of occurrences'),
    from_completion: z.boolean().optional().describe('Next occurrence is counted from the day the task is completed instead of from its due date')
  })
  .describe('Repeat rule. When a repeating task is completed Budkin creates the next occurrence. Requires a due date')
export type RepeatInput = z.infer<typeof repeatSchema>

const remind = z
  .number()
  .int()
  .min(0)
  .max(LIMITS.remindBeforeMin)
  .nullable()
  .describe("Reminder N minutes before the due time. 0 = at the due time (all-day task: the morning of the due date, at the user's all-day reminder time). null = no reminder")

const newTask = z.strictObject({
  title,
  notes: notes.optional(),
  due_date: date.optional().describe('Due date YYYY-MM-DD'),
  due_time: time.optional().describe('Due time HH:MM (24h). Needs due_date; omit for an all-day task'),
  project: z.string().trim().min(1).max(LIMITS.name).optional().describe('Project name or id. A project with a new name is created'),
  tags: names(LIMITS.tagsPerTask).optional().describe('Tag names or ids. New tag names are created'),
  priority: priority.optional(),
  remind_before_minutes: remind.optional().describe("Default: the user's reminder setting when the task has a due date"),
  repeat: repeatSchema.optional(),
  checklist: checklistTexts.optional().describe('Checklist items (sub-steps)'),
  status: status.optional()
})

const taskChange = z.strictObject({
  id: taskId,
  title: title.optional(),
  notes: notes.optional().describe('Replaces the notes'),
  due_date: date.nullable().optional().describe('null removes the due date (and with it the time, reminder and repeat rule)'),
  due_time: time.nullable().optional().describe('null makes it an all-day task'),
  project: z.string().trim().min(1).max(LIMITS.name).nullable().optional().describe('Project name or id (a new name creates the project); null = no project'),
  tags: names(LIMITS.tagsPerTask).optional().describe('Replaces all tags'),
  add_tags: names(LIMITS.tagsPerTask).optional(),
  remove_tags: names(LIMITS.tagsPerTask).optional(),
  priority: priority.optional(),
  remind_before_minutes: remind.optional(),
  repeat: repeatSchema.nullable().optional().describe('null stops repeating'),
  status: status.optional().describe('done completes the task (a repeating task then gets its next occurrence)'),
  add_checklist: checklistTexts.optional().describe('Checklist items to append'),
  check_items: z.array(z.uuid()).max(LIMITS.checklistPerTask).optional().describe('Checklist item ids to mark done (ids come from get_task)'),
  uncheck_items: z.array(z.uuid()).max(LIMITS.checklistPerTask).optional().describe('Checklist item ids to mark not done')
})

export const VIEWS = ['today', 'overdue', 'upcoming', 'no_date', 'in_progress', 'all_open', 'done', 'range'] as const
export type ListView = (typeof VIEWS)[number]

export const TOOLS = {
  get_overview: {
    title: 'Budkin overview',
    description:
      "Today's local date, weekday and time, the user's projects and tags, and task counts (overdue, today, upcoming). Call this first in a conversation.",
    input: z.strictObject({}),
    write: false
  },
  list_tasks: {
    title: 'List tasks',
    description: [
      'List tasks. view: today = overdue + due today (like the Today list in Budkin);',
      'overdue; upcoming = the next `days` days starting tomorrow; no_date = open tasks without a due date; in_progress;',
      'all_open = every task not done; done = completed in the last `days` days; range = due between `from` and `to`, any status.',
      'Optional filters: project, tag, search (words in title or notes, accents ignored).'
    ].join(' '),
    input: z.strictObject({
      view: z.enum(VIEWS).optional().describe('Default: today'),
      days: z.number().int().min(1).max(90).optional().describe('For upcoming (default 7) and done (default 7)'),
      from: date.optional().describe('For range'),
      to: date.optional().describe('For range (inclusive)'),
      project: z.string().trim().min(1).max(LIMITS.name).optional().describe('Project name or id'),
      tag: z.string().trim().min(1).max(LIMITS.name).optional().describe('Tag name or id'),
      search: z.string().trim().min(1).max(200).optional(),
      limit: z.number().int().min(1).max(200).optional().describe('Default 50')
    }),
    write: false
  },
  get_task: {
    title: 'Get task',
    description: 'Full details of one task: notes, checklist items with their ids, repeat rule, reminder.',
    input: z.strictObject({ id: taskId }),
    write: false
  },
  create_tasks: {
    title: 'Create tasks',
    description: 'Create one or more tasks in Budkin. Returns the created tasks with their ids.',
    input: z.strictObject({ tasks: z.array(newTask).min(1).max(50) }),
    write: true
  },
  update_tasks: {
    title: 'Update tasks',
    description:
      'Change one or more existing tasks: rename, reschedule, move to another project, retag, set priority or reminder, complete or reopen, edit the checklist. Fields left out stay unchanged. All changes apply together or not at all.',
    input: z.strictObject({ updates: z.array(taskChange).min(1).max(100) }),
    write: true
  },
  delete_tasks: {
    title: 'Delete tasks',
    description: 'Delete tasks (the user can undo this in Budkin). whole_series also deletes the future occurrences of a repeating task.',
    input: z.strictObject({ ids: z.array(taskId).min(1).max(100), whole_series: z.boolean().optional() }),
    write: true
  }
} as const

export type ToolName = keyof typeof TOOLS
export type ToolArgs<N extends ToolName> = z.infer<(typeof TOOLS)[N]['input']>
export type NewTaskInput = z.infer<typeof newTask>
export type TaskChangeInput = z.infer<typeof taskChange>

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOLS, name)
}

/** Gợi ý cho app AI (vd. Claude Desktop hỏi người dùng trước khi cho chạy công cụ sửa / xoá) */
export function toolAnnotations(name: ToolName): { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean } {
  const write = TOOLS[name].write
  return { readOnlyHint: !write, destructiveHint: name === 'delete_tasks' || name === 'update_tasks', idempotentHint: !write, openWorldHint: false }
}

/** Kết quả trả cho app AI: một khối văn bản JSON (isError: lỗi mà mô hình đọc được để sửa lời gọi hoặc báo người dùng) */
export interface ToolResult {
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export function textResult(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] }
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}
