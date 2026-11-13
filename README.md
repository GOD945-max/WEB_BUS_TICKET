# Hệ Thống Đặt Vé Xe Khách Liên Tỉnh (Bus Ticket Booking System)

Đồ án môn **Web Application Development** — Thiết kế & Phân công theo chuẩn yêu cầu đề bài (`umt-fal26-project.pdf`):
- **Quy mô:** Nhóm 5 sinh viên, chia thành **5 nhóm chức năng Full-Stack** có khối lượng tương đương; **mỗi thành viên phụ trách trọn vẹn một nhóm từ Dữ liệu (SQL/Model) $\rightarrow$ Xử lý (Controller/API) $\rightarrow$ Giao diện (Views EJS/Bootstrap/Tailwind/AJAX)**.
- **Backend & SSR:** Node.js, Express.js, EJS kết hợp AJAX (`fetch` API cập nhật một phần trang không tải lại toàn trang).
- **Database:** PostgreSQL 16 (10 bảng chuẩn hóa + Unique Partial Index chống đặt trùng ghế).
- **Frontend:** Tiếng Việt, Responsive trên điện thoại, máy tính bảng và máy tính; ứng dụng chính dùng **Bootstrap 5**, các trang tĩnh dùng **Tailwind CSS**.
- **Triển khai:** Docker & Docker Compose chạy 1 lệnh (`docker compose up -d`), nạp sẵn dữ liệu mẫu (`Seed Data`).

---

## 1. Khởi chạy nhanh bằng Docker Compose (1 lệnh)

```bash
docker compose up -d --build
```
- Website chạy tại: `http://localhost:3000`
- PostgreSQL chạy tại cổng `5432` (Tự động khởi tạo `db/01_init_schema.sql` và `db/02_seed_data.sql`).

### Tài khoản mẫu (Seed Data)
| Vai trò | Email | Mật khẩu |
|---|---|---|
| **Quản trị viên (`admin`)** | `admin@futabus.vn` | `123456` |
| **Nhân viên soát vé (`staff`)** | `staff@futabus.vn` | `123456` |
| **Khách hàng 1 (`customer`)** | `khach1@gmail.com` | `123456` |
| **Khách hàng 2 (`customer`)** | `khach2@gmail.com` | `123456` |

---

## 2. Phân chia 5 Nhóm chức năng Full-Stack (Chuẩn Mục 3 Đề bài)

| Thành viên | Nhóm chức năng | Phạm vi phụ trách (Từ Dữ liệu $\rightarrow$ Xử lý $\rightarrow$ Giao diện) | Nhánh Git |
|---|---|---|---|
| **Thành viên 1** | **Tài khoản, xác thực và bảo mật** | Đăng ký, xác thực email, đăng nhập, quên mật khẩu; hồ sơ, lịch sử đặt vé; phân quyền; quản lý người dùng; bảo mật chung. | `feat/member1-auth` |
| **Thành viên 2** | **Danh mục vận hành và nội dung** | Giao diện quản trị chung; bến xe, điểm đón/trả, tuyến, sơ đồ ghế, xe; tin tức, khuyến mãi, FAQ, chính sách; trang tĩnh. | `feat/member2-catalog` |
| **Thành viên 3** | **Lịch chạy và tìm kiếm chuyến** | Giao diện khách hàng chung; quản lý chuyến, lập lịch, điểm dừng, vòng đời chuyến; trang chủ, tìm chuyến, chi tiết chuyến. | `feat/member3-trips` |
| **Thành viên 4** | **Đặt vé, chọn ghế và thanh toán** | Sơ đồ chọn ghế, giữ ghế; quy trình đặt vé; thanh toán giả lập; tra cứu, hủy vé; dữ liệu dùng chung. | `feat/member4-booking` |
| **Thành viên 5** | **Vé điện tử, vận hành, báo cáo và trợ lý ảo** | Vé điện tử, email vé; quản lý đặt chỗ; soát vé; dashboard, báo cáo; trợ lý ảo; triển khai, kiểm thử tích hợp. | `feat/member5-tickets-report` |

---

## 3. Cấu trúc thư mục & Phân vùng file cho 5 Thành viên

```text
WEB_BUS_TICKET/
├── docker-compose.yml & Dockerfile          # [TV5 - Nhóm 5] Đóng gói chạy Web + PostgreSQL bằng 1 lệnh
├── package.json & .env.example              # [Dùng chung] Khai báo thư viện & biến môi trường mẫu
├── db/
│   ├── 01_init_schema.sql                   # [TV4 - Nhóm 4] Dữ liệu dùng chung: Tạo 10 bảng + Unique Partial Index
│   └── 02_seed_data.sql                     # [TV4 - Nhóm 4] Dữ liệu mẫu: 4 user, 10 bến, 5 tuyến, 6 xe, 12 chuyến
├── src/
│   ├── app.js                               # [TV2 - Nhóm 2] Khởi tạo Express, EJS, Session, Static & Mount Routes
│   ├── config/
│   │   ├── db.js                            # [TV1 - Nhóm 1] Kết nối Pool tới PostgreSQL
│   │   └── mailer.js                        # [TV5 - Nhóm 5] Cấu hình Nodemailer gửi email xác thực & vé điện tử QR
│   ├── middlewares/
│   │   └── auth.middleware.js               # [TV1 - Nhóm 1] Phân quyền (guest/customer/staff/admin) & bảo mật chung
│   ├── models/                              # === TẦNG DỮ LIỆU (MỖI THÀNH VIÊN 1 FILE MODEL) ===
│   │   ├── user.model.js                    # [TV1 - Nhóm 1] SQL bảng users & lịch sử đặt vé của tài khoản
│   │   ├── catalog.model.js                 # [TV2 - Nhóm 2] SQL bảng stations, routes, seat_layouts, buses, articles
│   │   ├── trip.model.js                    # [TV3 - Nhóm 3] SQL bảng trips, trip_stops, vòng đời chuyến & tìm chuyến
│   │   ├── booking.model.js                 # [TV4 - Nhóm 4] SQL giữ ghế 10p, đặt vé, thanh toán, tra cứu & hủy vé
│   │   └── report.model.js                  # [TV5 - Nhóm 5] SQL vé điện tử, quản lý đặt chỗ, soát vé, báo cáo, chatbot
│   ├── controllers/                         # === TẦNG XỬ LÝ (THEO ĐÚNG 5 NHÓM CHỨC NĂNG) ===
│   │   ├── auth.controller.js               # [TV1 - Nhóm 1] Đăng ký, xác thực email, đăng nhập, quên MK, hồ sơ, QL user
│   │   ├── admin-catalog.controller.js      # [TV2 - Nhóm 2] CRUD bến xe, tuyến, sơ đồ ghế, xe, tin tức & trang tĩnh
│   │   ├── admin-trip.controller.js         # [TV3 - Nhóm 3] Quản lý chuyến, lập lịch, điểm dừng, vòng đời chuyến
│   │   ├── customer-trip.controller.js      # [TV3 - Nhóm 3] Trang chủ, tìm chuyến, chi tiết chuyến, AJAX gợi ý & lọc
│   │   ├── booking.controller.js            # [TV4 - Nhóm 4] Sơ đồ ghế AJAX, giữ ghế 10p, đặt vé, thanh toán, tra cứu/hủy
│   │   ├── staff-report.controller.js       # [TV5 - Nhóm 5] Quản lý đặt chỗ, nhân viên soát vé, dashboard & báo cáo
│   │   └── chatbot.controller.js            # [TV5 - Nhóm 5] API AJAX Trợ lý ảo (tìm chuyến, tra cứu vé, hỏi chính sách)
│   └── views/                               # === TẦNG GIAO DIỆN (EJS + BOOTSTRAP 5 + TAILWIND CSS) ===
│       ├── layouts/                         # [TV2: admin-layout.ejs] | [TV3: customer-header.ejs, customer-footer.ejs]
│       ├── auth/                            # [TV1 - Nhóm 1] login, register, forgot-password, profile, booking-history
│       ├── static-tailwind/                 # [TV2 - Nhóm 2] Trang tĩnh TAILWIND CSS (about.ejs, policy.ejs, faq.ejs)
│       ├── customer/                        # [TV2: articles] [TV3: home, search-results, trip-detail]
│       │                                    # [TV4: trip-detail-booking, payment, lookup-ticket]
│       ├── admin/                           # [TV1: users] [TV2: catalog/*] [TV3: trips/schedule] [TV5: bookings, dashboard]
│       ├── staff/                           # [TV5 - Nhóm 5] checkin.ejs (Nhân viên soát vé tại bến)
│       └── emails/                          # [TV1: verify-email.ejs] | [TV5: e-ticket.ejs]
└── public/js/                               # [TV3: ajax-search.js] [TV4: ajax-seat-booking.js]
                                             # [TV5: ajax-chatbot.js, admin-charts.js]
```
