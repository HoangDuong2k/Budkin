// Kiểu dữ liệu nghiệp vụ dùng chung giữa main và renderer
import type { Lang } from './i18n'
import type { ColorKey } from './palette'
import type { RobotModel } from './robots'

export type TaskStatus = 'todo' | 'in_progress' | 'done'
export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done']

/** 0: không, 1: thấp, 2: vừa, 3: cao */
export type Priority = 0 | 1 | 2 | 3

/** Quy tắc lặp (lưu trên từng lần của chuỗi). "Hằng năm" = monthly với interval 12 */
export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  /** Thứ trong tuần theo ISO: 1 = thứ Hai … 7 = Chủ nhật (chỉ với weekly) */
  byWeekday?: number[]
  /** Ngày trong tháng 1–31, -1 = ngày cuối tháng (chỉ với monthly) */
  monthDay?: number
  /** Ngày cuối cùng (tính cả ngày đó) 'YYYY-MM-DD' */
  until?: string
  /** Tổng số lần */
  count?: number
  /** Lần sau tính từ hạn của lần này ('due') hay từ ngày hoàn thành ('completion') */
  basis: 'due' | 'completion'
}

export interface Project {
  id: string
  name: string
  color: ColorKey
  sortOrder: number
  archivedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Tag {
  id: string
  name: string
  color: ColorKey
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface ChecklistItem {
  id: string
  taskId: string
  text: string
  done: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface Task {
  id: string
  projectId: string | null
  title: string
  notes: string
  status: TaskStatus
  priority: Priority
  /** Hạn theo giờ địa phương "trôi nổi" (không gắn múi giờ): 'YYYY-MM-DD' */
  dueDate: string | null
  /** 'HH:mm'; null = cả ngày */
  dueTime: string | null
  /** Nhắc trước bao nhiêu phút; null = không nhắc, 0 = nhắc đúng lúc đến hạn */
  remindBeforeMin: number | null
  recurrence: RecurrenceRule | null
  seriesId: string | null
  occurrenceIndex: number | null
  /** Lần kế tiếp đã được tạo khi hoàn thành lần này (chống tạo trùng) */
  nextSpawnedId: string | null
  sortOrder: number
  completedAt: number | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  tagIds: string[]
  checklist: ChecklistItem[]
}

export type Quality = 'high' | 'balanced' | 'saver'

export interface Settings {
  language: Lang
  /** 1 = tuần bắt đầu thứ Hai, 0 = Chủ nhật */
  weekStart: 0 | 1
  /** Giờ nhắc cho task cả ngày 'HH:mm' */
  allDayRemindTime: string
  /** Mức nhắc mặc định khi tạo task có hạn */
  defaultRemindBeforeMin: number | null
  sound: boolean
  volume: number
  /** Bấm đóng cửa sổ: ẩn xuống khay (true), thoát (false), chưa chọn (null — hỏi lần đầu) */
  closeToTray: boolean | null
  autostart: boolean
  quality: Quality
  reducedMotion: 'auto' | 'on' | 'off'
  /** Robot đứng trên bệ tròn bên trái màn hình */
  robot: RobotModel
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'vi',
  weekStart: 1,
  allDayRemindTime: '09:00',
  defaultRemindBeforeMin: 15,
  sound: true,
  volume: 0.6,
  closeToTray: null,
  autostart: false,
  quality: 'balanced',
  reducedMotion: 'auto',
  robot: 'budkin'
}

/** Thay đổi dữ liệu main phát cho renderer sau mỗi lần ghi (bản đầy đủ của từng đối tượng) */
export interface ChangeSet {
  tasks: Task[]
  projects: Project[]
  tags: Tag[]
}

export type ChangeReason = 'user' | 'recurrence' | 'import' | 'restore'
