// [TV2 viết / TV5 commit] Nhân viên soát vé (check-in) & Báo cáo Dashboard
const ReportModel = require('../models/report.model');

const StaffReportController = {
  renderCheckin(req, res) {
    res.render('staff/checkin', { title: 'Soát vé hành khách tại bến' });
  },
  async renderDashboard(req, res, next) {
    try {
      const summary = await ReportModel.getDashboardSummary();
      res.render('admin/dashboard', { title: 'Dashboard Doanh thu & Tỷ lệ lấp đầy', summary });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = StaffReportController;
