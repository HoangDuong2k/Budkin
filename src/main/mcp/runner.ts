// Chạy công cụ MCP trên dữ liệu thật (main process). Đọc qua DataService; mỗi lần ghi chạy trong một giao dịch
// (lỗi ở việc nào cũng huỷ cả lần đó), rồi báo giao diện kèm cách hoàn tác — người dùng luôn gỡ được việc AI vừa làm.
import { z } from 'zod'
import type { AiActivity, AiActivityKind } from '../../shared/api'
import { addDays, isoWeekday, localDateOf, localMinutesOf, pad2 } from '../../shared/datetime'
import { compareByDue, isOpen, isOverdue, matchesTerms, type Now } from '../../shared/filters'
import { COLOR_KEYS } from '../../shared/palette'
import { recurrenceSchema, type TaskCreateInput, type TaskPatch } from '../../shared/schemas'
import { normalizeText, searchTerms } from '../../shared/search'
import type { AiAccess, Priority, Project, RecurrenceRule, Tag, Task } from '../../shared/types'
import type { Clock } from '../clock'
import { AppError } from '../errors'
import type { DataService } from '../services/data'
import { TOOLS, errorResult, isToolName, textResult, type NewTaskInput, type RepeatInput, type TaskChangeInput, type ToolArgs, type ToolResult } from './tools'

const OFF_MESSAGE =
  'Budkin has the AI connection turned off. Ask the user to open Budkin → Settings → AI connection and allow access, then try again.'
const READ_ONLY_MESSAGE =
  'Budkin lets AI apps read tasks only. To create, change or delete tasks the user can set access to "View and edit" in Budkin → Settings → AI connection.'

/** Hoàn tác được trong bấy lâu, giữ tối đa bấy nhiêu lần gần nhất */
const UNDO_TTL_MS = 15 * 60_000
const UNDO_KEEP = 20
/** Ghi chú trong danh sách cắt ngắn (đầy đủ ở get_task) */
const NOTE_PREVIEW = 280
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const PRIORITY: Record<NonNullable<NewTaskInput['priority']>, Priority> = { none: 0, low: 1, medium: 2, high: 3 }
const PRIORITY_NAME: Record<Priority, string | undefined> = { 0: undefined, 1: 'low', 2: 'medium', 3: 'high' }

export interface AiRunnerDeps {
  data: DataService
  clock: Clock
  access: () => AiAccess
  /** AI vừa ghi dữ liệu: giao diện báo (robot, toast có nút Hoàn tác) */
  activity: (a: AiActivity) => void
}

/** Tên hiện cho người dùng của app AI (clientInfo.name trong MCP) */
export function clientLabel(name: string | undefined): string {
  if (!name) return 'AI'
  if (/claude[-_ ]?code/i.test(name)) return 'Claude Code'
  if (/claude/i.test(name)) return 'Claude'
  return name.slice(0, 40)
}

/** Quy tắc lặp lại dạng dễ hiểu cho AI ↔ dạng lưu trong Budkin. "Hằng năm" = hằng tháng, mỗi 12 tháng */
export function ruleFromRepeat(r: RepeatInput): RecurrenceRule {
  const n = r.interval ?? 1
  const rule: RecurrenceRule = {
    freq: r.every === 'day' ? 'daily' : r.every === 'week' ? 'weekly' : 'monthly',
    interval: r.every === 'year' ? n * 12 : n,
    basis: r.from_completion ? 'completion' : 'due'
  }
  if (r.weekdays) rule.byWeekday = [...new Set(r.weekdays)].sort((a, b) => a - b)
  if (r.month_day !== undefined) rule.monthDay = r.month_day
  if (r.until) rule.until = r.until
  if (r.count) rule.count = r.count
  const parsed = recurrenceSchema.safeParse(rule)
  if (!parsed.success) throw new AppError('VALIDATION', `Invalid repeat rule: ${parsed.error.issues.map((i) => i.message).join('; ')}`)
  return parsed.data
}

export function repeatFromRule(rule: RecurrenceRule): RepeatInput {
  const yearly = rule.freq === 'monthly' && rule.interval % 12 === 0
  const out: RepeatInput = {
    every: rule.freq === 'daily' ? 'day' : rule.freq === 'weekly' ? 'week' : yearly ? 'year' : 'month',
    interval: yearly ? rule.interval / 12 : rule.interval
  }
  if (rule.byWeekday) out.weekdays = rule.byWeekday
  if (rule.monthDay !== undefined) out.month_day = rule.monthDay
  if (rule.until) out.until = rule.until
  if (rule.count) out.count = rule.count
  if (rule.basis === 'completion') out.from_completion = true
  return out
}

function localStamp(ms: number): string {
  return `${localDateOf(ms)} ${pad2(Math.floor(localMinutesOf(ms) / 60))}:${pad2(localMinutesOf(ms) % 60)}`
}

function utcOffset(ms: number): string {
  const off = -new Date(ms).getTimezoneOffset()
  return `${off < 0 ? '-' : '+'}${pad2(Math.floor(Math.abs(off) / 60))}:${pad2(Math.abs(off) % 60)}`
}

const invalid = (message: string): AppError => new AppError('VALIDATION', message)

interface UndoEntry {
  at: number
  run: () => void
}

/** Tên dự án / nhãn mới tạo trong một lần gọi (báo lại cho AI) */
interface Created {
  projects: string[]
  tags: string[]
}

export class AiRunner {
  private readonly undos = new Map<string, UndoEntry>()
  /** Lần gần nhất một app AI dùng Budkin (màn hình Cài đặt hiện ra) */
  lastUse: { client: string; at: number } | null = null

  constructor(private readonly deps: AiRunnerDeps) {}

  async call(name: string, raw: unknown, clientName?: string): Promise<ToolResult> {
    if (!isToolName(name)) return errorResult(`Unknown tool: ${name}`)
    const access = this.deps.access()
    if (access === 'off') return errorResult(OFF_MESSAGE)
    if (TOOLS[name].write && access !== 'full') return errorResult(READ_ONLY_MESSAGE)
    const parsed = TOOLS[name].input.safeParse(raw ?? {})
    if (!parsed.success) return errorResult(`Invalid arguments:\n${z.prettifyError(parsed.error)}`)
    const client = clientLabel(clientName)
    this.lastUse = { client, at: this.deps.clock.now() }
    try {
      return textResult(this.run(name, parsed.data, client))
    } catch (err) {
      if (err instanceof AppError) return errorResult(err.message)
      console.error('[mcp]', name, err)
      return errorResult(`Budkin could not do that: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private run(name: string, args: unknown, client: string): unknown {
    switch (name) {
      case 'get_overview':
        return this.overview()
      case 'list_tasks':
        return this.list(args as ToolArgs<'list_tasks'>)
      case 'get_task':
        return { task: this.detail(this.deps.data.getTask((args as ToolArgs<'get_task'>).id)) }
      case 'create_tasks':
        return this.create(args as ToolArgs<'create_tasks'>, client)
      case 'update_tasks':
        return this.update(args as ToolArgs<'update_tasks'>, client)
      case 'delete_tasks':
        return this.remove(args as ToolArgs<'delete_tasks'>, client)
    }
    throw invalid(`Unknown tool: ${name}`)
  }

  /** Hoàn tác một lần AI ghi dữ liệu (nút Hoàn tác trên toast) */
  undo(id: string): void {
    this.pruneUndos()
    const entry = this.undos.get(id)
    if (!entry) throw new AppError('NOT_FOUND', 'Không còn hoàn tác được nữa')
    this.undos.delete(id)
    this.deps.data.batch(entry.run)
  }

  // ---------- Đọc ----------

  private now(): Now {
    const ms = this.deps.clock.now()
    return { date: localDateOf(ms), minutes: localMinutesOf(ms) }
  }

  private names(): { projects: Map<string, Project>; tags: Map<string, Tag> } {
    return {
      projects: new Map(this.deps.data.listProjects().map((p) => [p.id, p])),
      tags: new Map(this.deps.data.listTags().map((t) => [t.id, t]))
    }
  }

  private brief(t: Task, now: Now, names = this.names()): Record<string, unknown> {
    const out: Record<string, unknown> = { id: t.id, title: t.title, status: t.status }
    if (t.dueDate) out.due_date = t.dueDate
    if (t.dueTime) out.due_time = t.dueTime
    if (isOverdue(t, now)) out.overdue = true
    const project = t.projectId ? names.projects.get(t.projectId) : undefined
    if (project) out.project = project.name
    if (t.tagIds.length) out.tags = t.tagIds.map((id) => names.tags.get(id)?.name).filter(Boolean)
    if (PRIORITY_NAME[t.priority]) out.priority = PRIORITY_NAME[t.priority]
    if (t.remindBeforeMin !== null) out.remind_before_minutes = t.remindBeforeMin
    if (t.recurrence) out.repeat = repeatFromRule(t.recurrence)
    if (t.checklist.length) out.checklist = `${t.checklist.filter((c) => c.done).length}/${t.checklist.length} done`
    if (t.notes) out.notes = t.notes.length > NOTE_PREVIEW ? `${t.notes.slice(0, NOTE_PREVIEW)}…` : t.notes
    if (t.completedAt !== null) out.completed_at = localStamp(t.completedAt)
    return out
  }

  private detail(t: Task): Record<string, unknown> {
    return {
      ...this.brief(t, this.now()),
      notes: t.notes,
      checklist: t.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
      created_at: localStamp(t.createdAt),
      updated_at: localStamp(t.updatedAt)
    }
  }

  private overview(): unknown {
    const { data, clock } = this.deps
    const ms = clock.now()
    const now = this.now()
    const settings = data.getSettings()
    const all = data.listTasks({ scope: 'active' })
    const open = all.filter(isOpen)
    const week = addDays(now.date, 7)
    const openIn = (pred: (t: Task) => boolean): number => open.filter(pred).length
    return {
      now: {
        date: now.date,
        weekday: WEEKDAYS[isoWeekday(now.date) - 1],
        time: `${pad2(Math.floor(now.minutes / 60))}:${pad2(now.minutes % 60)}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        utc_offset: utcOffset(ms)
      },
      week_starts_on: settings.weekStart === 1 ? 'Monday' : 'Sunday',
      app_language: settings.language,
      access: settings.aiAccess === 'full' ? 'view and edit' : 'view only',
      counts: {
        overdue: openIn((t) => isOverdue(t, now)),
        due_today: openIn((t) => t.dueDate === now.date && !isOverdue(t, now)),
        upcoming_7_days: openIn((t) => t.dueDate !== null && t.dueDate > now.date && t.dueDate <= week),
        in_progress: openIn((t) => t.status === 'in_progress'),
        no_due_date: openIn((t) => t.dueDate === null),
        open_total: open.length,
        done_today: all.filter((t) => t.completedAt !== null && localDateOf(t.completedAt) === now.date).length
      },
      projects: data
        .listProjects()
        .filter((p) => p.archivedAt === null)
        .map((p) => ({ id: p.id, name: p.name, open_tasks: openIn((t) => t.projectId === p.id) })),
      tags: data.listTags().map((t) => ({ id: t.id, name: t.name }))
    }
  }

  private list(a: ToolArgs<'list_tasks'>): unknown {
    const { data, clock } = this.deps
    const now = this.now()
    const view = a.view ?? 'today'
    const names = this.names()
    const open = (): Task[] => data.listTasks({ scope: 'active' }).filter(isOpen)
    let tasks: Task[]
    let span: { from: string; to: string } | undefined
    switch (view) {
      case 'today':
        tasks = open().filter((t) => isOverdue(t, now) || t.dueDate === now.date)
        break
      case 'overdue':
        tasks = open().filter((t) => isOverdue(t, now))
        break
      case 'upcoming': {
        span = { from: addDays(now.date, 1), to: addDays(now.date, a.days ?? 7) }
        const { from, to } = span
        tasks = open().filter((t) => t.dueDate !== null && t.dueDate >= from && t.dueDate <= to)
        break
      }
      case 'no_date':
        tasks = open().filter((t) => t.dueDate === null)
        break
      case 'in_progress':
        tasks = open().filter((t) => t.status === 'in_progress')
        break
      case 'all_open':
        tasks = open()
        break
      case 'done':
        tasks = data.listCompleted(clock.now() - (a.days ?? 7) * 86_400_000, 1000)
        break
      case 'range':
        if (!a.from || !a.to) throw invalid('view "range" needs both from and to')
        if (a.from > a.to) throw invalid('from must not be after to')
        span = { from: a.from, to: a.to }
        tasks = data.listTasks({ scope: 'range', from: a.from, to: a.to })
        break
    }
    if (a.project) {
      const p = this.findProject(a.project)
      if (!p) throw invalid(`No project named "${a.project}". Projects: ${[...names.projects.values()].map((x) => x.name).join(', ') || '(none)'}`)
      tasks = tasks.filter((t) => t.projectId === p.id)
    }
    if (a.tag) {
      const tag = this.findTag(a.tag)
      if (!tag) throw invalid(`No tag named "${a.tag}". Tags: ${[...names.tags.values()].map((x) => x.name).join(', ') || '(none)'}`)
      tasks = tasks.filter((t) => t.tagIds.includes(tag.id))
    }
    if (a.search) {
      const terms = searchTerms(a.search)
      tasks = tasks.filter((t) => matchesTerms(t, terms, normalizeText))
    }
    if (view !== 'done') tasks.sort(compareByDue)
    const limit = a.limit ?? 50
    return {
      today: now.date,
      view,
      ...(span ?? {}),
      total: tasks.length,
      ...(tasks.length > limit ? { shown: limit } : {}),
      tasks: tasks.slice(0, limit).map((t) => this.brief(t, now, names))
    }
  }

  // ---------- Tìm / tạo dự án, nhãn theo tên ----------

  private findProject(ref: string): Project | undefined {
    const list = this.deps.data.listProjects()
    const key = normalizeText(ref)
    return list.find((p) => p.id === ref) ?? list.find((p) => normalizeText(p.name) === key)
  }

  private findTag(ref: string): Tag | undefined {
    const list = this.deps.data.listTags()
    const key = normalizeText(ref.replace(/^#/, ''))
    return list.find((t) => t.id === ref) ?? list.find((t) => normalizeText(t.name) === key)
  }

  private projectId(ref: string, created: Created): string {
    const found = this.findProject(ref)
    if (found) return found.id
    const color = COLOR_KEYS[this.deps.data.listProjects().length % COLOR_KEYS.length]
    created.projects.push(ref)
    return this.deps.data.createProject({ name: ref, color }).id
  }

  private tagIds(refs: string[], created: Created): string[] {
    return refs.map((ref) => {
      const found = this.findTag(ref)
      if (found) return found.id
      const name = ref.replace(/^#/, '').trim()
      if (!name) throw invalid(`Invalid tag name "${ref}"`)
      const color = COLOR_KEYS[(this.deps.data.listTags().length + 3) % COLOR_KEYS.length]
      created.tags.push(name)
      return this.deps.data.createTag({ name, color }).id
    })
  }

  // ---------- Ghi ----------

  /** Nhắc mặc định khi việc có hạn (giống khung sửa việc): có giờ → theo thiết lập; cả ngày → buổi sáng ngày đến hạn */
  private defaultRemind(dueTime: string | null): number | null {
    return dueTime ? this.deps.data.getSettings().defaultRemindBeforeMin : 0
  }

  private create(a: ToolArgs<'create_tasks'>, client: string): unknown {
    const { data } = this.deps
    const created: Created = { projects: [], tags: [] }
    const tasks = data.batch(() =>
      a.tasks.map((t) => {
        if (t.due_time && !t.due_date) throw invalid(`"${t.title}": due_time needs a due_date`)
        if (t.repeat && !t.due_date) throw invalid(`"${t.title}": repeat needs a due_date`)
        const input: TaskCreateInput = {
          title: t.title,
          notes: t.notes,
          status: t.status,
          priority: t.priority ? PRIORITY[t.priority] : undefined,
          projectId: t.project ? this.projectId(t.project, created) : undefined,
          tagIds: t.tags ? [...new Set(this.tagIds(t.tags, created))] : undefined,
          dueDate: t.due_date ?? null,
          dueTime: t.due_time ?? null,
          remindBeforeMin: !t.due_date ? null : t.remind_before_minutes !== undefined ? t.remind_before_minutes : this.defaultRemind(t.due_time ?? null),
          recurrence: t.repeat ? ruleFromRepeat(t.repeat) : null,
          checklist: t.checklist
        }
        return data.createTask(input)
      })
    )
    const ids = tasks.map((t) => t.id)
    this.record(client, 'create', tasks, () => {
      for (const id of ids) this.ignoreMissing(() => data.deleteTask(id, 'one'))
    })
    const now = this.now()
    const names = this.names()
    return { created: tasks.map((t) => this.brief(t, now, names)), new_projects: created.projects, new_tags: created.tags }
  }

  private update(a: ToolArgs<'update_tasks'>, client: string): unknown {
    const { data } = this.deps
    const created: Created = { projects: [], tags: [] }
    const before = new Map<string, Task>()
    const addedItems: string[] = []
    const results = data.batch(() => a.updates.map((u) => this.applyChange(u, created, before, addedItems)))
    this.record(client, 'update', [...before.values()], () => {
      for (const id of addedItems) this.ignoreMissing(() => data.deleteChecklistItem(id))
      for (const prev of before.values()) this.ignoreMissing(() => this.revert(prev))
    })
    const now = this.now()
    const names = this.names()
    return { updated: results.map((t) => this.brief(t, now, names)), new_projects: created.projects, new_tags: created.tags }
  }

  private applyChange(u: TaskChangeInput, created: Created, before: Map<string, Task>, addedItems: string[]): Task {
    const { data } = this.deps
    const cur = data.getTask(u.id)
    if (!before.has(u.id)) before.set(u.id, cur)
    const patch: TaskPatch = {}
    if (u.title !== undefined) patch.title = u.title
    if (u.notes !== undefined) patch.notes = u.notes
    if (u.due_date !== undefined) patch.dueDate = u.due_date
    if (u.due_time !== undefined) patch.dueTime = u.due_time
    if (u.priority) patch.priority = PRIORITY[u.priority]
    if (u.remind_before_minutes !== undefined) patch.remindBeforeMin = u.remind_before_minutes
    if (u.repeat !== undefined) patch.recurrence = u.repeat ? ruleFromRepeat(u.repeat) : null
    if (u.project !== undefined) patch.projectId = u.project === null ? null : this.projectId(u.project, created)
    if (u.tags || u.add_tags || u.remove_tags) {
      let tags = u.tags ? this.tagIds(u.tags, created) : cur.tagIds
      if (u.add_tags) tags = [...tags, ...this.tagIds(u.add_tags, created)]
      if (u.remove_tags) {
        const drop = new Set(u.remove_tags.map((r) => this.findTag(r)?.id).filter(Boolean))
        tags = tags.filter((id) => !drop.has(id))
      }
      patch.tagIds = [...new Set(tags)]
    }
    const dueDate = patch.dueDate !== undefined ? patch.dueDate : cur.dueDate
    const dueTime = patch.dueTime !== undefined ? patch.dueTime : cur.dueTime
    if (u.due_time && !dueDate) throw invalid(`"${cur.title}": due_time needs a due_date`)
    if (u.repeat && !dueDate) throw invalid(`"${cur.title}": repeat needs a due_date`)
    // Lần đầu có hạn mà không nói nhắc: nhắc mặc định như khi đặt hạn trong khung sửa việc
    if (dueDate && !cur.dueDate && u.remind_before_minutes === undefined) patch.remindBeforeMin = this.defaultRemind(dueTime)
    if (Object.keys(patch).length) data.updateTask(u.id, patch)

    for (const text of u.add_checklist ?? []) {
      const had = new Set(data.getTask(u.id).checklist.map((c) => c.id))
      const item = data.addChecklistItem(u.id, text).checklist.find((c) => !had.has(c.id))
      if (item) addedItems.push(item.id)
    }
    const setDone = (ids: string[] | undefined, done: boolean): void => {
      for (const id of ids ?? []) {
        if (!cur.checklist.some((c) => c.id === id)) throw invalid(`Checklist item ${id} does not belong to "${cur.title}" (get_task lists the item ids)`)
        data.updateChecklistItem(id, { done })
      }
    }
    setDone(u.check_items, true)
    setDone(u.uncheck_items, false)
    if (u.status && u.status !== data.getTask(u.id).status) data.setStatus(u.id, u.status)
    return data.getTask(u.id)
  }

  /** Đưa một việc về đúng như trước lần AI sửa (dự án / nhãn đã bị xoá thì bỏ qua phần đó) */
  private revert(prev: Task): void {
    const { data } = this.deps
    const liveTags = new Set(data.listTags().map((t) => t.id))
    const projectLive = prev.projectId !== null && data.listProjects().some((p) => p.id === prev.projectId)
    data.updateTask(prev.id, {
      title: prev.title,
      notes: prev.notes,
      projectId: projectLive ? prev.projectId : null,
      priority: prev.priority,
      dueDate: prev.dueDate,
      dueTime: prev.dueTime,
      remindBeforeMin: prev.remindBeforeMin,
      recurrence: prev.recurrence,
      tagIds: prev.tagIds.filter((id) => liveTags.has(id))
    })
    const now = data.getTask(prev.id)
    for (const item of prev.checklist) {
      const cur = now.checklist.find((c) => c.id === item.id)
      if (cur && cur.done !== item.done) data.updateChecklistItem(item.id, { done: item.done })
    }
    if (now.status !== prev.status) data.setStatus(prev.id, prev.status)
  }

  private remove(a: ToolArgs<'delete_tasks'>, client: string): unknown {
    const { data } = this.deps
    const gone = new Set<string>()
    const deleted: Task[] = []
    data.batch(() => {
      for (const id of a.ids) {
        // Đã xoá cùng chuỗi lặp lại ở bước trước (whole_series)
        if (gone.has(id)) continue
        const t = data.getTask(id)
        deleted.push(t)
        for (const x of data.deleteTask(id, a.whole_series ? 'series' : 'one')) gone.add(x)
      }
    })
    const ids = [...gone]
    this.record(client, 'delete', deleted, () => void data.restoreTasks(ids))
    return { deleted: deleted.map((t) => ({ id: t.id, title: t.title })), total_deleted: ids.length }
  }

  // ---------- Hoàn tác ----------

  private record(client: string, kind: AiActivityKind, tasks: Task[], run: () => void): void {
    this.pruneUndos()
    const at = this.deps.clock.now()
    const id = crypto.randomUUID()
    this.undos.set(id, { at, run })
    while (this.undos.size > UNDO_KEEP) this.undos.delete(this.undos.keys().next().value!)
    this.deps.activity({ id, client, kind, count: tasks.length, titles: tasks.slice(0, 3).map((t) => t.title), taskIds: tasks.map((t) => t.id), at })
  }

  private pruneUndos(): void {
    const cutoff = this.deps.clock.now() - UNDO_TTL_MS
    for (const [id, e] of this.undos) if (e.at < cutoff) this.undos.delete(id)
  }

  /** Việc đã bị người dùng xoá trong lúc chờ hoàn tác: bỏ qua việc đó, hoàn tác phần còn lại */
  private ignoreMissing(fn: () => void): void {
    try {
      fn()
    } catch (err) {
      if (!(err instanceof AppError && err.code === 'NOT_FOUND')) throw err
    }
  }
}
