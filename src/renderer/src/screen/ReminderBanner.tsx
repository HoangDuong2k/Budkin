// Nhắc việc ngay trong màn hình khi không đặt được bong bóng thoại cạnh robot (khoảng trống bên trái quá hẹp, chế độ 2D)
import { useAlerts } from '../state/alertStore'
import { useHud } from '../state/hudStore'
import { ReminderActions, ReminderHead } from './ReminderParts'

export function ReminderBanner(): React.JSX.Element | null {
  const active = useAlerts((s) => s.active)
  const bubble = useHud((s) => s.bubbleWidth > 0)
  const item = active[0]
  if (!item || bubble) return null
  return (
    <div className="reminder-banner" role="alert">
      <div className="reminder-body">
        <ReminderHead item={item} more={active.length - 1} />
        <div className="reminder-title">{item.title}</div>
      </div>
      <ReminderActions item={item} />
    </div>
  )
}
