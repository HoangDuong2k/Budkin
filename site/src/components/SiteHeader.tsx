// Thanh trên dính: logo, đổi ngôn ngữ, GitHub, nút tải (React vì menu thu gọn trên điện thoại cần JS)
import { Button, Navbar } from 'momi-ui'
import { DownloadIcon, GithubIcon } from './icons'

interface Props {
  home: string
  logo: string
  download: string
  repo: string
  labels: { download: string; github: string; menu: string; switchLang: { label: string; title: string; href: string } }
}

export default function SiteHeader({ home, logo, download, repo, labels }: Props): React.JSX.Element {
  return (
    <Navbar
      variant="blur"
      sticky
      menuLabel={labels.menu}
      brand={
        <a href={home} className="flex items-center gap-2 font-semibold tracking-tight">
          <img src={logo} alt="" width={28} height={28} className="size-7" />
          Budkin
        </a>
      }
      actions={
        <>
          <Button asChild variant="ghost" size="sm">
            <a href={labels.switchLang.href} hrefLang={labels.switchLang.label.toLowerCase()} title={labels.switchLang.title}>
              {labels.switchLang.label}
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="px-2">
            <a href={repo} aria-label={labels.github} title={labels.github}>
              <GithubIcon />
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={download}>
              <DownloadIcon />
              {labels.download}
            </a>
          </Button>
        </>
      }
    />
  )
}
