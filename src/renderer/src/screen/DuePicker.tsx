// Chọn hạn: DateTimePickerPanel của momi-ui — mốc nhanh (Hôm nay, Ngày mai, Thứ Hai tới, Không hạn), lịch tháng, giờ
// gõ tự do ("9h30", "930", "21:15"…) với các giờ gợi ý, "Cả ngày" (hạn không có giờ).
import { DateTimePickerPanel, type DateTimePreset } from 'momi-ui'
import { dateAtNoon, ymd } from '../../../shared/datetime'
import { tr } from '../../../shared/i18n'
import { quickDates } from './format'

export interface Due {
  dueDate: string | null
  dueTime: string | null
}

const TIME_SUGGESTIONS = ['08:00', '09:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']

const toDate = (s: string | null): Date | null => (s ? dateAtNoon(s) : null)
const fromDate = (d: Date | null): string | null => (d ? ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()) : null)

export function DuePicker({ value, today, weekStart, onChange }: { value: Due; today: string; weekStart: 0 | 1; onChange: (d: Due) => void }): React.JSX.Element {
  const presets: DateTimePreset[] = [
    ...quickDates(today).map((q) => ({ label: q.label, date: toDate(q.date) })),
    { label: tr('Không hạn'), date: null, time: null }
  ]
  return (
    <DateTimePickerPanel
      className="due-picker"
      value={{ date: toDate(value.dueDate), time: value.dueTime }}
      // Chọn giờ khi chưa có ngày: hạn là hôm nay
      onValueChange={(v) => {
        const dueDate = fromDate(v.date) ?? (v.time ? today : null)
        onChange({ dueDate, dueTime: dueDate ? v.time : null })
      }}
      presets={presets}
      timeSuggestions={TIME_SUGGESTIONS}
      allowAllDay
      hourCycle="h23"
      weekStartsOn={weekStart}
    />
  )
}
