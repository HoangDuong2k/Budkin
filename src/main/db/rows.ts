// Dòng SQLite (snake_case) ↔ đối tượng nghiệp vụ (camelCase)
import type { ColorKey } from '../../shared/palette'
import type { ChecklistItem, Priority, Project, RecurrenceRule, Tag, Task, TaskStatus } from '../../shared/types'

export interface TaskRow {
  id: string
  project_id: string | null
  title: string
  notes: string
  status: string
  priority: number
  due_date: string | null
  due_time: string | null
  remind_before_min: number | null
  recurrence: string | null
  series_id: string | null
  occurrence_index: number | null
  next_spawned_id: string | null
  sort_order: number
  completed_at: number | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export const TASK_COLS =
  'id, project_id, title, notes, status, priority, due_date, due_time, remind_before_min, recurrence, series_id, occurrence_index, next_spawned_id, sort_order, completed_at, created_at, updated_at, deleted_at'

export interface ProjectRow {
  id: string
  name: string
  color: string
  sort_order: number
  archived_at: number | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export const PROJECT_COLS = 'id, name, color, sort_order, archived_at, created_at, updated_at, deleted_at'

export interface TagRow {
  id: string
  name: string
  color: string
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export const TAG_COLS = 'id, name, color, created_at, updated_at, deleted_at'

export interface ChecklistRow {
  id: string
  task_id: string
  text: string
  done: number
  sort_order: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export const CHECKLIST_COLS = 'id, task_id, text, done, sort_order, created_at, updated_at, deleted_at'

export function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    color: r.color as ColorKey,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at
  }
}

export function toTag(r: TagRow): Tag {
  return { id: r.id, name: r.name, color: r.color as ColorKey, createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at }
}

export function toChecklistItem(r: ChecklistRow): ChecklistItem {
  return { id: r.id, taskId: r.task_id, text: r.text, done: r.done === 1, sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at }
}

export function toTask(r: TaskRow, tagIds: string[], checklist: ChecklistItem[]): Task {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    notes: r.notes,
    status: r.status as TaskStatus,
    priority: r.priority as Priority,
    dueDate: r.due_date,
    dueTime: r.due_time,
    remindBeforeMin: r.remind_before_min,
    recurrence: r.recurrence ? (JSON.parse(r.recurrence) as RecurrenceRule) : null,
    seriesId: r.series_id,
    occurrenceIndex: r.occurrence_index,
    nextSpawnedId: r.next_spawned_id,
    sortOrder: r.sort_order,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    tagIds,
    checklist
  }
}
