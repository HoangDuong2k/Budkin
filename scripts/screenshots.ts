/**
 * Ảnh chụp giới thiệu (README): tạo dữ liệu mẫu rồi chụp bàn làm việc lúc bật đèn và tắt đèn, Kanban, Lịch, Cài đặt,
 * Kết nối AI (Claude thêm việc qua cầu nối MCP thật), từng mẫu robot trên bệ tròn, bàn làm việc 2D (máy không có WebGL).
 * Chạy: npm run build && npm run screenshots   → docs/screenshots/*.png
 */
import { mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { _electron as electron, type Page } from 'playwright-core'
import type { ArgsOf, Channel, DeskApi, ResultOf } from '../src/shared/api'
import { ROBOT_MODELS } from '../src/shared/robots'
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

  // Kết nối AI: "Claude Desktop" (thư mục cấu hình giả của chế độ kiểm thử) đã kết nối, quyền Xem và sửa
  mkdirSync(join(USER_DATA, 'no-claude-desktop'), { recursive: true })
  const ai = await call(page, 'ai:connect', 'desktop')
  await page.locator('.settings-nav [data-section="general"]').click()
  await page.locator('.settings-nav [data-section="ai"]').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(OUT, 'settings-ai.png') })
  console.log('  ✓ settings-ai.png')
  await page.keyboard.press('Escape')

  // Claude thêm việc qua cầu nối MCP thật: việc hiện ngay trong danh sách Hôm nay, robot ăn mừng, toast kèm nút Hoàn tác
  await page.keyboard.press('1')
  await page.locator('.sidebar .nav-main').nth(0).click()
  const mcp = new Client({ name: 'claude-ai', version: '1.0.0' })
  await mcp.connect(new StdioClientTransport({ command: ai.launch.command, args: ai.launch.args, env: { ...(process.env as Record<string, string>), ...ai.launch.env } }))
  await mcp.callTool({
    name: 'create_tasks',
    arguments: { tasks: [{ title: 'Gọi điện cho mẹ', due_date: today, due_time: '20:00', project: 'Nhà' }, { title: 'Đặt vé xe về quê', due_date: addDays(today, 1), tags: ['Gấp'] }] }
  })
  await mcp.close()
  await page.mouse.move(820, 330, { steps: 6 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(OUT, 'desk-ai.png') })
  console.log('  ✓ desk-ai.png')

  // Từng mẫu robot trên bệ tròn (ảnh cắt quanh robot, cùng khung để xếp thành hàng trong README)
  for (const robot of ROBOT_MODELS) {
    await call(page, 'settings:update', { robot })
    await page.waitForTimeout(2400)
    await page.mouse.move(760, 330, { steps: 6 })
    await page.waitForTimeout(900)
    const at = (await page.evaluate('window.__budkin.hit().pedestal')) as { x: number; y: number }
    await page.screenshot({ path: join(OUT, `robot-${robot}.png`), clip: { x: Math.round(at.x - 115), y: Math.round(at.y - 335), width: 230, height: 370 } })
    console.log(`  ✓ robot-${robot}.png`)
  }
  await call(page, 'settings:update', { robot: 'budkin' })
  await app.evaluate(({ app: a }) => a.exit(0))

  // Bàn làm việc 2D: mở lại cùng dữ liệu mẫu như máy không có WebGL
  const flat = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, BUDKIN_TEST: '1', BUDKIN_E2E_NO_WEBGL: '1', BUDKIN_USER_DATA: USER_DATA, BUDKIN_CLOCK_OFFSET: String(CLOCK) } as Record<string, string>
  })
  const fp = await flat.firstWindow()
  await fp.waitForSelector('.flat-robot', { timeout: 20000 })
  await flat.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 860))
  await fp.waitForTimeout(800)
  for (const theme of ['light', 'dark'] as const) {
    await fp.evaluate((t) => (window as unknown as { __budkin: { theme: { getState(): { request(t: string): void } } } }).__budkin.theme.getState().request(t), theme)
    await fp.waitForFunction(() => (window as unknown as { __budkin: { env: { anim: unknown } } }).__budkin.env.anim === null, undefined, { timeout: 5000 })
    await fp.mouse.move(820, 330, { steps: 6 })
    await fp.waitForTimeout(1200)
    await fp.screenshot({ path: join(OUT, `desk-2d-${theme === 'light' ? 'day' : 'night'}.png`) })
    console.log(`  ✓ desk-2d-${theme === 'light' ? 'day' : 'night'}.png`)
  }
  await flat.evaluate(({ app: a }) => a.exit(0))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
