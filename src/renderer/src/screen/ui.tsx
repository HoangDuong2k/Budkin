// Thành phần giao diện dùng chung: popover (luôn nằm trong khung màn hình máy tính), hộp xác nhận
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { tr } from '../../../shared/i18n'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Khung giới hạn: vùng màn hình máy tính (popover không được tràn ra ngoài màn hình 3D) */
function screenBounds(): DOMRect {
  return (document.querySelector('.screen') ?? document.body).getBoundingClientRect()
}

interface PopoverProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
  align?: 'start' | 'end'
  className?: string
}

/**
 * Popover gắn vào một phần tử. Vẽ ở #portal-root (ngoài .screen — .screen là container query nên
 * position: fixed bên trong sẽ bị tính theo .screen), vị trí kẹp trong vùng màn hình máy tính.
 */
export function Popover({ anchor, open, onClose, children, width, align = 'start', className = '' }: PopoverProps): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const place = (): void => {
      const el = ref.current
      if (!el) return
      const a = anchor.getBoundingClientRect()
      const s = screenBounds()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const left = clamp(align === 'end' ? a.right - w : a.left, s.left + 6, s.right - 6 - w)
      let top = a.bottom + 4
      if (top + h > s.bottom - 6 && a.top - 4 - h >= s.top + 6) top = a.top - 4 - h
      setPos({ left, top: clamp(top, s.top + 6, Math.max(s.top + 6, s.bottom - 6 - h)), maxHeight: s.height - 12 })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(document.querySelector('.screen') ?? document.body)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [open, anchor, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchor, onClose])

  const root = document.getElementById('portal-root')
  if (!open || !root) return null
  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, maxHeight: pos?.maxHeight }}
      role="dialog"
    >
      {children}
    </div>,
    root
  )
}

/** Hộp xác nhận nằm trong màn hình máy tính */
export function Confirm({
  text,
  confirmLabel,
  danger,
  onConfirm,
  onCancel
}: {
  text: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  const ok = useRef<HTMLButtonElement>(null)
  useEffect(() => ok.current?.focus(), [])
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
      <div className="modal" role="alertdialog">
        <p>{text}</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>
            {tr('Huỷ')}
          </button>
          <button ref={ok} className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
