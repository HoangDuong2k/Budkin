// Nguồn "bây giờ" duy nhất của renderer (kiểm thử đẩy đồng hồ được) + hook cập nhật mỗi phút
import { useEffect, useState } from 'react'
import { localDateOf, localMinutesOf } from '../../shared/datetime'
import type { Now } from '../../shared/filters'

let offset = window.api.boot.clockOffset
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined

export function now(): number {
  return Date.now() + offset
}

export function nowParts(): Now {
  const t = now()
  return { date: localDateOf(t), minutes: localMinutesOf(t) }
}

function notify(): void {
  for (const l of listeners) l()
}

/** Kiểm thử: đồng hồ lệch khỏi giờ thật */
export function setClockOffset(ms: number): void {
  offset = ms
  notify()
}

/** Hẹn giờ tới đầu phút kế tiếp (qua nửa đêm thì danh sách "Hôm nay" tự đổi) */
function tick(): void {
  timer = setTimeout(
    () => {
      notify()
      tick()
    },
    60_000 - (now() % 60_000) + 50
  )
}

/** Ngày và phút hiện tại, tự cập nhật mỗi phút */
export function useNow(): Now {
  const [value, setValue] = useState(nowParts)
  useEffect(() => {
    const l = (): void => {
      const next = nowParts()
      setValue((prev) => (prev.date === next.date && prev.minutes === next.minutes ? prev : next))
    }
    listeners.add(l)
    if (!timer) tick()
    return () => {
      listeners.delete(l)
    }
  }, [])
  return value
}
