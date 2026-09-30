// Bong bóng thoại trên đầu robot: nhắc việc đang chờ (việc đầu tiên + "+N"), hoặc lời robot nói (tóm tắt khi bấm vào,
// lời chào khi vừa lên bệ) — theo tính cách và kiểu bong bóng của robot đang đứng trên bệ.
// Chỉ nằm trong khoảng trống bên trái màn hình, không đè lên giao diện (bubblePlacement.ts; đổi cỡ cửa sổ thì StageSync đặt lại).
import { useLayoutEffect, useRef } from 'react'
import { countsFor } from '../../../shared/filters'
import { useNow } from '../clock'
import { ReminderActions, ReminderHead } from '../screen/ReminderParts'
import { useAlerts } from '../state/alertStore'
import { useData } from '../state/dataStore'
import { useHud } from '../state/hudStore'
import { useUi } from '../state/uiStore'
import { placeBubble } from './bubblePlacement'
import { hud } from './hudRefs'
import { PERSONALITY } from './robots/personality'

function Speech(): React.JSX.Element {
  const tasks = useData((s) => s.tasks)
  const now = useNow()
  const robot = useHud((s) => s.robot)
  const speech = useHud((s) => s.speech)
  const who = PERSONALITY[robot]
  const text = speech === 'greeting' ? who.greeting() : who.summary(countsFor(Object.values(tasks), now))
  return <div className="bubble-summary">{text}</div>
}

export function ReminderBubble(): React.JSX.Element | null {
  const active = useAlerts((s) => s.active)
  const width = useHud((s) => s.bubbleWidth)
  const speech = useHud((s) => s.speech)
  const robot = useHud((s) => s.robot)
  const summary = speech !== null
  // Chế độ Mở rộng: giao diện che robot — nhắc việc hiện banner trong màn hình
  const expanded = useUi((s) => s.expanded)
  const ref = useRef<HTMLDivElement>(null)
  const item = active[0]
  const show = width > 0 && !expanded && (item !== undefined || summary)
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
  }, [show, robot])
  if (!show) return null
  return (
    <div
      ref={ref}
      className={`bubble voice-${robot} ${item ? '' : `is-summary ${speech === 'greeting' ? 'is-greeting' : ''}`}`}
      style={{ width }}
      role={item ? 'alert' : 'status'}
    >
      {item ? (
        <>
          <ReminderHead item={item} more={active.length - 1} />
          <div className="reminder-title">{item.title}</div>
          <ReminderActions item={item} />
        </>
      ) : (
        <Speech />
      )}
    </div>
  )
}
