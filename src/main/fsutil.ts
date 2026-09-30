import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'fs'
import { dirname } from 'path'

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Ghi file nguyên tử: ghi ra file tạm, fsync rồi mới đổi tên — mất điện giữa chừng cũng không còn file ghi dở.
 * Windows có thể tạm khoá file đích (antivirus đang quét, chương trình khác đang đọc) → thử đổi tên lại vài lần.
 */
export function writeFileAtomicSync(file: string, data: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameRetrySync(tmp, file)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

/** Đổi tên (ghi đè file đích); Windows tạm khoá file (antivirus, chương trình khác đang đọc) thì thử lại vài lần */
export function renameRetrySync(from: string, to: string): void {
  for (let i = 0; ; i++) {
    try {
      renameSync(from, to)
      return
    } catch (err) {
      if (i >= 5) throw err
      sleepSync(100)
    }
  }
}
