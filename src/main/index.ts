import { join } from 'path'
import { pathToFileURL } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { BrowserWindow, Menu, app, dialog, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { AppInfo, EventMap } from '../shared/api'
import { bootArg, normalizeBoot, type BootPrefs } from '../shared/boot'
import { APP_ID, APP_NAME, DEFAULT_WINDOW, MIN_WINDOW } from '../shared/constants'
import { setLang, tr } from '../shared/i18n'
import { WINDOW_BG, type Theme } from '../shared/palette'
import type { Settings } from '../shared/types'
import { readBootFile, writeBootFile } from './boot'
import { TestClock, systemClock, type Clock } from './clock'
import { Db } from './db/connection'
import { NewerDatabaseError, migrate } from './db/migrations'
import { applyGraphicsSwitches } from './gpu'
import { dataHandlers } from './handlers'
import { registerAll } from './ipc'
import { DataService } from './services/data'

/** Kiểm thử tự động: cửa sổ hiện mà không giành focus, thư mục dữ liệu riêng, đồng hồ đẩy tới được */
const TEST = process.env.BUDKIN_TEST === '1'
if (process.env.BUDKIN_USER_DATA) app.setPath('userData', process.env.BUDKIN_USER_DATA)

const bootFile = join(app.getPath('userData'), 'boot.json')
const storedBoot = readBootFile(bootFile)
let boot: BootPrefs = normalizeBoot(storedBoot)
applyGraphicsSwitches(boot)

const clock: Clock = TEST ? new TestClock(Number(process.env.BUDKIN_CLOCK_OFFSET ?? 0)) : systemClock
let mainWindow: BrowserWindow | null = null
let db: Db | null = null
let data: DataService

function send<K extends keyof EventMap>(channel: K, payload: EventMap[K]): void {
  mainWindow?.webContents.send(channel, payload)
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
  const mem = new DatabaseSync(':memory:')
  try {
    return (mem.prepare('select sqlite_version() as v').get() as { v: string }).v
  } finally {
    mem.close()
  }
}

/** Mở DB, nâng cấp schema. Lỗi thì báo và thoát (không bao giờ ghi đè dữ liệu người dùng) */
function openData(): boolean {
  const dir = app.getPath('userData')
  try {
    db = new Db(join(dir, 'budkin.db'))
    migrate(db, join(dir, 'backups'))
  } catch (err) {
    const detail = err instanceof NewerDatabaseError ? tr('Dữ liệu được tạo bởi phiên bản Budkin mới hơn. Hãy cài bản mới nhất.') : String(err)
    dialog.showErrorBox(tr('Không mở được dữ liệu'), detail)
    return false
  }
  data = new DataService(db, clock, (changes, reason) => send('data:changed', { changes, reason }))
  setLang(data.getSettings().language)
  return true
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

/** Màu nền cửa sổ trước khi trang vẽ. Thanh tiêu đề, hộp thoại hệ thống luôn tối: cả hai theme của app đều nền tối */
function applyTheme(theme: Theme): void {
  nativeTheme.themeSource = 'dark'
  mainWindow?.setBackgroundColor(WINDOW_BG[theme])
}

function onSettingsChanged(settings: Settings): void {
  setLang(settings.language)
  send('settings:changed', settings)
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
      },
      'app:sceneHealthy': {
        args: z.tuple([]),
        run: () => {
          if (boot.gpuCrashes > 0) saveBoot({ gpuCrashes: 0 })
        }
      },
      ...dataHandlers(data, onSettingsChanged)
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
      webgl: !(TEST && process.env.BUDKIN_E2E_NO_WEBGL === '1'),
      // Robot kêu, chuông nhắc việc phát được cả khi người dùng chưa bấm gì
      autoplayPolicy: 'no-user-gesture-required',
      // Theme, ngôn ngữ, chế độ render… cho preload đọc ngay, trước lần vẽ đầu tiên (không chớp màn hình)
      additionalArguments: [
        bootArg({
          ...boot,
          platform: process.platform,
          lang: data.getSettings().language,
          test: TEST,
          clockOffset: clock instanceof TestClock ? clock.offsetMs : 0
        })
      ]
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
    nativeTheme.themeSource = 'dark'
    Menu.setApplicationMenu(null)
    if (!openData()) {
      app.quit()
      return
    }
    registerIpc()
    if (TEST) (globalThis as unknown as { __budkin: unknown }).__budkin = { clock, data }
    createWindow()
  })

  // Tiến trình GPU chết (driver lỗi…): đếm lại, 2 lần liên tiếp thì lần mở sau dùng giao diện 2D
  app.on('child-process-gone', (_e, details) => {
    if (details.type === 'GPU' && details.reason !== 'clean-exit') saveBoot({ gpuCrashes: boot.gpuCrashes + 1 })
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    db?.close()
    db = null
  })
}
