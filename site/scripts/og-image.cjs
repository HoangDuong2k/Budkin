/**
 * Ảnh chia sẻ link của trang giới thiệu (Open Graph, 1200×630): site/public/og-vi.png, site/public/og-en.png.
 * Vẽ bằng Chromium của Electron (như scripts/icons.cjs): chữ lời giới thiệu bên trái, ảnh bàn làm việc lúc tắt đèn
 * (docs/screenshots/desk-night.png) bên phải. Chữ lấy từ phần mở đầu của trang (site/src/i18n/vi.ts, en.ts) — đổi
 * ở đó thì sửa cả ở đây rồi chạy lại.
 * Chạy (ở thư mục gốc, cần npm ci ở cả gốc lẫn site/): npx electron site/scripts/og-image.cjs
 *   (máy không có màn hình: xvfb-run -a npx electron site/scripts/og-image.cjs)
 */
const { app, BrowserWindow } = require('electron')
const { mkdirSync, rmSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')
const { pathToFileURL } = require('url')

const SITE = join(__dirname, '..')
const ROOT = join(SITE, '..')
const W = 1200
const H = 630

const PAGES = {
  vi: {
    eyebrow: 'Miễn phí · mã nguồn mở',
    title: 'Việc cần làm, đặt trên một bàn làm việc có robot canh giờ',
    footnote: 'Windows · macOS · Ubuntu'
  },
  en: {
    eyebrow: 'Free · open source',
    title: 'Your to-do list, on a desk with a robot keeping time',
    footnote: 'Windows · macOS · Ubuntu'
  }
}

const url = (...p) => pathToFileURL(join(...p)).href
const font = (name) => url(SITE, 'node_modules', '@fontsource', name)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function html(lang, t) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="${font('be-vietnam-pro/600.css')}">
<link rel="stylesheet" href="${font('be-vietnam-pro/700.css')}">
<link rel="stylesheet" href="${font('oswald/500.css')}">
<style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #121315; color: #e7e4de;
    font-family: 'Be Vietnam Pro', sans-serif; -webkit-font-smoothing: antialiased }
  .grid { position: absolute; inset: 0; background-size: 40px 40px;
    background-image: linear-gradient(rgba(231,228,222,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(231,228,222,.05) 1px, transparent 1px);
    -webkit-mask-image: radial-gradient(ellipse 70% 90% at 25% 50%, #000 30%, transparent 100%) }
  .glow { position: absolute; left: 560px; top: 40px; width: 760px; height: 600px;
    background: radial-gradient(ellipse at center, rgba(63,194,184,.24), transparent 62%) }
  .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 520px; display: flex; flex-direction: column; justify-content: center }
  .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 30px; letter-spacing: -.01em }
  .brand img { width: 48px; height: 48px }
  .eyebrow { margin-top: 40px; display: flex; align-items: center; gap: 10px; font-family: Oswald; font-weight: 500;
    font-size: 18px; letter-spacing: .14em; text-transform: uppercase; color: #d9a863 }
  .led { width: 8px; height: 8px; border-radius: 50%; background: #3fc2b8; box-shadow: 0 0 10px #3fc2b8 }
  h1 { margin: 16px 0 0; font-size: 46px; line-height: 1.14; font-weight: 700; letter-spacing: -.015em; text-wrap: balance }
  .foot { margin-top: 28px; font-size: 20px; font-weight: 600; color: #9e9b95 }
  .shot { position: absolute; left: 636px; top: 104px; width: 740px; border-radius: 16px; overflow: hidden;
    border: 1px solid rgba(231,228,222,.16); box-shadow: 0 30px 80px rgba(0,0,0,.65) }
  .shot img { display: block; width: 100% }
</style></head><body>
<div class="grid"></div><div class="glow"></div>
<div class="shot"><img src="${url(ROOT, 'docs', 'screenshots', 'desk-night.png')}"></div>
<div class="text">
  <div class="brand"><img src="${url(ROOT, 'build', 'icons', '128x128.png')}">Budkin</div>
  <div class="eyebrow"><span class="led"></span>${esc(t.eyebrow)}</div>
  <h1>${esc(t.title)}</h1>
  <div class="foot">${esc(t.footnote)}</div>
</div>
</body></html>`
}

async function main() {
  const win = new BrowserWindow({ show: false, frame: false, useContentSize: true, width: W, height: H, webPreferences: { offscreen: false } })
  const dir = join(tmpdir(), `budkin-og-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  try {
    for (const [lang, t] of Object.entries(PAGES)) {
      const file = join(dir, `${lang}.html`)
      writeFileSync(file, html(lang, t))
      await win.loadFile(file)
      // Chờ phông và ảnh tải xong rồi vẽ thêm hai khung
      await win.webContents.executeJavaScript(
        'document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode()))).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))'
      )
      const image = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H })
      const out = image.getSize().width === W ? image : image.resize({ width: W, height: H, quality: 'best' })
      const target = join(SITE, 'public', `og-${lang}.png`)
      mkdirSync(join(SITE, 'public'), { recursive: true })
      writeFileSync(target, out.toPNG())
      console.log(`  ✓ ${target}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Ảnh đúng 1200×630 dù màn hình đang phóng to (Windows 125 %…)
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()
app
  .whenReady()
  .then(main)
  .then(
    () => app.exit(0),
    (err) => {
      console.error(err)
      app.exit(1)
    }
  )
