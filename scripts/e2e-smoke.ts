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
import type { DeskApi } from '../src/shared/api'
import { SCREEN_BG } from '../src/shared/palette'

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
  }
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
  await page.waitForSelector('.screen-ui', { timeout: 20000 })
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
  await checkAlignment(page, `theme ${theme1}`, theme1)
  await page.screenshot({ path: join(OUT, `3-theme-${theme1}.png`) })
  await app.evaluate(({ app: a }) => a.exit(0))

  // ---- Mở lại: theme được nhớ ----
  ;({ app, page } = await launch())
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === theme1, `mở lại app vẫn giữ theme ${theme1}`)
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
