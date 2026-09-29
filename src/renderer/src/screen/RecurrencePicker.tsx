// Chọn quy tắc lặp lại: vài mẫu nhanh theo hạn của việc (hằng ngày, ngày làm việc, hằng tuần / tháng / năm) và phần
// tuỳ chỉnh (mỗi N ngày / tuần / tháng / năm, chọn thứ, ngày cuối tháng, kết thúc, tính lần sau từ hạn hay ngày hoàn thành)
import { useState } from 'react'
import { daysInMonth, isoWeekday, parseYmd } from '../../../shared/datetime'
import { tr, trKey } from '../../../shared/i18n'
import type { RecurrenceRule } from '../../../shared/types'
import { describeRule, weekdayName } from './format'

type Unit = 'day' | 'week' | 'month' | 'year'

const UNITS: Array<{ id: Unit; label: string }> = [
  { id: 'day', label: trKey('ngày') },
  { id: 'week', label: trKey('tuần') },
  { id: 'month', label: trKey('tháng') },
  { id: 'year', label: trKey('năm') }
]

interface Props {
  value: RecurrenceRule | null
  /** Hạn của việc (lặp lại cần có hạn) */
  dueDate: string
  weekStart: 0 | 1
  onChange: (rule: RecurrenceRule | null) => void
}

/** So hai quy tắc (thứ tự thứ trong tuần không quan trọng) */
function same(a: RecurrenceRule | null, b: RecurrenceRule | null): boolean {
  const norm = (r: RecurrenceRule | null): string =>
    r ? JSON.stringify({ ...r, byWeekday: r.byWeekday ? [...r.byWeekday].sort((x, y) => x - y) : undefined }) : 'null'
  return norm(a) === norm(b)
}

function presets(due: string): Array<RecurrenceRule | null> {
  const { y, m, d } = parseYmd(due)
  const list: Array<RecurrenceRule | null> = [
    null,
    { freq: 'daily', interval: 1, basis: 'due' },
    { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5], basis: 'due' },
    { freq: 'weekly', interval: 1, byWeekday: [isoWeekday(due)], basis: 'due' },
    { freq: 'monthly', interval: 1, monthDay: d, basis: 'due' }
  ]
  // Hạn là ngày cuối tháng: thêm lựa chọn "ngày cuối tháng" (30/4 → 31/5 → 30/6…)
  if (d === daysInMonth(y, m) && d > 28) list.push({ freq: 'monthly', interval: 1, monthDay: -1, basis: 'due' })
  list.push({ freq: 'monthly', interval: 12, monthDay: d, basis: 'due' })
  return list
}

/** Phần tuỳ chỉnh: trạng thái form lấy từ quy tắc hiện có (hoặc mặc định theo hạn) */
function toForm(rule: RecurrenceRule | null, due: string): {
  unit: Unit
  n: number
  days: number[]
  lastDay: boolean
  end: 'never' | 'until' | 'count'
  until: string
  count: number
  basis: RecurrenceRule['basis']
} {
  const r = rule ?? { freq: 'weekly', interval: 1, basis: 'due' as const }
  const yearly = r.freq === 'monthly' && r.interval % 12 === 0
  return {
    unit: r.freq === 'daily' ? 'day' : r.freq === 'weekly' ? 'week' : yearly ? 'year' : 'month',
    n: yearly ? r.interval / 12 : r.interval,
    days: r.byWeekday?.length ? [...r.byWeekday] : [isoWeekday(due)],
    lastDay: r.monthDay === -1,
    end: r.until ? 'until' : r.count ? 'count' : 'never',
    until: r.until ?? due,
    count: r.count ?? 10,
    basis: r.basis
  }
}

export function RecurrencePicker({ value, dueDate, weekStart, onChange }: Props): React.JSX.Element {
  const list = presets(dueDate)
  const custom = value !== null && !list.some((p) => same(p, value))
  const [open, setOpen] = useState(custom)
  const [f, setF] = useState(() => toForm(value, dueDate))
  const set = (patch: Partial<typeof f>): void => setF({ ...f, ...patch })
  const order = weekStart === 1 ? [1, 2, 3, 4, 5, 6, 7] : [7, 1, 2, 3, 4, 5, 6]
  const maxN = f.unit === 'year' ? 8 : 99
  const apply = (): void => {
    const n = Math.min(maxN, Math.max(1, Math.round(f.n) || 1))
    const byDue = f.basis === 'due'
    const rule: RecurrenceRule =
      f.unit === 'day'
        ? { freq: 'daily', interval: n, basis: f.basis }
        : f.unit === 'week'
          ? { freq: 'weekly', interval: n, basis: f.basis, ...(byDue && f.days.length ? { byWeekday: [...f.days].sort((a, b) => a - b) } : {}) }
          : f.unit === 'month'
            ? { freq: 'monthly', interval: n, basis: f.basis, ...(byDue ? { monthDay: f.lastDay ? -1 : parseYmd(dueDate).d } : {}) }
            : { freq: 'monthly', interval: n * 12, basis: f.basis, ...(byDue ? { monthDay: parseYmd(dueDate).d } : {}) }
    if (f.end === 'until' && f.until >= dueDate) rule.until = f.until
    if (f.end === 'count') rule.count = Math.min(999, Math.max(1, Math.round(f.count) || 1))
    onChange(rule)
  }
  return (
    <div className="recur">
      <div className="menu">
        {list.map((p) => (
          <button key={JSON.stringify(p)} className={`menu-item ${same(p, value) ? 'on' : ''}`} onClick={() => onChange(p)}>
            {describeRule(p, dueDate)}
          </button>
        ))}
        <button className={`menu-item ${custom ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {tr('Tuỳ chỉnh…')}
        </button>
      </div>
      {open && (
        <div className="recur-custom">
          <div className="recur-row">
            <span>{tr('Mỗi')}</span>
            <input className="input recur-n" type="number" min={1} max={maxN} value={f.n} onChange={(e) => set({ n: Number(e.target.value) })} aria-label={tr('Số lần lặp')} />
            <div className="segmented">
              {UNITS.map((u) => (
                <button key={u.id} className={f.unit === u.id ? 'on' : ''} onClick={() => set({ unit: u.id, n: u.id === 'year' ? Math.min(f.n, 8) : f.n })}>
                  {tr(u.label)}
                </button>
              ))}
            </div>
          </div>
          {f.unit === 'week' && f.basis === 'due' && (
            <div className="recur-days" role="group" aria-label={tr('Vào các thứ')}>
              {order.map((d) => (
                <button
                  key={d}
                  className={`chip-btn small ${f.days.includes(d) ? 'on' : ''}`}
                  aria-pressed={f.days.includes(d)}
                  onClick={() => set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })}
                >
                  {weekdayName(d, true)}
                </button>
              ))}
            </div>
          )}
          {f.unit === 'month' && f.basis === 'due' && (
            <div className="recur-row">
              <label className="recur-radio">
                <input type="radio" checked={!f.lastDay} onChange={() => set({ lastDay: false })} />
                {tr('Ngày {d}', { d: parseYmd(dueDate).d })}
              </label>
              <label className="recur-radio">
                <input type="radio" checked={f.lastDay} onChange={() => set({ lastDay: true })} />
                {tr('Ngày cuối tháng')}
              </label>
            </div>
          )}
          <div className="recur-label">{tr('Kết thúc')}</div>
          <div className="recur-col">
            <label className="recur-radio">
              <input type="radio" checked={f.end === 'never'} onChange={() => set({ end: 'never' })} />
              {tr('Không kết thúc')}
            </label>
            <label className="recur-radio">
              <input type="radio" checked={f.end === 'until'} onChange={() => set({ end: 'until' })} />
              {tr('Đến ngày')}
              <input className="input" type="date" min={dueDate} value={f.until} onChange={(e) => set({ end: 'until', until: e.target.value || dueDate })} />
            </label>
            <label className="recur-radio">
              <input type="radio" checked={f.end === 'count'} onChange={() => set({ end: 'count' })} />
              {tr('Sau')}
              <input className="input recur-n" type="number" min={1} max={999} value={f.count} onChange={(e) => set({ end: 'count', count: Number(e.target.value) })} />
              {tr('lần')}
            </label>
          </div>
          <div className="recur-label">{tr('Tính lần sau từ')}</div>
          <div className="recur-row">
            <label className="recur-radio">
              <input type="radio" checked={f.basis === 'due'} onChange={() => set({ basis: 'due' })} />
              {tr('Hạn của lần này')}
            </label>
            <label className="recur-radio">
              <input type="radio" checked={f.basis === 'completion'} onChange={() => set({ basis: 'completion' })} />
              {tr('Ngày hoàn thành')}
            </label>
          </div>
          <div className="recur-actions">
            <button className="btn primary small" onClick={apply}>
              {tr('Áp dụng')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
