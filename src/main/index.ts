import { mkdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import { pathToFileURL } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { BrowserWindow, Menu, app, dialog, nativeTheme, powerMonitor, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { AlertsSnapshot, AppInfo, AppStatus, EventMap, ExportResult, NavigateTarget } from '../shared/api'
import { bootArg, normalizeBoot, type BootPrefs } from '../shared/boot'
import { APP_ID, APP_NAME, DEFAULT_WINDOW, MIN_WINDOW } from '../shared/constants'
import { localDateOf } from '../shared/datetime'
import { EXPORT_MAX_BYTES, liveCounts, parseExportFile, type ExportFile, type ImportPreview } from '../shared/exportFormat'
import { setLang, tr, trKey } from '../shared/i18n'
import { WINDOW_BG, type Theme } from '../shared/palette'
import { idSchema, minutesSchema } from '../shared/schemas'
import type { Settings } from '../shared/types'
import { readBootFile, writeBootFile } from './boot'
import { TestClock, systemClock, type Clock } from './clock'
import { Db } from './db/connection'
import { NewerDatabaseError, migrate } from './db/migrations'
import { applyGraphicsSwitches } from './gpu'
import { AppError } from './errors'
import { writeFileAtomicSync } from './fsutil'
import { dataHandlers } from './handlers'
import { registerAll } from './ipc'
import { HIDDEN_ARG, isAutostartOn, setAutostart } from './os/autostart'
import { appIcon } from './os/icon'
import { AppTray, hasTrayHost } from './os/tray'
import { Notifier, canFlash } from './reminders/notifier'
import { ReminderService } from './reminders/service'
import { BackupService, applyPendingRestore } from './services/backup'
import { DataService } from './services/data'
import { exportData, importData } from './services/transfer'

/** Kiểm thử tự động: cửa sổ hiện mà không giành focus, thư mục dữ liệu riêng, đồng hồ đẩy tới được */
const TEST = process.env.BUDKIN_TEST === '1'
if (process.env.BUDKIN_USER_DATA) app.setPath('userData', process.env.BUDKIN_USER_DATA)

const bootFile = join(app.getPath('userData'), 'boot.json')
const storedBoot = readBootFile(bootFile)
let boot: BootPrefs = normalizeBoot(storedBoot)
applyGraphicsSwitches(boot)
/** Chế độ vẽ / XWayland của lần chạy này (đổi trong Cài đặt thì lần mở sau mới có hiệu lực) */
const runningBoot = { render: boot.render, xwayland: boot.xwayland }

const clock: Clock = TEST ? new TestClock(Number(process.env.BUDKIN_CLOCK_OFFSET ?? 0)) : systemClock
let mainWindow: BrowserWindow | null = null
let db: Db | null = null
let data: DataService
let reminders: ReminderService | null = null
let notifier: Notifier
let tray: AppTray | null = null
/** Máy có khay hệ thống (GNOME cần tiện ích AppIndicator) */
let trayHost = false
let alerts: AlertsSnapshot = { active: [], mutedUntil: null, nextAt: null }
let backups: BackupService
/** Lần mở này vừa khôi phục từ bản sao lưu nào */
let restoredFrom: string | null = null
/** File đã chọn để nhập, chờ người dùng chọn Gộp / Thay thế */
let pendingImport: { token: string; file: ExportFile } | null = null
/** Đang thoát thật (không phải bấm nút đóng để ẩn xuống khay) */
let quitting = false
/** Tự khởi động cùng máy: chạy ẩn dưới khay */
const startHidden = process.argv.includes(HIDDEN_ARG)

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

/** File đánh dấu "lần mở sau khôi phục bản sao lưu này" */
const restoreMarker = (): string => join(app.getPath('userData'), 'restore.json')

/** Mở DB (trước đó khôi phục bản sao lưu nếu có hẹn), nâng cấp schema. Lỗi thì báo và thoát (không ghi đè dữ liệu) */
function openData(): boolean {
  const dir = app.getPath('userData')
  const file = join(dir, 'budkin.db')
  try {
    restoredFrom = applyPendingRestore({ marker: restoreMarker(), db: file, backups: join(dir, 'backups') }, clock.now())
  } catch (err) {
    console.error('[khôi phục] lỗi, mở dữ liệu đang có', err)
  }
  try {
    db = new Db(file)
    migrate(db, join(dir, 'backups'))
  } catch (err) {
    const detail = err instanceof NewerDatabaseError ? tr('Dữ liệu được tạo bởi phiên bản Budkin mới hơn. Hãy cài bản mới nhất.') : String(err)
    dialog.showErrorBox(tr('Không mở được dữ liệu'), detail)
    return false
  }
  data = new DataService(db, clock, (changes, reason) => {
    send('data:changed', { changes, reason })
    // Sửa hạn, hoàn thành, xoá task…: nhắc việc tính lại, số việc trên khay đổi
    reminders?.poke()
    refreshTray()
  })
  backups = new BackupService(db, join(dir, 'backups'), clock)
  setLang(data.getSettings().language)
  return true
}

/** Sao lưu hằng ngày: ngay sau khi mở app (để app khởi động nhanh thì chờ một chút) rồi kiểm tra mỗi giờ */
function scheduleBackups(): void {
  const daily = (): void => {
    try {
      backups.runDaily()
    } catch (err) {
      console.error('[sao lưu]', err)
    }
  }
  setTimeout(daily, TEST ? 0 : 20_000).unref()
  setInterval(daily, 3600_000).unref()
}

/** Khởi động lại app (áp dụng chế độ vẽ mới, khôi phục bản sao lưu). Kiểm thử: chỉ thoát — script tự mở lại */
function relaunch(): void {
  if (!TEST) {
    const args = process.argv.slice(1).filter((a) => a !== HIDDEN_ARG)
    // AppImage chạy từ thư mục mount tạm (mất khi thoát): mở lại bằng chính file .AppImage
    app.relaunch(process.env.APPIMAGE ? { execPath: process.env.APPIMAGE, args } : { args })
  }
  quit()
}

function appStatus(): AppStatus {
  return {
    packaged: app.isPackaged,
    trayHost,
    wayland: process.platform === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY),
    boot: { render: boot.render, xwayland: boot.xwayland },
    running: runningBoot,
    dataDir: app.getPath('userData'),
    restoredFrom
  }
}

const IMPORT_ERRORS = {
  'not-json': trKey('File không phải định dạng JSON.'),
  'not-budkin': trKey('File này không phải dữ liệu xuất từ Budkin.'),
  newer: trKey('File được tạo bởi phiên bản Budkin mới hơn. Hãy cập nhật app rồi nhập lại.'),
  invalid: trKey('File dữ liệu bị hỏng hoặc đã bị sửa tay ({detail}).'),
  duplicate: trKey('File dữ liệu bị hỏng hoặc đã bị sửa tay ({detail}).')
} as const

async function exportToFile(): Promise<ExportResult | null> {
  const opts = {
    title: tr('Xuất dữ liệu'),
    defaultPath: join(app.getPath('documents'), `budkin-${localDateOf(clock.now())}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  const res = mainWindow ? await dialog.showSaveDialog(mainWindow, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return null
  const file = exportData(db!, data.getSettings(), clock.now(), app.getVersion())
  writeFileAtomicSync(res.filePath, JSON.stringify(file, null, 2))
  return { path: res.filePath, counts: liveCounts(file) }
}

async function pickImport(): Promise<ImportPreview | null> {
  const opts = {
    title: tr('Nhập dữ liệu'),
    properties: ['openFile' as const],
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: tr('Mọi file'), extensions: ['*'] }
    ]
  }
  const res = mainWindow ? await dialog.showOpenDialog(mainWindow, opts) : await dialog.showOpenDialog(opts)
  const path = res.filePaths[0]
  if (res.canceled || !path) return null
  if (statSync(path).size > EXPORT_MAX_BYTES) throw new AppError('VALIDATION', tr('File quá lớn, không phải dữ liệu Budkin.'))
  const parsed = parseExportFile(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  if (!parsed.ok) throw new AppError('VALIDATION', tr(IMPORT_ERRORS[parsed.error], { detail: parsed.detail ?? '' }))
  pendingImport = { token: crypto.randomUUID(), file: parsed.file }
  return importPreview(pendingImport.token, parsed.file, basename(path))
}

function importPreview(token: string, file: ExportFile, fileName: string): ImportPreview {
  return { token, fileName, exportedAt: file.exportedAt, appVersion: file.appVersion ?? null, counts: liveCounts(file) }
}

/** Việc chưa xong đến hạn hôm nay hoặc đã quá hạn (số trên khay) */
function dueCount(): number {
  return (
    db?.get<{ n: number }>(
      "SELECT count(*) AS n FROM tasks WHERE deleted_at IS NULL AND status != 'done' AND due_date IS NOT NULL AND due_date <= ?",
      localDateOf(clock.now())
    )?.n ?? 0
  )
}

function refreshTray(): void {
  tray?.update({ alert: alerts.active.length > 0, due: dueCount(), muted: alerts.mutedUntil !== null, autostart: isAutostartOn() })
}

function startReminders(): void {
  notifier = new Notifier({
    test: TEST,
    window: () => mainWindow,
    icon: () => appIcon(),
    open: (taskId) => showWindow(taskId ? { kind: 'task', taskId } : { kind: 'today' }),
    act: (taskId, action) => {
      try {
        if (action === 'snooze') reminders?.snooze(taskId, 10)
        else data.setStatus(taskId, 'done')
      } catch (err) {
        console.error('[nhắc việc]', err)
      }
    }
  })
  reminders = new ReminderService(db!, clock, {
    allDayTime: () => data.getSettings().allDayRemindTime,
    notify: (items) => notifier.notify(items, clock.now()),
    fired: (items, snoozed) => send('reminder:fired', { items, snoozed }),
    changed: (snapshot) => {
      alerts = snapshot
      send('alerts:changed', snapshot)
      refreshTray()
    }
  })
  // Vừa khôi phục bản sao lưu: nhắc việc cũ trong bản đó coi như đã báo
  if (restoredFrom) reminders.absorb(null)
  reminders.start()
  // Máy vừa thức dậy / mở khoá: nhắc những việc tới giờ trong lúc ngủ
  powerMonitor.on('resume', () => reminders?.poke())
  powerMonitor.on('unlock-screen', () => reminders?.poke())
  // Qua nửa đêm: số việc hôm nay trên khay đổi
  setInterval(refreshTray, 60_000).unref()
}

/** Đưa cửa sổ lên trước (bấm thông báo, menu khay, mở app lần nữa), rồi chuyển giao diện tới đích */
function showWindow(target?: NavigateTarget): void {
  const win = mainWindow
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (!target) return
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => send('app:navigate', target))
  else send('app:navigate', target)
}

function quit(): void {
  quitting = true
  app.quit()
}

/** Bấm nút đóng mà chọn chạy nền: có khay thì ẩn xuống khay, không có khay thì thu nhỏ */
function toBackground(win: BrowserWindow): void {
  if (tray) win.hide()
  else win.minimize()
}

/** Lần đầu bấm đóng: hỏi chạy nền (vẫn nhắc việc) hay thoát hẳn, có ô "nhớ lựa chọn" */
async function askClose(win: BrowserWindow): Promise<void> {
  const { response, checkboxChecked } = await dialog.showMessageBox(win, {
    type: 'question',
    message: tray ? tr('Ẩn Budkin xuống khay hệ thống?') : tr('Thu nhỏ Budkin?'),
    detail: tray
      ? tr('Budkin vẫn chạy nền để nhắc việc đúng giờ. Muốn thoát hẳn thì chọn Thoát trên biểu tượng ở khay, hoặc nhấn Ctrl+Q.')
      : tr('Máy chưa có khay hệ thống (trên Ubuntu cần bật tiện ích AppIndicator). Budkin sẽ thu nhỏ để vẫn nhắc việc đúng giờ. Muốn thoát hẳn thì nhấn Ctrl+Q.'),
    buttons: [tray ? tr('Ẩn xuống khay') : tr('Thu nhỏ'), tr('Thoát hẳn'), tr('Huỷ')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    checkboxLabel: tr('Nhớ lựa chọn, không hỏi lại'),
    checkboxChecked: true
  })
  if (response === 2) return
  const background = response === 0
  if (checkboxChecked) onSettingsChanged(data.updateSettings({ closeToTray: background }))
  if (background) toBackground(win)
  else quit()
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

/** Windows: bấm chuột phải vào biểu tượng trên thanh tác vụ có mục "Thêm việc nhanh" (theo ngôn ngữ đang dùng) */
function setJumpList(): void {
  if (process.platform !== 'win32' || !app.isPackaged || TEST) return
  app.setUserTasks([
    {
      program: process.execPath,
      arguments: '--quick-add',
      iconPath: process.execPath,
      iconIndex: 0,
      title: tr('Thêm việc nhanh'),
      description: tr('Mở Budkin, con trỏ đặt sẵn ở ô thêm việc')
    }
  ])
}

function onSettingsChanged(settings: Settings): void {
  setLang(settings.language)
  setJumpList()
  send('settings:changed', settings)
  // Giờ nhắc task cả ngày có thể đã đổi; menu khay theo ngôn ngữ mới
  reminders?.poke()
  if (settings.autostart !== isAutostartOn()) {
    try {
      setAutostart(settings.autostart)
    } catch (err) {
      console.error('Không đặt được tự khởi động', err)
    }
  }
  refreshTray()
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
      'app:status': { args: z.tuple([]), run: () => appStatus() },
      'app:setBoot': {
        args: z.tuple([z.strictObject({ render: z.enum(['auto', '2d', 'software']).optional(), xwayland: z.boolean().optional() })]),
        run: (patch) => {
          saveBoot(patch)
          return appStatus()
        }
      },
      'app:relaunch': { args: z.tuple([]), run: () => void setTimeout(relaunch, 150) },
      ...dataHandlers(data, onSettingsChanged),
      'data:export': { args: z.tuple([]), run: () => exportToFile() },
      'data:importPick': { args: z.tuple([]), run: () => pickImport() },
      'data:importApply': {
        args: z.tuple([z.uuid(), z.enum(['merge', 'replace'])]),
        run: (token, mode) => {
          const pending = pendingImport
          if (!pending || pending.token !== token) throw new AppError('NOT_FOUND', tr('Hãy chọn lại file cần nhập.'))
          pendingImport = null
          // Sao lưu trước khi nhập: nhập nhầm thì khôi phục lại được
          const backup = backups.snapshot('before-import')
          const { result, taskIds } = importData(db!, clock, pending.file, mode, (patch) => data.updateSettings(patch))
          if (mode === 'replace') onSettingsChanged(data.getSettings())
          reminders?.absorb(mode === 'replace' ? null : taskIds)
          send('data:reload', mode)
          reminders?.poke()
          refreshTray()
          return { ...result, backup: backup.name }
        }
      },
      'data:backups': { args: z.tuple([]), run: () => backups.list() },
      'data:backupNow': { args: z.tuple([]), run: () => backups.snapshot('manual') },
      'data:restoreBackup': {
        args: z.tuple([z.string().min(1).max(120).regex(/^[\w.-]+$/)]),
        run: (name) => {
          backups.requestRestore(name, restoreMarker())
          setTimeout(relaunch, 250)
        }
      },
      'data:openFolder': {
        args: z.tuple([z.enum(['data', 'backups'])]),
        run: async (which) => {
          const dir = which === 'backups' ? backups.dir : app.getPath('userData')
          mkdirSync(dir, { recursive: true })
          // Kiểm thử: không mở trình quản lý file trên máy người chạy test
          if (!TEST) await shell.openPath(dir)
        }
      },
      'reminders:snapshot': { args: z.tuple([]), run: () => reminders!.run() },
      'reminders:snooze': { args: z.tuple([idSchema, minutesSchema]), run: (id, minutes) => reminders!.snooze(id, minutes) },
      'reminders:dismiss': { args: z.tuple([idSchema]), run: (id) => reminders!.dismiss(id) },
      'reminders:mute': { args: z.tuple([minutesSchema.nullable()]), run: (minutes) => reminders!.mute(minutes) }
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
    // Windows lấy icon từ file exe; Linux cần icon cho cửa sổ khi chưa có file .desktop (chạy thử, AppImage)
    ...(process.platform === 'linux' ? { icon: appIcon() } : {}),
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
  win.once('ready-to-show', () => {
    if (TEST) win.showInactive()
    // Tự khởi động cùng máy: chỉ nằm dưới khay; máy không có khay thì hiện thu nhỏ
    else if (!startHidden) win.show()
    else if (!tray) win.minimize()
  })
  win.on('closed', () => (mainWindow = null))
  if (canFlash) win.on('focus', () => win.flashFrame(false))
  // Bấm nút đóng: chạy nền để còn nhắc việc (lần đầu hỏi), trừ khi đã chọn thoát hẳn
  win.on('close', (e) => {
    if (quitting || TEST) return
    const choice = data.getSettings().closeToTray
    if (choice === false) return
    e.preventDefault()
    if (choice === true) toBackground(win)
    else void askClose(win)
  })

  // Link ngoài mở bằng trình duyệt, không mở cửa sổ mới trong app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Cửa sổ app không bao giờ rời trang của mình (vd. lỡ thả một đường link vào cửa sổ)
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    // Ctrl+Q: thoát hẳn (nút đóng chỉ ẩn xuống khay)
    if ((input.control || input.meta) && !input.shift && !input.alt && input.key.toLowerCase() === 'q') {
      e.preventDefault()
      quit()
    } else if (input.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools()
  })
  if (process.argv.includes('--quick-add')) win.webContents.once('did-finish-load', () => send('app:navigate', { kind: 'quickAdd' }))

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  // Mở app lần nữa (kể cả từ lối tắt "Thêm việc nhanh"): đưa cửa sổ đang có lên trước
  app.on('second-instance', (_e, argv) => showWindow(argv.includes('--quick-add') ? { kind: 'quickAdd' } : undefined))

  void app.whenReady().then(async () => {
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
    setJumpList()
    startReminders()
    // Khay: không tạo khi kiểm thử (khỏi hiện biểu tượng trên máy người chạy test)
    trayHost = !TEST && (await hasTrayHost())
    if (trayHost) {
      tray = new AppTray({
        show: () => showWindow(),
        quickAdd: () => showWindow({ kind: 'quickAdd' }),
        openToday: () => showWindow({ kind: 'today' }),
        setMuted: (muted) => reminders?.mute(muted ? 60 : null),
        setAutostart: (on) => onSettingsChanged(data.updateSettings({ autostart: on })),
        quit
      })
      tray.create()
      refreshTray()
    }
    if (TEST)
      (globalThis as unknown as { __budkin: unknown }).__budkin = {
        clock,
        db,
        data,
        reminders,
        backups,
        notifications: notifier.log,
        /** Đẩy đồng hồ tới `ms`: renderer nhận độ lệch mới, bộ nhắc việc kiểm tra lại ngay */
        advance: (ms: number) => {
          if (!(clock instanceof TestClock)) return
          clock.advance(ms)
          send('clock:offset', clock.offsetMs)
          reminders?.run()
        }
      }
    createWindow()
    scheduleBackups()
  })

  // Tiến trình GPU chết (driver lỗi…): đếm lại, 2 lần liên tiếp thì lần mở sau dùng giao diện 2D
  app.on('child-process-gone', (_e, details) => {
    if (details.type === 'GPU' && details.reason !== 'clean-exit') saveBoot({ gpuCrashes: boot.gpuCrashes + 1 })
  })

  app.on('before-quit', () => (quitting = true))
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    reminders?.stop()
    tray?.destroy()
    db?.close()
    db = null
  })
}
