// Danh sách robot 2D (kích thước, độ dài hoạt cảnh dùng chung với robot 3D — scene/robots/index.ts)
import type { RobotModel } from '../../../../shared/robots'
import { ROBOT, ROBOT_EYES } from '../../scene/palette3d'
import { Budkin } from './Budkin'
import { Mech } from './Mech'
import { Miu } from './Miu'
import { Orbi } from './Orbi'
import { Rover } from './Rover'

export const FLAT_ROBOTS: Record<RobotModel, () => React.JSX.Element> = { budkin: Budkin, orbi: Orbi, rover: Rover, miu: Miu, mech: Mech }

/** Màu mắt từng robot */
export const EYE_COLOR: Record<RobotModel, string> = { budkin: ROBOT.eye, ...ROBOT_EYES }
