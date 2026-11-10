// [TV3] Trang chủ, Tìm chuyến, AJAX Autocomplete & Lọc chuyến
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
