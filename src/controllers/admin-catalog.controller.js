// [TV2] CRUD Bến xe, Tuyến, Xe, Sơ đồ ghế, Tin tức, User
const CatalogModel = require('../models/catalog.model');

const AdminCatalogController = {
  async listStations(req, res, next) {
    try {
      const stations = await CatalogModel.getStations();
      res.render('admin/catalog/stations', { title: 'Quản lý Bến xe & Điểm dừng', stations });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = AdminCatalogController;
