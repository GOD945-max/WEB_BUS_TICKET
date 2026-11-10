# Hệ Thống Đặt Vé Xe Khách Liên Tỉnh (Bus Ticket Booking System)

Đồ án môn **Web Application Development** — Mô hình nhóm 5 thành viên:
- **Backend & SSR**: Node.js, Express.js, EJS
- **Database**: PostgreSQL 16 (10 bảng chuẩn hóa + Unique Partial Index chống đặt trùng ghế)
- **Frontend**: Bootstrap 5 (trang chức năng chính) + Tailwind CSS (trang tĩnh Giới thiệu, Chính sách, FAQ) + Fetch API (AJAX không tải lại trang)
- **Triển khai**: Docker & Docker Compose chạy 1 lệnh

---

## 1. Khởi chạy nhanh bằng Docker Compose (1 lệnh)

```bash
docker compose up -d --build
```
- Website chạy tại: `http://localhost:3000`
- PostgreSQL chạy tại cổng `5432` (Tự động chạy `db/01_init_schema.sql` và `db/02_seed_data.sql`).

### Tài khoản mẫu (Seed Data)
| Vai trò | Email | Mật khẩu |
|---|---|---|
| **Admin** | `admin@futabus.vn` | `123456` |
| **Nhân viên soát vé (Staff)** | `staff@futabus.vn` | `123456` |
| **Khách hàng 1** | `khach1@gmail.com` | `123456` |
| **Khách hàng 2** | `khach2@gmail.com` | `123456` |

---

## 2. Cấu trúc thư mục & Phân vùng file cho 5 Thành viên

```text
WEB_BUS_TICKET/
├── docker-compose.yml & Dockerfile     # [TV5 commit] Cấu hình chạy Postgres + Web bằng 1 lệnh
├── db/
│   ├── 01_init_schema.sql              # [TV4 commit] Tạo 10 bảng, khóa chính, khóa ngoại, index
│   └── 02_seed_data.sql                # [TV4 commit] Dữ liệu mẫu (10 bến, 5 tuyến, 6 xe, 12 chuyến, 4 user)
├── src/
│   ├── app.js                          # [TV2 gác cổng] Khởi tạo Express, cấu hình EJS, Session, Static
│   ├── config/
│   │   ├── db.js                       # [TV1 commit] Kết nối Pool tới PostgreSQL
│   │   └── mailer.js                   # [TV3 commit] Cấu hình Nodemailer gửi email xác thực & vé QR
│   ├── models/                         # === KHU VỰC CỦA THÀNH VIÊN 1 (VIẾT HÀM SQL) ===
│   │   ├── user.model.js               # [TV1 commit] Hàm SQL bảng users
│   │   ├── catalog.model.js            # [TV2 commit] Hàm SQL bảng stations, routes, seat_layouts, buses, articles
│   │   ├── trip.model.js               # [TV3 commit] Hàm SQL bảng trips, trip_stops & tìm kiếm/lọc chuyến
│   │   ├── booking.model.js            # [TV4 commit] Hàm SQL giữ ghế 10p, đặt vé, hủy vé, hoàn tiền 100%
│   │   └── report.model.js             # [TV5 commit] Hàm SQL soát vé, thống kê doanh thu & tỷ lệ lấp đầy
│   ├── middlewares/
│   │   └── auth.middleware.js          # [TV1 commit] Kiểm tra đăng nhập & phân quyền (customer, staff, admin)
│   ├── controllers/                    # === KHU VỰC CỦA TV2 & TV3 (XỬ LÝ BACKEND) ===
│   │   ├── auth.controller.js          # [TV1 commit] Đăng ký, Xác thực Email, Đăng nhập, Quên MK, Hồ sơ
│   │   ├── admin-catalog.controller.js # [TV2 commit] CRUD Bến xe, Tuyến, Xe, Sơ đồ ghế, Tin tức, User
│   │   ├── admin-trip.controller.js    # [TV3 commit] Lập lịch chuyến, đổi trạng thái chuyến (draft->active...)
│   │   ├── staff-report.controller.js  # [TV5 commit] Nhân viên soát vé (check-in) & Báo cáo Dashboard
│   │   ├── customer-trip.controller.js # [TV3 commit] Trang chủ, Tìm chuyến, AJAX Autocomplete & Lọc chuyến
│   │   ├── booking.controller.js       # [TV4 commit] Chọn ghế AJAX, Giữ ghế 10p, Đặt vé, Thanh toán, Hủy vé
│   │   └── chatbot.controller.js       # [TV5 commit] API AJAX Trợ lý ảo (Chatbot)
│   └── views/                          # === KHU VỰC CỦA TV4 & TV5 (GIAO DIỆN FRONTEND) ===
│       ├── layouts/                    # [TV3: customer-layout.ejs] | [TV2: admin-layout.ejs]
│       ├── static-tailwind/            # [TV2 commit] Các trang tĩnh dùng TAILWIND CSS (Giới thiệu, FAQ, Chính sách)
│       ├── customer/                   # [TV3 & TV4 commit] Trang chủ, Tìm chuyến, Chọn ghế, Thanh toán, Tra cứu vé
│       ├── auth/ & admin/ & staff/     # [TV1, TV2, TV5 commit] Đăng nhập/Ký, Quản trị Admin, Nhân viên soát vé, Biểu đồ
│       └── emails/                     # [TV5 commit] Mẫu HTML Email xác thực & Email Vé điện tử QR
└── public/js/                          # [TV3: ajax-search.js] [TV4: ajax-seat-booking.js] [TV5: ajax-chatbot.js, admin-charts.js]
```

---

## 3. Quy trình Git & GitHub cho 5 Thành viên

### Danh sách 5 Nhánh tính năng (Feature Branches)
1. `feat/member1-auth` — **Thành viên 1**: Nhóm 1 (Tài khoản, xác thực & bảo mật)
2. `feat/member2-catalog` — **Thành viên 2**: Nhóm 2 (Danh mục vận hành & nội dung)
3. `feat/member3-trips` — **Thành viên 3**: Nhóm 3 (Lịch chạy & tìm kiếm chuyến)
4. `feat/member4-booking` — **Thành viên 4**: Nhóm 4 (Đặt vé, chọn ghế & thanh toán)
5. `feat/member5-tickets-report` — **Thành viên 5**: Nhóm 5 (Vé điện tử, vận hành, báo cáo & trợ lý ảo)

### 5 Bước Lệnh Git Hàng Ngày
```bash
# Bước 1: Chuyển sang nhánh của mình
git checkout feat/member1-auth   # (Đổi theo nhánh của bạn)

# Bước 2: Kéo code mới nhất từ nhánh develop về trước khi code
git pull origin develop

# Bước 3: Kiểm tra và CHỈ git add đúng file thuộc nhóm mình
git status
git add <duong-dan-file-cua-ban>

# Bước 4: Commit đúng chuẩn Conventional Commits & Push
git commit -m "feat(auth): mo ta ngan gon cong viec"
git push -u origin feat/member1-auth

# Bước 5: Tạo Pull Request trên GitHub từ nhánh cá nhân vào nhánh develop
# Lưu ý: Chọn "Create a merge commit" (KHÔNG chọn Squash and merge)
```
