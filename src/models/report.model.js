// [TV1 viết SQL / TV5 commit] Hàm SQL soát vé, thống kê doanh thu & tỷ lệ lấp đầy
const db = require('../config/db');

const ReportModel = {
  async getDashboardSummary() {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(total_amount - refund_amount), 0) AS total_revenue,
              COUNT(*) FILTER (WHERE status IN ('paid', 'checked_in')) AS paid_bookings
       FROM bookings`
    );
    return rows[0];
  },
};

module.exports = ReportModel;
