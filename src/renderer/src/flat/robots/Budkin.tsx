// Budkin 2D — robot bánh xe vui tính (vỏ gốm trắng ngà, mặt kính đen, mắt LED xanh ngọc, ăng-ten có đèn trạng thái):
// bị chọc thì bẹp-giãn, ăn mừng thì nhảy xoay một vòng, báo động thì nhún nhảy, đèn ăng-ten đỏ nhấp nháy.
// Hình vẽ dùng chung với trang giới thiệu (art.tsx); ở đây chỉ có chuyển động. Nhóm: fx (nhảy / bẹp / xoay) › body › head › eyes
import { useRef } from 'react'
import { damp, easeInOut, easeOutBack, op, tf, useFlatRig } from '../rig2d'
import { BudkinArt, useBudkinParts } from './art'
import { ledState, setLed } from './common'

const TAU = Math.PI * 2

export function Budkin(): React.JSX.Element {
  const parts = useBudkinParts()
  const { fx, body, head, eyes, happy, eyeHalo, ledHalo, coreHalo } = parts
  const p = useRef({ lx: 0, ly: 0 })

  useFlatRig({ eyeY: 148, zzzY: 290 }, (f) => {
    const { dt, mode, t } = f
    const s = p.current
    let moving = damp(s, 'lx', f.look.x, f.reduced ? 0.06 : 0.12, dt)
    moving = damp(s, 'ly', f.look.y, f.reduced ? 0.06 : 0.12, dt) || moving
    const sleeping = mode === 'sleep'

    let hop = 0
    let squash = 1
    let spin = 1
    let scale = 1
    if (!f.reduced) {
      if (mode === 'intro') {
        scale = Math.max(0.01, easeOutBack(Math.min(1, t / 0.9)))
        moving = true
      } else if (mode === 'startled') {
        hop = 25 * Math.sin(Math.PI * Math.min(1, t / 0.25))
        moving = true
      } else if (mode === 'poked') {
        const k = Math.min(1, t / 0.45)
        squash = 1 - 0.16 * Math.sin(TAU * k) * (1 - k)
        moving = true
      } else if (mode === 'celebrate') {
        const k = Math.min(1, t / 0.9)
        hop = 40 * Math.sin(Math.PI * k)
        spin = Math.cos(TAU * easeInOut(k))
        moving = true
      } else if (f.alertHop) {
        hop = 12 * Math.abs(Math.sin((Math.PI * t) / 0.6))
        moving = true
      }
    }
    const sx = (scale / Math.sqrt(squash)) * spin
    tf(fx.current, `translate(0 ${-hop}) scale(${sx} ${scale * squash})`)
    tf(body.current, `rotate(${s.lx * 1.5} 0 -30)`)
    // Đầu nghiêng theo hướng nhìn; ngủ thì gục xuống
    tf(head.current, `translate(${s.lx * 5} ${-s.ly * 2 + (sleeping ? 4 : 0)}) rotate(${s.lx * 4 + (sleeping ? 6 : 0)} 0 -105)`)
    const es = mode === 'alert' ? 1.15 : 1
    tf(eyes.current, `translate(${s.lx * 7} ${-s.ly * 5 - 148}) scale(${es} ${es * f.eyeOpen})`)
    const celebrating = mode === 'celebrate'
    op(eyes.current, celebrating ? 0 : 1)
    op(happy.current, celebrating ? 1 : 0)

    const l = ledState(mode, f.alertOn)
    setLed(fx.current, l)
    op(eyeHalo.current, 0.55 * f.dark * (sleeping ? 0.2 : 1))
    op(coreHalo.current, (0.25 + 0.45 * f.dark) * (sleeping ? 0.35 : 1))
    op(ledHalo.current, (l === 'alert' ? 0.9 : 0.5 * f.dark) * (sleeping ? 0.3 : 1))
    return moving
  })

  return <BudkinArt parts={parts} />
}
