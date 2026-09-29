/**
 * Ảnh chụp giới thiệu (README): tạo dữ liệu mẫu rồi chụp bàn làm việc lúc bật đèn (ngày) và tắt đèn (đêm).
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

async function main(): Promise<void> {
  rmSync(USER_DATA, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, BUDKIN_TEST: '1', BUDKIN_USER_DATA: USER_DATA } as Record<string, string>
  })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as unknown as { __budkin?: { stage: { ready: boolean } } }).__budkin?.stage.ready, undefined, { timeout: 20000 })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 860))
  await page.waitForTimeout(500)

  const today = localDateOf(Date.now())
  const work = await call(page, 'projects:create', { name: 'Công ty', color: 'sky' })
  await call(page, 'projects:create', { name: 'Nhà', color: 'mint' })
  const urgent = await call(page, 'tags:create', { name: 'Gấp', color: 'coral' })
  const idea = await call(page, 'tags:create', { name: 'Ý tưởng', color: 'lavender' })
  await call(page, 'tasks:create', { title: 'Gửi báo cáo tuần cho sếp', dueDate: addDays(today, -1), dueTime: '17:00', priority: 3, projectId: work.id, tagIds: [urgent.id], remindBeforeMin: 15 })
  await call(page, 'tasks:create', {
    title: 'Họp team dự án mới',
    dueDate: today,
    dueTime: '10:30',
    priority: 2,
    projectId: work.id,
    remindBeforeMin: 10,
    checklist: ['Chuẩn bị slide', 'Gửi lịch họp', 'Đặt phòng']
  })
  await call(page, 'tasks:create', { title: 'Vẽ phác thảo robot mới', dueDate: today, dueTime: '14:00', priority: 1, tagIds: [idea.id], remindBeforeMin: 0 })
  await call(page, 'tasks:create', { title: 'Mua sữa và pate cho mèo', dueDate: today, remindBeforeMin: 0 })
  await call(page, 'tasks:create', { title: 'Đọc tài liệu kiến trúc', dueDate: addDays(today, 2), projectId: work.id })

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => (window as unknown as { __budkin: { theme: { getState(): { request(t: string): void } } } }).__budkin.theme.getState().request(t), theme)
    await page.waitForFunction(() => (window as unknown as { __budkin: { env: { anim: unknown } } }).__budkin.env.anim === null, undefined, { timeout: 5000 })
    // Con trỏ trên danh sách: robot quay sang nhìn màn hình
    await page.mouse.move(820, 330, { steps: 6 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: join(OUT, `desk-${theme === 'light' ? 'day' : 'night'}.png`) })
    console.log(`  ✓ desk-${theme === 'light' ? 'day' : 'night'}.png`)
  }
  await app.evaluate(({ app: a }) => a.exit(0))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
