// [TV3 - Nhóm 3: Lịch chạy và tìm kiếm chuyến] Quản lý chuyến, lập lịch, điểm dừng, vòng đời chuyến
const AdminTripController = {
  async listSchedule(req, res) {
    res.render('admin/trips/schedule', { title: 'Quản lý Lịch chạy & Vòng đời Chuyến xe' });
  },
};

module.exports = AdminTripController;
