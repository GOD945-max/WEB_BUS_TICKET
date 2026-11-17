/**
 * @file src/middlewares/auth.middleware.js
 * @description [TV1 - Nhóm 1: Tài khoản, xác thực và bảo mật]
 * Hệ thống Middleware kiểm tra xác thực (Authentication), phân quyền 4 vai trò (RBAC:
 * `guest`, `customer`, `staff`, `admin`), kiểm tra trạng thái khóa tài khoản thời gian thực
 * (`is_active = FALSE`) và các hàm tiện ích làm sạch dữ liệu / chống XSS.
 *
 * ============================================================================
 * HƯỚNG DẪN TÍCH HỢP VÀO `src/app.js` (DÀNH CHO TV2 - NHÓM 2):
 * ============================================================================
 * Ngay sau khi cấu hình `express-session`, gắn `checkAccountActive` (hoặc bí danh
 * `attachUserToLocals`) làm Global Middleware cho toàn bộ request:
 *
 * ```js
 * const {
 *   checkAccountActive,
 *   requireAuth,
 *   requireRole,
 *   redirectIfAuthenticated,
 * } = require('./middlewares/auth.middleware');
 *
 * // Gắn toàn cục ngay sau app.use(session({...}))
 * app.use(checkAccountActive);
 *
 * // Ví dụ bảo vệ các tuyến đường theo vai trò (RBAC):
 * app.get('/auth/login', redirectIfAuthenticated, AuthController.renderLogin);
 * app.get('/auth/profile', requireAuth, AuthController.renderProfile);
 * app.get('/staff/checkin', requireRole('staff', 'admin'), StaffReportController.renderCheckin);
 * app.get('/admin/users', requireRole('admin'), AuthController.listUsersAdmin);
 * ```
 */

const userModel = require('../models/user.model');

/**
 * Kiểm tra xem request hiện tại có phải là yêu cầu AJAX / API trả về JSON hay không.
 *
 * @param {import('express').Request} req - Đối tượng Request của Express
 * @returns {boolean} `true` nếu là AJAX (`req.xhr`), đường dẫn `/api/...` hoặc header `Accept: application/json`
 */
function isAjaxOrApiRequest(req) {
  if (!req) {
    return false;
  }
  const url = req.originalUrl || req.url || '';
  return Boolean(
    req.xhr ||
      (typeof url === 'string' && url.startsWith('/api/')) ||
      (req.headers &&
        typeof req.headers.accept === 'string' &&
        req.headers.accept.includes('application/json'))
  );
}

/**
 * Hủy phiên đăng nhập (`req.session`) một cách an toàn và xóa thông tin người dùng trên `res.locals`.
 *
 * @param {import('express').Request} req - Đối tượng Request của Express
 * @param {import('express').Response} [res] - Đối tượng Response của Express
 * @returns {void}
 */
function destroySessionSafely(req, res) {
  if (res && res.locals) {
    res.locals.currentUser = null;
  }
  if (res && typeof res.clearCookie === 'function') {
    res.clearCookie('connect.sid');
  }
  if (!req || !req.session) {
    return;
  }
  delete req.session.user;
  if (typeof req.session.destroy === 'function') {
    req.session.destroy((err) => {
      if (err) {
        console.error('[AuthMiddleware] Lỗi khi hủy phiên đăng nhập (session):', err.message);
      }
    });
  }
}

/**
 * Trả về đường dẫn trang chủ mặc định tương ứng với vai trò (`role`) của người dùng.
 * - `'admin'`    -> `'/admin/dashboard'`
 * - `'staff'`    -> `'/staff/checkin'`
 * - `'customer'` -> `'/'` (mặc định)
 *
 * @param {string} [role] - Vai trò của người dùng (`'admin'`, `'staff'`, `'customer'`)
 * @returns {string} Đường dẫn điều hướng tương ứng
 */
function getRedirectUrlByRole(role) {
  const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (normalizedRole === 'admin') {
    return '/admin/dashboard';
  }
  if (normalizedRole === 'staff') {
    return '/staff/checkin';
  }
  return '/';
}

/**
 * Làm sạch chuỗi đầu vào: chuyển về kiểu chuỗi, loại bỏ các ký tự điều khiển nguy hiểm
 * (ASCII control characters) và cắt bỏ khoảng trắng thừa ở hai đầu (`.trim()`).
 *
 * @param {any} value - Giá trị đầu vào cần làm sạch
 * @returns {string} Chuỗi an toàn đã được cắt khoảng trắng (trả về `''` nếu `null` hoặc `undefined`)
 */
function cleanString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  // eslint-disable-next-line no-control-regex
  return String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Mã hóa các ký tự HTML đặc biệt (`&`, `<`, `>`, `"`, `'`) nhằm phòng chống tấn công XSS
 * khi hiển thị dữ liệu người dùng trực tiếp ra giao diện HTML.
 *
 * @param {any} value - Chuỗi hoặc giá trị cần mã hóa HTML
 * @returns {string} Chuỗi đã được mã hóa an toàn
 */
function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Kiểm tra định dạng địa chỉ email hợp lệ theo chuẩn thông dụng.
 *
 * @param {string} email - Địa chỉ email cần kiểm tra
 * @returns {boolean} `true` nếu đúng định dạng email, ngược lại `false`
 */
function isValidEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }
  const trimmed = email.trim();
  if (!trimmed) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Kiểm tra định dạng số điện thoại di động / cố định Việt Nam hợp lệ (10 chữ số, bắt đầu bằng số `0`).
 *
 * @param {string} phone - Số điện thoại cần kiểm tra
 * @returns {boolean} `true` nếu số điện thoại hợp lệ (10 số bắt đầu bằng `0`), ngược lại `false`
 */
function isValidVietnamPhone(phone) {
  if (typeof phone !== 'string') {
    return false;
  }
  const trimmed = phone.trim();
  if (!trimmed) {
    return false;
  }
  return /^(0[35789][0-9]{8}|0[0-9]{9})$/.test(trimmed);
}

/**
 * Hàm tiện ích gán thông báo Flash Message một lần (`successMsg` hoặc `errorMsg`) vào `req.session`.
 *
 * @param {import('express').Request} req - Đối tượng Request của Express
 * @param {'success'|'successMsg'|'error'|'danger'|'errorMsg'} type - Loại thông báo
 * @param {string} message - Nội dung thông báo tiếng Việt hiển thị cho người dùng
 * @returns {void}
 */
function setFlash(req, type, message) {
  if (!req || !req.session) {
    return;
  }
  const normalizedType = typeof type === 'string' ? type.trim() : '';
  if (normalizedType === 'success' || normalizedType === 'successMsg') {
    req.session.successMsg = message;
  } else if (
    normalizedType === 'error' ||
    normalizedType === 'danger' ||
    normalizedType === 'errorMsg'
  ) {
    req.session.errorMsg = message;
  }
}

/**
 * Tạo trang HTML Bootstrap 5 hoàn chỉnh cho lỗi **403 - Không có quyền truy cập**
 * khi người dùng truy cập vào khu vực vượt quá thẩm quyền của tài khoản hiện tại.
 *
 * @param {Object} user - Thông tin người dùng hiện tại từ `req.session.user`
 * @returns {string} Mã nguồn HTML trang 403 đã được chống XSS bằng `escapeHtml`
 */
function buildForbiddenPageHtml(user) {
  const safeName = escapeHtml(
    (user && (user.fullName || user.full_name || user.email)) || 'Người dùng'
  );
  const safeEmail = escapeHtml((user && user.email) || '');
  const rawRole = user && user.role ? String(user.role).trim().toLowerCase() : 'customer';

  const roleLabels = {
    admin: 'Quản trị viên (Admin)',
    staff: 'Nhân viên nhà xe (Staff)',
    customer: 'Khách hàng (Customer)',
  };
  const safeRoleLabel = escapeHtml(roleLabels[rawRole] || rawRole);
  const redirectUrl = escapeHtml(getRedirectUrlByRole(rawRole));

  let buttonLabel = 'Quay về Trang chủ';
  if (rawRole === 'admin') {
    buttonLabel = 'Về Bảng điều khiển Quản trị';
  } else if (rawRole === 'staff') {
    buttonLabel = 'Về Trang Soát vé Nhân viên';
  }

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>403 - Không có quyền truy cập | Hệ thống Đặt vé Xe khách</title>
  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
    rel="stylesheet"
  />
  <link
    href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
    rel="stylesheet"
  />
</head>
<body class="bg-light d-flex align-items-center min-vh-100 py-5">
  <div class="container">
    <div class="row justify-content-center">
      <div class="col-md-8 col-lg-6">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div class="card-body p-4 p-md-5 text-center">
            <div class="mb-3 text-danger">
              <i class="bi bi-shield-lock-fill" style="font-size: 4rem;"></i>
            </div>
            <h1 class="h3 fw-bold text-danger mb-3">403 - Không có quyền truy cập</h1>
            <p class="text-secondary mb-4">
              Xin lỗi, tài khoản của bạn không có quyền truy cập vào khu vực này.
            </p>
            <div class="bg-white border rounded-3 p-3 mb-4 text-start small">
              <div class="mb-1">
                <span class="text-muted">Tài khoản đang đăng nhập:</span>
                <strong class="text-dark">${safeName}</strong>
                ${safeEmail ? `<span class="text-muted">(${safeEmail})</span>` : ''}
              </div>
              <div>
                <span class="text-muted">Vai trò hiện tại:</span>
                <span class="badge bg-secondary">${safeRoleLabel}</span>
              </div>
            </div>
            <div class="d-flex flex-wrap gap-2 justify-content-center">
              <a href="${redirectUrl}" class="btn btn-primary px-4">
                <i class="bi bi-house-door-fill me-1"></i> ${escapeHtml(buttonLabel)}
              </a>
              <a href="/" class="btn btn-outline-secondary px-4">
                Trang chủ đặt vé
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Middleware toàn cục `checkAccountActive(req, res, next)` (Bí danh: `attachUserToLocals`):
 * - Khởi tạo các biến dùng chung cho tất cả giao diện EJS (`res.locals.currentUser`,
 *   `res.locals.successMsg`, `res.locals.errorMsg`) và xóa ngay Flash Message trong session.
 * - Nếu người dùng đang đăng nhập (`req.session.user.id`), truy vấn lại cơ sở dữ liệu qua
 *   `userModel.findById(req.session.user.id)` để lấy trạng thái mới nhất.
 * - Quy tắc bắt buộc: Nếu tài khoản không còn tồn tại hoặc vừa bị Quản trị viên khóa
 *   (`user.is_active === false`), lập tức hủy session (`req.session.destroy(...)`),
 *   trả về JSON 403 cho AJAX/API hoặc chuyển hướng về `/auth/login?locked=1` cho trang SSR.
 * - Nếu tài khoản đang hoạt động (`user.is_active === true`), đồng bộ lại `req.session.user`
 *   và `res.locals.currentUser` với dữ liệu mới nhất từ DB (bao gồm `role`, `fullName`, `isVerified`, ...).
 *
 * @param {import('express').Request} req - Đối tượng Request của Express
 * @param {import('express').Response} res - Đối tượng Response của Express
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp Middleware
 * @returns {Promise<any>}
 */
async function checkAccountActive(req, res, next) {
  if (req && req._accountActiveChecked) {
    return next();
  }
  if (req) {
    req._accountActiveChecked = true;
  }

  res.locals = res.locals || {};
  res.locals.currentUser = null;
  res.locals.successMsg = (req && req.session && req.session.successMsg) || null;
  res.locals.errorMsg = (req && req.session && req.session.errorMsg) || null;

  if (req && req.session) {
    delete req.session.successMsg;
    delete req.session.errorMsg;
  }

  if (!req.session || !req.session.user || !req.session.user.id) {
    return next();
  }

  try {
    const user = await userModel.findById(req.session.user.id);

    // Nếu tài khoản bị xóa hoặc bị Quản trị viên khóa trong lúc đang có phiên đăng nhập
    if (!user || user.is_active === false) {
      destroySessionSafely(req, res);

      if (isAjaxOrApiRequest(req)) {
        return res.status(403).json({
          success: false,
          message: 'Tài khoản của bạn đã bị Quản trị viên khóa.',
        });
      }

      return res.redirect('/auth/login?locked=1');
    }

    // Cập nhật lại session & res.locals với dữ liệu mới nhất từ PostgreSQL
    req.session.user = {
      id: user.id,
      fullName: user.full_name,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.is_verified,
      is_verified: user.is_verified,
      isActive: user.is_active,
      is_active: user.is_active,
    };

    res.locals.currentUser = req.session.user;
    return next();
  } catch (err) {
    console.error('[AuthMiddleware.checkAccountActive] Lỗi kiểm tra trạng thái tài khoản:', err.message);
    return next(err);
  }
}

/**
 * 2. Middleware `requireAuth(req, res, next)` (Bắt buộc đăng nhập):
 * - Nếu chưa đăng nhập (`!req.session || !req.session.user || !req.session.user.id`):
 *   + Với request AJAX/API: Trả về HTTP 401 kèm JSON thông báo tiếng Việt.
 *   + Với request SSR thông thường: Lưu URL đích vào `req.session.returnTo`, gán thông báo lỗi
 *     `req.session.errorMsg` và chuyển hướng về `/auth/login`.
 * - Kiểm tra bổ sung trường hợp tài khoản bị đánh dấu khóa trong session (`isActive === false`
 *   hoặc `is_active === false`): Hủy session và trả về 403 JSON hoặc chuyển hướng `/auth/login?locked=1`.
 *
 * @param {import('express').Request} req - Đối tượng Request của Express
 * @param {import('express').Response} res - Đối tượng Response của Express
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp Middleware
 * @returns {any}
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.id) {
    if (isAjaxOrApiRequest(req)) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để thực hiện chức năng này.',
      });
    }

    if (req.session) {
      req.session.returnTo = req.originalUrl;
      req.session.errorMsg = 'Vui lòng đăng nhập để tiếp tục.';
    }
    return res.redirect('/auth/login');
  }

  if (req.session.user.isActive === false || req.session.user.is_active === false) {
    destroySessionSafely(req, res);

    if (isAjaxOrApiRequest(req)) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị Quản trị viên khóa.',
      });
    }

    return res.redirect('/auth/login?locked=1');
  }

  return next();
}

/**
 * 3. Middleware `requireRole(...allowedRoles)` (Phân quyền RBAC 4 vai trò: `guest`, `customer`, `staff`, `admin`):
 * - Nhận danh sách các vai trò được phép truy cập, ví dụ:
 *   `requireRole('admin')`, `requireRole('staff', 'admin')`, `requireRole('customer', 'staff', 'admin')`.
 * - Bước 1: Kiểm tra đăng nhập. Nếu chưa đăng nhập -> trả về 401 JSON (AJAX/API) hoặc lưu `returnTo`,
 *   gán `errorMsg = 'Vui lòng đăng nhập để truy cập trang này.'` và redirect `/auth/login`.
 * - Bước 1b: Kiểm tra nhanh nếu tài khoản bị khóa -> hủy session, trả về 403 JSON hoặc redirect `/auth/login?locked=1`.
 * - Bước 2: Đối chiếu `req.session.user.role` với danh sách `allowedRoles`.
 * - Bước 3: Nếu không đủ quyền -> trả về HTTP 403 JSON (cho AJAX/API) hoặc trang HTML Bootstrap 5
 *   "403 - Không có quyền truy cập" kèm nút điều hướng thông minh về trang chủ theo vai trò.
 *
 * @param {...(string|Array<string>)} allowedRoles - Danh sách các vai trò được cấp quyền truy cập
 * @returns {import('express').RequestHandler} Middleware kiểm tra phân quyền của Express
 */
function requireRole(...allowedRoles) {
  const normalizedAllowedRoles = allowedRoles
    .flat(Infinity)
    .filter((role) => typeof role === 'string' && role.trim() !== '')
    .map((role) => role.trim().toLowerCase());

  return (req, res, next) => {
    // Bước 1: Kiểm tra người dùng đã đăng nhập hay chưa
    if (!req.session || !req.session.user || !req.session.user.id) {
      if (isAjaxOrApiRequest(req)) {
        return res.status(401).json({
          success: false,
          message: 'Vui lòng đăng nhập để thực hiện chức năng này.',
        });
      }

      if (req.session) {
        req.session.returnTo = req.originalUrl;
        req.session.errorMsg = 'Vui lòng đăng nhập để truy cập trang này.';
      }
      return res.redirect('/auth/login');
    }

    // Bước 1b: Kiểm tra trạng thái hoạt động của tài khoản trong session
    if (req.session.user.isActive === false || req.session.user.is_active === false) {
      destroySessionSafely(req, res);

      if (isAjaxOrApiRequest(req)) {
        return res.status(403).json({
          success: false,
          message: 'Tài khoản của bạn đã bị Quản trị viên khóa.',
        });
      }

      return res.redirect('/auth/login?locked=1');
    }

    // Bước 2 & 3: Kiểm tra vai trò (role) của người dùng
    const currentRole =
      typeof req.session.user.role === 'string'
        ? req.session.user.role.trim().toLowerCase()
        : '';

    if (!normalizedAllowedRoles.includes(currentRole)) {
      if (isAjaxOrApiRequest(req)) {
        return res.status(403).json({
          success: false,
          message: '403 - Không có quyền truy cập chức năng này.',
        });
      }

      return res.status(403).send(buildForbiddenPageHtml(req.session.user));
    }

    // Bước 4: Hợp lệ -> cho phép đi tiếp vào Controller
    return next();
  };
}

/**
 * 4. Middleware `redirectIfAuthenticated(req, res, next)` (Dùng cho `/auth/login` và `/auth/register`):
 * - Nếu người dùng đã đăng nhập (`req.session && req.session.user && req.session.user.id`),
 *   tự động chuyển hướng về trang chủ tương ứng với vai trò của họ:
 *   + `'admin'`    -> `'/admin/dashboard'`
 *   + `'staff'`    -> `'/staff/checkin'`
 *   + `'customer'` -> `'/'`
 * - Nếu là khách vãng lai (`guest` - chưa đăng nhập), gọi `next()` để hiển thị trang đăng nhập / đăng ký.
 *
 * @param {import('express').Request} req - Đối tượng Request của Express
 * @param {import('express').Response} res - Đối tượng Response của Express
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp Middleware
 * @returns {any}
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user && req.session.user.id) {
    if (req.session.user.isActive === false || req.session.user.is_active === false) {
      destroySessionSafely(req, res);
      return next();
    }
    const targetUrl = getRedirectUrlByRole(req.session.user.role);
    return res.redirect(targetUrl);
  }
  return next();
}

module.exports = {
  checkAccountActive,
  attachUserToLocals: checkAccountActive,
  requireAuth,
  requireRole,
  redirectIfAuthenticated,
  getRedirectUrlByRole,
  cleanString,
  escapeHtml,
  isValidEmail,
  isValidVietnamPhone,
  setFlash,
};
