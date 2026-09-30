/**
 * Đo cảnh 3D: số lần vẽ (draw call), số tam giác, số chương trình shader — ngân sách: ≤ 90 draw call, < 60k tam giác.
 * Đo với từng mẫu robot trên bệ. Chạy: npm run build && npm run stats:scene
 */
import { rmSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron } from 'playwright-core'
import { ROBOT_MODELS } from '../src/shared/robots'

const ROOT = resolve(__dirname, '..')
const USER_DATA = join(ROOT, 'test-output', 'stats-userdata')

interface R3F {
  gl: { info: { render: { calls: number; triangles: number }; programs: unknown[] | null }; render(s: unknown, c: unknown): void }
  scene: unknown
  camera: unknown
}

async function main(): Promise<void> {
  rmSync(USER_DATA, { recursive: true, force: true })
  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    args: [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, BUDKIN_TEST: '1', BUDKIN_USER_DATA: USER_DATA } as Record<string, string>
  })
  const page = await app.firstWindow()
  await page.waitForFunction(() => (window as unknown as { __budkin?: { stage: { ready: boolean } } }).__budkin?.stage.ready, undefined, { timeout: 20000 })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 860))
  await page.waitForTimeout(800)
  let worst = 0
  for (const [theme, robot] of [
    ['light', 'budkin'],
    ['dark', 'budkin'],
    ...ROBOT_MODELS.filter((r) => r !== 'budkin').map((r) => ['light', r])
  ] as const) {
    await page.evaluate((t) => (window as unknown as { __budkin: { theme: { getState(): { request(t: string): void } } } }).__budkin.theme.getState().request(t), theme)
    await page.evaluate((r) => (window as unknown as { api: { invoke(c: string, p: unknown): Promise<unknown> } }).api.invoke('settings:update', { robot: r }), robot)
    // Chờ robot cũ chìm, robot mới trồi lên xong
    await page.waitForTimeout(2200)
    const stats = await page.evaluate(() => {
      const s = (window as unknown as { __budkin: { stage: { getR3F(): R3F } } }).__budkin.stage.getR3F()
      // Khung thường (bóng đổ không vẽ lại) và khung có vẽ lại bóng đổ (đổi cỡ cửa sổ)
      s.gl.render(s.scene, s.camera)
      const plain = { ...s.gl.info.render }
      ;(s.gl as unknown as { shadowMap: { needsUpdate: boolean } }).shadowMap.needsUpdate = true
      s.gl.render(s.scene, s.camera)
      return { calls: plain.calls, triangles: plain.triangles, shadowCalls: s.gl.info.render.calls, programs: s.gl.info.programs?.length ?? 0 }
    })
    worst = Math.max(worst, stats.calls)
    console.log(`${theme} · ${robot}: ${stats.calls} draw call (${stats.shadowCalls} khi vẽ lại bóng đổ), ${stats.triangles} tam giác, ${stats.programs} shader`)
  }
  console.log(worst <= 90 ? `\nTrong ngân sách: nhiều nhất ${worst} ≤ 90 draw call` : `\nVƯỢT NGÂN SÁCH: ${worst} > 90 draw call`)
  await app.evaluate(({ app: a }) => a.exit(0))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
