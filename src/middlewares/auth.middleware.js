// [TV2 viết / TV1 commit] Kiểm tra đăng nhập & phân quyền (customer, staff, admin)
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
