import { join } from 'path'
import { pathToFileURL } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { BrowserWindow, Menu, app, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { AppInfo, EventMap } from '../shared/api'
import { bootArg, normalizeBoot, type BootPrefs } from '../shared/boot'
import { APP_ID, APP_NAME, DEFAULT_WINDOW, MIN_WINDOW } from '../shared/constants'
import { WINDOW_BG, type Theme } from '../shared/palette'
import { readBootFile, writeBootFile } from './boot'
import { applyGraphicsSwitches } from './gpu'
import { registerAll } from './ipc'

/** Kiểm thử tự động: cửa sổ hiện mà không giành focus, thư mục dữ liệu riêng */
const TEST = process.env.DESKBUDDY_TEST === '1'
if (process.env.DESKBUDDY_USER_DATA) app.setPath('userData', process.env.DESKBUDDY_USER_DATA)

const bootFile = join(app.getPath('userData'), 'boot.json')
const storedBoot = readBootFile(bootFile)
let boot: BootPrefs = normalizeBoot(storedBoot)
applyGraphicsSwitches(boot)

let mainWindow: BrowserWindow | null = null

function send<K extends keyof EventMap>(channel: K, data: EventMap[K]): void {
  mainWindow?.webContents.send(channel, data)
}

function saveBoot(patch: Partial<BootPrefs>): void {
  boot = { ...boot, ...patch }
  try {
    writeBootFile(bootFile, boot)
  } catch (err) {
    console.error('Không lưu được boot.json', err)
  }
}

function sqliteVersion(): string {
  const db = new DatabaseSync(':memory:')
  try {
    return (db.prepare('select sqlite_version() as v').get() as { v: string }).v
  } finally {
    db.close()
  }
}

/** Trang renderer đã đóng gói; IPC chỉ nhận từ đúng trang này (không phải trang lạ lỡ bị nạp vào cửa sổ) */
const RENDERER_URL = pathToFileURL(join(__dirname, '../renderer/index.html')).href

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  if (!url) return false
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl && !app.isPackaged) return new URL(url).origin === new URL(devUrl).origin
  return url.split(/[?#]/)[0] === RENDERER_URL
}

/** Theme của cửa sổ: thanh tiêu đề, hộp thoại hệ thống và màu nền trước khi trang vẽ */
function applyTheme(theme: Theme): void {
  nativeTheme.themeSource = theme
  mainWindow?.setBackgroundColor(WINDOW_BG[theme])
}

function registerIpc(): void {
  registerAll(
    {
      'app:info': {
        args: z.tuple([]),
        run: (): AppInfo => ({
          version: app.getVersion(),
          platform: process.platform,
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          sqlite: sqliteVersion(),
          gpu: Object.fromEntries(Object.entries(app.getGPUFeatureStatus()).map(([k, v]) => [k, String(v)])),
          test: TEST
        })
      },
      'app:setTheme': {
        args: z.tuple([z.enum(['light', 'dark'])]),
        run: (theme) => {
          saveBoot({ theme })
          applyTheme(theme)
          send('theme:changed', theme)
        }
      }
    },
    isTrustedSender
  )
}

function createWindow(): void {
  const win = (mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW.width,
    height: DEFAULT_WINDOW.height,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    show: false,
    backgroundColor: WINDOW_BG[boot.theme],
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Kiểm thử chế độ 2D: giả lập máy không có WebGL (cờ --disable-webgl không tới được renderer)
      webgl: !(TEST && process.env.DESKBUDDY_E2E_NO_WEBGL === '1'),
      // Theme, chế độ render… cho preload đọc ngay, trước lần vẽ đầu tiên (không chớp màn hình)
      additionalArguments: [bootArg({ ...boot, platform: process.platform, test: TEST })]
    }
  }))
  win.once('ready-to-show', () => (TEST ? win.showInactive() : win.show()))
  win.on('closed', () => (mainWindow = null))

  // Link ngoài mở bằng trình duyệt, không mở cửa sổ mới trong app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Cửa sổ app không bao giờ rời trang của mình (vd. lỡ thả một đường link vào cửa sổ)
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  // Mở app lần nữa: đưa cửa sổ đang có lên trước
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
    // Lần đầu mở app: theme theo hệ điều hành
    if (storedBoot === null) saveBoot({ theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' })
    nativeTheme.themeSource = boot.theme
    Menu.setApplicationMenu(null)
    registerIpc()
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
