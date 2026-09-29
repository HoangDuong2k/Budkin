import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'

export type Param = SQLInputValue

/** Kết nối SQLite (node:sqlite, đồng bộ) kèm bộ nhớ câu lệnh đã chuẩn bị và giao dịch lồng nhau */
export class Db {
  readonly sql: DatabaseSync
  private readonly stmts = new Map<string, StatementSync>()
  private savepoints = 0

  constructor(file: string) {
    this.sql = new DatabaseSync(file, { timeout: 5000 })
    // WAL: đọc không chặn ghi; NORMAL đủ an toàn với WAL (mất điện chỉ mất giao dịch cuối, không hỏng file)
    this.sql.exec('PRAGMA journal_mode = WAL')
    this.sql.exec('PRAGMA synchronous = NORMAL')
    this.sql.exec('PRAGMA foreign_keys = ON')
    // Chặn các thao tác có thể làm hỏng file DB (ghi thẳng vào schema…)
    this.sql.enableDefensive(true)
  }

  private stmt(sql: string): StatementSync {
    let s = this.stmts.get(sql)
    if (!s) {
      s = this.sql.prepare(sql)
      this.stmts.set(sql, s)
    }
    return s
  }

  get<T>(sql: string, ...params: Param[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined
  }

  all<T>(sql: string, ...params: Param[]): T[] {
    return this.stmt(sql).all(...params) as T[]
  }

  run(sql: string, ...params: Param[]): number {
    return Number(this.stmt(sql).run(...params).changes)
  }

  exec(sql: string): void {
    this.sql.exec(sql)
  }

  /** Chạy trong một giao dịch; lồng nhau thì dùng SAVEPOINT. Lỗi → huỷ toàn bộ thay đổi bên trong */
  tx<T>(fn: () => T): T {
    if (this.sql.isTransaction) {
      const name = `sp${++this.savepoints}`
      this.sql.exec(`SAVEPOINT ${name}`)
      try {
        const out = fn()
        this.sql.exec(`RELEASE ${name}`)
        return out
      } catch (err) {
        this.sql.exec(`ROLLBACK TO ${name}`)
        this.sql.exec(`RELEASE ${name}`)
        throw err
      }
    }
    this.sql.exec('BEGIN IMMEDIATE')
    try {
      const out = fn()
      this.sql.exec('COMMIT')
      return out
    } catch (err) {
      this.sql.exec('ROLLBACK')
      throw err
    }
  }

  close(): void {
    try {
      // Gộp WAL vào file chính để lần sau mở nhanh, sao chép file DB cũng đủ dữ liệu
      this.sql.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      // DB chỉ đọc hoặc đang lỗi: vẫn đóng
    }
    this.stmts.clear()
    this.sql.close()
  }
}
