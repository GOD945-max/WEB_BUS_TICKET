// [TV1 - Nhóm 1: Tài khoản, xác thực và bảo mật] Đăng ký, xác thực email, đăng nhập, quên MK, hồ sơ, lịch sử vé, QL user
const UserModel = require('../models/user.model');

const AuthController = {
  renderLogin(req, res) {
    res.render('auth/login', { title: 'Đăng nhập hệ thống' });
  },
  renderRegister(req, res) {
    res.render('auth/register', { title: 'Đăng ký tài khoản' });
  },
  renderForgotPassword(req, res) {
    res.render('auth/forgot-password', { title: 'Quên mật khẩu' });
  },
  renderProfile(req, res) {
    res.render('auth/profile', { title: 'Hồ sơ cá nhân' });
  },
  renderBookingHistory(req, res) {
    res.render('auth/booking-history', { title: 'Lịch sử đặt vé' });
  },
  async listUsersAdmin(req, res, next) {
    try {
      const users = await UserModel.listAll();
      res.render('admin/users', { title: 'Quản lý người dùng & Phân quyền', users });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = AuthController;
