// Thân trang giới thiệu: phần mở đầu, các phần câu hỏi, chân trang. Vẽ sẵn thành HTML lúc build (không cần JS).
import { AppWindowFrame, BackgroundPattern, Button, Card, CardDescription, CardHeader, CardTitle, Container, Footer, SectionHeader } from 'momi-ui'
import type { Dict, Point, Section, Shot as ShotInfo } from '../i18n/vi'
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

function Shot({ img, shot, priority }: { img: Img; shot: ShotInfo; priority?: boolean }): React.JSX.Element {
  const image = (style?: React.CSSProperties): React.JSX.Element => (
    <img
      src={img.src}
      width={img.width}
      height={img.height}
      alt={shot.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={style ? 'absolute max-w-none' : 'block h-auto w-full'}
      style={style}
    />
  )
  const c = shot.crop
  if (!c) return image()
  // Cắt cận: khung theo tỉ lệ của vùng cần giữ, ảnh phóng to rồi dịch sao cho vùng đó lấp kín khung
  return (
    <div className="relative overflow-hidden" style={{ aspectRatio: `${c.w * img.width} / ${c.h * img.height}` }}>
      {image({ width: `${100 / c.w}%`, left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%` })}
    </div>
  )
}

/** Nhãn nhỏ ở góc ảnh (kiểu chữ kẻ khuôn như nhãn trong app) */
function Label({ text }: { text: string }): React.JSX.Element {
  return <span className="shot-label">{text}</span>
}

function Figure({ img, shot, className }: { img: Img; shot: ShotInfo; className: string }): React.JSX.Element {
  return (
    <figure className={`overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <Shot img={img} shot={shot} />
      {shot.label && <Label text={shot.label} />}
    </figure>
  )
}

function Media({ s, shots, robots }: { s: Section; shots: Props['shots']; robots: Props['robots'] }): React.JSX.Element | null {
  if (s.id === 'robots') {
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
  const inset = s.inset && shots[s.inset.src]
  if (!inset || !s.inset) return <Figure img={img} shot={s.shot} className="relative shadow-lg shadow-black/30" />
  // Hai ảnh để so sánh: ảnh nhỏ chồng lên góc dưới bên phải ảnh chính
  return (
    <div className="relative pb-[18%]">
      <Figure img={img} shot={s.shot} className="relative shadow-lg shadow-black/30" />
      <Figure img={inset} shot={s.inset} className="absolute right-0 bottom-0 w-[52%] shadow-2xl shadow-black/60 ring-1 ring-black/40 sm:-right-4" />
    </div>
  )
}

/** Các ý chính dưới câu trả lời: chấm LED, phần in đậm rồi lời giải thích */
function Points({ items }: { items: Point[] }): React.JSX.Element {
  return (
    <ul className="mt-8 space-y-3.5">
      {items.map((p) => (
        <li key={p.title} className="flex gap-3 text-pretty text-muted-foreground">
          <span className="led mt-2.5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold text-foreground">{p.title}</strong>
            {': '}
            {p.text}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Nút tải (và nút xem mã nguồn, trừ khi `downloadOnly`) */
function Actions({ t, download, repo, center, downloadOnly }: { t: Dict; download: string; repo: string; center?: boolean; downloadOnly?: boolean }): React.JSX.Element {
  return (
    <div className={`mt-8 flex flex-wrap gap-3 ${center ? 'justify-center' : ''}`}>
      <Button asChild size="lg">
        <a href={download}>
          <DownloadIcon />
          {t.hero.download}
        </a>
      </Button>
      {!downloadOnly && (
        <Button asChild size="lg" variant="outline">
          <a href={repo}>
            <GithubIcon />
            {t.hero.source}
          </a>
        </Button>
      )}
    </div>
  )
}

export default function LandingBody({ t, shots, robots, download, repo }: Props): React.JSX.Element {
  const total = String(t.sections.length).padStart(2, '0')
  const eyebrow = (i: number): React.JSX.Element => (
    <span className="eyebrow">
      {String(i + 1).padStart(2, '0')} / {total}
    </span>
  )
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
            <Actions t={t} download={download} repo={repo} center />
            <p className="mt-4 text-sm text-muted-foreground">{t.hero.footnote}</p>
            <AppWindowFrame variant="minimal" title="Budkin" glow className="mt-14 w-full max-w-5xl text-left">
              <Shot img={shots[t.hero.shot.src]} shot={t.hero.shot} priority />
            </AppWindowFrame>
          </Container>
        </section>

        {/* Mỗi phần là một câu hỏi (cũng là mục lục của robot ở góc) */}
        {t.sections.map((s, i) => {
          const media = !!s.shot || s.id === 'robots'
          return (
            <section key={s.id} id={s.id} tabIndex={-1} className="border-t border-border py-20 outline-none md:py-28">
              {s.platforms ? (
                // Cài đặt: câu trả lời ở trên, mỗi hệ điều hành một thẻ
                <Container size="xl">
                  <SectionHeader as="h2" align="start" eyebrow={eyebrow(i)} title={s.question} description={s.answer} />
                  <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {s.platforms.map((p) => (
                      <li key={p.title} className="flex">
                        <Card variant="outline" className="w-full bg-card/60">
                          <CardHeader>
                            <CardTitle className="eyebrow">{p.title}</CardTitle>
                            <CardDescription className="text-pretty">{p.text}</CardDescription>
                          </CardHeader>
                        </Card>
                      </li>
                    ))}
                  </ul>
                  <Actions t={t} download={download} repo={repo} downloadOnly />
                </Container>
              ) : media ? (
                <Container size="xl" className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                  <div className={i % 2 ? 'lg:order-2' : ''}>
                    <SectionHeader as="h2" align="start" eyebrow={eyebrow(i)} title={s.question} description={s.answer} />
                    {s.points && <Points items={s.points} />}
                  </div>
                  <Media s={s} shots={shots} robots={robots} />
                </Container>
              ) : (
                // Phần không có ảnh (lời kết): canh giữa, kèm nút tải
                <Container size="md" className="flex flex-col items-center text-center">
                  <SectionHeader as="h2" align="center" eyebrow={eyebrow(i)} title={s.question} description={s.answer} />
                  {s.points && <Points items={s.points} />}
                  <Actions t={t} download={download} repo={repo} center />
                </Container>
              )}
            </section>
          )
        })}
      </main>
      <Footer
        brand={<span className="font-semibold">Budkin</span>}
        description={t.footer.tagline}
        copyright={`© 2026 ${t.footer.madeBy}. ${t.footer.license}`}
        legal={[
          { label: 'GitHub', href: repo, external: true },
          { label: 'Releases', href: `${repo}/releases`, external: true },
          { label: 'MIT', href: `${repo}/blob/main/LICENSE`, external: true }
        ]}
        className="pb-40"
      />
    </>
  )
}
