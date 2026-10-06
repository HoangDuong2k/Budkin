// Budkin 2D — robot bánh xe vui tính (vỏ gốm trắng ngà, mặt kính đen, mắt LED xanh ngọc, ăng-ten có đèn trạng thái):
// bị chọc thì bẹp-giãn, ăn mừng thì nhảy xoay một vòng, báo động thì nhún nhảy, đèn ăng-ten đỏ nhấp nháy.
// Nhìn theo con trỏ bằng cách quay đầu: mặt kính trượt về phía nhìn, vỏ đầu hẹp lại, tai phía đó khuất sau đầu.
// Hình vẽ dùng chung với trang giới thiệu (art.tsx); ở đây chỉ có chuyển động. Nhóm: fx (nhảy / bẹp / xoay) › body › head › face › eyes
import { useRef } from 'react'
import { damp, easeInOut, easeOutBack, op, spring, tf, useFlatRig } from '../rig2d'
import { BudkinArt, useBudkinParts } from './art'
import { ledState, setLed } from './common'

const TAU = Math.PI * 2

export function Budkin(): React.JSX.Element {
  const parts = useBudkinParts()
  const { fx, body, head, face, earL, earR, antenna, eyes, happy, eyeHalo, ledHalo, coreHalo } = parts
  const p = useRef({ lx: 0, ly: 0, vx: 0, vy: 0 })

  useFlatRig({ eyeY: 148, zzzY: 290 }, (f) => {
    const { dt, mode, t } = f
    const s = p.current
    // Quay đầu theo lò xo (vọt nhẹ rồi dừng); giảm chuyển động thì trôi đều về hướng mới
    let moving = f.reduced ? damp(s, 'lx', f.aim.x, 0.06, dt) : spring(s, 'lx', 'vx', f.aim.x, dt)
    moving = (f.reduced ? damp(s, 'ly', f.aim.y, 0.06, dt) : spring(s, 'ly', 'vy', f.aim.y, dt)) || moving
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
    const yaw = Math.max(-1.15, Math.min(1.15, s.lx))
    const pitch = Math.max(-1.15, Math.min(1.15, s.ly))
    const ay = Math.abs(yaw)
    // Thân xoay theo một chút, đầu xoay nhiều: dịch và nghiêng về phía nhìn, vỏ đầu hẹp lại như đang quay; ngủ thì gục xuống
    tf(body.current, `translate(${(yaw * 2).toFixed(2)} 0) rotate(${(yaw * 3).toFixed(2)} 0 -30)`)
    tf(
      head.current,
      `translate(${(yaw * 4).toFixed(2)} ${(-pitch * 4 + (sleeping ? 4 : 0)).toFixed(2)}) rotate(${(yaw * 4.5 + (sleeping ? 6 : 0)).toFixed(2)} 0 -105) ` +
        `translate(0 -148) scale(${(1 - ay * 0.07).toFixed(3)} 1) translate(0 148)`
    )
    // Mặt kính trượt về phía nhìn và hẹp lại; tai phía đó khuất vào sau đầu, tai bên kia lộ ra
    tf(face.current, `translate(${(yaw * 11).toFixed(2)} ${(-pitch * 7).toFixed(2)}) translate(0 -149) scale(${(1 - ay * 0.14).toFixed(3)} ${(1 - Math.abs(pitch) * 0.07).toFixed(3)}) translate(0 149)`)
    tf(earL.current, `translate(${(yaw < 0 ? ay * 8 : -ay * 1.5).toFixed(2)} ${(-pitch * 2).toFixed(2)})`)
    tf(earR.current, `translate(${(yaw > 0 ? -ay * 8 : ay * 1.5).toFixed(2)} ${(-pitch * 2).toFixed(2)})`)
    tf(antenna.current, `translate(${(yaw * 3).toFixed(2)} 0) rotate(${(-yaw * 4).toFixed(2)} 0 -189)`)
    const es = mode === 'alert' ? 1.15 : 1
    tf(eyes.current, `translate(${(yaw * 8).toFixed(2)} ${(-pitch * 6 - 148).toFixed(2)}) scale(${(es * (1 - ay * 0.08)).toFixed(3)} ${(es * f.eyeOpen).toFixed(3)})`)
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
