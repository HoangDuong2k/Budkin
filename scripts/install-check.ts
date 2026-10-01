/**
 * Kiểm tra bản đã cài bằng bộ cài thật (CI chạy sau khi cài Setup.exe / .deb), những gì e2e không đụng tới:
 *   - mở với --quick-add (mục "Thêm việc nhanh" trên dock / thanh tác vụ): con trỏ nằm sẵn ở ô thêm việc
 *   - bật "Khởi động cùng máy": có mục thật trong hệ điều hành (Windows: registry Run; Linux: ~/.config/autostart),
 *     trỏ tới đúng file đã cài, kèm --hidden
 *   - dữ liệu nằm ở thư mục dữ liệu mặc định (để sau khi gỡ cài đặt kiểm tra dữ liệu vẫn còn)
 *   - kết nối AI (MCP): Budkin đang tắt mà app AI gọi tới thì cầu nối tự mở Budkin chạy nền rồi trả lời
 * Chạy: BUDKIN_E2E_EXE=<file đã cài> npm run install-check [-- --keep-autostart]
 *   --keep-autostart: để nguyên mục tự khởi động (Windows: kiểm tra bộ gỡ cài đặt có xoá không)
 */
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import type { AiStatus, McpLaunch } from '../src/shared/api'

const EXE = process.env.BUDKIN_E2E_EXE
const KEEP = process.argv.includes('--keep-autostart')
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const RUN_NAME = 'com.budkin.app'

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`KIỂM TRA THẤT BẠI: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

async function until(check: () => Promise<boolean> | boolean, timeout = 20_000): Promise<boolean> {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return check()
}

async function invoke(page: Page, channel: string, ...args: unknown[]): Promise<{ ok: boolean; value?: unknown; error?: unknown }> {
  return page.evaluate(
    ([c, a]) => (window as unknown as { api: { invoke(channel: string, ...args: unknown[]): Promise<{ ok: boolean }> } }).api.invoke(c, ...a),
    [channel, args] as const
  )
}

/** Mục tự khởi động mà hệ điều hành đang giữ (null: không có) */
function autostartEntry(): string | null {
  if (process.platform === 'win32') {
    try {
      return execFileSync('reg', ['query', RUN_KEY, '/v', RUN_NAME], { encoding: 'utf8' })
    } catch {
      return null
    }
  }
  const file = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart', 'budkin.desktop')
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** Còn tiến trình nào của bản đã cài đang chạy không */
function installedRunning(exe: string): boolean {
  try {
    if (process.platform === 'win32') {
      const list = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${basename(exe)}`, '/NH'], { encoding: 'utf8' })
      return list.toLowerCase().includes(basename(exe).toLowerCase())
    }
    execFileSync('pgrep', ['-f', `^${exe}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Tắt mọi tiến trình của bản đã cài (Budkin do cầu nối mở chạy nền — không có cửa sổ để đóng) */
function killInstalled(exe: string): void {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/F', '/T', '/IM', basename(exe)], { stdio: 'ignore' })
    else execFileSync('pkill', ['-f', `^${exe}`], { stdio: 'ignore' })
  } catch {
    // Không còn tiến trình nào
  }
}

/** App AI (Claude Desktop…) chạy cầu nối khi Budkin đang tắt: danh sách công cụ có ngay, gọi công cụ thì Budkin được mở */
async function bridgeLaunchesApp(exe: string, launch: McpLaunch): Promise<void> {
  const client = new Client({ name: 'install-check', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: launch.command, args: launch.args, env: { ...process.env, ...launch.env } as Record<string, string> }))
  try {
    const { tools } = await client.listTools()
    assert(tools.length === 6, `cầu nối MCP của bản cài chạy được khi Budkin đang tắt (${tools.length} công cụ)`)
    const r = await client.callTool({ name: 'get_overview', arguments: {} }, undefined, { timeout: 90_000 })
    const text = (r.content as Array<{ text: string }>)[0]?.text ?? ''
    // Quyền mặc định là Tắt: câu trả lời này do chính Budkin (vừa được mở) gửi về
    assert(r.isError === true && /turned off/.test(text), `AI gọi tới: cầu nối tự mở Budkin chạy nền và Budkin trả lời (${text.slice(0, 60)}…)`)
  } finally {
    await client.close().catch(() => undefined)
    killInstalled(exe)
  }
}

async function main(): Promise<void> {
  if (!EXE) throw new Error('Cần BUDKIN_E2E_EXE trỏ tới file đã cài')
  const exePath = EXE
  let launch: McpLaunch | null = null
  const app: ElectronApplication = await electron.launch({
    executablePath: exePath,
    args: ['--quick-add', ...(process.platform === 'linux' && !process.env.BUDKIN_E2E_SANDBOX ? ['--no-sandbox'] : [])],
    // Chế độ kiểm thử (cửa sổ không giành focus, không tạo khay) nhưng dùng thư mục dữ liệu mặc định như người dùng thật
    env: { ...process.env, BUDKIN_TEST: '1', BUDKIN_USER_DATA: '' } as Record<string, string>
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.screen-app', { timeout: 30_000 })
    assert(
      await until(() => page.evaluate(() => document.activeElement?.classList.contains('quick-add-input') ?? false)),
      'mở với --quick-add: con trỏ nằm sẵn ở ô thêm việc'
    )
    const info = (await invoke(page, 'app:info')) as { ok: boolean; value: { version: string } }
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
    assert(info.ok && info.value.version === pkg.version, `bản đã cài đúng phiên bản ${pkg.version}`)
    const dataDir = await app.evaluate(({ app: a }) => a.getPath('userData'))
    const created = await invoke(page, 'tasks:create', { title: 'Việc tạo lúc kiểm tra bản cài' })
    assert(created.ok && existsSync(join(dataDir, 'budkin.db')), `dữ liệu ghi vào thư mục mặc định (${dataDir})`)
    const ai = (await invoke(page, 'ai:status')) as { ok: boolean; value: AiStatus }
    launch = ai.value.launch
    assert(ai.ok && launch.command.toLowerCase() === exePath.toLowerCase(), `cầu nối MCP chạy bằng chính file đã cài (${launch.args[0]})`)

    assert((await invoke(page, 'settings:update', { autostart: true })).ok, 'bật "Khởi động cùng máy"')
    assert(await until(() => autostartEntry() !== null, 5000), 'hệ điều hành có mục tự khởi động')
    const entry = autostartEntry() ?? ''
    // Windows ghi đường dẫn exe trong ngoặc kép, Linux ghi dòng Exec= của file .desktop
    assert(entry.toLowerCase().includes(exePath.toLowerCase()) && entry.includes('--hidden'), `mục tự khởi động trỏ đúng ${exePath} --hidden`)
    if (!KEEP) {
      assert((await invoke(page, 'settings:update', { autostart: false })).ok, 'tắt "Khởi động cùng máy"')
      assert(await until(() => autostartEntry() === null, 5000), 'mục tự khởi động đã được xoá')
    }
  } finally {
    await app.evaluate(({ app: a }) => a.exit(0)).catch(() => undefined)
  }
  // Chờ Budkin vừa đóng thoát hẳn rồi thử như app AI gọi tới
  await until(() => !installedRunning(exePath), 15_000)
  if (launch) await bridgeLaunchesApp(exePath, launch)
  console.log('\nBẢN ĐÃ CÀI: KIỂM TRA ĐỀU QUA')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
