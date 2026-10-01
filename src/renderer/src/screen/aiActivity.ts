// App AI (Claude Desktop, Claude Code… qua MCP) vừa thêm / sửa / xoá việc: robot phản ứng, toast báo kèm nút Hoàn tác
import type { AiActivity } from '../../../shared/api'
import { tr } from '../../../shared/i18n'
import { dispatchRobot } from '../scene/robotState'
import { useUi } from '../state/uiStore'
import { run } from './actions'

export function activityText(a: AiActivity): string {
  const vars = { client: a.client, title: a.titles[0] ?? '', n: a.count }
  const one = a.count === 1
  switch (a.kind) {
    case 'create':
      return one ? tr('{client} đã thêm “{title}”', vars) : tr('{client} đã thêm {n} việc', vars)
    case 'update':
      return one ? tr('{client} đã sửa “{title}”', vars) : tr('{client} đã sửa {n} việc', vars)
    case 'delete':
      return one ? tr('{client} đã xoá “{title}”', vars) : tr('{client} đã xoá {n} việc', vars)
  }
}

async function undo(a: AiActivity): Promise<void> {
  const r = await run('ai:undo', a.id)
  if (r.ok) useUi.getState().toast({ text: tr('Đã hoàn tác thay đổi của {client}', { client: a.client }) })
}

export function subscribeAiActivity(): void {
  window.api.on('ai:activity', (a) => {
    dispatchRobot({ type: a.kind === 'delete' ? 'poke' : 'celebrate', at: performance.now() })
    useUi.getState().toast({ text: activityText(a), action: { label: tr('Hoàn tác'), run: () => void undo(a) } })
  })
}
