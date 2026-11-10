-- =====================================================================
-- 01_init_schema.sql
-- Thiết kế 10 bảng CSDL PostgreSQL cho Hệ thống Đặt vé Xe khách Liên tỉnh
-- =====================================================================

-- 1. Bảng users (Người dùng & Phân quyền)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'admin')),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verify_token VARCHAR(255),
    reset_token VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Bảng stations (Bến xe & Điểm đón/trả)
CREATE TABLE IF NOT EXISTS stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    province VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    is_main_station BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3. Bảng routes (Tuyến xe liên tỉnh)
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    origin_province VARCHAR(100) NOT NULL,
    destination_province VARCHAR(100) NOT NULL,
    distance_km INTEGER NOT NULL,
    duration_hours NUMERIC(4,1) NOT NULL,
    base_price NUMERIC(12,0) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. Bảng seat_layouts (Sơ đồ ghế mẫu)
CREATE TABLE IF NOT EXISTS seat_layouts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    total_seats INTEGER NOT NULL,
    total_floors INTEGER NOT NULL DEFAULT 2 CHECK (total_floors IN (1, 2)),
    rows_per_floor INTEGER NOT NULL,
    cols_per_floor INTEGER NOT NULL,
    seat_map_json JSONB NOT NULL
);

-- 5. Bảng buses (Đội xe)
CREATE TABLE IF NOT EXISTS buses (
    id SERIAL PRIMARY KEY,
    license_plate VARCHAR(30) UNIQUE NOT NULL,
    seat_layout_id INTEGER NOT NULL REFERENCES seat_layouts(id) ON DELETE RESTRICT,
    bus_type VARCHAR(80) NOT NULL,
    amenities VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance'))
);

-- 6. Bảng trips (Chuyến xe & Vòng đời Chuyến)
CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
    bus_id INTEGER REFERENCES buses(id) ON DELETE SET NULL,
    departure_time TIMESTAMP NOT NULL,
    arrival_time TIMESTAMP NOT NULL,
    ticket_price NUMERIC(12,0) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'departed', 'completed', 'cancelled')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Bảng trip_stops (Điểm dừng đón/trả của từng chuyến)
CREATE TABLE IF NOT EXISTS trip_stops (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE RESTRICT,
    stop_type VARCHAR(20) NOT NULL CHECK (stop_type IN ('pickup', 'dropoff')),
    stop_time TIMESTAMP NOT NULL,
    stop_order INTEGER NOT NULL DEFAULT 1
);

-- 8. Bảng bookings (Đơn đặt chỗ & Giữ ghế 10 phút)
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    booking_code VARCHAR(15) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
    pickup_stop_id INTEGER REFERENCES trip_stops(id) ON DELETE SET NULL,
    dropoff_stop_id INTEGER REFERENCES trip_stops(id) ON DELETE SET NULL,
    passenger_name VARCHAR(120) NOT NULL,
    passenger_phone VARCHAR(20) NOT NULL,
    passenger_email VARCHAR(150) NOT NULL,
    seat_count INTEGER NOT NULL,
    total_amount NUMERIC(12,0) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'checked_in')),
    hold_expires_at TIMESTAMP,
    refund_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Bảng tickets (Vé điện tử từng ghế)
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
    seat_code VARCHAR(10) NOT NULL,
    ticket_code VARCHAR(20) UNIQUE NOT NULL,
    price NUMERIC(12,0) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'paid', 'checked_in', 'cancelled', 'expired')),
    checked_in_at TIMESTAMP,
    checked_in_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Unique Partial Index: Chống đặt/giữ trùng 1 ghế trên cùng 1 chuyến khi ghế đang ở trạng thái held, paid hoặc checked_in
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_seat_per_trip
ON tickets (trip_id, seat_code)
WHERE status IN ('held', 'paid', 'checked_in');

-- 10. Bảng articles (Tin tức & Nội dung tĩnh)
CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN ('news', 'promotion', 'policy', 'faq')),
    summary TEXT,
    content TEXT NOT NULL,
    thumbnail_url VARCHAR(255),
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
