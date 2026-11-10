// [TV3 viết / TV4 commit] Chọn ghế AJAX, Giữ ghế 10p, Đặt vé, Thanh toán, Hủy vé
const BookingModel = require('../models/booking.model');

const BookingController = {
  async apiGetTripSeats(req, res, next) {
    try {
      const occupiedSeats = await BookingModel.getOccupiedSeats(req.params.id);
      res.json({ success: true, occupiedSeats });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = BookingController;
