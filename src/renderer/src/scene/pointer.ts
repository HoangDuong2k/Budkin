// Vị trí con trỏ trên cả cửa sổ (kể cả khi đang ở trên giao diện trong màn hình) — đối tượng thường,
// không phải state React: đổi liên tục không làm vẽ lại giao diện
import { requestFrame } from './renderLoop'

export const pointer = {
  /** Toạ độ chuẩn hoá −1..1 (y hướng lên) */
  x: 0,
  y: 0,
  inside: false,
  /** Lần cuối người dùng thao tác (chuột, phím) — performance.now() */
  lastInputAt: 0,
  lastMoveAt: 0
}

type InputListener = () => void
const inputListeners = new Set<InputListener>()

/** Báo khi có thao tác (robot tỉnh dậy, bật lại chuyển động nền) */
export function onUserInput(l: InputListener): () => void {
  inputListeners.add(l)
  return () => inputListeners.delete(l)
}

function input(): void {
  pointer.lastInputAt = performance.now()
  for (const l of inputListeners) l()
}

export function installPointerTracking(): () => void {
  const move = (e: PointerEvent): void => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
    pointer.inside = true
    pointer.lastMoveAt = performance.now()
    input()
    requestFrame()
  }
  const leave = (): void => {
    pointer.inside = false
    requestFrame()
  }
  const key = (): void => input()
  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('pointerdown', move, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)
  window.addEventListener('keydown', key, { passive: true })
  window.addEventListener('wheel', key, { passive: true })
  return () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerdown', move)
    document.documentElement.removeEventListener('pointerleave', leave)
    window.removeEventListener('keydown', key)
    window.removeEventListener('wheel', key)
  }
}
