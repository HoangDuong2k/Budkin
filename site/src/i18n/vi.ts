// Nội dung trang giới thiệu — tiếng Việt (trang chính, /Budkin/). Bản tiếng Anh (en.ts) có cùng cấu trúc.
// Mỗi phần của trang là một câu hỏi; robot ở góc dùng chính các câu hỏi này làm mục lục.

export const REPO = 'https://github.com/HoangDuong2k/Budkin'
/** Bản phát hành mới nhất (chưa có bản nào thì GitHub tự đưa về trang Releases) */
export const DOWNLOAD = `${REPO}/releases/latest`

/** Ảnh chụp trong docs/screenshots */
export interface Shot {
  src: string
  alt: string
  /** Nhãn nhỏ ở góc ảnh (vd. "Bật đèn" / "Tắt đèn" khi đặt hai ảnh cạnh nhau) */
  label?: string
  /** Cắt cận một vùng của ảnh gốc: toạ độ và kích thước theo tỉ lệ 0…1 của ảnh */
  crop?: { x: number; y: number; w: number; h: number }
}

/** Một ý chính: phần in đậm rồi lời giải thích */
export interface Point {
  title: string
  text: string
}

export interface Section {
  id: string
  /** Câu hỏi: tiêu đề của phần, cũng là một dòng trong mục lục của robot */
  question: string
  /** Trả lời ngắn ngay dưới câu hỏi */
  answer: string
  /** Các ý chi tiết dưới câu trả lời */
  points?: Point[]
  /** Ảnh minh hoạ */
  shot?: Shot
  /** Ảnh nhỏ đặt chồng lên góc dưới ảnh chính (để so sánh) */
  inset?: Shot
  /** Thẻ theo hệ điều hành (phần cài đặt) */
  platforms?: Point[]
}

export const vi = {
  lang: 'vi',
  /** Mã ngôn ngữ cho Open Graph */
  locale: 'vi_VN',
  title: 'Budkin — bàn làm việc có robot nhắc việc',
  description:
    'Ứng dụng quản lý công việc miễn phí cho Windows, macOS, Ubuntu: danh sách, Kanban, lịch trên một bàn làm việc 3D, có chú robot nhìn theo chuột và nhắc khi việc đến hạn.',
  /** Ảnh khi chia sẻ link (public/og-vi.png, 1200×630) */
  ogImage: { src: 'og-vi.png', alt: 'Budkin: bàn làm việc 3D với danh sách việc trên màn hình, robot nhắc việc và đèn bàn' },
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
    shot: { src: 'desk-night.png', alt: 'Bàn làm việc Budkin lúc tắt đèn: màn hình danh sách việc, robot bên trái đang nhắc một việc đến hạn, đèn bàn bên phải' }
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
        'Một ứng dụng quản lý công việc cho máy tính, có giao diện là một bàn làm việc 3D. Thay vì một cửa sổ đầy bảng biểu, bạn ngồi trước một chiếc bàn: mọi việc nằm trên màn hình máy tính ở giữa, robot bên trái canh giờ, đèn bàn bên phải đổi sáng tối.',
      points: [
        { title: 'Máy tính ở giữa', text: 'màn hình của nó là nơi ghi việc: danh sách, Kanban, lịch. Chữ sắc nét, gõ tiếng Việt bình thường.' },
        { title: 'Robot bên trái', text: 'luôn nhìn theo con trỏ chuột, lên tiếng khi việc sắp đến hạn hay đã đến hạn.' },
        { title: 'Đèn bàn bên phải', text: 'bật đèn là chạng vạng, tắt đèn là đêm mất điện.' },
        { title: 'Tiếng Việt và tiếng Anh', text: 'đổi ngôn ngữ ngay ở chân thanh bên.' }
      ],
      shot: { src: 'desk-day.png', alt: 'Bàn làm việc Budkin lúc bật đèn: robot, màn hình danh sách việc, đèn bàn' }
    },
    {
      id: 'tasks',
      question: 'Quản lý việc thế nào?',
      answer:
        'Ghi việc vào danh sách, kéo thẻ qua lại trên Kanban hoặc xếp lên lịch. Mỗi việc có hạn, giờ, mức nhắc, ưu tiên, dự án, nhãn, checklist và ghi chú.',
      points: [
        { title: 'Danh sách', text: 'Hôm nay, Sắp tới, Quá hạn, Tất cả, Đã xong; dự án và nhãn ở thanh bên.' },
        { title: 'Kanban', text: 'ba cột Cần làm, Đang làm, Đã xong, kéo thả bằng chuột hay bàn phím. Kéo sang "Đã xong" là robot ăn mừng.' },
        { title: 'Lịch tháng và tuần', text: 'kéo việc sang ngày khác để đổi hạn, nhắc việc tự đặt lại theo.' },
        {
          title: 'Việc lặp lại',
          text: 'hằng ngày, ngày làm việc, hằng tuần, hằng tháng, hằng năm hoặc tuỳ chỉnh. Xong lần này là lần sau tự hiện ra, kèm nút Hoàn tác.'
        },
        { title: 'Tìm không cần dấu', text: 'gõ "bao cao" vẫn ra "Báo cáo". Phím N thêm việc, / để tìm, 1 · 2 · 3 đổi cách xem.' }
      ],
      shot: { src: 'kanban.png', alt: 'Bảng Kanban ba cột Cần làm, Đang làm, Đã xong', label: 'Kanban' },
      inset: { src: 'calendar.png', alt: 'Lịch tháng với các việc xếp theo ngày', label: 'Lịch' }
    },
    {
      id: 'robot',
      question: 'Robot nhắc việc ra sao?',
      answer:
        'Tới giờ, robot báo động: đèn đỏ, nhún nhảy, kêu bíp và hiện bong bóng thoại ngay cạnh màn hình. Bạn trả lời luôn trên bong bóng, không phải mở việc ra.',
      points: [
        { title: 'Xong · 10 phút · Mở', text: 'đánh dấu xong, báo lại sau 10 phút, hoặc mở việc đó ra xem.' },
        { title: 'Nhắc trước tuỳ ý', text: 'đúng giờ, hoặc trước vài phút, vài giờ, vài ngày. Việc cả ngày nhắc lúc 9:00 (đổi được).' },
        { title: 'Đang ở app khác', text: 'có thêm thông báo của hệ điều hành; nhiều việc cùng lúc thì gộp thành một.' },
        { title: 'Chạy nền', text: 'đóng cửa sổ, Budkin vẫn nằm dưới khay để nhắc đúng giờ. Bấm vào robot để nghe tóm tắt việc hôm nay.' },
        { title: 'Gần như không tốn máy', text: 'cảnh chỉ vẽ khi có gì thay đổi; để yên lâu thì robot ngủ, cả cửa sổ thôi vẽ lại.' }
      ],
      shot: {
        src: 'desk-night.png',
        alt: 'Robot Budkin hiện bong bóng "Đến hạn · hôm nay" với các nút Xong, 10 phút, Mở',
        crop: { x: 0, y: 0.25, w: 0.355, h: 0.6 }
      }
    },
    {
      id: 'robots',
      question: 'Có những robot nào?',
      answer:
        'Năm robot, mỗi chú một tính cách: dáng, hoạt cảnh, giọng và lời thoại riêng. Bấm vào bệ tròn để đổi robot: robot cũ xoay rồi chìm xuống, robot mới trồi lên chào bạn.',
      points: [
        { title: 'Budkin', text: 'robot bánh xe vui tính: bị chọc thì bẹp rồi giãn ra, ăn mừng thì nhảy xoay một vòng.' },
        { title: 'Orbi', text: 'quả cầu bay điềm tĩnh với một mắt ống kính; nói ngắn gọn, giọng "bloop" trong như chuông.' },
        { title: 'Rover', text: 'xe bánh xích hăng hái có cột kính tiềm vọng; nói như báo cáo ngoài thực địa.' },
        { title: 'Miu', text: 'mèo máy tinh nghịch: vểnh tai khi con trỏ lại gần, ngủ thì quấn đuôi, nói "Meo~".' },
        { title: 'Mech', text: 'người máy hai chân nghiêm túc: bị chọc thì chào kiểu nhà binh, báo cáo "Đã kiểm tra: …".' }
      ]
    },
    {
      id: 'lamp',
      question: 'Bật tắt đèn để làm gì?',
      answer:
        'Đèn bàn là công tắc giao diện. Bấm vào đèn (hoặc Ctrl+Shift+L) để đổi giữa hai khung cảnh: cả căn phòng sáng lên hay tối đi theo.',
      points: [
        { title: 'Bật đèn', text: 'chạng vạng dưới ánh LED trắng ấm, tường bê tông và thành phố đổ nát ngoài cửa sổ.' },
        { title: 'Tắt đèn', text: 'đêm mất điện, chỉ còn màn hình, đèn nền bàn phím và mắt robot phát sáng.' },
        { title: 'Nhớ lựa chọn', text: 'lần đầu mở, Budkin sáng hay tối theo hệ điều hành; sau đó giữ đúng như bạn để.' }
      ],
      shot: { src: 'desk-night.png', alt: 'Bàn làm việc lúc tắt đèn', label: 'Tắt đèn' },
      inset: { src: 'desk-day.png', alt: 'Bàn làm việc lúc bật đèn', label: 'Bật đèn' }
    },
    {
      id: 'claude',
      question: 'Hỏi Claude về việc của tôi được không?',
      answer:
        'Được. Kết nối Budkin với Claude Desktop hoặc Claude Code rồi trò chuyện như bình thường, Claude đọc và sửa việc trong Budkin cho bạn. Dùng tài khoản Claude bạn đang có: Budkin không tự gọi AI, không cần API key, không tốn thêm phí.',
      points: [
        { title: 'Hỏi và giao việc bằng lời', text: '"hôm nay tôi có việc gì?", "thêm việc gọi điện cho mẹ lúc 8 giờ tối mai", "dời các việc quá hạn sang thứ Hai".' },
        { title: 'Bật bằng một nút', text: 'Cài đặt → Kết nối AI → Kết nối. Ứng dụng AI khác có hỗ trợ MCP cũng dùng được.' },
        { title: 'Bạn giữ quyền', text: 'Tắt, Chỉ xem hoặc Xem và sửa. Mỗi thay đổi Claude làm đều có nút Hoàn tác trong 15 phút.' },
        { title: 'Budkin đang tắt?', text: 'khi Claude cần đọc hay sửa việc, Budkin tự mở chạy nền rồi trả lời.' }
      ],
      shot: { src: 'desk-ai.png', alt: 'Claude vừa thêm hai việc vào Budkin, kèm thông báo có nút Hoàn tác' },
      inset: { src: 'settings-ai.png', alt: 'Cài đặt → Kết nối AI: Claude Desktop đã kết nối, quyền Xem và sửa', label: 'Kết nối AI' }
    },
    {
      id: 'data',
      question: 'Dữ liệu nằm ở đâu?',
      answer: 'Chỉ trên máy của bạn. Không tài khoản, không máy chủ, không gửi đi đâu, trừ khi bạn tự kết nối Claude để hỏi đáp.',
      points: [
        { title: 'Sao lưu tự động', text: 'mỗi ngày một bản, giữ 7 ngày gần nhất; khôi phục chỉ với một nút bấm.' },
        { title: 'Chuyển sang máy khác', text: 'xuất toàn bộ việc ra một file, nhập ở máy mới: gộp với dữ liệu sẵn có hoặc thay thế.' },
        { title: 'Gỡ cài đặt không mất việc', text: 'dữ liệu được giữ lại, cài lại là còn nguyên.' }
      ],
      shot: { src: 'settings.png', alt: 'Cài đặt → Dữ liệu: xuất, nhập, danh sách bản sao lưu hằng ngày' }
    },
    {
      id: 'light',
      question: 'Máy yếu có chạy được không?',
      answer:
        'Được. Máy không có card đồ hoạ, GPU hay gặp lỗi, hoặc khi bạn chọn Chỉ 2D, cả bàn làm việc được vẽ lại bằng tranh vector, cùng phong cách và bố cục với bản 3D.',
      points: [
        { title: 'Vẫn đủ 5 robot', text: 'nhìn theo con trỏ, chớp mắt, báo động, ăn mừng, ngủ có "Zzz".' },
        { title: 'Nhẹ hơn nhiều', text: 'rê chuột liên tục chỉ tốn khoảng một phần ba lõi CPU, để yên gần như không tốn gì.' },
        { title: 'Tự chuyển', text: 'máy không có WebGL hay cảnh 3D gặp lỗi thì Budkin tự dùng bản 2D.' }
      ],
      shot: { src: 'desk-2d-night.png', alt: 'Bàn làm việc 2D lúc tắt đèn', label: 'Tắt đèn' },
      inset: { src: 'desk-2d-day.png', alt: 'Bàn làm việc 2D lúc bật đèn', label: 'Bật đèn' }
    },
    {
      id: 'install',
      question: 'Cài trên máy nào?',
      answer: 'Windows, macOS và Ubuntu; các bản Linux khác chạy bằng AppImage. Bộ cài có ở trang phát hành trên GitHub.',
      platforms: [
        {
          title: 'Windows 10 / 11',
          text: 'Chạy Budkin-Setup, không cần quyền Administrator. Bộ cài chưa ký số nên lần đầu SmartScreen có thể chặn: bấm More info rồi Run anyway.'
        },
        {
          title: 'macOS 13 trở lên',
          text: 'Mac chip Apple dùng bản arm64, chip Intel dùng bản x64. Kéo Budkin vào Applications; lần đầu mở, vào System Settings → Privacy & Security → Open Anyway.'
        },
        { title: 'Ubuntu 24.04 trở lên', text: 'Cài gói .deb bằng lệnh sudo apt install ./budkin_x.y.z_amd64.deb, rồi mở Budkin từ danh sách ứng dụng.' },
        { title: 'Linux khác', text: 'Dùng bản AppImage: cho phép chạy (chmod +x) rồi mở, không cần cài thêm gì.' }
      ]
    },
    {
      id: 'price',
      question: 'Có mất phí không?',
      answer:
        'Không. Budkin miễn phí và là mã nguồn mở theo giấy phép MIT: dùng, sửa, chia sẻ lại thoải mái. Kết nối Claude cũng không tốn thêm phí, vì Budkin dùng tài khoản Claude bạn đang có.'
    }
  ] satisfies Section[] as Section[],
  footer: {
    tagline: 'Bàn làm việc có robot nhắc việc.',
    license: 'Miễn phí, mã nguồn mở theo giấy phép MIT.',
    madeBy: 'Hoang Duong'
  }
}

export type Dict = typeof vi
