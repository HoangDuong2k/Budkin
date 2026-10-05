// Thân trang giới thiệu: phần mở đầu, các phần câu hỏi, chân trang. Vẽ sẵn thành HTML lúc build (không cần JS).
import { AppWindowFrame, BackgroundPattern, Button, Container, Footer, SectionHeader } from 'momi-ui'
import type { Dict, Section } from '../i18n/vi'
import { DownloadIcon, GithubIcon } from './icons'

export interface Img {
  src: string
  width: number
  height: number
}

interface Props {
  t: Dict
  /** Ảnh chụp đã tối ưu, theo tên file trong docs/screenshots */
  shots: Record<string, Img>
  /** 5 robot đứng thành hàng */
  robots: (Img & { name: string })[]
  download: string
  repo: string
}

function Shot({ img, alt, priority }: { img: Img; alt: string; priority?: boolean }): React.JSX.Element {
  return (
    <img
      src={img.src}
      width={img.width}
      height={img.height}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className="block h-auto w-full"
    />
  )
}

function Media({ s, shots, robots }: { s: Section; shots: Props['shots']; robots: Props['robots'] }): React.JSX.Element | null {
  if (s.id === 'robot') {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-sunken px-4 pt-8 pb-4">
        <BackgroundPattern variant="dots" />
        <ul className="relative grid grid-cols-5 items-end gap-2">
          {robots.map((r) => (
            <li key={r.name} className="flex flex-col items-center gap-2">
              <img src={r.src} width={r.width} height={r.height} alt={r.name} loading="lazy" decoding="async" className="h-auto w-full" />
              <span className="robot-name">{r.name}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const img = s.shot && shots[s.shot.src]
  if (!img || !s.shot) return null
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/30">
      <Shot img={img} alt={s.shot.alt} />
    </figure>
  )
}

export default function LandingBody({ t, shots, robots, download, repo }: Props): React.JSX.Element {
  const total = String(t.sections.length).padStart(2, '0')
  return (
    <>
      <main>
        {/* Mở đầu: lời giới thiệu, nút tải, ảnh bàn làm việc trong khung cửa sổ */}
        <section className="relative isolate overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
          <BackgroundPattern variant="grid" fade="top" />
          <div className="hero-glow" aria-hidden />
          <Container size="xl" className="flex flex-col items-center text-center">
            <p className="eyebrow">
              <span className="led" aria-hidden />
              {t.hero.eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">{t.hero.title}</h1>
            <p className="mt-6 max-w-2xl text-pretty text-muted-foreground sm:text-lg">{t.hero.description}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <a href={download}>
                  <DownloadIcon />
                  {t.hero.download}
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={repo}>
                  <GithubIcon />
                  {t.hero.source}
                </a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t.hero.footnote}</p>
            <AppWindowFrame variant="minimal" title="Budkin" glow className="mt-14 w-full max-w-5xl text-left">
              <Shot img={shots[t.hero.shot.src]} alt={t.hero.shot.alt} priority />
            </AppWindowFrame>
          </Container>
        </section>

        {/* Mỗi phần là một câu hỏi (cũng là mục lục của robot ở góc) */}
        {t.sections.map((s, i) => (
          <section key={s.id} id={s.id} tabIndex={-1} className="border-t border-border py-20 outline-none md:py-28">
            <Container size="xl" className={s.shot || s.id === 'robot' ? 'grid items-center gap-10 lg:grid-cols-2 lg:gap-16' : ''}>
              <div className={i % 2 && (s.shot || s.id === 'robot') ? 'lg:order-2' : ''}>
                <SectionHeader
                  as="h2"
                  align="start"
                  eyebrow={
                    <span className="eyebrow">
                      {String(i + 1).padStart(2, '0')} / {total}
                    </span>
                  }
                  title={s.question}
                  description={s.answer}
                />
                {s.id === 'price' && (
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button asChild size="lg">
                      <a href={download}>
                        <DownloadIcon />
                        {t.hero.download}
                      </a>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <a href={repo}>
                        <GithubIcon />
                        {t.hero.source}
                      </a>
                    </Button>
                  </div>
                )}
              </div>
              <Media s={s} shots={shots} robots={robots} />
            </Container>
          </section>
        ))}
      </main>
      <Footer
        brand={<span className="font-semibold">Budkin</span>}
        description={t.footer.tagline}
        copyright={`© 2026 ${t.footer.madeBy}. ${t.footer.license}`}
        legal={[
          { label: 'GitHub', href: repo, external: true },
          { label: 'Releases', href: download, external: true },
          { label: 'MIT', href: `${repo}/blob/main/LICENSE`, external: true }
        ]}
        className="pb-40"
      />
    </>
  )
}
