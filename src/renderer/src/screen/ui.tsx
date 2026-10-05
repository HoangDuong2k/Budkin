// Thành phần giao diện dùng chung, dựng trên momi-ui: popover gắn vào một phần tử, hộp xác nhận. Cả hai vẽ bên trong
// màn hình máy tính và không tràn ra ngoài (PortalProvider ở App.tsx).
import { useRef, type ComponentProps, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  Popover as MomiPopover,
  PopoverAnchor,
  PopoverContent,
  cn
} from 'momi-ui'
import { tr } from '../../../shared/i18n'

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
 * Popover gắn vào một phần tử (nút đang bấm). Bấm ra ngoài / Esc thì đóng; bấm lại vào chính phần tử đó thì để nút
 * tự xử lý (bật / tắt), không đóng rồi mở lại ngay.
 */
export function Popover({ anchor, open, onClose, children, width, align = 'start', className = '' }: PopoverProps): React.JSX.Element | null {
  const anchorRef = useRef<HTMLElement | null>(anchor)
  anchorRef.current = anchor
  if (!anchor) return null
  return (
    <MomiPopover open={open} onOpenChange={(next) => !next && onClose()}>
      <PopoverAnchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
      <PopoverContent
        align={align}
        sideOffset={4}
        // Đóng là biến mất ngay (không chạy hiệu ứng đóng): lúc đang chạy hiệu ứng, popover vẫn bắt phím Esc —
        // bấm Esc ngay sau khi chọn sẽ bị nuốt thay vì đóng khung sửa
        className={cn('popover w-auto p-1 data-[state=closed]:animate-none!', className)}
        style={{ width }}
        onInteractOutside={(e) => {
          if (anchor.contains(e.target as Node)) e.preventDefault()
        }}
        // Giữ con trỏ ở chỗ cũ khi mở (ô nhập trong popover tự lấy focus nếu cần)
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Đóng: con trỏ về lại nút đã mở popover (Esc lần nữa thì đóng khung chứa nó, như trước)
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (anchor.isConnected) anchor.focus({ preventScroll: true })
        }}
      >
        {children}
      </PopoverContent>
    </MomiPopover>
  )
}

/** Một dòng trong menu của popover: nút ghost của momi-ui; `on` là mục đang chọn (chữ xanh ngọc), `danger` chữ đỏ */
export function MenuItem({ on, danger, className, ...props }: ComponentProps<typeof Button> & { on?: boolean; danger?: boolean }): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      tone={danger ? 'danger' : 'neutral'}
      className={cn('menu-item h-8 w-full justify-start px-2 font-normal', on && 'on font-semibold text-primary hover:text-primary', className)}
      {...props}
    />
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
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent size="sm" className="modal" aria-describedby={undefined}>
        <AlertDialogTitle className="text-sm leading-normal font-normal">{text}</AlertDialogTitle>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm">{tr('Huỷ')}</AlertDialogCancel>
          <AlertDialogAction size="sm" tone={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
