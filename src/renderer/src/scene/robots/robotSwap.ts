// Đổi robot trên bệ (bấm bệ, Cài đặt, nhập dữ liệu) — dùng chung cho cảnh 3D và tranh 2D: robot cũ xoay rồi chìm vào bệ,
// robot mới trồi lên bằng hoạt cảnh xuất hiện của chính nó và chào. Robot đang chọn lưu trong thiết lập (settings.robot).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { DEFAULT_ROBOT, nextRobot, type RobotModel } from '../../../../shared/robots'
import { run } from '../../screen/actions'
import { useData } from '../../state/dataStore'
import { say, useHud } from '../../state/hudStore'
import { placeBubble } from '../bubblePlacement'
import { reducedMotion } from '../motion'
import { requestFrame } from '../renderLoop'
import { dispatchRobot, robot, setRobotTransients } from '../robotState'
import { playChirp } from '../sound'
import { ROBOTS } from './index'

/** Robot cũ xoay rồi chìm vào bệ trong bấy nhiêu ms; sau đó robot mới trồi lên bằng hoạt cảnh xuất hiện của nó */
export const SINK_MS = 380
/** Vòng LED của bệ loé sáng khi đổi robot */
export const FLARE_MS = 1200

/** Đổi sang robot kế tiếp (bấm vào bệ, nút ẩn cho bàn phím): lưu vào thiết lập, bàn làm việc đổi theo */
export function switchRobot(): void {
  const current = useData.getState().settings?.robot ?? DEFAULT_ROBOT
  void run('settings:update', { robot: nextRobot(current) })
}

export interface RobotSwap {
  /** Robot đang đứng trên bệ (null: chưa tải thiết lập) */
  shown: RobotModel | null
  /** Lúc bắt đầu đổi (vòng LED loé) */
  flareAt: RefObject<number>
  /** Gọi mỗi khung: robot cũ đang chìm thì trả về tiến độ 0..1 (đã ease), chìm xong thì đổi robot; null: không đang đổi */
  sinkStep(now: number): number | null
}

/**
 * onArrive: robot mới vừa lên bệ (cảnh 3D tính lại bóng đổ…); introduced = vừa đổi (không phải lần mở app).
 * Trả về hàm dọn dẹp nếu có hẹn giờ
 */
export function useRobotSwap(onArrive?: (introduced: boolean) => (() => void) | void): RobotSwap {
  const loaded = useData((s) => s.settings !== null)
  const target = useData((s) => s.settings?.robot ?? DEFAULT_ROBOT)
  const [shown, setShown] = useState<RobotModel | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target
  /** Lúc robot cũ bắt đầu chìm (null: không đang đổi) */
  const sinkAt = useRef<number | null>(null)
  const flareAt = useRef(-Infinity)
  const swapped = useRef(false)
  const arrive = useRef(onArrive)
  arrive.current = onArrive

  // Thiết lập đổi: robot cũ chìm xuống rồi robot mới trồi lên. Lần đầu (mở app) thì hiện luôn robot đã chọn
  useEffect(() => {
    if (!loaded) return
    if (shown === null) {
      setShown(target)
      return
    }
    if (target === shown || sinkAt.current !== null) return
    flareAt.current = performance.now()
    if (reducedMotion()) setShown(target)
    else sinkAt.current = performance.now()
    requestFrame()
  }, [loaded, target, shown])

  // Robot mới lên bệ: giọng, lời thoại, độ dài hoạt cảnh theo robot đó; chào (trừ lần mở app)
  useEffect(() => {
    if (!shown) return
    // Chưa vẽ khung nào của robot mới: chưa "đứng yên" (kiểm thử chờ cờ này trước khi đo, bấm vào robot)
    robot.settled = false
    setRobotTransients(ROBOTS[shown].transients)
    useHud.setState({ robot: shown })
    placeBubble()
    const introduced = swapped.current
    const cleanup = arrive.current?.(introduced)
    if (introduced) {
      dispatchRobot({ type: 'intro', at: performance.now() })
      say('greeting')
      playChirp('hello')
    }
    return cleanup ?? undefined
  }, [shown])

  return {
    shown,
    flareAt,
    sinkStep: (now) => {
      const s0 = sinkAt.current
      if (s0 === null) return null
      const k = Math.min(1, (now - s0) / SINK_MS)
      if (k >= 1) {
        sinkAt.current = null
        swapped.current = true
        setShown(targetRef.current)
      }
      requestFrame()
      return k * k
    }
  }
}
