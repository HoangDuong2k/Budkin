// Các mẫu robot đứng trên bệ tròn bên trái màn hình (bấm vào bệ để đổi). Cùng chức năng (nhìn theo chuột, nhắc việc,
// tóm tắt khi bấm, ngủ khi rảnh) nhưng mỗi robot một dáng, một tính cách: hoạt cảnh, giọng, lời thoại, kiểu bong bóng.
export const ROBOT_MODELS = ['budkin', 'orbi', 'rover', 'miu', 'mech'] as const
export type RobotModel = (typeof ROBOT_MODELS)[number]

export const DEFAULT_ROBOT: RobotModel = 'budkin'

export function isRobotModel(v: unknown): v is RobotModel {
  return typeof v === 'string' && (ROBOT_MODELS as readonly string[]).includes(v)
}

/** Robot kế tiếp khi bấm vào bệ (hết lượt thì quay về robot đầu) */
export function nextRobot(id: RobotModel): RobotModel {
  return ROBOT_MODELS[(ROBOT_MODELS.indexOf(id) + 1) % ROBOT_MODELS.length]
}
