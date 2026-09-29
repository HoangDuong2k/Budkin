// Nghiệp vụ dữ liệu: đọc/ghi task, dự án, nhãn, checklist, thiết lập. Mọi thao tác ghi chạy trong một giao dịch
// rồi phát bản đầy đủ của các đối tượng đã đổi (ChangeSet) cho renderer — renderer không phải tải lại.
import type { StatusResult } from '../../shared/api'
import { normalizeText, searchTerms, taskSearchText } from '../../shared/search'
import { ORDER_STEP, orderBetween, renumber } from '../../shared/ordering'
import {
  settingsPatchSchema,
  type ChecklistPatch,
  type OrderMove,
  type ProjectCreate,
  type ProjectPatch,
  type SettingsPatch,
  type TagCreate,
  type TagPatch,
  type TaskCreateInput,
  type TaskListScope,
  type TaskMove,
  type TaskPatch
} from '../../shared/schemas'
import { DEFAULT_SETTINGS, type ChangeReason, type ChangeSet, type Project, type RecurrenceRule, type Settings, type Tag, type Task, type TaskStatus } from '../../shared/types'
import type { Clock } from '../clock'
import type { Db, Param } from '../db/connection'
import {
  CHECKLIST_COLS,
  PROJECT_COLS,
  TAG_COLS,
  TASK_COLS,
  toChecklistItem,
  toProject,
  toTag,
  toTask,
  type ChecklistRow,
  type ProjectRow,
  type TagRow,
  type TaskRow
} from '../db/rows'
import { AppError } from '../errors'

/** Task đã xong vẫn nằm trong bộ nhớ đệm của renderer thêm 14 ngày (danh sách "Đã xong", cột Kanban) */
const DONE_KEEP_MS = 14 * 24 * 3600_000

export class DataService {
  private readonly touched = { tasks: new Set<string>(), projects: new Set<string>(), tags: new Set<string>() }
  private depth = 0

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly emit: (changes: ChangeSet, reason: ChangeReason) => void
  ) {}

  // ---------- Khung ghi ----------

  /** Ghi trong một giao dịch rồi phát các đối tượng đã đổi (lồng nhau thì chỉ phát ở lớp ngoài cùng) */
  private mutate<T>(reason: ChangeReason, fn: () => T): T {
    this.depth++
    try {
      const out = this.db.tx(fn)
      if (this.depth === 1) this.flush(reason)
      return out
    } catch (err) {
      if (this.depth === 1) this.clearTouched()
      throw err
    } finally {
      this.depth--
    }
  }

  private clearTouched(): void {
    this.touched.tasks.clear()
    this.touched.projects.clear()
    this.touched.tags.clear()
  }

  private flush(reason: ChangeReason): void {
    const changes: ChangeSet = {
      tasks: this.tasksByIds([...this.touched.tasks], true),
      projects: this.touched.projects.size
        ? this.db.all<ProjectRow>(`SELECT ${PROJECT_COLS} FROM projects WHERE id IN (SELECT value FROM json_each(?))`, JSON.stringify([...this.touched.projects])).map(toProject)
        : [],
      tags: this.touched.tags.size
        ? this.db.all<TagRow>(`SELECT ${TAG_COLS} FROM tags WHERE id IN (SELECT value FROM json_each(?))`, JSON.stringify([...this.touched.tags])).map(toTag)
        : []
    }
    this.clearTouched()
    if (changes.tasks.length || changes.projects.length || changes.tags.length) this.emit(changes, reason)
  }

  /** Mốc updated_at luôn tăng dần kể cả khi đồng hồ máy bị chỉnh lùi (để gộp dữ liệu theo "bản mới hơn") */
  private stamp(prev?: number): number {
    const now = this.clock.now()
    return prev === undefined ? now : Math.max(now, prev + 1)
  }

  // ---------- Đọc task ----------

  private hydrate(rows: TaskRow[]): Task[] {
    if (!rows.length) return []
    const ids = JSON.stringify(rows.map((r) => r.id))
    const tags = new Map<string, string[]>()
    for (const t of this.db.all<{ task_id: string; tag_id: string }>(
      'SELECT task_id, tag_id FROM task_tags WHERE task_id IN (SELECT value FROM json_each(?)) ORDER BY tag_id',
      ids
    )) {
      const list = tags.get(t.task_id)
      if (list) list.push(t.tag_id)
      else tags.set(t.task_id, [t.tag_id])
    }
    const items = new Map<string, ReturnType<typeof toChecklistItem>[]>()
    for (const r of this.db.all<ChecklistRow>(
      `SELECT ${CHECKLIST_COLS} FROM checklist_items WHERE deleted_at IS NULL AND task_id IN (SELECT value FROM json_each(?)) ORDER BY sort_order`,
      ids
    )) {
      const list = items.get(r.task_id)
      const item = toChecklistItem(r)
      if (list) list.push(item)
      else items.set(r.task_id, [item])
    }
    return rows.map((r) => toTask(r, tags.get(r.id) ?? [], items.get(r.id) ?? []))
  }

  private tasksByIds(ids: string[], includeDeleted: boolean): Task[] {
    if (!ids.length) return []
    return this.hydrate(
      this.db.all<TaskRow>(
        `SELECT ${TASK_COLS} FROM tasks WHERE id IN (SELECT value FROM json_each(?))${includeDeleted ? '' : ' AND deleted_at IS NULL'}`,
        JSON.stringify(ids)
      )
    )
  }

  private taskRow(id: string): TaskRow {
    const row = this.db.get<TaskRow>(`SELECT ${TASK_COLS} FROM tasks WHERE id = ? AND deleted_at IS NULL`, id)
    if (!row) throw new AppError('NOT_FOUND', `Task ${id} không tồn tại`)
    return row
  }

  getTask(id: string): Task {
    return this.hydrate([this.taskRow(id)])[0]
  }

  listTasks(scope: TaskListScope): Task[] {
    switch (scope.scope) {
      case 'active':
        return this.hydrate(
          this.db.all<TaskRow>(
            `SELECT ${TASK_COLS} FROM tasks WHERE deleted_at IS NULL AND (status != 'done' OR completed_at >= ?) ORDER BY sort_order`,
            this.clock.now() - DONE_KEEP_MS
          )
        )
      case 'range':
        return this.hydrate(
          this.db.all<TaskRow>(
            `SELECT ${TASK_COLS} FROM tasks WHERE deleted_at IS NULL AND due_date BETWEEN ? AND ? ORDER BY due_date, due_time, sort_order`,
            scope.from,
            scope.to
          )
        )
      case 'search': {
        const terms = searchTerms(scope.text)
        if (!terms.length) return []
        const cond = terms.map(() => 'instr(search_text, ?) > 0').join(' AND ')
        return this.hydrate(
          this.db.all<TaskRow>(
            `SELECT ${TASK_COLS} FROM tasks WHERE deleted_at IS NULL AND ${cond} ORDER BY status = 'done', updated_at DESC LIMIT 200`,
            ...terms
          )
        )
      }
      case 'ids':
        return this.tasksByIds(scope.ids, false)
    }
  }

  // ---------- Ghi task ----------

  private requireLiveProject(id: string): void {
    if (!this.db.get('SELECT 1 FROM projects WHERE id = ? AND deleted_at IS NULL', id)) throw new AppError('NOT_FOUND', `Dự án ${id} không tồn tại`)
  }

  private requireLiveTags(ids: string[]): void {
    if (!ids.length) return
    const found = this.db.get<{ n: number }>('SELECT count(*) AS n FROM tags WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
    if (found?.n !== new Set(ids).size) throw new AppError('NOT_FOUND', 'Có nhãn không tồn tại')
  }

  /** Không có hạn thì cũng không có giờ, nhắc việc, lặp lại */
  private shapeDue(d: { dueDate: string | null; dueTime: string | null; remindBeforeMin: number | null; recurrence: RecurrenceRule | null }): typeof d {
    if (!d.dueDate) return { dueDate: null, dueTime: null, remindBeforeMin: null, recurrence: null }
    if (d.recurrence?.until && d.recurrence.until < d.dueDate) throw new AppError('VALIDATION', 'Ngày kết thúc lặp lại phải sau hạn đầu tiên')
    return d
  }

  /** Vị trí cuối cột trạng thái */
  private endOfColumn(status: TaskStatus, exceptId?: string): number {
    const max = this.db.get<{ m: number | null }>(
      'SELECT max(sort_order) AS m FROM tasks WHERE deleted_at IS NULL AND status = ? AND id != ?',
      status,
      exceptId ?? ''
    )?.m
    return (max ?? 0) + ORDER_STEP
  }

  private setTaskTags(taskId: string, tagIds: string[]): void {
    this.requireLiveTags(tagIds)
    this.db.run('DELETE FROM task_tags WHERE task_id = ?', taskId)
    for (const tagId of new Set(tagIds)) this.db.run('INSERT INTO task_tags(task_id, tag_id) VALUES (?, ?)', taskId, tagId)
  }

  createTask(input: TaskCreateInput): Task {
    return this.mutate('user', () => {
      const id = crypto.randomUUID()
      const now = this.stamp()
      const status = input.status ?? 'todo'
      const due = this.shapeDue({
        dueDate: input.dueDate ?? null,
        dueTime: input.dueTime ?? null,
        remindBeforeMin: input.remindBeforeMin ?? null,
        recurrence: input.recurrence ?? null
      })
      if (input.projectId) this.requireLiveProject(input.projectId)
      const notes = input.notes ?? ''
      this.db.run(
        `INSERT INTO tasks(id, project_id, title, notes, status, priority, due_date, due_time, remind_before_min, recurrence,
           series_id, occurrence_index, sort_order, completed_at, search_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.projectId ?? null,
        input.title,
        notes,
        status,
        input.priority ?? 0,
        due.dueDate,
        due.dueTime,
        due.remindBeforeMin,
        due.recurrence ? JSON.stringify(due.recurrence) : null,
        due.recurrence ? id : null,
        due.recurrence ? 0 : null,
        this.endOfColumn(status),
        status === 'done' ? now : null,
        taskSearchText(input.title, notes),
        now,
        now
      )
      this.setTaskTags(id, input.tagIds ?? [])
      ;(input.checklist ?? []).forEach((text, i) => {
        this.db.run(
          'INSERT INTO checklist_items(id, task_id, text, done, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
          crypto.randomUUID(),
          id,
          text,
          (i + 1) * ORDER_STEP,
          now,
          now
        )
      })
      this.touched.tasks.add(id)
      return this.getTask(id)
    })
  }

  updateTask(id: string, patch: TaskPatch): Task {
    return this.mutate('user', () => {
      const row = this.taskRow(id)
      const current = toTask(row, [], [])
      if (patch.projectId) this.requireLiveProject(patch.projectId)
      const title = patch.title ?? row.title
      const notes = patch.notes ?? row.notes
      const due = this.shapeDue({
        dueDate: patch.dueDate !== undefined ? patch.dueDate : current.dueDate,
        dueTime: patch.dueTime !== undefined ? patch.dueTime : current.dueTime,
        remindBeforeMin: patch.remindBeforeMin !== undefined ? patch.remindBeforeMin : current.remindBeforeMin,
        recurrence: patch.recurrence !== undefined ? patch.recurrence : current.recurrence
      })
      // Bắt đầu lặp lại: task này là lần đầu của một chuỗi mới
      const startsSeries = due.recurrence !== null && row.series_id === null
      this.db.run(
        `UPDATE tasks SET project_id = ?, title = ?, notes = ?, priority = ?, due_date = ?, due_time = ?, remind_before_min = ?,
           recurrence = ?, series_id = ?, occurrence_index = ?, search_text = ?, updated_at = ?
         WHERE id = ?`,
        patch.projectId !== undefined ? patch.projectId : row.project_id,
        title,
        notes,
        patch.priority ?? row.priority,
        due.dueDate,
        due.dueTime,
        due.remindBeforeMin,
        due.recurrence ? JSON.stringify(due.recurrence) : null,
        startsSeries ? id : row.series_id,
        startsSeries ? 0 : row.occurrence_index,
        taskSearchText(title, notes),
        this.stamp(row.updated_at),
        id
      )
      if (patch.tagIds) this.setTaskTags(id, patch.tagIds)
      this.touched.tasks.add(id)
      return this.getTask(id)
    })
  }

  /** Đổi trạng thái (bấm hoàn thành, chuyển cột): task sang cột mới thì nằm cuối cột */
  setStatus(id: string, status: TaskStatus): StatusResult {
    return this.mutate('user', () => {
      const row = this.taskRow(id)
      if (row.status !== status) this.writeStatus(row, status, this.endOfColumn(status, id))
      return { task: this.getTask(id), spawned: null, removedSpawnId: null }
    })
  }

  private writeStatus(row: TaskRow, status: TaskStatus, sortOrder: number): void {
    const now = this.stamp(row.updated_at)
    const completedAt = status === 'done' ? (row.status === 'done' ? row.completed_at : now) : null
    this.db.run('UPDATE tasks SET status = ?, completed_at = ?, sort_order = ?, updated_at = ? WHERE id = ?', status, completedAt, sortOrder, now, row.id)
    this.touched.tasks.add(row.id)
  }

  /** Kéo thả trên Kanban: sang cột `status` (nếu có), nằm giữa beforeId (ngay trên) và afterId (ngay dưới) */
  moveTask(id: string, move: TaskMove): Task {
    return this.mutate('user', () => {
      const row = this.taskRow(id)
      const status = move.status ?? (row.status as TaskStatus)
      const neighbour = (nid: string | null | undefined): number | null => {
        if (!nid) return null
        const n = this.db.get<{ sort_order: number }>('SELECT sort_order FROM tasks WHERE id = ? AND deleted_at IS NULL AND status = ?', nid, status)
        if (!n) throw new AppError('NOT_FOUND', `Task ${nid} không nằm trong cột ${status}`)
        return n.sort_order
      }
      const place = (): number | null =>
        !move.beforeId && !move.afterId ? this.endOfColumn(status, id) : orderBetween(neighbour(move.beforeId), neighbour(move.afterId))
      let order = place()
      if (order === null) {
        this.renumberColumn(status, id)
        order = place()!
      }
      if (status !== row.status) this.writeStatus(row, status, order)
      else {
        this.db.run('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?', order, this.stamp(row.updated_at), id)
        this.touched.tasks.add(id)
      }
      return this.getTask(id)
    })
  }

  /** Đánh số lại thứ tự một cột (khi hai phần tử kề nhau đã quá sát) */
  private renumberColumn(status: TaskStatus, exceptId: string): void {
    const rows = this.db.all<{ id: string; updated_at: number }>(
      'SELECT id, updated_at FROM tasks WHERE deleted_at IS NULL AND status = ? AND id != ? ORDER BY sort_order',
      status,
      exceptId
    )
    const orders = renumber(rows.length)
    rows.forEach((r, i) => {
      this.db.run('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?', orders[i], this.stamp(r.updated_at), r.id)
      this.touched.tasks.add(r.id)
    })
  }

  /** Xoá mềm (hoàn tác được). 'series': mọi lần chưa xong của chuỗi lặp lại (lịch sử đã xong giữ nguyên) */
  deleteTask(id: string, mode: 'one' | 'series'): void {
    this.mutate('user', () => {
      const row = this.taskRow(id)
      const rows =
        mode === 'series' && row.series_id
          ? this.db.all<{ id: string; updated_at: number }>(
              "SELECT id, updated_at FROM tasks WHERE series_id = ? AND deleted_at IS NULL AND (status != 'done' OR id = ?)",
              row.series_id,
              id
            )
          : [row]
      for (const r of rows) {
        const now = this.stamp(r.updated_at)
        this.db.run('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, r.id)
        this.touched.tasks.add(r.id)
      }
    })
  }

  restoreTasks(ids: string[]): Task[] {
    return this.mutate('restore', () => {
      for (const r of this.db.all<{ id: string; updated_at: number }>(
        'SELECT id, updated_at FROM tasks WHERE deleted_at IS NOT NULL AND id IN (SELECT value FROM json_each(?))',
        JSON.stringify(ids)
      )) {
        try {
          this.db.run('UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?', this.stamp(r.updated_at), r.id)
        } catch {
          // Chuỗi lặp lại đã có một lần khác cùng thứ tự (unique index): huỷ cả lần khôi phục
          throw new AppError('CONFLICT', 'Không khôi phục được: chuỗi lặp lại đã có lần này')
        }
        this.touched.tasks.add(r.id)
      }
      return this.tasksByIds(ids, false)
    })
  }

  // ---------- Dự án ----------

  listProjects(): Project[] {
    return this.db.all<ProjectRow>(`SELECT ${PROJECT_COLS} FROM projects WHERE deleted_at IS NULL ORDER BY sort_order`).map(toProject)
  }

  private projectRow(id: string): ProjectRow {
    const row = this.db.get<ProjectRow>(`SELECT ${PROJECT_COLS} FROM projects WHERE id = ? AND deleted_at IS NULL`, id)
    if (!row) throw new AppError('NOT_FOUND', `Dự án ${id} không tồn tại`)
    return row
  }

  createProject(input: ProjectCreate): Project {
    return this.mutate('user', () => {
      const id = crypto.randomUUID()
      const now = this.stamp()
      const max = this.db.get<{ m: number | null }>('SELECT max(sort_order) AS m FROM projects WHERE deleted_at IS NULL')?.m ?? 0
      this.db.run(
        'INSERT INTO projects(id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        id,
        input.name,
        input.color,
        max + ORDER_STEP,
        now,
        now
      )
      this.touched.projects.add(id)
      return toProject(this.projectRow(id))
    })
  }

  updateProject(id: string, patch: ProjectPatch): Project {
    return this.mutate('user', () => {
      const row = this.projectRow(id)
      const now = this.stamp(row.updated_at)
      const archivedAt = patch.archived === undefined ? row.archived_at : patch.archived ? (row.archived_at ?? now) : null
      this.db.run('UPDATE projects SET name = ?, color = ?, archived_at = ?, updated_at = ? WHERE id = ?', patch.name ?? row.name, patch.color ?? row.color, archivedAt, now, id)
      this.touched.projects.add(id)
      return toProject(this.projectRow(id))
    })
  }

  /** Xoá dự án: task của dự án chuyển về Hộp thư (không thuộc dự án nào) */
  deleteProject(id: string): void {
    this.mutate('user', () => {
      const row = this.projectRow(id)
      const now = this.stamp(row.updated_at)
      this.db.run('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id)
      this.touched.projects.add(id)
      for (const t of this.db.all<{ id: string; updated_at: number }>('SELECT id, updated_at FROM tasks WHERE project_id = ? AND deleted_at IS NULL', id)) {
        this.db.run('UPDATE tasks SET project_id = NULL, updated_at = ? WHERE id = ?', this.stamp(t.updated_at), t.id)
        this.touched.tasks.add(t.id)
      }
    })
  }

  // ---------- Nhãn ----------

  listTags(): Tag[] {
    return this.db.all<TagRow>(`SELECT ${TAG_COLS} FROM tags WHERE deleted_at IS NULL ORDER BY name_norm`).map(toTag)
  }

  private tagRow(id: string): TagRow {
    const row = this.db.get<TagRow>(`SELECT ${TAG_COLS} FROM tags WHERE id = ? AND deleted_at IS NULL`, id)
    if (!row) throw new AppError('NOT_FOUND', `Nhãn ${id} không tồn tại`)
    return row
  }

  /** Tạo nhãn; trùng tên (không phân biệt hoa thường, dấu) với nhãn đang có thì dùng lại nhãn đó */
  createTag(input: TagCreate): Tag {
    return this.mutate('user', () => {
      const norm = normalizeText(input.name)
      const existing = this.db.get<TagRow>(`SELECT ${TAG_COLS} FROM tags WHERE name_norm = ? AND deleted_at IS NULL`, norm)
      if (existing) return toTag(existing)
      const id = crypto.randomUUID()
      const now = this.stamp()
      this.db.run('INSERT INTO tags(id, name, name_norm, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, input.name, norm, input.color, now, now)
      this.touched.tags.add(id)
      return toTag(this.tagRow(id))
    })
  }

  updateTag(id: string, patch: TagPatch): Tag {
    return this.mutate('user', () => {
      const row = this.tagRow(id)
      const name = patch.name ?? row.name
      const norm = normalizeText(name)
      if (this.db.get('SELECT 1 FROM tags WHERE name_norm = ? AND deleted_at IS NULL AND id != ?', norm, id)) throw new AppError('CONFLICT', 'Đã có nhãn cùng tên')
      this.db.run('UPDATE tags SET name = ?, name_norm = ?, color = ?, updated_at = ? WHERE id = ?', name, norm, patch.color ?? row.color, this.stamp(row.updated_at), id)
      this.touched.tags.add(id)
      return toTag(this.tagRow(id))
    })
  }

  /** Xoá nhãn: gỡ khỏi mọi task (task đổi updated_at vì nhãn là một phần của task) */
  deleteTag(id: string): void {
    this.mutate('user', () => {
      const row = this.tagRow(id)
      const now = this.stamp(row.updated_at)
      this.db.run('UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id)
      this.touched.tags.add(id)
      for (const t of this.db.all<{ id: string; updated_at: number }>(
        'SELECT t.id, t.updated_at FROM tasks t JOIN task_tags tt ON tt.task_id = t.id WHERE tt.tag_id = ?',
        id
      )) {
        this.db.run('UPDATE tasks SET updated_at = ? WHERE id = ?', this.stamp(t.updated_at), t.id)
        this.touched.tasks.add(t.id)
      }
      this.db.run('DELETE FROM task_tags WHERE tag_id = ?', id)
    })
  }

  // ---------- Checklist (thuộc task: mọi thay đổi đều tăng updated_at của task) ----------

  private touchTask(taskId: string): void {
    const row = this.taskRow(taskId)
    this.db.run('UPDATE tasks SET updated_at = ? WHERE id = ?', this.stamp(row.updated_at), taskId)
    this.touched.tasks.add(taskId)
  }

  private checklistRow(id: string): ChecklistRow {
    const row = this.db.get<ChecklistRow>(`SELECT ${CHECKLIST_COLS} FROM checklist_items WHERE id = ? AND deleted_at IS NULL`, id)
    if (!row) throw new AppError('NOT_FOUND', `Mục checklist ${id} không tồn tại`)
    return row
  }

  addChecklistItem(taskId: string, text: string): Task {
    return this.mutate('user', () => {
      this.taskRow(taskId)
      const count = this.db.get<{ n: number; m: number | null }>(
        'SELECT count(*) AS n, max(sort_order) AS m FROM checklist_items WHERE task_id = ? AND deleted_at IS NULL',
        taskId
      )
      if ((count?.n ?? 0) >= 100) throw new AppError('VALIDATION', 'Checklist tối đa 100 mục')
      const now = this.stamp()
      this.db.run(
        'INSERT INTO checklist_items(id, task_id, text, done, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
        crypto.randomUUID(),
        taskId,
        text,
        (count?.m ?? 0) + ORDER_STEP,
        now,
        now
      )
      this.touchTask(taskId)
      return this.getTask(taskId)
    })
  }

  updateChecklistItem(id: string, patch: ChecklistPatch): Task {
    return this.mutate('user', () => {
      const row = this.checklistRow(id)
      const done = patch.done === undefined ? row.done : patch.done ? 1 : 0
      this.db.run('UPDATE checklist_items SET text = ?, done = ?, updated_at = ? WHERE id = ?', patch.text ?? row.text, done, this.stamp(row.updated_at), id)
      this.touchTask(row.task_id)
      return this.getTask(row.task_id)
    })
  }

  deleteChecklistItem(id: string): Task {
    return this.mutate('user', () => {
      const row = this.checklistRow(id)
      const now = this.stamp(row.updated_at)
      this.db.run('UPDATE checklist_items SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id)
      this.touchTask(row.task_id)
      return this.getTask(row.task_id)
    })
  }

  moveChecklistItem(id: string, move: OrderMove): Task {
    return this.mutate('user', () => {
      const row = this.checklistRow(id)
      const at = (nid: string | null | undefined): number | null => {
        if (!nid) return null
        const n = this.checklistRow(nid)
        if (n.task_id !== row.task_id) throw new AppError('NOT_FOUND', `Mục ${nid} không thuộc cùng task`)
        return n.sort_order
      }
      let order = orderBetween(at(move.beforeId), at(move.afterId))
      if (!move.beforeId && !move.afterId) {
        order = (this.db.get<{ m: number | null }>('SELECT max(sort_order) AS m FROM checklist_items WHERE task_id = ? AND deleted_at IS NULL AND id != ?', row.task_id, id)?.m ?? 0) + ORDER_STEP
      }
      if (order === null) {
        const rows = this.db.all<{ id: string }>('SELECT id FROM checklist_items WHERE task_id = ? AND deleted_at IS NULL AND id != ? ORDER BY sort_order', row.task_id, id)
        const orders = renumber(rows.length)
        rows.forEach((r, i) => this.db.run('UPDATE checklist_items SET sort_order = ? WHERE id = ?', orders[i], r.id))
        order = orderBetween(at(move.beforeId), at(move.afterId))!
      }
      this.db.run('UPDATE checklist_items SET sort_order = ?, updated_at = ? WHERE id = ?', order, this.stamp(row.updated_at), id)
      this.touchTask(row.task_id)
      return this.getTask(row.task_id)
    })
  }

  // ---------- Thiết lập ----------

  getSettings(): Settings {
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    const shape = settingsPatchSchema.shape as Record<string, { safeParse(v: unknown): { success: boolean; data?: unknown } }>
    for (const r of this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
      if (!(r.key in shape)) continue
      const parsed = shape[r.key].safeParse(JSON.parse(r.value))
      // Giá trị hỏng (sửa tay, bản cũ) thì dùng mặc định
      if (parsed.success && parsed.data !== undefined) out[r.key] = parsed.data
    }
    return out as unknown as Settings
  }

  updateSettings(patch: SettingsPatch): Settings {
    this.db.tx(() => {
      const now = this.clock.now()
      for (const [key, value] of Object.entries(patch) as Array<[string, unknown]>) {
        if (value === undefined) continue
        this.db.run(
          'INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          key,
          JSON.stringify(value) as Param,
          now
        )
      }
    })
    return this.getSettings()
  }
}
