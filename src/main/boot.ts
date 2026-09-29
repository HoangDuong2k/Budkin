import { readFileSync } from 'fs'
import type { BootPrefs } from '../shared/boot'
import { writeFileAtomicSync } from './fsutil'

/** Nội dung boot.json (chưa kiểm tra), null nếu chưa có file hoặc file hỏng */
export function readBootFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown
  } catch {
    return null
  }
}

export function writeBootFile(file: string, prefs: BootPrefs): void {
  writeFileAtomicSync(file, JSON.stringify(prefs, null, 2))
}
