// Chọn quy tắc lặp lại: vài mẫu nhanh theo hạn của việc (hằng ngày, ngày làm việc, hằng tuần / tháng / năm) và phần
// tuỳ chỉnh (mỗi N ngày / tuần / tháng / năm, chọn thứ, ngày cuối tháng, kết thúc, tính lần sau từ hạn hay ngày hoàn thành)
import { useState } from 'react'
import { Button, DatePicker, NumberField, RadioGroup, RadioGroupItem, ToggleGroup, ToggleGroupItem } from 'momi-ui'
import { dateAtNoon, daysInMonth, isoWeekday, parseYmd, ymd } from '../../../shared/datetime'
import { tr, trKey } from '../../../shared/i18n'
import type { RecurrenceRule } from '../../../shared/types'
import { describeRule, weekdayName } from './format'
import { MenuItem } from './ui'

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
          <MenuItem key={JSON.stringify(p)} on={same(p, value)} onClick={() => onChange(p)}>
            {describeRule(p, dueDate)}
          </MenuItem>
        ))}
        <MenuItem on={custom} aria-expanded={open} onClick={() => setOpen(!open)}>
          {tr('Tuỳ chỉnh…')}
        </MenuItem>
      </div>
      {open && (
        <div className="recur-custom">
          <div className="recur-row">
            <span>{tr('Mỗi')}</span>
            <NumberField size="xs" wrapperClassName="recur-n w-16 shrink-0" min={1} max={maxN} value={f.n} onValueChange={(n) => set({ n })} aria-label={tr('Số lần lặp')} />
            <ToggleGroup
              type="single"
              variant="segmented"
              size="xs"
              value={f.unit}
              onValueChange={(u) => set({ unit: u as Unit, n: u === 'year' ? Math.min(f.n, 8) : f.n })}
              aria-label={tr('Đơn vị')}
            >
              {UNITS.map((u) => (
                <ToggleGroupItem key={u.id} value={u.id}>
                  {tr(u.label)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {f.unit === 'week' && f.basis === 'due' && (
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="xs"
              className="recur-days flex-wrap"
              value={f.days.map(String)}
              onValueChange={(days) => set({ days: days.map(Number) })}
              aria-label={tr('Vào các thứ')}
            >
              {order.map((d) => (
                <ToggleGroupItem key={d} value={String(d)} className="min-w-9">
                  {weekdayName(d, true)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {f.unit === 'month' && f.basis === 'due' && (
            <RadioGroup className="flex gap-4" value={f.lastDay ? 'last' : 'day'} onValueChange={(v) => set({ lastDay: v === 'last' })}>
              <RadioGroupItem value="day" label={tr('Ngày {d}', { d: parseYmd(dueDate).d })} />
              <RadioGroupItem value="last" label={tr('Ngày cuối tháng')} />
            </RadioGroup>
          )}
          <div className="recur-label">{tr('Kết thúc')}</div>
          <RadioGroup className="gap-2" value={f.end} onValueChange={(v) => set({ end: v as typeof f.end })}>
            <RadioGroupItem value="never" label={tr('Không kết thúc')} />
            <div className="flex items-center gap-2">
              <RadioGroupItem value="until" label={tr('Đến ngày')} />
              <DatePicker
                size="xs"
                className="w-36"
                value={dateAtNoon(f.until)}
                minDate={dateAtNoon(dueDate)}
                weekStartsOn={weekStart}
                aria-label={tr('Đến ngày')}
                onValueChange={(d) => d && set({ end: 'until', until: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()) })}
              />
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="count" label={tr('Sau')} />
              <NumberField size="xs" wrapperClassName="recur-n w-16 shrink-0" min={1} max={999} value={f.count} onValueChange={(count) => set({ end: 'count', count })} aria-label={tr('Số lần')} />
              {tr('lần')}
            </div>
          </RadioGroup>
          <div className="recur-label">{tr('Tính lần sau từ')}</div>
          <RadioGroup className="flex gap-4" value={f.basis} onValueChange={(v) => set({ basis: v as typeof f.basis })}>
            <RadioGroupItem value="due" label={tr('Hạn của lần này')} />
            <RadioGroupItem value="completion" label={tr('Ngày hoàn thành')} />
          </RadioGroup>
          <div className="recur-actions">
            <Button size="xs" onClick={apply}>
              {tr('Áp dụng')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
