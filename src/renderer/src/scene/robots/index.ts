// Danh sách mẫu robot: mô hình 3D, kích thước (đặt bong bóng thoại, vùng bấm), độ dài hoạt cảnh riêng
import type { RobotModel } from '../../../../shared/robots'
import type { Transient } from '../logic/robotMachine'
import { Budkin } from './Budkin'
import { Mech } from './Mech'
import { Miu } from './Miu'
import { Orbi } from './Orbi'
import { Rover } from './Rover'

export interface RobotDef {
  Model: () => React.JSX.Element
  /** Đỉnh đầu so với mặt bệ (kể cả ăng-ten, tai) — bong bóng thoại đặt ngay phía trên */
  top: number
  /** Tâm thân so với mặt bệ — điểm bấm để chọc robot */
  hitY: number
  /** Hoạt cảnh dài / ngắn hơn mức chung (ms) */
  transients?: Partial<Record<Transient, number>>
}

export const ROBOTS: Record<RobotModel, RobotDef> = {
  budkin: { Model: Budkin, top: 0.226, hitY: 0.06 },
  orbi: { Model: Orbi, top: 0.2, hitY: 0.11, transients: { poked: 700, celebrate: 1300 } },
  rover: { Model: Rover, top: 0.19, hitY: 0.05, transients: { poked: 650, celebrate: 1200 } },
  miu: { Model: Miu, top: 0.175, hitY: 0.06, transients: { poked: 900, celebrate: 1000 } },
  mech: { Model: Mech, top: 0.225, hitY: 0.1, transients: { poked: 1000, celebrate: 1200 } }
}
