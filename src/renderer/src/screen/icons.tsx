// Biểu tượng nét mảnh 24×24 (vẽ tay bằng path, không dùng font icon hay tải ngoài)
import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'plus'
  | 'search'
  | 'x'
  | 'check'
  | 'calendar'
  | 'clock'
  | 'bell'
  | 'repeat'
  | 'flag'
  | 'folder'
  | 'hash'
  | 'trash'
  | 'chevronDown'
  | 'chevronRight'
  | 'chevronLeft'
  | 'sun'
  | 'upcoming'
  | 'alert'
  | 'inbox'
  | 'checkCircle'
  | 'gear'
  | 'list'
  | 'kanban'
  | 'expand'
  | 'collapse'
  | 'dots'
  | 'sidebar'
  | 'note'
  | 'checklist'
  | 'globe'
  | 'grip'
  | 'skip'
  | 'download'
  | 'upload'
  | 'archive'
  | 'restore'
  | 'monitor'
  | 'volume'
  | 'info'
  | 'power'
  | 'plug'
  | 'copy'

const PATHS: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  repeat: (
    <>
      <path d="M4.5 11V9.5a3 3 0 0 1 3-3h11" />
      <path d="m15.5 3.5 3 3-3 3" />
      <path d="M19.5 13v1.5a3 3 0 0 1-3 3h-11" />
      <path d="m8.5 20.5-3-3 3-3" />
    </>
  ),
  flag: <path d="M6 21V4M6 4.5h10.5l-2 4 2 4H6" />,
  skip: <path d="M6 5l8 7-8 7M18 5v14" />,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  hash: <path d="M9.5 4 7.5 20M16.5 4l-2 16M5 9h15M4 15h15" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12.5" />
    </>
  ),
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevronRight: <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  chevronLeft: <path d="m14.5 6.5-5.5 5.5 5.5 5.5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  upcoming: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4M9 15h6M13 13l2 2-2 2" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13.5 6 5.5h12l2.5 8v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M3.5 13.5h5l1 2h5l1-2h5" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12.3 2.8 2.8L16.2 9.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8l1.6 2.3 2.8-.5.9 2.7 2.6 1.1-.5 2.8 1.8 2.2-1.8 2.2.5 2.8-2.6 1.1-.9 2.7-2.8-.5L12 21.2l-1.6-2.3-2.8.5-.9-2.7-2.6-1.1.5-2.8L2.8 12l1.8-2.2-.5-2.8 2.6-1.1.9-2.7 2.8.5z" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5" />,
  kanban: (
    <>
      <rect x="3.5" y="4" width="4.5" height="16" rx="1.5" />
      <rect x="9.75" y="4" width="4.5" height="11" rx="1.5" />
      <rect x="16" y="4" width="4.5" height="7" rx="1.5" />
    </>
  ),
  expand: <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />,
  collapse: <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />,
  dots: <path d="M6 12h.5M12 12h.5M18 12h.5" />,
  sidebar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  note: <path d="M5.5 4.5h13v11l-4 4h-9zM14.5 19.5v-4h4M8.5 9h7M8.5 12.5h4" />,
  checklist: <path d="m4 6.5 1.5 1.5 3-3M4 13.5 5.5 15l3-3M11.5 7h8.5M11.5 14h8.5M4.5 19.5h.5M11.5 19.5h8.5" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.3 3.5 5.2 3.5 8.5s-1 6.2-3.5 8.5c-2.5-2.3-3.5-5.2-3.5-8.5s1-6.2 3.5-8.5z" />
    </>
  ),
  grip: <path d="M9 6.5h.5M14.5 6.5h.5M9 12h.5M14.5 12h.5M9 17.5h.5M14.5 17.5h.5" />,
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />,
  upload: <path d="M12 15.5v-11M7.5 9 12 4.5 16.5 9M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />,
  archive: (
    <>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </>
  ),
  restore: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4.5V9H9M12 8v4.2l2.8 1.8" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  volume: <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.3" />
    </>
  ),
  power: <path d="M12 3.5v8M7 6.5a7 7 0 1 0 10 0" />,
  plug: <path d="M9 3.5v4.5M15 3.5v4.5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5v4" />,
  copy: <path d="M8.5 8.5h10v11h-10zM15.5 8.5v-4h-10v11h3" />
}

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'dots' || name === 'grip' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
