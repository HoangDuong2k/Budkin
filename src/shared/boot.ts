// Thiết lập cần có ngay lúc khởi động, trước khi mở DB: theme (tránh chớp màn hình), chế độ render và cờ GPU.
// Lưu riêng trong userData/boot.json, main đọc đồng bộ trước khi app sẵn sàng.
import { isLang, type Lang } from './i18n'
import { isTheme, type Theme } from './palette'

/** 'auto': 3D nếu có WebGL; '2d': chỉ giao diện phẳng; 'software': 3D vẽ bằng CPU (máy ảo, GPU lỗi) */
export type RenderPref = 'auto' | '2d' | 'software'

export interface BootPrefs {
  theme: Theme
  render: RenderPref
  /** Linux Wayland: chạy qua XWayland (lối thoát khi bộ gõ hoặc GPU trên Wayland có vấn đề) */
  xwayland: boolean
  /** Số lần tiến trình GPU chết liên tiếp — từ 2 lần trở lên thì chuyển sang 2D */
  gpuCrashes: number
}

/** Thông tin main gửi cho renderer qua tham số dòng lệnh (preload đọc được ngay, trước lần vẽ đầu tiên) */
export interface BootInfo extends BootPrefs {
  platform: string
  /** Ngôn ngữ giao diện (từ thiết lập) — vẽ đúng ngôn ngữ ngay khung hình đầu tiên */
  lang: Lang
  /** Chế độ kiểm thử tự động (DESKBUDDY_TEST=1) */
  test: boolean
  /** Kiểm thử: đồng hồ lệch khỏi giờ thật (ms) */
  clockOffset: number
}

export const DEFAULT_BOOT: BootPrefs = { theme: 'light', render: 'auto', xwayland: false, gpuCrashes: 0 }

const RENDER_PREFS: readonly RenderPref[] = ['auto', '2d', 'software']

/** Đọc boot.json một cách dễ dãi: trường sai hoặc thiếu thì lấy mặc định, không bao giờ ném lỗi */
export function normalizeBoot(raw: unknown, fallbackTheme: Theme = DEFAULT_BOOT.theme): BootPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    theme: isTheme(o.theme) ? o.theme : fallbackTheme,
    render: RENDER_PREFS.includes(o.render as RenderPref) ? (o.render as RenderPref) : DEFAULT_BOOT.render,
    xwayland: o.xwayland === true,
    gpuCrashes: Number.isInteger(o.gpuCrashes) && (o.gpuCrashes as number) > 0 ? (o.gpuCrashes as number) : 0
  }
}

const BOOT_ARG = '--deskbuddy-boot='

export function bootArg(info: BootInfo): string {
  return BOOT_ARG + encodeURIComponent(JSON.stringify(info))
}

export function parseBootArg(argv: readonly string[]): BootInfo | null {
  const arg = argv.find((a) => a.startsWith(BOOT_ARG))
  if (!arg) return null
  try {
    const o = JSON.parse(decodeURIComponent(arg.slice(BOOT_ARG.length))) as Record<string, unknown>
    return {
      ...normalizeBoot(o),
      platform: String(o.platform ?? ''),
      lang: isLang(o.lang) ? o.lang : 'vi',
      test: o.test === true,
      clockOffset: Number.isFinite(o.clockOffset) ? (o.clockOffset as number) : 0
    }
  } catch {
    return null
  }
}
