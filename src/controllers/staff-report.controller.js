// [TV5 - Nhóm 5: Vé điện tử, vận hành, báo cáo và trợ lý ảo] Quản lý đặt chỗ, nhân viên soát vé (check-in) & Dashboard báo cáo
const ReportModel = require('../models/report.model');

const StaffReportController = {
  renderAdminBookings(req, res) {
    res.render('admin/bookings', { title: 'Quản lý Đặt chỗ (Bookings)' });
  },
  renderCheckin(req, res) {
    res.render('staff/checkin', { title: 'Nhân viên Soát vé (Check-in) tại bến' });
  },
  async renderDashboard(req, res, next) {
    try {
      const summary = await ReportModel.getDashboardSummary();
      res.render('admin/dashboard', { title: 'Dashboard Thống kê Doanh thu & Tỉ lệ lấp đầy', summary });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = StaffReportController;
