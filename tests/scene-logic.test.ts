import { describe, expect, it } from 'vitest'
import { decideRenderMode } from '../src/shared/renderMode'
import { CAMERA, cameraFor, sceneLayout } from '../src/renderer/src/scene/math/layout'
import { MAX_PITCH, MAX_YAW, MIN_PITCH, lookAngles, pointerTarget, softClamp } from '../src/renderer/src/scene/math/lookAt'
import { alertHopSeconds, alertLedOn, nextLedToggle } from '../src/renderer/src/scene/logic/alertBlink'
import { TIMINGS, initialState, nextDeadline, reduce, visibleMode, withTransients, type RobotState } from '../src/renderer/src/scene/logic/robotMachine'
import { ROBOT_MODELS, isRobotModel, nextRobot, type RobotModel } from '../src/shared/robots'
import { FLIP_AT, themeFrame, type ThemeAnim } from '../src/renderer/src/scene/logic/themeTimeline'

describe('robot nhìn theo con trỏ', () => {
  const head = { x: -0.4, y: 0.2, z: 0 }

  it('nhìn sang phải thì yaw dương, sang trái âm, lên trên thì pitch dương', () => {
    expect(lookAngles(head, { x: 0, y: 0.2, z: 0.3 }, 0).yaw).toBeGreaterThan(0.3)
    expect(lookAngles(head, { x: -0.8, y: 0.2, z: 0.3 }, 0).yaw).toBeLessThan(-0.3)
    expect(lookAngles(head, { x: -0.4, y: 0.5, z: 0.3 }, 0).pitch).toBeGreaterThan(0.3)
    expect(lookAngles(head, { x: -0.4, y: 0.2, z: 1 }, 0)).toEqual({ yaw: 0, pitch: 0 })
  })

  it('gốc robot đã xoay thì góc tính theo hệ của robot', () => {
    const straight = lookAngles(head, { x: -0.4 + Math.sin(0.3), y: 0.2, z: Math.cos(0.3) }, 0.3)
    expect(straight.yaw).toBeCloseTo(0, 9)
  })

  it('giới hạn: yaw mềm tới ±70°, pitch −25°..35°', () => {
    const behind = lookAngles(head, { x: 0.5, y: 0.2, z: -1 }, 0)
    expect(Math.abs(behind.yaw)).toBeLessThan(MAX_YAW)
    expect(softClamp(0.01, MAX_YAW)).toBeCloseTo(0.01, 5)
    expect(lookAngles(head, { x: -0.4, y: 5, z: 0.1 }, 0).pitch).toBe(MAX_PITCH)
    expect(lookAngles(head, { x: -0.4, y: -5, z: 0.1 }, 0).pitch).toBe(MIN_PITCH)
  })

  it('con trỏ giữa màn hình → điểm trước mặt robot nằm trên trục nhìn; con trỏ bên phải → điểm lệch phải', () => {
    const layout = sceneLayout(1.6)
    const cam = cameraFor(layout, 1.6)
    const h = { x: layout.robot.x, y: 0.2, z: layout.robot.z }
    const center = pointerTarget({ x: 0, y: 0 }, cam, CAMERA, 1.6, h)
    const right = pointerTarget({ x: 0.9, y: 0 }, cam, CAMERA, 1.6, h)
    expect(center.x).toBeCloseTo(cam.x, 6)
    expect(right.x).toBeGreaterThan(center.x)
    expect(lookAngles(h, right, 0).yaw).toBeGreaterThan(lookAngles(h, center, 0).yaw)
  })
})

describe('máy trạng thái của robot', () => {
  const t0 = 1_000_000
  const idle = (): RobotState => reduce(initialState(t0, false), { type: 'tick', at: t0 })

  it('không thao tác: buồn ngủ rồi ngủ; có thao tác: giật mình tỉnh dậy', () => {
    let s = idle()
    s = reduce(s, { type: 'tick', at: t0 + TIMINGS.drowsyAfter })
    expect(visibleMode(s)).toBe('drowsy')
    s = reduce(s, { type: 'tick', at: t0 + TIMINGS.drowsyAfter + TIMINGS.sleepAfter })
    expect(visibleMode(s)).toBe('sleep')
    const at = t0 + 500_000
    s = reduce(s, { type: 'input', at })
    expect(visibleMode(s)).toBe('startled')
    s = reduce(s, { type: 'tick', at: at + TIMINGS.transient.startled })
    expect(visibleMode(s)).toBe('idle')
  })

  it('có nhắc việc: không ngủ; hoạt cảnh chọc / đèn hiện đè lên rồi quay về báo động', () => {
    let s = reduce(idle(), { type: 'alert', at: t0, active: true })
    s = reduce(s, { type: 'tick', at: t0 + 10 * 60_000 })
    expect(visibleMode(s)).toBe('alert')
    s = reduce(s, { type: 'poke', at: t0 + 10 * 60_000 })
    expect(visibleMode(s)).toBe('poked')
    s = reduce(s, { type: 'tick', at: t0 + 10 * 60_000 + 1000 })
    expect(visibleMode(s)).toBe('alert')
    s = reduce(s, { type: 'alert', at: t0 + 11 * 60_000, active: false })
    expect(visibleMode(s)).toBe('idle')
  })

  it('ăn mừng hiện đè cả báo động, tối đa một lần mỗi 2 giây', () => {
    let s = reduce(idle(), { type: 'alert', at: t0, active: true })
    s = reduce(s, { type: 'celebrate', at: t0 + 100 })
    expect(visibleMode(s)).toBe('celebrate')
    const again = reduce(s, { type: 'celebrate', at: t0 + 1000 })
    expect(again.lastCelebrateAt).toBe(t0 + 100)
  })

  it('hẹn giờ kiểm tra lại đúng lúc cần (không kiểm tra mỗi khung hình)', () => {
    const s = idle()
    expect(nextDeadline(s)).toBe(t0 + TIMINGS.drowsyAfter)
    const alerting = reduce(s, { type: 'alert', at: t0, active: true })
    expect(nextDeadline(alerting)).toBe(Infinity)
    expect(nextDeadline(reduce(s, { type: 'poke', at: t0 + 5 }))).toBe(t0 + 5 + TIMINGS.transient.poked)
  })
})

describe('bật / tắt đèn', () => {
  const anim = (to: 'light' | 'dark', over: Partial<ThemeAnim> = {}): ThemeAnim => ({
    to,
    startedAt: 0,
    fromEnv: to === 'light' ? 0 : 1,
    fromLamp: to === 'light' ? 0 : 1,
    reduced: false,
    ...over
  })

  it('tắt đèn: đổi theme DOM lúc 100 ms, kết thúc ở phòng tối, đèn tắt', () => {
    expect(themeFrame(anim('dark'), FLIP_AT.toDark - 1).flipped).toBe(false)
    expect(themeFrame(anim('dark'), FLIP_AT.toDark).flipped).toBe(true)
    const end = themeFrame(anim('dark'), 700)
    expect(end).toMatchObject({ env: 0, lamp: 0, bulb: 0, done: true })
  })

  it('bật đèn: bóng chớp (sáng → mờ → sáng) rồi mới đổi theme, kết thúc phòng sáng', () => {
    const lamp = (t: number): number => themeFrame(anim('light'), t).lamp
    expect(lamp(80)).toBeCloseTo(1, 6)
    expect(lamp(120)).toBeCloseTo(0.25, 6)
    expect(lamp(170)).toBeCloseTo(1, 6)
    expect(themeFrame(anim('light'), FLIP_AT.toLight).flipped).toBe(true)
    expect(themeFrame(anim('light'), 800)).toMatchObject({ env: 1, lamp: 1, done: true })
  })

  it('bấm lại giữa chừng: đi tiếp từ giá trị hiện tại, không nhảy', () => {
    const mid = themeFrame(anim('dark'), 300)
    const back = themeFrame(anim('light', { startedAt: 300, fromEnv: mid.env, fromLamp: mid.lamp }), 300)
    expect(back.env).toBeCloseTo(mid.env, 9)
  })

  it('giảm chuyển động: đổi theme ngay, không nhấp nháy', () => {
    const f = themeFrame(anim('light', { reduced: true }), 0)
    expect(f.flipped).toBe(true)
    expect(f.lamp).toBe(1)
    expect(themeFrame(anim('light', { reduced: true }), 200).done).toBe(true)
  })
})

describe('chọn 3D hay 2D', () => {
  const ok = { webgl2: true, software: false, gpuCrashes: 0 }
  it('các trường hợp', () => {
    expect(decideRenderMode('auto', ok)).toEqual({ mode: '3d', software: false, reason: 'ok' })
    expect(decideRenderMode('2d', ok).mode).toBe('2d')
    expect(decideRenderMode('auto', { ...ok, webgl2: false }).reason).toBe('no-webgl')
    expect(decideRenderMode('auto', { ...ok, gpuCrashes: 2 }).reason).toBe('gpu-crashes')
    expect(decideRenderMode('auto', { ...ok, software: true })).toEqual({ mode: '3d', software: true, reason: 'software' })
    expect(decideRenderMode('software', ok).software).toBe(true)
  })
})

describe('đèn ăng-ten khi báo động', () => {
  it('nhanh lúc đầu, chậm dần; đổi đúng các mốc, không nhảy pha giữa hai đoạn', () => {
    expect(alertLedOn(0)).toBe(true)
    expect(alertLedOn(0.3)).toBe(false)
    expect(nextLedToggle(0)).toBe(0.25)
    expect(nextLedToggle(14.9)).toBe(15)
    // Giây 15: đèn tiếp tục xen kẽ (60 lần đổi trong 15 giây đầu → sáng)
    expect(alertLedOn(14.9)).toBe(false)
    expect(alertLedOn(15)).toBe(true)
    expect(nextLedToggle(15.1)).toBe(15.5)
    expect(nextLedToggle(119.9)).toBe(120)
    expect(alertLedOn(120)).toBe(true)
    expect(nextLedToggle(3600)).toBe(3602)
  })

  it('vẽ bằng CPU: đèn đổi mỗi giây một lần ngay từ đầu (mỗi khung rất tốn)', () => {
    expect(nextLedToggle(0, true)).toBe(1)
    expect(alertLedOn(0.5, true)).toBe(true)
    expect(alertLedOn(1.5, true)).toBe(false)
    let draws = 0
    for (let t = 0; t < 60; t = nextLedToggle(t, true)) draws++
    expect(draws).toBe(60)
  })

  it('báo động cả đêm: mỗi phút chỉ vẽ lại ~30 lần', () => {
    let draws = 0
    for (let t = 3600; t < 3660; t = nextLedToggle(t)) draws++
    expect(draws).toBe(30)
    expect(alertHopSeconds(true)).toBeLessThan(alertHopSeconds(false))
  })
})

describe('nhiều mẫu robot', () => {
  it('robot mới lên bệ: diễn lại hoạt cảnh xuất hiện, kể cả khi robot cũ đang ngủ', () => {
    let s = initialState(0, false)
    s = reduce(s, { type: 'tick', at: 1e6 })
    expect(visibleMode(s)).toBe('sleep')
    s = reduce(s, { type: 'intro', at: 1e6 })
    expect(visibleMode(s)).toBe('intro')
    expect(nextDeadline(s)).toBe(1e6 + TIMINGS.transient.intro)
    // Hết hoạt cảnh xuất hiện thì thức, đếm lại từ đầu mới buồn ngủ
    s = reduce(s, { type: 'tick', at: 1e6 + TIMINGS.transient.intro })
    expect(visibleMode(s)).toBe('idle')
  })

  it('độ dài hoạt cảnh riêng của từng robot ghép lên bộ chung', () => {
    const cfg = withTransients(TIMINGS, { poked: 1000 })
    expect(cfg.transient.poked).toBe(1000)
    expect(cfg.transient.celebrate).toBe(TIMINGS.transient.celebrate)
    expect(reduce(initialState(0, false), { type: 'poke', at: 10 }, cfg).transientUntil).toBe(1010)
    expect(withTransients(TIMINGS, undefined)).toBe(TIMINGS)
  })

  it('bấm bệ lần lượt qua mọi robot rồi quay về robot đầu', () => {
    let id: RobotModel = 'budkin'
    const seen: RobotModel[] = []
    for (let i = 0; i < ROBOT_MODELS.length; i++) {
      seen.push(id)
      id = nextRobot(id)
    }
    expect(new Set(seen).size).toBe(ROBOT_MODELS.length)
    expect(id).toBe('budkin')
    expect(isRobotModel('mech')).toBe(true)
    expect(isRobotModel('r2d2')).toBe(false)
  })
})
