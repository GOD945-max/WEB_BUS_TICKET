// [TV2 viết / TV1 commit] Đăng ký, Xác thực Email, Đăng nhập, Quên MK, Hồ sơ
const AuthController = {
  renderLogin(req, res) {
    res.render('auth/login', { title: 'Đăng nhập hệ thống' });
  },
  renderRegister(req, res) {
    res.render('auth/register', { title: 'Đăng ký tài khoản' });
  },
};

module.exports = AuthController;
