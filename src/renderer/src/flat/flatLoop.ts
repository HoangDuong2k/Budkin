// Vòng vẽ của bàn làm việc 2D: giống frameloop="demand" của cảnh 3D — chỉ chạy khi có ai xin vẽ (requestFrame), mỗi
// lần một khung requestAnimationFrame; các phần tử đăng ký hàm vẽ (useFlatFrame) và tự xin khung sau nếu còn chuyển động.
import { useEffect, useRef } from 'react'
import { markFrame, type FrameDriver } from '../scene/renderLoop'

type FrameFn = (dt: number, now: number) => void

const subs: Array<{ fn: { current: FrameFn }; priority: number }> = []
let raf = 0
let running = true
let last = 0

function frame(now: number): void {
  raf = 0
  // Khung đầu sau lúc đứng yên: coi như một khung bình thường (không nhảy cóc hoạt cảnh)
  const dt = last && now - last < 250 ? (now - last) / 1000 : 1 / 60
  last = now
  markFrame()
  for (const s of subs) s.fn.current(Math.min(dt, 0.1), now)
}

export const flatDriver: FrameDriver = {
  invalidate: () => {
    if (running && !raf) raf = requestAnimationFrame(frame)
  },
  setRunning: (on) => {
    running = on
    if (!on && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
}

/** Gọi `fn` mỗi khung bàn 2D vẽ; số `priority` nhỏ chạy trước (đèn / theme trước robot) */
export function useFlatFrame(fn: FrameFn, priority = 0): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const entry = { fn: ref, priority }
    subs.push(entry)
    subs.sort((a, b) => a.priority - b.priority)
    return () => {
      subs.splice(subs.indexOf(entry), 1)
    }
  }, [priority])
}
