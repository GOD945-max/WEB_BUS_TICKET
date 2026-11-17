# Bộ Dữ Liệu Mẫu Chuẩn Kaggle (`db/kaggle_dataset/`) — Dùng Chung Cho Cả 5 Thành Viên

Thư mục này chứa **bộ 9 tệp dữ liệu `.csv` chuẩn hóa từ Kaggle** (kết hợp chuẩn *GTFS Intercity Bus Transportation Dataset* và *Bus Journey Demand Forecasting Dataset*) tương thích **100%** với cấu trúc **10 bảng PostgreSQL** trong `db/01_init_schema.sql`.

---

## 1. Danh sách 9 tệp CSV tương ứng với 10 bảng CSDL của nhóm

| STT | Tệp CSV | Bảng PostgreSQL tương ứng | Thành viên sử dụng chính | Mô tả dữ liệu mẫu |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `users.csv` | `users` | **TV1 (Nhóm 1)** | **15 tài khoản** (`admin`, `staff`, và 12 `customer` với đủ trạng thái đã xác thực, chưa xác thực, bị khóa). Mật khẩu mặc định: `123456`. |
| 2 | `stations.csv` | `stations` | **TV2 (Nhóm 2) & TV3** | **12 bến xe & văn phòng đón/trả khách** liên tỉnh (`name`, `province`, `address`, `is_main_station`, `is_active`). |
| 3 | `routes.csv` | `routes` | **TV2 (Nhóm 2) & TV3** | **10 tuyến đường liên tỉnh** (`name`, `origin_province`, `destination_province`, `distance_km`, `duration_hours`, `base_price`). |
| 4 | `seat_layouts.csv` | `seat_layouts` | **TV2 (Nhóm 2) & TV4** | **3 cấu hình sơ đồ ghế JSONB** (Limousine 22 Phòng Đôi 2 tầng, Giường Nằm 34 Chỗ 2 tầng, Ghế Ngồi Limousine 16 Chỗ 1 tầng). |
| 5 | `buses.csv` | `buses` | **TV2 (Nhóm 2) & TV3** | **8 xe khách** (`license_plate`, `seat_layout_id`, `bus_type`, `amenities`, `status`). |
| 6 | `trips.csv` | `trips` | **TV3 (Nhóm 3) & TV4** | **14 chuyến xe mẫu** (bao gồm cả chuyến khởi hành `>= 24h` và chuyến cận giờ `< 24h`). |
| 7 | `trip_stops.csv` | `trip_stops` | **TV3 (Nhóm 3) & TV4** | **Điểm đón (`pickup`) & điểm trả (`dropoff`)** theo thứ tự `stop_order` cho từng tuyến. |
| 8 | `bookings.csv` | `bookings` & `tickets` | **TV1, TV4 & TV5** | **Đơn đặt vé & vé ghế điện tử (`BT2601` -> `BT2608`)** phủ đủ **5 trạng thái**: `pending`, `paid` (>= 24h), `paid` (< 24h), `checked_in`, `cancelled`, `expired`. |
| 9 | `articles.csv` | `articles` | **TV2 (Nhóm 2) & TV3** | **5 bài viết** thuộc đủ 4 chuyên mục (`promotion`, `policy`, `faq`, `news`). |

---

## 2. Cách nạp dữ liệu Kaggle vào PostgreSQL (Chỉ 1 lệnh duy nhất)

Sau khi đã khởi tạo cấu trúc bảng (`db/01_init_schema.sql`), bất kỳ thành viên nào trong nhóm chỉ cần chạy lệnh sau tại thư mục gốc của dự án:

```bash
node db/kaggle_dataset/import_kaggle_csv.js
```

> **Lưu ý:** Script chạy theo cơ chế **Idempotent** (`ON CONFLICT DO UPDATE / DO NOTHING`), nên các thành viên có thể chạy lại nhiều lần bất cứ lúc nào để khôi phục dữ liệu mẫu hoặc sửa lỗi mật khẩu tài khoản mẫu về chuẩn `123456` mà không sợ lỗi trùng khóa.

---

## 3. Đồng bộ trực tiếp trên Giao diện Quản trị (`/admin/users`)

Ngoài việc chạy lệnh CLI ở trên, khi đăng nhập quyền **Admin** (`admin@futabus.vn` / `123456`) và truy cập **`http://localhost:3000/admin/users`**:
- Nhấn nút **"Đồng bộ / Nhập CSV (Kaggle)"** -> Chọn **"Đồng bộ Kaggle ngay"** để nạp nhanh dữ liệu trực tiếp trên trình duyệt.
- Hoặc chọn tệp `db/kaggle_dataset/users.csv` từ máy tính để nhập hàng loạt tài khoản người dùng.
- Nhấn nút **"Xuất CSV"** tại `/admin/users` hoặc `/auth/booking-history` để xuất dữ liệu ra tệp CSV chuẩn UTF-8 BOM.
