// [TV2 - Nhóm 2] Khởi tạo Express, cấu hình EJS, Session, Static & Định tuyến 5 Nhóm Full-Stack
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const AuthController = require('./controllers/auth.controller');
const AdminCatalogController = require('./controllers/admin-catalog.controller');
const AdminTripController = require('./controllers/admin-trip.controller');
const CustomerTripController = require('./controllers/customer-trip.controller');
const BookingController = require('./controllers/booking.controller');
const StaffReportController = require('./controllers/staff-report.controller');
const ChatbotController = require('./controllers/chatbot.controller');
const BookingModel = require('./models/booking.model');
const { checkAccountActive, requireRole } = require('./middlewares/auth.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình View Engine EJS (SSR)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'bus-ticket-booking-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

app.use(checkAccountActive);

// === NHÓM 1 (TV1): TÀI KHOẢN, XÁC THỰC & BẢO MẬT ===
app.use('/', AuthController.router);
app.use('/admin', requireRole('admin'));
app.use('/staff', requireRole('staff', 'admin'));

// === NHÓM 2 (TV2): DANH MỤC VẬN HÀNH, NỘI DUNG & TRANG TĨNH TAILWIND ===
app.get(['/gioi-thieu', '/chinh-sach', '/faq'], AdminCatalogController.staticPage);
app.get(['/tin-tuc', '/tin-tuc/:slug'], AdminCatalogController.news);
for (const kind of ['stations', 'routes', 'seat-layouts', 'buses', 'articles']) {
  const router = express.Router();
  router.get('/', AdminCatalogController.list);
  router.post('/', AdminCatalogController.save);
  router.post('/:id', AdminCatalogController.save);
  if (['stations', 'routes'].includes(kind)) router.post('/:id/toggle', AdminCatalogController.toggle);
  if (['seat-layouts', 'articles'].includes(kind)) router.post('/:id/delete', AdminCatalogController.remove);
  app.use(`/admin/${kind}`, router);
}

// === NHÓM 3 (TV3): LỊCH CHẠY & TÌM KIẾM CHUYẾN ===
app.get('/', CustomerTripController.renderHome);
app.get('/tim-chuyen', CustomerTripController.renderSearchResults);
app.get('/chuyen-xe/:id', CustomerTripController.renderTripDetail);
app.get('/admin/trips', AdminTripController.listSchedule);
app.get('/api/provinces/suggest', CustomerTripController.apiSuggestProvinces);
app.get('/api/trips/filter', CustomerTripController.apiFilterTrips);

// === NHÓM 4 (TV4): ĐẶT VÉ, CHỌN GHẾ & THANH TOÁN ===
app.get('/dat-ve/:id', BookingController.renderSeatBooking);
app.get('/thanh-toan/:bookingCode', BookingController.renderPayment);
app.get('/tra-cuu-ve', BookingController.renderLookupTicket);
app.get('/api/trips/:id/seats', BookingController.apiGetTripSeats);

// === NHÓM 5 (TV5): VÉ ĐIỆN TỬ, VẬN HÀNH, BÁO CÁO & TRỢ LÝ ẢO ===
app.get('/admin/bookings', StaffReportController.renderAdminBookings);
app.get('/admin/dashboard', StaffReportController.renderDashboard);
app.get('/staff/checkin', StaffReportController.renderCheckin);
app.post('/api/chatbot/ask', ChatbotController.ask);

// Job ngầm 30 giây/lần tự động nhả ghế giữ quá hạn 10 phút (pending -> expired)
setInterval(async () => {
  try {
    await BookingModel.releaseExpiredHolds();
  } catch (_) {
    // Bỏ qua lỗi khi DB chưa sẵn sàng
  }
}, 30000);

app.listen(PORT, () => {
  console.log(`[BUS-TICKET-WEB] Server đang chạy tại http://localhost:${PORT}`);
});
