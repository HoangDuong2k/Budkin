// Phần mở đầu trang giới thiệu (island React, client:load): bên trái là lời giới thiệu, bên phải là Budkin "đang trực"
// trước một mặt đồng hồ lớn. Robot nhìn theo chuột, chớp mắt; tới giờ thì báo động (đèn đỏ, vẫy tay) và hiện bong bóng
// nhắc việc — bấm Xong là robot nhảy ăn mừng, tung giấy màu, gạch thẻ việc; bấm 10 phút là robot gật đầu rồi nhắc việc
// kế tiếp. Ba thẻ việc lơ lửng nghiêng theo chuột (chiều sâu khác nhau).
// Mọi chuyển động chỉ dùng transform / opacity; vòng vẽ của robot tự dừng khi đứng yên.
import { useCallback, useEffect, useRef, useState } from 'react'
import { BackgroundPattern, Button, Container } from 'momi-ui'
import { BUDKIN_EYE, BudkinArt, RobotDefs, useBudkinParts } from '../../../src/renderer/src/flat/robots/art'
import type { Dict } from '../i18n/vi'
import { DownloadIcon, GithubIcon } from './icons'

interface Props {
  t: Dict
  download: string
  repo: string
}

/** Khung vẽ robot: rộng ±70, cao 0…−243 (đèn ăng-ten); chừa chỗ cho tay vung lên */
const VIEW = { x: -110, y: -262, w: 220, h: 272 }

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

function tf(el: SVGElement | null, value: string): void {
  if (el) el.setAttribute('transform', value)
}

type Mood = 'idle' | 'alert' | 'happy'

/** Điều khiển vòng vẽ của robot từ ngoài effect */
interface BotControl {
  mood: Mood
  wake: () => void
  jump: () => void
  nod: () => void
  poke: () => void
}

/** Một đợt giấy màu: mỗi mảnh bay theo hướng, độ xa, góc xoay riêng */
interface Burst {
  id: number
  pieces: { dx: number; dy: number; rot: number; delay: number; hue: number }[]
}

const CONFETTI_COLORS = ['var(--primary)', 'var(--warning)', '#f3c98b', '#e7e4de', '#ec6a5c']

function makeBurst(id: number): Burst {
  return {
    id,
    pieces: Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.4
      const d = 70 + Math.random() * 90
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8 - 50, rot: Math.random() * 720 - 360, delay: Math.random() * 0.08, hue: i % CONFETTI_COLORS.length }
    })
  }
}

export default function Hero({ t, download, repo }: Props): React.JSX.Element {
  const h = t.hero
  const sc = h.scene
  const parts = useBudkinParts()
  const root = useRef<HTMLElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const bot = useRef<HTMLButtonElement>(null)
  const ctl = useRef<BotControl>({ mood: 'idle', wake: () => undefined, jump: () => undefined, nod: () => undefined, poke: () => undefined })
  const timer = useRef(0)

  const [time, setTime] = useState('--:--')
  const [angles, setAngles] = useState({ h: 300, m: 60 })
  const [done, setDone] = useState<boolean[]>(() => sc.tasks.map(() => false))
  /** Việc đang đến hạn (đang hiện bong bóng nhắc) */
  const [due, setDue] = useState<number | null>(null)
  /** Lời robot nói khi không có việc đến hạn */
  const [say, setSay] = useState<string | null>(null)
  const [mood, setMood] = useState<Mood>('idle')
  const [bursts, setBursts] = useState<Burst[]>([])
  ctl.current.mood = mood

  // ——— Kịch bản nhắc việc ———
  const later = useCallback((ms: number, fn: () => void): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }, [])

  const ring = useCallback(
    (i: number): void => {
      setSay(null)
      setDue(i)
      setMood('alert')
    },
    []
  )

  /** Việc chưa xong kế tiếp sau `from` (vòng lại từ đầu); không còn thì null */
  const nextUndone = (list: boolean[], from: number): number | null => {
    for (let k = 1; k <= list.length; k++) {
      const i = (from + k) % list.length
      if (!list[i]) return i
    }
    return null
  }

  const onDone = (): void => {
    if (due === null) return
    const list = done.map((d, i) => d || i === due)
    setDone(list)
    setDue(null)
    setMood('happy')
    setSay(pick(sc.doneSay))
    setBursts((b) => [...b, makeBurst(Date.now())])
    ctl.current.jump()
    const next = nextUndone(list, due)
    later(2800, () => {
      setMood('idle')
      if (next !== null) {
        ring(next)
        return
      }
      setSay(sc.allDone)
      // Hết việc: nghỉ một lúc rồi bày lại từ đầu để người xem thử tiếp
      later(5200, reset)
    })
  }

  const reset = (): void => {
    setDone(sc.tasks.map(() => false))
    ring(0)
  }

  const onSnooze = (): void => {
    if (due === null) return
    const cur = due
    setDue(null)
    setMood('idle')
    setSay(sc.snoozeSay)
    ctl.current.nod()
    later(2800, () => ring(nextUndone(done, cur) ?? cur))
  }

  const onPoke = (): void => {
    ctl.current.poke()
    if (due !== null) return
    setSay(pick(sc.poke))
    // Nói xong thì nhắc việc kế tiếp; hết việc thì bày lại từ đầu
    const next = nextUndone(done, -1)
    later(2400, () => {
      if (next !== null) ring(next)
      else {
        setSay(null)
        later(2600, reset)
      }
    })
  }

  // Việc đầu tiên đến hạn ngay sau khi robot hiện ra
  useEffect(() => {
    later(1900, () => ring(0))
    return () => window.clearTimeout(timer.current)
  }, [later, ring])

  // Giấy màu tự dọn
  useEffect(() => {
    if (!bursts.length) return
    const id = window.setTimeout(() => setBursts((b) => b.slice(1)), 1400)
    return () => window.clearTimeout(id)
  }, [bursts])

  // ——— Đồng hồ thật trên mặt đồng hồ ———
  useEffect(() => {
    const tick = (): void => {
      const d = new Date()
      setTime(d.toLocaleTimeString(t.lang, { hour: '2-digit', minute: '2-digit' }))
      setAngles({ h: ((d.getHours() % 12) + d.getMinutes() / 60) * 30, m: (d.getMinutes() + d.getSeconds() / 60) * 6 })
    }
    tick()
    const id = window.setInterval(tick, 10000)
    return () => window.clearInterval(id)
  }, [t.lang])

  // ——— Robot: nhìn theo chuột, chớp mắt, báo động, nhảy, gật, bị chọc ———
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const p = parts
    const s = {
      lx: 0,
      ly: 0,
      vx: 0,
      vy: 0,
      tx: -0.2,
      ty: 0.15,
      t: 0,
      blinkAt: -1,
      nodAt: -1,
      jumpAt: -1,
      pokeAt: -1,
      riseAt: reduced ? -1 : 0.25
    }
    let raf = 0
    let last = 0
    let center = { x: innerWidth * 0.7, y: innerHeight * 0.5 }
    const measure = (): void => {
      const r = bot.current?.getBoundingClientRect()
      if (r) center = { x: r.left + r.width / 2, y: r.top + r.height * 0.35 }
    }

    const frame = (now: number): void => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
      last = now
      s.t += dt
      const mood = ctl.current.mood
      // Đang báo động thì nhìn thẳng ra người xem; còn lại nhìn theo chuột (lò xo hơi non tay: quay nhanh, vọt nhẹ)
      const tx = mood === 'alert' ? 0 : s.tx
      const ty = mood === 'alert' ? 0.05 : s.ty
      if (reduced) {
        const k = 1 - Math.exp(-dt * 6)
        s.lx += (tx - s.lx) * k
        s.ly += (ty - s.ly) * k
      } else {
        s.vx += ((tx - s.lx) * 120 - s.vx * 16) * dt
        s.vy += ((ty - s.ly) * 120 - s.vy * 16) * dt
        s.lx += s.vx * dt
        s.ly += s.vy * dt
      }

      // Trồi lên từ bệ lúc tải trang
      let rise = 0
      if (s.riseAt >= 0) {
        const e = clamp((s.t - s.riseAt) / 0.9, 0, 1)
        const b = 1.4
        rise = s.t < s.riseAt ? 1 : 1 - (1 + (b + 1) * Math.pow(e - 1, 3) + b * Math.pow(e - 1, 2))
        if (e >= 1) s.riseAt = -1
      }
      // Nhảy ăn mừng: bẹp lấy đà, bật lên xoay nửa vòng, đáp xuống bẹp nhẹ
      let jy = 0
      let sx = 1
      let sy = 1
      let spin = 0
      if (s.jumpAt >= 0) {
        const e = (s.t - s.jumpAt) / 1.05
        if (e >= 1) s.jumpAt = -1
        else if (e < 0.15) {
          const k = Math.sin((e / 0.15) * Math.PI)
          sx = 1 + 0.12 * k
          sy = 1 - 0.14 * k
        } else if (e < 0.85) {
          const k = (e - 0.15) / 0.7
          jy = -Math.sin(k * Math.PI) * (reduced ? 10 : 70)
          spin = reduced ? 0 : Math.sin(k * Math.PI) * 10
        } else {
          const k = Math.sin(((e - 0.85) / 0.15) * Math.PI)
          sx = 1 + 0.08 * k
          sy = 1 - 0.1 * k
        }
      }
      // Bị chọc: bẹp rồi giãn, rung nhẹ
      if (s.pokeAt >= 0) {
        const e = (s.t - s.pokeAt) / 0.5
        if (e >= 1) s.pokeAt = -1
        else {
          const k = Math.sin(e * Math.PI * 3) * (1 - e)
          sx *= 1 + 0.1 * k
          sy *= 1 - 0.12 * k
        }
      }
      let blink = 1
      if (s.blinkAt >= 0) {
        const e = (s.t - s.blinkAt) / 0.16
        if (e >= 1) s.blinkAt = -1
        else blink = Math.max(0.08, Math.abs(1 - 2 * e))
      }
      let nod = 0
      if (s.nodAt >= 0) {
        const e = (s.t - s.nodAt) / 0.7
        if (e >= 1) s.nodAt = -1
        else nod = Math.sin(Math.PI * 2 * e) * (1 - e)
      }

      const alert = mood === 'alert' && !reduced
      const happy = mood === 'happy'
      // Báo động: thân rung, hai tay vẫy lệch nhịp
      const shake = alert ? Math.sin(s.t * 32) * 2.2 : 0
      const wave = alert ? 38 + Math.sin(s.t * 13) * 26 : happy ? 120 : 0
      const waveR = alert ? 38 + Math.sin(s.t * 13 + 1.6) * 26 : happy ? 120 : 0

      const yaw = clamp(s.lx, -1.15, 1.15)
      const pitch = clamp(s.ly, -1.3, 1.3)
      const ay = Math.abs(yaw)
      tf(p.fx.current, `translate(0 ${(rise * 230 + jy).toFixed(2)}) rotate(${spin.toFixed(2)} 0 -60) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`)
      tf(p.body.current, `translate(${(yaw * 2).toFixed(2)} 0) rotate(${(yaw * 3 + shake).toFixed(2)} 0 -30)`)
      tf(p.armL.current, `rotate(${wave.toFixed(2)} -52 -72)`)
      tf(p.armR.current, `rotate(${(-waveR).toFixed(2)} 52 -72)`)
      tf(
        p.head.current,
        `translate(${(yaw * 4).toFixed(2)} ${(-pitch * 4 + nod * 9).toFixed(2)}) rotate(${(yaw * 4.5 + shake * 1.5).toFixed(2)} 0 -105) ` +
          `translate(0 -148) scale(${(1 - ay * 0.07).toFixed(3)} 1) translate(0 148)`
      )
      tf(p.face.current, `translate(${(yaw * 11).toFixed(2)} ${(-pitch * 7).toFixed(2)}) translate(0 -149) scale(${(1 - ay * 0.14).toFixed(3)} ${(1 - Math.abs(pitch) * 0.07).toFixed(3)}) translate(0 149)`)
      tf(p.earL.current, `translate(${(yaw < 0 ? ay * 8 : -ay * 1.5).toFixed(2)} ${(-pitch * 2).toFixed(2)})`)
      tf(p.earR.current, `translate(${(yaw > 0 ? -ay * 8 : ay * 1.5).toFixed(2)} ${(-pitch * 2).toFixed(2)})`)
      tf(p.antenna.current, `translate(${(yaw * 3).toFixed(2)} 0) rotate(${(alert ? Math.sin(s.t * 20) * 9 : -yaw * 4).toFixed(2)} 0 -189)`)
      const es = alert ? 1.18 : 1
      tf(p.eyes.current, `translate(${(yaw * 8).toFixed(2)} ${(-pitch * 6 - 148).toFixed(2)}) scale(${(es * (1 - ay * 0.08)).toFixed(3)} ${(es * blink).toFixed(3)})`)
      if (p.eyes.current) p.eyes.current.style.opacity = happy ? '0' : '1'
      if (p.happy.current) p.happy.current.style.opacity = happy ? '1' : '0'
      p.fx.current?.setAttribute('data-led', alert ? 'alert' : 'normal')

      const settled =
        Math.abs(tx - s.lx) < 0.002 &&
        Math.abs(ty - s.ly) < 0.002 &&
        Math.abs(s.vx) < 0.01 &&
        Math.abs(s.vy) < 0.01 &&
        s.blinkAt < 0 &&
        s.nodAt < 0 &&
        s.jumpAt < 0 &&
        s.pokeAt < 0 &&
        s.riseAt < 0 &&
        !alert
      raf = settled ? 0 : requestAnimationFrame(frame)
    }
    const wake = (): void => {
      if (raf) return
      last = 0
      raf = requestAnimationFrame(frame)
    }

    // Hướng tới con trỏ, chia theo khoảng từ robot tới mép màn hình ở phía đó
    const aim = (d: number, before: number, after: number): number => {
      const n = clamp(d / Math.max(d < 0 ? before : after, 120), -1, 1)
      return Math.sign(n) * Math.pow(Math.abs(n), 0.8)
    }
    const onPointer = (e: PointerEvent): void => {
      s.tx = aim(e.clientX - center.x, center.x, innerWidth - center.x)
      s.ty = aim(center.y - e.clientY, innerHeight - center.y, center.y)
      wake()
    }
    const onLeave = (e: MouseEvent): void => {
      if (e.relatedTarget) return
      s.tx = 0
      s.ty = 0.1
      wake()
    }
    let blinkTimer = 0
    const scheduleBlink = (): void => {
      blinkTimer = window.setTimeout(
        () => {
          if (!document.hidden) {
            s.blinkAt = s.t
            wake()
          }
          scheduleBlink()
        },
        2600 + Math.random() * 3000
      )
    }
    ctl.current.wake = wake
    ctl.current.jump = () => {
      s.jumpAt = s.t
      wake()
    }
    ctl.current.nod = () => {
      s.nodAt = s.t
      wake()
    }
    ctl.current.poke = () => {
      s.pokeAt = s.t
      wake()
    }

    measure()
    addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('mouseout', onLeave)
    addEventListener('scroll', measure, { passive: true })
    addEventListener('resize', measure)
    scheduleBlink()
    wake()
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', onPointer)
      document.removeEventListener('mouseout', onLeave)
      removeEventListener('scroll', measure)
      removeEventListener('resize', measure)
      clearTimeout(blinkTimer)
    }
  }, [parts])

  // Đổi tâm trạng (báo động cần vòng vẽ chạy liên tục)
  useEffect(() => {
    ctl.current.wake()
  }, [mood])

  // ——— Chiều sâu theo chuột, nút hút về phía con trỏ ———
  useEffect(() => {
    const hero = root.current
    const box = scene.current
    if (!hero || !box) return
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const magnets = [...hero.querySelectorAll<HTMLElement>('.magnetic')]

    // Chiều sâu: −1…1 theo vị trí con trỏ so với tâm cảnh robot; mỗi khung hình ghi một lần (CSS làm mượt bằng transition)
    let px = 0
    let py = 0
    let raf = 0
    const flush = (): void => {
      raf = 0
      box.style.setProperty('--px', px.toFixed(3))
      box.style.setProperty('--py', py.toFixed(3))
    }
    const queue = (): void => {
      if (!raf) raf = requestAnimationFrame(flush)
    }
    const onMove = (e: PointerEvent): void => {
      const sb = box.getBoundingClientRect()
      px = clamp((e.clientX - (sb.left + sb.width / 2)) / (sb.width * 0.9), -1, 1)
      py = clamp((e.clientY - (sb.top + sb.height / 2)) / (sb.height * 0.9), -1, 1)
      queue()
      // Nút hút nhẹ về phía con trỏ khi lại gần
      if (reduced) return
      for (const m of magnets) {
        const b = m.getBoundingClientRect()
        const dx = e.clientX - (b.left + b.width / 2)
        const dy = e.clientY - (b.top + b.height / 2)
        const near = Math.hypot(dx, dy) < Math.max(b.width, b.height) * 0.9
        m.style.transform = near ? `translate3d(${(dx * 0.18).toFixed(1)}px, ${(dy * 0.28).toFixed(1)}px, 0)` : ''
      }
    }
    const onLeave = (): void => {
      for (const m of magnets) m.style.transform = ''
      px = py = 0
      queue()
    }
    if (fine) {
      hero.addEventListener('pointermove', onMove)
      hero.addEventListener('pointerleave', onLeave)
    }

    // Robot lớn đang trên màn hình thì robot nhỏ ở góc trốn đi (tránh hai robot cùng lúc)
    const io = new IntersectionObserver(([e]) => document.documentElement.toggleAttribute('data-hero-bot', e.isIntersecting), { threshold: 0.25 })
    io.observe(box)
    return () => {
      cancelAnimationFrame(raf)
      hero.removeEventListener('pointermove', onMove)
      hero.removeEventListener('pointerleave', onLeave)
      io.disconnect()
      document.documentElement.removeAttribute('data-hero-bot')
    }
  }, [])

  const bubbleTask = due !== null ? sc.tasks[due] : null
  const ticks = Array.from({ length: 60 }, (_, i) => i)

  return (
    <section ref={root} className="hero" data-mood={mood}>
      <div className="hero-ambient" aria-hidden />
      <BackgroundPattern variant="grid" fade="top" />

      <Container size="xl" className="hero-inner">
        <div className="hero-copy">
          <p className="hero-badge">
            <span className="led led-pulse" aria-hidden />
            <span>{h.eyebrow}</span>
            <span className="hero-badge-rule" aria-hidden />
            <span className="text-muted-foreground">{sc.duty}</span>
          </p>
          <h1 className="hero-title">
            {h.headline.map((l, i) => (
              <span key={l.text} className="hero-line">
                {i > 0 && ' '}
                <span className={`hero-line-inner ${l.accent ? 'hero-accent' : ''}`} style={{ ['--i' as string]: i }}>
                  {l.text}
                </span>
              </span>
            ))}
          </h1>
          <p className="hero-lead">{h.description}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <span className="magnetic">
              <Button asChild size="lg" className="btn-glow btn-shine">
                <a href={download}>
                  <DownloadIcon />
                  {h.download}
                </a>
              </Button>
            </span>
            <span className="magnetic">
              <Button asChild size="lg" variant="outline">
                <a href={repo}>
                  <GithubIcon />
                  {h.source}
                </a>
              </Button>
            </span>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">{h.footnote}</p>
        </div>

        <div ref={scene} className="scene" role="group" aria-label={sc.label}>
          {/* Mặt đồng hồ: vạch phút, kim giờ / phút theo giờ thật, tia quét như radar */}
          <div className="dial" aria-hidden>
            <div className="dial-sweep" />
            <svg className="dial-face" viewBox="-200 -200 400 400">
              <circle r={196} className="dial-ring" />
              <circle r={150} className="dial-ring dial-ring-inner" />
              {ticks.map((i) => (
                <line key={i} className={i % 5 ? 'dial-tick' : 'dial-tick dial-tick-major'} x1={0} y1={-186} x2={0} y2={i % 5 ? -178 : -166} transform={`rotate(${i * 6})`} />
              ))}
              <line className="dial-hand dial-hand-h" x1={0} y1={0} x2={0} y2={-92} transform={`rotate(${angles.h})`} />
              <line className="dial-hand dial-hand-m" x1={0} y1={0} x2={0} y2={-132} transform={`rotate(${angles.m})`} />
            </svg>
            <span className="dial-time">{time}</span>
          </div>

          {/* Thẻ việc lơ lửng — mỗi thẻ một độ sâu */}
          {sc.tasks.map((task, i) => (
            <div key={task.title} className={`fcard fcard-${i}`} data-due={due === i || undefined} data-done={done[i] || undefined} aria-hidden>
              <div className="fcard-inner">
                <span className="fcard-check" />
                <span className="min-w-0">
                  <span className="fcard-title">{task.title}</span>
                  <span className="fcard-meta">
                    <span>{task.when}</span>
                    <span className="fcard-tag">{task.tag}</span>
                  </span>
                </span>
              </div>
            </div>
          ))}

          {/* Robot trên bệ tròn có vòng LED */}
          <div className="bot-wrap">
            <span className="bot-pedestal-ring" aria-hidden />
            <button ref={bot} type="button" className="hero-bot" aria-label={sc.label} onClick={onPoke}>
              <svg className="robot-art" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} style={{ ['--rb-eye' as string]: BUDKIN_EYE }} aria-hidden>
                <defs>
                  <RobotDefs />
                </defs>
                <ellipse className="hero-bot-shadow" cx={0} cy={2} rx={58} ry={8} />
                <BudkinArt parts={parts} />
              </svg>
            </button>
            {bursts.map((b) => (
              <span key={b.id} className="confetti" aria-hidden>
                {b.pieces.map((c, k) => (
                  <i
                    key={k}
                    style={{
                      ['--dx' as string]: `${c.dx.toFixed(0)}px`,
                      ['--dy' as string]: `${c.dy.toFixed(0)}px`,
                      ['--rot' as string]: `${c.rot.toFixed(0)}deg`,
                      ['--c' as string]: CONFETTI_COLORS[c.hue],
                      animationDelay: `${c.delay.toFixed(2)}s`
                    }}
                  />
                ))}
              </span>
            ))}
          </div>

          {/* Bong bóng: nhắc việc đến hạn (có nút trả lời) hoặc lời robot nói */}
          <div className="bubble-slot" aria-live="polite">
            {bubbleTask ? (
              <div key={`due-${due}`} className="bubble bubble-due">
                <p className="bubble-head">
                  <span className="led led-alert" aria-hidden />
                  {sc.due} · {bubbleTask.when}
                </p>
                <p className="bubble-title">{bubbleTask.title}</p>
                <div className="bubble-actions">
                  <button type="button" className="bubble-btn bubble-btn-primary" onClick={onDone}>
                    {sc.done}
                  </button>
                  <button type="button" className="bubble-btn" onClick={onSnooze}>
                    {sc.snooze}
                  </button>
                </div>
              </div>
            ) : say ? (
              <p key={say} className="bubble bubble-say">
                {say}
              </p>
            ) : null}
          </div>
        </div>
      </Container>

      <div className="scroll-cue" aria-hidden>
        <span />
      </div>
    </section>
  )
}
