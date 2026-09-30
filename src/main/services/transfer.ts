// Xuất / nhập dữ liệu (JSON). Nhập chạy trong MỘT giao dịch: lỗi giữa chừng thì không ghi gì.
// Gộp: mỗi đối tượng lấy bản mới hơn theo updated_at (kể cả bản đã xoá — xoá bên kia thì xoá bên này).
// Thay thế: xoá sạch dữ liệu trên máy rồi lấy nguyên file. Trạng thái nhắc việc không đi theo file.
import { normalizeText, taskSearchText } from '../../shared/search'
import { settingsPatchSchema, type SettingsPatch } from '../../shared/schemas'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  PORTABLE_SETTINGS,
  type ExportFile,
  type ExportedTask,
  type ImportMode,
  type ImportResult,
  type ImportStats
} from '../../shared/exportFormat'
import type { Settings } from '../../shared/types'
import type { Clock } from '../clock'
import type { Db } from '../db/connection'
import { CHECKLIST_COLS, PROJECT_COLS, TAG_COLS, TASK_COLS, toProject, toTag, toTask, type ChecklistRow, type ProjectRow, type TagRow, type TaskRow } from '../db/rows'

/** Toàn bộ dữ liệu (kể cả bản ghi đã xoá) cùng các thiết lập đi theo dữ liệu */
export function exportData(db: Db, settings: Settings, now: number, appVersion: string): ExportFile {
  const tags = new Map<string, string[]>()
  for (const r of db.all<{ task_id: string; tag_id: string }>('SELECT task_id, tag_id FROM task_tags ORDER BY task_id, tag_id')) {
    const list = tags.get(r.task_id)
    if (list) list.push(r.tag_id)
    else tags.set(r.task_id, [r.tag_id])
  }
  const items = new Map<string, ExportedTask['checklist']>()
  for (const r of db.all<ChecklistRow>(`SELECT ${CHECKLIST_COLS} FROM checklist_items WHERE deleted_at IS NULL ORDER BY task_id, sort_order`)) {
    const item = { id: r.id, text: r.text, done: r.done === 1, sortOrder: r.sort_order }
    const list = items.get(r.task_id)
    if (list) list.push(item)
    else items.set(r.task_id, [item])
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now,
    appVersion,
    settings: Object.fromEntries(PORTABLE_SETTINGS.map((k) => [k, settings[k]])) as ExportFile['settings'],
    projects: db.all<ProjectRow>(`SELECT ${PROJECT_COLS} FROM projects ORDER BY sort_order`).map(toProject),
    tags: db.all<TagRow>(`SELECT ${TAG_COLS} FROM tags ORDER BY created_at`).map(toTag),
    tasks: db.all<TaskRow>(`SELECT ${TASK_COLS} FROM tasks ORDER BY created_at`).map((r) => {
      const { checklist: _c, ...task } = toTask(r, tags.get(r.id) ?? [], [])
      return { ...task, checklist: items.get(r.id) ?? [] }
    })
  }
}

const zero = (): ImportStats => ({ added: 0, updated: 0, kept: 0 })

/** Thiết lập hợp lệ trong file (giá trị hỏng thì bỏ qua từng khoá) */
function portableSettings(file: ExportFile): SettingsPatch {
  const out: Record<string, unknown> = {}
  const shape = settingsPatchSchema.shape as Record<string, { safeParse(v: unknown): { success: boolean; data?: unknown } }>
  for (const k of PORTABLE_SETTINGS) {
    const v = file.settings?.[k]
    if (v === undefined) continue
    const parsed = shape[k].safeParse(v)
    if (parsed.success) out[k] = parsed.data
  }
  return out as SettingsPatch
}

/**
 * Nhập dữ liệu. `saveSettings` chỉ được gọi ở chế độ Thay thế (Gộp giữ thiết lập của máy này).
 * Trả về số đối tượng thêm mới / cập nhật / giữ bản trên máy, cùng id các task đã ghi (để đánh dấu nhắc việc cũ là đã báo)
 */
export function importData(
  db: Db,
  clock: Clock,
  file: ExportFile,
  mode: ImportMode,
  saveSettings: (patch: SettingsPatch) => void
): { result: Omit<ImportResult, 'backup'>; taskIds: string[] } {
  const stats = { tasks: zero(), projects: zero(), tags: zero() }
  const written: string[] = []
  /** Mốc xoá cho bản trên máy bị loại (trùng lần lặp): luôn mới hơn bản cũ */
  const stamp = (prev: number): number => Math.max(clock.now(), prev + 1)

  db.tx(() => {
    if (mode === 'replace') {
      // Thứ tự theo khoá ngoại: bảng con trước
      for (const t of ['reminder_state', 'task_tags', 'checklist_items', 'tasks', 'tags', 'projects']) db.exec(`DELETE FROM ${t}`)
      saveSettings(portableSettings(file))
    }

    // ---------- Dự án ----------
    for (const p of file.projects) {
      const local = db.get<{ updated_at: number }>('SELECT updated_at FROM projects WHERE id = ?', p.id)
      if (local && p.updatedAt <= local.updated_at) {
        stats.projects.kept++
        continue
      }
      db.run(
        `INSERT INTO projects(id, name, color, sort_order, archived_at, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, sort_order = excluded.sort_order,
           archived_at = excluded.archived_at, created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
        p.id,
        p.name,
        p.color,
        p.sortOrder,
        p.archivedAt,
        p.createdAt,
        p.updatedAt,
        p.deletedAt
      )
      stats.projects[local ? 'updated' : 'added']++
    }
    const liveProject = (id: string | null): string | null => (id && db.get('SELECT 1 FROM projects WHERE id = ? AND deleted_at IS NULL', id) ? id : null)

    // ---------- Nhãn (tên không trùng giữa các nhãn chưa xoá) ----------
    /** Nhãn trong file → nhãn trên máy cùng tên (hai máy tạo cùng một nhãn: gộp làm một) */
    const tagAlias = new Map<string, string>()
    const liveTagNamed = (norm: string, exceptId: string): string | null =>
      db.get<{ id: string }>('SELECT id FROM tags WHERE name_norm = ? AND deleted_at IS NULL AND id != ?', norm, exceptId)?.id ?? null
    for (const t of file.tags) {
      const local = db.get<{ updated_at: number }>('SELECT updated_at FROM tags WHERE id = ?', t.id)
      const norm = normalizeText(t.name)
      const clash = t.deletedAt === null ? liveTagNamed(norm, t.id) : null
      if (!local) {
        if (clash) {
          tagAlias.set(t.id, clash)
          stats.tags.kept++
          continue
        }
        db.run(
          'INSERT INTO tags(id, name, name_norm, color, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          t.id,
          t.name,
          norm,
          t.color,
          t.createdAt,
          t.updatedAt,
          t.deletedAt
        )
        stats.tags.added++
        continue
      }
      if (t.updatedAt <= local.updated_at) {
        stats.tags.kept++
        continue
      }
      if (clash) {
        // Bản mới đổi sang tên đã có nhãn khác dùng: việc gắn nhãn này chuyển sang nhãn kia
        tagAlias.set(t.id, clash)
        stats.tags.kept++
        continue
      }
      db.run(
        'UPDATE tags SET name = ?, name_norm = ?, color = ?, created_at = ?, updated_at = ?, deleted_at = ? WHERE id = ?',
        t.name,
        norm,
        t.color,
        t.createdAt,
        t.updatedAt,
        t.deletedAt,
        t.id
      )
      if (t.deletedAt !== null) db.run('DELETE FROM task_tags WHERE tag_id = ?', t.id)
      stats.tags.updated++
    }
    const liveTags = (ids: string[]): string[] => {
      const mapped = [...new Set(ids.map((id) => tagAlias.get(id) ?? id))]
      return mapped.filter((id) => db.get('SELECT 1 FROM tags WHERE id = ? AND deleted_at IS NULL', id))
    }

    // ---------- Task ----------
    for (const t of file.tasks) {
      const local = db.get<{ updated_at: number }>('SELECT updated_at FROM tasks WHERE id = ?', t.id)
      if (local && t.updatedAt <= local.updated_at) {
        stats.tasks.kept++
        continue
      }
      let deletedAt = t.deletedAt
      // Hai máy cùng tạo "lần kế tiếp" của một chuỗi lặp lại: giữ bản mới hơn, bản kia coi như đã xoá
      if (deletedAt === null && t.seriesId && t.occurrenceIndex !== null) {
        const other = db.get<{ id: string; updated_at: number }>(
          'SELECT id, updated_at FROM tasks WHERE series_id = ? AND occurrence_index = ? AND deleted_at IS NULL AND id != ?',
          t.seriesId,
          t.occurrenceIndex,
          t.id
        )
        if (other && other.updated_at >= t.updatedAt) deletedAt = t.updatedAt
        else if (other) {
          const at = stamp(other.updated_at)
          db.run('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?', at, at, other.id)
          written.push(other.id)
        }
      }
      writeTask(db, t, liveProject(t.projectId), deletedAt)
      db.run('DELETE FROM task_tags WHERE task_id = ?', t.id)
      for (const tagId of liveTags(t.tagIds)) db.run('INSERT INTO task_tags(task_id, tag_id) VALUES (?, ?)', t.id, tagId)
      db.run('DELETE FROM checklist_items WHERE task_id = ?', t.id)
      for (const c of t.checklist) {
        // id mục checklist trùng với mục của task khác trên máy (hiếm): tạo id mới
        const clash = db.get('SELECT 1 FROM checklist_items WHERE id = ?', c.id)
        db.run(
          'INSERT INTO checklist_items(id, task_id, text, done, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          clash ? crypto.randomUUID() : c.id,
          t.id,
          c.text,
          c.done ? 1 : 0,
          c.sortOrder,
          t.updatedAt,
          t.updatedAt
        )
      }
      stats.tasks[local ? 'updated' : 'added']++
      written.push(t.id)
    }

    // Dự án / nhãn vừa bị xoá theo file: task trên máy (không có trong file) đang trỏ tới thì bỏ ra
    db.run('UPDATE tasks SET project_id = NULL WHERE project_id IN (SELECT id FROM projects WHERE deleted_at IS NOT NULL)')
    db.run('DELETE FROM task_tags WHERE tag_id IN (SELECT id FROM tags WHERE deleted_at IS NOT NULL)')
  })
  return { result: { mode, ...stats }, taskIds: written }
}

function writeTask(db: Db, t: ExportedTask, projectId: string | null, deletedAt: number | null): void {
  db.run(
    `INSERT INTO tasks(id, project_id, title, notes, status, priority, due_date, due_time, remind_before_min, recurrence, series_id,
       occurrence_index, next_spawned_id, sort_order, completed_at, search_text, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, title = excluded.title, notes = excluded.notes, status = excluded.status,
       priority = excluded.priority, due_date = excluded.due_date, due_time = excluded.due_time, remind_before_min = excluded.remind_before_min,
       recurrence = excluded.recurrence, series_id = excluded.series_id, occurrence_index = excluded.occurrence_index,
       next_spawned_id = excluded.next_spawned_id, sort_order = excluded.sort_order, completed_at = excluded.completed_at,
       search_text = excluded.search_text, created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    t.id,
    projectId,
    t.title,
    t.notes,
    t.status,
    t.priority,
    t.dueDate,
    t.dueTime,
    t.remindBeforeMin,
    t.recurrence ? JSON.stringify(t.recurrence) : null,
    t.seriesId,
    t.occurrenceIndex,
    t.nextSpawnedId,
    t.sortOrder,
    t.completedAt,
    taskSearchText(t.title, t.notes),
    t.createdAt,
    t.updatedAt,
    deletedAt
  )
}
