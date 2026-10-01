import { describe, expect, it } from 'vitest'
import { MM, flatLayout } from '../src/renderer/src/flat/flatLayout'
import { MIN_WINDOW } from '../src/shared/constants'

const SIZES: Array<[number, number]> = [
  [MIN_WINDOW.width, MIN_WINDOW.height],
  [1280, 820],
  [1440, 860],
  [1366, 768],
  [1920, 1080],
  [2560, 1080],
  [1024, 1000],
  [3840, 2160]
]

describe('bố cục bàn làm việc 2D', () => {
  it.each(SIZES)('%i×%i: màn hình đủ lớn cho giao diện, robot và đèn nằm trọn trong khung, không lấn vào màn hình', (w, h) => {
    const l = flatLayout(w, h)
    expect(l.screen.width).toBeGreaterThanOrEqual(594)
    expect(l.screen.height).toBeGreaterThanOrEqual(396)
    // Màn hình (cả viền) nằm trong cửa sổ
    expect(l.bezel.x).toBeGreaterThanOrEqual(0)
    expect(l.bezel.y).toBeGreaterThanOrEqual(0)
    expect(l.bezel.x + l.bezel.width).toBeLessThanOrEqual(w)
    // Robot (kể cả lúc nhảy lên) và bệ
    const robotLeft = l.robot.x - MM.robotHalfW * l.s
    const robotRight = l.robot.x + MM.robotHalfW * l.s
    expect(robotLeft).toBeGreaterThanOrEqual(0)
    expect(robotRight).toBeLessThanOrEqual(l.bezel.x)
    expect(l.robot.y - 290 * l.s).toBeGreaterThanOrEqual(0)
    expect(l.base + MM.minBelow * l.s * 0.9).toBeLessThanOrEqual(h)
    // Đèn
    expect(l.lamp.x - MM.lampLeft * l.s).toBeGreaterThanOrEqual(l.bezel.x + l.bezel.width)
    expect(l.lamp.x + MM.lampRight * l.s).toBeLessThanOrEqual(w)
    expect(l.base - MM.lampTop * l.s).toBeGreaterThanOrEqual(0)
  })

  it('màn hình chiếm phần lớn bề ngang như cảnh 3D; cửa sổ đủ cao thì thấy cả mặt bàn phía trước', () => {
    const l = flatLayout(1440, 860)
    expect(l.screen.width / 1440).toBeGreaterThan(0.53)
    expect(l.deskFront).toBeLessThanOrEqual(860)
    const tall = flatLayout(1280, 1000)
    expect(tall.deskFront).toBeLessThanOrEqual(1000)
  })

  it('cửa sổ rộng: màn hình rộng ra (tối đa 2:1), cả bàn làm việc nằm giữa', () => {
    const l = flatLayout(2560, 1080)
    expect(l.screen.width / l.screen.height).toBeCloseTo(2, 5)
    const left = l.robot.x - MM.robotHalfW * l.s
    const right = l.lamp.x + MM.lampRight * l.s
    expect(Math.abs(left - (2560 - right))).toBeLessThan(2)
  })
})
