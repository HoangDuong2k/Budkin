import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { countsFor, isOpen, type SmartListId } from '../../../shared/filters'
import { LANGS, tr, trKey } from '../../../shared/i18n'
import { COLOR_KEYS, LABEL_COLORS, type ColorKey } from '../../../shared/palette'
import { useNow } from '../clock'
import { useData } from '../state/dataStore'
import { useLang } from '../state/langStore'
import { useTheme } from '../state/themeStore'
import { useUi } from '../state/uiStore'
import { run } from './actions'
import { nextColor } from './format'
import { Icon, type IconName } from './icons'
import { Confirm, Popover } from './ui'

const SMART: Array<{ id: SmartListId; icon: IconName; label: string }> = [
  { id: 'today', icon: 'sun', label: trKey('Hôm nay') },
  { id: 'upcoming', icon: 'upcoming', label: trKey('Sắp tới') },
  { id: 'overdue', icon: 'alert', label: trKey('Quá hạn') },
  { id: 'all', icon: 'inbox', label: trKey('Tất cả việc') },
  { id: 'done', icon: 'checkCircle', label: trKey('Đã xong') }
]

function NavItem({
  icon,
  label,
  count,
  active,
  danger,
  onClick,
  onMenu,
  swatch
}: {
  icon?: IconName
  label: string
  count?: number
  active: boolean
  danger?: boolean
  onClick: () => void
  onMenu?: (anchor: HTMLElement) => void
  swatch?: { color: string; shape: 'dot' | 'hash' }
}): React.JSX.Element {
  return (
    <div className={`nav-item ${active ? 'on' : ''}`}>
      <button
        className="nav-main"
        title={label}
        onClick={onClick}
        onContextMenu={(e) => {
          if (!onMenu) return
          e.preventDefault()
          onMenu(e.currentTarget)
        }}
      >
        {icon && <Icon name={icon} size={16} />}
        {swatch && (swatch.shape === 'dot' ? <i className="dot big" style={{ background: swatch.color }} /> : <span className="hash" style={{ color: swatch.color }}>#</span>)}
        <span className="label">{label}</span>
        {!!count && <span className={`count ${danger ? 'danger' : ''}`}>{count}</span>}
      </button>
      {onMenu && (
        <button className="icon-btn subtle nav-more" aria-label={tr('Tuỳ chọn')} onClick={(e) => onMenu(e.currentTarget)}>
          <Icon name="dots" size={14} />
        </button>
      )}
    </div>
  )
}

function NewItemInput({ placeholder, onSubmit, onDone }: { placeholder: string; onSubmit: (name: string) => void; onDone: () => void }): React.JSX.Element {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <input
      ref={ref}
      className="input nav-input"
      value={value}
      placeholder={placeholder}
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          if (value.trim()) onSubmit(value.trim())
          onDone()
        }
        if (e.key === 'Escape') {
          e.stopPropagation()
          onDone()
        }
      }}
    />
  )
}

interface ItemMenuState {
  kind: 'project' | 'tag'
  id: string
  anchor: HTMLElement
}

/** Tuỳ chọn cho dự án / nhãn: đổi tên, đổi màu, xoá */
function ItemMenu({ menu, onClose }: { menu: ItemMenuState; onClose: () => void }): React.JSX.Element {
  const item = useData((s) => (menu.kind === 'project' ? s.projects[menu.id] : s.tags[menu.id]))
  const theme = useTheme((s) => s.theme)
  const [name, setName] = useState(item?.name ?? '')
  const [confirm, setConfirm] = useState(false)
  const select = useUi((s) => s.select)
  const selection = useUi((s) => s.selection)
  if (!item) return <></>
  const rename = (): void => {
    const n = name.trim()
    if (!n || n === item.name) return
    void run(menu.kind === 'project' ? 'projects:update' : 'tags:update', menu.id, { name: n })
  }
  const recolor = (color: ColorKey): void => void run(menu.kind === 'project' ? 'projects:update' : 'tags:update', menu.id, { color })
  const remove = async (): Promise<void> => {
    const res = await run(menu.kind === 'project' ? 'projects:delete' : 'tags:delete', menu.id)
    if (res.ok && selection.kind === menu.kind && selection.id === menu.id) select({ kind: 'smart', id: 'today' })
    onClose()
  }
  return (
    <>
      <Popover anchor={menu.anchor} open={!confirm} onClose={onClose} width={220}>
        <div className="menu">
          <input
            className="input"
            value={name}
            maxLength={menu.kind === 'project' ? 120 : 40}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                rename()
                onClose()
              }
            }}
          />
          <div className="swatches">
            {COLOR_KEYS.map((c) => (
              <button
                key={c}
                className={`swatch ${item.color === c ? 'on' : ''}`}
                style={{ '--c': LABEL_COLORS[c][theme] } as CSSProperties}
                aria-label={c}
                onClick={() => recolor(c)}
              />
            ))}
          </div>
          <button className="menu-item danger" onClick={() => setConfirm(true)}>
            <Icon name="trash" size={13} />
            {menu.kind === 'project' ? tr('Xoá dự án') : tr('Xoá nhãn')}
          </button>
        </div>
      </Popover>
      {confirm && (
        <Confirm
          text={
            menu.kind === 'project'
              ? tr('Xoá dự án "{name}"? Các việc trong dự án sẽ chuyển về Hộp thư.', { name: item.name })
              : tr('Xoá nhãn "{name}"? Nhãn sẽ được gỡ khỏi mọi việc.', { name: item.name })
          }
          confirmLabel={tr('Xoá')}
          danger
          onConfirm={() => void remove()}
          onCancel={onClose}
        />
      )}
    </>
  )
}

export function Sidebar(): React.JSX.Element {
  const sel = useUi((s) => s.selection)
  const select = useUi((s) => s.select)
  const settingsOpen = useUi((s) => s.settingsOpen)
  const openSettings = useUi((s) => s.openSettings)
  const closeSettings = useUi((s) => s.closeSettings)
  const tasks = useData((s) => s.tasks)
  const projects = useData((s) => s.projects)
  const tags = useData((s) => s.tags)
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggle)
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  const now = useNow()
  const [adding, setAdding] = useState<null | 'project' | 'tag'>(null)
  const [menu, setMenu] = useState<ItemMenuState | null>(null)
  const all = useMemo(() => Object.values(tasks), [tasks])
  const counts = useMemo(() => countsFor(all, now), [all, now])
  const openCount = useMemo(() => {
    const byProject = new Map<string, number>()
    const byTag = new Map<string, number>()
    for (const t of all) {
      if (!isOpen(t)) continue
      if (t.projectId) byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + 1)
      for (const id of t.tagIds) byTag.set(id, (byTag.get(id) ?? 0) + 1)
    }
    return { byProject, byTag }
  }, [all])
  const projectList = Object.values(projects)
    .filter((p) => p.archivedAt === null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const tagList = Object.values(tags).sort((a, b) => a.name.localeCompare(b.name))
  const smartCount = (id: SmartListId): number | undefined => (id === 'done' ? undefined : counts[id])

  return (
    <nav className="sidebar" aria-label={tr('Danh sách')}>
      <div className="nav-group">
        {SMART.map((s) => (
          <NavItem
            key={s.id}
            icon={s.icon}
            label={tr(s.label)}
            count={smartCount(s.id)}
            danger={s.id === 'overdue'}
            active={sel.kind === 'smart' && sel.id === s.id}
            onClick={() => select({ kind: 'smart', id: s.id })}
          />
        ))}
      </div>

      <div className="nav-title">
        <span className="label">{tr('Dự án')}</span>
        <button className="icon-btn subtle" aria-label={tr('Thêm dự án')} onClick={() => setAdding('project')}>
          <Icon name="plus" size={14} />
        </button>
      </div>
      {adding === 'project' && (
        <NewItemInput
          placeholder={tr('Tên dự án')}
          onSubmit={(name) => void run('projects:create', { name, color: nextColor(projectList.length + 1) })}
          onDone={() => setAdding(null)}
        />
      )}
      {projectList.map((p) => (
        <NavItem
          key={p.id}
          label={p.name}
          swatch={{ color: LABEL_COLORS[p.color][theme], shape: 'dot' }}
          count={openCount.byProject.get(p.id)}
          active={sel.kind === 'project' && sel.id === p.id}
          onClick={() => select({ kind: 'project', id: p.id })}
          onMenu={(anchor) => setMenu({ kind: 'project', id: p.id, anchor })}
        />
      ))}

      <div className="nav-title">
        <span className="label">{tr('Nhãn')}</span>
        <button className="icon-btn subtle" aria-label={tr('Thêm nhãn')} onClick={() => setAdding('tag')}>
          <Icon name="plus" size={14} />
        </button>
      </div>
      {adding === 'tag' && (
        <NewItemInput
          placeholder={tr('Tên nhãn')}
          onSubmit={(name) => void run('tags:create', { name: name.replace(/^#/, '').slice(0, 40), color: nextColor(tagList.length) })}
          onDone={() => setAdding(null)}
        />
      )}
      {tagList.map((t) => (
        <NavItem
          key={t.id}
          label={t.name}
          swatch={{ color: LABEL_COLORS[t.color][theme], shape: 'hash' }}
          count={openCount.byTag.get(t.id)}
          active={sel.kind === 'tag' && sel.id === t.id}
          onClick={() => select({ kind: 'tag', id: t.id })}
          onMenu={(anchor) => setMenu({ kind: 'tag', id: t.id, anchor })}
        />
      ))}

      <div className="sidebar-foot">
        <div className="lang-switch" role="radiogroup" aria-label={tr('Ngôn ngữ')}>
          {LANGS.map((l) => (
            <button key={l.id} role="radio" aria-checked={lang === l.id} className={lang === l.id ? 'on' : ''} title={l.label} onClick={() => setLang(l.id)}>
              {l.short}
            </button>
          ))}
        </div>
        <button
          className={`icon-btn settings-btn ${settingsOpen ? 'on' : ''}`}
          onClick={() => (settingsOpen ? closeSettings() : openSettings())}
          aria-pressed={settingsOpen}
          aria-label={tr('Cài đặt (Ctrl+,)')}
          title={tr('Cài đặt (Ctrl+,)')}
        >
          <Icon name="gear" size={16} />
        </button>
        <button className="icon-btn theme-toggle" onClick={toggleTheme} aria-label={theme === 'light' ? tr('Tắt đèn') : tr('Bật đèn')} title={theme === 'light' ? tr('Tắt đèn') : tr('Bật đèn')}>
          <Icon name="sun" size={16} />
        </button>
      </div>
      {menu && <ItemMenu key={`${menu.kind}:${menu.id}`} menu={menu} onClose={() => setMenu(null)} />}
    </nav>
  )
}
