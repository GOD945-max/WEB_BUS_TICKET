// [TV2] Khởi tạo Express, cấu hình EJS, Session, Static & Định tuyến
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const CustomerTripController = require('./controllers/customer-trip.controller');
const BookingController = require('./controllers/booking.controller');
const ChatbotController = require('./controllers/chatbot.controller');
const AuthController = require('./controllers/auth.controller');
const AdminCatalogController = require('./controllers/admin-catalog.controller');
const AdminTripController = require('./controllers/admin-trip.controller');
const StaffReportController = require('./controllers/staff-report.controller');
const BookingModel = require('./models/booking.model');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình View Engine EJS
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

// Biến toàn cục cho EJS
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// === ROUTES KHÁCH HÀNG & TRANG TĨNH TAILWIND ===
app.get('/', CustomerTripController.renderHome);
app.get('/gioi-thieu', (req, res) => res.render('static-tailwind/about', { title: 'Giới thiệu nhà xe' }));
app.get('/chinh-sach', (req, res) => res.render('static-tailwind/policy', { title: 'Chính sách hoàn/hủy vé' }));
app.get('/faq', (req, res) => res.render('static-tailwind/faq', { title: 'Câu hỏi thường gặp (FAQ)' }));

// === ROUTES AUTH ===
app.get('/auth/login', AuthController.renderLogin);
app.get('/auth/register', AuthController.renderRegister);

// === ROUTES ADMIN & STAFF ===
app.get('/admin/dashboard', StaffReportController.renderDashboard);
app.get('/admin/stations', AdminCatalogController.listStations);
app.get('/admin/trips', AdminTripController.listSchedule);
app.get('/staff/checkin', StaffReportController.renderCheckin);

// === 4 NHÓM API AJAX (FETCH JSON KHÔNG TẢI LẠI TRANG) ===
app.get('/api/provinces/suggest', CustomerTripController.apiSuggestProvinces);
app.get('/api/trips/filter', CustomerTripController.apiFilterTrips);
app.get('/api/trips/:id/seats', BookingController.apiGetTripSeats);
app.post('/api/chatbot/ask', ChatbotController.ask);

// Job ngầm 30 giây/lần tự động nhả ghế giữ quá hạn 10 phút
setInterval(async () => {
  try {
    await BookingModel.releaseExpiredHolds();
  } catch (_) {
    // Bỏ qua lỗi kết nối khi DB chưa khởi động xong
  }
}, 30000);

app.listen(PORT, () => {
  console.log(`[BUS-TICKET-WEB] Server đang chạy tại http://localhost:${PORT}`);
});
