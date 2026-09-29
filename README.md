# DeskBuddy

Ứng dụng desktop quản lý công việc (Windows / Ubuntu, giao diện **tiếng Việt / English**) với giao diện là **một bàn làm việc 3D**:

- **Máy tính ở giữa** — màn hình của nó chính là nơi quản lý task (danh sách, Kanban, lịch).
- **Robot nhỏ bên trái** — luôn nhìn theo con trỏ chuột, báo hiệu khi có việc sắp đến hạn / đến hạn.
- **Đèn bàn bên phải** — bật / tắt đèn để đổi giữa hai theme.

Phong cách: thế giới hiện đại hậu tận thế, tông tối — tường bê tông nứt, cửa sổ vỡ nhìn ra thành phố đổ nát, còn đồ
trên bàn là thiết bị hiện đại (graphite, nhôm, kính đen, đèn LED xanh ngọc) trên mặt bàn gỗ óc chó sẫm. **Bật đèn** là
chạng vạng dưới ánh đèn LED trắng ấm; **tắt đèn** là mất điện ban đêm — chỉ còn màn hình, đèn nền bàn phím và mắt
robot phát sáng.

| Bật đèn (chạng vạng) | Tắt đèn (mất điện) |
|---|---|
| ![Bàn làm việc khi bật đèn](docs/screenshots/desk-day.png) | ![Bàn làm việc khi tắt đèn](docs/screenshots/desk-night.png) |

> Đang phát triển theo từng mốc (M0 → M8). Đã xong: khung dự án, dữ liệu (SQLite), giao diện quản lý việc trên màn hình,
> cảnh 3D (robot nhìn theo chuột, đèn đổi theme). Tiếp theo: nhắc việc, Kanban & Lịch, task lặp lại, đóng gói.

## Cài đặt để phát triển

Yêu cầu: **Node.js 24** (trùng bản Node trong Electron 44 — cần cho `node:sqlite` khi chạy unit test), Git.

```bash
nvm install 24 && nvm use   # đọc phiên bản từ .nvmrc
npm install
npm run dev                 # chạy app ở chế độ phát triển
npm run dev:linux           # trên Linux nếu gặp lỗi "SUID sandbox helper"
```

Electron 44 tải file chạy ở lần dùng đầu tiên (không có script postinstall).

## Kiểm thử

```bash
npm run typecheck
npm test                    # vitest: toán khung hình, i18n, cấu hình
npm run build && npm run e2e   # mở app thật, điều khiển bằng chuột / bàn phím, ảnh chụp trong test-output/e2e/
```

- Máy không có GPU (CI, máy ảo): `DESKBUDDY_E2E_SWIFTSHADER=1 npm run e2e` — WebGL vẽ bằng CPU.
- Kiểm thử bản đã đóng gói: `DESKBUDDY_E2E_EXE=release/linux-unpacked/desk-buddy npm run e2e`.
- Linux không có màn hình (CI): `xvfb-run -a -s "-screen 0 1920x1080x24" npm run e2e`. Trên máy có màn hình, cửa sổ app
  hiện lên trong lúc chạy e2e (không giành focus); cài `xvfb` để chạy ẩn.
- Ảnh giới thiệu: `npm run build && npm run screenshots` → `docs/screenshots/`.
- Đo cảnh 3D (số lần vẽ, số tam giác — ngân sách ≤ 90 lần vẽ mỗi khung): `npm run build && npm run stats:scene`.

## Đóng gói bộ cài

| Hệ điều hành | Lệnh (chạy trên chính hệ điều hành đó) | Kết quả trong `release/` |
|---|---|---|
| **Windows** | `npm ci` rồi `npm run dist:win` | `DeskBuddy-Setup-x.y.z.exe` (cài cho người dùng hiện tại, không cần quyền Administrator) |
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
