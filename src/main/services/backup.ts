// Sao lưu DB: mỗi ngày một bản (giữ 7 bản gần nhất), một bản ngay trước khi nhập dữ liệu / khôi phục, bản do người dùng
// bấm "Sao lưu ngay". Chép bằng VACUUM INTO (bản chép nhất quán kể cả khi DB đang mở) sau khi quick_check thấy DB lành.
// Khôi phục không thay file DB lúc đang mở: ghi file đánh dấu rồi khởi động lại, lần mở sau đổi file trước khi mở DB.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { basename, join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { BackupInfo, BackupKind } from '../../shared/api'
import { localDateOf, localMinutesOf, pad2 } from '../../shared/datetime'
import type { Clock } from '../clock'
import { Db } from '../db/connection'
import { SCHEMA_VERSION } from '../db/migrations'
import { AppError } from '../errors'
import { renameRetrySync, writeFileAtomicSync } from '../fsutil'

const KINDS: Array<{ kind: BackupKind; re: RegExp; keep: number }> = [
  { kind: 'daily', re: /^budkin-\d{4}-\d{2}-\d{2}\.db$/, keep: 7 },
  { kind: 'manual', re: /^manual-\d{8}-\d{6}(-\d+)?\.db$/, keep: 5 },
  { kind: 'before-import', re: /^before-import-\d{8}-\d{6}(-\d+)?\.db$/, keep: 3 },
  { kind: 'before-restore', re: /^before-restore-\d{8}-\d{6}(-\d+)?\.db$/, keep: 3 },
  // Trước khi nâng cấp schema (migrations.ts): giữ lại hết (mỗi phiên bản một file)
  { kind: 'pre-migration', re: /^pre-v\d+\.db$/, keep: Infinity }
]

export function backupKind(name: string): BackupKind | null {
  return KINDS.find((k) => k.re.test(name))?.kind ?? null
}

/** Các file cần xoá để mỗi loại chỉ còn số bản quy định (tên có mốc thời gian nên xếp theo tên là theo thời gian) */
export function prunable(names: readonly string[]): string[] {
  const out: string[] = []
  for (const k of KINDS) {
    const mine = names.filter((n) => k.re.test(n)).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    out.push(...mine.slice(k.keep))
  }
  return out
}

/** Mốc thời gian trong tên file theo giờ địa phương: 20260930-081502 */
function stampName(ms: number): string {
  const min = localMinutesOf(ms)
  const sec = Math.floor(ms / 1000) % 60
  return `${localDateOf(ms).replace(/-/g, '')}-${pad2(Math.floor(min / 60))}${pad2(min % 60)}${pad2(sec)}`
}

/** DB hợp lệ để dùng: đọc được, quick_check ổn, không do bản app mới hơn tạo */
function checkDbFile(file: string): void {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = db.prepare('PRAGMA quick_check').all() as Array<Record<string, unknown>>
    if (rows.length !== 1 || Object.values(rows[0])[0] !== 'ok') throw new AppError('VALIDATION', 'Bản sao lưu bị hỏng')
    const v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (v > SCHEMA_VERSION) throw new AppError('VALIDATION', 'Bản sao lưu do phiên bản Budkin mới hơn tạo')
    if (v < 1) throw new AppError('VALIDATION', 'Không phải dữ liệu Budkin')
  } finally {
    db.close()
  }
}

export class BackupService {
  constructor(
    private readonly db: Db,
    readonly dir: string,
    private readonly clock: Clock
  ) {}

  list(): BackupInfo[] {
    if (!existsSync(this.dir)) return []
    const out: BackupInfo[] = []
    for (const name of readdirSync(this.dir)) {
      const kind = backupKind(name)
      if (!kind) continue
      try {
        const st = statSync(join(this.dir, name))
        out.push({ name, kind, createdAt: st.mtimeMs, size: st.size })
      } catch {
        // File vừa bị xoá: bỏ qua
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }

  /** DB đang dùng còn lành không (không chép một DB hỏng đè lên các bản sao lưu tốt) */
  private healthy(): boolean {
    const rows = this.db.all<Record<string, unknown>>('PRAGMA quick_check')
    return rows.length === 1 && Object.values(rows[0])[0] === 'ok'
  }

  private write(name: string): BackupInfo {
    mkdirSync(this.dir, { recursive: true })
    const file = join(this.dir, name)
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    this.prune()
    const st = statSync(file)
    return { name, kind: backupKind(name)!, createdAt: st.mtimeMs, size: st.size }
  }

  private prune(): void {
    for (const name of prunable(readdirSync(this.dir))) rmSync(join(this.dir, name), { force: true })
  }

  /** Bản sao lưu của hôm nay (nếu chưa có). Trả về bản vừa tạo, null nếu hôm nay đã có hoặc DB có vấn đề */
  runDaily(): BackupInfo | null {
    const name = `budkin-${localDateOf(this.clock.now())}.db`
    if (existsSync(join(this.dir, name))) return null
    if (!this.healthy()) {
      console.error('[sao lưu] quick_check báo lỗi — không sao lưu đè lên các bản cũ')
      return null
    }
    return this.write(name)
  }

  /** Sao lưu ngay (người dùng bấm, hoặc trước khi nhập dữ liệu) */
  snapshot(kind: 'manual' | 'before-import'): BackupInfo {
    if (!this.healthy()) throw new AppError('INTERNAL', 'Dữ liệu đang có lỗi, không sao lưu được')
    const base = `${kind}-${stampName(this.clock.now())}`
    let name = `${base}.db`
    for (let i = 2; existsSync(join(this.dir, name)); i++) name = `${base}-${i}.db`
    return this.write(name)
  }

  /** Hẹn khôi phục `name` ở lần mở app tới (ghi file đánh dấu) — bản sao lưu phải còn lành */
  requestRestore(name: string, marker: string): void {
    if (name !== basename(name) || !backupKind(name) || !existsSync(join(this.dir, name))) throw new AppError('NOT_FOUND', `Không có bản sao lưu ${name}`)
    checkDbFile(join(this.dir, name))
    writeFileAtomicSync(marker, JSON.stringify({ file: name }))
  }
}

/**
 * Lúc mở app, TRƯỚC khi mở DB: có file đánh dấu thì thay DB bằng bản sao lưu đã chọn (DB đang có được chép sang
 * before-restore-….db để còn quay lại được). Trả về tên bản đã khôi phục, null nếu không có gì để làm.
 */
export function applyPendingRestore(paths: { marker: string; db: string; backups: string }, now: number): string | null {
  if (!existsSync(paths.marker)) return null
  let name = ''
  try {
    name = String((JSON.parse(readFileSync(paths.marker, 'utf8')) as { file?: unknown }).file ?? '')
  } catch {
    // File đánh dấu hỏng: bỏ qua
  }
  // Xoá đánh dấu trước: khôi phục lỗi thì lần mở sau không lặp lại mãi
  rmSync(paths.marker, { force: true })
  const source = join(paths.backups, name)
  if (!name || name !== basename(name) || !backupKind(name) || !existsSync(source)) return null
  try {
    checkDbFile(source)
  } catch (err) {
    console.error('[khôi phục] bản sao lưu không dùng được', err)
    return null
  }
  if (existsSync(paths.db)) {
    const current = new Db(paths.db)
    try {
      mkdirSync(paths.backups, { recursive: true })
      const keep = join(paths.backups, `before-restore-${stampName(now)}.db`)
      if (!existsSync(keep)) current.exec(`VACUUM INTO '${keep.replace(/'/g, "''")}'`)
    } finally {
      current.close()
    }
  }
  const tmp = `${paths.db}.restoring`
  copyFileSync(source, tmp)
  // WAL / SHM của DB cũ không được áp lên DB mới
  for (const f of [`${paths.db}-wal`, `${paths.db}-shm`]) rmSync(f, { force: true })
  renameRetrySync(tmp, paths.db)
  for (const n of prunable(readdirSync(paths.backups))) rmSync(join(paths.backups, n), { force: true })
  return name
}
