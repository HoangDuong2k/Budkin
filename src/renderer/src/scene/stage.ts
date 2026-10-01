// Trạng thái bố cục của sân khấu — đối tượng thường (không phải state React), cập nhật trong cùng khung hình
// với lúc đổi kích thước cửa sổ; các thành phần 3D đọc trong useFrame.
import type { RootState } from '@react-three/fiber'
import { CAMERA, cameraFor, sceneLayout, type SceneLayout } from './math/layout'
import { projectPoint, type Rect, type Vec3 } from './math/framing'

const initialLayout = sceneLayout(16 / 10)

export interface Point {
  x: number
  y: number
}

/** Điểm để bấm vào đèn / robot / bệ robot (CSS px) — cho kiểm thử */
export interface HitPoints {
  lamp: Point
  robot: Point
  pedestal: Point
}

export const stage: {
  layout: SceneLayout
  camera: Vec3
  /** Vùng màn hình máy tính trên cửa sổ (CSS px, đã làm tròn theo pixel thật) */
  screenRect: Rect
  viewport: { width: number; height: number }
  /** Cảnh đã dựng xong và vẽ khung đầu tiên */
  ready: boolean
  /** Truy cập trạng thái R3F từ ngoài Canvas (kiểm thử, chụp điểm ảnh) */
  getR3F: (() => RootState) | null
  /**
   * Điểm trên trục đứng của robot, cao `y` (m) so với mặt bàn → toạ độ cửa sổ (đặt bong bóng thoại).
   * Cảnh 3D chiếu qua camera; bàn làm việc 2D thay bằng bố cục của tranh
   */
  robotAnchor: (y: number) => Point
  /** Bàn làm việc 2D: điểm bấm cho kiểm thử (cảnh 3D tự chiếu từ bố cục) */
  hit: (() => HitPoints) | null
} = {
  layout: initialLayout,
  camera: cameraFor(initialLayout, 16 / 10),
  screenRect: { x: 0, y: 0, width: 0, height: 0 },
  viewport: { width: 0, height: 0 },
  ready: false,
  getR3F: null,
  robotAnchor: (y) => projectPoint({ x: stage.layout.robot.x, y, z: stage.layout.robot.z }, stage.camera, CAMERA, stage.viewport),
  hit: null
}
