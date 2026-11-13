// [TV5 - Nhóm 5: Vé điện tử, vận hành, báo cáo và trợ lý ảo] Hàm SQL vé điện tử, quản lý đặt chỗ, soát vé & thống kê
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
