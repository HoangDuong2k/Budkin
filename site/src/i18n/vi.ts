// Nội dung trang giới thiệu — tiếng Việt (trang chính, /Budkin/). Bản tiếng Anh (en.ts) có cùng cấu trúc.
// Mỗi phần của trang là một câu hỏi; robot ở góc dùng chính các câu hỏi này làm mục lục.

export const REPO = 'https://github.com/HoangDuong2k/Budkin'
/** Chưa có bản phát hành thì nút tải dẫn tới trang Releases */
export const DOWNLOAD = `${REPO}/releases`

export interface Section {
  id: string
  /** Câu hỏi: tiêu đề của phần, cũng là một dòng trong mục lục của robot */
  question: string
  /** Trả lời ngắn ngay dưới câu hỏi */
  answer: string
  /** Ảnh chụp minh hoạ (docs/screenshots) */
  shot?: { src: string; alt: string }
}

export const vi = {
  lang: 'vi',
  title: 'Budkin — bàn làm việc có robot nhắc việc',
  description:
    'Ứng dụng quản lý công việc miễn phí cho Windows, macOS, Ubuntu: danh sách, Kanban, lịch trên một bàn làm việc 3D, có chú robot nhìn theo chuột và nhắc khi việc đến hạn.',
  nav: {
    download: 'Tải về',
    github: 'Mã nguồn trên GitHub',
    switchLang: { label: 'EN', title: 'English', href: '/en/' },
    menu: 'Menu'
  },
  hero: {
    eyebrow: 'Miễn phí · mã nguồn mở',
    title: 'Việc cần làm, đặt trên một bàn làm việc có robot canh giờ',
    description:
      'Budkin là ứng dụng quản lý công việc cho máy tính. Màn hình trên bàn là nơi bạn ghi việc, chú robot bên cạnh nhìn theo con trỏ và lên tiếng khi việc đến hạn, còn đèn bàn thì bật tắt để đổi sáng tối.',
    download: 'Tải Budkin',
    source: 'Xem mã nguồn',
    footnote: 'Windows · macOS · Ubuntu — dữ liệu chỉ nằm trên máy bạn',
    shot: { src: 'desk-night.png', alt: 'Bàn làm việc Budkin lúc tắt đèn: màn hình danh sách việc, robot bên trái, đèn bàn bên phải' }
  },
  robot: {
    button: 'Hỏi Budkin: mở mục lục',
    title: 'Bạn muốn biết gì về mình?',
    greeting: 'Chào bạn! Bấm vào mình để xem mục lục nhé.'
  },
  sections: [
    {
      id: 'what',
      question: 'Budkin là gì?',
      answer:
        'Một ứng dụng desktop quản lý công việc với giao diện là bàn làm việc 3D: máy tính ở giữa để ghi việc, robot bên trái để nhắc việc, đèn bàn bên phải để đổi giao diện sáng tối.',
      shot: { src: 'desk-day.png', alt: 'Bàn làm việc Budkin lúc bật đèn' }
    },
    {
      id: 'tasks',
      question: 'Quản lý việc thế nào?',
      answer:
        'Ghi việc vào danh sách, kéo thả thẻ trên Kanban hoặc xếp lên lịch tháng, tuần. Mỗi việc có hạn, giờ nhắc, ưu tiên, dự án, nhãn, checklist và có thể lặp lại.',
      shot: { src: 'kanban.png', alt: 'Bảng Kanban ba cột Cần làm, Đang làm, Đã xong' }
    },
    {
      id: 'robot',
      question: 'Robot nhắc việc ra sao?',
      answer:
        'Tới giờ, robot báo động: đèn đỏ, nhún nhảy, kêu bíp và hiện bong bóng có nút Xong, báo lại sau 10 phút, Mở. Bấm vào robot thì nó tóm tắt việc hôm nay; để yên lâu thì nó ngủ.'
    },
    {
      id: 'lamp',
      question: 'Bật tắt đèn để làm gì?',
      answer:
        'Đèn bàn là công tắc giao diện. Bật đèn là chạng vạng dưới ánh LED trắng ấm; tắt đèn là đêm mất điện, chỉ còn màn hình, bàn phím và mắt robot phát sáng.',
      shot: { src: 'desk-night.png', alt: 'Bàn làm việc lúc tắt đèn' }
    },
    {
      id: 'claude',
      question: 'Hỏi Claude về việc của tôi được không?',
      answer:
        'Được. Kết nối Budkin với Claude Desktop hoặc Claude Code rồi hỏi “hôm nay tôi có việc gì?”, hay nhờ thêm, dời việc bằng lời. Dùng tài khoản Claude bạn đang có: Budkin không tự gọi AI, không cần API key.',
      shot: { src: 'desk-ai.png', alt: 'Claude vừa thêm việc vào Budkin, kèm nút Hoàn tác' }
    },
    {
      id: 'data',
      question: 'Dữ liệu nằm ở đâu?',
      answer:
        'Chỉ trên máy của bạn: không tài khoản, không máy chủ, không gửi đi đâu. Mỗi ngày Budkin tự sao lưu một bản; muốn chuyển máy thì xuất ra một file rồi nhập ở máy mới.',
      shot: { src: 'settings.png', alt: 'Cài đặt của Budkin' }
    },
    {
      id: 'install',
      question: 'Cài trên máy nào?',
      answer:
        'Windows 10 / 11, macOS 13 trở lên (chip Apple và Intel), Ubuntu 24.04 trở lên; các bản Linux khác chạy bằng AppImage. Máy không có card đồ hoạ thì dùng bàn làm việc 2D, nhẹ hơn nhiều.',
      shot: { src: 'desk-2d-day.png', alt: 'Bàn làm việc 2D' }
    },
    {
      id: 'price',
      question: 'Có mất phí không?',
      answer:
        'Không. Budkin miễn phí và là mã nguồn mở theo giấy phép MIT: dùng, sửa, chia sẻ lại thoải mái. Kết nối Claude cũng không tốn thêm phí, vì Budkin dùng tài khoản Claude bạn đang có.'
    }
  ] satisfies Section[],
  footer: {
    tagline: 'Bàn làm việc có robot nhắc việc.',
    license: 'Miễn phí, mã nguồn mở theo giấy phép MIT.',
    madeBy: 'Hoang Duong'
  }
}

export type Dict = typeof vi
