/**
 * Đo cảnh 3D: số lần vẽ (draw call), số tam giác, số chương trình shader — ngân sách: ≤ 70 draw call, < 60k tam giác.
 * Chạy: npm run build && npx tsx scripts/scene-stats.ts
 */
import { rmSync } from 'fs'
import { join, resolve } from 'path'
import { _electron as electron } from 'playwright-core'

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
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => (window as unknown as { __budkin: { theme: { getState(): { request(t: string): void } } } }).__budkin.theme.getState().request(t), theme)
    await page.waitForTimeout(1200)
    const stats = await page.evaluate(() => {
      const s = (window as unknown as { __budkin: { stage: { getR3F(): R3F } } }).__budkin.stage.getR3F()
      // Khung thường (bóng đổ không vẽ lại) và khung có vẽ lại bóng đổ (đổi cỡ cửa sổ)
      s.gl.render(s.scene, s.camera)
      const plain = { ...s.gl.info.render }
      ;(s.gl as unknown as { shadowMap: { needsUpdate: boolean } }).shadowMap.needsUpdate = true
      s.gl.render(s.scene, s.camera)
      return { calls: plain.calls, triangles: plain.triangles, shadowCalls: s.gl.info.render.calls, programs: s.gl.info.programs?.length ?? 0 }
    })
    console.log(`${theme}: ${stats.calls} draw call (${stats.shadowCalls} khi vẽ lại bóng đổ), ${stats.triangles} tam giác, ${stats.programs} shader`)
  }
  await app.evaluate(({ app: a }) => a.exit(0))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
