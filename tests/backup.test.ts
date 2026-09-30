import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TestClock } from '../src/main/clock'
import { Db } from '../src/main/db/connection'
import { migrate } from '../src/main/db/migrations'
import { BackupService, applyPendingRestore, backupKind, prunable } from '../src/main/services/backup'
import { DataService } from '../src/main/services/data'
import { addDays, localDateOf } from '../src/shared/datetime'

let dir: string
let dbFile: string
let backupsDir: string
let db: Db
let clock: TestClock
let data: DataService
let backups: BackupService

function open(): void {
  db = new Db(dbFile)
  migrate(db, backupsDir)
  data = new DataService(db, clock, () => undefined)
  backups = new BackupService(db, backupsDir, clock)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'budkin-backup-'))
  dbFile = join(dir, 'budkin.db')
  backupsDir = join(dir, 'backups')
  clock = new TestClock()
  open()
})

afterEach(() => {
  try {
    db.close()
  } catch {
    // đã đóng trong test
  }
  rmSync(dir, { recursive: true, force: true })
})

const titles = (): string[] =>
  data
    .listTasks({ scope: 'active' })
    .map((t) => t.title)
    .sort()

describe('sao lưu', () => {
  it('nhận đúng loại file, xoay vòng: 7 bản hằng ngày, 5 bản tự bấm, 3 bản trước khi nhập, giữ mọi bản trước nâng cấp', () => {
    expect(backupKind('budkin-2026-09-30.db')).toBe('daily')
    expect(backupKind('manual-20260930-081502.db')).toBe('manual')
    expect(backupKind('before-import-20260930-081502-2.db')).toBe('before-import')
    expect(backupKind('pre-v2.db')).toBe('pre-migration')
    expect(backupKind('budkin.db')).toBeNull()
    expect(backupKind('../budkin-2026-09-30.db')).toBeNull()

    const days = Array.from({ length: 10 }, (_, i) => `budkin-${addDays('2026-09-01', i)}.db`)
    const manual = Array.from({ length: 6 }, (_, i) => `manual-2026090${i}-120000.db`)
    const imports = Array.from({ length: 4 }, (_, i) => `before-import-2026090${i}-120000.db`)
    const out = prunable([...days, ...manual, ...imports, 'pre-v2.db', 'pre-v3.db', 'ghi-chu.txt'])
    expect(out.sort()).toEqual([...days.slice(0, 3), manual[0], imports[0]].sort())
  })

  it('mỗi ngày một bản, chỉ giữ 7 ngày gần nhất', () => {
    data.createTask({ title: 'Việc' })
    const first = backups.runDaily()
    expect(first?.name).toBe(`budkin-${localDateOf(clock.now())}.db`)
    // Cùng ngày: không sao lưu lại
    expect(backups.runDaily()).toBeNull()
    for (let i = 1; i <= 9; i++) {
      clock.advance(24 * 3600_000)
      expect(backups.runDaily()).not.toBeNull()
    }
    const daily = backups.list().filter((b) => b.kind === 'daily')
    expect(daily).toHaveLength(7)
    expect(daily.map((b) => b.name)).toContain(`budkin-${localDateOf(clock.now())}.db`)
    expect(existsSync(join(backupsDir, first!.name))).toBe(false)
  })

  it('sao lưu ngay: tên không trùng kể cả bấm nhiều lần trong một giây', () => {
    const names = [backups.snapshot('manual'), backups.snapshot('manual'), backups.snapshot('manual')].map((b) => b.name)
    expect(new Set(names).size).toBe(3)
    expect(backups.list().every((b) => b.kind === 'manual' && b.size > 0)).toBe(true)
  })

  it('khôi phục: lần mở sau dữ liệu về đúng lúc sao lưu, dữ liệu trước khi khôi phục vẫn được giữ lại', () => {
    data.createTask({ title: 'Có trong bản sao lưu' })
    const snap = backups.snapshot('manual')
    data.createTask({ title: 'Thêm sau khi sao lưu' })
    const marker = join(dir, 'restore.json')
    backups.requestRestore(snap.name, marker)
    expect(existsSync(marker)).toBe(true)
    db.close()

    clock.advance(60_000)
    expect(applyPendingRestore({ marker, db: dbFile, backups: backupsDir }, clock.now())).toBe(snap.name)
    expect(existsSync(marker)).toBe(false)
    open()
    expect(titles()).toEqual(['Có trong bản sao lưu'])
    const kept = readdirSync(backupsDir).filter((n) => backupKind(n) === 'before-restore')
    expect(kept).toHaveLength(1)

    // Bản giữ lại trước khi khôi phục có đủ dữ liệu cũ
    db.close()
    const old = new Db(join(backupsDir, kept[0]))
    expect(old.all<{ title: string }>('SELECT title FROM tasks ORDER BY title').map((r) => r.title)).toEqual(['Có trong bản sao lưu', 'Thêm sau khi sao lưu'])
    old.close()
    open()
  })

  it('không khôi phục bản lạ / hỏng; file đánh dấu hỏng thì bỏ qua', () => {
    expect(() => backups.requestRestore('../budkin.db', join(dir, 'restore.json'))).toThrow()
    mkdirSync(backupsDir, { recursive: true })
    writeFileSync(join(backupsDir, 'manual-20260101-000000.db'), 'không phải sqlite')
    expect(() => backups.requestRestore('manual-20260101-000000.db', join(dir, 'restore.json'))).toThrow()

    data.createTask({ title: 'Giữ nguyên' })
    db.close()
    const marker = join(dir, 'restore.json')
    writeFileSync(marker, '{hỏng')
    expect(applyPendingRestore({ marker, db: dbFile, backups: backupsDir }, clock.now())).toBeNull()
    writeFileSync(marker, JSON.stringify({ file: 'manual-20260101-000000.db' }))
    expect(applyPendingRestore({ marker, db: dbFile, backups: backupsDir }, clock.now())).toBeNull()
    expect(existsSync(marker)).toBe(false)
    open()
    expect(titles()).toEqual(['Giữ nguyên'])
  })
})
