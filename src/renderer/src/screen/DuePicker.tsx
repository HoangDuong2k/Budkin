import { useEffect, useState } from 'react'
import { parseTimeInput } from '../../../shared/datetime'
import { tr } from '../../../shared/i18n'
import { quickDates } from './format'
import { MiniCalendar } from './MiniCalendar'

export interface Due {
  dueDate: string | null
  dueTime: string | null
}

const TIME_SUGGESTIONS = ['08:00', '09:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']

/** Chọn hạn: nút nhanh, lịch tháng, giờ (gõ tự do "9h30", "930", "21:15"…) */
export function DuePicker({ value, today, weekStart, onChange }: { value: Due; today: string; weekStart: 0 | 1; onChange: (d: Due) => void }): React.JSX.Element {
  const [timeText, setTimeText] = useState(value.dueTime ?? '')
  const [bad, setBad] = useState(false)
  useEffect(() => setTimeText(value.dueTime ?? ''), [value.dueTime])

  const commitTime = (raw: string): void => {
    if (!raw.trim()) {
      setBad(false)
      if (value.dueTime) onChange({ ...value, dueTime: null })
      return
    }
    const t = parseTimeInput(raw)
    setBad(t === null)
    if (t && t !== value.dueTime) onChange({ dueDate: value.dueDate ?? today, dueTime: t })
  }

  return (
    <div className="due-picker">
      <div className="due-quick">
        {quickDates(today).map((q) => (
          <button key={q.label} className={`chip-btn ${value.dueDate === q.date ? 'on' : ''}`} onClick={() => onChange({ ...value, dueDate: q.date })}>
            {q.label}
          </button>
        ))}
        <button className="chip-btn" onClick={() => onChange({ dueDate: null, dueTime: null })}>
          {tr('Không hạn')}
        </button>
      </div>
      <MiniCalendar value={value.dueDate} today={today} weekStart={weekStart} onPick={(d) => onChange({ ...value, dueDate: d })} />
      <div className="due-time">
        <label>
          <span>{tr('Giờ')}</span>
          <input
            className={`input time-input ${bad ? 'bad' : ''}`}
            value={timeText}
            placeholder={tr('Cả ngày')}
            onChange={(e) => setTimeText(e.target.value)}
            onBlur={(e) => commitTime(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTime((e.target as HTMLInputElement).value)
            }}
          />
        </label>
        <div className="time-suggest">
          {TIME_SUGGESTIONS.map((t) => (
            <button key={t} className={`chip-btn small ${value.dueTime === t ? 'on' : ''}`} onClick={() => onChange({ dueDate: value.dueDate ?? today, dueTime: t })}>
              {t}
            </button>
          ))}
          {value.dueTime && (
            <button className="chip-btn small" onClick={() => onChange({ ...value, dueTime: null })}>
              {tr('Cả ngày')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
