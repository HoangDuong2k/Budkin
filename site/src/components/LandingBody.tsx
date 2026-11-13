// Thân trang giới thiệu: phần mở đầu (bàn làm việc có công tắc đèn), băng chữ chạy, các phần câu hỏi (mỗi phần một bố cục
// riêng), chân trang. Vẽ sẵn thành HTML lúc build; phần tương tác nhỏ (công tắc đèn, thanh kéo so sánh, đồng hồ, hiện dần
// khi cuộn) do script trong LandingPage.astro gắn vào sau — không có JS thì trang vẫn đọc được đầy đủ.
import { Button, Container, Footer } from 'momi-ui'
import type { Dict, Hotspot, Point, Section, Shot as ShotInfo, Stat } from '../i18n/vi'
import { BotIcon, DownloadIcon, GithubIcon, GlobeIcon, LampIcon, MonitorIcon } from './icons'

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
  /** Phần mở đầu (island React Hero, truyền vào từ LandingPage.astro) */
  children?: React.ReactNode
}

const pad = (n: number): string => String(n).padStart(2, '0')

function Picture({ img, shot, priority, className }: { img: Img; shot: ShotInfo; priority?: boolean; className?: string }): React.JSX.Element {
  const image = (style?: React.CSSProperties): React.JSX.Element => (
    <img
      src={img.src}
      width={img.width}
      height={img.height}
      alt={shot.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={style ? 'absolute max-w-none' : `block w-full ${className ?? 'h-auto'}`}
      style={style}
    />
  )
  const c = shot.crop
  if (!c) return image()
  // Cắt cận: khung theo tỉ lệ của vùng cần giữ, ảnh phóng to rồi dịch sao cho vùng đó lấp kín khung
  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ aspectRatio: `${c.w * img.width} / ${c.h * img.height}` }}>
      {image({ width: `${100 / c.w}%`, left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%` })}
    </div>
  )
}

/** Bốn góc kiểu khung ngắm (HUD) */
function Corners(): React.JSX.Element {
  return <span className="hud-corners" aria-hidden />
}

/** Ảnh chụp trong khung HUD, có nhãn kẻ khuôn ở góc */
function Frame({ img, shot, className = '', fill }: { img: Img; shot: ShotInfo; className?: string; fill?: boolean }): React.JSX.Element {
  return (
    <figure className={`frame ${className}`}>
      <Picture img={img} shot={shot} className={fill ? 'h-full object-cover' : undefined} />
      {shot.label && <span className="shot-label">{shot.label}</span>}
      <Corners />
    </figure>
  )
}

/** Hai ảnh chồng lên nhau, kéo thanh giữa để so sánh (tắt đèn bên trái, bật đèn bên phải) */
function Compare({ a, b, shotA, shotB, label }: { a: Img; b: Img; shotA: ShotInfo; shotB: ShotInfo; label: string }): React.JSX.Element {
  return (
    <div className="frame compare" data-compare style={{ ['--pos' as string]: '50%' }}>
      <img src={a.src} width={a.width} height={a.height} alt={shotA.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
      <div className="compare-top">
        <img src={b.src} width={b.width} height={b.height} alt={shotB.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
      </div>
      {shotA.label && <span className="shot-label">{shotA.label}</span>}
      {shotB.label && <span className="shot-label shot-label-end">{shotB.label}</span>}
      <span className="compare-handle" aria-hidden>
        <span />
      </span>
      <input type="range" min={0} max={100} defaultValue={50} aria-label={label} className="compare-input" />
      <Corners />
    </div>
  )
}

/** Các ý chính: chấm LED, phần in đậm rồi lời giải thích */
function Points({ items, className = '' }: { items: Point[]; className?: string }): React.JSX.Element {
  return (
    <ul className={`space-y-4 ${className}`}>
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

/** Ý chính dạng ô (bento): biểu tượng, tiêu đề, lời giải thích */
function Tile({ p, n, icon }: { p: Point; n: number; icon?: React.ReactNode }): React.JSX.Element {
  return (
    <li className="tile" data-reveal>
      <span className="tile-num">{pad(n)}</span>
      {icon && <span className="tile-icon">{icon}</span>}
      <h3 className="mt-auto text-lg font-semibold tracking-tight">{p.title}</h3>
      <p className="tile-text">{p.text}</p>
    </li>
  )
}

function Stats({ items, className = '' }: { items: Stat[]; className?: string }): React.JSX.Element {
  return (
    <dl className={`stats ${className}`}>
      {items.map((s) => (
        <div key={s.label} className="stat" data-reveal>
          <dt className="stat-label">{s.label}</dt>
          <dd className="stat-value">{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Nút tải (và nút xem mã nguồn, trừ khi `downloadOnly`) */
function Actions({ t, download, repo, center, downloadOnly, className = 'mt-8' }: { t: Dict; download: string; repo: string; center?: boolean; downloadOnly?: boolean; className?: string }): React.JSX.Element {
  return (
    <div className={`flex flex-wrap gap-3 ${center ? 'justify-center' : ''} ${className}`}>
      <Button asChild size="lg" className="btn-glow">
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

/** Đầu mỗi phần: số thứ tự kiểu kẻ khuôn, câu hỏi, trả lời. `split`: câu hỏi bên trái, trả lời bên phải */
function Head({ s, n, total, split, center }: { s: Section; n: number; total: number; split?: boolean; center?: boolean }): React.JSX.Element {
  const eyebrow = (
    <p className="eyebrow">
      <span>{pad(n)}</span>
      <span className="eyebrow-rule" aria-hidden />
      <span className="text-muted-foreground">{pad(total)}</span>
    </p>
  )
  if (split) {
    return (
      <header className="grid gap-6 lg:grid-cols-12 lg:items-end" data-reveal>
        <div className="lg:col-span-7">
          {eyebrow}
          <h2 className="section-title mt-5">{s.question}</h2>
        </div>
        <p className="section-answer lg:col-span-5 lg:pb-2">{s.answer}</p>
      </header>
    )
  }
  return (
    <header className={center ? 'mx-auto flex max-w-3xl flex-col items-center text-center' : ''} data-reveal>
      {eyebrow}
      <h2 className="section-title mt-5">{s.question}</h2>
      <p className="section-answer mt-6">{s.answer}</p>
    </header>
  )
}

function HotspotPin({ h, lamp }: { h: Hotspot; lamp: Dict['hero']['lamp'] }): React.JSX.Element {
  const inner = (
    <>
      <span className="hotspot-pin" aria-hidden />
      <span className="hotspot-label">
        <strong>{h.title}</strong>
        <span>{h.text}</span>
      </span>
    </>
  )
  const cls = `hotspot ${h.x > 66 ? 'hotspot-end' : ''}`
  const style = { left: `${h.x}%`, top: `${h.y}%` }
  // Bấm vào đèn trong ảnh để bật / tắt — y như trong app
  return h.lamp ? (
    <button type="button" className={`${cls} hotspot-lamp`} style={style} data-lamp-toggle aria-pressed="false" aria-label={`${lamp.label}: ${lamp.hint}`}>
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  )
}

/** Bàn làm việc thật ngay dưới phần mở đầu: ảnh 3D có công tắc đèn và ghim chú thích, dựng thẳng lên khi cuộn tới */
function Showcase({ t, shots }: Pick<Props, 't' | 'shots'>): React.JSX.Element {
  const h = t.hero
  const night = shots[h.shot.src]
  const day = shots[h.dayShot.src]
  return (
    <section className="showcase" data-lamp="off">
      <div className="lamp-ambient" aria-hidden />
      <Container size="xl">
        <p className="showcase-label">
          <span className="led led-pulse" aria-hidden />
          {h.hud}
        </p>
        {/* Khung ngoài chỉ để nghiêng theo cuộn */}
        <div className="stage-scroll mt-6">
          <div className="stage">
            <div className="stage-media">
              <img src={night.src} width={night.width} height={night.height} alt={h.shot.alt} loading="eager" decoding="async" className="stage-img stage-night" />
              <img src={day.src} width={day.width} height={day.height} alt={h.dayShot.alt} loading="eager" decoding="async" fetchPriority="low" className="stage-img stage-day" />
              <span className="stage-scan" aria-hidden />
              {h.hotspots.map((x) => (
                <HotspotPin key={x.title} h={x} lamp={h.lamp} />
              ))}
              <Corners />
            </div>
            <div className="stage-bar">
              <button type="button" className="lamp-switch" data-lamp-toggle aria-pressed="false">
                <LampIcon className="size-4" />
                <span>{h.lamp.label}</span>
                <span className="switch-track" aria-hidden>
                  <span className="switch-knob" />
                </span>
                <span className="lamp-state lamp-state-off">{h.lamp.off}</span>
                <span className="lamp-state lamp-state-on">{h.lamp.on}</span>
              </button>
              <span className="hidden text-muted-foreground md:inline">{h.lamp.hint}</span>
              <span className="ml-auto hidden font-mono text-xs text-muted-foreground sm:inline">1440 × 860 · Budkin</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

/** Băng chữ chạy ngang, kiểu băng cảnh báo trên công trường */
function Ticker({ items }: { items: string[] }): React.JSX.Element {
  const row = (hidden?: boolean): React.JSX.Element => (
    <ul className="ticker-row" aria-hidden={hidden || undefined}>
      {items.map((x) => (
        <li key={x}>
          <span>{x}</span>
          <span className="ticker-dot" aria-hidden />
        </li>
      ))}
    </ul>
  )
  return (
    <div className="ticker">
      <div className="ticker-shift">
        <div className="ticker-track">
          {row()}
          {row(true)}
        </div>
      </div>
    </div>
  )
}

const WHAT_ICONS = [<MonitorIcon key="m" />, <BotIcon key="b" />, <LampIcon key="l" />, <GlobeIcon key="g" />]

function SectionBody({ s, n, total, t, shots, robots, download, repo }: Props & { s: Section; n: number; total: number }): React.JSX.Element {
  const shot = s.shot && shots[s.shot.src]
  const inset = s.inset && shots[s.inset.src]

  switch (s.id) {
    // Bento: ảnh bàn lớn và bốn ô ý chính
    case 'what':
      return (
        <Container size="xl">
          <Head s={s} n={n} total={total} split />
          <ul className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {shot && s.shot && (
              <li className="md:col-span-2 lg:row-span-2" data-reveal>
                <Frame img={shot} shot={s.shot} className="h-full" fill />
              </li>
            )}
            {s.points?.map((p, k) => (
              <Tile key={p.title} p={p} n={k + 1} icon={WHAT_ICONS[k]} />
            ))}
          </ul>
        </Container>
      )

    // Hai ảnh xoè như hai tấm thẻ trên bàn
    case 'tasks':
      return (
        <Container size="xl" className="grid items-center gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <Head s={s} n={n} total={total} />
            {s.points && <Points items={s.points} className="mt-10" />}
          </div>
          {shot && s.shot && (
            <div className="fan lg:col-span-7" data-reveal>
              <Frame img={shot} shot={s.shot} className="fan-back" />
              {inset && s.inset && <Frame img={inset} shot={s.inset} className="fan-front" />}
            </div>
          )}
        </Container>
      )

    // Robot báo động: ảnh cận với vòng đỏ nhấp nháy, các ý chính như nhật ký nhắc việc
    case 'robot':
      return (
        <Container size="xl" className="grid items-center gap-14 lg:grid-cols-12 lg:gap-16">
          {shot && s.shot && (
            <div className="alert-wrap lg:col-span-5" data-reveal>
              <span className="alert-ring" aria-hidden />
              <Frame img={shot} shot={s.shot} className="frame-alert" />
            </div>
          )}
          <div className="lg:col-span-7">
            <Head s={s} n={n} total={total} />
            {s.points && (
              <div className="log mt-10" data-reveal>
                <div className="log-bar" aria-hidden>
                  <span className="log-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  budkin://reminders
                  <span className="ml-auto flex items-center gap-1.5 text-destructive">
                    <span className="led led-alert" /> ALERT
                  </span>
                </div>
                <ol className="divide-y divide-border">
                  {s.points.map((p, k) => (
                    <li key={p.title} className="log-row">
                      <span className="log-index">[{pad(k + 1)}]</span>
                      <span className="text-pretty text-muted-foreground">
                        <strong className="font-semibold text-foreground">{p.title}</strong> — {p.text}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </Container>
      )

    // Màn chọn nhân vật: năm robot trên bệ tròn
    case 'robots':
      return (
        <Container size="xl">
          <Head s={s} n={n} total={total} center />
          <ul className="roster mt-16">
            {robots.map((r) => {
              const p = s.points?.find((x) => x.title === r.name)
              return (
                <li key={r.name} className="bot-card" data-reveal>
                  <div className="bot-stage">
                    <img src={r.src} width={r.width} height={r.height} alt={r.name} loading="lazy" decoding="async" className="bot-img" />
                    <span className="bot-pedestal" aria-hidden />
                  </div>
                  <h3 className="bot-name">{r.name}</h3>
                  {p && <p className="bot-text">{p.text}</p>}
                </li>
              )
            })}
          </ul>
        </Container>
      )

    // Kéo thanh so sánh tắt đèn / bật đèn
    case 'lamp':
      return (
        <Container size="xl">
          <Head s={s} n={n} total={total} split />
          {shot && inset && s.shot && s.inset && (
            <div className="mt-14" data-reveal>
              <Compare a={shot} b={inset} shotA={s.shot} shotB={s.inset} label={t.ui.compare} />
            </div>
          )}
          {s.points && (
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {s.points.map((p, k) => (
                <Tile key={p.title} p={p} n={k + 1} />
              ))}
            </ul>
          )}
        </Container>
      )

    // Ảnh Claude vừa thêm việc, khung trò chuyện mẫu chồng lên góc
    case 'claude':
      return (
        <Container size="xl" className="grid items-center gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <Head s={s} n={n} total={total} />
            {s.points && <Points items={s.points} className="mt-10" />}
          </div>
          <div className="relative lg:col-span-7" data-reveal>
            {shot && s.shot && <Frame img={shot} shot={s.shot} />}
            {s.chat && (
              <div className="chat" aria-label="Claude">
                {s.chat.prompts.map((q) => (
                  <p key={q} className="chat-you">
                    <span className="chat-who">{s.chat?.you}</span>
                    {q}
                  </p>
                ))}
                <p className="chat-ai">
                  <span className="chat-who">Claude</span>
                  {s.chat.reply}
                </p>
              </div>
            )}
          </div>
        </Container>
      )

    // Số liệu cỡ lớn rồi ảnh cài đặt dữ liệu
    case 'data':
      return (
        <Container size="xl">
          <Head s={s} n={n} total={total} split />
          {s.stats && <Stats items={s.stats} className="mt-14 sm:grid-cols-2 lg:grid-cols-4" />}
          <div className="mt-14 grid items-center gap-14 lg:grid-cols-12 lg:gap-16">
            {shot && s.shot && (
              <div className="lg:col-span-7" data-reveal>
                <Frame img={shot} shot={s.shot} />
              </div>
            )}
            {s.points && <Points items={s.points} className="lg:col-span-5" />}
          </div>
        </Container>
      )

    case 'light':
      return (
        <Container size="xl" className="grid items-center gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <Head s={s} n={n} total={total} />
            {s.stats && <Stats items={s.stats} className="mt-10 grid-cols-2" />}
            {s.points && <Points items={s.points} className="mt-10" />}
          </div>
          {shot && inset && s.shot && s.inset && (
            <div className="lg:col-span-7" data-reveal>
              <Compare a={shot} b={inset} shotA={s.shot} shotB={s.inset} label={t.ui.compare} />
            </div>
          )}
        </Container>
      )

    case 'install':
      return (
        <Container size="xl">
          <Head s={s} n={n} total={total} split />
          {s.platforms && (
            <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {s.platforms.map((p, k) => (
                <li key={p.title} className="os-card" data-reveal>
                  <span className="os-num">{pad(k + 1)}</span>
                  <h3 className="os-title">{p.title}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">{p.text}</p>
                </li>
              ))}
            </ol>
          )}
          <Actions t={t} download={download} repo={repo} downloadOnly className="mt-10" />
        </Container>
      )

    // Lời kết: chữ cực lớn làm nền, nút tải ở giữa
    case 'price':
      return (
        <Container size="md" className="relative flex flex-col items-center text-center">
          {s.display && (
            <span className="display-bg" aria-hidden>
              {s.display}
            </span>
          )}
          <Head s={s} n={n} total={total} center />
          <Actions t={t} download={download} repo={repo} center className="mt-10" />
        </Container>
      )

    default:
      return (
        <Container size="xl" className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <Head s={s} n={n} total={total} />
            {s.points && <Points items={s.points} className="mt-10" />}
          </div>
          {shot && s.shot && <Frame img={shot} shot={s.shot} />}
        </Container>
      )
  }
}

export default function LandingBody(props: Props): React.JSX.Element {
  const { t, repo } = props
  const total = t.sections.length
  return (
    <>
      {/* Thanh tiến độ đọc trên cùng */}
      <div className="scroll-progress" aria-hidden />
      <main>
        {props.children}
        <Showcase t={t} shots={props.shots} />
        <Ticker items={t.ticker} />

        {/* Mỗi phần là một câu hỏi (cũng là mục lục của robot ở góc) */}
        {t.sections.map((s, i) => (
          <section key={s.id} id={s.id} tabIndex={-1} className={`section section-${s.id}`}>
            <span className="ghost-num" aria-hidden>
              {pad(i + 1)}
            </span>
            <SectionBody {...props} s={s} n={i + 1} total={total} />
          </section>
        ))}
      </main>
      <div className="wordmark" aria-hidden>
        Budkin
      </div>
      <Footer
        brand={<span className="font-semibold">Budkin</span>}
        description={t.footer.tagline}
        copyright={`© 2026 ${t.footer.madeBy}. ${t.footer.license}`}
        legal={[
          { label: 'GitHub', href: repo, external: true },
          { label: 'Releases', href: `${repo}/releases`, external: true },
          { label: 'MIT', href: `${repo}/blob/main/LICENSE`, external: true }
        ]}
        className="relative pb-40"
      />
    </>
  )
}
