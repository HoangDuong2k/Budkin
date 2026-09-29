// Migration theo PRAGMA user_version. Đã phát hành thì KHÔNG sửa bước cũ — chỉ thêm bước mới vào cuối.
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import type { Db } from './connection'

const V1 = `
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;

CREATE TABLE settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK(json_valid(value)),
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE projects(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  color TEXT NOT NULL,
  sort_order REAL NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;

CREATE TABLE tags(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  name_norm TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;
CREATE UNIQUE INDEX tags_live_name ON tags(name_norm) WHERE deleted_at IS NULL;

CREATE TABLE tasks(
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes) <= 20000),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 3),
  due_date TEXT CHECK(due_date IS NULL OR date(due_date) IS due_date),
  due_time TEXT CHECK(due_time IS NULL OR (due_date IS NOT NULL AND time(due_time) IS due_time || ':00' AND due_time < '24:00')),
  remind_before_min INTEGER CHECK(remind_before_min IS NULL OR (due_date IS NOT NULL AND remind_before_min BETWEEN 0 AND 40320)),
  recurrence TEXT CHECK(recurrence IS NULL OR (due_date IS NOT NULL AND json_valid(recurrence))),
  series_id TEXT,
  occurrence_index INTEGER,
  next_spawned_id TEXT,
  sort_order REAL NOT NULL,
  completed_at INTEGER,
  search_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK((status = 'done') = (completed_at IS NOT NULL))
) STRICT;
CREATE INDEX tasks_board ON tasks(status, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX tasks_due ON tasks(due_date, due_time) WHERE deleted_at IS NULL;
CREATE INDEX tasks_project ON tasks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX tasks_updated ON tasks(updated_at);
CREATE UNIQUE INDEX tasks_series_occ ON tasks(series_id, occurrence_index) WHERE series_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE task_tags(
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id, tag_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX task_tags_tag ON task_tags(tag_id);

CREATE TABLE checklist_items(
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 500),
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  sort_order REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;
CREATE INDEX checklist_task ON checklist_items(task_id, sort_order) WHERE deleted_at IS NULL;
`

/**
 * Trạng thái nhắc việc — thuộc riêng máy này: không xuất ra file, không đổi updated_at của task.
 * schedule_key = hạn|giờ|nhắc trước: sửa hạn là khoá đổi → nhắc việc tự đặt lại từ đầu.
 * fired_stage: 0 chưa nhắc, 1 đã nhắc "sắp đến hạn", 2 đã nhắc "đến hạn"
 */
const V2 = `
CREATE TABLE reminder_state(
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  schedule_key TEXT NOT NULL,
  fired_stage INTEGER NOT NULL DEFAULT 0 CHECK(fired_stage BETWEEN 0 AND 2),
  fired_at INTEGER,
  snoozed_until INTEGER,
  acked_at INTEGER
) STRICT;
`

/** Bước i nâng DB từ phiên bản i lên i + 1 */
export const MIGRATIONS: ReadonlyArray<(db: Db) => void> = [(db) => db.exec(V1), (db) => db.exec(V2)]

export const SCHEMA_VERSION = MIGRATIONS.length

/** DB do bản app mới hơn tạo ra: không mở (có thể làm hỏng dữ liệu) */
export class NewerDatabaseError extends Error {
  constructor(readonly version: number) {
    super(`Database schema v${version} is newer than this app (v${SCHEMA_VERSION})`)
  }
}

export function schemaVersion(db: Db): number {
  return db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0
}

/**
 * Đưa DB lên phiên bản mới nhất. DB đã có dữ liệu thì chép một bản an toàn trước khi đổi
 * (backups/pre-v{N}.db) — migration lỗi vẫn còn nguyên dữ liệu cũ.
 */
export function migrate(db: Db, backupDir: string | null): void {
  const from = schemaVersion(db)
  if (from > SCHEMA_VERSION) throw new NewerDatabaseError(from)
  if (from === SCHEMA_VERSION) return
  if (from > 0 && backupDir) {
    mkdirSync(backupDir, { recursive: true })
    const file = join(backupDir, `pre-v${SCHEMA_VERSION}.db`)
    if (existsSync(file)) rmSync(file)
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  }
  for (let v = from; v < SCHEMA_VERSION; v++) {
    db.tx(() => {
      MIGRATIONS[v](db)
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
}
