// [TV3 - Nhóm 3: Lịch chạy và tìm kiếm chuyến] Trang chủ, tìm chuyến, chi tiết chuyến, AJAX Autocomplete & lọc chuyến
const TripModel = require('../models/trip.model');

const CustomerTripController = {
  async renderHome(req, res, next) {
    try {
      const trips = await TripModel.searchTrips({});
      res.render('customer/home', { title: 'Trang chủ - Đặt vé xe khách liên tỉnh', trips });
    } catch (err) {
      next(err);
    }
  },
  async renderSearchResults(req, res, next) {
    try {
      const trips = await TripModel.searchTrips({ origin: req.query.origin, dest: req.query.dest });
      res.render('customer/search-results', { title: 'Kết quả tìm kiếm chuyến xe', trips });
    } catch (err) {
      next(err);
    }
  },
  renderTripDetail(req, res) {
    res.render('customer/trip-detail', { title: 'Chi tiết chuyến xe & Điểm dừng', tripId: req.params.id });
  },
  async apiSuggestProvinces(req, res, next) {
    try {
      const data = await TripModel.suggestProvinces(req.query.keyword || '');
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
  async apiFilterTrips(req, res, next) {
    try {
      const trips = await TripModel.searchTrips({
        origin: req.query.origin,
        dest: req.query.dest,
      });
      res.json({ success: true, trips });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = CustomerTripController;
