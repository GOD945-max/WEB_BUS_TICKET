// [TV4 - Nhóm 4: Đặt vé, chọn ghế và thanh toán] Sơ đồ ghế AJAX, giữ ghế 10p, đặt vé, thanh toán giả lập, tra cứu & hủy vé
const BookingModel = require('../models/booking.model');

const BookingController = {
  renderSeatBooking(req, res) {
    res.render('customer/trip-detail-booking', { title: 'Chọn ghế & Đặt vé', tripId: req.params.id });
  },
  renderPayment(req, res) {
    res.render('customer/payment', { title: 'Cổng thanh toán giả lập', bookingCode: req.params.bookingCode });
  },
  renderLookupTicket(req, res) {
    res.render('customer/lookup-ticket', { title: 'Tra cứu & Hủy vé bằng mã đặt chỗ' });
  },
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
