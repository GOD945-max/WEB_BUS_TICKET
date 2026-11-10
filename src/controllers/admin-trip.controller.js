// [TV2 viết / TV3 commit] Lập lịch chuyến, đổi trạng thái chuyến (draft -> active -> cancelled)
const AdminTripController = {
  async listSchedule(req, res) {
    res.render('admin/trips/schedule', { title: 'Quản lý Lịch chạy Chuyến xe' });
  },
};

module.exports = AdminTripController;
