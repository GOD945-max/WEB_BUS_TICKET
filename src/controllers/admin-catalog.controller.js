// [TV2 - Nhóm 2: Danh mục vận hành và nội dung] CRUD bến xe, tuyến, sơ đồ ghế, xe, tin tức & trang tĩnh
const CatalogModel = require('../models/catalog.model');

const AdminCatalogController = {
  async listStations(req, res, next) {
    try {
      const stations = await CatalogModel.getStations();
      res.render('admin/catalog/stations', { title: 'Quản lý Bến xe & Điểm đón/trả', stations });
    } catch (err) {
      next(err);
    }
  },
  async listRoutes(req, res, next) {
    try {
      const routes = await CatalogModel.getRoutes();
      res.render('admin/catalog/routes', { title: 'Quản lý Tuyến xe', routes });
    } catch (err) {
      next(err);
    }
  },
  async listSeatLayouts(req, res, next) {
    try {
      const layouts = await CatalogModel.getSeatLayouts();
      res.render('admin/catalog/seat-layouts', { title: 'Quản lý Sơ đồ ghế mẫu', layouts });
    } catch (err) {
      next(err);
    }
  },
  async listBuses(req, res, next) {
    try {
      const buses = await CatalogModel.getBuses();
      res.render('admin/catalog/buses', { title: 'Quản lý Đội xe', buses });
    } catch (err) {
      next(err);
    }
  },
  async listArticlesAdmin(req, res, next) {
    try {
      const articles = await CatalogModel.getArticlesByCategory(null);
      res.render('admin/catalog/articles', { title: 'Quản lý Tin tức, Khuyến mãi, Chính sách, FAQ', articles });
    } catch (err) {
      next(err);
    }
  },
  async renderCustomerArticles(req, res, next) {
    try {
      const articles = await CatalogModel.getArticlesByCategory('news');
      res.render('customer/articles', { title: 'Tin tức & Khuyến mãi', articles });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = AdminCatalogController;
