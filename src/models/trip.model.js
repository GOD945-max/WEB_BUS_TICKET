// [TV3 - Nhóm 3: Lịch chạy và tìm kiếm chuyến] Hàm SQL bảng trips, trip_stops, vòng đời chuyến & tìm kiếm/lọc chuyến
const db = require('../config/db');

const TripModel = {
  async suggestProvinces(keyword = '') {
    const { rows } = await db.query(
      `SELECT DISTINCT province FROM stations WHERE province ILIKE $1 ORDER BY province ASC LIMIT 10`,
      [`%${keyword}%`]
    );
    return rows.map((r) => r.province);
  },
  async searchTrips({ origin, dest }) {
    const { rows } = await db.query(
      `SELECT t.*, r.name AS route_name, r.origin_province, r.destination_province,
              b.bus_type, b.license_plate, sl.total_seats
       FROM trips t
       JOIN routes r ON t.route_id = r.id
       LEFT JOIN buses b ON t.bus_id = b.id
       LEFT JOIN seat_layouts sl ON b.seat_layout_id = sl.id
       WHERE t.status = 'active'
         AND ($1::text IS NULL OR r.origin_province ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR r.destination_province ILIKE '%' || $2 || '%')
       ORDER BY t.departure_time ASC`,
      [origin || null, dest || null]
    );
    return rows;
  },
};

module.exports = TripModel;
