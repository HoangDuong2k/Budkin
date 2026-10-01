// Màn hình Cài đặt: phủ lên giao diện trên màn hình máy tính (Ctrl+, hoặc nút bánh răng ở thanh bên, Esc để đóng).
// Mục bên trái, thiết lập bên phải; đổi là lưu ngay, không có nút Lưu.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AiClientState, AiStatus, AppInfo, AppStatus, BackupInfo, BackupKind, BootPatch } from '../../../shared/api'
import type { ImportMode, ImportPreview } from '../../../shared/exportFormat'
import { parseTimeInput } from '../../../shared/datetime'
import { LANGS, tr, trKey } from '../../../shared/i18n'
import { ROBOT_MODELS, type RobotModel } from '../../../shared/robots'
import type { SettingsPatch } from '../../../shared/schemas'
import type { AiAccess, Quality, Settings } from '../../../shared/types'
import { useNow } from '../clock'
import { ApiError, call } from '../ipc'
import { ROBOT, ROBOT_EYES } from '../scene/palette3d'
import { renderInfo } from '../scene/renderInfo'
import { PERSONALITY } from '../scene/robots/personality'
import { playChirp, previewVoice } from '../scene/sound'
import { useAlerts } from '../state/alertStore'
import { useData } from '../state/dataStore'
import { useLang } from '../state/langStore'
import { useUi, type SettingsSection } from '../state/uiStore'
import { run } from './actions'
import { REMIND_TIMED, clockTime, fileSize, reminderText, shortDateTime, weekdayName } from './format'
import { Icon, type IconName } from './icons'
import { Confirm, Popover } from './ui'

const SECTIONS: Array<{ id: SettingsSection; icon: IconName; label: string }> = [
  { id: 'general', icon: 'gear', label: trKey('Chung') },
  { id: 'reminders', icon: 'bell', label: trKey('Nhắc việc') },
  { id: 'display', icon: 'monitor', label: trKey('Hiển thị') },
  { id: 'ai', icon: 'plug', label: trKey('Kết nối AI') },
  { id: 'data', icon: 'archive', label: trKey('Dữ liệu') },
  { id: 'about', icon: 'info', label: trKey('Thông tin') }
]

const REPO_URL = 'https://github.com/HoangDuong2k/Budkin'
const PLATFORM_NAME: Record<string, string> = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' }

function save(patch: SettingsPatch): void {
  void run('settings:update', patch)
}

function toast(text: string, tone?: 'error'): void {
  useUi.getState().toast({ text, tone })
}

// ---------- Thành phần nhỏ ----------

function Row({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <div className="set-row" data-setting={id}>
      <div className="set-text">
        <span className="set-label">{label}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function GroupTitle({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="set-group-title">{children}</div>
}

function Choice<T extends string | number | boolean | null>({
  value,
  options,
  onChange,
  label,
  disabled
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className={`segmented ${disabled ? 'disabled' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }): React.JSX.Element {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

/** Ô giờ gõ tự do như ở khung sửa việc ("9", "930", "9:30"…); sai thì trả lại giá trị cũ */
function TimeField({ value, label, onCommit }: { value: string; label: string; onCommit: (t: string) => void }): React.JSX.Element {
  const [text, setText] = useState(value)
  const [bad, setBad] = useState(false)
  useEffect(() => setText(value), [value])
  const commit = (raw: string, final: boolean): void => {
    const t = parseTimeInput(raw)
    if (!t) {
      setBad(!final)
      if (final) setText(value)
      return
    }
    setBad(false)
    setText(t)
    if (t !== value) onCommit(t)
  }
  return (
    <input
      className={`input time-input ${bad ? 'bad' : ''}`}
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        setBad(false)
      }}
      onBlur={(e) => commit(e.target.value, true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value, false)
      }}
    />
  )
}

// ---------- Chung ----------

function Volume({ value }: { value: number }): React.JSX.Element {
  const [v, setV] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => setV(value), [value])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <>
      <input
        type="range"
        className="range"
        min={0}
        max={1}
        step={0.05}
        value={v}
        aria-label={tr('Âm lượng')}
        style={{ '--p': `${v * 100}%` } as React.CSSProperties}
        onChange={(e) => {
          const next = Number(e.target.value)
          setV(next)
          // Kéo thanh trượt: ghi khi dừng tay
          clearTimeout(timer.current)
          timer.current = setTimeout(() => save({ volume: next }), 250)
        }}
      />
      <span className="readout">{Math.round(v * 100)}%</span>
      <button className="btn small ghost" onClick={() => playChirp('poke')}>
        {tr('Nghe thử')}
      </button>
    </>
  )
}

const EYE_COLOR: Record<RobotModel, string> = { budkin: ROBOT.eye, ...ROBOT_EYES }

/** Chọn robot đứng trên bàn: robot đổi ngay (chìm vào bệ, robot mới trồi lên chào), nghe thử giọng */
function RobotPicker({ value }: { value: RobotModel }): React.JSX.Element {
  return (
    <div className="robot-grid" role="radiogroup" aria-label={tr('Robot trên bàn')}>
      {ROBOT_MODELS.map((id) => (
        <button
          key={id}
          role="radio"
          aria-checked={id === value}
          className={`robot-card ${id === value ? 'on' : ''}`}
          data-robot={id}
          style={{ '--c': EYE_COLOR[id] } as React.CSSProperties}
          onClick={() => {
            save({ robot: id })
            previewVoice(id)
          }}
        >
          <span className="rc-name">
            <i className="rc-dot" />
            {PERSONALITY[id].name}
          </span>
          <span className="rc-blurb">{tr(PERSONALITY[id].blurb)}</span>
        </button>
      ))}
    </div>
  )
}

function General({ s }: { s: Settings }): React.JSX.Element {
  const lang = useLang((x) => x.lang)
  const setLang = useLang((x) => x.setLang)
  return (
    <>
      <GroupTitle>{tr('Robot trên bàn')}</GroupTitle>
      <p className="set-hint robot-hint">{tr('Mỗi robot một tính cách: dáng, giọng, lời thoại riêng. Bấm vào bệ tròn dưới chân robot để đổi nhanh.')}</p>
      <RobotPicker value={s.robot} />
      <GroupTitle>{tr('Giao diện')}</GroupTitle>
      <Row id="language" label={tr('Ngôn ngữ')}>
        <Choice value={lang} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} onChange={setLang} label={tr('Ngôn ngữ')} />
      </Row>
      <Row id="weekStart" label={tr('Tuần bắt đầu vào')} hint={tr('Dùng cho Lịch và bộ chọn ngày')}>
        <Choice
          value={s.weekStart}
          options={[
            { value: 1, label: weekdayName(1) },
            { value: 0, label: weekdayName(7) }
          ]}
          onChange={(weekStart) => save({ weekStart })}
          label={tr('Tuần bắt đầu vào')}
        />
      </Row>
      <Row id="sound" label={tr('Âm thanh')} hint={tr('Tiếng bíp của Budkin, chuông nhắc việc, tiếng công tắc đèn')}>
        <Switch on={s.sound} onChange={(sound) => save({ sound })} label={tr('Âm thanh')} />
      </Row>
      {s.sound && (
        <Row id="volume" label={tr('Âm lượng')}>
          <Volume value={s.volume} />
        </Row>
      )}
      <Row id="reducedMotion" label={tr('Giảm chuyển động')} hint={tr('Budkin không nhảy, không xoay; bật tắt đèn không có hiệu ứng chuyển cảnh')}>
        <Choice
          value={s.reducedMotion}
          options={[
            { value: 'auto', label: tr('Theo hệ thống') },
            { value: 'on', label: tr('Bật') },
            { value: 'off', label: tr('Tắt') }
          ]}
          onChange={(reducedMotion) => save({ reducedMotion })}
          label={tr('Giảm chuyển động')}
        />
      </Row>
    </>
  )
}

// ---------- Nhắc việc ----------

function Reminders({ s, status }: { s: Settings; status: AppStatus | null }): React.JSX.Element {
  const mutedUntil = useAlerts((a) => a.mutedUntil)
  const [menu, setMenu] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const noTray = status !== null && !status.trayHost
  return (
    <>
      <Row id="defaultRemind" label={tr('Nhắc mặc định')} hint={tr('Áp dụng khi đặt hạn có giờ cho một việc')}>
        <button ref={anchor} className="value-btn boxed" aria-haspopup="menu" onClick={() => setMenu(!menu)}>
          {reminderText(s.defaultRemindBeforeMin, false)}
          <Icon name="chevronDown" size={13} />
        </button>
        <Popover anchor={anchor.current} open={menu} onClose={() => setMenu(false)} width={190} align="end">
          <div className="menu">
            {[null, ...REMIND_TIMED].map((m) => (
              <button
                key={String(m)}
                className={`menu-item ${s.defaultRemindBeforeMin === m ? 'on' : ''}`}
                onClick={() => {
                  save({ defaultRemindBeforeMin: m })
                  setMenu(false)
                }}
              >
                {reminderText(m, false)}
              </button>
            ))}
          </div>
        </Popover>
      </Row>
      <Row id="allDayRemindTime" label={tr('Giờ nhắc việc cả ngày')} hint={tr('Việc có hạn nhưng không có giờ được nhắc vào giờ này')}>
        <TimeField value={s.allDayRemindTime} label={tr('Giờ nhắc việc cả ngày')} onCommit={(allDayRemindTime) => save({ allDayRemindTime })} />
      </Row>
      <Row
        id="mute"
        label={tr('Tạm tắt nhắc')}
        hint={mutedUntil ? tr('Đang tắt tới {time}. Nhắc việc vẫn được ghi nhận, chỉ không kêu, không hiện thông báo.', { time: clockTime(mutedUntil) }) : tr('Nhắc việc vẫn được ghi nhận, chỉ không kêu, không hiện thông báo')}
      >
        {mutedUntil ? (
          <button className="btn small primary" onClick={() => void run('reminders:mute', null)}>
            {tr('Bật lại')}
          </button>
        ) : (
          [60, 240, 1440].map((m) => (
            <button key={m} className="chip-btn" onClick={() => void run('reminders:mute', m)}>
              {m === 1440 ? tr('1 ngày') : tr('{n} giờ', { n: m / 60 })}
            </button>
          ))
        )}
      </Row>
      <GroupTitle>{tr('Chạy nền')}</GroupTitle>
      <Row
        id="closeToTray"
        label={tr('Khi bấm nút đóng cửa sổ')}
        hint={
          noTray
            ? tr('Máy chưa có khay hệ thống nên "Chạy nền" sẽ thu nhỏ cửa sổ. Trên Ubuntu: cài gnome-shell-extension-appindicator rồi bật "Ubuntu AppIndicators".')
            : tr('Chạy nền để Budkin vẫn nhắc việc đúng giờ')
        }
      >
        <Choice
          value={s.closeToTray}
          options={[
            { value: true, label: tr('Chạy nền') },
            { value: false, label: tr('Thoát hẳn') },
            { value: null, label: tr('Hỏi mỗi lần') }
          ]}
          onChange={(closeToTray) => save({ closeToTray })}
          label={tr('Khi bấm nút đóng cửa sổ')}
        />
      </Row>
      <Row
        id="autostart"
        label={tr('Khởi động cùng máy')}
        hint={status && !status.packaged ? tr('Chỉ có tác dụng với bản đã cài đặt') : tr('Chạy ẩn để nhắc việc ngay khi mở máy')}
      >
        <Switch on={s.autostart} onChange={(autostart) => save({ autostart })} label={tr('Khởi động cùng máy')} />
      </Row>
    </>
  )
}

// ---------- Hiển thị ----------

/** Lần chạy này đang vẽ thế nào (và vì sao, nếu phải dùng 2D) */
function runningText(): string {
  if (renderInfo.mode === '3d') return renderInfo.software ? tr('3D, vẽ bằng CPU') : tr('3D, vẽ bằng GPU')
  switch (renderInfo.reason) {
    case 'no-webgl':
      return tr('2D (máy không có WebGL)')
    case 'gpu-crashes':
      return tr('2D (GPU gặp lỗi nhiều lần)')
    case 'context-lost':
    case 'error':
      return tr('2D (cảnh 3D gặp lỗi)')
    default:
      return tr('2D')
  }
}

const QUALITY_HINT: Record<Quality, string> = {
  high: trKey('Bóng đổ sắc nét, chuyển động mượt nhất — tốn pin hơn'),
  balanced: trKey('Cân đối giữa đẹp và tiết kiệm pin'),
  saver: trKey('Vẽ ít nhất, không đổ bóng — hợp máy yếu, chạy pin')
}

function Display({ s, status, setStatus }: { s: Settings; status: AppStatus | null; setStatus: (s: AppStatus) => void }): React.JSX.Element {
  const flat = renderInfo.mode !== '3d'
  const setBoot = (patch: BootPatch): void => {
    void run('app:setBoot', patch).then((r) => r.ok && setStatus(r.value))
  }
  const pending = status !== null && (status.boot.render !== status.running.render || status.boot.xwayland !== status.running.xwayland)
  return (
    <>
      <Row
        id="quality"
        label={tr('Chất lượng 3D')}
        hint={flat ? tr('Đang dùng giao diện 2D') : renderInfo.software ? tr('Đang vẽ bằng CPU nên luôn ở mức Tiết kiệm') : tr(QUALITY_HINT[s.quality])}
      >
        <Choice
          value={s.quality}
          options={[
            { value: 'high', label: tr('Cao') },
            { value: 'balanced', label: tr('Cân bằng') },
            { value: 'saver', label: tr('Tiết kiệm') }
          ]}
          onChange={(quality) => save({ quality })}
          label={tr('Chất lượng 3D')}
          disabled={flat || renderInfo.software}
        />
      </Row>
      <Row
        id="render"
        label={tr('Chế độ hiển thị')}
        hint={
          <>
            {tr('Đang chạy:')} <span className="readout">{runningText()}</span>
          </>
        }
      >
        {status && (
          <Choice
            value={status.boot.render}
            options={[
              { value: 'auto', label: tr('Tự động') },
              { value: 'software', label: tr('3D bằng CPU') },
              { value: '2d', label: tr('Chỉ 2D') }
            ]}
            onChange={(render) => setBoot({ render })}
            label={tr('Chế độ hiển thị')}
          />
        )}
      </Row>
      {status && (status.wayland || status.running.xwayland) && (
        <Row id="xwayland" label={tr('Chạy qua XWayland')} hint={tr('Thử bật khi gõ tiếng Việt hoặc hình ảnh trên Wayland bị lỗi')}>
          <Switch on={status.boot.xwayland} onChange={(xwayland) => setBoot({ xwayland })} label={tr('Chạy qua XWayland')} />
        </Row>
      )}
      {pending && (
        <div className="set-notice" role="status">
          <Icon name="power" size={15} />
          <span className="grow">{tr('Cần khởi động lại Budkin để áp dụng.')}</span>
          <button className="btn small primary" onClick={() => void run('app:relaunch')}>
            {tr('Khởi động lại')}
          </button>
        </div>
      )}
    </>
  )
}

// ---------- Dữ liệu ----------

const KIND_LABEL: Record<BackupKind, string> = {
  daily: trKey('Hằng ngày'),
  manual: trKey('Tự sao lưu'),
  'before-import': trKey('Trước khi nhập'),
  'before-restore': trKey('Trước khi khôi phục'),
  'pre-migration': trKey('Trước khi nâng cấp')
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Chọn cách nhập: Gộp hay Thay thế (thay thế phải xác nhận thêm một bước) */
function ImportDialog({ preview, busy, onApply, onCancel }: { preview: ImportPreview; busy: boolean; onApply: (mode: ImportMode) => void; onCancel: () => void }): React.JSX.Element {
  const now = useNow()
  const localTasks = useData((s) => Object.keys(s.tasks).length)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [confirmReplace])
  const c = preview.counts
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="modal import-modal" role="alertdialog" aria-label={tr('Nhập dữ liệu')}>
        <div className="modal-kicker">{tr('Nhập dữ liệu')}</div>
        <p className="import-file">
          <Icon name="note" size={15} />
          <span>{preview.fileName}</span>
        </p>
        <p className="import-meta">
          {tr('Xuất lúc {when}', { when: shortDateTime(preview.exportedAt, now.date) })} · {tr('{tasks} việc, {projects} dự án, {tags} nhãn', { ...c })}
        </p>
        {confirmReplace ? (
          <>
            <p>{tr('Xoá toàn bộ dữ liệu đang có trên máy và thay bằng dữ liệu trong file?')}</p>
            <div className="modal-actions">
              <button ref={first} className="btn ghost" onClick={() => setConfirmReplace(false)} disabled={busy}>
                {tr('Quay lại')}
              </button>
              <button className="btn danger" onClick={() => onApply('replace')} disabled={busy}>
                {tr('Thay thế')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="import-options">
              <button ref={first} className="import-opt" data-mode="merge" onClick={() => onApply('merge')} disabled={busy}>
                <span className="opt-title">{tr('Gộp')}</span>
                <span className="opt-hint">{tr('Giữ dữ liệu trên máy; thêm việc mới và lấy bản sửa mới hơn từ file')}</span>
              </button>
              <button className="import-opt danger" data-mode="replace" onClick={() => (localTasks ? setConfirmReplace(true) : onApply('replace'))} disabled={busy}>
                <span className="opt-title">{tr('Thay thế')}</span>
                <span className="opt-hint">{tr('Bỏ dữ liệu trên máy, dùng đúng dữ liệu trong file')}</span>
              </button>
            </div>
            <p className="set-hint">{tr('Budkin tự sao lưu trước khi nhập — nhập nhầm thì khôi phục lại được.')}</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={onCancel} disabled={busy}>
                {tr('Huỷ')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DataSection({ status }: { status: AppStatus | null }): React.JSX.Element {
  const now = useNow()
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [restore, setRestore] = useState<BackupInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = (): void => {
    call('data:backups')
      .then(setBackups)
      .catch(() => setBackups([]))
  }
  useEffect(refresh, [])

  const exportData = async (): Promise<void> => {
    const r = await run('data:export')
    if (r.ok && r.value) toast(tr('Đã xuất {n} việc ra {file}', { n: r.value.counts.tasks, file: baseName(r.value.path) }))
  }
  const pick = async (): Promise<void> => {
    try {
      const p = await call('data:importPick')
      if (p) setPreview(p)
    } catch (err) {
      // Lý do từ main (file lạ, file hỏng, bản mới hơn…) đã dịch sẵn
      toast(err instanceof ApiError ? err.message : String(err), 'error')
    }
  }
  const apply = async (mode: ImportMode): Promise<void> => {
    if (!preview) return
    setBusy(true)
    const r = await run('data:importApply', preview.token, mode)
    setBusy(false)
    setPreview(null)
    if (!r.ok) return
    const t = r.value.tasks
    toast(mode === 'replace' ? tr('Đã thay dữ liệu bằng file: {n} việc', { n: preview.counts.tasks }) : tr('Đã gộp: {added} việc mới, {updated} việc được cập nhật', { added: t.added, updated: t.updated }))
    refresh()
  }
  const backupNow = async (): Promise<void> => {
    const r = await run('data:backupNow')
    if (r.ok) {
      toast(tr('Đã sao lưu'))
      refresh()
    }
  }

  return (
    <>
      <GroupTitle>{tr('Chuyển dữ liệu')}</GroupTitle>
      <Row id="export" label={tr('Xuất dữ liệu')} hint={tr('Toàn bộ việc, dự án, nhãn ra một file JSON — để cất giữ hoặc chuyển sang máy khác')}>
        <button className="btn small" onClick={() => void exportData()}>
          <Icon name="download" size={14} />
          {tr('Xuất file…')}
        </button>
      </Row>
      <Row id="import" label={tr('Nhập dữ liệu')} hint={tr('Từ file JSON đã xuất: gộp với dữ liệu trên máy hoặc thay thế')}>
        <button className="btn small" onClick={() => void pick()}>
          <Icon name="upload" size={14} />
          {tr('Chọn file…')}
        </button>
      </Row>

      <GroupTitle>{tr('Sao lưu tự động')}</GroupTitle>
      <div className="backup-bar">
        <span className="set-hint grow">{tr('Mỗi ngày một bản, giữ 7 ngày gần nhất. Khôi phục thì Budkin khởi động lại.')}</span>
        <button className="btn small" onClick={() => void backupNow()}>
          {tr('Sao lưu ngay')}
        </button>
        <button className="btn small ghost" onClick={() => void run('data:openFolder', 'backups')}>
          {tr('Mở thư mục')}
        </button>
      </div>
      {backups && backups.length === 0 && <p className="set-hint backup-empty">{tr('Chưa có bản sao lưu nào.')}</p>}
      {backups && backups.length > 0 && (
        <ul className="backup-list">
          {backups.map((b) => (
            <li key={b.name} data-backup={b.name}>
              <span className="b-when">{shortDateTime(b.createdAt, now.date)}</span>
              <span className="b-kind">{tr(KIND_LABEL[b.kind])}</span>
              <span className="b-size">{fileSize(b.size)}</span>
              <button className="btn small ghost" onClick={() => setRestore(b)}>
                <Icon name="restore" size={13} />
                {tr('Khôi phục')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <GroupTitle>{tr('Nơi lưu')}</GroupTitle>
      <Row id="dataDir" label={tr('Thư mục dữ liệu')} hint={status ? <span className="path">{status.dataDir}</span> : undefined}>
        <button className="btn small ghost" onClick={() => void run('data:openFolder', 'data')}>
          {tr('Mở')}
        </button>
      </Row>

      {preview && <ImportDialog preview={preview} busy={busy} onApply={(m) => void apply(m)} onCancel={() => setPreview(null)} />}
      {restore && (
        <Confirm
          text={tr('Khôi phục bản sao lưu lúc {when}? Budkin sẽ khởi động lại. Dữ liệu hiện tại được giữ trong một bản sao lưu riêng.', {
            when: shortDateTime(restore.createdAt, now.date)
          })}
          confirmLabel={tr('Khôi phục')}
          onConfirm={() => {
            const name = restore.name
            setRestore(null)
            void run('data:restoreBackup', name)
          }}
          onCancel={() => setRestore(null)}
        />
      )}
    </>
  )
}

// ---------- Kết nối AI ----------

const CLAUDE_DOWNLOAD = 'https://claude.ai/download'

const ACCESS_HINT: Record<AiAccess, string> = {
  off: trKey('Claude không đọc được gì trong Budkin, kể cả khi đã kết nối'),
  read: trKey('Claude xem được việc, dự án, nhãn nhưng không thêm, sửa hay xoá'),
  full: trKey('Claude xem, thêm, sửa, xoá việc. Mỗi lần thay đổi Budkin đều báo và cho hoàn tác')
}

const STATE_LABEL: Record<AiClientState, string> = {
  missing: trKey('Chưa cài trên máy'),
  available: trKey('Chưa kết nối'),
  connected: trKey('Đã kết nối'),
  outdated: trKey('Cần cập nhật')
}

const AI_EXAMPLES = [
  trKey('Hôm nay tôi có những việc gì?'),
  trKey('Thêm việc gọi điện cho mẹ lúc 8 giờ tối mai'),
  trKey('Dời các việc quá hạn sang thứ Hai tuần sau'),
  trKey('Chia việc "Chuyển nhà" thành các bước nhỏ'),
  trKey('Tuần qua tôi đã làm xong những gì?')
]

function copyText(text: string): void {
  void run('app:copy', text).then((r) => r.ok && toast(tr('Đã chép')))
}

function ClientState({ state }: { state: AiClientState }): React.JSX.Element {
  return (
    <span className={`ai-state ${state}`}>
      <i />
      {tr(STATE_LABEL[state])}
    </span>
  )
}

function ConnectButton({ state, busy, onClick }: { state: AiClientState; busy: boolean; onClick: () => void }): React.JSX.Element {
  const label = state === 'outdated' ? tr('Cập nhật') : state === 'connected' ? tr('Kết nối lại') : tr('Kết nối')
  return (
    <button className={`btn small ${state === 'connected' ? 'ghost' : 'primary'}`} disabled={busy} onClick={onClick}>
      {busy ? tr('Đang kết nối…') : label}
    </button>
  )
}

function AiSection({ s }: { s: Settings }): React.JSX.Element {
  const now = useNow()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [busy, setBusy] = useState<'desktop' | 'code' | null>(null)
  useEffect(() => {
    call('ai:status')
      .then(setStatus)
      .catch(() => undefined)
  }, [])

  const connect = async (target: 'desktop' | 'code'): Promise<void> => {
    setBusy(target)
    const r = await run('ai:connect', target)
    setBusy(null)
    if (!r.ok) return
    setStatus(r.value)
    toast(
      target === 'desktop'
        ? tr('Đã thêm Budkin vào Claude Desktop. Thoát hẳn rồi mở lại Claude Desktop để dùng.')
        : tr('Đã thêm Budkin vào Claude Code. Mở một phiên Claude Code mới để dùng.')
    )
  }

  const desktop = status?.desktop
  const code = status?.code
  const desktopHint: Record<AiClientState, ReactNode> = {
    missing: (
      <>
        {tr('Chưa thấy Claude Desktop trên máy này.')}{' '}
        <a href={CLAUDE_DOWNLOAD} target="_blank" rel="noreferrer">
          {tr('Tải Claude Desktop')}
        </a>
      </>
    ),
    available: tr('Thêm Budkin vào danh sách công cụ của Claude Desktop'),
    connected: tr('Chưa thấy Budkin trong Claude Desktop? Thoát hẳn Claude Desktop (cả ở khay hệ thống) rồi mở lại'),
    outdated: tr('Budkin đã đổi chỗ cài. Bấm Cập nhật để Claude tìm đúng chỗ')
  }
  const codeHint: Record<AiClientState, string> = {
    missing: tr('Không thấy lệnh claude trên máy. Cài Claude Code rồi chạy lệnh dưới đây trong terminal'),
    available: tr('Dùng được ở mọi thư mục làm việc. Cũng có thể tự chạy lệnh dưới đây'),
    connected: tr('Gõ /mcp trong Claude Code để xem Budkin đã kết nối chưa'),
    outdated: tr('Budkin đã đổi chỗ cài. Bấm Cập nhật để Claude tìm đúng chỗ')
  }
  const manual = status ? JSON.stringify({ mcpServers: { budkin: status.launch } }, null, 2) : ''

  return (
    <>
      <p className="set-hint ai-intro">
        {tr('Trò chuyện với Claude trong Claude Desktop hoặc Claude Code để hỏi việc hôm nay, thêm, dời hay đánh dấu xong việc trong Budkin. Dùng gói Claude bạn đang có, Budkin không tốn thêm phí.')}
      </p>
      <Row id="aiAccess" label={tr('Quyền của Claude')} hint={tr(ACCESS_HINT[s.aiAccess])}>
        <Choice<AiAccess>
          value={s.aiAccess}
          options={[
            { value: 'off', label: tr('Tắt') },
            { value: 'read', label: tr('Chỉ xem') },
            { value: 'full', label: tr('Xem và sửa') }
          ]}
          onChange={(aiAccess) => save({ aiAccess })}
          label={tr('Quyền của Claude')}
        />
      </Row>

      <GroupTitle>{tr('Ứng dụng')}</GroupTitle>
      {!status && <p className="set-hint">{tr('Đang kiểm tra…')}</p>}
      {desktop && code && (
        <ul className="ai-clients">
          <li data-client="desktop" data-state={desktop.state}>
            <div className="ai-client-text">
              <span className="ai-client-head">
                <span className="ai-client-name">Claude Desktop</span>
                <ClientState state={desktop.state} />
              </span>
              <span className="set-hint">{desktopHint[desktop.state]}</span>
            </div>
            {desktop.state !== 'missing' && <ConnectButton state={desktop.state} busy={busy === 'desktop'} onClick={() => void connect('desktop')} />}
          </li>
          <li data-client="code" data-state={code.state}>
            <div className="ai-client-text">
              <span className="ai-client-head">
                <span className="ai-client-name">Claude Code</span>
                <ClientState state={code.state} />
              </span>
              <span className="set-hint">{codeHint[code.state]}</span>
              <div className="ai-command">
                <code>{code.command}</code>
                <button className="icon-btn" onClick={() => copyText(code.command)} aria-label={tr('Chép lệnh')} title={tr('Chép lệnh')}>
                  <Icon name="copy" size={14} />
                </button>
              </div>
            </div>
            {code.cli && <ConnectButton state={code.state} busy={busy === 'code'} onClick={() => void connect('code')} />}
          </li>
        </ul>
      )}

      <GroupTitle>{tr('Thử hỏi Claude')}</GroupTitle>
      <div className="ai-examples">
        {AI_EXAMPLES.map((q) => (
          <button key={q} className="chip-btn" title={tr('Bấm để chép')} onClick={() => copyText(tr(q))}>
            {tr(q)}
          </button>
        ))}
      </div>
      {status?.lastUse && (
        <p className="set-hint ai-last">
          {tr('Lần dùng gần nhất')}{' '}
          <span className="readout">
            {status.lastUse.client} · {shortDateTime(status.lastUse.at, now.date)}
          </span>
        </p>
      )}
      {status && (
        <details className="ai-other">
          <summary>{tr('Ứng dụng AI khác có hỗ trợ MCP')}</summary>
          <p className="set-hint">{tr('Thêm một máy chủ MCP kiểu stdio với cấu hình sau:')}</p>
          <div className="ai-command block">
            <code>{manual}</code>
            <button className="icon-btn" onClick={() => copyText(manual)} aria-label={tr('Chép cấu hình')} title={tr('Chép cấu hình')}>
              <Icon name="copy" size={14} />
            </button>
          </div>
        </details>
      )}
    </>
  )
}

// ---------- Thông tin ----------

function About(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    call('app:info')
      .then(setInfo)
      .catch(() => undefined)
  }, [])
  const specs: Array<[string, string]> = info
    ? [
        [tr('Phiên bản'), info.version],
        ['Electron', info.electron],
        ['Chromium', info.chrome],
        ['Node.js', info.node],
        ['SQLite', info.sqlite],
        [tr('Hệ điều hành'), PLATFORM_NAME[info.platform] ?? info.platform],
        [tr('Đồ hoạ'), renderInfo.renderer || runningText()]
      ]
    : []
  return (
    <>
      <div className="about-hero">
        <div className="about-mark">Budkin</div>
        <p className="set-hint">{tr('Người bạn nhỏ trên bàn làm việc: nhắc việc đúng giờ, không cần tài khoản, dữ liệu chỉ nằm trên máy bạn.')}</p>
      </div>
      <dl className="about-specs">
        {specs.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <a className="btn small ghost about-link" href={REPO_URL} target="_blank" rel="noreferrer">
        <Icon name="globe" size={14} />
        {tr('Mã nguồn trên GitHub')}
      </a>
    </>
  )
}

// ---------- Khung ----------

export function SettingsPanel(): React.JSX.Element | null {
  const section = useUi((s) => s.settingsSection)
  const openSettings = useUi((s) => s.openSettings)
  const close = useUi((s) => s.closeSettings)
  const settings = useData((s) => s.settings)
  const [status, setStatus] = useState<AppStatus | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    call('app:status')
      .then(setStatus)
      .catch(() => undefined)
  }, [])
  if (!settings) return null
  const current = SECTIONS.find((x) => x.id === section) ?? SECTIONS[0]
  return (
    <div className="settings" role="dialog" aria-label={tr('Cài đặt')} ref={ref} tabIndex={-1}>
      <header className="settings-head">
        <h2>{tr('Cài đặt')}</h2>
        <span className="settings-crumb">/ {tr(current.label)}</span>
        <div className="grow" />
        <button className="icon-btn" onClick={close} aria-label={tr('Đóng cài đặt (Esc)')} title={tr('Đóng cài đặt (Esc)')}>
          <Icon name="x" />
        </button>
      </header>
      <nav className="settings-nav" role="tablist" aria-label={tr('Mục cài đặt')}>
        {SECTIONS.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={x.id === section} className={x.id === section ? 'on' : ''} data-section={x.id} onClick={() => openSettings(x.id)}>
            <span className="num">{String(i + 1).padStart(2, '0')}</span>
            <Icon name={x.icon} size={15} />
            <span className="label">{tr(x.label)}</span>
          </button>
        ))}
      </nav>
      <div className="settings-body" role="tabpanel" data-section={section}>
        {section === 'general' && <General s={settings} />}
        {section === 'reminders' && <Reminders s={settings} status={status} />}
        {section === 'display' && <Display s={settings} status={status} setStatus={setStatus} />}
        {section === 'ai' && <AiSection s={settings} />}
        {section === 'data' && <DataSection status={status} />}
        {section === 'about' && <About />}
      </div>
    </div>
  )
}
