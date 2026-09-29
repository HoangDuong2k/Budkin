import { useState } from 'react'
import { addDays, daysInMonth, isoWeekday, parseYmd, startOfWeek, ymd } from '../../../shared/datetime'
import { tr } from '../../../shared/i18n'
import { Icon } from './icons'
import { monthName, weekdayName } from './format'

interface Props {
  value: string | null
  today: string
  weekStart: 0 | 1
  onPick: (date: string) => void
}

/** Lịch tháng nhỏ để chọn ngày (6 tuần × 7 ngày) */
export function MiniCalendar({ value, today, weekStart, onPick }: Props): React.JSX.Element {
  const start = parseYmd(value ?? today)
  const [cursor, setCursor] = useState({ y: start.y, m: start.m })
  const first = ymd(cursor.y, cursor.m, 1)
  const gridStart = startOfWeek(first, weekStart)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const heads = Array.from({ length: 7 }, (_, i) => weekdayName(isoWeekday(addDays(gridStart, i)), true))
  const shift = (delta: number): void => {
    const idx = cursor.y * 12 + (cursor.m - 1) + delta
    setCursor({ y: Math.floor(idx / 12), m: (idx % 12) + 1 })
  }
  const last = ymd(cursor.y, cursor.m, daysInMonth(cursor.y, cursor.m))
  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label={tr('Tháng trước')}>
          <Icon name="chevronLeft" />
        </button>
        <span className="mini-cal-title">
          {monthName(cursor.m)} {cursor.y}
        </span>
        <button className="icon-btn" onClick={() => shift(1)} aria-label={tr('Tháng sau')}>
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="mini-cal-grid">
        {heads.map((h) => (
          <span key={h} className="mini-cal-dow">
            {h}
          </span>
        ))}
        {days.map((d) => (
          <button
            key={d}
            className={[
              'mini-cal-day',
              d < first || d > last ? 'other' : '',
              d === today ? 'today' : '',
              d === value ? 'selected' : ''
            ].join(' ')}
            onClick={() => onPick(d)}
          >
            {parseYmd(d).d}
          </button>
        ))}
      </div>
    </div>
  )
}
