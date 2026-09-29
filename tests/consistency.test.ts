import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BOOT, bootArg, normalizeBoot, parseBootArg } from '../src/shared/boot'
import { APP_ID } from '../src/shared/constants'
import { SCREEN_BG, WINDOW_BG } from '../src/shared/palette'

const ROOT = join(__dirname, '..')

/** Giá trị biến CSS trong khối :root[data-theme='…'] của tokens.css */
function cssToken(theme: string, name: string): string | undefined {
  const css = readFileSync(join(ROOT, 'src/renderer/src/styles/tokens.css'), 'utf8')
  const block = new RegExp(`:root\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
  return new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1].trim()
}

describe('các chỗ phải khớp nhau', () => {
  it('APP_ID trùng appId của bộ cài (Windows dùng làm AppUserModelId cho thông báo)', () => {
    const yml = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')
    expect(/^appId:\s*(\S+)/m.exec(yml)?.[1]).toBe(APP_ID)
  })

  it('màu nền cửa sổ và nền màn hình trùng biến CSS', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(cssToken(theme, '--bg')).toBe(WINDOW_BG[theme])
      expect(cssToken(theme, '--screen-bg')).toBe(SCREEN_BG[theme])
    }
  })
})

describe('thiết lập khởi động (boot.json)', () => {
  it('file hỏng hoặc thiếu trường thì lấy mặc định', () => {
    expect(normalizeBoot(null)).toEqual(DEFAULT_BOOT)
    expect(normalizeBoot('rác')).toEqual(DEFAULT_BOOT)
    expect(normalizeBoot({ theme: 'tím', render: 'x', xwayland: 1, gpuCrashes: -3 })).toEqual(DEFAULT_BOOT)
    expect(normalizeBoot({}, 'dark').theme).toBe('dark')
    expect(normalizeBoot({ theme: 'dark', render: '2d', xwayland: true, gpuCrashes: 2 })).toEqual({ theme: 'dark', render: '2d', xwayland: true, gpuCrashes: 2 })
  })

  it('truyền qua tham số dòng lệnh rồi đọc lại nguyên vẹn', () => {
    const info = { ...DEFAULT_BOOT, theme: 'dark' as const, platform: 'win32', test: true }
    expect(parseBootArg(['electron', '--foo', bootArg(info)])).toEqual(info)
    expect(parseBootArg(['electron'])).toBeNull()
    expect(parseBootArg(['--deskbuddy-boot=%7Bhỏng'])).toBeNull()
  })
})
