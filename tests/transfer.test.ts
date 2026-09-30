import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TestClock } from '../src/main/clock'
import { Db } from '../src/main/db/connection'
import { migrate } from '../src/main/db/migrations'
import { DataService } from '../src/main/services/data'
import { exportData, importData } from '../src/main/services/transfer'
import { EXPORT_VERSION, liveCounts, parseExportFile, type ExportFile } from '../src/shared/exportFormat'
import type { SettingsPatch } from '../src/shared/schemas'

interface Side {
  db: Db
  clock: TestClock
  data: DataService
}

function side(offset = 0): Side {
  const db = new Db(':memory:')
  migrate(db, null)
  const clock = new TestClock(offset)
  return { db, clock, data: new DataService(db, clock, () => undefined) }
}

let a: Side
let b: Side

beforeEach(() => {
  a = side()
  b = side()
})

afterEach(() => {
  a.db.close()
  b.db.close()
})

/** Xuất từ một phía rồi đọc lại như đọc file thật (qua JSON và bộ kiểm tra) */
function roundTrip(s: Side): ExportFile {
  const text = JSON.stringify(exportData(s.db, s.data.getSettings(), s.clock.now(), '0.1.0'))
  const parsed = parseExportFile(text)
  if (!parsed.ok) throw new Error(`${parsed.error} ${parsed.detail}`)
  return parsed.file
}

function load(s: Side, file: ExportFile, mode: 'merge' | 'replace'): ReturnType<typeof importData> {
  return importData(s.db, s.clock, file, mode, (patch: SettingsPatch) => s.data.updateSettings(patch))
}

const titles = (s: Side): string[] =>
  s.data
    .listTasks({ scope: 'active' })
    .map((t) => t.title)
    .sort()

describe('xuất / nhập dữ liệu', () => {
  it('xuất rồi nhập vào máy mới (thay thế): đủ việc, dự án, nhãn, checklist, lặp lại, thiết lập', () => {
    const p = a.data.createProject({ name: 'Nhà', color: 'mint' })
    const tag = a.data.createTag({ name: 'Gấp', color: 'coral' })
    const t1 = a.data.createTask({
      title: 'Đóng tiền điện',
      projectId: p.id,
      tagIds: [tag.id],
      dueDate: '2026-10-05',
      dueTime: '08:00',
      remindBeforeMin: 30,
      recurrence: { freq: 'monthly', interval: 1, monthDay: 5, basis: 'due' },
      checklist: ['Kiểm tra hoá đơn', 'Chuyển khoản']
    })
    a.data.updateChecklistItem(t1.checklist[0].id, { done: true })
    a.data.createTask({ title: 'Đã xong', status: 'done' })
    const gone = a.data.createTask({ title: 'Đã xoá' })
    a.data.deleteTask(gone.id, 'one')
    a.data.updateSettings({ weekStart: 0, allDayRemindTime: '07:30', quality: 'saver' })

    const file = roundTrip(a)
    expect(file.version).toBe(EXPORT_VERSION)
    expect(liveCounts(file)).toEqual({ tasks: 2, projects: 1, tags: 1 })
    // Bản đã xoá cũng đi theo (để gộp giữa hai máy)
    expect(file.tasks).toHaveLength(3)

    const { result } = load(b, file, 'replace')
    expect(result.tasks.added).toBe(3)
    expect(titles(b)).toEqual(['Đã xong', 'Đóng tiền điện'])
    const copy = b.data.getTask(t1.id)
    expect(copy).toMatchObject({ projectId: p.id, tagIds: [tag.id], dueDate: '2026-10-05', dueTime: '08:00', remindBeforeMin: 30, recurrence: t1.recurrence })
    expect(copy.checklist.map((c) => [c.text, c.done])).toEqual([
      ['Kiểm tra hoá đơn', true],
      ['Chuyển khoản', false]
    ])
    expect(b.data.listTasks({ scope: 'search', text: 'dong tien' })).toHaveLength(1)
    // Thiết lập đi theo dữ liệu thì lấy, thiết lập riêng của máy (chất lượng 3D) thì không
    expect(b.data.getSettings()).toMatchObject({ weekStart: 0, allDayRemindTime: '07:30', quality: 'balanced' })
  })

  it('thay thế: dữ liệu cũ trên máy mất hết', () => {
    b.data.createTask({ title: 'Việc cũ trên máy B' })
    b.data.createProject({ name: 'Dự án B', color: 'sky' })
    a.data.createTask({ title: 'Việc của A' })
    load(b, roundTrip(a), 'replace')
    expect(titles(b)).toEqual(['Việc của A'])
    expect(b.data.listProjects()).toEqual([])
  })

  it('gộp: bản mới hơn thắng, việc chỉ có ở một bên thì giữ, thiết lập của máy không đổi', () => {
    const shared = a.data.createTask({ title: 'Bản gốc' })
    const older = a.data.createTask({ title: 'Sửa trên B sau' })
    load(b, roundTrip(a), 'replace')
    b.data.updateSettings({ weekStart: 1 })

    a.clock.advance(1000)
    a.data.updateTask(shared.id, { title: 'A sửa sau cùng' })
    a.data.createTask({ title: 'Chỉ có trên A' })
    a.data.updateSettings({ weekStart: 0 })
    b.clock.advance(2000)
    b.data.updateTask(older.id, { title: 'B sửa mới hơn' })
    b.data.createTask({ title: 'Chỉ có trên B' })

    const { result } = load(b, roundTrip(a), 'merge')
    expect(titles(b)).toEqual(['A sửa sau cùng', 'B sửa mới hơn', 'Chỉ có trên A', 'Chỉ có trên B'])
    expect(result.tasks).toEqual({ added: 1, updated: 1, kept: 1 })
    expect(b.data.getSettings().weekStart).toBe(1)
  })

  it('gộp: xoá bên này thì xoá bên kia (bản xoá mới hơn); sửa sau khi bên kia xoá thì giữ', () => {
    const x = a.data.createTask({ title: 'Xoá trên A' })
    const y = a.data.createTask({ title: 'A xoá, B sửa sau' })
    load(b, roundTrip(a), 'replace')
    a.clock.advance(1000)
    a.data.deleteTask(x.id, 'one')
    a.data.deleteTask(y.id, 'one')
    b.clock.advance(5000)
    b.data.updateTask(y.id, { title: 'B sửa sau khi A xoá' })

    load(b, roundTrip(a), 'merge')
    expect(titles(b)).toEqual(['B sửa sau khi A xoá'])
  })

  it('gộp: nhãn cùng tên tạo trên hai máy thành một nhãn; dự án đã xoá thì việc về Hộp thư', () => {
    const tagA = a.data.createTag({ name: 'Công việc', color: 'mint' })
    const pA = a.data.createProject({ name: 'Tạm', color: 'lemon' })
    const t = a.data.createTask({ title: 'Có nhãn', tagIds: [tagA.id] })
    const tagB = b.data.createTag({ name: 'cong viec', color: 'coral' })
    load(b, roundTrip(a), 'merge')
    expect(b.data.listTags().map((x) => x.id)).toEqual([tagB.id])
    expect(b.data.getTask(t.id).tagIds).toEqual([tagB.id])

    // Việc trên B trỏ tới dự án mà A đã xoá (file mới hơn): về Hộp thư
    load(b, roundTrip(a), 'merge')
    const onB = b.data.createTask({ title: 'Trên B trong dự án Tạm', projectId: pA.id })
    a.clock.advance(1000)
    a.data.deleteProject(pA.id)
    load(b, roundTrip(a), 'merge')
    expect(b.data.getTask(onB.id).projectId).toBeNull()
    expect(b.data.listProjects()).toEqual([])
  })

  it('gộp: hai máy cùng tạo lần kế tiếp của một việc lặp lại — giữ một bản (bản mới hơn)', () => {
    const r = a.data.createTask({ title: 'Tập thể dục', dueDate: '2026-09-30', recurrence: { freq: 'daily', interval: 1, basis: 'due' } })
    load(b, roundTrip(a), 'replace')
    a.data.setStatus(r.id, 'done')
    b.clock.advance(1000)
    b.data.setStatus(r.id, 'done')
    load(b, roundTrip(a), 'merge')
    const open = b.data.listTasks({ scope: 'active' }).filter((t) => t.status !== 'done' && t.seriesId === r.seriesId)
    expect(open).toHaveLength(1)
  })

  it('từ chối file lạ, file của bản mới hơn, file hỏng — không ghi gì', () => {
    expect(parseExportFile('không phải json')).toMatchObject({ ok: false, error: 'not-json' })
    expect(parseExportFile('{"format":"khac"}')).toMatchObject({ ok: false, error: 'not-budkin' })
    expect(parseExportFile(JSON.stringify({ format: 'budkin', version: EXPORT_VERSION + 1 }))).toMatchObject({ ok: false, error: 'newer' })
    a.data.createTask({ title: 'Việc' })
    const file = roundTrip(a)
    const broken = { ...file, tasks: [{ ...file.tasks[0], status: 'done', completedAt: null }] }
    expect(parseExportFile(JSON.stringify(broken))).toMatchObject({ ok: false, error: 'invalid' })
    const dup = { ...file, tasks: [file.tasks[0], file.tasks[0]] }
    expect(parseExportFile(JSON.stringify(dup))).toMatchObject({ ok: false, error: 'duplicate' })
  })
})
