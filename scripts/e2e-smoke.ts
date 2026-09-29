/**
 * Kiểm thử end-to-end: mở app đã build, điều khiển bằng chuột / bàn phím thật, chụp ảnh các bước.
 * Chạy: npm run build && npm run e2e
 * Bản đã đóng gói: DESKBUDDY_E2E_EXE=release/linux-unpacked/desk-buddy npm run e2e
 *   (Windows: DESKBUDDY_E2E_EXE="release/win-unpacked/DeskBuddy.exe")
 * Máy không có GPU (CI): DESKBUDDY_E2E_SWIFTSHADER=1 — WebGL vẽ bằng CPU
 * Chạy bản deb đã cài mà không tắt sandbox (kiểm tra profile AppArmor): DESKBUDDY_E2E_SANDBOX=1
 * Giả lập màn hình nhỏ (máy ảo Windows 1024×768 của GitHub): DESKBUDDY_E2E_WINDOW=1000x660
 */
import { mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import type { ApiResponse, ArgsOf, Channel, DeskApi, ResultOf } from '../src/shared/api'
import { SCREEN_BG } from '../src/shared/palette'
import type { Task } from '../src/shared/types'

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'test-output', 'e2e')
const USER_DATA = join(OUT, 'userdata')

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
  __deskbuddy: {
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
  const exe = process.env.DESKBUDDY_E2E_EXE
  const args = [
    ...(exe ? [] : [ROOT]),
    ...(process.platform === 'linux' && !process.env.DESKBUDDY_E2E_SANDBOX ? ['--no-sandbox'] : []),
    ...(process.env.DESKBUDDY_E2E_SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : [])
  ]
  const app = (appRef = await electron.launch({
    executablePath: exe ?? (require('electron') as unknown as string),
    args,
    env: { ...process.env, DESKBUDDY_TEST: '1', DESKBUDDY_USER_DATA: USER_DATA, ...extraEnv } as Record<string, string>
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
  const mode = await page.evaluate(() => (window as unknown as Probe).__deskbuddy.renderMode)
  if (mode === '3d') await page.waitForFunction(() => (window as unknown as Probe).__deskbuddy.stage.ready, undefined, { timeout: 20000 })
  const win = /^(\d+)x(\d+)$/.exec(process.env.DESKBUDDY_E2E_WINDOW ?? '')
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
    const v = await page.evaluate(() => (window as unknown as Probe).__deskbuddy.stage.viewport)
    return Math.abs(v.width - w) < 1.5 && Math.abs(v.height - h) < 1.5
  }, 4000)
}

async function probe<T>(page: Page, fn: (p: Probe['__deskbuddy']) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__deskbuddy)`) as Promise<T>
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
  const px = await page.evaluate((pts) => (window as unknown as Probe).__deskbuddy.samplePixels(pts), [...inside, ...outside])
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
  else await page.evaluate("window.__deskbuddy.lang.getState().setLang('en')")
  assert(await until(async () => (await page.locator('.list-head h2').textContent()) === 'Today'), 'đổi sang tiếng Anh: giao diện hiện "Today"')
  await page.screenshot({ path: join(OUT, '7-today-en.png') })
  await page.locator('.theme-toggle').click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(OUT, '8-today-en-other-theme.png') })
  await page.locator('.theme-toggle').click()
  await page.evaluate("window.__deskbuddy.lang.getState().setLang('vi')")
  assert(await until(async () => (await page.locator('.list-head h2').textContent()) === 'Hôm nay'), 'đổi lại tiếng Việt')
}

/** Cảnh 3D: robot nhìn theo chuột, bấm đèn đổi theme, chọc robot, không vẽ khi đứng yên, ngủ, mất WebGL → 2D */
async function sceneFlow(page: Page): Promise<void> {
  const num = async (expr: string): Promise<number> => Number(await page.evaluate(expr))
  // Cờ "đứng yên" chỉ cập nhật khi vẽ khung: chờ khung hình mới sau khi di chuột rồi mới chờ robot dừng
  const settled = async (): Promise<boolean> => {
    await page.waitForTimeout(250)
    return until(async () => (await page.evaluate('window.__deskbuddy.robot.settled')) === true, 5000)
  }
  const vp = await probe(page, (p) => p.stage.viewport)

  // Robot quay đầu theo con trỏ (kể cả khi con trỏ nằm trên giao diện trong màn hình).
  // Chờ hết hoạt cảnh đang dở (vd. vừa bật/tắt đèn thì robot quay sang nhìn đèn)
  await page.mouse.move(vp.width / 2, vp.height / 2, { steps: 3 })
  await until(async () => (await page.evaluate('window.__deskbuddy.robot.mode')) === 'idle', 3000)
  await page.mouse.move(4, vp.height / 2, { steps: 6 })
  await settled()
  const yawLeft = await num('window.__deskbuddy.robot.headYaw')
  await page.mouse.move(vp.width - 4, vp.height / 2, { steps: 10 })
  await settled()
  const yawRight = await num('window.__deskbuddy.robot.headYaw')
  // Robot đứng sát mép trái nên con trỏ ở mép trái chỉ lệch trái một chút so với robot
  assert(yawLeft < 0 && yawRight - yawLeft > 0.4, `robot nhìn theo chuột: trái ${yawLeft.toFixed(2)} rad, phải ${yawRight.toFixed(2)} rad`)
  await page.mouse.move(vp.width * 0.12, 3, { steps: 6 })
  await settled()
  const pitchUp = await num('window.__deskbuddy.robot.headPitch')
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
  await until(async () => (await page.evaluate('window.__deskbuddy.env.anim === null')) === true, 3000)
  await page.screenshot({ path: join(OUT, '10-lamp-toggled.png') })
  await page.keyboard.press('Control+Shift+L')
  assert(await until(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === before, 1500), 'Ctrl+Shift+L (đang gõ) bật / tắt đèn trở lại')
  await page.keyboard.press('Escape')

  // Chọc robot
  await page.mouse.click(hit.robot.x, hit.robot.y)
  assert(await until(async () => (await page.evaluate('window.__deskbuddy.robot.mode')) === 'poked', 1000), 'bấm vào robot: robot bẹp-giãn')

  // Chế độ Tiết kiệm: đứng yên thì không vẽ khung nào
  await invoke(page, 'settings:update', { quality: 'saver' })
  await page.waitForFunction(() => (window as unknown as Probe).__deskbuddy.stage.ready, undefined, { timeout: 10000 })
  // Di chuột nhẹ (đặt lại hẹn giờ buồn ngủ — 4 s khi kiểm thử), chờ robot đứng yên rồi đo; chỉ tính lần đo mà
  // robot không đổi trạng thái giữa chừng (máy chậm / vẽ bằng CPU có thể chạm mốc buồn ngủ)
  let idleFrames = -1
  for (let attempt = 0; attempt < 3 && idleFrames < 0; attempt++) {
    await page.mouse.move(vp.width / 2 + attempt * 7, vp.height - 30, { steps: 2 })
    await settled()
    const mode0 = await page.evaluate('window.__deskbuddy.robot.mode')
    const f0 = await num('window.__deskbuddy.renderStats.frames')
    await page.waitForTimeout(1200)
    const f1 = await num('window.__deskbuddy.renderStats.frames')
    if (mode0 === 'idle' && (await page.evaluate('window.__deskbuddy.robot.mode')) === 'idle') idleFrames = f1 - f0
  }
  assert(idleFrames === 0, `Tiết kiệm, đứng yên 1,2 giây: ${idleFrames} khung hình`)
  assert((await probe(page, (p) => p.renderMode)) === '3d', 'đổi mức chất lượng (tạo lại canvas) vẫn ở chế độ 3D')

  // Lâu không thao tác (kiểm thử rút ngắn còn vài giây): robot ngủ, hiện "Zzz", cảnh không vẽ
  assert(await until(async () => (await page.evaluate('window.__deskbuddy.robot.mode')) === 'sleep', 8000), 'lâu không thao tác: robot ngủ')
  assert(await until(async () => page.locator('.zzz.on').isVisible(), 1500), 'robot ngủ: hiện "Zzz"')
  await page.screenshot({ path: join(OUT, '11-robot-sleep.png') })
  const s0 = await num('window.__deskbuddy.renderStats.frames')
  await page.waitForTimeout(1500)
  assert((await num('window.__deskbuddy.renderStats.frames')) === s0, 'robot ngủ: cảnh không vẽ khung nào')
  await page.mouse.move(vp.width / 2, vp.height - 20, { steps: 4 })
  assert(await until(async () => ['startled', 'idle'].includes(String(await page.evaluate('window.__deskbuddy.robot.mode'))), 1500), 'di chuột: robot tỉnh dậy')

  // Mất WebGL không phục hồi: chuyển sang giao diện 2D, chữ đang gõ dở vẫn còn
  await page.locator('.quick-add-input').click()
  await page.keyboard.type('Nháp chưa lưu')
  await page.evaluate('window.__deskbuddy.loseContext()')
  assert(await until(async () => (await probe(page, (p) => p.renderMode)) === '2d', 5000), 'mất WebGL: tự chuyển sang giao diện 2D')
  assert((await page.locator('.quick-add-input').inputValue()) === 'Nháp chưa lưu', 'chuyển sang 2D: chữ đang gõ dở không mất')
  await invoke(page, 'settings:update', { quality: 'balanced' })
}

async function main(): Promise<void> {
  // Chống treo (vd. hộp thoại chờ người bấm): quá 5 phút thì báo lỗi, đóng app và thoát
  setTimeout(() => {
    const msg = `Kiểm thử bị treo quá 5 phút. Đã qua ${passed.length} bước, bước cuối: ${passed[passed.length - 1] ?? '(chưa có)'}`
    console.error(msg)
    annotate('error', `E2E ${process.platform} bị treo`, msg)
    appRef?.process().kill()
    process.exit(1)
  }, 5 * 60_000).unref()
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
  await until(async () => (await page.evaluate('window.__deskbuddy.env.anim === null')) === true, 3000)
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

  // ---- Máy không có WebGL: chế độ 2D ----
  ;({ app, page } = await launch({ DESKBUDDY_E2E_NO_WEBGL: '1' }))
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
