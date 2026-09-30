// Tính cách từng robot: tên, lời giới thiệu (Cài đặt), câu tóm tắt việc hôm nay khi được bấm vào, lời chào khi vừa
// lên bệ. Cùng một thông tin, mỗi robot nói theo kiểu của mình
import { tr, trKey } from '../../../../shared/i18n'
import type { RobotModel } from '../../../../shared/robots'

export interface DayCounts {
  /** Việc còn phải làm hôm nay (kể cả quá hạn) */
  today: number
  overdue: number
}

export interface Personality {
  name: string
  /** Giới thiệu ngắn trong Cài đặt (dịch lúc hiển thị) */
  blurb: string
  summary(c: DayCounts): string
  greeting(): string
}

export const PERSONALITY: Record<RobotModel, Personality> = {
  budkin: {
    name: 'Budkin',
    blurb: trKey('Robot bánh xe vui tính, hay nhún nhảy'),
    summary: (c) =>
      c.today === 0
        ? tr('Hết việc hôm nay rồi!')
        : c.overdue > 0
          ? tr('Hôm nay còn {n} việc, {m} việc quá hạn.', { n: c.today, m: c.overdue })
          : tr('Hôm nay còn {n} việc.', { n: c.today }),
    greeting: () => tr('Chào bạn! Budkin đây — có việc đến hạn là mình báo ngay.')
  },
  orbi: {
    name: 'Orbi',
    blurb: trKey('Quả cầu bay điềm tĩnh, nói ngắn gọn'),
    summary: (c) =>
      c.today === 0
        ? tr('Hôm nay không còn việc nào.')
        : c.overdue > 0
          ? tr('Còn {n} việc hôm nay. {m} việc đã quá hạn.', { n: c.today, m: c.overdue })
          : tr('Còn {n} việc hôm nay.', { n: c.today }),
    greeting: () => tr('Orbi đã sẵn sàng. Mình sẽ theo dõi các hạn chót.')
  },
  rover: {
    name: 'Rover',
    blurb: trKey('Xe bánh xích hăng hái, báo cáo như ngoài thực địa'),
    summary: (c) =>
      c.today === 0
        ? tr('Báo cáo: đã xong hết nhiệm vụ hôm nay!')
        : c.overdue > 0
          ? tr('Báo cáo: {n} nhiệm vụ hôm nay, {m} nhiệm vụ trễ hạn!', { n: c.today, m: c.overdue })
          : tr('Báo cáo: {n} nhiệm vụ hôm nay!', { n: c.today }),
    greeting: () => tr('Rover có mặt! Sẵn sàng nhận nhiệm vụ.')
  },
  miu: {
    name: 'Miu',
    blurb: trKey('Mèo máy tinh nghịch, được chọc là rừ rừ'),
    summary: (c) =>
      c.today === 0
        ? tr('Meo~ hết việc rồi, nghỉ thôi!')
        : c.overdue > 0
          ? tr('Meo~ còn {n} việc, {m} việc trễ rồi đó!', { n: c.today, m: c.overdue })
          : tr('Meo~ hôm nay còn {n} việc nè.', { n: c.today }),
    greeting: () => tr('Meo~ Miu đây! Bấm vào Miu là Miu kể việc cho nghe.')
  },
  mech: {
    name: 'Mech',
    blurb: trKey('Người máy hai chân nghiêm túc, chào kiểu nhà binh'),
    summary: (c) =>
      c.today === 0
        ? tr('Đã kiểm tra: không còn việc nào hôm nay.')
        : c.overdue > 0
          ? tr('Đã kiểm tra: {n} việc hôm nay, {m} việc quá hạn.', { n: c.today, m: c.overdue })
          : tr('Đã kiểm tra: {n} việc hôm nay.', { n: c.today }),
    greeting: () => tr('Mech trình diện. Mọi hạn chót đều trong tầm kiểm soát.')
  }
}
