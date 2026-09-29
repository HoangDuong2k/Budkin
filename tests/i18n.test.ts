import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { EN } from '../src/shared/i18n-en'
import { setLang, tr } from '../src/shared/i18n'

const SRC = join(__dirname, '..', 'src')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

/** Mọi câu được dịch: tham số chuỗi của tr('…') / trKey('…') trong code */
function translationKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/\btr(?:Key)?\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const k = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
      if (k && !keys.has(k)) keys.set(k, file.slice(SRC.length + 1))
    }
  }
  return keys
}

const VN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('giao diện tiếng Anh', () => {
  const keys = translationKeys()

  it('mọi câu tiếng Việt trên giao diện đều có bản tiếng Anh', () => {
    const missing = [...keys].filter(([k]) => VN.test(k) && !EN[k]).map(([k, where]) => `${where}: ${k}`)
    expect(missing, `Thiếu bản dịch:\n${missing.join('\n')}`).toEqual([])
  })

  it('bản dịch giữ đúng các biến {…} và không còn chữ tiếng Việt', () => {
    const leftoverVi = (vi: string, en: string): boolean => en.split(/[\s/()]+/).some((w) => VN.test(w) && !vi.includes(w))
    const bad = Object.entries(EN).filter(([vi, en]) => placeholders(vi).join() !== placeholders(en).join() || leftoverVi(vi, en))
    expect(bad).toEqual([])
  })

  it('không có bản dịch thừa (câu đã bỏ khỏi code)', () => {
    const unused = Object.keys(EN).filter((k) => !keys.has(k))
    expect(unused).toEqual([])
  })

  it('tr() đổi theo ngôn ngữ và thay biến', () => {
    setLang('en')
    expect(tr('Tắt đèn')).toBe(EN['Tắt đèn'])
    expect(tr('Câu chưa có trong từ điển {n}', { n: 3 })).toBe('Câu chưa có trong từ điển 3')
    setLang('vi')
    expect(tr('Tắt đèn')).toBe('Tắt đèn')
  })
})
