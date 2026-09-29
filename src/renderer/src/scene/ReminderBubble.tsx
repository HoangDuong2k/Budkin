// Bong bóng thoại trên đầu robot: nhắc việc đang chờ (việc đầu tiên + "+N"), hoặc câu tóm tắt khi bấm vào robot.
// Chỉ nằm trong khoảng trống bên trái màn hình, không đè lên giao diện (bubblePlacement.ts; đổi cỡ cửa sổ thì StageSync đặt lại).
import { useLayoutEffect, useRef } from 'react'
import { countsFor } from '../../../shared/filters'
import { tr } from '../../../shared/i18n'
import { useNow } from '../clock'
import { ReminderActions, ReminderHead } from '../screen/ReminderParts'
import { useAlerts } from '../state/alertStore'
import { useData } from '../state/dataStore'
import { useHud } from '../state/hudStore'
import { placeBubble } from './bubblePlacement'
import { hud } from './hudRefs'

function Summary(): React.JSX.Element {
  const tasks = useData((s) => s.tasks)
  const c = countsFor(Object.values(tasks), useNow())
  const text =
    c.today === 0
      ? tr('Hết việc hôm nay rồi!')
      : c.overdue > 0
        ? tr('Hôm nay còn {n} việc, {m} việc quá hạn.', { n: c.today, m: c.overdue })
        : tr('Hôm nay còn {n} việc.', { n: c.today })
  return <div className="bubble-summary">{text}</div>
}

export function ReminderBubble(): React.JSX.Element | null {
  const active = useAlerts((s) => s.active)
  const width = useHud((s) => s.bubbleWidth)
  const summary = useHud((s) => s.summaryUntil > 0)
  const ref = useRef<HTMLDivElement>(null)
  const item = active[0]
  const show = width > 0 && (item !== undefined || summary)
  useLayoutEffect(() => {
    const el = ref.current
    if (!show || !el) return
    hud.bubble = el
    const measure = (): void => {
      hud.bubbleW = el.offsetWidth
      hud.bubbleH = el.offsetHeight
      placeBubble()
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => {
      ro.disconnect()
      if (hud.bubble === el) hud.bubble = null
    }
  }, [show])
  if (!show) return null
  return (
    <div ref={ref} className={`bubble ${item ? '' : 'is-summary'}`} style={{ width }} role={item ? 'alert' : 'status'}>
      {item ? (
        <>
          <ReminderHead item={item} more={active.length - 1} />
          <div className="reminder-title">{item.title}</div>
          <ReminderActions item={item} />
        </>
      ) : (
        <Summary />
      )}
    </div>
  )
}
