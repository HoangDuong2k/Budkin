/**
 * Sinh bộ icon từ SVG trong build/icon-src (vẽ bằng Chromium của Electron — không cần công cụ ảnh nào khác):
 *   build/icon.png (1024), build/icons/NxN.png (Linux), build/icon.ico (Windows: exe, bộ cài, lối tắt),
 *   resources/icon.png (icon cửa sổ trên Linux, icon thông báo), resources/tray/*.png (khay, thường / báo động).
 * Chạy: npm run icons   (máy không có màn hình: xvfb-run -a npm run icons)
 * Cỡ nhỏ (≤ 32 px) vẽ từ bản đơn giản app-small.svg: chi tiết của bản lớn thu nhỏ lại chỉ còn là vệt mờ.
 */
const { app, BrowserWindow } = require('electron')
const { mkdirSync, readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'build', 'icon-src')
const read = (name) => readFileSync(join(SRC, name), 'utf8')

/** Vẽ SVG ở đúng cỡ `size` px (nền trong suốt), trả về PNG */
async function render(win, svg, size) {
  win.setContentSize(size, size)
  const img = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}
    img{display:block;width:${size}px;height:${size}px}</style></head><body><img src="${img}"></body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  // Chờ ảnh giải mã xong và được vẽ lên khung hình
  await win.webContents.executeJavaScript(
    'document.querySelector("img").decode().then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))'
  )
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  const out = image.getSize().width === size ? image : image.resize({ width: size, height: size, quality: 'best' })
  return out.toPNG()
}

/** File .ico chứa nhiều ảnh PNG (Windows Vista trở lên đọc được PNG trong .ico) */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach(({ size, png }, i) => {
    const e = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, e)
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1)
    dir.writeUInt8(0, e + 2)
    dir.writeUInt8(0, e + 3)
    dir.writeUInt16LE(1, e + 4)
    dir.writeUInt16LE(32, e + 6)
    dir.writeUInt32LE(png.length, e + 8)
    dir.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...images.map((x) => x.png)])
}

async function main() {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    width: 256,
    height: 256,
    webPreferences: { offscreen: true }
  })
  const full = read('app.svg')
  const small = read('app-small.svg')
  const appIcon = (size) => render(win, size <= 32 ? small : full, size)

  mkdirSync(join(ROOT, 'build', 'icons'), { recursive: true })
  const cache = new Map()
  const png = async (size) => {
    if (!cache.has(size)) cache.set(size, await appIcon(size))
    return cache.get(size)
  }
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) writeFileSync(join(ROOT, 'build', 'icons', `${size}x${size}.png`), await png(size))
  writeFileSync(join(ROOT, 'build', 'icon.png'), await png(1024))
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  writeFileSync(join(ROOT, 'build', 'icon.ico'), ico(await Promise.all(icoSizes.map(async (size) => ({ size, png: await png(size) })))))
  writeFileSync(join(ROOT, 'resources', 'icon.png'), await png(256))

  mkdirSync(join(ROOT, 'resources', 'tray'), { recursive: true })
  for (const [name, file] of [
    ['tray', 'tray.svg'],
    ['tray-alert', 'tray-alert.svg']
  ]) {
    const svg = read(file)
    writeFileSync(join(ROOT, 'resources', 'tray', `${name}.png`), await render(win, svg, 32))
    writeFileSync(join(ROOT, 'resources', 'tray', `${name}@2x.png`), await render(win, svg, 64))
  }
  console.log('Đã sinh icon: build/icon.png, build/icon.ico, build/icons/, resources/icon.png, resources/tray/')
}

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
