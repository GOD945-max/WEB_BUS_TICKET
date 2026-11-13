// [TV4 - Nhóm 4: Đặt vé, chọn ghế và thanh toán] Hàm SQL giữ ghế 10p, đặt vé, thanh toán, tra cứu & hủy vé
const db = require('../config/db');

const BookingModel = {
  async getOccupiedSeats(tripId) {
    const { rows } = await db.query(
      `SELECT seat_code, status FROM tickets
       WHERE trip_id = $1 AND status IN ('held', 'paid', 'checked_in')`,
      [tripId]
    );
    return rows;
  },
  async releaseExpiredHolds() {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE bookings SET status = 'expired'
         WHERE status = 'pending' AND hold_expires_at < NOW()
         RETURNING id`
      );
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        await client.query(
          `UPDATE tickets SET status = 'expired' WHERE booking_id = ANY($1::int[])`,
          [ids]
        );
      }
      await client.query('COMMIT');
      return rows.length;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = BookingModel;
