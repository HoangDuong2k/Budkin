// Nội dung nhắc việc dùng chung cho bong bóng thoại của robot và banner trong màn hình
import { Badge, Button, IconButton } from 'momi-ui'
import { tr } from '../../../shared/i18n'
import { dueLabel, type AlertItem } from '../../../shared/reminders'
import { now, useNow } from '../clock'
import { completeReminder, dismissReminder, openTask, snoozeReminder } from './actions'
import { Icon } from './icons'

export function ReminderHead({ item, more }: { item: AlertItem; more: number }): React.JSX.Element {
  // Qua ngày thì "ngày mai 10:30" đổi thành "10:30"
  useNow()
  return (
    <div className="reminder-head">
      <span className={`reminder-kicker stage-${item.stage}`}>
        {item.stage === 2 ? tr('Đến hạn') : tr('Sắp đến hạn')} · {dueLabel(item, now())}
      </span>
      {more > 0 && (
        <Badge variant="solid" tone="primary" size="sm" shape="rounded" className="reminder-more">
          +{more}
        </Badge>
      )}
      <IconButton variant="ghost" size="xs" className="reminder-dismiss" aria-label={tr('Bỏ qua')} title={tr('Bỏ qua')} onClick={() => void dismissReminder(item.taskId)}>
        <Icon name="x" size={12} />
      </IconButton>
    </div>
  )
}

export function ReminderActions({ item }: { item: AlertItem }): React.JSX.Element {
  return (
    <div className="reminder-actions">
      <Button size="xs" onClick={() => void completeReminder(item.taskId)}>
        {tr('Xong')}
      </Button>
      <Button size="xs" variant="outline" title={tr('Báo lại sau 10 phút')} onClick={() => void snoozeReminder(item.taskId, 10)}>
        {tr('10 phút')}
      </Button>
      <Button size="xs" variant="ghost" onClick={() => openTask(item.taskId)}>
        {tr('Mở')}
      </Button>
    </div>
  )
}
