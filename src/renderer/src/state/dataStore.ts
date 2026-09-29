// Bộ nhớ đệm dữ liệu của renderer. Main là nguồn sự thật: mọi thay đổi (kể cả do chính renderer gây ra)
// về qua sự kiện data:changed dưới dạng bản đầy đủ của từng đối tượng — renderer chỉ việc ghép vào.
import { create } from 'zustand'
import type { ChangeSet, Project, Settings, Tag, Task } from '../../../shared/types'
import { call } from '../ipc'

interface DataState {
  loaded: boolean
  tasks: Record<string, Task>
  projects: Record<string, Project>
  tags: Record<string, Tag>
  settings: Settings | null
  load: () => Promise<void>
  apply: (changes: ChangeSet) => void
}

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x.id, x]))
}

/** Ghép bản mới vào bộ đệm: chỉ nhận bản không cũ hơn bản đang có; đối tượng đã xoá thì bỏ khỏi bộ đệm */
function merge<T extends { id: string; updatedAt: number; deletedAt: number | null }>(current: Record<string, T>, incoming: T[]): Record<string, T> {
  if (!incoming.length) return current
  const next = { ...current }
  for (const item of incoming) {
    const old = next[item.id]
    if (old && old.updatedAt > item.updatedAt) continue
    if (item.deletedAt !== null) delete next[item.id]
    else next[item.id] = item
  }
  return next
}

export const useData = create<DataState>((set, get) => ({
  loaded: false,
  tasks: {},
  projects: {},
  tags: {},
  settings: null,
  load: async () => {
    const [tasks, projects, tags, settings] = await Promise.all([
      call('tasks:list', { scope: 'active' }),
      call('projects:list'),
      call('tags:list'),
      call('settings:get')
    ])
    set({ loaded: true, tasks: byId(tasks), projects: byId(projects), tags: byId(tags), settings })
  },
  apply: (changes) => {
    const s = get()
    set({ tasks: merge(s.tasks, changes.tasks), projects: merge(s.projects, changes.projects), tags: merge(s.tags, changes.tags) })
  }
}))

/** Nghe thay đổi từ main (gọi một lần lúc khởi động); trả về hàm huỷ */
export function subscribeData(): () => void {
  const offData = window.api.on('data:changed', ({ changes }) => useData.getState().apply(changes))
  const offSettings = window.api.on('settings:changed', (settings) => useData.setState({ settings }))
  return () => {
    offData()
    offSettings()
  }
}
