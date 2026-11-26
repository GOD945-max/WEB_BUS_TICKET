# Bộ Dữ Liệu Thật Từ Kaggle (`db/kaggle_dataset/`) — Chuẩn Hóa Cho 10 Bảng PostgreSQL

Thư mục này chứa **dữ liệu gốc tải trực tiếp từ 3 bộ dữ liệu công khai trên Kaggle** (`db/kaggle_dataset/raw/`), quy trình ETL tái lập được (`build_kaggle_csvs.js`), **9 tệp CSV chuẩn hóa** và tệp SQL thuần (`kaggle_seed.sql`) tương thích **100%** với `db/01_init_schema.sql`, `db/02_seed_data.sql` và toàn bộ câu truy vấn của 5 nhóm thành viên.

---

## 1. Nguồn 3 Bộ Dữ Liệu Thật Trên Kaggle (`db/kaggle_dataset/raw/`)

| STT | Bộ dữ liệu Kaggle (Link chính thức) | Tệp gốc trong `raw/` | Giấy phép | Dữ liệu trích xuất vào đồ án |
| :-: | :--- | :--- | :--- | :--- |
| 1 | **[Southeast Asia Transport Data](https://www.kaggle.com/datasets/seatransport/southeast-asia-transport-data)** (`seatransport/southeast-asia-transport-data`) | `vietnam-transport-map.geo.json` (141 KB)<br>`vietnam-border-crossings.csv` (3 KB) | ODbL 1.0 | **28 tỉnh/thành phố Việt Nam có tọa độ OSM**, **26 tuyến xe khách nội địa VN** (+ 6 chiều về = **32 tuyến**), khoảng cách thực tế tính bằng Haversine GPS, và **19 cửa khẩu đường bộ e-Visa** cho bài viết tin tức. |
| 2 | **[Pan-India Bus Routes: 35K+ Schedules, 1000+ Cities](https://www.kaggle.com/datasets/rohitgds/pan-india-bus-routes-35k-schedules-1000-cities)** (`rohitgds/pan-india-bus-routes-35k-schedules-1000-cities`) | `Pan-India_Bus_Routes.csv` (3.34 MB — 35,667 lịch chạy) | CC BY 4.0 | **Vận tốc trung bình thực tế (44.4 km/h)** để tính `duration_hours`, **phân bố khung giờ xuất bến cao điểm** (đêm & ngày) cho bảng `trips`, và **cấu hình đội xe/sơ đồ ghế** (`2+1 Sleeper`, `Volvo B9R Multi-Axle Semi-Sleeper`, `Executive A/C`) cho `seat_layouts` & `buses`. |
| 3 | **[Bus Journey Demand Forecasting Dataset](https://www.kaggle.com/datasets/iamvijay7/bus-journey-demand-forecasting-dataset)** (`iamvijay7/bus-journey-demand-forecasting-dataset`) | `bus_demand_train.csv` (`train.csv`, 1.65 MB — 67,200 dòng) | CC0: Public Domain | **Trọng số nhu cầu đặt chỗ (`final_seatcount`) theo cặp tuyến OD & ngày** để ánh xạ tạo 24 đơn đặt vé lịch sử & sắp chạy (`BT2607` → `BT2630`) phục vụ Dashboard thống kê doanh thu/tỉ lệ lấp đầy. |

---

## 2. Danh sách 9 tệp CSV chuẩn hóa tương ứng 10 bảng trong `db/01_init_schema.sql`

| STT | Tệp CSV | Bảng PostgreSQL | Số bản ghi | Ghi chú tương thích SQL cả nhóm |
| :-: | :--- | :--- | :-: | :--- |
| 1 | `users.csv` | `users` | **20** | Giữ đủ 4 tài khoản lõi (`admin@futabus.vn`, `staff@futabus.vn`, `khach1@gmail.com`, `khach2@gmail.com`, MK: `123456`) + 16 tài khoản đủ trạng thái (`is_verified`, `is_active`). |
| 2 | `stations.csv` | `stations` | **31** | 10 bến cốt lõi khớp `02_seed_data.sql` + 21 bến xe liên tỉnh Bắc-Trung-Nam trích từ GeoJSON Kaggle (kèm tọa độ OSM). |
| 3 | `routes.csv` | `routes` | **32** | 5 tuyến đầu khớp `02_seed_data.sql` + 27 tuyến liên tỉnh Bắc-Trung-Nam trích từ `vietnam-transport-map.geo.json`. |
| 4 | `seat_layouts.csv` | `seat_layouts` | **4** | Chuẩn JSONB `{"floor1":[...],"floor2":[...]}` & `CHECK (total_floors IN (1, 2))` (22, 34, 16, 36 chỗ). |
| 5 | `buses.csv` | `buses` | **12** | 6 biển số lõi + 6 xe mới theo phân loại `Pan-India_Bus_Routes.csv` (`active`, `maintenance`). |
| 6 | `trips.csv` | `trips` | **53** | Gồm chuyến cận giờ (`< 24h`), chuyến sắp chạy (`+1..+3 ngày`), 10 chuyến `completed` (`-1..-14 ngày` cho Dashboard TV5), 1 `draft`, 1 `cancelled`. |
| 7 | `trip_stops.csv` | `trip_stops` | **70 mẫu** | Điểm đón (`pickup`) & điểm trả (`dropoff`) tự động ánh xạ cho từng chuyến xe theo `route_name` & `station_name`. |
| 8 | `bookings.csv` | `bookings` & `tickets` | **30 đơn / 38 vé** | Giữ 6 đơn test (`BT2601`→`BT2606` đủ 5 trạng thái) + 24 đơn từ `bus_demand_train.csv`, tôn trọng tuyệt đối `idx_unique_active_seat_per_trip`. |
| 9 | `articles.csv` | `articles` | **8** | Phủ đủ 4 chuyên mục (`news`, `promotion`, `policy`, `faq`), có tin tức tổng hợp từ `vietnam-border-crossings.csv`. |

---

## 3. Cách sử dụng cho cả 5 thành viên

### Cách 1: Nạp nhanh bằng Node.js CLI (Khuyên dùng — Idempotent)
```bash
node db/kaggle_dataset/import_kaggle_csv.js
```

### Cách 2: Nạp thuần bằng SQL (`psql` / pgAdmin / DBeaver — không cần Node.js)
Chạy sau khi đã chạy `db/01_init_schema.sql` (chạy được độc lập hoặc chạy tiếp sau `db/02_seed_data.sql`):
```bash
psql -U postgres -d bus_booking -f db/kaggle_dataset/kaggle_seed.sql
```

### Cách 3: Đồng bộ 1 chạm trên Giao diện Quản trị (`/admin/users`)
Đăng nhập Admin (`admin@futabus.vn` / `123456`) → `/admin/users` → **"Đồng bộ / Nhập CSV (Kaggle)"** → **"Đồng bộ Kaggle ngay"**.

### Tái lập dữ liệu từ đầu (Tải lại từ Kaggle API + Chạy lại ETL)
```bash
node db/kaggle_dataset/download_kaggle_raw.js
node db/kaggle_dataset/build_kaggle_csvs.js
node db/kaggle_dataset/import_kaggle_csv.js
```
