// Robot Budkin ở góc phải dưới trang: nhìn theo chuột; cuộn trang thì chúi về trước / ngả ra sau như mất thăng bằng rồi
// lắc lư đứng thẳng lại; bấm vào thì hiện mục lục dạng câu hỏi, bấm câu nào trang cuộn tới phần đó.
// Hình robot dùng chung với app (src/renderer/src/flat/robots/art.tsx). Đứng yên thì không vẽ gì (vòng vẽ tự dừng).
import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from 'momi-ui'
import { BUDKIN_EYE, BudkinArt, RobotDefs, useBudkinParts } from '../../../src/renderer/src/flat/robots/art'

export interface GuideSection {
  id: string
  question: string
}

interface Props {
  sections: GuideSection[]
  labels: { button: string; title: string; greeting: string }
}

/** Khung vẽ: robot rộng ±70, cao 0…−243 (đèn ăng-ten); chừa chỗ cho tay vung ra hai bên */
const VIEW = { x: -110, y: -255, w: 220, h: 265 }

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v))

function tf(el: SVGElement | HTMLElement | null, value: string): void {
  if (el) el.setAttribute('transform', value)
}

export default function RobotGuide({ sections, labels }: Props): React.JSX.Element {
  const parts = useBudkinParts()
  const tilt = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // Phần vừa chọn trong mục lục: đóng bong bóng thì đưa focus tới đó (thay vì trả về robot)
  const jumpTo = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [greeting, setGreeting] = useState(false)
  // Điều khiển vòng vẽ từ ngoài effect (mở mục lục, gật đầu sau khi chọn)
  const ctl = useRef<{ wake: () => void; nod: () => void; open: boolean }>({ wake: () => undefined, nod: () => undefined, open: false })
  ctl.current.open = open

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const p = parts
    const s = {
      // Hướng nhìn hiện tại / đích (−1…1: x âm là quay sang trái, y dương là ngước lên) và vận tốc (lò xo)
      lx: 0,
      ly: 0,
      vx: 0,
      vy: 0,
      tx: -0.35,
      ty: 0.3,
      // Chúi trước / ngả sau (độ, âm là chúi về phía người xem) và lắc ngang
      lean: 0,
      leanV: 0,
      sway: 0,
      swayV: 0,
      // Ăng-ten đung đưa trễ nhịp
      ant: 0,
      antV: 0,
      t: 0,
      blinkAt: -1,
      nodAt: -1,
      introAt: reduced ? -1 : 0.35
    }
    let raf = 0
    let last = 0
    let lastScroll = scrollY
    let center = { x: innerWidth - 80, y: innerHeight - 90 }
    const measure = (): void => {
      const r = button.current?.getBoundingClientRect()
      if (r) center = { x: r.left + r.width / 2, y: r.top + r.height * 0.35 }
    }

    const frame = (now: number): void => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
      last = now
      s.t += dt
      // Quay đầu nhìn theo chuột (đang mở mục lục thì ngước lên bong bóng). Lò xo hơi non tay: quay nhanh, vọt nhẹ rồi
      // dừng; giảm chuyển động thì chỉ trôi chậm về hướng mới
      const tx = ctl.current.open ? -0.3 : s.tx
      const ty = ctl.current.open ? 0.85 : s.ty
      if (reduced) {
        const k = 1 - Math.exp(-dt * 5)
        s.lx += (tx - s.lx) * k
        s.ly += (ty - s.ly) * k
      } else {
        s.vx += ((tx - s.lx) * 130 - s.vx * 17) * dt
        s.vy += ((ty - s.ly) * 130 - s.vy * 17) * dt
        s.lx += s.vx * dt
        s.ly += s.vy * dt
      }
      // Lò xo tắt dần: kéo về thẳng đứng, lắc lư vài nhịp
      if (!reduced) {
        s.leanV += (-62 * s.lean - 6.5 * s.leanV) * dt
        s.lean += s.leanV * dt
        if (Math.abs(s.lean) > 24) {
          s.lean = Math.sign(s.lean) * 24
          s.leanV *= -0.35
        }
        s.swayV += (-45 * s.sway - 5 * s.swayV) * dt
        s.sway = clamp(s.sway + s.swayV * dt, -7, 7)
        s.antV += (-110 * (s.ant + s.sway * 2.2) - 7 * s.antV) * dt
        s.ant += s.antV * dt
      }

      // Hiện ra lần đầu: phóng to bật nảy
      let scale = 1
      if (s.introAt >= 0) {
        const e = clamp((s.t - s.introAt) / 0.7, 0, 1)
        const b = 1.70158
        scale = Math.max(0.001, s.t < s.introAt ? 0.001 : 1 + (b + 1) * Math.pow(e - 1, 3) + b * Math.pow(e - 1, 2))
        if (e >= 1) s.introAt = -1
      }
      // Chớp mắt, gật đầu
      let blink = 1
      if (s.blinkAt >= 0) {
        const e = (s.t - s.blinkAt) / 0.16
        if (e >= 1) s.blinkAt = -1
        else blink = Math.max(0.08, Math.abs(1 - 2 * e))
      }
      let nod = 0
      if (s.nodAt >= 0) {
        const e = (s.t - s.nodAt) / 0.55
        if (e >= 1) s.nodAt = -1
        else nod = Math.sin(Math.PI * e)
      }

      const strain = Math.abs(s.lean)
      // Chúi về trước thì nhìn xuống, ngả ra sau thì ngước lên (hốt hoảng)
      const yaw = clamp(s.lx, -1.15, 1.15)
      const pitch = clamp(s.ly + (s.lean / 22) * 0.9, -1.4, 1.4)
      const ay = Math.abs(yaw)
      const flail = reduced ? 0 : Math.min(60, strain * 2.4 + Math.abs(s.leanV) * 0.04) + (strain > 4 ? 7 * Math.sin(s.t * 19) : 0)
      if (tilt.current) tilt.current.style.transform = `perspective(320px) rotateX(${s.lean.toFixed(2)}deg) rotateZ(${s.sway.toFixed(2)}deg)`
      tf(p.fx.current, `scale(${scale.toFixed(3)})`)
      // Thân xoay theo một chút, đầu xoay nhiều: cả đầu dịch và nghiêng về phía nhìn, vỏ đầu hẹp lại như đang quay
      tf(p.body.current, `translate(${(yaw * 2).toFixed(2)} 0) rotate(${(yaw * 3).toFixed(2)} 0 -30)`)
      tf(p.armL.current, `rotate(${flail.toFixed(2)} -52 -72)`)
      tf(p.armR.current, `rotate(${(-flail).toFixed(2)} 52 -72)`)
      tf(
        p.head.current,
        `translate(${(yaw * 4).toFixed(2)} ${(-pitch * 4 + nod * 7).toFixed(2)}) rotate(${(yaw * 4.5 + s.sway * 1.2).toFixed(2)} 0 -105) ` +
          `translate(0 -148) scale(${(1 - ay * 0.07).toFixed(3)} 1) translate(0 148)`
      )
      // Mặt kính trượt về phía nhìn và hẹp lại; tai phía đó khuất vào sau đầu, tai bên kia lộ ra
      tf(p.face.current, `translate(${(yaw * 11).toFixed(2)} ${(-pitch * 7).toFixed(2)}) translate(0 -149) scale(${(1 - ay * 0.14).toFixed(3)} ${(1 - Math.abs(pitch) * 0.07).toFixed(3)}) translate(0 149)`)
      tf(p.earL.current, `translate(${(yaw < 0 ? ay * 8 : -ay * 1.5).toFixed(2)} ${(-pitch * 2).toFixed(2)})`)
      tf(p.earR.current, `translate(${(yaw > 0 ? -ay * 8 : ay * 1.5).toFixed(2)} ${(-pitch * 2).toFixed(2)})`)
      tf(p.antenna.current, `translate(${(yaw * 3).toFixed(2)} 0) rotate(${(s.ant - yaw * 4).toFixed(2)} 0 -189)`)
      // Chao mạnh thì mắt mở to (hốt hoảng); mắt liếc thêm về phía nhìn
      const es = 1 + Math.min(0.28, strain / 28)
      tf(
        p.eyes.current,
        `translate(${(yaw * 8).toFixed(2)} ${(-pitch * 6 - 148).toFixed(2)}) scale(${(es * (1 - ay * 0.08)).toFixed(3)} ${(es * blink).toFixed(3)})`
      )

      const settled =
        Math.abs(s.lean) < 0.05 &&
        Math.abs(s.leanV) < 0.05 &&
        Math.abs(s.sway) < 0.03 &&
        Math.abs(s.swayV) < 0.03 &&
        Math.abs(s.ant) < 0.05 &&
        Math.abs(s.antV) < 0.05 &&
        Math.abs(tx - s.lx) < 0.002 &&
        Math.abs(ty - s.ly) < 0.002 &&
        Math.abs(s.vx) < 0.01 &&
        Math.abs(s.vy) < 0.01 &&
        s.blinkAt < 0 &&
        s.nodAt < 0 &&
        s.introAt < 0
      raf = settled ? 0 : requestAnimationFrame(frame)
    }
    const wake = (): void => {
      if (raf) return
      last = 0
      raf = requestAnimationFrame(frame)
    }

    // Hướng tới con trỏ, chia theo khoảng từ robot tới mép màn hình ở phía đó: robot đứng ở góc nên con trỏ ở đâu
    // trên trang cũng làm nó đổi hướng (chia theo cả bề rộng thì mới tới giữa trang đã quay hết cỡ)
    const aim = (d: number, before: number, after: number): number => {
      const n = clamp(d / Math.max(d < 0 ? before : after, 120), -1, 1)
      return Math.sign(n) * Math.pow(Math.abs(n), 0.8)
    }
    const onPointer = (e: PointerEvent): void => {
      s.tx = aim(e.clientX - center.x, center.x, innerWidth - center.x)
      s.ty = aim(center.y - e.clientY, innerHeight - center.y, center.y)
      wake()
    }
    // Con trỏ ra khỏi cửa sổ: quay lại nhìn người xem
    const onLeave = (e: MouseEvent): void => {
      if (e.relatedTarget) return
      s.tx = 0
      s.ty = 0.1
      wake()
    }
    const onScroll = (): void => {
      const dy = scrollY - lastScroll
      lastScroll = scrollY
      if (reduced || !dy) return
      // Cuộn xuống: chúi về trước (về phía người xem); cuộn lên: ngả ra sau. Cuộn càng nhanh càng chao mạnh
      const push = clamp(dy, -160, 160)
      s.leanV = clamp(s.leanV - push * 0.55, -320, 320)
      s.swayV += (Math.random() - 0.5) * Math.abs(push) * 0.12
      wake()
    }
    // Chớp mắt mỗi 3–6 giây
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
        3000 + Math.random() * 3000
      )
    }
    ctl.current.wake = wake
    ctl.current.nod = () => {
      if (reduced) return
      s.nodAt = s.t
      wake()
    }

    measure()
    // Robot chỉ hiện khi đã chạy được (trước đó ẩn, tránh hiện rồi mới thu nhỏ để bật ra)
    root.current?.setAttribute('data-ready', '')
    addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('mouseout', onLeave)
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', measure)
    scheduleBlink()
    wake()
    // Lời chào ngắn sau khi robot hiện ra
    const hello = window.setTimeout(() => setGreeting(true), reduced ? 300 : 1100)
    const bye = window.setTimeout(() => setGreeting(false), 7000)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', onPointer)
      document.removeEventListener('mouseout', onLeave)
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', measure)
      clearTimeout(blinkTimer)
      clearTimeout(hello)
      clearTimeout(bye)
    }
  }, [parts])

  // Phần đang xem (để đánh dấu trong mục lục)
  useEffect(() => {
    const els = sections.map((x) => document.getElementById(x.id)).filter((el): el is HTMLElement => el !== null)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-35% 0px -55% 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [sections])

  useEffect(() => {
    ctl.current.wake()
    if (open) setGreeting(false)
  }, [open])

  const go = (id: string): void => {
    setOpen(false)
    const el = document.getElementById(id)
    if (!el) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    jumpTo.current = el
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    history.replaceState(null, '', `#${id}`)
    ctl.current.nod()
  }

  return (
    <div ref={root} className="robot-guide">
      {greeting && !open && (
        <p className="robot-greeting" role="status">
          {labels.greeting}
        </p>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button ref={button} type="button" className="robot-button" aria-label={labels.button} title={labels.button}>
            <svg className="robot-shadow" viewBox="-60 -10 120 20" aria-hidden>
              <ellipse cx={0} cy={0} rx={52} ry={7} />
            </svg>
            <div ref={tilt} className="robot-tilt">
              <svg className="robot-art" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} style={{ ['--rb-eye' as string]: BUDKIN_EYE }} aria-hidden>
                <defs>
                  <RobotDefs />
                </defs>
                <BudkinArt parts={parts} />
              </svg>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={2}
          collisionPadding={12}
          showArrow
          className="robot-bubble w-[min(22rem,calc(100vw-2rem))] p-2"
          onCloseAutoFocus={(e) => {
            const el = jumpTo.current
            if (!el) return
            jumpTo.current = null
            e.preventDefault()
            el.focus({ preventScroll: true })
          }}
        >
          <p className="px-2 pt-1 pb-2 text-sm font-semibold">{labels.title}</p>
          <ol className="grid gap-0.5">
            {sections.map((x, i) => (
              <li key={x.id}>
                <button
                  type="button"
                  className="robot-question"
                  aria-current={active === x.id ? 'location' : undefined}
                  onClick={() => go(x.id)}
                >
                  <span className="robot-question-num">{String(i + 1).padStart(2, '0')}</span>
                  <span>{x.question}</span>
                </button>
              </li>
            ))}
          </ol>
        </PopoverContent>
      </Popover>
    </div>
  )
}
