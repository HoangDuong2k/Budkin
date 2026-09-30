# Budkin

Ứng dụng desktop quản lý công việc (Windows / Ubuntu, giao diện **tiếng Việt / English**) với giao diện là **một bàn làm việc 3D**:

- **Máy tính ở giữa** — màn hình của nó chính là nơi quản lý task (danh sách, Kanban, lịch).
- **Budkin, chú robot nhỏ bên trái** — luôn nhìn theo con trỏ chuột, báo hiệu khi có việc sắp đến hạn / đến hạn.
- **Đèn bàn bên phải** — bật / tắt đèn để đổi giữa hai theme.

Phong cách: thế giới hiện đại hậu tận thế, tông tối — tường bê tông nứt, cửa sổ vỡ nhìn ra thành phố đổ nát, còn đồ
trên bàn là thiết bị hiện đại (graphite, nhôm, kính đen, đèn LED xanh ngọc) trên mặt bàn gỗ óc chó sẫm. **Bật đèn** là
chạng vạng dưới ánh đèn LED trắng ấm; **tắt đèn** là mất điện ban đêm — chỉ còn màn hình, đèn nền bàn phím và mắt
robot phát sáng.

| Bật đèn (chạng vạng) | Tắt đèn (mất điện) |
|---|---|
| ![Bàn làm việc khi bật đèn](docs/screenshots/desk-day.png) | ![Bàn làm việc khi tắt đèn](docs/screenshots/desk-night.png) |

> Đang phát triển theo từng mốc (M0 → M8). Đã xong: khung dự án, dữ liệu (SQLite), giao diện quản lý việc trên màn hình,
> cảnh 3D (robot nhìn theo chuột, đèn đổi theme), nhắc việc và chạy nền, Kanban & Lịch, việc lặp lại, Cài đặt, xuất /
> nhập dữ liệu và sao lưu. Tiếp theo: đóng gói, phát hành.

## Danh sách, Kanban, Lịch

| Kanban | Lịch |
|---|---|
| ![Kanban](docs/screenshots/kanban.png) | ![Lịch](docs/screenshots/calendar.png) |

- **Kanban:** 3 cột Cần làm / Đang làm / Đã xong, kéo thả thẻ bằng chuột (hoặc bàn phím: Tab tới thẻ, Space nhấc lên,
  phím mũi tên di chuyển, Space thả). Kéo sang "Đã xong" là Budkin ăn mừng.
- **Lịch:** tháng hoặc tuần; kéo việc sang ngày khác để đổi hạn (nhắc việc tự đặt lại), kéo lên dải "Chưa có hạn" để bỏ
  hạn, kéo việc chưa có hạn xuống một ngày để xếp lịch.
- Cả hai đều lọc theo dự án / nhãn đang chọn và ô tìm kiếm.
- **Chế độ Mở rộng** (phím **F**): giao diện phủ gần kín cửa sổ, cảnh 3D tạm dừng — tiện khi cửa sổ nhỏ.

Phím tắt: **1 / 2 / 3** đổi cách xem · **N** thêm việc · **/** tìm · **F** Mở rộng · **Esc** đóng / thoát ·
**Ctrl+Shift+L** bật / tắt đèn · **Ctrl+,** Cài đặt · **Ctrl+Q** thoát hẳn.

## Việc lặp lại

- Ô **Lặp lại** trong khung sửa (việc cần có hạn): hằng ngày, ngày làm việc (T2–T6), hằng tuần, hằng tháng (hoặc ngày
  cuối tháng), hằng năm, hay **Tuỳ chỉnh…**: mỗi N ngày / tuần / tháng / năm, chọn các thứ trong tuần, kết thúc vào một
  ngày hoặc sau N lần, tính lần sau từ hạn của lần này hay từ ngày hoàn thành.
- Hoàn thành một lần (bấm ô tròn, "Xong" trên nhắc việc, kéo sang cột "Đã xong") là lần kế tiếp tự xuất hiện, kèm toast
  "Lần tới: …" có nút **Hoàn tác**. Hạn ngày 31 không bị trôi (31/1 → 28/2 → 31/3); việc quá hạn lâu thì lần kế tiếp là
  lần gần nhất tính từ hôm nay.
- **Bỏ qua lần này** dời việc sang lần kế tiếp; khi xoá thì chọn xoá riêng lần này hay cả chuỗi (các lần đã xong vẫn
  giữ lại).
- Lịch hiện mờ các lần lặp sắp tới.

## Nhắc việc, chạy nền

- Mỗi việc có hạn đặt được mức nhắc: không nhắc, đúng giờ, hoặc trước N phút / giờ / ngày (nhắc "sắp đến hạn" rồi
  nhắc lần nữa lúc "đến hạn"). Việc cả ngày nhắc lúc 9:00.
- Tới giờ, **Budkin** báo động (đèn đỏ, nhún nhảy, kêu bíp) và hiện bong bóng thoại: **Xong**, **10 phút** (báo lại),
  **Mở**, **×** (bỏ qua). Cửa sổ thu hẹp hoặc chế độ 2D thì nhắc việc hiện thành banner ngay trong màn hình.
- Khi đang không dùng app (cửa sổ ẩn / không có focus) thì có thêm thông báo của hệ điều hành. Nhiều việc cùng lúc
  (từ 3 việc) gộp thành một thông báo; nhắc trễ quá 6 giờ (máy tắt, ngủ qua đêm) thì chỉ ghi nhận, không báo.
- Bấm nút đóng: lần đầu Budkin hỏi ẩn xuống khay (vẫn nhắc việc) hay thoát hẳn. Thoát hẳn lúc nào cũng được bằng
  **Ctrl+Q** hoặc menu ở khay. Menu khay còn có: thêm việc nhanh, tắt nhắc 1 giờ, khởi động cùng máy.
- **Ubuntu không có khay hệ thống** nếu chưa bật tiện ích AppIndicator: khi đó nút đóng chỉ thu nhỏ cửa sổ. Bật khay:
  `sudo apt install gnome-shell-extension-appindicator`, rồi bật "Ubuntu AppIndicators" trong ứng dụng Extensions
  (đăng xuất / đăng nhập lại nếu chưa thấy).

## Cài đặt, dữ liệu, sao lưu

![Cài đặt](docs/screenshots/settings.png)

Mở **Cài đặt** bằng nút bánh răng ở chân thanh bên hoặc **Ctrl+,**. Đổi là lưu ngay:

- **Chung:** ngôn ngữ, tuần bắt đầu vào thứ Hai hay Chủ nhật, âm thanh và âm lượng, giảm chuyển động.
- **Nhắc việc:** mức nhắc mặc định, giờ nhắc cho việc cả ngày, tạm tắt nhắc (1 giờ / 4 giờ / 1 ngày), bấm nút đóng
  cửa sổ thì chạy nền hay thoát, khởi động cùng máy.
- **Hiển thị:** chất lượng 3D (Cao / Cân bằng / Tiết kiệm); chế độ Tự động, 3D vẽ bằng CPU (máy ảo, GPU lỗi) hoặc chỉ
  2D; trên Wayland có thêm lựa chọn chạy qua XWayland. Đổi chế độ thì bấm **Khởi động lại** để áp dụng.
- **Dữ liệu:** xuất / nhập, sao lưu, mở thư mục dữ liệu.

Dữ liệu chỉ nằm trên máy (SQLite trong thư mục dữ liệu của app: `~/.config/Budkin` trên Linux, `%APPDATA%\Budkin`
trên Windows), không cần tài khoản.

- **Xuất dữ liệu:** toàn bộ việc, dự án, nhãn, checklist ra một file JSON (kèm các việc đã xoá, để gộp giữa hai máy
  thì việc xoá bên này cũng xoá bên kia). Trạng thái nhắc việc và các thiết lập riêng của máy không đi theo file.
- **Nhập dữ liệu:** chọn file, xem trước số việc rồi chọn **Gộp** (giữ dữ liệu trên máy, việc nào sửa sau cùng thì lấy
  bản đó) hoặc **Thay thế** (dùng đúng dữ liệu trong file). File lạ, file hỏng, file của bản Budkin mới hơn đều bị từ
  chối mà không ghi gì. Trước mỗi lần nhập Budkin tự sao lưu; nhắc việc đã qua giờ trong file không báo dồn lại.
- **Sao lưu tự động** mỗi ngày một bản, giữ 7 ngày gần nhất; thêm **Sao lưu ngay** khi cần. **Khôi phục** một bản thì
  Budkin khởi động lại rồi mới thay dữ liệu; dữ liệu ngay trước lúc khôi phục vẫn được giữ trong một bản sao lưu riêng.

## Cài đặt để phát triển

Yêu cầu: **Node.js 24** (trùng bản Node trong Electron 44 — cần cho `node:sqlite` khi chạy unit test), Git.

```bash
git clone https://github.com/HoangDuong2k/Budkin.git && cd Budkin
nvm install 24 && nvm use   # đọc phiên bản từ .nvmrc
npm install
npm run dev                 # chạy app ở chế độ phát triển
npm run dev:linux           # trên Linux nếu gặp lỗi "SUID sandbox helper"
```

Electron 44 tải file chạy ở lần dùng đầu tiên (không có script postinstall).

## Kiểm thử

```bash
npm run typecheck
npm test                    # vitest: toán khung hình, nhắc việc, dữ liệu, i18n, cấu hình
npm run build && npm run e2e   # mở app thật, điều khiển bằng chuột / bàn phím, ảnh chụp trong test-output/e2e/
```

- Máy không có GPU (CI, máy ảo): `BUDKIN_E2E_SWIFTSHADER=1 npm run e2e` — WebGL vẽ bằng CPU.
- Kiểm thử bản đã đóng gói: `BUDKIN_E2E_EXE=release/linux-unpacked/budkin npm run e2e`.
- Linux không có màn hình (CI): `xvfb-run -a -s "-screen 0 1920x1080x24" npm run e2e`. Trên máy có màn hình, cửa sổ app
  hiện lên trong lúc chạy e2e (không giành focus); cài `xvfb` để chạy ẩn. Phiên đăng nhập Wayland (Ubuntu mặc định) thì
  phải bỏ biến Wayland, không thì app vẫn mở lên màn hình thật:
  `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 BUDKIN_E2E_SWIFTSHADER=1 xvfb-run -a -s "-screen 0 1920x1080x24" npm run e2e`.
- E2E chạy với đồng hồ của app đặt ở 6:00 sáng hôm nay; phần nhắc việc tự đẩy đồng hồ tới để kiểm tra từng mốc nhắc.
- Ảnh giới thiệu: `npm run build && npm run screenshots` → `docs/screenshots/`.
- Đo cảnh 3D (số lần vẽ, số tam giác — ngân sách ≤ 90 lần vẽ mỗi khung): `npm run build && npm run stats:scene`.
- Đo CPU / bộ nhớ khi để yên (chuyển động nền → đứng yên → robot ngủ → cửa sổ ẩn; mục tiêu: rảnh ở mức Cân bằng
  renderer < 2%, GPU < 3%, robot ngủ gần 0): `npm run build && npm run perf:idle`. Chạy dài để tìm rò rỉ bộ nhớ:
  `npm run perf:idle -- --soak 120` (120 phút, mỗi phút ghi bộ nhớ). Kết quả trong `test-output/perf/`.

## Đóng gói bộ cài

| Hệ điều hành | Lệnh (chạy trên chính hệ điều hành đó) | Kết quả trong `release/` |
|---|---|---|
| **Windows** | `npm ci` rồi `npm run dist:win` | `Budkin-Setup-x.y.z.exe` (cài cho người dùng hiện tại, không cần quyền Administrator) |
| **Ubuntu** | `npm ci` rồi `npm run dist:linux` | `.deb` (khuyên dùng) và `.AppImage` |

- **deb** tự cài profile AppArmor để sandbox của Chromium chạy được trên Ubuntu 24.04+.
- **AppImage** dùng runtime tĩnh (không cần `libfuse2`); tự thêm `--no-sandbox` khi hệ điều hành chặn user namespace.

**GitHub Actions** (`.github/workflows/build.yml`) chạy trên máy Windows và Ubuntu thật: kiểm tra kiểu, unit test, build,
e2e (WebGL bằng SwiftShader), đóng gói rồi e2e lại trên bản đã đóng gói; trên Ubuntu còn cài bản `.deb` và chạy e2e
**không** tắt sandbox để chắc chắn profile AppArmor hoạt động.

## Kiến trúc

- `src/main` — main process: cửa sổ, IPC (kiểm tra tham số bằng zod), SQLite (`node:sqlite`), nhắc việc, khay hệ thống.
- `src/preload` — mở `window.api` (sandbox) cho renderer.
- `src/renderer` — React: cảnh 3D (React Three Fiber) + lớp DOM đặt khít lên màn hình máy tính 3D (chữ sắc nét,
  bộ gõ tiếng Việt chạy bình thường) + chế độ 2D khi máy không có WebGL.
- `src/shared` — kiểu dữ liệu, hợp đồng IPC, i18n, bảng màu dùng chung.
