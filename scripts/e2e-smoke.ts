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
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright-core'
import type { ApiResponse, ArgsOf, Channel, DeskApi, ResultOf } from '../src/shared/api'
import { addDays, localDateOf, pad2 } from '../src/shared/datetime'
import { liveCounts, parseExportFile } from '../src/shared/exportFormat'
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
let pageRef: Page | undefined
let appRef: ElectronApplication | undefined

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`KIỂM THỬ THẤT BẠI: ${msg}`)
  passed.push(msg)
  console.log(`  ✓ ${msg}`)
}

/** Trên GitHub Actions: in lỗi thành annotation (xem được ngay trên trang tóm tắt) */
function annotate(level: 'error' | 'notice', title: string, text: string): void {
  if (!process.env.GITHUB_ACTIONS) return
  const esc = (v: string): string => v.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
  console.log(`::${level} title=${esc(title)}::${esc(text)}`)
}

/** Chờ điều kiện đúng (giao diện cập nhật sau một nhịp) */
async function until(check: () => Promise<boolean>, timeout = 3000): Promise<boolean> {
  const end = Date.now() + timeout
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
    // Sự kiện đã tới nơi (nút đã biến mất) thì thôi
    if (!(await target.count())) return
    problems.push(`[e2e] bấm chuột bị treo, bấm qua DOM: ${String((err as Error).message ?? err).split('\n')[0]}`)
    await target.evaluate((el) => (el as HTMLElement).click())
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
  await page.screenshot({ path: join(OUT, '5-editor.png') })

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
  await page.screenshot({ path: join(OUT, '6-today-vi.png') })

  // Đổi ngôn ngữ (thanh bên thu gọn ở màn hình nhỏ thì đổi qua store)
  const langBtn = page.locator('.lang-switch button', { hasText: 'EN' })
  if (await langBtn.isVisible()) await langBtn.click()
  else await page.evaluate("window.__budkin.lang.getState().setLang('en')")
  assert(await until(async () => (await page.locator('.list-head h2').textContent()) === 'Today'), 'đổi sang tiếng Anh: giao diện hiện "Today"')
  await page.screenshot({ path: join(OUT, '7-today-en.png') })
  await page.locator('.theme-toggle').click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(OUT, '8-today-en-other-theme.png') })
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
    await page.locator(`.settings-nav [data-section="${id}"]`).click()
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
  await page.screenshot({ path: join(OUT, '9-settings.png') })
  await page.keyboard.press('Escape')
  assert(await until(async () => (await panel.count()) === 0), 'Esc đóng Cài đặt (lần 2)')
  // Trả lại thiết lập mặc định cho các phần kiểm thử sau
  await value(page, 'settings:update', { weekStart: 1, allDayRemindTime: '09:00' })
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
  await until(async () => (await page.evaluate('window.__budkin.robot.mode')) === 'idle', 3000 * WAIT)
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
  await page.screenshot({ path: join(OUT, '9-scene.png') })

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
  await page.screenshot({ path: join(OUT, '10-lamp-toggled.png') })
  await page.keyboard.press('Control+Shift+L')
  assert(await until(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === before, 1500), 'Ctrl+Shift+L (đang gõ) bật / tắt đèn trở lại')
  await page.keyboard.press('Escape')

  // Chọc robot
  await page.mouse.click(hit.robot.x, hit.robot.y)
  assert(await until(async () => (await page.evaluate('window.__budkin.robot.mode')) === 'poked', 1000), 'bấm vào robot: robot bẹp-giãn')

  // Chế độ Tiết kiệm: đứng yên thì không vẽ khung nào
  await invoke(page, 'settings:update', { quality: 'saver' })
  await page.waitForFunction(() => (window as unknown as Probe).__budkin.stage.ready, undefined, { timeout: 10000 })
  // Di chuột nhẹ (đặt lại hẹn giờ buồn ngủ — 4 s khi kiểm thử), chờ robot đứng yên rồi đo; chỉ tính lần đo mà
  // robot không đổi trạng thái giữa chừng (máy chậm / vẽ bằng CPU có thể chạm mốc buồn ngủ)
  let idleFrames = -1
  for (let attempt = 0; attempt < 3 && idleFrames < 0; attempt++) {
    await page.mouse.move(vp.width / 2 + attempt * 7, vp.height - 30, { steps: 2 })
    await settled()
    // Khung hình do lần nhấn Shift cuối (giữ robot thức) yêu cầu phải vẽ xong trước khi bắt đầu đếm
    await page.waitForTimeout(250 * WAIT)
    const mode0 = await page.evaluate('window.__budkin.robot.mode')
    const f0 = await num('window.__budkin.renderStats.frames')
    await page.waitForTimeout(1200)
    const f1 = await num('window.__budkin.renderStats.frames')
    if (mode0 === 'idle' && (await page.evaluate('window.__budkin.robot.mode')) === 'idle') idleFrames = f1 - f0
  }
  assert(idleFrames === 0, `Tiết kiệm, đứng yên 1,2 giây: ${idleFrames} khung hình`)
  assert((await probe(page, (p) => p.renderMode)) === '3d', 'đổi mức chất lượng (tạo lại canvas) vẫn ở chế độ 3D')

  // Lâu không thao tác (kiểm thử rút ngắn còn vài giây): robot ngủ, hiện "Zzz", cảnh không vẽ
  assert(await until(async () => (await page.evaluate('window.__budkin.robot.mode')) === 'sleep', 8000 * WAIT), 'lâu không thao tác: robot ngủ')
  assert(await until(async () => page.locator('.zzz.on').isVisible(), 1500), 'robot ngủ: hiện "Zzz"')
  await page.screenshot({ path: join(OUT, '11-robot-sleep.png') })
  // Chờ robot gục đầu, nhắm mắt xong (vẽ bằng CPU thì chậm hơn) rồi mới đo
  await settled(false)
  const s0 = await num('window.__budkin.renderStats.frames')
  await page.waitForTimeout(1500)
  const sleepFrames = (await num('window.__budkin.renderStats.frames')) - s0
  assert(sleepFrames === 0, `robot ngủ: cảnh không vẽ khung nào (${sleepFrames} khung trong 1,5 giây)`)
  await page.mouse.move(vp.width / 2, vp.height - 20, { steps: 4 })
  assert(await until(async () => ['startled', 'idle'].includes(String(await page.evaluate('window.__budkin.robot.mode'))), 1500), 'di chuột: robot tỉnh dậy')

  // Mất WebGL không phục hồi: chuyển sang giao diện 2D, chữ đang gõ dở vẫn còn
  await page.locator('.quick-add-input').click()
  await page.keyboard.type('Nháp chưa lưu')
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
  const t0 = await mainNow(app)
  const a = await value(page, 'tasks:create', { title: 'Gọi cho khách hàng', ...dueOf(t0 + 30 * MIN), remindBeforeMin: 15 })
  await advance(16 * MIN)
  assert(await until(async () => (await reminder.locator('.reminder-title').textContent().catch(() => '')) === a.title), 'tới giờ "sắp đến hạn": robot hiện nhắc việc')
  assert(/Sắp đến hạn/.test((await reminder.locator('.reminder-kicker').textContent()) ?? ''), 'nhắc đầu tiên là "sắp đến hạn"')
  assert(await until(async () => (await mode()) === 'alert'), 'robot báo động (đèn đỏ, nhún nhảy)')
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
  await page.screenshot({ path: join(OUT, '12-reminder.png') })

  await press(reminder.getByRole('button', { name: '10 phút', exact: true }))
  assert(await until(async () => (await reminder.count()) === 0 && (await mode()) !== 'alert'), 'báo lại sau 10 phút: nhắc tạm tắt, robot dịu lại')
  await advance(10 * MIN)
  assert(await until(async () => (await reminder.count()) === 1), 'hết 10 phút: nhắc lại')
  await advance(5 * MIN)
  assert(await until(async () => /Đến hạn/.test((await reminder.locator('.reminder-kicker').textContent().catch(() => '')) ?? '')), 'tới giờ hạn: chuyển sang "đến hạn"')

  const b = await value(page, 'tasks:create', { title: 'Nộp hồ sơ', ...dueOf(await mainNow(app)), remindBeforeMin: 0 })
  assert(await until(async () => (await reminder.locator('.reminder-more').textContent().catch(() => '')) === '+1'), 'hai nhắc cùng lúc: hiện việc đầu tiên kèm "+1"')
  assert(await insideGap(), `có "+1" vẫn không đè lên màn hình ${where}`)
  await page.screenshot({ path: join(OUT, '13-reminder-two.png') })

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
  await page.mouse.click(hit.robot.x, hit.robot.y)
  assert(await until(async () => /Hôm nay còn|Hết việc/.test((await page.locator('.bubble.is-summary').textContent().catch(() => '')) ?? '')), 'bấm vào robot: tóm tắt việc hôm nay')

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
  await page.screenshot({ path: join(OUT, '14-kanban.png') })

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
  await page.screenshot({ path: join(OUT, '15-calendar.png') })

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
  await page.screenshot({ path: join(OUT, '16-expanded.png') })
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
  await page.locator('.settings-nav [data-section="data"]').click()
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
  await page.screenshot({ path: join(OUT, '17-import.png') })
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
  assert(await until(async () => /Đã khôi phục dữ liệu từ bản sao lưu/.test((await page.locator('.toast').first().textContent().catch(() => '')) ?? '')), 'báo đã khôi phục')
  assert((await value(page, 'data:backups')).some((b) => b.kind === 'before-restore'), 'dữ liệu trước khi khôi phục được giữ trong một bản sao lưu riêng')
  await app.evaluate(({ app: a }) => a.exit(0))
}

async function main(): Promise<void> {
  // Chống treo (vd. hộp thoại chờ người bấm): quá 5 phút thì báo lỗi, đóng app và thoát
  setTimeout(() => {
    const msg = `Kiểm thử bị treo quá ${SLOW ? 10 : 5} phút. Đã qua ${passed.length} bước, bước cuối: ${passed[passed.length - 1] ?? '(chưa có)'}`
    console.error(msg)
    annotate('error', `E2E ${process.platform} bị treo`, msg)
    appRef?.process().kill()
    process.exit(1)
  }, 5 * 60_000 * (SLOW ? 2 : 1)).unref()
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
  await page.screenshot({ path: join(OUT, '1-desk.png') })
  for (const [w, h] of [
    [1000, 660],
    [1600, 900]
  ]) {
    if (await resize(app, page, w, h)) {
      await checkAlignment(page, `${w}×${h}`, theme0)
      await page.screenshot({ path: join(OUT, `2-desk-${w}x${h}.png`) })
    } else console.log(`  (bỏ qua ${w}×${h}: màn hình không đủ lớn)`)
  }

  // Bấm nút đổi theme bằng chuột thật
  await page.locator('.theme-toggle').click()
  const theme1 = theme0 === 'light' ? 'dark' : 'light'
  assert(
    await until(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === theme1),
    `bấm nút đổi theme: ${theme0} → ${theme1}`
  )
  // Chờ căn phòng sáng / tối dần xong (~0,75 s)
  await until(async () => (await page.evaluate('window.__budkin.env.anim === null')) === true, 3000)
  await checkAlignment(page, `theme ${theme1}`, theme1)
  await page.screenshot({ path: join(OUT, `3-theme-${theme1}.png`) })

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
  await sceneFlow(page)
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

  // ---- Máy không có WebGL: chế độ 2D ----
  ;({ app, page } = await launch({ BUDKIN_E2E_NO_WEBGL: '1' }))
  assert((await probe(page, (p) => p.renderMode)) === '2d', 'không có WebGL → chế độ 2D')
  const box2d = await page.locator('.screen').boundingBox()
  const vp = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
  assert(box2d && box2d.width > vp.width * 0.9, 'chế độ 2D: giao diện phủ gần kín cửa sổ')
  await page.screenshot({ path: join(OUT, '4-flat-2d.png') })

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
    [String((err as Error)?.message ?? err).slice(0, 1500), '', `Đã qua ${passed.length} bước, bước cuối: ${passed[passed.length - 1] ?? '(chưa có)'}`, '', 'Lỗi / cảnh báo từ app:', ...problems.slice(-12)].join('\n')
  )
  await appRef?.evaluate(({ app: a }) => a.exit(1)).catch(() => undefined)
  process.exit(1)
})
