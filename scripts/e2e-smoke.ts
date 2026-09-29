/**
 * Kiểm thử end-to-end: mở app đã build, điều khiển bằng chuột / bàn phím thật, chụp ảnh các bước.
 * Chạy: npm run build && npm run e2e
 * Bản đã đóng gói: BUDKIN_E2E_EXE=release/linux-unpacked/budkin npm run e2e
 *   (Windows: BUDKIN_E2E_EXE="release/win-unpacked/Budkin.exe")
 * Máy không có GPU (CI): BUDKIN_E2E_SWIFTSHADER=1 — WebGL vẽ bằng CPU
 * Chạy bản deb đã cài mà không tắt sandbox (kiểm tra profile AppArmor): BUDKIN_E2E_SANDBOX=1
 * Giả lập màn hình nhỏ (máy ảo Windows 1024×768 của GitHub): BUDKIN_E2E_WINDOW=1000x660
 */
import { mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import type { ApiResponse, ArgsOf, Channel, DeskApi, ResultOf } from '../src/shared/api'
import { localDateOf, pad2 } from '../src/shared/datetime'
import { SCREEN_BG } from '../src/shared/palette'
import type { Task } from '../src/shared/types'

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
    data: { getState(): { loaded: boolean; tasks: Record<string, Task>; projects: Record<string, { name: string }>; tags: Record<string, { name: string }> } }
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

  await reminder.getByRole('button', { name: '10 phút', exact: true }).click()
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
  await reminder.getByRole('button', { name: 'Xong', exact: true }).click()
  assert(await until(async () => (await taskTitled(page, a.title))?.status === 'done'), 'bấm Xong trên nhắc việc: việc chuyển sang Đã xong')
  // Hoạt cảnh ăn mừng chỉ dài 0,9 giây: kiểm tra mốc lần ăn mừng cuối thay vì cố bắt đúng lúc đang nhảy
  assert(await until(async () => Number(await page.evaluate('window.__budkin.robot.state.lastCelebrateAt')) >= beforeDone), 'robot ăn mừng')
  assert(await until(async () => (await reminder.locator('.reminder-title').textContent().catch(() => '')) === b.title), 'còn lại việc thứ hai')
  await reminder.locator('.reminder-dismiss').click()
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
  await sceneFlow(page)
  await app.evaluate(({ app: a }) => a.exit(0))

  // ---- Nhắc việc ----
  ;({ app, page } = await launch())
  await until(async () => probe(page, (p) => p.data.getState().loaded), 5000)
  await reminderFlow(app, page)
  await app.evaluate(({ app: a }) => a.exit(0))
  // Mở lại 2 giờ sau: ba nhắc đã quá giờ (trong vòng 6 giờ) gộp thành đúng một thông báo
  ;({ app, page } = await launch({ BUDKIN_CLOCK_OFFSET: String(CLOCK_BASE + 2 * 3600_000) }))
  const summary = await notices(app)
  assert(summary.length === 1 && summary[0].taskId === null && summary[0].title === 'Bạn có 3 việc cần làm', `mở lại app sau khi tắt: đúng 1 thông báo gộp (${JSON.stringify(summary.map((n) => n.title))})`)
  assert(await until(async () => (await page.locator('.reminder-more').textContent().catch(() => '')) === '+2'), 'mở lại app: robot vẫn báo các nhắc chưa xử lý (+2)')
  await app.evaluate(({ app: a }) => a.exit(0))

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
