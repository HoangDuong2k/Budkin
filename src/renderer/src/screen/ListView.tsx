import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from 'momi-ui'
import { addDays } from '../../../shared/datetime'
import { isOpen, matchesTerms, sectionsFor, type Now, type Section, type Selection } from '../../../shared/filters'
import { tr, trKey } from '../../../shared/i18n'
import type { TaskCreateInput } from '../../../shared/schemas'
import { normalizeText, searchTerms } from '../../../shared/search'
import { useNow } from '../clock'
import { useData } from '../state/dataStore'
import { useUi } from '../state/uiStore'
import { run } from './actions'
import { fullDate, longDate } from './format'
import { Icon } from './icons'
import { TaskRow } from './TaskRow'

/** Thêm việc nhanh theo ngữ cảnh đang xem: Hôm nay → hạn hôm nay; dự án / nhãn → gán luôn */
export function QuickAdd({ sel, today }: { sel: Selection; today: string }): React.JSX.Element {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const focusTick = useUi((s) => s.quickAddFocus)
  useEffect(() => {
    if (focusTick) ref.current?.focus()
  }, [focusTick])
  const submit = async (): Promise<void> => {
    const title = text.trim()
    if (!title) return
    const input: TaskCreateInput = { title }
    if (sel.kind === 'project') input.projectId = sel.id
    if (sel.kind === 'tag') input.tagIds = [sel.id]
    if (sel.kind === 'smart' && (sel.id === 'today' || sel.id === 'upcoming')) {
      input.dueDate = sel.id === 'today' ? today : addDays(today, 1)
      // Việc cả ngày: nhắc vào buổi sáng của ngày đến hạn (giờ trong thiết lập)
      input.remindBeforeMin = 0
    }
    setText('')
    await run('tasks:create', input)
  }
  return (
    <Input
      ref={ref}
      wrapperClassName="quick-add mb-4"
      className="quick-add-input"
      leftSection={<Icon name="plus" size={15} className="text-primary" />}
      value={text}
      maxLength={500}
      placeholder={tr('Thêm việc mới… (Enter để lưu)')}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit()
        if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function useSelectionTitle(sel: Selection, now: Now): { title: string; subtitle?: string } {
  const projects = useData((s) => s.projects)
  const tags = useData((s) => s.tags)
  if (sel.kind === 'project') return { title: projects[sel.id]?.name ?? tr('Dự án') }
  if (sel.kind === 'tag') return { title: `#${tags[sel.id]?.name ?? ''}` }
  const titles = { today: tr('Hôm nay'), upcoming: tr('Sắp tới'), overdue: tr('Quá hạn'), all: tr('Tất cả việc'), done: tr('Đã xong') }
  return { title: titles[sel.id], subtitle: sel.id === 'today' ? fullDate(now.date, now.date) : undefined }
}

function sectionTitle(s: Section, today: string): string {
  return s.date ? longDate(s.date, today) : tr(s.title)
}

export function ListView(): React.JSX.Element {
  const now = useNow()
  const sel = useUi((s) => s.selection)
  const search = useUi((s) => s.search)
  const tasks = useData((s) => s.tasks)
  const loaded = useData((s) => s.loaded)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const all = useMemo(() => Object.values(tasks), [tasks])
  const terms = useMemo(() => searchTerms(search), [search])
  const sections = useMemo<Section[]>(() => {
    if (!terms.length) return sectionsFor(sel, all, now)
    const hits = all.filter((t) => matchesTerms(t, terms, normalizeText))
    return [
      { key: 'search-open', title: trKey('Cần làm'), tasks: hits.filter(isOpen) },
      { key: 'search-done', title: trKey('Đã xong'), tasks: hits.filter((t) => !isOpen(t)) }
    ].filter((s) => s.tasks.length)
  }, [sel, all, now, terms])
  const { title, subtitle } = useSelectionTitle(sel, now)
  const showProject = sel.kind !== 'project'
  const selKey = sel.kind === 'smart' ? sel.id : `${sel.kind}:${sel.id}`
  // Danh sách "Đã xong" và "Quá hạn" không thêm việc mới vào được
  const showQuickAdd = !terms.length && !(sel.kind === 'smart' && (sel.id === 'done' || sel.id === 'overdue'))

  return (
    <div className="list-view">
      <header className="list-head">
        <h2>{terms.length ? tr('Kết quả tìm kiếm') : title}</h2>
        {subtitle && !terms.length && <span className="muted">{subtitle}</span>}
      </header>
      {showQuickAdd && <QuickAdd sel={sel} today={now.date} />}
      {sections.map((s) => {
        const key = `${selKey}/${s.key}`
        const isCollapsed = collapsed[key] ?? s.collapsed ?? false
        return (
          <section key={s.key} className="list-section" data-section={s.key}>
            <button className={`section-head ${s.tone ?? ''}`} onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })}>
              <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={14} />
              <span className="section-label">{sectionTitle(s, now.date)}</span>
              <span className="count">{s.tasks.length}</span>
            </button>
            {!isCollapsed && s.tasks.map((t) => <TaskRow key={t.id} task={t} now={now} showProject={showProject} />)}
          </section>
        )
      })}
      {loaded && sections.length === 0 && (
        <div className="empty">
          <p>{terms.length ? tr('Không tìm thấy việc nào khớp.') : tr('Chưa có việc nào ở đây.')}</p>
          {!terms.length && <p className="muted">{tr('Gõ vào ô phía trên để thêm việc mới — Budkin sẽ nhắc bạn khi đến hạn.')}</p>}
        </div>
      )}
    </div>
  )
}
