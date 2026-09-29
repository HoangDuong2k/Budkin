// Trạng thái bố cục của sân khấu — đối tượng thường (không phải state React), cập nhật trong cùng khung hình
// với lúc đổi kích thước cửa sổ; các thành phần 3D đọc trong useFrame.
import type { RootState } from '@react-three/fiber'
import { cameraFor, sceneLayout, type SceneLayout } from './math/layout'
import type { Rect, Vec3 } from './math/framing'

const initialLayout = sceneLayout(16 / 10)

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
} = {
  layout: initialLayout,
  camera: cameraFor(initialLayout, 16 / 10),
  screenRect: { x: 0, y: 0, width: 0, height: 0 },
  viewport: { width: 0, height: 0 },
  ready: false,
  getR3F: null
}
