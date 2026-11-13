# SỔ TAY PHÂN CÔNG CÔNG VIỆC CHI TIẾT TỪNG THÀNH VIÊN (CẦN LÀM & BẮT BUỘC PHẢI LÀM)
## ĐỀ TÀI: HỆ THỐNG ĐẶT VÉ XE KHÁCH LIÊN TỈNH (BUS TICKET BOOKING SYSTEM)
**Chuẩn đối chiếu:** Đề bài chính thức `umt-fal26-project.pdf` — Mô hình **5 Nhóm chức năng Full-Stack** (Mỗi thành viên phụ trách trọn vẹn 1 nhóm từ **Dữ liệu $\rightarrow$ Xử lý $\rightarrow$ Giao diện**).

---

## QUY ĐỊNH CHUNG BẮT BUỘC CHO CẢ 5 THÀNH VIÊN
1. **Phụ trách trọn vẹn Full-Stack:** Mỗi thành viên tự viết từ câu lệnh SQL trong `src/models/`, logic xử lý trong `src/controllers/` đến giao diện `.ejs` trong `src/views/` thuộc nhóm chức năng của mình.
2. **Không sửa nhầm file của thành viên khác:** Chỉ `git add` đúng danh sách file được giao trong mục của mình để tránh xung đột code (*Merge Conflict*) khi gộp vào nhánh `develop`.
3. **Ngôn ngữ & Giao diện:** 100% giao diện hiển thị bằng **tiếng Việt**, tự động co giãn **Responsive** trên điện thoại, máy tính bảng và máy tính.
4. **Đảm bảo chạy được trên Docker Compose:** Mọi chức năng sau khi code xong phải chạy mượt khi khởi động bằng `docker compose up -d`.

---

# PHẦN 1: THÀNH VIÊN 1 — NHÓM 1: TÀI KHOẢN, XÁC THỰC VÀ BẢO MẬT

* **Phạm vi đề bài giao:** *"Đăng ký, xác thực email, đăng nhập, quên mật khẩu; hồ sơ, lịch sử đặt vé; phân quyền; quản lý người dùng; bảo mật chung."*
* **Nhánh Git làm việc:** `feat/member1-auth`

### 1. Danh sách File Bắt buộc Phụ trách (11 files)
1. `src/config/db.js` — Cấu hình kết nối Pool PostgreSQL.
2. `src/middlewares/auth.middleware.js` — Middleware kiểm tra đăng nhập, phân quyền 4 vai trò & bảo mật chung.
3. `src/models/user.model.js` — Toàn bộ hàm truy vấn SQL bảng `users` và lịch sử đặt vé của khách hàng.
4. `src/controllers/auth.controller.js` — Controller xử lý xác thực, hồ sơ, lịch sử vé và quản lý người dùng.
5. `src/views/auth/register.ejs` — Trang đăng ký tài khoản.
6. `src/views/auth/login.ejs` — Trang đăng nhập.
7. `src/views/auth/forgot-password.ejs` — Trang quên mật khẩu & đặt lại mật khẩu.
8. `src/views/auth/profile.ejs` — Trang thông tin hồ sơ cá nhân & đổi mật khẩu.
9. `src/views/auth/booking-history.ejs` — Trang lịch sử đặt vé của khách hàng đã đăng nhập.
10. `src/views/admin/users.ejs` — Trang Admin quản lý danh sách người dùng (khóa/mở khóa, đổi quyền).
11. `src/views/emails/verify-email.ejs` — Mẫu HTML email xác thực tài khoản & khôi phục mật khẩu.

### 2. Công việc Phải Làm ở Tầng Dữ liệu (`src/models/user.model.js`)
* **`findByEmail(email)`**: Tìm người dùng theo email (dùng khi đăng nhập, đăng ký kiểm tra trùng email, quên mật khẩu).
* **`findById(id)`**: Lấy thông tin chi tiết người dùng theo `id` (không trả về `password_hash`).
* **`create({ fullName, email, phone, passwordHash, verifyToken })`**: Thêm bản ghi mới vào bảng `users` với `role = 'customer'`, `is_verified = FALSE`, lưu `verify_token`.
* **`verifyEmailByToken(token)`**: Tìm user có `verify_token = token`, cập nhật `is_verified = TRUE` và xóa `verify_token = NULL`.
* **`saveResetToken(email, resetToken)`** & **`resetPasswordByToken(token, newPasswordHash)`**: Lưu mã khôi phục mật khẩu và cập nhật `password_hash` mới khi khách đặt lại mật khẩu.
* **`updateProfile(userId, { fullName, phone })`** & **`updatePassword(userId, newPasswordHash)`**: Cập nhật họ tên, số điện thoại và mật khẩu của khách hàng.
* **`getBookingHistoryByUserId(userId)`**: Truy vấn `JOIN` giữa `bookings`, `trips`, `routes`, `buses`, `tickets` để lấy danh sách tất cả các đơn đặt vé của `user_id` đó (sắp xếp mới nhất lên đầu, kèm danh sách mã ghế và trạng thái đơn).
* **`listAll({ keyword, role, status })`** & **`toggleActiveStatus(userId, isActive)`** & **`updateUserRole(userId, role)`**: Phục vụ Admin tìm kiếm, lọc người dùng, khóa/mở khóa tài khoản (`is_active`) và phân quyền (`customer`, `staff`, `admin`).

### 3. Công việc Phải Làm ở Tầng Xử lý Backend (`auth.middleware.js` & `auth.controller.js`)
* **Trong `src/middlewares/auth.middleware.js`:**
  * Viết `requireAuth`: Nếu chưa đăng nhập (`!req.session.user`) thì chuyển hướng về `/auth/login`.
  * Viết `requireRole(...roles)`: Kiểm tra `req.session.user.role` có nằm trong danh sách quyền cho phép không (`customer`, `staff`, `admin`). Nếu không đủ quyền, trả về trang báo lỗi `403 - Không có quyền truy cập`.
  * Viết `checkAccountActive`: Nếu tài khoản đang đăng nhập bị Admin khóa (`is_active === false`), lập tức hủy session và đẩy ra trang đăng nhập kèm thông báo.
  * Bảo mật chung: Đảm bảo mật khẩu băm bằng `bcryptjs` (salt rounds = 10), dùng Parameterized Queries (`$1, $2`) chống SQL Injection, chuẩn hóa dữ liệu đầu vào (`trim()`, kiểm tra định dạng email và số điện thoại 10 số).
* **Trong `src/controllers/auth.controller.js`:**
  * `GET /auth/register` & `POST /auth/register`: Kiểm tra mật khẩu nhập lại, kiểm tra trùng email, hash mật khẩu, sinh `verify_token` ngẫu nhiên, lưu DB và gọi `mailer.sendMail` gửi link xác thực `/auth/verify?token=...`.
  * `GET /auth/verify`: Kiểm tra `token`, kích hoạt `is_verified = true`, thông báo đăng nhập.
  * `GET /auth/login` & `POST /auth/login`: Kiểm tra email & mật khẩu; kiểm tra `is_verified === true` và `is_active === true`; lưu thông tin vào `req.session.user` và điều hướng theo vai trò (`admin` $\rightarrow$ `/admin/dashboard`, `staff` $\rightarrow$ `/staff/checkin`, `customer` $\rightarrow$ `/`).
  * `POST /auth/logout` (hoặc `GET /auth/logout`): Xóa session và quay về trang chủ.
  * `GET /auth/forgot-password`, `POST /auth/forgot-password`, `POST /auth/reset-password`: Gửi link đặt lại mật khẩu qua email và cập nhật mật khẩu mới.
  * `GET /auth/profile` & `POST /auth/profile`: Hiển thị và cập nhật thông tin cá nhân, đổi mật khẩu.
  * `GET /auth/booking-history`: Hiển thị danh sách đơn đặt chỗ của khách hàng, cho phép bấm nút **Hủy vé** nếu đơn ở trạng thái `pending` hoặc (`paid` và trước giờ khởi hành $\ge 24\text{h}$).
  * `GET /admin/users`, `POST /admin/users/:id/toggle-active`, `POST /admin/users/:id/role`: Quản lý người dùng dành cho Admin.

### 4. Công việc Phải Làm ở Tầng Giao diện (`src/views/auth/*` & `src/views/admin/users.ejs`)
* Thiết kế bằng **Bootstrap 5** đồng bộ, có thông báo lỗi/thành công rõ ràng (Alert):
  * Form Đăng ký / Đăng nhập / Quên mật khẩu có kiểm tra hợp lệ HTML5 (`required`, `type="email"`, `pattern` số điện thoại).
  * Trang `booking-history.ejs`: Hiển thị bảng/thẻ các chuyến đã đặt kèm **Badge màu trạng thái** (`pending` vàng, `paid` xanh lá, `checked_in` xanh dương, `cancelled` đỏ, `expired` xám) và nút xem chi tiết / hủy vé.
  * Trang `admin/users.ejs`: Bảng danh sách người dùng có thanh tìm kiếm theo tên/email, lọc theo vai trò, nút Khóa/Mở khóa tài khoản và chọn đổi quyền.

### 5. Checklist Nghiệm thu Bắt buộc (TV1 phải tự test Pass 100%)
- [ ] Đăng ký tài khoản mới $\rightarrow$ tài khoản ở trạng thái chưa xác thực (`is_verified = false`) chưa đăng nhập được $\rightarrow$ bấm link xác thực email $\rightarrow$ đăng nhập thành công.
- [ ] Đăng nhập đúng 3 tài khoản mẫu (`admin`, `staff`, `customer`) tự động chuyển hướng về đúng trang của từng vai trò.
- [ ] Khách vãng lai hoặc `customer` cố tình gõ URL `/admin/users` hoặc `/staff/checkin` bị chặn bởi `auth.middleware.js`.
- [ ] Admin bấm "Khóa tài khoản" một user $\rightarrow$ user đó không thể đăng nhập được nữa.

---

# PHẦN 2: THÀNH VIÊN 2 — NHÓM 2: DANH MỤC VẬN HÀNH VÀ NỘI DUNG

* **Phạm vi đề bài giao:** *"Giao diện quản trị chung; bến xe, điểm đón/trả, tuyến, sơ đồ ghế, xe; tin tức, khuyến mãi, FAQ, chính sách; trang tĩnh."*
* **Nhánh Git làm việc:** `feat/member2-catalog`

### 1. Danh sách File Bắt buộc Phụ trách (13 files)
1. `src/app.js` — Khởi tạo Express, cấu hình EJS, Session, Static và gắn kết toàn bộ Routes của 5 nhóm.
2. `src/models/catalog.model.js` — Toàn bộ hàm SQL cho 5 bảng: `stations`, `routes`, `seat_layouts`, `buses`, `articles`.
3. `src/controllers/admin-catalog.controller.js` — Controller CRUD danh mục vận hành, quản lý bài viết và hiển thị trang tĩnh/tin tức.
4. `src/views/layouts/admin-layout.ejs` — Khung giao diện Quản trị chung (Sidebar, Header Admin/Staff bằng Bootstrap 5).
5. `src/views/admin/catalog/stations.ejs` — Quản lý Bến xe & Điểm đón/trả.
6. `src/views/admin/catalog/routes.ejs` — Quản lý Tuyến xe liên tỉnh.
7. `src/views/admin/catalog/seat-layouts.ejs` — Quản lý Sơ đồ ghế mẫu (1 tầng / 2 tầng).
8. `src/views/admin/catalog/buses.ejs` — Quản lý Đội xe & trạng thái bảo trì.
9. `src/views/admin/catalog/articles.ejs` — Quản lý Tin tức, Khuyến mãi, Chính sách, FAQ.
10. `src/views/customer/articles.ejs` — Trang khách hàng đọc Tin tức & Khuyến mãi (Bootstrap 5).
11. `src/views/static-tailwind/about.ejs` — Trang tĩnh Giới thiệu nhà xe (**Bắt buộc dùng Tailwind CSS**).
12. `src/views/static-tailwind/policy.ejs` — Trang tĩnh Chính sách hoàn/hủy vé (**Bắt buộc dùng Tailwind CSS**).
13. `src/views/static-tailwind/faq.ejs` — Trang tĩnh Câu hỏi thường gặp - FAQ (**Bắt buộc dùng Tailwind CSS**).

### 2. Công việc Phải Làm ở Tầng Dữ liệu (`src/models/catalog.model.js`)
* **Bảng `stations` (Bến xe & Điểm đón/trả):**
  * `getStations()`, `createStation({ name, province, address, isMainStation })`, `updateStation(id, ...)`, `toggleStationActive(id)`.
* **Bảng `routes` (Tuyến xe):**
  * `getRoutes()`, `createRoute({ name, originProvince, destinationProvince, distanceKm, durationHours, basePrice, description })`, `updateRoute(id, ...)`, `toggleRouteActive(id)`.
* **Bảng `seat_layouts` (Sơ đồ ghế mẫu):**
  * `getSeatLayouts()`, `createSeatLayout({ name, totalSeats, totalFloors, rowsPerFloor, colsPerFloor, seatMapJson })`, `updateSeatLayout(id, ...)`, `deleteSeatLayout(id)` (chỉ xóa được khi chưa có xe nào dùng).
* **Bảng `buses` (Đội xe):**
  * `getBuses()` (JOIN với `seat_layouts` để lấy tên sơ đồ và tổng số ghế), `createBus({ licensePlate, seatLayoutId, busType, amenities, status })`, `updateBus(id, ...)`, `changeBusStatus(id, status)` (`'active'` | `'maintenance'`).
* **Bảng `articles` (Tin tức, Khuyến mãi, Chính sách, FAQ):**
  * `getArticles({ category, onlyPublished })`, `getArticleBySlug(slug)`, `createArticle({ title, slug, category, summary, content, thumbnailUrl, isPublished })`, `updateArticle(id, ...)`, `deleteArticle(id)`.

### 3. Công việc Phải Làm ở Tầng Xử lý Backend (`admin-catalog.controller.js`)
* Viết đầy đủ các hàm xử lý `GET` (hiển thị danh sách) và `POST` (thêm mới / cập nhật / bật-tắt trạng thái / xóa) cho 5 danh mục:
  * `/admin/stations` (Bến xe & điểm đón/trả)
  * `/admin/routes` (Tuyến đường)
  * `/admin/seat-layouts` (Sơ đồ ghế mẫu — tự động sinh mảng mã ghế JSONB `floor1: ['A01',...], floor2: ['B01',...]` hoặc nhận từ giao diện cấu hình)
  * `/admin/buses` (Đội xe — kiểm tra biển số `license_plate` không trùng)
  * `/admin/articles` (Tin tức, khuyến mãi, chính sách, FAQ — tự động tạo `slug` tiếng Việt không dấu từ `title`)
* Viết các hàm hiển thị phía khách hàng:
  * `GET /tin-tuc` & `GET /tin-tuc/:slug`: Hiển thị danh sách và chi tiết bài viết chuyên mục `news` và `promotion`.
  * `GET /gioi-thieu`, `GET /chinh-sach`, `GET /faq`: Lấy dữ liệu bài viết chuyên mục `policy` và `faq` từ DB đổ ra 3 trang tĩnh dùng **Tailwind CSS**.

### 4. Công việc Phải Làm ở Tầng Giao diện
* **Khung Quản trị chung (`src/views/layouts/admin-layout.ejs` - Bootstrap 5):**
  * Thiết kế Sidebar bên trái gồm đầy đủ menu dẫn tới: Dashboard (`/admin/dashboard`), Bến xe (`/admin/stations`), Tuyến xe (`/admin/routes`), Sơ đồ ghế (`/admin/seat-layouts`), Đội xe (`/admin/buses`), Chuyến xe (`/admin/trips`), Đặt chỗ (`/admin/bookings`), Bài viết (`/admin/articles`), Người dùng (`/admin/users`), và Soát vé (`/staff/checkin`).
* **5 Màn hình Admin CRUD (`src/views/admin/catalog/*.ejs` - Bootstrap 5):**
  * Có bảng danh sách rõ ràng + Modal hoặc Form Thêm mới / Chỉnh sửa ngay trên trang.
  * Riêng `seat-layouts.ejs`: Có phần xem trước (Preview) sơ đồ ghế tầng 1 / tầng 2 trực quan.
* **3 Trang tĩnh (`src/views/static-tailwind/*.ejs` - Bắt buộc dùng Tailwind CSS):**
  * Thiết kế hiện đại bằng các class của Tailwind CSS (`max-w-5xl`, `grid`, `rounded-2xl`, `shadow-md`, Accordion câu hỏi thường gặp ở `faq.ejs`, bảng quy định hoàn/hủy vé ở `policy.ejs`).

### 5. Checklist Nghiệm thu Bắt buộc (TV2 phải tự test Pass 100%)
- [ ] Admin thêm mới được Bến xe $\rightarrow$ Tạo Tuyến mới $\rightarrow$ Tạo Sơ đồ ghế mẫu $\rightarrow$ Thêm Xe khách mới gắn với sơ đồ ghế đó.
- [ ] Admin đăng bài viết Tin tức / Chính sách / FAQ $\rightarrow$ Khách hàng vào `/tin-tuc`, `/chinh-sach`, `/faq` nhìn thấy ngay nội dung vừa cập nhật.
- [ ] Ba trang `/gioi-thieu`, `/chinh-sach`, `/faq` sử dụng đúng **Tailwind CSS**, hiển thị đẹp trên cả điện thoại và máy tính.

---

# PHẦN 3: THÀNH VIÊN 3 — NHÓM 3: LỊCH CHẠY VÀ TÌM KIẾM CHUYẾN

* **Phạm vi đề bài giao:** *"Giao diện khách hàng chung; quản lý chuyến, lập lịch, điểm dừng, vòng đời chuyến; trang chủ, tìm chuyến, chi tiết chuyến."*
* **Nhánh Git làm việc:** `feat/member3-trips`

### 1. Danh sách File Bắt buộc Phụ trách (9 files)
1. `src/models/trip.model.js` — Toàn bộ hàm SQL cho bảng `trips`, `trip_stops`, chuyển trạng thái vòng đời chuyến và tìm kiếm/lọc chuyến.
2. `src/controllers/admin-trip.controller.js` — Controller Admin quản lý chuyến, lập lịch, điểm dừng và điều khiển vòng đời chuyến.
3. `src/controllers/customer-trip.controller.js` — Controller Khách hàng: Trang chủ, Tìm chuyến, Chi tiết chuyến & 2 API AJAX (`suggest` & `filter`).
4. `src/views/layouts/customer-header.ejs` — Header & Thanh điều hướng giao diện khách hàng chung (Bootstrap 5).
5. `src/views/layouts/customer-footer.ejs` — Footer giao diện khách hàng chung & nhúng bong bóng Chatbot (Bootstrap 5).
6. `src/views/admin/trips/schedule.ejs` — Màn hình Admin lập lịch chuyến, cấu hình điểm dừng & đổi trạng thái chuyến.
7. `src/views/customer/home.ejs` — Trang chủ (Thanh tìm kiếm có Autocomplete, Tuyến phổ biến, Ưu đãi nổi bật).
8. `src/views/customer/search-results.ejs` — Trang kết quả tìm kiếm chuyến xe (kèm bộ lọc & sắp xếp AJAX không tải lại trang).
9. `src/views/customer/trip-detail.ejs` — Trang xem chi tiết chuyến xe (thông tin xe, tiện ích, timeline điểm đón/điểm trả, nút chuyển sang chọn ghế).
10. `public/js/ajax-search.js` — File JS gọi Fetch API cho Autocomplete điểm đi/đến và lọc/sắp xếp chuyến xe.

### 2. Công việc Phải Làm ở Tầng Dữ liệu (`src/models/trip.model.js`)
* **Nhóm hàm Quản lý & Vòng đời chuyến cho Admin:**
  * `getAllTripsForAdmin()`: Lấy danh sách chuyến kèm tên tuyến, biển số xe, loại xe, tổng số ghế, số ghế đã đặt, số lượng điểm đón/điểm trả.
  * `createTripDraft({ routeId, busId, departureTime, arrivalTime, ticketPrice })`: Tạo chuyến mới với trạng thái mặc định `status = 'draft'`.
  * `addTripStop({ tripId, stationId, stopType, stopTime, stopOrder })` & `getTripStops(tripId)` & `deleteTripStop(stopId)`: Cấu hình danh sách điểm đón (`pickup`) và điểm trả (`dropoff`) cho từng chuyến.
  * `updateTripStatus(tripId, newStatus)` — **Bắt buộc tuân thủ đúng Sơ đồ Hình 1 của đề bài:**
    * Chuyển `draft` $\rightarrow$ `active`: Phải kiểm tra chuyến đã được gán xe (`bus_id IS NOT NULL` và xe đang `active`) **VÀ** đã có ít nhất 1 điểm đón (`pickup`) + 1 điểm trả (`dropoff`) trong bảng `trip_stops` (`bus + stops ready`).
    * Chuyển `active` $\rightarrow$ `departed` (Khi xe xuất bến) $\rightarrow$ `completed` (Khi xe hoàn thành chuyến).
    * Chuyển `draft` hoặc `active` $\rightarrow$ `cancelled` (**Hủy chuyến hoàn tiền 100%**): Chạy trong `BEGIN ... COMMIT` Transaction: đổi `trips.status = 'cancelled'`, đồng thời cập nhật toàn bộ đơn đặt chỗ (`bookings`) của chuyến đó sang `status = 'cancelled'`, `refund_amount = total_amount`, và toàn bộ `tickets` của chuyến đó sang `status = 'cancelled'`.
* **Nhóm hàm Tìm kiếm & Chi tiết chuyến cho Khách hàng:**
  * `suggestProvinces(keyword)`: Truy vấn danh sách tỉnh/thành và tên bến xe khớp từ khóa cho ô Autocomplete.
  * `searchTrips({ origin, dest, date, timeSlot, busType, minPrice, maxPrice, sort })`:
    * **Chỉ lấy các chuyến có `status = 'active'`**.
    * Tính chính xác số ghế trống còn lại: `available_seats = sl.total_seats - COUNT(tickets đang ở trạng thái held, paid, checked_in)`.
    * Hỗ trợ lọc theo khung giờ khởi hành (`00:00-06:00`, `06:00-12:00`, `12:00-18:00`, `18:00-24:00`), loại xe (`bus_type`), khoảng giá, và sắp xếp (`price_asc`, `price_desc`, `time_asc`, `time_desc`).
  * `getTripDetailById(tripId)`: Lấy thông tin chi tiết chuyến xe, thông tin tuyến, tiện ích xe (`amenities`) và danh sách toàn bộ điểm đón/trả (`trip_stops` JOIN `stations`) sắp xếp theo `stop_order`.

### 3. Công việc Phải Làm ở Tầng Xử lý Backend (`admin-trip.controller.js` & `customer-trip.controller.js`)
* **Trong `admin-trip.controller.js`:**
  * `GET /admin/trips`: Render màn hình quản lý lịch chạy, truyền danh sách tuyến, xe đang hoạt động, bến xe và danh sách chuyến.
  * `POST /admin/trips`: Tạo chuyến mới (`draft`).
  * `POST /admin/trips/:id/stops`: Thêm/xóa điểm dừng đón trả cho chuyến.
  * `POST /admin/trips/:id/status`: Đổi trạng thái vòng đời chuyến (`active`, `departed`, `completed`, `cancelled`). Nếu thiếu xe hoặc thiếu điểm dừng khi bấm Mở bán (`active`), trả về thông báo lỗi rõ ràng.
* **Trong `customer-trip.controller.js`:**
  * `GET /`: Render Trang chủ `customer/home.ejs` với danh sách tuyến xe nổi bật và các chuyến xe sắp khởi hành.
  * `GET /tim-chuyen`: Render Trang kết quả tìm kiếm `customer/search-results.ejs`.
  * `GET /chuyen-xe/:id`: Render Trang chi tiết chuyến xe `customer/trip-detail.ejs`.
  * `GET /api/provinces/suggest?keyword=...`: Trả về JSON `{ success: true, data: [...] }` cho ô Autocomplete.
  * `GET /api/trips/filter?...`: Trả về JSON `{ success: true, trips: [...] }` khi khách bấm lọc/sắp xếp mà không tải lại trang.

### 4. Công việc Phải Làm ở Tầng Giao diện & AJAX (`public/js/ajax-search.js`)
* **Header & Footer chung (`customer-header.ejs`, `customer-footer.ejs`):**
  * Hiển thị menu điều hướng Responsive; nếu khách đã đăng nhập (`currentUser`) thì hiện tên khách, link "Hồ sơ", "Lịch sử đặt vé", nút "Đăng xuất" (và link "Quản trị" nếu là `admin`/`staff`).
* **Màn hình Admin (`admin/trips/schedule.ejs`):**
  * Hiển thị danh sách chuyến kèm **Badge màu theo vòng đời**: `draft` (xám), `active` (xanh lá - Đang mở bán), `departed` (xanh dương - Đang chạy), `completed` (tím/đen - Đã hoàn thành), `cancelled` (đỏ - Đã hủy).
  * Có Modal cấu hình điểm đón/trả và các nút bấm chuyển trạng thái hợp lệ theo đúng sơ đồ vòng đời.
* **Script `public/js/ajax-search.js`:**
  * Lắng nghe sự kiện `input` (có debounce 250ms) trên 2 ô Điểm đi & Điểm đến $\rightarrow$ gọi `fetch('/api/provinces/suggest?keyword=...')` $\rightarrow$ hiển thị danh sách gợi ý xổ xuống để người dùng click chọn.
  * Lắng nghe sự kiện thay đổi trên các bộ lọc (Khung giờ, Loại xe, Giá vé, Sắp xếp) ở trang `/tim-chuyen` $\rightarrow$ gọi `fetch('/api/trips/filter?...')` $\rightarrow$ render lại danh sách thẻ chuyến xe trên DOM mà không F5 trang.

### 5. Checklist Nghiệm thu Bắt buộc (TV3 phải tự test Pass 100%)
- [ ] Tạo chuyến mới ở trạng thái `draft` $\rightarrow$ chưa hiện ra ngoài trang tìm kiếm của khách.
- [ ] Khi chưa thêm điểm dừng mà bấm "Mở bán (`active`)" $\rightarrow$ hệ thống chặn lại và nhắc phải thêm đủ điểm đón/trả. Sau khi gán xe + thêm điểm đón/trả $\rightarrow$ bấm "Mở bán" chuyển sang `active` và hiện ngay ngoài trang khách hàng.
- [ ] Gõ chữ "Đà" hoặc "Hồ" vào ô Điểm đi/Điểm đến hiện ngay danh sách gợi ý bằng AJAX; tích chọn lọc theo khung giờ/loại xe/sắp xếp giá cập nhật danh sách chuyến tức thì không cần tải lại trang.

---

# PHẦN 4: THÀNH VIÊN 4 — NHÓM 4: ĐẶT VÉ, CHỌN GHẾ VÀ THANH TOÁN

* **Phạm vi đề bài giao:** *"Sơ đồ chọn ghế, giữ ghế; quy trình đặt vé; thanh toán giả lập; tra cứu, hủy vé; dữ liệu dùng chung."*
* **Nhánh Git làm việc:** `feat/member4-booking`

### 1. Danh sách File Bắt buộc Phụ trách (8 files)
1. `db/01_init_schema.sql` — Khởi tạo 10 bảng CSDL PostgreSQL + Ràng buộc khóa ngoại + Unique Partial Index chống đặt trùng ghế.
2. `db/02_seed_data.sql` — Dữ liệu mẫu dùng chung (4 tài khoản, 10 bến xe, 5 tuyến, 2 sơ đồ ghế, 6 xe, 12 chuyến `active`, các điểm dừng và bài viết mẫu).
3. `src/models/booking.model.js` — Toàn bộ hàm SQL xử lý giữ ghế 10 phút, đặt vé, thanh toán, nhả ghế quá hạn, tra cứu và hủy vé.
4. `src/controllers/booking.controller.js` — Controller xử lý API sơ đồ ghế AJAX, giữ ghế 10p, đặt vé (`customer` & `guest checkout`), cổng thanh toán giả lập, tra cứu & hủy vé.
5. `src/views/customer/trip-detail-booking.ejs` — Trang chọn ghế trực quan 2 tầng, chọn điểm đón/trả và nhập thông tin hành khách.
6. `src/views/customer/payment.ejs` — Trang cổng thanh toán giả lập kèm đồng hồ đếm ngược 10 phút giữ ghế.
7. `src/views/customer/lookup-ticket.ejs` — Trang tra cứu đơn đặt chỗ bằng mã đặt chỗ (`booking_code`) và hủy vé trực tuyến.
8. `public/js/ajax-seat-booking.js` — Script AJAX cập nhật trạng thái ghế liên tục trên sơ đồ, chọn ghế, gửi yêu cầu giữ ghế 10 phút và đếm ngược thời gian.

### 2. Công việc Phải Làm ở Tầng Dữ liệu (`db/*.sql` & `src/models/booking.model.js`)
* **Đảm bảo dữ liệu dùng chung (`db/01_init_schema.sql` & `db/02_seed_data.sql`):**
  * Duy trì `idx_unique_active_seat_per_trip` trên bảng `tickets(trip_id, seat_code) WHERE status IN ('held', 'paid', 'checked_in')` để PostgreSQL chặn tuyệt đối việc 2 người đặt trùng 1 ghế ở mức Database.
* **Trong `src/models/booking.model.js`:**
  * **`getTripSeatMapAndStatus(tripId)`**: Lấy sơ đồ ghế (`seat_map_json`, số tầng, số cột) của chuyến xe và danh sách các ghế đang bị chiếm (`status IN ('held', 'paid', 'checked_in')` kèm `hold_expires_at`).
  * **`createSeatHoldTransaction({ tripId, userId, pickupStopId, dropoffStopId, passengerName, passengerPhone, passengerEmail, seatCodes })`** — **Trái tim của Nhóm 4:**
    * Mở Transaction `BEGIN` trên `db.pool.connect()`.
    * Kiểm tra chuyến xe có đang ở trạng thái `active` không (`SELECT * FROM trips WHERE id = $1 FOR UPDATE`).
    * Kiểm tra các ghế trong `seatCodes` đã có ai đang giữ (`held` chưa hết hạn) hoặc đã mua (`paid`, `checked_in`) chưa. Nếu có ghế bị trùng $\rightarrow$ `ROLLBACK` và báo lỗi ghế vừa có người chọn.
    * Sinh mã đặt chỗ duy nhất `booking_code` (VD: `FUTA` + 6 chữ số ngẫu nhiên).
    * Thêm bản ghi vào `bookings` với `status = 'pending'`, `user_id` (bằng `NULL` nếu là khách vãng lai *guest checkout*), `hold_expires_at = NOW() + INTERVAL '10 minutes'`, `total_amount = seatCodes.length * ticket_price`.
    * Thêm từng ghế vào bảng `tickets` với `status = 'held'` và mã vé `ticket_code` riêng cho từng ghế.
    * `COMMIT` và trả về thông tin đơn đặt chỗ.
  * **`releaseExpiredHolds()`**: Tự động tìm các đơn `status = 'pending' AND hold_expires_at < NOW()` chuyển sang `status = 'expired'` và chuyển toàn bộ `tickets` của đơn đó sang `status = 'expired'` (được gọi tự động mỗi 30 giây trong `app.js` và trước mỗi lần lấy sơ đồ ghế).
  * **`confirmPayment(bookingCode)`**: Kiểm tra đơn đang ở trạng thái `pending` và chưa quá hạn 10 phút $\rightarrow$ cập nhật `bookings.status = 'paid'` và `tickets.status = 'paid'`.
  * **`cancelBooking(bookingCode, reason)`**:
    * Nếu đơn đang ở trạng thái `pending` (*user cancels*): Chuyển ngay `bookings.status = 'cancelled'` và `tickets.status = 'cancelled'` để nhả ghế.
    * Nếu đơn đang ở trạng thái `paid`: Kiểm tra thời gian hiện tại cách giờ khởi hành (`trips.departure_time`) có **$\ge 24\text{ giờ}$** không (`cancel >= 24h`). Nếu đủ điều kiện $\ge 24\text{h}$, chuyển `bookings.status = 'cancelled'`, `tickets.status = 'cancelled'`, ghi nhận `refund_amount = total_amount`. Nếu còn $< 24\text{h}$, từ chối hủy và báo rõ quy định chính sách.
  * **`findBookingByCodeAndPhone(bookingCode, passengerPhone)`**: Phục vụ trang Tra cứu vé (lấy đầy đủ thông tin đơn, chuyến, điểm đón/trả, danh sách ghế và trạng thái từng vé).

### 3. Công việc Phải Làm ở Tầng Xử lý Backend (`src/controllers/booking.controller.js`)
* `GET /dat-ve/:id`: Render trang chọn ghế `trip-detail-booking.ejs` (nếu khách đã đăng nhập thì tự động điền sẵn họ tên, SĐT, email vào form).
* `GET /api/trips/:id/seats`: Trước khi trả kết quả, gọi `releaseExpiredHolds()` để dọn các ghế quá hạn, sau đó trả JSON `{ success: true, layout, occupiedSeats }` để Frontend cập nhật màu ghế liên tục.
* `POST /api/bookings/hold`: Nhận danh sách ghế khách chọn + điểm đón/trả + thông tin hành khách $\rightarrow$ gọi `createSeatHoldTransaction` $\rightarrow$ trả về JSON `{ success: true, bookingCode, holdExpiresAt, redirectUrl: '/thanh-toan/' + bookingCode }`.
* `GET /thanh-toan/:bookingCode`: Hiển thị trang cổng thanh toán giả lập kèm số giây còn lại của 10 phút giữ ghế.
* `POST /thanh-toan/:bookingCode/confirm`: Xử lý khi khách bấm "Xác nhận Thanh toán thành công" $\rightarrow$ đổi sang `paid` $\rightarrow$ gọi dịch vụ gửi Email vé điện tử QR (phối hợp với hàm gửi vé của TV5) $\rightarrow$ chuyển tới trang thông báo đặt vé thành công kèm mã đặt chỗ.
* `POST /thanh-toan/:bookingCode/cancel`: Khi khách bấm "Hủy đơn giữ chỗ" ngay tại trang thanh toán (`pending` $\rightarrow$ `cancelled`).
* `GET /tra-cuu-ve` & `POST /tra-cuu-ve` & `POST /tra-cuu-ve/cancel`: Tra cứu vé bằng `booking_code` (không cần đăng nhập) và bấm hủy vé theo chính sách $\ge 24\text{h}$.

### 4. Công việc Phải Làm ở Tầng Giao diện & AJAX (`public/js/ajax-seat-booking.js`)
* **Sơ đồ chọn ghế trực quan (`trip-detail-booking.ejs` + `ajax-seat-booking.js`):**
  * Vẽ sơ đồ ghế 2 tầng (Tầng dưới / Tầng trên) với 4 màu sắc chú thích rõ ràng:
    * **Ghế trống (Trắng / Viền xanh):** Click chọn được.
    * **Ghế bạn đang chọn (Cam / Xanh đậm):** Tự động cộng tổng tiền và liệt kê mã ghế ở khung bên phải.
    * **Ghế đang có người giữ 10p - `held` (Vàng):** Không click được.
    * **Ghế đã bán - `paid` / `checked_in` (Xám / Đỏ):** Không click được.
  * Cứ mỗi **3 – 5 giây**, `ajax-seat-booking.js` tự động gọi `fetch('/api/trips/:id/seats')` để cập nhật trạng thái ghế trên màn hình theo thời gian thực mà không tải lại trang.
* **Cổng thanh toán giả lập (`payment.ejs`):**
  * Hiển thị đồng hồ đếm ngược từ `10:00` về `00:00` dựa trên `hold_expires_at`. Nếu hết giờ, tự động khóa nút thanh toán và báo đơn đã hết hạn giữ ghế (`expired`).
  * Cho phép chọn phương thức giả lập (QR Chuyển khoản ngân hàng / Ví MoMo / VNPay) và có 2 nút rõ ràng: **"Thanh toán thành công (Giả lập)"** và **"Hủy giữ chỗ"**.

### 5. Checklist Nghiệm thu Bắt buộc (TV4 phải tự test Pass 100%)
- [ ] Mở 2 cửa sổ trình duyệt (1 cửa sổ thường, 1 cửa sổ ẩn danh) vào cùng 1 chuyến xe: Cửa sổ 1 chọn ghế `A01` và bấm Tiếp tục giữ ghế $\rightarrow$ Trong vòng 3-5 giây, ghế `A01` bên Cửa sổ 2 tự động đổi sang màu vàng (`Đang được giữ`) mà không cần F5.
- [ ] Cố tình chờ hết hạn giữ ghế (hoặc chỉnh giờ test) $\rightarrow$ đơn tự chuyển sang `expired` và ghế `A01` tự động trống trở lại.
- [ ] Đặt vé ở chế độ không đăng nhập (*Guest Checkout*) $\rightarrow$ Thanh toán thành công $\rightarrow$ Vào `/tra-cuu-ve` nhập mã đặt chỗ xem được vé và bấm Hủy vé (nếu chuyến còn $\ge 24\text{h}$) thành công.

---

# PHẦN 5: THÀNH VIÊN 5 — NHÓM 5: VÉ ĐIỆN TỬ, VẬN HÀNH, BÁO CÁO VÀ TRỢ LÝ ẢO

* **Phạm vi đề bài giao:** *"Vé điện tử, email vé; quản lý đặt chỗ; soát vé; dashboard, báo cáo; trợ lý ảo; triển khai, kiểm thử tích hợp."*
* **Nhánh Git làm việc:** `feat/member5-tickets-report`

### 1. Danh sách File Bắt buộc Phụ trách (11 files)
1. `Dockerfile` — Cấu hình đóng gói container ứng dụng Node.js.
2. `docker-compose.yml` — Cấu hình khởi chạy đồng thời PostgreSQL 16 + Web App bằng 1 lệnh.
3. `src/config/mailer.js` — Cấu hình Nodemailer & hàm tạo mã QR gửi Email vé điện tử.
4. `src/models/report.model.js` — Toàn bộ hàm SQL cho vé điện tử, Admin quản lý đặt chỗ, Nhân viên soát vé, thống kê báo cáo và dữ liệu Trợ lý ảo.
5. `src/controllers/staff-report.controller.js` — Controller xử lý quản lý đặt chỗ, soát vé check-in và Dashboard thống kê.
6. `src/controllers/chatbot.controller.js` — Controller API AJAX Trợ lý ảo (`POST /api/chatbot/ask`).
7. `src/views/emails/e-ticket.ejs` — Giao diện HTML Email Vé điện tử (kèm ảnh mã QR từng vé).
8. `src/views/admin/bookings.ejs` — Màn hình Admin quản lý toàn bộ đơn đặt chỗ (Bookings).
9. `src/views/staff/checkin.ejs` — Màn hình Nhân viên xem danh sách hành khách theo chuyến & soát vé (`check-in`).
10. `src/views/admin/dashboard.ejs` — Màn hình Dashboard & Báo cáo thống kê doanh thu, số vé bán, tỉ lệ lấp đầy theo thời gian & theo tuyến.
11. `public/js/admin-charts.js` — Script vẽ biểu đồ thống kê bằng Chart.js trên Dashboard.
12. `public/js/ajax-chatbot.js` — Script giao diện bong bóng chat & gọi AJAX Trợ lý ảo không tải lại trang.

### 2. Công việc Phải Làm ở Tầng Dữ liệu (`src/models/report.model.js`)
* **Nhóm hàm Vé điện tử & Quản lý đặt chỗ (`bookings` & `tickets`):**
  * `getElectronicTicketDetails(bookingCode)`: Lấy chi tiết đơn đặt chỗ, thông tin chuyến xe, tên tuyến, biển số xe, giờ khởi hành, điểm đón/điểm trả và danh sách từng vé (`ticket_code`, `seat_code`, `price`, `status`) để render vé điện tử và gửi Email.
  * `getAllBookingsForAdmin({ status, routeId, date, keyword })`: Lấy danh sách toàn bộ đơn đặt chỗ cho Admin quản lý, hỗ trợ lọc theo trạng thái đơn (`pending`, `paid`, `checked_in`, `cancelled`, `expired`), theo tuyến, theo ngày và tìm theo mã đặt chỗ / SĐT hành khách.
* **Nhóm hàm Nhân viên Soát vé tại bến (`staff` check-in):**
  * `getPassengersByTrip(tripId)`: Lấy danh sách toàn bộ hành khách và từng ghế (`tickets` JOIN `bookings`) của một chuyến xe cụ thể để nhân viên nhà xe kiểm tra tại bến.
  * `checkInTicket({ ticketOrBookingCode, staffUserId })`:
    * Cho phép soát vé theo `ticket_code` (từng ghế) hoặc `booking_code` (cả đơn).
    * Kiểm tra vé phải đang ở trạng thái `paid` (nếu vé đang `pending`, `cancelled`, `expired` hoặc đã `checked_in` rồi thì báo lỗi rõ ràng).
    * Cập nhật `tickets.status = 'checked_in'`, `checked_in_at = NOW()`, `checked_in_by = staffUserId` (và nếu toàn bộ vé trong đơn đã check-in thì cập nhật `bookings.status = 'checked_in'`).
* **Nhóm hàm Báo cáo & Thống kê (Đúng yêu cầu đề bài: *Theo thời gian và Theo tuyến*):**
  * `getOverviewMetrics({ startDate, endDate })`: Tổng doanh thu thực thu (`SUM(total_amount - refund_amount)` của các đơn `paid`/`checked_in`), tổng số vé đã bán, tổng số chuyến đã chạy, tỉ lệ lấp đầy trung bình (`%`).
  * `getRevenueAndTicketsByTime({ startDate, endDate, groupBy })`: Thống kê doanh thu, số vé bán và tỉ lệ lấp đầy **theo thời gian** (theo từng ngày hoặc từng tháng).
  * `getRevenueAndOccupancyByRoute({ startDate, endDate })`: Thống kê doanh thu, số vé bán và **tỉ lệ lấp đầy (`occupancy_rate %` = số ghế đã bán / tổng số ghế cung ứng)** **theo từng tuyến xe (`routes`)**.
* **Nhóm hàm truy vấn cho Trợ lý ảo (`chatbot`):**
  * Tìm chuyến xe nhanh theo tên tỉnh đi/đến trong câu chat của khách; tra cứu trạng thái vé theo `booking_code`; lấy nội dung chính sách hoàn/hủy vé và FAQ từ bảng `articles`.

### 3. Công việc Phải Làm ở Tầng Xử lý Backend (`mailer.js`, `staff-report.controller.js`, `chatbot.controller.js`)
* **Trong `src/config/mailer.js`:**
  * Dùng thư viện `qrcode` (`QRCode.toDataURL(bookingCode)`) để sinh ảnh mã QR nhúng vào template `src/views/emails/e-ticket.ejs` và gửi email vé điện tử ngay khi đơn chuyển sang `paid` (nếu chưa cấu hình SMTP thật thì tự động tạo tài khoản test Ethereal Email và in link xem email ra console để giảng viên bấm xem trực tiếp khi demo).
* **Trong `src/controllers/staff-report.controller.js`:**
  * `GET /admin/bookings`: Quản lý danh sách đặt chỗ, xem chi tiết vé của từng đơn, hỗ trợ Admin hủy đơn/hoàn tiền khi cần.
  * `GET /staff/checkin` & `POST /staff/checkin`: Giao diện nhân viên chọn chuyến xe $\rightarrow$ xem danh sách hành khách & ghế $\rightarrow$ nhập mã vé hoặc bấm nút **"Soát vé (Check-in)"** trực tiếp trên dòng hành khách.
  * `GET /admin/dashboard`: Truyền dữ liệu thống kê theo thời gian và theo tuyến xuống `admin/dashboard.ejs` để hiển thị bảng số liệu và vẽ biểu đồ Chart.js.
* **Trong `src/controllers/chatbot.controller.js`:**
  * `POST /api/chatbot/ask`: Phân tích từ khóa câu hỏi của người dùng để trả lời chính xác 3 nhóm nghiệp vụ mà đề bài yêu cầu:
    1. **Hỏi tìm chuyến** (VD: *"Tìm chuyến từ TP.HCM đi Đà Lạt"*): Truy vấn DB trả về các chuyến đang `active`, giờ chạy, giá vé và link đặt vé.
    2. **Hỏi tra cứu vé** (VD: *"Tra cứu vé FUTA123456"*): Truy vấn DB trả về tên hành khách, hành trình, số ghế và trạng thái vé hiện tại.
    3. **Hỏi chính sách / FAQ** (VD: *"Chính sách hủy vé như thế nào?"*, *"Giữ ghế được bao lâu?"*): Trả lời quy định giữ ghế 10 phút, hủy vé trước $\ge 24\text{h}$ và hoàn tiền 100% nếu nhà xe hủy chuyến.

### 4. Công việc Phải Làm ở Tầng Giao diện & Triển khai (`views/staff/*`, `views/admin/*`, `Dockerfile`)
* **Giao diện Soát vé (`src/views/staff/checkin.ejs`):**
  * Có ô chọn chuyến xe + ô nhập nhanh Mã vé / Mã đặt chỗ để bấm Check-in ngay.
  * Hiển thị bảng danh sách hành khách của chuyến: Mã ghế, Họ tên, SĐT, Điểm đón, Trạng thái vé (`paid` màu xanh lá có nút bấm **"Check-in lên xe"**, sau khi bấm đổi sang `checked_in` màu xanh dương kèm giờ soát vé và tên nhân viên soát vé).
* **Giao diện Dashboard (`src/views/admin/dashboard.ejs` & `public/js/admin-charts.js`):**
  * Có bộ lọc khoảng thời gian (Từ ngày – Đến ngày).
  * 4 thẻ KPI tổng quan: Tổng doanh thu, Tổng số vé bán, Tổng số chuyến, Tỉ lệ lấp đầy trung bình (`%`).
  * 2 Biểu đồ Chart.js trực quan: **(1) Biểu đồ Doanh thu & Số vé bán theo thời gian**, **(2) Biểu đồ Doanh thu & Tỉ lệ lấp đầy (`%`) theo từng Tuyến xe**, kèm bảng chi tiết bên dưới.
* **Khung chat Trợ lý ảo (`public/js/ajax-chatbot.js`):**
  * Nút bong bóng chat cố định ở góc dưới bên phải màn hình khách hàng; có sẵn các nút gợi ý nhanh (*"Tìm chuyến TP.HCM - Đà Lạt"*, *"Kiểm tra mã đặt chỗ"*, *"Chính sách hủy vé"*); gửi tin nhắn bằng `fetch('/api/chatbot/ask')` không tải lại trang.

### 5. Checklist Nghiệm thu Bắt buộc (TV5 phải tự test Pass 100%)
- [ ] Khi thanh toán vé thành công $\rightarrow$ hệ thống sinh được Vé điện tử có mã QR và gửi/hiển thị được nội dung Email vé điện tử.
- [ ] Đăng nhập bằng tài khoản `staff@futabus.vn` $\rightarrow$ vào `/staff/checkin` chọn chuyến $\rightarrow$ bấm soát vé cho khách đã thanh toán (`paid`) $\rightarrow$ trạng thái vé chuyển sang `checked_in` kèm thời gian soát vé.
- [ ] Vào `/admin/dashboard` hiển thị đầy đủ biểu đồ và bảng số liệu: **Doanh thu, Số vé bán, Tỉ lệ lấp đầy theo thời gian và theo tuyến**.
- [ ] Mở khung Chatbot hỏi thử cả 3 câu: tìm chuyến, tra cứu mã đặt chỗ, và hỏi chính sách hủy vé đều nhận được phản hồi chính xác từ CSDL mà không tải lại trang.
- [ ] Chạy lệnh `docker compose up -d --build` khởi động thành công cả PostgreSQL và Web App.
