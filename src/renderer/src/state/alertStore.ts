// Nhắc việc đang chờ (main là nguồn sự thật, gửi qua alerts:changed) + phản ứng của robot: báo động khi có nhắc chưa
// xử lý, kêu chuông và nhún nhảy mỗi lần có nhắc mới.
import { create } from 'zustand'
import type { AlertsSnapshot } from '../../../shared/api'
import { call } from '../ipc'
import { dispatchRobot, pingAlert } from '../scene/robotState'
import { playChirp } from '../scene/sound'

export const useAlerts = create<AlertsSnapshot & { loaded: boolean }>(() => ({ active: [], mutedUntil: null, nextAt: null, loaded: false }))

/** Gọi một lần lúc khởi động; trả về hàm huỷ */
export function subscribeAlerts(): () => void {
  const offChanged = window.api.on('alerts:changed', (s) => useAlerts.setState({ ...s, loaded: true }))
  const offFired = window.api.on('reminder:fired', () => {
    // Đang tắt nhắc: không kêu (robot vẫn báo trên bàn)
    if (useAlerts.getState().mutedUntil === null) playChirp('alert')
    pingAlert()
  })
  const offRobot = useAlerts.subscribe((s, prev) => {
    const on = s.active.length > 0
    if (on !== prev.active.length > 0) dispatchRobot({ type: 'alert', at: performance.now(), active: on })
  })
  void call('reminders:snapshot')
    .then((s) => useAlerts.setState({ ...s, loaded: true }))
    .catch((err) => console.error('[nhắc việc]', err))
  return () => {
    offChanged()
    offFired()
    offRobot()
  }
}
