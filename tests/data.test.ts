import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TestClock } from '../src/main/clock'
import { Db } from '../src/main/db/connection'
import { MIGRATIONS, NewerDatabaseError, SCHEMA_VERSION, migrate, schemaVersion } from '../src/main/db/migrations'
import { AppError } from '../src/main/errors'
import { DataService } from '../src/main/services/data'
import type { ChangeSet } from '../src/shared/types'

let db: Db
let clock: TestClock
let data: DataService
let emitted: ChangeSet[]

beforeEach(() => {
  db = new Db(':memory:')
  migrate(db, null)
  clock = new TestClock()
  emitted = []
  data = new DataService(db, clock, (changes) => emitted.push(changes))
})

afterEach(() => db.close())

function rawInsert(overrides: Record<string, string | number | null>): void {
  const row: Record<string, string | number | null> = {
    id: crypto.randomUUID(),
    title: 'x',
    status: 'todo',
    sort_order: 1,
    search_text: 'x',
    created_at: 1,
    updated_at: 1,
    ...overrides
  }
  const keys = Object.keys(row)
  db.run(`INSERT INTO tasks(${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...Object.values(row))
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe(code)
    return
  }
  throw new Error(`Không ném lỗi ${code}`)
}

describe('migration', () => {
  it('DB mới lên phiên bản mới nhất; chạy lại không làm gì', () => {
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION)
    migrate(db, null)
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION)
    expect(MIGRATIONS.length).toBe(SCHEMA_VERSION)
  })

  it('DB của bản app mới hơn bị từ chối', () => {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`)
    expect(() => migrate(db, null)).toThrow(NewerDatabaseError)
  })
})

describe('ràng buộc trong DB (lớp chặn cuối)', () => {
  it('ngày, giờ không hợp lệ bị từ chối', () => {
    expect(() => rawInsert({ due_date: '2026-02-30' })).toThrow()
    expect(() => rawInsert({ due_date: '2026-2-3' })).toThrow()
    expect(() => rawInsert({ due_date: '2026-02-28', due_time: '24:00' })).toThrow()
    expect(() => rawInsert({ due_date: '2026-02-28', due_time: '9:30' })).toThrow()
    expect(() => rawInsert({ due_time: '09:30' })).toThrow() // có giờ mà không có ngày
    expect(() => rawInsert({ remind_before_min: 10 })).toThrow() // nhắc mà không có hạn
    rawInsert({ due_date: '2028-02-29', due_time: '23:59', remind_before_min: 0 })
  })

  it('"đã xong" khi và chỉ khi có completed_at', () => {
    expect(() => rawInsert({ status: 'done' })).toThrow()
    expect(() => rawInsert({ status: 'todo', completed_at: 5 })).toThrow()
    rawInsert({ status: 'done', completed_at: 5 })
  })
})

describe('task', () => {
  it('tạo task đầy đủ: nhãn, checklist, dự án; phát thay đổi cho renderer', () => {
    const project = data.createProject({ name: 'Công ty', color: 'sky' })
    const tag = data.createTag({ name: 'Gấp', color: 'coral' })
    const task = data.createTask({
      title: 'Gửi báo cáo tuần',
      notes: 'Đính kèm số liệu',
      projectId: project.id,
      priority: 3,
      dueDate: '2026-10-02',
      dueTime: '10:00',
      remindBeforeMin: 15,
      tagIds: [tag.id],
      checklist: ['Tổng hợp số liệu', 'Viết nhận xét']
    })
    expect(task).toMatchObject({ title: 'Gửi báo cáo tuần', status: 'todo', priority: 3, dueDate: '2026-10-02', dueTime: '10:00', tagIds: [tag.id], projectId: project.id })
    expect(task.checklist.map((c) => c.text)).toEqual(['Tổng hợp số liệu', 'Viết nhận xét'])
    expect(emitted.at(-1)?.tasks.map((t) => t.id)).toEqual([task.id])
  })

  it('bỏ hạn thì bỏ luôn giờ, nhắc việc, lặp lại', () => {
    const t = data.createTask({ title: 'Họp', dueDate: '2026-10-02', dueTime: '14:00', remindBeforeMin: 10, recurrence: { freq: 'weekly', interval: 1, basis: 'due' } })
    expect(t.seriesId).toBe(t.id)
    const u = data.updateTask(t.id, { dueDate: null })
    expect(u).toMatchObject({ dueDate: null, dueTime: null, remindBeforeMin: null, recurrence: null })
  })

  it('tìm kiếm không dấu, nhiều từ khoá', () => {
    data.createTask({ title: 'Gửi báo cáo cho sếp' })
    data.createTask({ title: 'Đi chợ mua rau', notes: 'Rau muống, cà chua' })
    data.createTask({ title: 'Báo giá khách hàng' })
    const titles = (q: string): string[] => data.listTasks({ scope: 'search', text: q }).map((t) => t.title).sort()
    expect(titles('bao cao')).toEqual(['Gửi báo cáo cho sếp'])
    expect(titles('BÁO')).toEqual(['Báo giá khách hàng', 'Gửi báo cáo cho sếp'])
    expect(titles('di cho')).toEqual(['Đi chợ mua rau'])
    expect(titles('ca chua')).toEqual(['Đi chợ mua rau'])
    expect(titles('   ')).toEqual([])
  })

  it('updated_at luôn tăng kể cả khi đồng hồ máy bị chỉnh lùi', () => {
    const t = data.createTask({ title: 'A' })
    clock.advance(-3600_000)
    const u = data.updateTask(t.id, { title: 'B' })
    expect(u.updatedAt).toBeGreaterThan(t.updatedAt)
  })

  it('hoàn thành đặt completed_at, bỏ hoàn thành thì xoá', () => {
    const t = data.createTask({ title: 'A' })
    const done = data.setStatus(t.id, 'done').task
    expect(done.status).toBe('done')
    expect(done.completedAt).not.toBeNull()
    const back = data.setStatus(t.id, 'todo').task
    expect(back.completedAt).toBeNull()
  })

  it('xoá mềm rồi khôi phục; renderer nhận bản đã xoá để bỏ khỏi bộ đệm', () => {
    const t = data.createTask({ title: 'A' })
    data.deleteTask(t.id, 'one')
    expect(emitted.at(-1)?.tasks[0].deletedAt).not.toBeNull()
    expect(data.listTasks({ scope: 'active' })).toHaveLength(0)
    expectCode(() => data.getTask(t.id), 'NOT_FOUND')
    const [r] = data.restoreTasks([t.id])
    expect(r.deletedAt).toBeNull()
    expect(data.listTasks({ scope: 'active' })).toHaveLength(1)
  })

  it('lỗi giữa chừng thì không ghi gì và không phát thay đổi', () => {
    const before = emitted.length
    expectCode(() => data.createTask({ title: 'A', tagIds: [crypto.randomUUID()] }), 'NOT_FOUND')
    expect(data.listTasks({ scope: 'active' })).toHaveLength(0)
    expect(emitted.length).toBe(before)
  })
})

describe('thứ tự trên Kanban', () => {
  const column = (): string[] =>
    data
      .listTasks({ scope: 'active' })
      .filter((t) => t.status === 'todo')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => t.title)

  it('việc mới lên đầu cột; thả vào giữa hai thẻ, về đầu cột, sang cột khác', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((title) => data.createTask({ title }))
    expect(column()).toEqual(['C', 'B', 'A'])
    data.moveTask(a.id, { beforeId: c.id, afterId: b.id })
    expect(column()).toEqual(['C', 'A', 'B'])
    data.moveTask(b.id, { afterId: c.id })
    expect(column()).toEqual(['B', 'C', 'A'])
    const moved = data.moveTask(a.id, { status: 'in_progress' })
    expect(moved.status).toBe('in_progress')
    expect(column()).toEqual(['B', 'C'])
  })

  it('chèn liên tục vào cùng một khe: tự đánh số lại, thứ tự vẫn đúng', () => {
    // Việc mới lên đầu cột: tạo B trước để A nằm trên B
    const [b, a] = ['B', 'A'].map((title) => data.createTask({ title }))
    const inserted: string[] = []
    let below = b.id
    for (let i = 0; i < 60; i++) {
      const t = data.createTask({ title: `X${i}` })
      data.moveTask(t.id, { beforeId: a.id, afterId: below })
      below = t.id
      inserted.unshift(`X${i}`)
    }
    expect(column()).toEqual(['A', ...inserted, 'B'])
  })

  it('hàng xóm ngược thứ tự (giao diện còn dữ liệu cũ): đặt xuống cuối cột thay vì lỗi', () => {
    const [b, a] = ['B', 'A'].map((title) => data.createTask({ title }))
    const x = data.createTask({ title: 'X' })
    data.moveTask(x.id, { beforeId: b.id, afterId: a.id })
    expect(column()).toEqual(['A', 'B', 'X'])
  })
})

describe('dự án, nhãn, checklist, thiết lập', () => {
  it('xoá dự án: task chuyển về Hộp thư', () => {
    const p = data.createProject({ name: 'Nhà', color: 'mint' })
    const t = data.createTask({ title: 'Sửa vòi nước', projectId: p.id })
    data.deleteProject(p.id)
    expect(data.listProjects()).toHaveLength(0)
    expect(data.getTask(t.id).projectId).toBeNull()
    expectCode(() => data.createTask({ title: 'X', projectId: p.id }), 'NOT_FOUND')
  })

  it('nhãn trùng tên (không phân biệt hoa thường, dấu) dùng lại nhãn cũ; xoá nhãn gỡ khỏi task', () => {
    const a = data.createTag({ name: 'Khẩn cấp', color: 'coral' })
    const b = data.createTag({ name: 'khan cap', color: 'sky' })
    expect(b.id).toBe(a.id)
    const t = data.createTask({ title: 'X', tagIds: [a.id] })
    const other = data.createTag({ name: 'Nhà', color: 'mint' })
    expectCode(() => data.updateTag(other.id, { name: 'KHẨN CẤP' }), 'CONFLICT')
    data.deleteTag(a.id)
    const after = data.getTask(t.id)
    expect(after.tagIds).toEqual([])
    expect(after.updatedAt).toBeGreaterThan(t.updatedAt)
  })

  it('checklist: thêm, đánh dấu, đổi chỗ, xoá — mỗi lần đều tăng updated_at của task', () => {
    const t = data.createTask({ title: 'Chuyển nhà', checklist: ['Đóng thùng', 'Gọi xe'] })
    const withItem = data.addChecklistItem(t.id, 'Trả chìa khoá')
    expect(withItem.checklist.map((c) => c.text)).toEqual(['Đóng thùng', 'Gọi xe', 'Trả chìa khoá'])
    const [first, second, third] = withItem.checklist
    const checked = data.updateChecklistItem(second.id, { done: true })
    expect(checked.checklist.find((c) => c.id === second.id)?.done).toBe(true)
    const moved = data.moveChecklistItem(third.id, { afterId: first.id })
    expect(moved.checklist.map((c) => c.text)).toEqual(['Trả chìa khoá', 'Đóng thùng', 'Gọi xe'])
    const removed = data.deleteChecklistItem(first.id)
    expect(removed.checklist.map((c) => c.text)).toEqual(['Trả chìa khoá', 'Gọi xe'])
    expect(removed.updatedAt).toBeGreaterThan(t.updatedAt)
  })

  it('thiết lập: mặc định, cập nhật, giá trị hỏng thì về mặc định', () => {
    expect(data.getSettings().language).toBe('vi')
    expect(data.updateSettings({ language: 'en', volume: 0.3 })).toMatchObject({ language: 'en', volume: 0.3, weekStart: 1 })
    db.run("UPDATE settings SET value = '\"klingon\"' WHERE key = 'language'")
    expect(data.getSettings().language).toBe('vi')
  })
})
