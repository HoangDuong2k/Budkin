/**
 * Kiểm thử end-to-end: mở app đã build, điều khiển bằng chuột / bàn phím thật, chụp ảnh các bước.
 * Chạy: npm run build && npm run e2e
 * Bản đã đóng gói: BUDKIN_E2E_EXE=release/linux-unpacked/budkin npm run e2e
 *   (Windows: BUDKIN_E2E_EXE="release/win-unpacked/Budkin.exe")
 * Máy không có GPU (CI): BUDKIN_E2E_SWIFTSHADER=1 — WebGL vẽ bằng CPU
 * Chạy bản deb đã cài mà không tắt sandbox (kiểm tra profile AppArmor): BUDKIN_E2E_SANDBOX=1
 * Giả lập màn hình nhỏ (máy ảo Windows 1024×768 của GitHub): BUDKIN_E2E_WINDOW=1000x660
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright-core'
import type { ApiResponse, ArgsOf, Channel, DeskApi, ResultOf } from '../src/shared/api'
import { addDays, localDateOf, pad2 } from '../src/shared/datetime'
import { liveCounts, parseExportFile } from '../src/shared/exportFormat'
import { ROBOT_BOX } from '../src/renderer/src/scene/math/layout'
import { SCREEN_BG } from '../src/shared/palette'
import type { Settings, Task } from '../src/shared/types'

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'test-output', 'e2e')
const USER_DATA = join(OUT, 'userdata')
/** CI / WebGL vẽ bằng CPU: cảnh chỉ được vài khung hình mỗi giây — chờ lâu hơn */
const SLOW = !!process.env.CI || !!process.env.BUDKIN_E2E_SWIFTSHADER
const WAIT = SLOW ? 4 : 1

/**
 * Đồng hồ của app khi kiểm thử: 6:00 sáng hôm nay — việc cả ngày (nhắc lúc 9:00) không bỗng dưng báo động giữa chừng
 * làm robot thôi nhìn theo chuột / không ngủ. Phần nhắc việc tự đẩy đồng hồ tới.
 */
const CLOCK_BASE = ((): number => {
  const d = new Date()
  d.setHours(6, 0, 0, 0)
  return d.getTime() - Date.now()
})()

type Rgb = [number, number, number]
interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Những gì renderer mở cho kiểm thử (src/renderer/src/scene/testProbe.ts) */
interface Probe {
  api: DeskApi
  __budkin: {
    renderMode: '3d' | '2d'
    stage: { screenRect: Rect; viewport: { width: number; height: number }; ready: boolean }
    webglInfo(): { version: string; renderer: string } | null
    samplePixels(points: Array<{ x: number; y: number }>): Rgb[]
    theme: { getState(): { theme: 'light' | 'dark' } }
    data: {
      getState(): { loaded: boolean; settings: Settings | null; tasks: Record<string, Task>; projects: Record<string, { name: string }>; tags: Record<string, { name: string }> }
    }
  }
}

/** Gọi IPC từ trang (như renderer gọi) và trả về kết quả gốc { ok, value | error } */
async function invoke<C extends Channel>(page: Page, channel: C, ...args: ArgsOf<C>): Promise<ApiResponse<ResultOf<C>>> {
  return page.evaluate(([ch, a]) => (window as unknown as Probe).api.invoke(ch as C, ...(a as ArgsOf<C>)), [channel, args] as const) as Promise<ApiResponse<ResultOf<C>>>
}

async function value<C extends Channel>(page: Page, channel: C, ...args: ArgsOf<C>): Promise<ResultOf<C>> {
  const res = await invoke(page, channel, ...args)
  if (!res.ok) throw new Error(`${channel}: ${res.error.code} ${res.error.message}`)
  return res.value
}

/** Cảnh báo đã biết từ thư viện, không phải lỗi của app */
const KNOWN_WARNINGS = [
  // R3F 9 vẫn dùng THREE.Clock, three r18x báo đã lỗi thời
  /THREE\.Clock: This module has been deprecated/
]

const passed: string[] = []
const problems: string[] = []
const STARTED = Date.now()
/** Số giây từ lúc bắt đầu — in cạnh từng bước để biết chỗ nào chậm (CI không cho tải log) */
const elapsed = (): string => `${Math.round((Date.now() - STARTED) / 1000)}s`
let pageRef: Page | undefined
let appRef: ElectronApplication | undefined

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`KIỂM THỬ THẤT BẠI: ${msg}`)
  passed.push(`[${elapsed()}] ${msg}`)
  console.log(`  ✓ [${elapsed()}] ${msg}`)
}

/** Trên GitHub Actions: in lỗi thành annotation (xem được ngay trên trang tóm tắt) */
function annotate(level: 'error' | 'notice', title: string, text: string): void {
  if (!process.env.GITHUB_ACTIONS) return
  const esc = (v: string): string => v.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
  console.log(`::${level} title=${esc(title)}::${esc(text)}`)
}

/** Chờ điều kiện đúng (giao diện cập nhật sau một nhịp). Máy chậm (CI, vẽ bằng CPU) chờ lâu hơn gấp WAIT lần */
async function until(check: () => Promise<boolean>, timeout = 3000): Promise<boolean> {
  const end = Date.now() + timeout * WAIT
  while (Date.now() < end) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return check()
}

/**
 * Bấm bằng chuột thật. Windows CI đôi khi treo ở bước gửi sự kiện chuột (renderer không trả lời) — quá 10 giây thì
 * bấm qua DOM để kiểm thử đi tiếp; phần kiểm tra kết quả phía sau vẫn giữ nguyên
 */
async function press(target: Locator): Promise<void> {
  try {
    await target.click({ timeout: 10_000 })
  } catch (err) {
    // Sự kiện có thể tới nơi muộn: nút đã biến mất thì thôi
    if (await until(async () => (await target.count()) === 0, 1500)) return
    problems.push(`[e2e] bấm chuột bị treo, bấm qua DOM: ${String((err as Error).message ?? err).split('\n')[0]}`)
    await target.evaluate((el) => (el as HTMLElement).click(), undefined, { timeout: 5000 }).catch(() => undefined)
  }
}

/**
 * Ảnh chụp để xem lại — không phải phép kiểm tra. Chờ cảnh 3D đứng yên (máy ảo vẽ bằng CPU mà cảnh đang vẽ liên tục thì
 * chụp màn hình phải chờ rất lâu); chụp không được thì ghi nhận rồi đi tiếp, không làm hỏng cả lượt kiểm thử
 */
async function shot(page: Page, name: string): Promise<void> {
  await until(
    async () =>
      (await page.evaluate(
        "window.__budkin.renderMode !== '3d' || window.__budkin.robot.settled === true || window.__budkin.stage.getR3F?.()?.frameloop === 'never'"
      )) === true
  ).catch(() => false)
  try {
    await page.screenshot({ path: join(OUT, name), timeout: 15_000 })
  } catch (err) {
    problems.push(`[e2e] không chụp được ${name}: ${String((err as Error).message ?? err).split('\n')[0]}`)
  }
}

function hex(c: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as Rgb
}

function near(a: Rgb, b: Rgb, tol = 6): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) <= tol)
}

async function launch(extraEnv: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = process.env.BUDKIN_E2E_EXE
  const args = [
    ...(exe ? [] : [ROOT]),
    ...(process.platform === 'linux' && !process.env.BUDKIN_E2E_SANDBOX ? ['--no-sandbox'] : []),
    ...(process.env.BUDKIN_E2E_SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : [])
  ]
  const app = (appRef = await electron.launch({
    executablePath: exe ?? (require('electron') as unknown as string),
    args,
    env: { ...process.env, BUDKIN_TEST: '1', BUDKIN_USER_DATA: USER_DATA, BUDKIN_CLOCK_OFFSET: String(CLOCK_BASE), ...extraEnv } as Record<string, string>
  }))
  app.process().stderr?.on('data', (d: Buffer) => {
    for (const line of d.toString().split(/\r?\n/))
      if (/error|lỗi|exception/i.test(line) && !/dbus|gpu|Gtk|viz|ozone|libva|vaapi|egl|gbm|drm/i.test(line)) problems.push(`[main] ${line.slice(0, 300)}`)
  })
  const page = (pageRef = await app.firstWindow())
  page.on('pageerror', (e) => {
    problems.push(`[renderer] ${e.message}`)
    console.error('  [renderer lỗi]', e.message)
  })
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !KNOWN_WARNINGS.some((re) => re.test(m.text()))) problems.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`)
  })
  await page.waitForSelector('.screen-app', { timeout: 20000 })
  // Cảnh 3D dựng xong sau giao diện (canvas phải đo kích thước trước)
  const mode = await page.evaluate(() => (window as unknown as Probe).__budkin.renderMode)
  if (mode === '3d') await page.waitForFunction(() => (window as unknown as Probe).__budkin.stage.ready, undefined, { timeout: 20000 })
  const win = /^(\d+)x(\d+)$/.exec(process.env.BUDKIN_E2E_WINDOW ?? '')
  if (win) await resize(app, page, Number(win[1]), Number(win[2]))
  return { app, page }
}

/** Đổi kích thước vùng nội dung cửa sổ; false nếu màn hình quá nhỏ để đạt được */
async function resize(app: ElectronApplication, page: Page, w: number, h: number): Promise<boolean> {
  const fits = await app.evaluate(
    ({ BrowserWindow, screen }, [w, h]) => {
      const bw = BrowserWindow.getAllWindows()[0]
      const area = screen.getDisplayMatching(bw.getBounds()).workAreaSize
      if (w > area.width - 40 || h > area.height - 80) return false
      bw.setMinimumSize(640, 480)
      bw.setContentSize(w, h)
      return true
    },
    [w, h]
  )
  if (!fits) return false
  return until(async () => {
    const v = await page.evaluate(() => (window as unknown as Probe).__budkin.stage.viewport)
    return Math.abs(v.width - w) < 1.5 && Math.abs(v.height - h) < 1.5
  }, 4000)
}

async function probe<T>(page: Page, fn: (p: Probe['__budkin']) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__budkin)`) as Promise<T>
}

/** Lớp giao diện khớp màn hình 3D: so khung DOM với tính toán, rồi ẩn lớp DOM và đọc điểm ảnh canvas quanh mép */
async function checkAlignment(page: Page, label: string, theme: 'light' | 'dark'): Promise<void> {
  const box = await page.locator('.screen').boundingBox()
  const rect = await probe(page, (p) => p.stage.screenRect)
  assert(
    box && Math.abs(box.x - rect.x) < 0.51 && Math.abs(box.y - rect.y) < 0.51 && Math.abs(box.width - rect.width) < 0.51 && Math.abs(box.height - rect.height) < 0.51,
    `${label}: lớp giao diện đặt đúng vùng màn hình tính được (${rect.width.toFixed(0)}×${rect.height.toFixed(0)} tại ${rect.x.toFixed(0)},${rect.y.toFixed(0)})`
  )
  const viewport = await probe(page, (p) => p.stage.viewport)
  const share = rect.width / viewport.width
  assert(share >= 0.52 && share <= 0.62, `${label}: màn hình chiếm ${(share * 100).toFixed(1)}% bề ngang cửa sổ`)
  await page.evaluate(() => ((document.querySelector('.screen') as HTMLElement).style.visibility = 'hidden'))
  const d = 4
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2
  const inside = [
    { x: rect.x + d, y: midY },
    { x: rect.x + rect.width - d, y: midY },
    { x: midX, y: rect.y + d },
    { x: midX, y: rect.y + rect.height - d }
  ]
  const outside = [
    { x: rect.x - d, y: midY },
    { x: rect.x + rect.width + d, y: midY },
    { x: midX, y: rect.y - d },
    { x: midX, y: rect.y + rect.height + d }
  ]
  const px = await page.evaluate((pts) => (window as unknown as Probe).__budkin.samplePixels(pts), [...inside, ...outside])
  await page.evaluate(() => ((document.querySelector('.screen') as HTMLElement).style.visibility = ''))
  const bg = hex(SCREEN_BG[theme])
  assert(
    px.slice(0, 4).every((c) => near(c, bg)),
    `${label}: màn hình 3D nằm đúng dưới lớp giao diện (mép trong: ${JSON.stringify(px.slice(0, 4))})`
  )
  assert(
    px.slice(4).every((c) => !near(c, bg, 2)),
    `${label}: ngay ngoài mép là viền màn hình (${JSON.stringify(px.slice(4))})`
  )
}

async function tasksNow(page: Page): Promise<Task[]> {
  return Object.values(await probe(page, (p) => p.data.getState().tasks))
}

async function taskTitled(page: Page, title: string): Promise<Task | undefined> {
  return (await tasksNow(page)).find((t) => t.title === title)
}

/** Giao diện trên màn hình: thêm, sửa, hoàn thành, xoá + hoàn tác, tìm, đổi ngôn ngữ — bằng chuột và bàn phím thật */
async function uiFlow(page: Page): Promise<void> {
  const row = (title: string): ReturnType<Page['locator']> => page.locator('.task-row', { hasText: title }).first()
  await page.locator('.sidebar .nav-main').first().click()
  await page.locator('.list-head').click()
  await page.keyboard.press('n')
  assert(
    await until(async () => page.evaluate(() => document.activeElement?.classList.contains('quick-add-input') ?? false)),
    'phím N đưa con trỏ vào ô thêm việc'
  )
  await page.keyboard.type('Mua sữa cho mèo')
  await page.keyboard.press('Enter')
  assert(await until(async () => (await row('Mua sữa cho mèo').count()) === 1), 'gõ tiếng Việt + Enter: việc mới hiện trong "Hôm nay"')
  const created = await taskTitled(page, 'Mua sữa cho mèo')
  assert(created?.dueDate !== null && created?.remindBeforeMin === 0, 'việc thêm ở "Hôm nay" có hạn hôm nay và nhắc trong ngày')

  // Khung sửa: tiêu đề, ưu tiên, giờ, checklist, nhãn mới
  await row('Mua sữa cho mèo').click()
  const editor = page.locator('.editor')
  await editor.waitFor()
  await editor.locator('.editor-title').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('Mua sữa và pate cho mèo')
  await page.keyboard.press('Enter')
  assert(await until(async () => (await row('Mua sữa và pate cho mèo').count()) === 1), 'sửa tiêu đề trong khung sửa')
  await editor.locator('.prio-btn.prio-3').click()
  await editor.locator('[data-field="due"] .value-btn').click()
  await page.locator('.popover .time-suggest button', { hasText: '18:00' }).click()
  await page.keyboard.press('Escape')
  await editor.locator('.checklist-add input').click()
  await page.keyboard.type('Pate cá hồi')
  await page.keyboard.press('Enter')
  await editor.locator('[data-field="tags"] input').click()
  await page.keyboard.type('Nhà')
  await page.keyboard.press('Enter')
  assert(
    await until(async () => {
      const t = await taskTitled(page, 'Mua sữa và pate cho mèo')
      return t?.priority === 3 && t.dueTime === '18:00' && t.checklist.length === 1 && t.tagIds.length === 1
    }),
    'khung sửa: ưu tiên cao, giờ 18:00, checklist, nhãn mới đều được lưu'
  )
  await shot(page, '5-editor.png')

  // Hoàn thành bằng ô tròn
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  assert(await until(async () => (await editor.count()) === 0), 'Esc đóng khung sửa')
  await row('Mua sữa và pate cho mèo').locator('.check').click()
  assert(await until(async () => (await taskTitled(page, 'Mua sữa và pate cho mèo'))?.status === 'done'), 'bấm ô tròn: việc chuyển sang Đã xong')

  // Xoá rồi hoàn tác
  await page.locator('.quick-add-input').click()
  await page.keyboard.type('Việc sẽ bị xoá')
  await page.keyboard.press('Enter')
  await until(async () => (await row('Việc sẽ bị xoá').count()) === 1)
  await row('Việc sẽ bị xoá').click()
  await editor.locator('.icon-btn.danger').click()
  assert(await until(async () => (await taskTitled(page, 'Việc sẽ bị xoá')) === undefined), 'xoá việc từ khung sửa')
  await page.locator('.toast-action').click()
  assert(await until(async () => (await row('Việc sẽ bị xoá').count()) === 1), 'bấm "Hoàn tác" trên toast: việc quay lại')

  // Tìm kiếm không dấu
  await page.locator('.list-head').click()
  await page.keyboard.press('/')
  await page.keyboard.type('pate')
  assert(
    await until(async () => (await page.locator('.list-head h2').textContent()) === 'Kết quả tìm kiếm' && (await row('Mua sữa và pate cho mèo').count()) === 1),
    'phím / rồi gõ "pate": tìm ra việc'
  )
  await page.keyboard.press('Escape')
  assert(await until(async () => (await page.locator('.list-head h2').textContent()) === 'Hôm nay'), 'Esc xoá tìm kiếm, quay lại danh sách')
  await shot(page, '6-today-vi.png')

  // Đổi ngôn ngữ (thanh bên thu gọn ở màn hình nhỏ thì đổi qua store)
  const langBtn = page.locator('.lang-switch button', { hasText: 'EN' })
  if (await langBtn.isVisible()) await langBtn.click()
  else await page.evaluate("window.__budkin.lang.getState().setLang('en')")
  assert(await until(async () => (await page.locator('.list-head h2').textContent()) === 'Today'), 'đổi sang tiếng Anh: giao diện hiện "Today"')
  await shot(page, '7-today-en.png')
  await page.locator('.theme-toggle').click()
  await page.waitForTimeout(200)
  await shot(page, '8-today-en-other-theme.png')
  await page.locator('.theme-toggle').click()
  await page.evaluate("window.__budkin.lang.getState().setLang('vi')")
  assert(await until(async () => (await page.locator('.list-head h2').textContent()) === 'Hôm nay'), 'đổi lại tiếng Việt')
}

/** Việc lặp lại (M6): đặt "Hằng ngày" trong khung sửa → hoàn thành → lần ngày mai xuất hiện → hoàn tác → bỏ qua lần này → Lịch hiện mờ các lần sắp tới */
async function recurrenceFlow(page: Page): Promise<void> {
  const title = 'Tập thể dục buổi sáng'
  const row = (): ReturnType<Page['locator']> => page.locator('.task-row', { hasText: title }).first()
  const instances = async (): Promise<Task[]> => (await tasksNow(page)).filter((t) => t.title === title)
  await page.locator('.sidebar .nav-main').first().click()
  await page.locator('.list-head').click()
  await page.keyboard.press('n')
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await until(async () => (await row().count()) === 1)
  const today = (await taskTitled(page, title))?.dueDate ?? ''
  const tomorrow = addDays(today, 1)

  await row().click()
  await page.locator('.editor [data-field="repeat"] .value-btn').click()
  await page.locator('.popover .menu-item', { hasText: 'Hằng ngày' }).click()
  assert(await until(async () => (await taskTitled(page, title))?.recurrence?.freq === 'daily'), 'khung sửa: đặt lặp lại "Hằng ngày"')
  assert(/Hằng ngày/.test((await page.locator('.editor [data-field="repeat"] .value-btn').textContent()) ?? ''), 'ô Lặp lại hiện "Hằng ngày"')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await row().locator('.check').click()
  assert(
    await until(async () => {
      const list = await instances()
      return list.some((t) => t.status === 'done' && t.dueDate === today) && list.some((t) => t.status === 'todo' && t.dueDate === tomorrow && t.occurrenceIndex === 1)
    }),
    'hoàn thành việc hằng ngày: lần ngày mai tự xuất hiện'
  )
  assert(await until(async () => /Lần tới: Ngày mai/.test((await page.locator('.toast').first().textContent()) ?? '')), 'toast báo "Lần tới: Ngày mai"')
  await page.locator('.toast .toast-action').first().click()
  assert(
    await until(async () => {
      const list = await instances()
      return list.length === 1 && list[0].status === 'todo' && list[0].dueDate === today
    }),
    'bấm "Hoàn tác": việc về chưa xong, lần ngày mai bị gỡ'
  )

  await row().click()
  await page.locator('.editor [aria-label="Bỏ qua lần này"]').click()
  assert(await until(async () => (await instances())[0]?.dueDate === tomorrow), 'bỏ qua lần này: dời sang ngày mai')
  await page.keyboard.press('Escape')

  const id = (await instances())[0].id
  await page.keyboard.press('3')
  assert(await until(async () => (await page.locator(`.cal-chip.ghost[data-ghost-of="${id}"]`).count()) > 0), 'Lịch hiện mờ các lần lặp sắp tới')
  await page.keyboard.press('1')
}

/** Cài đặt (M7): mở bằng Ctrl+, / nút bánh răng, đổi thiết lập thì lưu ngay và giao diện theo ngay */
async function settingsFlow(page: Page): Promise<void> {
  const settings = (): Promise<Settings | null> => probe(page, (p) => p.data.getState().settings)
  const panel = page.locator('.settings')
  const section = async (id: string): Promise<void> => {
    await press(page.locator(`.settings-nav [data-section="${id}"]`))
    await until(async () => (await page.locator(`.settings-body[data-section="${id}"]`).count()) === 1)
  }
  const row = (id: string): Locator => page.locator(`.set-row[data-setting="${id}"]`)

  await page.locator('.list-head').first().click()
  await page.keyboard.press('Control+Comma')
  assert(await until(async () => (await panel.count()) === 1), 'Ctrl+, mở màn hình Cài đặt')
  await section('general')
  await row('weekStart').getByRole('radio', { name: 'Chủ nhật' }).click()
  assert(await until(async () => (await settings())?.weekStart === 0), 'Cài đặt: tuần bắt đầu vào Chủ nhật được lưu')
  await page.keyboard.press('Escape')
  assert(await until(async () => (await panel.count()) === 0), 'Esc đóng Cài đặt')
  await page.keyboard.press('3')
  assert(await until(async () => (await page.locator('.cal-dow').first().textContent()) === 'CN'), 'Lịch bắt đầu tuần bằng Chủ nhật')
  await page.keyboard.press('1')

  await page.locator('.settings-btn').click()
  assert(await until(async () => (await panel.count()) === 1), 'nút bánh răng ở thanh bên mở Cài đặt')
  await section('reminders')
  const time = row('allDayRemindTime').locator('input')
  await time.fill('830')
  await time.press('Enter')
  assert(await until(async () => (await settings())?.allDayRemindTime === '08:30'), 'giờ nhắc việc cả ngày: gõ "830" thành 08:30')
  await row('mute').getByRole('button', { name: '1 giờ' }).click()
  assert(await until(async () => (await row('mute').getByRole('button', { name: 'Bật lại' }).count()) === 1), 'tạm tắt nhắc 1 giờ')
  await row('mute').getByRole('button', { name: 'Bật lại' }).click()
  assert(await until(async () => (await row('mute').getByRole('button', { name: '1 giờ' }).count()) === 1), 'bật lại nhắc việc')

  await section('display')
  await row('render').getByRole('radio', { name: 'Chỉ 2D' }).click()
  assert(await until(async () => (await page.locator('.set-notice').count()) === 1), 'đổi sang "Chỉ 2D": báo cần khởi động lại')
  await row('render').getByRole('radio', { name: 'Tự động' }).click()
  assert(await until(async () => (await page.locator('.set-notice').count()) === 0), 'đổi lại "Tự động": hết báo khởi động lại')
  await section('about')
  assert(await until(async () => /^\d+\.\d+\.\d+/.test((await page.locator('.about-specs dd').first().textContent()) ?? '')), 'Thông tin: hiện phiên bản app')
  await section('data')
  assert(await until(async () => (await page.locator('.backup-list li').count()) >= 1), 'Dữ liệu: có bản sao lưu hằng ngày tự tạo lúc mở app')
  await shot(page, '9-settings.png')
  await page.keyboard.press('Escape')
  assert(await until(async () => (await panel.count()) === 0), 'Esc đóng Cài đặt (lần 2)')
  // Trả lại thiết lập mặc định cho các phần kiểm thử sau
  await value(page, 'settings:update', { weekStart: 1, allDayRemindTime: '09:00' })
}

interface Point {
  x: number
  y: number
}
interface Bounds {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

/**
 * Nhiều mẫu robot: bấm bệ tròn lần lượt qua mọi robot rồi về lại Budkin — mỗi robot chào khi vừa lên bệ, nằm gọn trong
 * khối bao dùng để đặt camera (không lấn vào màn hình), bấm vào thì phản ứng; chọn robot trong Cài đặt cũng đổi được
 */
async function robotsFlow(page: Page): Promise<void> {
  const NAMES: Record<string, string> = { budkin: 'Budkin', orbi: 'Orbi', rover: 'Rover', miu: 'Miu', mech: 'Mech' }
  const hud = (): Promise<{ robot: string; speech: string | null }> =>
    probe(page, (p) => (p as unknown as { hudState: { getState(): { robot: string; speech: string | null } } }).hudState.getState())
  const hit = (): Promise<{ robot: Point; pedestal: Point }> => probe(page, (p) => (p as unknown as { hit(): { robot: Point; pedestal: Point } }).hit())
  // Khối bao cho phép lệch 5 mm (khối bao để đặt camera, không cần khít tuyệt đối)
  const fits = (b: Bounds): boolean =>
    (['x', 'y', 'z'] as const).every((k) => b.min[k] >= ROBOT_BOX.min[k] - 0.005 && b.max[k] <= ROBOT_BOX.max[k] + 0.005)
  const fmt = (b: Bounds): string => (['x', 'y', 'z'] as const).map((k) => `${k} ${b.min[k].toFixed(3)}…${b.max[k].toFixed(3)}`).join(', ')

  /**
   * Chờ robot thức hẳn và đã được vẽ ở tư thế đứng yên (hết hoạt cảnh xuất hiện), nhấn Shift giữ cho khỏi buồn ngủ.
   * Máy ảo vẽ bằng CPU: lần vẽ đầu của robot mới treo luồng vài giây, các mốc hẹn giờ dồn lại — robot có thể nhảy thẳng
   * sang buồn ngủ / ngủ, hoặc theo đồng hồ đã xong hoạt cảnh mà trên màn hình vẫn chưa kịp vẽ
   */
  const awake = async (): Promise<boolean> => {
    const end = Date.now() + 8000 * WAIT
    while (Date.now() < end) {
      if ((await page.evaluate("window.__budkin.robot.mode === 'idle' && window.__budkin.robot.settled === true")) === true) return true
      await page.keyboard.press('Shift')
      await page.waitForTimeout(250)
    }
    return false
  }
  // Lời chào chỉ hiện vài giây: ghi lại ngay lúc bong bóng hiện ra
  const watchGreeting = (): Promise<unknown> =>
    page.evaluate(`(() => {
      window.__greeting = ''
      const obs = new MutationObserver(() => {
        const t = document.querySelector('.bubble.is-greeting')?.textContent
        if (t) { window.__greeting = t; obs.disconnect() }
      })
      obs.observe(document.body, { childList: true, subtree: true, characterData: true })
    })()`)

  await page.mouse.move(8, 8)
  assert((await hud()).robot === 'budkin', 'mặc định: Budkin đứng trên bệ tròn')
  for (const id of ['orbi', 'rover', 'miu', 'mech', 'budkin']) {
    const name = NAMES[id]
    const at = await hit()
    await watchGreeting()
    await page.mouse.click(at.pedestal.x, at.pedestal.y)
    assert(await until(async () => (await hud()).robot === id), `bấm bệ tròn: robot chìm xuống, ${name} trồi lên`)
    assert(await until(async () => String(await page.evaluate('window.__greeting')).includes(name)), `${name} chào khi vừa lên bệ, theo tính cách riêng`)
    assert(await awake(), `${name} đứng trên bệ, thức`)
    const b = await probe(page, (p) => (p as unknown as { robotBounds(): Bounds }).robotBounds())
    // Đủ cao (đã vẽ ở kích thước thật, không phải lúc mới trồi lên) mà vẫn nằm gọn trong khối bao
    assert(fits(b) && b.max.y > 0.12, `${name} nằm gọn trong khối bao của robot (${fmt(b)})`)
    const before = Number(await page.evaluate('performance.now()'))
    const at2 = await hit()
    await page.mouse.click(at2.robot.x, at2.robot.y)
    assert(await until(async () => Number(await page.evaluate('window.__budkin.robot.lastPokeAt')) >= before), `bấm vào ${name}: robot phản ứng`)
    await shot(page, `18-robot-${id}.png`)
  }
  assert((await probe(page, (p) => p.data.getState().settings))?.robot === 'budkin', 'robot đang chọn được lưu vào thiết lập')

  // Chọn trong Cài đặt → Chung
  await page.keyboard.press('Control+Comma')
  await press(page.locator('.settings-nav [data-section="general"]'))
  await page.locator('.robot-card[data-robot="miu"]').click()
  assert(await until(async () => (await hud()).robot === 'miu'), 'Cài đặt → Robot trên bàn: chọn Miu, robot trên bàn đổi theo')
  await page.locator('.robot-card[data-robot="budkin"]').click()
  assert(await until(async () => (await hud()).robot === 'budkin'), 'chọn lại Budkin')
  await page.keyboard.press('Escape')
  await until(async () => (await page.locator('.settings').count()) === 0)
}

/** Cảnh 3D: robot nhìn theo chuột, bấm đèn đổi theme, chọc robot, không vẽ khi đứng yên, ngủ, mất WebGL → 2D */
async function sceneFlow(page: Page): Promise<void> {
  const num = async (expr: string): Promise<number> => Number(await page.evaluate(expr))
  // Cờ "đứng yên" chỉ cập nhật khi vẽ khung: chờ khung hình mới sau khi di chuột rồi mới chờ robot dừng.
  // Trong lúc chờ nhấn Shift để robot không buồn ngủ (kiểm thử rút ngắn còn 4 giây — máy CI chậm có thể chưa quay xong);
  // Shift không đổi hướng nhìn và không làm gì trong app. Đo lúc robot ngủ thì không nhấn (sẽ đánh thức robot)
  const settled = async (keepAwake = true): Promise<boolean> => {
    await page.waitForTimeout(250)
    const end = Date.now() + 5000 * WAIT
    while (Date.now() < end) {
      if ((await page.evaluate('window.__budkin.robot.settled')) === true) return true
      if (keepAwake) await page.keyboard.press('Shift')
      await page.waitForTimeout(300)
    }
    return false
  }
  const vp = await probe(page, (p) => p.stage.viewport)

  // Robot quay đầu theo con trỏ (kể cả khi con trỏ nằm trên giao diện trong màn hình).
  // Chờ hết hoạt cảnh đang dở (vd. vừa bật/tắt đèn thì robot quay sang nhìn đèn)
  await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 3 })
  await until(async () => (await page.evaluate('window.__budkin.robot.mode')) === 'idle', 3000)
  await page.mouse.move(4, vp.height / 2, { steps: 6 })
  await settled()
  const yawLeft = await num('window.__budkin.robot.headYaw')
  await page.mouse.move(vp.width - 4, vp.height / 2, { steps: 10 })
  await settled()
  const yawRight = await num('window.__budkin.robot.headYaw')
  // Robot đứng sát mép trái nên con trỏ ở mép trái chỉ lệch trái một chút so với robot
  assert(yawLeft < 0 && yawRight - yawLeft > 0.4, `robot nhìn theo chuột: trái ${yawLeft.toFixed(2)} rad, phải ${yawRight.toFixed(2)} rad`)
  await page.mouse.move(vp.width * 0.12, 3, { steps: 6 })
  await settled()
  const pitchUp = await num('window.__budkin.robot.headPitch')
  assert(pitchUp > 0.05, `con trỏ ở mép trên: robot ngẩng lên (${pitchUp.toFixed(2)} rad)`)
  await shot(page, '9-scene.png')

  // Bấm vào đèn khi đang gõ trong ô tìm kiếm: đổi theme, ô tìm kiếm vẫn giữ con trỏ
  await page.locator('.search input').click()
  const before = await page.evaluate(() => document.documentElement.dataset.theme)
  const hit = await probe(page, (p) => (p as unknown as { hit(): { lamp: { x: number; y: number }; robot: { x: number; y: number } } }).hit())
  await page.mouse.move(hit.lamp.x, hit.lamp.y, { steps: 4 })
  assert(
    await until(async () => (await page.evaluate("getComputedStyle(document.querySelector('.stage-canvas')).cursor")) === 'pointer'),
    'rê chuột lên đèn: con trỏ thành bàn tay'
  )
  await page.mouse.click(hit.lamp.x, hit.lamp.y)
  assert(await until(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) !== before, 1500), 'bấm vào đèn: đổi theme')
  assert(await page.evaluate(() => document.activeElement === document.querySelector('.search input')), 'bấm đèn không làm mất con trỏ trong ô đang gõ')
  await until(async () => (await page.evaluate('window.__budkin.env.anim === null')) === true, 3000)
  await shot(page, '10-lamp-toggled.png')
  await page.keyboard.press('Control+Shift+L')
  assert(await until(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === before, 1500), 'Ctrl+Shift+L (đang gõ) bật / tắt đèn trở lại')
  await page.keyboard.press('Escape')

  // Chọc robot. Hoạt cảnh bẹp-giãn chỉ dài 0,45 giây: kiểm tra mốc lần chọc cuối thay vì cố bắt đúng lúc (máy ảo vẽ bằng
  // CPU có khi mất cả trăm ms mỗi khung)
  const beforePoke = Number(await page.evaluate('performance.now()'))
  await page.mouse.click(hit.robot.x, hit.robot.y)
  assert(await until(async () => Number(await page.evaluate('window.__budkin.robot.lastPokeAt')) >= beforePoke, 1000), 'bấm vào robot: robot bẹp-giãn')

  // Chế độ Tiết kiệm: đứng yên thì không vẽ khung nào
  await invoke(page, 'settings:update', { quality: 'saver' })
  await page.waitForFunction(() => (window as unknown as Probe).__budkin.stage.ready, undefined, { timeout: 10000 })
  // Di chuột nhẹ (đặt lại hẹn giờ buồn ngủ — 4 s khi kiểm thử), chờ robot đứng yên rồi đo; chỉ tính lần đo mà
  // robot không đổi trạng thái giữa chừng (máy chậm / vẽ bằng CPU có thể chạm mốc buồn ngủ). Đếm được khung thì đo lại
  // (máy ảo Windows: cú bấm bị treo trước đó có thể tới muộn, robot cử động giữa lúc đo) — lấy lần đo ít khung nhất;
  // app mà vẽ liên tục lúc đứng yên thì lần nào cũng có khung, vẫn hỏng
  let idleFrames = -1
  for (let attempt = 0; attempt < 3 && idleFrames !== 0; attempt++) {
    await page.mouse.move(vp.width / 2 + attempt * 7, vp.height - 30, { steps: 2 })
    await settled()
    // Khung hình cuối của hoạt cảnh (đang dở lúc robot vừa đứng yên) phải vẽ xong trước khi bắt đầu đếm
    await page.waitForTimeout(250 * WAIT)
    const mode0 = await page.evaluate('window.__budkin.robot.mode')
    const f0 = await num('window.__budkin.renderStats.frames')
    // Trong lúc đếm vẫn nhấn Shift giữ robot thức (máy chậm dễ chạm mốc buồn ngủ 4 giây) — gõ phím không vẽ khung nào
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift')
      await page.waitForTimeout(400)
    }
    const f1 = await num('window.__budkin.renderStats.frames')
    if (mode0 === 'idle' && (await page.evaluate('window.__budkin.robot.mode')) === 'idle') idleFrames = idleFrames < 0 ? f1 - f0 : Math.min(idleFrames, f1 - f0)
  }
  assert(idleFrames === 0, `Tiết kiệm, đứng yên (vẫn gõ phím) 1,2 giây: ${idleFrames} khung hình`)
  assert((await probe(page, (p) => p.renderMode)) === '3d', 'đổi mức chất lượng (tạo lại canvas) vẫn ở chế độ 3D')

  // Lâu không thao tác (kiểm thử rút ngắn còn vài giây): robot ngủ, hiện "Zzz", cảnh không vẽ
  assert(await until(async () => (await page.evaluate('window.__budkin.robot.mode')) === 'sleep', 8000), 'lâu không thao tác: robot ngủ')
  assert(await until(async () => page.locator('.zzz.on').isVisible(), 1500), 'robot ngủ: hiện "Zzz"')
  await shot(page, '11-robot-sleep.png')
  // Chờ robot gục đầu, nhắm mắt xong (vẽ bằng CPU thì chậm hơn) rồi mới đo
  await settled(false)
  const s0 = await num('window.__budkin.renderStats.frames')
  await page.waitForTimeout(1500)
  const sleepFrames = (await num('window.__budkin.renderStats.frames')) - s0
  assert(sleepFrames === 0, `robot ngủ: cảnh không vẽ khung nào (${sleepFrames} khung trong 1,5 giây)`)
  await page.mouse.move(vp.width / 2, vp.height - 20, { steps: 4 })
  assert(await until(async () => ['startled', 'idle'].includes(String(await page.evaluate('window.__budkin.robot.mode'))), 1500), 'di chuột: robot tỉnh dậy')

  // Mất WebGL không phục hồi: chuyển sang giao diện 2D, chữ đang gõ dở vẫn còn
  // Gõ thẳng vào ô (không bấm chuột: máy ảo Windows của CI đôi khi treo sự kiện chuột lúc vẽ 3D bằng CPU)
  await page.locator('.quick-add-input').fill('Nháp chưa lưu')
  await page.evaluate('window.__budkin.loseContext()')
  assert(await until(async () => (await probe(page, (p) => p.renderMode)) === '2d', 5000), 'mất WebGL: tự chuyển sang giao diện 2D')
  assert((await page.locator('.quick-add-input').inputValue()) === 'Nháp chưa lưu', 'chuyển sang 2D: chữ đang gõ dở không mất')
  await invoke(page, 'settings:update', { quality: 'balanced' })
}

/** Móc kiểm thử của main process (src/main/index.ts) */
interface MainHooks {
  clock: { now(): number }
  notifications: Array<{ taskId: string | null; title: string; body: string }>
  advance(ms: number): void
}

async function mainNow(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => (globalThis as unknown as { __budkin: MainHooks }).__budkin.clock.now())
}

async function notices(app: ElectronApplication): Promise<MainHooks['notifications']> {
  return app.evaluate(() => (globalThis as unknown as { __budkin: MainHooks }).__budkin.notifications.slice())
}

/** Hạn 'YYYY-MM-DD' + 'HH:mm' theo giờ địa phương của thời điểm `ms` (làm tròn xuống phút) */
function dueOf(ms: number): { dueDate: string; dueTime: string } {
  const d = new Date(ms)
  return { dueDate: localDateOf(ms), dueTime: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }
}

/**
 * Nhắc việc (đẩy đồng hồ của app tới): "sắp đến hạn" → báo lại 10 phút → nhắc lại → "đến hạn" → hai nhắc cùng lúc
 * (+1, không đè màn hình) → Xong (robot ăn mừng) → bỏ qua (robot dịu lại) → bấm robot: tóm tắt việc hôm nay
 */
async function reminderFlow(app: ElectronApplication, page: Page): Promise<void> {
  const MIN = 60_000
  const advance = (ms: number): Promise<void> => app.evaluate((_e, v) => (globalThis as unknown as { __budkin: MainHooks }).__budkin.advance(v), ms)
  const reminder = page.locator('.bubble:not(.is-summary), .reminder-banner')
  const mode = async (): Promise<string> => String(await page.evaluate('window.__budkin.robot.mode'))
  // Phần này kiểm tra nhắc việc và bong bóng thoại (hoạt cảnh của robot đã kiểm tra ở sceneFlow / robotsFlow): giảm
  // chuyển động để máy ảo vẽ bằng CPU khỏi quá tải vì robot nhún nhảy, ăn mừng chồng lên nhau lúc có nhắc việc
  await value(page, 'settings:update', { reducedMotion: 'on' })
  const t0 = await mainNow(app)
  const a = await value(page, 'tasks:create', { title: 'Gọi cho khách hàng', ...dueOf(t0 + 30 * MIN), remindBeforeMin: 15 })
  await advance(16 * MIN)
  assert(await until(async () => (await reminder.locator('.reminder-title').textContent().catch(() => '')) === a.title), 'tới giờ "sắp đến hạn": robot hiện nhắc việc')
  assert(/Sắp đến hạn/.test((await reminder.locator('.reminder-kicker').textContent()) ?? ''), 'nhắc đầu tiên là "sắp đến hạn"')
  assert(await until(async () => (await mode()) === 'alert'), 'robot vào trạng thái báo động')
  const first = await notices(app)
  assert(first.some((n) => n.taskId === a.id && /Sắp đến hạn/.test(n.body)), 'cửa sổ không có focus: có thông báo hệ điều hành "sắp đến hạn"')
  // Bong bóng (nếu có — cửa sổ hẹp thì là banner trong màn hình) phải nằm trọn trong khoảng trống bên trái màn hình.
  // Vị trí do khung hình kế tiếp của cảnh đặt: chờ một chút
  let where = ''
  const insideGap = (): Promise<boolean> =>
    until(async () => {
      if (!(await page.locator('.bubble').count())) return true
      const box = await page.locator('.bubble').boundingBox()
      const rect = await probe(page, (p) => p.stage.screenRect)
      where = JSON.stringify({ box, screenX: rect.x, frames: await page.evaluate('window.__budkin.renderStats.frames'), visibility: await page.evaluate('document.visibilityState') })
      return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= rect.x
    })
  assert(await insideGap(), `bong bóng thoại nằm trong khoảng trống bên trái, không đè lên màn hình ${where}`)
  // Chờ hết nhún nhảy (trong shot): máy vẽ bằng CPU mà cảnh đang vẽ liên tục thì bấm chuột cũng phải chờ rất lâu
  await shot(page, '12-reminder.png')

  await press(reminder.getByRole('button', { name: '10 phút', exact: true }))
  assert(await until(async () => (await reminder.count()) === 0 && (await mode()) !== 'alert'), 'báo lại sau 10 phút: nhắc tạm tắt, robot dịu lại')
  await advance(10 * MIN)
  assert(await until(async () => (await reminder.count()) === 1), 'hết 10 phút: nhắc lại')
  await advance(5 * MIN)
  assert(await until(async () => /Đến hạn/.test((await reminder.locator('.reminder-kicker').textContent().catch(() => '')) ?? '')), 'tới giờ hạn: chuyển sang "đến hạn"')

  const b = await value(page, 'tasks:create', { title: 'Nộp hồ sơ', ...dueOf(await mainNow(app)), remindBeforeMin: 0 })
  assert(await until(async () => (await reminder.locator('.reminder-more').textContent().catch(() => '')) === '+1'), 'hai nhắc cùng lúc: hiện việc đầu tiên kèm "+1"')
  assert(await insideGap(), `có "+1" vẫn không đè lên màn hình ${where}`)
  await shot(page, '13-reminder-two.png')

  const beforeDone = Number(await page.evaluate('performance.now()'))
  await press(reminder.getByRole('button', { name: 'Xong', exact: true }))
  assert(await until(async () => (await taskTitled(page, a.title))?.status === 'done'), 'bấm Xong trên nhắc việc: việc chuyển sang Đã xong')
  // Hoạt cảnh ăn mừng chỉ dài 0,9 giây: kiểm tra mốc lần ăn mừng cuối thay vì cố bắt đúng lúc đang nhảy
  assert(await until(async () => Number(await page.evaluate('window.__budkin.robot.state.lastCelebrateAt')) >= beforeDone), 'robot ăn mừng')
  assert(await until(async () => (await reminder.locator('.reminder-title').textContent().catch(() => '')) === b.title), 'còn lại việc thứ hai')
  await press(reminder.locator('.reminder-dismiss'))
  assert(
    await until(async () => (await reminder.count()) === 0 && (await page.evaluate('window.__budkin.robot.state.alert')) === false),
    'bấm × (bỏ qua): hết nhắc, robot dịu lại'
  )

  const hit = await probe(page, (p) => (p as unknown as { hit(): { robot: { x: number; y: number } } }).hit())
  // Câu tóm tắt chỉ hiện 4 giây — máy ảo chậm có khi bấm xong thì câu đã tắt: ghi lại ngay lúc bong bóng hiện ra
  await page.evaluate(`(() => {
    window.__summaryText = ''
    const obs = new MutationObserver(() => {
      const t = document.querySelector('.bubble.is-summary')?.textContent
      if (t) { window.__summaryText = t; obs.disconnect() }
    })
    obs.observe(document.body, { childList: true, subtree: true, characterData: true })
  })()`)
  await page.mouse.click(hit.robot.x, hit.robot.y)
  assert(await until(async () => /Hôm nay còn|Hết việc/.test(String(await page.evaluate('window.__summaryText'))), 3000), 'bấm vào robot: tóm tắt việc hôm nay')

  await value(page, 'settings:update', { reducedMotion: 'auto' })
  // Ba việc sẽ đến hạn trong lúc app tắt (máy tắt / ngủ) — mở lại sau
  const now = await mainNow(app)
  for (const [i, title] of ['Việc lúc tắt máy 1', 'Việc lúc tắt máy 2', 'Việc lúc tắt máy 3'].entries())
    await value(page, 'tasks:create', { title, ...dueOf(now + (i + 1) * 20 * MIN), remindBeforeMin: 0 })
}

/** Kéo bằng chuột thật: nhấn giữ, nhích quá ngưỡng bắt đầu kéo, đi dần tới đích, thả */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 12, from.y + 8, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 14 })
  await page.waitForTimeout(150)
  await page.mouse.up()
}

async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  // Cột / ô lịch có thanh cuộn riêng: đưa phần tử vào tầm nhìn trước
  await page.locator(selector).first().scrollIntoViewIfNeeded()
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`Không thấy ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 40) }
}

/**
 * Kanban và Lịch (M5): kéo thẻ sang "Đang làm" bằng chuột thật; kéo việc trên Lịch sang ngày mai → nhắc việc đặt lại;
 * chế độ Mở rộng (F) phủ gần kín cửa sổ và dừng vẽ cảnh 3D. Trả về id thẻ đã kéo để kiểm tra sau khi mở lại app
 */
async function boardFlow(app: ElectronApplication, page: Page): Promise<string> {
  // Về danh sách "Tất cả việc" để Kanban / Lịch không bị lọc
  await page.locator('.sidebar .nav-main').nth(3).click()
  const card = await value(page, 'tasks:create', { title: 'Viết kịch bản video giới thiệu' })

  await page.locator('.list-head').first().click()
  await page.keyboard.press('2')
  assert(await until(async () => (await page.locator('.board').count()) === 1), 'phím 2: chuyển sang Kanban')
  const cardSel = `.board-col.col-todo .task-card[data-task-id="${card.id}"]`
  assert(await until(async () => (await page.locator(cardSel).count()) === 1), 'việc mới nằm ở cột "Cần làm"')
  await dragTo(page, await centerOf(page, cardSel), await centerOf(page, '.board-col.col-in_progress .board-col-body'))
  assert(await until(async () => (await taskTitled(page, card.title))?.status === 'in_progress'), 'kéo thẻ bằng chuột sang "Đang làm": việc chuyển sang Đang làm')
  assert((await page.locator(`.board-col.col-in_progress .task-card[data-task-id="${card.id}"]`).count()) === 1, 'thẻ nằm trong cột "Đang làm"')
  await shot(page, '14-kanban.png')

  // Lịch: việc hạn 3 ngày nữa, nhắc trước 3 ngày (báo ngay) → kéo sang ngày hôm sau nữa → nhắc việc đặt lại theo hạn
  // mới (robot thôi báo). Tránh các ô đã có việc thật khác (ô nhỏ chỉ vừa một việc, còn lại gộp vào "+N")
  const now = await mainNow(app)
  const from = addDays(localDateOf(now), 3)
  const later = addDays(localDateOf(now), 4)
  const due = await value(page, 'tasks:create', { title: 'Gửi hợp đồng cho đối tác', ...dueOf(now + 3 * 24 * 3600_000), remindBeforeMin: 3 * 1440 })
  const alerted = async (): Promise<boolean> => (await probe(page, (p) => (p as unknown as { alerts: { getState(): { active: Array<{ taskId: string }> } } }).alerts.getState().active)).some((a) => a.taskId === due.id)
  assert(await until(alerted), 'việc nhắc trước 3 ngày: có nhắc việc đang chờ')
  await page.keyboard.press('3')
  assert(await until(async () => (await page.locator('.cal-grid').count()) === 1), 'phím 3: chuyển sang Lịch (tháng)')
  await dragTo(page, await centerOf(page, `.cal-cell[data-date="${from}"] .cal-chip[data-task-id="${due.id}"]`), await centerOf(page, `.cal-cell[data-date="${later}"]`))
  assert(await until(async () => (await taskTitled(page, due.title))?.dueDate === later), 'kéo việc trên Lịch sang ngày hôm sau: đổi hạn')
  assert(await until(async () => !(await alerted())), 'đổi hạn trên Lịch: nhắc việc đặt lại theo hạn mới (robot thôi báo)')
  await shot(page, '15-calendar.png')

  // Chế độ Mở rộng: giao diện phủ gần kín cửa sổ, cảnh 3D dừng vẽ; F lần nữa thì về lại màn hình máy tính
  const frameloop = (): Promise<string> => page.evaluate('window.__budkin.stage.getR3F().frameloop') as Promise<string>
  await page.keyboard.press('f')
  const vp = await probe(page, (p) => p.stage.viewport)
  assert(
    await until(async () => {
      const box = await page.locator('.screen').boundingBox()
      return !!box && box.width > vp.width * 0.9 && box.height > vp.height * 0.9 && (await frameloop()) === 'never'
    }),
    'phím F: Mở rộng phủ gần kín cửa sổ, cảnh 3D dừng vẽ'
  )
  await shot(page, '16-expanded.png')
  await page.keyboard.press('f')
  const rect = await probe(page, (p) => p.stage.screenRect)
  assert(
    await until(async () => {
      const box = await page.locator('.screen').boundingBox()
      return !!box && Math.abs(box.x - rect.x) < 1 && Math.abs(box.width - rect.width) < 1 && (await frameloop()) === 'demand'
    }),
    'F lần nữa: giao diện về khít màn hình máy tính, cảnh vẽ lại'
  )
  await page.keyboard.press('2')
  return card.id
}

/** Số bản ghi chưa xoá trong DB của app (đọc thẳng ở main) */
async function dbCounts(app: ElectronApplication): Promise<{ tasks: number; projects: number; tags: number }> {
  // Không khai báo hàm con trong evaluate: tsx chèn __name() mà bên main không có
  return app.evaluate(() =>
    (globalThis as unknown as { __budkin: { db: { get<T>(sql: string): T } } }).__budkin.db.get<{ tasks: number; projects: number; tags: number }>(
      `SELECT (SELECT count(*) FROM tasks WHERE deleted_at IS NULL) AS tasks, (SELECT count(*) FROM projects WHERE deleted_at IS NULL) AS projects,
         (SELECT count(*) FROM tags WHERE deleted_at IS NULL) AS tags`
    )
  )
}

/** Hộp thoại chọn file của hệ điều hành: kiểm thử trả lời thay người dùng */
async function stubDialogs(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, f) => {
    const d = dialog as unknown as Record<string, unknown>
    d.showSaveDialog = async () => ({ canceled: false, filePath: f })
    d.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
  }, file)
}

async function openDataSettings(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Comma')
  await press(page.locator('.settings-nav [data-section="data"]'))
  await until(async () => (await page.locator('.settings-body[data-section="data"]').count()) === 1)
}

/**
 * Quản lý dữ liệu (M7): xuất ra file JSON → mở một profile mới tinh, nhập (thay thế) → số việc / dự án / nhãn khớp;
 * nhập lần nữa (gộp) không tạo trùng; sao lưu ngay → thêm việc → khôi phục: app khởi động lại, dữ liệu về lúc sao lưu
 */
async function dataFlow(app: ElectronApplication, page: Page): Promise<void> {
  const file = join(OUT, 'budkin-export.json')
  // Trang đổi sau mỗi lần mở lại app: luôn lấy theo `page` hiện tại
  const toast = (): Locator => page.locator('.toast').last()
  await stubDialogs(app, file)
  await openDataSettings(page)
  await page.getByRole('button', { name: 'Xuất file…' }).click()
  assert(await until(async () => existsSync(file) && /Đã xuất \d+ việc/.test((await toast().textContent()) ?? ''), 5000), 'xuất dữ liệu ra file JSON (hộp thoại lưu file)')
  const parsed = parseExportFile(readFileSync(file, 'utf8'))
  const source = await dbCounts(app)
  assert(parsed.ok && JSON.stringify(liveCounts(parsed.file)) === JSON.stringify(source), `file xuất hợp lệ, đủ dữ liệu (${JSON.stringify(source)})`)
  await app.evaluate(({ app: a }) => a.exit(0))

  // Máy mới: profile trống
  const fresh = join(OUT, 'userdata-import')
  rmSync(fresh, { recursive: true, force: true })
  ;({ app, page } = await launch({ BUDKIN_USER_DATA: fresh }))
  await until(async () => probe(page, (p) => p.data.getState().loaded), 5000)
  await stubDialogs(app, file)
  await openDataSettings(page)
  await page.getByRole('button', { name: 'Chọn file…' }).click()
  const dialog = page.locator('.import-modal')
  assert(await until(async () => /việc/.test((await dialog.locator('.import-meta').textContent().catch(() => '')) ?? '')), 'chọn file: hiện tên file, ngày xuất, số việc')
  await shot(page, '17-import.png')
  await dialog.locator('[data-mode="replace"]').click()
  assert(await until(async () => JSON.stringify(await dbCounts(app)) === JSON.stringify(source), 5000), 'nhập vào máy mới (thay thế): số việc, dự án, nhãn khớp')
  assert(await until(async () => Object.keys(await probe(page, (p) => p.data.getState().tasks)).length > 0), 'giao diện tải lại dữ liệu vừa nhập')
  await page.getByRole('button', { name: 'Chọn file…' }).click()
  await dialog.locator('[data-mode="merge"]').click()
  assert(await until(async () => /Đã gộp: 0 việc mới, 0 việc được cập nhật/.test((await toast().textContent()) ?? '')), 'nhập lại cùng file (gộp): không thêm, không đổi gì')
  assert(JSON.stringify(await dbCounts(app)) === JSON.stringify(source), 'gộp lần nữa không tạo trùng')
  const kinds = (await value(page, 'data:backups')).map((b) => b.kind)
  assert(kinds.filter((k) => k === 'before-import').length === 2, 'mỗi lần nhập đều tự sao lưu trước')

  // Sao lưu ngay → thêm việc → khôi phục bản vừa sao lưu
  await page.getByRole('button', { name: 'Sao lưu ngay' }).click()
  const manual = page.locator('.backup-list li', { hasText: 'Tự sao lưu' })
  assert(await until(async () => (await manual.count()) === 1), 'sao lưu ngay: bản mới hiện trong danh sách')
  await value(page, 'tasks:create', { title: 'Việc thêm sau khi sao lưu' })
  await manual.getByRole('button', { name: 'Khôi phục' }).click()
  const closed = app.waitForEvent('close')
  await page.locator('.modal').getByRole('button', { name: 'Khôi phục' }).click()
  await closed
  assert(true, 'khôi phục: Budkin đóng lại để thay dữ liệu')
  ;({ app, page } = await launch({ BUDKIN_USER_DATA: fresh }))
  await until(async () => probe(page, (p) => p.data.getState().loaded), 5000)
  assert(JSON.stringify(await dbCounts(app)) === JSON.stringify(source), 'mở lại sau khi khôi phục: dữ liệu về đúng lúc sao lưu (không còn việc thêm sau)')
  assert(
    await until(async () => ((await page.evaluate('window.__budkin.toastLog')) as string[]).some((t) => /Đã khôi phục dữ liệu từ bản sao lưu/.test(t))),
    'báo đã khôi phục (kèm nút xem bản sao lưu)'
  )
  assert((await value(page, 'data:backups')).some((b) => b.kind === 'before-restore'), 'dữ liệu trước khi khôi phục được giữ trong một bản sao lưu riêng')
  await app.evaluate(({ app: a }) => a.exit(0))
}

/**
 * Kết nối AI (MCP): bấm "Kết nối" Claude Desktop (thư mục cấu hình giả), rồi chạy cầu nối đúng y lệnh vừa ghi vào
 * cấu hình — như Claude Desktop sẽ chạy — và gọi công cụ bằng thư viện MCP chính thức. Việc AI tạo hiện ngay trên màn hình,
 * có toast kèm Hoàn tác; quyền "Chỉ xem" / "Tắt" chặn đúng
 */
async function aiFlow(page: Page): Promise<void> {
  const settings = (): Promise<Settings | null> => probe(page, (p) => p.data.getState().settings)
  const toasts = async (): Promise<string[]> => (await page.evaluate('window.__budkin.toastLog')) as string[]
  const openAi = async (): Promise<void> => {
    if ((await page.locator('.settings').count()) === 0) await page.keyboard.press('Control+Comma')
    await press(page.locator('.settings-nav [data-section="general"]'))
    await press(page.locator('.settings-nav [data-section="ai"]'))
    await until(async () => (await page.locator('.ai-clients').count()) === 1, 5000)
  }
  const client = (id: string): Locator => page.locator(`.ai-clients li[data-client="${id}"]`)

  await page.locator('.list-head').first().click()
  await openAi()
  assert((await client('desktop').getAttribute('data-state')) === 'missing', 'Kết nối AI: chưa cài Claude Desktop → có link tải về')
  assert(/claude mcp add budkin --scope user/.test((await client('code').locator('code').textContent()) ?? ''), 'Kết nối AI: có sẵn lệnh "claude mcp add" để chép cho Claude Code')
  assert((await settings())?.aiAccess === 'off', 'mặc định: Claude chưa có quyền gì')

  // Claude Desktop "được cài" (thư mục cấu hình giả trong thư mục dữ liệu kiểm thử): bấm Kết nối
  const desktopDir = join(USER_DATA, 'no-claude-desktop')
  mkdirSync(desktopDir, { recursive: true })
  await openAi()
  assert((await client('desktop').getAttribute('data-state')) === 'available', 'Claude Desktop có trên máy → nút Kết nối')
  await press(client('desktop').getByRole('button', { name: 'Kết nối' }))
  assert(await until(async () => (await client('desktop').getAttribute('data-state')) === 'connected'), 'bấm Kết nối → Claude Desktop "Đã kết nối"')
  assert((await settings())?.aiAccess === 'full', 'kết nối xong: quyền chuyển sang "Xem và sửa"')
  const config = JSON.parse(readFileSync(join(desktopDir, 'claude_desktop_config.json'), 'utf8')) as {
    mcpServers: { budkin: { command: string; args: string[]; env?: Record<string, string> } }
  }
  const entry = config.mcpServers.budkin
  assert(entry && existsSync(entry.command), `cấu hình Claude Desktop có mục budkin (${entry.args.find((a) => a.endsWith('.js')) ?? entry.args[0]})`)
  await shot(page, '10-ai-settings.png')

  // Chạy cầu nối đúng như Claude Desktop sẽ chạy
  const transport = new StdioClientTransport({ command: entry.command, args: entry.args, env: { ...(process.env as Record<string, string>), ...entry.env }, stderr: 'pipe' })
  const mcp = new Client({ name: 'claude-ai', version: '0.0.0-e2e' })
  await mcp.connect(transport)
  const { tools } = await mcp.listTools()
  assert(tools.length === 6 && tools.some((t) => t.name === 'create_tasks'), `cầu nối MCP chạy bằng chính file Budkin (như Claude Desktop sẽ chạy): ${tools.length} công cụ`)
  const text = (r: unknown): string => (r as { content: Array<{ text: string }> }).content[0].text
  const today = localDateOf(Date.now() + CLOCK_BASE)
  const overview = JSON.parse(text(await mcp.callTool({ name: 'get_overview', arguments: {} }))) as { now: { date: string; time: string } }
  assert(overview.now.date === today && overview.now.time.startsWith('06:'), `get_overview: Claude biết hôm nay là ${overview.now.date} ${overview.now.time} (đồng hồ của app)`)

  const created = await mcp.callTool({
    name: 'create_tasks',
    arguments: {
      tasks: [
        { title: 'Gọi điện cho mẹ', due_date: today, due_time: '20:00' },
        { title: 'Mua quà sinh nhật', project: 'Gia đình', tags: ['Gấp'], checklist: ['Chọn quà', 'Gói quà'] }
      ]
    }
  })
  assert(!created.isError, 'Claude tạo 2 việc (một việc vào dự án mới "Gia đình")')
  assert(
    await until(async () => (await tasksNow(page)).filter((t) => ['Gọi điện cho mẹ', 'Mua quà sinh nhật'].includes(t.title)).length === 2),
    'việc Claude tạo hiện ngay trong Budkin'
  )
  assert(await until(async () => (await toasts()).includes('Claude đã thêm 2 việc')), 'toast "Claude đã thêm 2 việc" kèm nút Hoàn tác')
  await page.keyboard.press('Escape')
  await press(page.locator('.toast', { hasText: 'Claude đã thêm 2 việc' }).getByRole('button', { name: 'Hoàn tác' }))
  assert(
    await until(async () => (await tasksNow(page)).every((t) => !['Gọi điện cho mẹ', 'Mua quà sinh nhật'].includes(t.title))),
    'bấm Hoàn tác: hai việc Claude vừa tạo biến mất'
  )

  const listed = JSON.parse(text(await mcp.callTool({ name: 'list_tasks', arguments: { view: 'all_open', search: 'bao cao' } }))) as { tasks: Array<{ title: string }> }
  assert(listed.tasks.some((t) => t.title === 'Gửi báo cáo tuần'), 'Claude tìm việc "bao cao" (không dấu) ra "Gửi báo cáo tuần"')
  const target = listed.tasks.find((t) => t.title === 'Gửi báo cáo tuần') as unknown as { id: string }
  const tomorrow = addDays(today, 1)
  const moved = await mcp.callTool({ name: 'update_tasks', arguments: { updates: [{ id: target.id, due_date: tomorrow, priority: 'high' }] } })
  assert(!moved.isError && (await until(async () => (await taskTitled(page, 'Gửi báo cáo tuần'))?.dueDate === tomorrow)), 'Claude dời "Gửi báo cáo tuần" sang ngày mai, Budkin cập nhật ngay')

  await openAi()
  await press(page.locator('.set-row[data-setting="aiAccess"]').getByRole('radio', { name: 'Chỉ xem' }))
  assert(await until(async () => (await settings())?.aiAccess === 'read'), 'đổi quyền sang "Chỉ xem"')
  const blocked = await mcp.callTool({ name: 'delete_tasks', arguments: { ids: [target.id] } })
  assert(blocked.isError === true && /read tasks only/.test(text(blocked)) && !!(await taskTitled(page, 'Gửi báo cáo tuần')), '"Chỉ xem": Claude không xoá được việc')
  await press(page.locator('.set-row[data-setting="aiAccess"]').getByRole('radio', { name: 'Tắt' }))
  assert(await until(async () => (await settings())?.aiAccess === 'off'), 'đổi quyền sang "Tắt"')
  const off = await mcp.callTool({ name: 'get_overview', arguments: {} })
  assert(off.isError === true && /turned off/.test(text(off)), '"Tắt": Claude không đọc được gì')
  await mcp.close()
  await page.keyboard.press('Escape')
}

/**
 * Bàn làm việc 2D (máy không có WebGL): robot, bệ, đèn vẽ bằng SVG, giao diện nằm khít trong màn hình máy tính. Bấm robot /
 * bệ / đèn như cảnh 3D; nhắc việc hiện bằng bong bóng của robot; đứng yên thì không vẽ khung nào; chế độ Mở rộng
 */
async function flatFlow(app: ElectronApplication, page: Page): Promise<void> {
  type Pt = { x: number; y: number }
  const hit = (): Promise<{ robot: Pt; pedestal: Pt; lamp: Pt }> => probe(page, (p) => (p as unknown as { hit(): { robot: Pt; pedestal: Pt; lamp: Pt } }).hit())
  const hud = (): Promise<{ robot: string; speech: string | null }> =>
    probe(page, (p) => (p as unknown as { hudState: { getState(): { robot: string; speech: string | null } } }).hudState.getState())
  const num = async (expr: string): Promise<number> => Number(await page.evaluate(expr))
  const robotMode = async (): Promise<string> => String(await page.evaluate('window.__budkin.robot.mode'))

  assert((await probe(page, (p) => p.renderMode)) === '2d', 'không có WebGL → bàn làm việc 2D')
  assert(
    (await page.locator('.stage').getAttribute('data-mode')) === '2d' && (await page.locator('.flat-robot').count()) === 1 && (await page.locator('.fd-lamp').count()) === 1,
    'bàn 2D vẽ đủ robot, bệ tròn, đèn bàn'
  )
  const vp = await probe(page, (p) => p.stage.viewport)
  const screen = (await page.locator('.screen').boundingBox())!
  assert(
    // Cửa sổ nhỏ hơn mức tối thiểu (máy ảo Windows 1024×768 của CI): màn hình vẫn chiếm phần lớn cửa sổ
    screen.width >= Math.min(594, vp.width * 0.58) &&
      screen.height >= Math.min(396, vp.height * 0.58) &&
      screen.x > 0 &&
      screen.x + screen.width < vp.width &&
      screen.y > 0,
    `giao diện nằm khít trong màn hình máy tính (${Math.round(screen.width)}×${Math.round(screen.height)})`
  )
  const h0 = await hit()
  assert(h0.robot.x < screen.x && h0.pedestal.x < screen.x && h0.lamp.x > screen.x + screen.width, 'robot đứng bên trái, đèn bên phải màn hình')
  await shot(page, '4-flat-2d.png')

  // Bấm vào robot: phản ứng, tóm tắt việc hôm nay
  const poke0 = await num('window.__budkin.robot.lastPokeAt')
  await page.mouse.click(h0.robot.x, h0.robot.y)
  assert(await until(async () => (await num('window.__budkin.robot.lastPokeAt')) !== poke0), 'bấm vào robot 2D: robot phản ứng')
  assert(await until(async () => (await hud()).speech === 'summary'), 'bấm vào robot 2D: bong bóng tóm tắt việc hôm nay')

  // Bấm vào bệ: robot chìm xuống, robot kế tiếp trồi lên chào
  await page.mouse.click(h0.pedestal.x, h0.pedestal.y)
  assert(await until(async () => (await page.locator('.flat-robot').getAttribute('data-robot')) === 'orbi', 4000), 'bấm vào bệ 2D: đổi sang Orbi')
  assert(await until(async () => (await hud()).speech === 'greeting'), 'robot mới lên bệ thì chào')
  // Chờ Orbi bay lên xong (hoạt cảnh xuất hiện) rồi mới bấm
  await until(async () => (await page.evaluate('window.__budkin.robot.settled')) === true && (await robotMode()) === 'idle', 5000)
  const h1 = await hit()
  const poke1 = await num('window.__budkin.robot.lastPokeAt')
  await page.mouse.click(h1.robot.x, h1.robot.y)
  assert(await until(async () => (await num('window.__budkin.robot.lastPokeAt')) !== poke1), 'bấm vào Orbi (quả cầu bay) cũng trúng')
  await value(page, 'settings:update', { robot: 'budkin' })
  assert(await until(async () => (await page.locator('.flat-robot').getAttribute('data-robot')) === 'budkin', 4000), 'chọn lại Budkin trong thiết lập: bàn 2D đổi theo')

  // Bấm vào đèn: đổi theme gần như ngay (hiệu ứng đèn ~0,35 giây), phòng tối / sáng theo
  const theme0 = await probe(page, (p) => p.theme.getState().theme)
  const theme1 = theme0 === 'light' ? 'dark' : 'light'
  await page.mouse.click(h0.lamp.x, h0.lamp.y)
  assert(await until(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === theme1, 1500), `bấm vào đèn bàn 2D: ${theme0} → ${theme1}`)
  await until(async () => (await page.evaluate('window.__budkin.env.anim === null')) === true, 3000)
  const night = await num("getComputedStyle(document.querySelector('.flat')).getPropertyValue('--night')")
  assert(night === (theme1 === 'dark' ? 1 : 0), `phòng ${theme1 === 'dark' ? 'tối hẳn' : 'sáng hẳn'} sau hiệu ứng (--night = ${night})`)
  await shot(page, `4-flat-2d-${theme1}.png`)

  // Đứng yên: robot ngủ, bàn 2D không vẽ khung nào
  assert(await until(async () => (await robotMode()) === 'sleep', 12_000), 'để yên: robot 2D ngủ')
  await until(async () => (await page.evaluate('window.__budkin.robot.settled')) === true, 3000)
  // Khung cuối của lúc chuyển sang ngủ có thể bị dời (giới hạn 30 khung/giây; máy ảo chậm): chờ khung hình ngừng hẳn
  let last = -1
  const quietBy = Date.now() + 5000 * WAIT
  while (Date.now() < quietBy) {
    const n = await num('window.__budkin.renderStats.frames')
    if (n === last) break
    last = n
    await page.waitForTimeout(400)
  }
  const f0 = await num('window.__budkin.renderStats.frames')
  await page.waitForTimeout(1500)
  const idleFrames = (await num('window.__budkin.renderStats.frames')) - f0
  assert(idleFrames === 0, `robot 2D ngủ: không vẽ khung nào (${idleFrames} khung trong 1,5 giây)`)
  assert((await page.locator('.zzz.on').count()) === 1, 'robot 2D ngủ: có "Zzz"')

  // Nhắc việc: robot báo động, nhắc hiện trong bong bóng của robot (không chiếm chỗ trong màn hình)
  const due = await value(page, 'tasks:create', { title: 'Việc nhắc trên bàn 2D', ...dueOf((await mainNow(app)) - 60_000), remindBeforeMin: 0 })
  assert(await until(async () => (await robotMode()) === 'alert', 5000), 'đến hạn: robot 2D báo động')
  assert(
    await until(async () => (await page.locator('.bubble .reminder-title', { hasText: due.title }).count()) === 1) && (await page.locator('.reminder-banner').count()) === 0,
    'nhắc việc hiện trong bong bóng của robot, không thành dải báo trong màn hình'
  )
  await shot(page, '4-flat-2d-alert.png')
  await value(page, 'reminders:dismiss', due.id)
  await value(page, 'tasks:delete', due.id, 'one')

  // Chế độ Mở rộng (F): giao diện phủ gần kín cửa sổ, bàn 2D dừng vẽ
  await page.locator('.list-head').first().click()
  await page.keyboard.press('f')
  assert(await until(async () => ((await page.locator('.screen').boundingBox())?.width ?? 0) > vp.width * 0.9), 'phím F trên bàn 2D: giao diện phủ gần kín cửa sổ')
  await page.keyboard.press('f')
  assert(await until(async () => ((await page.locator('.screen').boundingBox())?.width ?? vp.width) < vp.width * 0.8), 'phím F lần nữa: về lại màn hình máy tính trên bàn 2D')
}

async function main(): Promise<void> {
  // Chống treo (vd. hộp thoại chờ người bấm): quá 8 phút (máy chậm: 20 phút) thì báo lỗi, đóng app và thoát
  const limitMin = SLOW ? 20 : 8
  setTimeout(() => {
    const msg = [`Kiểm thử bị treo quá ${limitMin} phút. Đã qua ${passed.length} bước, các bước cuối:`, ...passed.slice(-8)].join('\n')
    console.error(msg)
    annotate('error', `E2E ${process.platform} bị treo`, msg)
    appRef?.process().kill()
    process.exit(1)
  }, limitMin * 60_000).unref()
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  // ---- Lần mở đầu ----
  let { app, page } = await launch()
  assert((await probe(page, (p) => p.renderMode)) === '3d', 'có WebGL2 → chế độ 3D')
  const gl = await probe(page, (p) => p.webglInfo())
  assert(gl !== null, `WebGL chạy được (${gl?.renderer})`)
  const info = (await page.evaluate(() => (window as unknown as Probe).api.invoke('app:info'))) as { ok: boolean; value: { sqlite: string; electron: string } }
  assert(info.ok && /^3\.\d+/.test(info.value.sqlite), `node:sqlite chạy trong Electron ${info.value.electron} (SQLite ${info.value.sqlite})`)
  const bad = (await page.evaluate(() => (window as unknown as Probe).api.invoke('app:setTheme', 'tím' as never))) as { ok: boolean; error?: { code: string } }
  assert(!bad.ok && bad.error?.code === 'VALIDATION', 'tham số IPC sai bị từ chối (VALIDATION)')

  const theme0 = await probe(page, (p) => p.theme.getState().theme)
  await checkAlignment(page, 'kích thước mặc định', theme0)
  await shot(page, '1-desk.png')
  for (const [w, h] of [
    [1000, 660],
    [1600, 900]
  ]) {
    if (await resize(app, page, w, h)) {
      await checkAlignment(page, `${w}×${h}`, theme0)
      await shot(page, `2-desk-${w}x${h}.png`)
    } else console.log(`  (bỏ qua ${w}×${h}: màn hình không đủ lớn)`)
  }

  // Bấm nút đổi theme bằng chuột thật
  await page.locator('.theme-toggle').click()
  const theme1 = theme0 === 'light' ? 'dark' : 'light'
  assert(
    await until(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === theme1),
    `bấm nút đổi theme: ${theme0} → ${theme1}`
  )
  // Chờ căn phòng sáng / tối dần xong (~0,35 s)
  await until(async () => (await page.evaluate('window.__budkin.env.anim === null')) === true, 3000)
  await checkAlignment(page, `theme ${theme1}`, theme1)
  await shot(page, `3-theme-${theme1}.png`)

  // ---- Dữ liệu qua IPC: tạo, sửa, renderer nhận thay đổi qua data:changed ----
  const project = await value(page, 'projects:create', { name: 'Công ty', color: 'sky' })
  const tag = await value(page, 'tags:create', { name: 'Gấp', color: 'coral' })
  const task = await value(page, 'tasks:create', {
    title: 'Gửi báo cáo tuần',
    projectId: project.id,
    tagIds: [tag.id],
    dueDate: '2026-10-02',
    dueTime: '10:00',
    remindBeforeMin: 15,
    checklist: ['Tổng hợp số liệu']
  })
  assert(
    await until(async () => !!(await probe(page, (p) => p.data.getState().tasks))[task.id]),
    'tạo task qua IPC → bộ đệm renderer nhận ngay qua data:changed'
  )
  await value(page, 'checklist:add', task.id, 'Viết nhận xét')
  await value(page, 'tasks:setStatus', task.id, 'in_progress')
  const found = await value(page, 'tasks:list', { scope: 'search', text: 'bao cao' })
  assert(found.length === 1 && found[0].id === task.id, 'tìm "bao cao" (không dấu) ra "Gửi báo cáo tuần"')
  const invalid = await invoke(page, 'tasks:create', { title: '   ' })
  assert(!invalid.ok && invalid.error.code === 'VALIDATION', 'tiêu đề rỗng bị từ chối (VALIDATION)')
  const badDate = await invoke(page, 'tasks:update', task.id, { dueDate: '2026-02-30' })
  assert(!badDate.ok && badDate.error.code === 'VALIDATION', 'ngày 30/02 bị từ chối (VALIDATION)')
  await app.evaluate(({ app: a }) => a.exit(0))

  // ---- Mở lại: theme và dữ liệu được nhớ ----
  ;({ app, page } = await launch())
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === theme1, `mở lại app vẫn giữ theme ${theme1}`)
  await until(async () => probe(page, (p) => p.data.getState().loaded), 5000)
  const saved = (await probe(page, (p) => p.data.getState().tasks))[task.id]
  assert(
    saved?.status === 'in_progress' && saved.checklist.length === 2 && saved.tagIds[0] === tag.id && saved.projectId === project.id,
    'mở lại app: task, checklist, nhãn, dự án còn nguyên'
  )
  await uiFlow(page)
  await recurrenceFlow(page)
  await settingsFlow(page)
  await robotsFlow(page)
  await sceneFlow(page)
  await aiFlow(page)
  await app.evaluate(({ app: a }) => a.exit(0))

  // ---- Nhắc việc ----
  ;({ app, page } = await launch())
  await until(async () => probe(page, (p) => p.data.getState().loaded), 5000)
  await reminderFlow(app, page)
  const movedCard = await boardFlow(app, page)
  await app.evaluate(({ app: a }) => a.exit(0))
  // Mở lại 2 giờ sau: ba nhắc đã quá giờ (trong vòng 6 giờ) gộp thành đúng một thông báo
  ;({ app, page } = await launch({ BUDKIN_CLOCK_OFFSET: String(CLOCK_BASE + 2 * 3600_000) }))
  const summary = await notices(app)
  assert(summary.length === 1 && summary[0].taskId === null && summary[0].title === 'Bạn có 3 việc cần làm', `mở lại app sau khi tắt: đúng 1 thông báo gộp (${JSON.stringify(summary.map((n) => n.title))})`)
  assert(await until(async () => (await page.locator('.reminder-more').textContent().catch(() => '')) === '+2'), 'mở lại app: robot vẫn báo các nhắc chưa xử lý (+2)')
  assert(
    await until(async () => (await page.locator(`.board-col.col-in_progress .task-card[data-task-id="${movedCard}"]`).count()) === 1, 5000),
    'mở lại app: vẫn đang xem Kanban, thẻ đã kéo vẫn ở cột "Đang làm"'
  )
  // ---- Xuất / nhập, sao lưu / khôi phục (đóng app này, mở profile mới) ----
  await dataFlow(app, page)

  // ---- Máy không có WebGL: bàn làm việc 2D (hồ sơ dữ liệu mới: không còn nhắc việc chờ từ các phần trước) ----
  ;({ app, page } = await launch({ BUDKIN_E2E_NO_WEBGL: '1', BUDKIN_USER_DATA: join(OUT, 'userdata-2d') }))
  await flatFlow(app, page)

  const errors = problems.filter((p) => p.startsWith('[renderer]'))
  assert(errors.length === 0, `renderer không có lỗi (${errors.length})`)
  console.log('\nTẤT CẢ KIỂM THỬ ĐỀU QUA')
  if (problems.length) console.log(`Cảnh báo ghi nhận được:\n${problems.join('\n')}`)
  annotate('notice', `E2E ${process.platform}: qua ${passed.length} bước`, passed.join('\n'))
  await app.evaluate(({ app: a }) => a.exit(0))
}

main().catch(async (err) => {
  console.error(err)
  await pageRef?.screenshot({ path: join(OUT, 'fail.png') }).catch(() => undefined)
  annotate(
    'error',
    `E2E ${process.platform} thất bại`,
    [String((err as Error)?.message ?? err).slice(0, 1500), '', `Đã qua ${passed.length} bước (${elapsed()}), các bước cuối:`, ...passed.slice(-6), '', 'Lỗi / cảnh báo từ app:', ...problems.slice(-12)].join('\n')
  )
  await appRef?.evaluate(({ app: a }) => a.exit(1)).catch(() => undefined)
  process.exit(1)
})
