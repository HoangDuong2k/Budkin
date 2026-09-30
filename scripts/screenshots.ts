/**
 * Ảnh chụp giới thiệu (README): tạo dữ liệu mẫu rồi chụp bàn làm việc lúc bật đèn và tắt đèn, Kanban, Lịch, Cài đặt.
 * Chạy: npm run build && npm run screenshots   → docs/screenshots/*.png
 */
import { mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron, type Page } from 'playwright-core'
import type { ArgsOf, Channel, DeskApi, ResultOf } from '../src/shared/api'
import { addDays, localDateOf } from '../src/shared/datetime'

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'docs', 'screenshots')
const USER_DATA = join(ROOT, 'test-output', 'screenshots-userdata')

async function call<C extends Channel>(page: Page, channel: C, ...args: ArgsOf<C>): Promise<ResultOf<C>> {
  const res = (await page.evaluate(([ch, a]) => (window as unknown as { api: DeskApi }).api.invoke(ch as C, ...(a as ArgsOf<C>)), [channel, args] as const)) as {
    ok: boolean
    value: ResultOf<C>
  }
  if (!res.ok) throw new Error(`${channel} lỗi`)
  return res.value
}

/** Đồng hồ của app lúc chụp: 9:50 sáng hôm nay — ảnh giống nhau dù chụp lúc nào (robot đang nhắc đúng một việc 10:00) */
const CLOCK = ((): number => {
  const d = new Date()
  d.setHours(9, 50, 0, 0)
  return d.getTime() - Date.now()
})()

async function main(): Promise<void> {
  rmSync(USER_DATA, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, BUDKIN_TEST: '1', BUDKIN_USER_DATA: USER_DATA, BUDKIN_CLOCK_OFFSET: String(CLOCK) } as Record<string, string>
  })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as unknown as { __budkin?: { stage: { ready: boolean } } }).__budkin?.stage.ready, undefined, { timeout: 20000 })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 860))
  await page.waitForTimeout(500)

  const today = localDateOf(Date.now() + CLOCK)
  const work = await call(page, 'projects:create', { name: 'Công ty', color: 'sky' })
  await call(page, 'projects:create', { name: 'Nhà', color: 'mint' })
  const urgent = await call(page, 'tags:create', { name: 'Gấp', color: 'coral' })
  const idea = await call(page, 'tags:create', { name: 'Ý tưởng', color: 'lavender' })
  await call(page, 'tasks:create', { title: 'Gửi báo cáo tuần cho sếp', dueDate: addDays(today, -1), dueTime: '17:00', priority: 3, projectId: work.id, tagIds: [urgent.id], remindBeforeMin: 15 })
  await call(page, 'tasks:create', {
    title: 'Họp team dự án mới',
    dueDate: today,
    dueTime: '10:00',
    priority: 2,
    projectId: work.id,
    remindBeforeMin: 15,
    checklist: ['Chuẩn bị slide', 'Gửi lịch họp', 'Đặt phòng']
  })
  await call(page, 'tasks:create', { title: 'Vẽ phác thảo robot mới', dueDate: today, dueTime: '14:00', priority: 1, tagIds: [idea.id], remindBeforeMin: 0 })
  await call(page, 'tasks:create', { title: 'Mua sữa và pate cho mèo', dueDate: today, remindBeforeMin: 0 })
  await call(page, 'tasks:create', { title: 'Đọc tài liệu kiến trúc', dueDate: addDays(today, 2), projectId: work.id })
  await call(page, 'tasks:create', { title: 'Sửa vòi nước nhà tắm', dueDate: addDays(today, 3), priority: 2 })
  await call(page, 'tasks:create', { title: 'Gọi điện cho bà ngoại', dueDate: addDays(today, 5), dueTime: '19:00' })
  await call(page, 'tasks:create', { title: 'Lên kế hoạch du lịch Tết', tagIds: [idea.id] })
  const doing = await call(page, 'tasks:create', { title: 'Viết tài liệu API', dueDate: addDays(today, 1), projectId: work.id, priority: 1 })
  await call(page, 'tasks:setStatus', doing.id, 'in_progress')
  const done = await call(page, 'tasks:create', { title: 'Nộp hồ sơ bảo hiểm', dueDate: addDays(today, -2) })
  await call(page, 'tasks:setStatus', done.id, 'done')

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => (window as unknown as { __budkin: { theme: { getState(): { request(t: string): void } } } }).__budkin.theme.getState().request(t), theme)
    await page.waitForFunction(() => (window as unknown as { __budkin: { env: { anim: unknown } } }).__budkin.env.anim === null, undefined, { timeout: 5000 })
    // Con trỏ trên danh sách: robot quay sang nhìn màn hình
    await page.mouse.move(820, 330, { steps: 6 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: join(OUT, `desk-${theme === 'light' ? 'day' : 'night'}.png`) })
    console.log(`  ✓ desk-${theme === 'light' ? 'day' : 'night'}.png`)
  }
  // Kanban và Lịch ở chế độ Mở rộng (giao diện phủ gần kín cửa sổ); bỏ qua nhắc việc để banner không che
  for (const a of (await call(page, 'reminders:snapshot')).active) await call(page, 'reminders:dismiss', a.taskId)
  await page.evaluate((t) => (window as unknown as { __budkin: { theme: { getState(): { request(t: string): void } } } }).__budkin.theme.getState().request(t), 'light')
  await page.waitForFunction(() => (window as unknown as { __budkin: { env: { anim: unknown } } }).__budkin.env.anim === null, undefined, { timeout: 5000 })
  await page.locator('.sidebar .nav-main').nth(3).click()
  await page.locator('.list-head').first().click()
  for (const [key, name] of [
    ['2', 'kanban'],
    ['3', 'calendar']
  ]) {
    await page.keyboard.press(key)
    if (key === '2') await page.keyboard.press('f')
    await page.mouse.move(4, 4)
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(OUT, `${name}.png`) })
    console.log(`  ✓ ${name}.png`)
  }
  // Cài đặt, mục Dữ liệu (có bản sao lưu hằng ngày + một bản vừa sao lưu), trên màn hình máy tính
  await page.keyboard.press('f')
  await call(page, 'data:backupNow')
  await page.keyboard.press('Control+Comma')
  await page.locator('.settings-nav [data-section="data"]').click()
  await page.mouse.move(820, 330, { steps: 6 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(OUT, 'settings.png') })
  console.log('  ✓ settings.png')
  await app.evaluate(({ app: a }) => a.exit(0))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
