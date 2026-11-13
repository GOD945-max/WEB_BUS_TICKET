// [TV1 - Nhóm 1: Tài khoản, xác thực và bảo mật] Phân quyền (guest, customer, staff, admin) & bảo mật chung
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send('403 Forbidden - Bạn không có quyền truy cập chức năng này.');
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
