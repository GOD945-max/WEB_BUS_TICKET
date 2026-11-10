-- =====================================================================
-- 02_seed_data.sql
-- Dữ liệu mẫu khởi tạo sẵn cho Hệ thống Đặt vé Xe khách Liên tỉnh
-- Mật khẩu mặc định của 4 tài khoản mẫu: 123456
-- =====================================================================

-- 1. Seed Users (Mật khẩu '123456' đã hash bằng bcrypt)
INSERT INTO users (full_name, email, phone, password_hash, role, is_verified, is_active)
VALUES
('Quản Trị Viên FUTA', 'admin@futabus.vn', '0901000001', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', TRUE, TRUE),
('Nhân Viên Soát Vé Bến Miền Đông', 'staff@futabus.vn', '0901000002', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'staff', TRUE, TRUE),
('Nguyễn Văn Khách', 'khach1@gmail.com', '0912345678', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'customer', TRUE, TRUE),
('Trần Thị Hành Khách', 'khach2@gmail.com', '0987654321', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'customer', TRUE, TRUE)
ON CONFLICT (email) DO NOTHING;

-- 2. Seed Stations (10 bến xe & điểm đón/trả)
INSERT INTO stations (name, province, address, is_main_station, is_active)
VALUES
('Bến xe Miền Đông Mới', 'TP. Hồ Chí Minh', '501 Hoàng Hữu Nam, TP. Thủ Đức, TP.HCM', TRUE, TRUE),
('Bến xe Miền Tây', 'TP. Hồ Chí Minh', '395 Kinh Dương Vương, Bình Tân, TP.HCM', TRUE, TRUE),
('VP Hàng Xanh', 'TP. Hồ Chí Minh', '486H Điện Biên Phủ, Bình Thạnh, TP.HCM', FALSE, TRUE),
('Bến xe Liên tỉnh Đà Lạt', 'Lâm Đồng', '01 Tô Hiến Thành, Phường 3, TP. Đà Lạt', TRUE, TRUE),
('VP Bảo Lộc', 'Lâm Đồng', '280 Trần Phú, TP. Bảo Lộc, Lâm Đồng', FALSE, TRUE),
('Bến xe Phía Nam Nha Trang', 'Khánh Hòa', 'Km6 Đường 23/10, Vĩnh Trung, Nha Trang', TRUE, TRUE),
('Bến xe Trung tâm Đà Nẵng', 'Đà Nẵng', 'Tôn Đức Thắng, Hòa Minh, Liên Chiểu, Đà Nẵng', TRUE, TRUE),
('Bến xe Trung tâm Cần Thơ', 'Cần Thơ', 'QL1A, Hưng Thạnh, Cái Răng, Cần Thơ', TRUE, TRUE),
('Bến xe Vũng Tàu', 'Bà Rịa - Vũng Tàu', '192 Nam Kỳ Khởi Nghĩa, Phường 3, TP. Vũng Tàu', TRUE, TRUE),
('Bến xe Phan Thiết', 'Bình Thuận', '01 Từ Văn Tư, Phú Thủy, TP. Phan Thiết', TRUE, TRUE);

-- 3. Seed Routes (5 tuyến xe chính)
INSERT INTO routes (name, origin_province, destination_province, distance_km, duration_hours, base_price, description, is_active)
VALUES
('TP. Hồ Chí Minh - Đà Lạt', 'TP. Hồ Chí Minh', 'Lâm Đồng', 305, 6.5, 320000, 'Tuyến cao tốc Dầu Giây - Bảo Lộc - Đà Lạt, xe giường nằm Limousine cao cấp.', TRUE),
('TP. Hồ Chí Minh - Nha Trang', 'TP. Hồ Chí Minh', 'Khánh Hòa', 430, 8.0, 380000, 'Chạy cao tốc Phan Thiết - Vĩnh Hảo - Cam Lâm rút ngắn thời gian di chuyển.', TRUE),
('TP. Hồ Chí Minh - Cần Thơ', 'TP. Hồ Chí Minh', 'Cần Thơ', 170, 3.5, 180000, 'Tuyến cao tốc Trung Lương - Mỹ Thuận - Cần Thơ khởi hành mỗi 30 phút.', TRUE),
('TP. Hồ Chí Minh - Vũng Tàu', 'TP. Hồ Chí Minh', 'Bà Rịa - Vũng Tàu', 115, 2.5, 160000, 'Tuyến cao tốc Long Thành - Quốc lộ 51 đi trung tâm TP. Vũng Tàu.', TRUE),
('TP. Hồ Chí Minh - Phan Thiết', 'TP. Hồ Chí Minh', 'Bình Thuận', 195, 3.0, 210000, 'Tuyến cao tốc Dầu Giây - Phan Thiết chỉ 3 tiếng di chuyển.', TRUE);

-- 4. Seed Seat Layouts (2 sơ đồ ghế mẫu 2 tầng)
INSERT INTO seat_layouts (name, total_seats, total_floors, rows_per_floor, cols_per_floor, seat_map_json)
VALUES
('Limousine 22 Phòng Đôi VIP', 22, 2, 6, 2, '{"floor1":["A01","A02","A03","A04","A05","A06","A07","A08","A09","A10","A11"],"floor2":["B01","B02","B03","B04","B05","B06","B07","B08","B09","B10","B11"]}'),
('Giường Nằm Tiêu Chuẩn 34 Chỗ', 34, 2, 6, 3, '{"floor1":["A01","A02","A03","A04","A05","A06","A07","A08","A09","A10","A11","A12","A13","A14","A15","A16","A17"],"floor2":["B01","B02","B03","B04","B05","B06","B07","B08","B09","B10","B11","B12","B13","B14","B15","B16","B17"]}');

-- 5. Seed Buses (6 xe khách)
INSERT INTO buses (license_plate, seat_layout_id, bus_type, amenities, status)
VALUES
('51B-289.01', 1, 'Limousine 22 Phòng', 'Wifi 5G, Màn hình TV riêng, Cổng sạc USB, Chăn gối, Nước suối', 'active'),
('51B-289.02', 1, 'Limousine 22 Phòng', 'Wifi 5G, Ghế Massage, Cổng sạc Type-C, Khăn lạnh, Nước suối', 'active'),
('51B-340.11', 2, 'Giường Nằm 34 Chỗ', 'Wifi, Điều hòa, Cổng sạc USB, Nước suối', 'active'),
('51B-340.12', 2, 'Giường Nằm 34 Chỗ', 'Wifi, Điều hòa, Cổng sạc USB, Nước suối', 'active'),
('51B-340.15', 1, 'Limousine 22 Phòng', 'Wifi 5G, Màn hình giải trí, Cổng sạc USB', 'active'),
('51B-999.88', 2, 'Giường Nằm 34 Chỗ', 'Wifi, Điều hòa', 'maintenance')
ON CONFLICT (license_plate) DO NOTHING;

-- 6. Seed Articles (Tin tức, Chính sách, FAQ)
INSERT INTO articles (title, slug, category, summary, content, is_published)
VALUES
('Khuyến mãi mở tuyến Cao tốc TP.HCM - Phan Thiết - Nha Trang', 'khuyen-mai-cao-toc-nha-trang', 'promotion', 'Giảm ngay 15% giá vé cho hành khách đặt vé trực tuyến sớm trước 3 ngày.', 'Nội dung chi tiết chương trình ưu đãi đặt vé trực tuyến...', TRUE),
('Chính sách hoàn vé và hủy vé trực tuyến', 'chinh-sach-hoan-huy-ve', 'policy', 'Quy định hủy vé trước 24 giờ khởi hành và hoàn tiền 100% khi nhà xe hủy chuyến.', 'Khách hàng được phép hủy vé trực tuyến trước giờ khởi hành tối thiểu 24 giờ...', TRUE),
('Hướng dẫn giữ ghế 10 phút và nhận vé điện tử QR qua Email', 'huong-dan-giu-ghe-va-nhan-ve-qr', 'faq', 'Giải đáp thắc mắc về cơ chế khóa ghế tạm thời 10 phút khi thanh toán.', 'Khi quý khách chọn ghế và bấm Tiếp tục, hệ thống sẽ khóa ghế trong vòng 10 phút...', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- 7. Seed Trips (12 chuyến xe mẫu)
INSERT INTO trips (route_id, bus_id, departure_time, arrival_time, ticket_price, status)
VALUES
(1, 1, CURRENT_DATE + INTERVAL '1 day 07 hours', CURRENT_DATE + INTERVAL '1 day 13 hours 30 minutes', 350000, 'active'),
(1, 3, CURRENT_DATE + INTERVAL '1 day 22 hours', CURRENT_DATE + INTERVAL '2 days 04 hours 30 minutes', 320000, 'active'),
(1, 2, CURRENT_DATE + INTERVAL '2 days 08 hours', CURRENT_DATE + INTERVAL '2 days 14 hours 30 minutes', 350000, 'active'),
(2, 5, CURRENT_DATE + INTERVAL '1 day 20 hours', CURRENT_DATE + INTERVAL '2 days 04 hours', 420000, 'active'),
(2, 4, CURRENT_DATE + INTERVAL '1 day 21 hours 30 minutes', CURRENT_DATE + INTERVAL '2 days 05 hours 30 minutes', 380000, 'active'),
(2, 1, CURRENT_DATE + INTERVAL '2 days 20 hours', CURRENT_DATE + INTERVAL '3 days 04 hours', 420000, 'active'),
(3, 3, CURRENT_DATE + INTERVAL '1 day 06 hours', CURRENT_DATE + INTERVAL '1 day 09 hours 30 minutes', 180000, 'active'),
(3, 4, CURRENT_DATE + INTERVAL '1 day 14 hours', CURRENT_DATE + INTERVAL '1 day 17 hours 30 minutes', 180000, 'active'),
(4, 2, CURRENT_DATE + INTERVAL '1 day 07 hours 30 minutes', CURRENT_DATE + INTERVAL '1 day 10 hours', 160000, 'active'),
(4, 5, CURRENT_DATE + INTERVAL '1 day 15 hours', CURRENT_DATE + INTERVAL '1 day 17 hours 30 minutes', 160000, 'active'),
(5, 3, CURRENT_DATE + INTERVAL '1 day 08 hours', CURRENT_DATE + INTERVAL '1 day 11 hours', 210000, 'active'),
(5, 4, CURRENT_DATE + INTERVAL '1 day 16 hours', CURRENT_DATE + INTERVAL '1 day 19 hours', 210000, 'active');

-- 8. Seed Trip Stops (Điểm đón & Điểm trả cho chuyến số 1 và 2)
INSERT INTO trip_stops (trip_id, station_id, stop_type, stop_time, stop_order)
VALUES
(1, 3, 'pickup', CURRENT_DATE + INTERVAL '1 day 06 hours 30 minutes', 1),
(1, 1, 'pickup', CURRENT_DATE + INTERVAL '1 day 07 hours', 2),
(1, 5, 'dropoff', CURRENT_DATE + INTERVAL '1 day 11 hours', 1),
(1, 4, 'dropoff', CURRENT_DATE + INTERVAL '1 day 13 hours 30 minutes', 2),
(2, 3, 'pickup', CURRENT_DATE + INTERVAL '1 day 21 hours 30 minutes', 1),
(2, 1, 'pickup', CURRENT_DATE + INTERVAL '1 day 22 hours', 2),
(2, 5, 'dropoff', CURRENT_DATE + INTERVAL '2 days 02 hours', 1),
(2, 4, 'dropoff', CURRENT_DATE + INTERVAL '2 days 04 hours 30 minutes', 2);
