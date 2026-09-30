/**
 * Đo CPU / bộ nhớ khi app để yên — Budkin mở cả ngày nên lúc không ai đụng tới phải gần như không tốn gì.
 * Chạy: npm run build && npm run perf:idle
 *   -- --quality high|balanced|saver   mức chất lượng 3D (mặc định balanced)
 *   -- --soak 120                      chạy thêm 120 phút, mỗi phút ghi bộ nhớ (tìm rò rỉ), 10 phút thao tác một lần
 *   -- --strict                        không đạt mục tiêu thì thoát với mã lỗi
 * Máy không có GPU: BUDKIN_E2E_SWIFTSHADER=1 (WebGL vẽ bằng CPU — app tự về mức Tiết kiệm)
 *
 * Chạy app như người dùng thật (không bật chế độ kiểm thử): robot buồn ngủ sau 2 phút không thao tác, ngủ sau 1 phút
 * nữa. Các giai đoạn đo tính từ lần di chuột cuối:
 *   1. 5–28 s   chuyển động nền (Cân bằng: 10 khung/giây trong 30 giây sau thao tác)
 *   2. 35–115 s đứng yên, robot thức (chỉ còn chớp mắt)
 *   3. 185–240 s vừa ngủ (cảnh không vẽ khung nào; "Zzz" hiện từng chữ trong phút đầu)
 *   4. 250–310 s ngủ lâu ("Zzz" đứng yên)
 *   5. cửa sổ ẩn (chạy nền dưới khay) 30 s
 */
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron, type CDPSession, type ElectronApplication, type Page } from 'playwright-core'

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'test-output', 'perf')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const QUALITY = (arg('quality') ?? 'balanced') as 'high' | 'balanced' | 'saver'
const SOAK_MIN = Number(arg('soak') ?? 0)
const STRICT = process.argv.includes('--strict')

interface Metric {
  type: string
  cpu: number
  wakeups: number
  /** KB */
  mem: number
}

interface Phase {
  label: string
  seconds: number
  /** % CPU (một lõi = 100%) và bộ nhớ (MB) theo loại tiến trình */
  byType: Record<string, { cpu: number; wakeups: number; memMb: number }>
  total: number
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function metrics(app: ElectronApplication): Promise<Metric[]> {
  return app.evaluate(({ app: a }) =>
    a.getAppMetrics().map((m) => ({ type: m.type, cpu: m.cpu.percentCPUUsage, wakeups: m.cpu.idleWakeupsPerSecond, mem: m.memory.workingSetSize }))
  )
}

function group(list: Metric[]): Phase['byType'] {
  const out: Phase['byType'] = {}
  for (const m of list) {
    const g = (out[m.type] ??= { cpu: 0, wakeups: 0, memMb: 0 })
    g.cpu += m.cpu
    g.wakeups += m.wakeups
    g.memMb += m.mem / 1024
  }
  return out
}

/** % CPU trung bình trong `seconds` giây: gọi getAppMetrics() một lần để đặt mốc, lần sau trả về mức dùng từ mốc đó */
async function measure(app: ElectronApplication, label: string, seconds: number): Promise<Phase> {
  await metrics(app)
  await sleep(seconds * 1000)
  const byType = group(await metrics(app))
  const total = Object.values(byType).reduce((s, g) => s + g.cpu, 0)
  const phase = { label, seconds, byType, total }
  const cells = Object.entries(byType)
    .map(([t, g]) => `${t} ${g.cpu.toFixed(2)}% (${g.memMb.toFixed(0)} MB)`)
    .join(' · ')
  console.log(`  ${label.padEnd(30)} tổng ${total.toFixed(2).padStart(6)}%   ${cells}`)
  return phase
}

async function launch(userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = process.env.BUDKIN_E2E_EXE
  const app = await electron.launch({
    executablePath: exe ?? (require('electron') as unknown as string),
    args: [
      ...(exe ? [] : [ROOT]),
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      ...(process.env.BUDKIN_E2E_SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : [])
    ],
    env: { ...process.env, BUDKIN_USER_DATA: userData } as Record<string, string>
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.screen-app', { timeout: 30_000 })
  return { app, page }
}

async function invoke(page: Page, channel: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    ([c, a]) => (window as unknown as { api: { invoke(channel: string, ...args: unknown[]): Promise<unknown> } }).api.invoke(c, ...a),
    [channel, args] as const
  )
}

/** Heap JS của renderer sau khi ép gom rác (MB) — tăng mãi mới là rò rỉ; RSS còn gồm bộ đệm của Chromium */
async function heapMb(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number }
  return Math.round((usedSize / 1024 / 1024) * 10) / 10
}

/** Một thao tác như người dùng: rê chuột qua cảnh (robot tỉnh, nhìn theo) */
async function nudge(page: Page): Promise<void> {
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await page.mouse.move(vp.w * 0.3, vp.h * 0.5, { steps: 6 })
  await page.mouse.move(vp.w * 0.7, vp.h * 0.4, { steps: 6 })
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const userData = join(OUT, 'userdata')
  const { app, page } = await launch(userData)
  console.log(`Đo khi để yên — chất lượng ${QUALITY}${process.env.BUDKIN_E2E_SWIFTSHADER ? ', WebGL vẽ bằng CPU (SwiftShader)' : ''}`)

  // Dữ liệu như một người dùng bình thường: vài chục việc, có hạn, có nhắc
  await invoke(page, 'settings:update', { quality: QUALITY, closeToTray: false })
  const today = new Date()
  for (let i = 0; i < 40; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (i % 14) - 3)
    const dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await invoke(page, 'tasks:create', { title: `Việc mẫu số ${i + 1}`, dueDate: i % 5 ? dueDate : null, status: i % 7 === 0 ? 'done' : 'todo' })
  }
  await sleep(3000)

  const phases: Phase[] = []
  await nudge(page)
  const t0 = Date.now()
  const at = (s: number): Promise<void> => sleep(Math.max(0, t0 + s * 1000 - Date.now()))
  await at(5)
  phases.push(await measure(app, 'chuyển động nền (≤30 s)', 23))
  await at(35)
  phases.push(await measure(app, 'đứng yên, robot thức', 80))
  await at(185)
  phases.push(await measure(app, 'vừa ngủ ("Zzz" hiện từng chữ)', 55))
  await at(250)
  phases.push(await measure(app, 'ngủ lâu', 60))
  // Ẩn cửa sổ như lúc chạy nền dưới khay (xvfb không có trình quản lý cửa sổ nên thu nhỏ không có tác dụng)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
  await sleep(2000)
  phases.push(await measure(app, 'cửa sổ ẩn (chạy nền)', 30))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show())

  // Mục tiêu (kế hoạch M7): rảnh ở mức Cân bằng — renderer < 2%, GPU < 3%; robot ngủ / cửa sổ ẩn — gần 0
  const cpu = (p: Phase, type: string): number => p.byType[type]?.cpu ?? 0
  const both = (p: Phase): number => cpu(p, 'Tab') + cpu(p, 'GPU')
  const checks: Array<[string, boolean]> = [
    [`đứng yên: renderer ${cpu(phases[1], 'Tab').toFixed(2)}% < 2%`, cpu(phases[1], 'Tab') < 2],
    [`đứng yên: GPU ${cpu(phases[1], 'GPU').toFixed(2)}% < 3%`, cpu(phases[1], 'GPU') < 3],
    [`vừa ngủ: renderer + GPU ${both(phases[2]).toFixed(2)}% < 2%`, both(phases[2]) < 2],
    [`ngủ lâu: renderer + GPU ${both(phases[3]).toFixed(2)}% < 0,5%`, both(phases[3]) < 0.5],
    [`cửa sổ ẩn: renderer + GPU ${both(phases[4]).toFixed(2)}% < 0,5%`, both(phases[4]) < 0.5]
  ]
  console.log('')
  for (const [text, ok] of checks) console.log(`  ${ok ? '✓' : '✗'} ${text}`)

  // Chạy dài: bộ nhớ có tăng dần không (rò rỉ)
  const soak: Array<{ minute: number; memMb: Record<string, number>; heapMb?: number }> = []
  if (SOAK_MIN > 0) {
    console.log(`\nChạy dài ${SOAK_MIN} phút (mỗi phút ghi bộ nhớ, 10 phút thao tác một lần)…`)
    const cdp = await page.context().newCDPSession(page)
    const heap0 = await heapMb(cdp)
    console.log(`  heap JS renderer lúc đầu (sau khi gom rác): ${heap0} MB`)
    let heapLast = heap0
    for (let m = 1; m <= SOAK_MIN; m++) {
      await sleep(60_000)
      // Thao tác ở phút 5, 15, 25…; đo ở phút 10, 20, 30… (robot đã ngủ lại, đối tượng tạm đã được gom)
      if (m % 10 === 5) {
        await nudge(page)
        const t = (await invoke(page, 'tasks:create', { title: `Việc lúc chạy dài ${m}` })) as { ok: boolean; value: { id: string } }
        if (t.ok) await invoke(page, 'tasks:setStatus', t.value.id, 'done')
      }
      const memMb = Object.fromEntries(Object.entries(group(await metrics(app))).map(([k, g]) => [k, Math.round(g.memMb)]))
      const report = m % 10 === 0 || m === SOAK_MIN
      if (report) heapLast = await heapMb(cdp)
      soak.push({ minute: m, memMb, ...(report ? { heapMb: heapLast } : {}) })
      if (report) console.log(`  phút ${String(m).padStart(3)}: ${Object.entries(memMb).map(([k, v]) => `${k} ${v} MB`).join(' · ')} · heap JS ${heapLast} MB`)
    }
    const heapGrow = Math.round((heapLast - heap0) * 10) / 10
    checks.push([`chạy dài: heap JS renderer ${heap0} → ${heapLast} MB (tăng ${heapGrow} MB < 5 MB)`, heapGrow < 5])
    console.log(`  ${heapGrow < 5 ? '✓' : '✗'} ${checks[checks.length - 1][0]}`)
    const first = soak[0].memMb
    const last = soak[soak.length - 1].memMb
    for (const type of Object.keys(last)) {
      const grow = last[type] - (first[type] ?? last[type])
      const ok = grow < 50
      checks.push([`chạy dài: bộ nhớ ${type} ${first[type] ?? '?'} → ${last[type]} MB (tăng ${grow} MB < 50 MB)`, ok])
      console.log(`  ${ok ? '✓' : '✗'} ${checks[checks.length - 1][0]}`)
    }
  }

  writeFileSync(join(OUT, 'perf-idle.json'), JSON.stringify({ quality: QUALITY, software: !!process.env.BUDKIN_E2E_SWIFTSHADER, phases, soak, checks }, null, 2))
  await app.evaluate(({ app: a }) => a.exit(0))
  const failed = checks.filter(([, ok]) => !ok)
  console.log(failed.length ? `\n${failed.length} mục chưa đạt mục tiêu` : '\nĐẠT MỌI MỤC TIÊU')
  if (STRICT && failed.length) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
