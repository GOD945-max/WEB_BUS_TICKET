/**
 * @file src/controllers/auth.controller.js
 * @description [TV1 - Nhóm 1: Tài khoản, xác thực và bảo mật]
 * Bộ điều khiển (Controller) & Định tuyến tích hợp (`router`) xử lý toàn bộ nghiệp vụ:
 * - Phần A: Đăng ký tài khoản (`register`), Xác thực Email (`verifyEmail`),
 *   Đăng nhập phân quyền 3 vai trò (`login`), Đăng xuất (`logout`),
 *   Quên mật khẩu (`forgotPassword`) & Đặt lại mật khẩu mới (`resetPassword`).
 * - Phần B: Quản lý Hồ sơ cá nhân & Đổi mật khẩu (`showProfilePage`, `updateProfile`, `changePassword`),
 *   Lịch sử đặt vé & Hủy vé trực tuyến tuân thủ quy tắc 24 giờ (`showBookingHistoryPage`, `cancelMyBooking`),
 *   Quản trị người dùng & Phân quyền RBAC (`listUsers`, `toggleUserActive`, `updateUserRole`).
 *
 * ============================================================================
 * HƯỚNG DẪN TÍCH HỢP VÀO `src/app.js` (DÀNH CHO TV2 - NHÓM 2):
 * ============================================================================
 * Cách 1 (Khuyên dùng - Gắn trực tiếp `authController.router` đã cấu hình đầy đủ RBAC):
 * ```js
 * const authController = require('./controllers/auth.controller');
 * app.use('/', authController.router);
 * ```
 * Cách 2 (Gọi trực tiếp từng hàm xử lý hoặc bí danh tương thích sẵn có trong `src/app.js`):
 * `renderLogin`, `renderRegister`, `renderForgotPassword`, `renderProfile`,
 * `renderBookingHistory`, `listUsersAdmin`, ...
 */

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ejs = require('ejs');
const userModel = require('../models/user.model');
const {
  checkAccountActive,
  requireAuth,
  requireRole,
  redirectIfAuthenticated,
  cleanString,
  isValidEmail,
  isValidVietnamPhone,
  getRedirectUrlByRole,
  setFlash,
} = require('../middlewares/auth.middleware');

/** Số vòng băm mật khẩu tiêu chuẩn của bcryptjs */
const SALT_ROUNDS = 10;

/** Danh sách các vai trò hợp lệ trong hệ thống */
const VALID_ROLES = ['customer', 'staff', 'admin'];

/**
 * Tạo đối tượng Express Router (kèm cơ chế fallback an toàn khi chạy kiểm thử đơn vị độc lập).
 *
 * @returns {import('express').Router}
 */
function createExpressRouter() {
  try {
    // eslint-disable-next-line global-require
    const express = require('express');
    if (express && typeof express.Router === 'function') {
      return express.Router();
    }
  } catch (_) {
    // Fallback nhẹ phục vụ môi trường kiểm thử đơn vị không cài đặt sẵn node_modules/express
  }

  const fallbackRouter = function fallbackRouterMiddleware(req, res, next) {
    if (typeof next === 'function') {
      next();
    }
  };
  fallbackRouter.stack = [];
  fallbackRouter.use = function use(...fns) {
    fallbackRouter.stack.push({ type: 'middleware', handlers: fns });
    return fallbackRouter;
  };
  ['get', 'post', 'put', 'patch', 'delete'].forEach((method) => {
    fallbackRouter[method] = function registerRoute(routePath, ...handlers) {
      fallbackRouter.stack.push({
        route: {
          path: routePath,
          methods: { [method]: true },
          stack: handlers.map((h) => ({ handle: h, method })),
        },
      });
      return fallbackRouter;
    };
  });
  return fallbackRouter;
}

/**
 * Kiểm tra xem request hiện tại có phải là yêu cầu AJAX / Fetch JSON hay không.
 *
 * @param {import('express').Request} req - Đối tượng Request của Express
 * @returns {boolean} `true` nếu client yêu cầu phản hồi dạng JSON
 */
function isAjaxOrJsonRequest(req) {
  if (!req) {
    return false;
  }
  const url = req.originalUrl || req.url || '';
  const acceptHeader =
    req.headers && typeof req.headers.accept === 'string' ? req.headers.accept : '';
  const contentTypeHeader =
    req.headers && typeof req.headers['content-type'] === 'string'
      ? req.headers['content-type']
      : '';

  return Boolean(
    req.xhr ||
      (typeof url === 'string' && url.startsWith('/api/')) ||
      acceptHeader.includes('application/json') ||
      contentTypeHeader.includes('application/json')
  );
}

/**
 * Lấy đường dẫn gốc (Base URL) của ứng dụng từ biến môi trường `APP_URL`
 * hoặc tự động suy ra từ `req.protocol` và `req.get('host')`.
 *
 * @param {import('express').Request} req - Đối tượng Request của Express
 * @returns {string} Chuỗi Base URL không có dấu `/` ở cuối (VD: `http://localhost:3000`)
 */
function getBaseUrl(req) {
  const protocol = (req && req.protocol) || 'http';
  const host =
    (req && typeof req.get === 'function' && req.get('host')) ||
    (req && req.headers && req.headers.host) ||
    `localhost:${process.env.PORT || 3000}`;

  return (process.env.APP_URL || `${protocol}://${host}`).replace(/\/+$/, '');
}

/**
 * Đọc và tiêu thụ (xóa một lần) thông báo Flash Message (`errorMsg`, `successMsg`)
 * từ `res.locals` (khi đã gắn `checkAccountActive`) hoặc trực tiếp từ `req.session`
 * (đảm bảo hoạt động hoàn hảo ngay cả khi `src/app.js` chưa gắn middleware toàn cục).
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @returns {{ error: string|null, success: string|null }}
 */
function consumeFlashMessages(req, res) {
  const locals = (res && res.locals) || {};
  const error = locals.errorMsg || (req && req.session && req.session.errorMsg) || null;
  const success = locals.successMsg || (req && req.session && req.session.successMsg) || null;

  if (req && req.session) {
    delete req.session.errorMsg;
    delete req.session.successMsg;
  }
  if (res && res.locals) {
    res.locals.errorMsg = error;
    res.locals.successMsg = success;
  }

  return { error, success };
}

/**
 * In đường dẫn xác thực email hoặc đặt lại mật khẩu ra cửa sổ Terminal (Docker logs)
 * trong khung viền nổi bật, đồng thời render mẫu `src/views/emails/verify-email.ejs`
 * và gửi email qua `src/config/mailer.js` bên trong khối `try...catch` an toàn.
 *
 * @param {Object} options - Thông tin gửi email xác thực / khôi phục mật khẩu
 * @param {'verify'|'reset'} options.type - Loại email (`'verify'` hoặc `'reset'`)
 * @param {string} options.fullName - Họ và tên người nhận
 * @param {string} options.email - Địa chỉ email người nhận
 * @param {string} options.actionUrl - Đường dẫn đầy đủ để người dùng bấm vào
 * @param {string} options.subject - Tiêu đề email
 * @returns {Promise<void>}
 */
async function sendAuthEmailSafely({ type, fullName, email, actionUrl, subject }) {
  const bannerTitle =
    type === 'reset'
      ? '[AUTH DEMO LINK] ĐẶT LẠI MẬT KHẨU (RESET PASSWORD)'
      : '[AUTH DEMO LINK] XÁC THỰC TÀI KHOẢN EMAIL (VERIFY EMAIL)';

  // Luôn in đường link ra console.log để Giảng viên / TV1 có thể click trực tiếp khi demo độc lập
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║ ${bannerTitle.padEnd(76, ' ')} ║`);
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║ Họ và tên : ${String(fullName || 'Quý khách').padEnd(64, ' ')} ║`);
  console.log(`║ Email     : ${String(email || '').padEnd(64, ' ')} ║`);
  console.log(`║ Link      : ${String(actionUrl || '')}`);
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const emailTemplatePath = path.join(__dirname, '../views/emails/verify-email.ejs');
  let htmlContent = '';

  try {
    htmlContent = await ejs.renderFile(emailTemplatePath, {
      type,
      fullName,
      email,
      actionUrl,
    });
  } catch (renderErr) {
    console.warn(
      '[AuthController] Không thể render verify-email.ejs, sử dụng mẫu HTML dự phòng:',
      renderErr.message
    );
    htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1e3a8a;">${
          type === 'reset' ? 'Đặt lại mật khẩu mới' : 'Xác thực tài khoản đặt vé xe khách'
        }</h2>
        <p>Xin chào <strong>${fullName || email}</strong>,</p>
        <p>Vui lòng bấm vào đường dẫn bên dưới để tiếp tục:</p>
        <p><a href="${actionUrl}" style="color: #ea580c; font-weight: bold;">${actionUrl}</a></p>
      </div>
    `;
  }

  try {
    // eslint-disable-next-line global-require
    const mailer = require('../config/mailer');
    if (mailer && typeof mailer.sendMail === 'function') {
      await mailer.sendMail({
        to: email,
        subject,
        html: htmlContent,
      });
    }
  } catch (mailErr) {
    console.warn(
      `[AuthController] Không gửi được email SMTP tới "${email}" (đã in link xác thực ra console):`,
      mailErr.message
    );
  }
}

// ============================================================================
// PHẦN A: ĐĂNG KÝ, XÁC THỰC EMAIL, ĐĂNG NHẬP, ĐĂNG XUẤT, QUÊN & ĐẶT LẠI MẬT KHẨU
// ============================================================================

/**
 * 1a. Hiển thị giao diện Đăng ký tài khoản (`GET /auth/register`).
 * Bí danh tương thích ngược với `src/app.js`: `renderRegister`.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @returns {void}
 */
function showRegisterPage(req, res) {
  const { error, success } = consumeFlashMessages(req, res);
  return res.render('auth/register', {
    title: 'Đăng ký tài khoản',
    error,
    success,
    oldInput: {},
  });
}

/**
 * 1b. Xử lý biểu mẫu Đăng ký tài khoản khách hàng mới (`POST /auth/register`).
 * - Chuẩn hóa và kiểm tra dữ liệu đầu vào (`fullName`, `email`, `phone`, `password`, `confirmPassword`).
 * - Kiểm tra trùng lặp email qua `userModel.findByEmail(email)`.
 * - Băm mật khẩu với `bcryptjs` (`SALT_ROUNDS = 10`) và sinh `verifyToken` ngẫu nhiên 32 bytes hex.
 * - Lưu tài khoản mới (`is_verified = FALSE`, `is_active = TRUE`, `role = 'customer'`).
 * - Render email `verify-email.ejs`, in đường dẫn xác thực ra `console.log` và gửi qua `mailer.sendMail`.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function register(req, res, next) {
  try {
    const body = req.body || {};
    const fullName = cleanString(body.fullName || body.full_name);
    const email = cleanString(body.email).toLowerCase();
    const phone = cleanString(body.phone);
    const password = body.password || '';
    const confirmPassword = body.confirmPassword || body.confirm_password || '';

    const oldInput = { fullName, email, phone };

    // 1. Kiểm tra Họ và tên (tối thiểu 2 ký tự)
    if (!fullName || fullName.length < 2) {
      return res.status(400).render('auth/register', {
        title: 'Đăng ký tài khoản',
        error: 'Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự).',
        success: null,
        oldInput,
      });
    }

    // 2. Kiểm tra định dạng Email
    if (!isValidEmail(email)) {
      return res.status(400).render('auth/register', {
        title: 'Đăng ký tài khoản',
        error: 'Vui lòng nhập địa chỉ email hợp lệ.',
        success: null,
        oldInput,
      });
    }

    // 3. Kiểm tra Số điện thoại Việt Nam (10 chữ số, bắt đầu bằng 0)
    if (!isValidVietnamPhone(phone)) {
      return res.status(400).render('auth/register', {
        title: 'Đăng ký tài khoản',
        error: 'Số điện thoại không hợp lệ (phải gồm 10 chữ số và bắt đầu bằng số 0).',
        success: null,
        oldInput,
      });
    }

    // 4. Kiểm tra độ dài mật khẩu (tối thiểu 6 ký tự)
    if (!password || password.length < 6) {
      return res.status(400).render('auth/register', {
        title: 'Đăng ký tài khoản',
        error: 'Mật khẩu phải có tối thiểu 6 ký tự.',
        success: null,
        oldInput,
      });
    }

    // 5. Kiểm tra mật khẩu xác nhận trùng khớp
    if (password !== confirmPassword) {
      return res.status(400).render('auth/register', {
        title: 'Đăng ký tài khoản',
        error: 'Mật khẩu xác nhận không khớp với mật khẩu đã nhập.',
        success: null,
        oldInput,
      });
    }

    // 6. Kiểm tra trùng lặp địa chỉ email trong CSDL
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).render('auth/register', {
        title: 'Đăng ký tài khoản',
        error: 'Email này đã được đăng ký. Vui lòng sử dụng email khác hoặc đăng nhập.',
        success: null,
        oldInput,
      });
    }

    // 7. Băm mật khẩu & sinh mã xác thực email (verify_token)
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const verifyToken = crypto.randomBytes(32).toString('hex');

    // 8. Lưu tài khoản mới vào PostgreSQL
    await userModel.create({
      fullName,
      email,
      phone,
      passwordHash,
      verifyToken,
    });

    // 9. Tạo đường dẫn xác thực đầy đủ & gửi email xác thực
    const baseUrl = getBaseUrl(req);
    const verifyUrl = `${baseUrl}/auth/verify?token=${verifyToken}`;

    await sendAuthEmailSafely({
      type: 'verify',
      fullName,
      email,
      actionUrl: verifyUrl,
      subject: '[BusTicket] Xác thực tài khoản đặt vé xe khách của bạn',
    });

    // 10. Đặt thông báo thành công vào session và chuyển hướng về trang đăng nhập
    const successMessage =
      'Đăng ký tài khoản thành công! Vui lòng kiểm tra email và bấm vào đường link xác thực để kích hoạt tài khoản trước khi đăng nhập.';
    if (req.session) {
      req.session.successMsg = successMessage;
    }
    setFlash(req, 'success', successMessage);

    return res.redirect('/auth/login');
  } catch (err) {
    console.error('[AuthController.register] Lỗi khi đăng ký tài khoản:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.status(500).render('auth/register', {
      title: 'Đăng ký tài khoản',
      error: 'Đã xảy ra lỗi hệ thống khi đăng ký tài khoản. Vui lòng thử lại sau.',
      success: null,
      oldInput: {},
    });
  }
}

/**
 * 2. Xác thực tài khoản qua đường dẫn email (`GET /auth/verify?token=...`).
 * - Kích hoạt `is_verified = TRUE` và xóa `verify_token = NULL` trong CSDL.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function verifyEmail(req, res, next) {
  try {
    const token = cleanString(req.query && req.query.token);

    if (!token) {
      const invalidLinkMsg = 'Đường dẫn xác thực không hợp lệ.';
      if (req.session) {
        req.session.errorMsg = invalidLinkMsg;
      }
      setFlash(req, 'error', invalidLinkMsg);
      return res.redirect('/auth/login');
    }

    const verifiedUser = await userModel.verifyEmailByToken(token);
    if (!verifiedUser) {
      const invalidTokenMsg = 'Mã xác thực không hợp lệ hoặc tài khoản đã được kích hoạt trước đó.';
      if (req.session) {
        req.session.errorMsg = invalidTokenMsg;
      }
      setFlash(req, 'error', invalidTokenMsg);
      return res.redirect('/auth/login');
    }

    const successMsg = 'Xác thực email thành công! Bạn có thể đăng nhập ngay bây giờ.';
    if (req.session) {
      req.session.successMsg = successMsg;
    }
    setFlash(req, 'success', successMsg);
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('[AuthController.verifyEmail] Lỗi khi xác thực email:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/auth/login');
  }
}

/**
 * 3a. Hiển thị giao diện Đăng nhập (`GET /auth/login`).
 * Bí danh tương thích ngược với `src/app.js`: `renderLogin`.
 * - Nếu trên URL có `?locked=1`, hiển thị cảnh báo tài khoản đã bị Quản trị viên khóa.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @returns {void}
 */
function showLoginPage(req, res) {
  const { error: flashError, success } = consumeFlashMessages(req, res);
  const isLockedRedirect = req.query && req.query.locked === '1';
  const error = isLockedRedirect
    ? 'Tài khoản của bạn đã bị Quản trị viên khóa. Vui lòng liên hệ nhà xe để được hỗ trợ.'
    : flashError;

  return res.render('auth/login', {
    title: 'Đăng nhập',
    error,
    success,
    oldInput: {},
  });
}

/**
 * 3b. Xử lý Đăng nhập hệ thống và điều hướng tự động theo 3 vai trò (`POST /auth/login`).
 * - Kiểm tra thông tin đăng nhập (`email`, `password`).
 * - Bắt buộc kiểm tra `user.is_verified === true` (đã xác thực email).
 * - Bắt buộc kiểm tra `user.is_active === true` (không bị Quản trị viên khóa).
 * - Lưu thông tin an toàn vào `req.session.user` (không lưu `password_hash`, `verify_token`, `reset_token`).
 * - Tự động chuyển hướng:
 *   + `'admin'`    -> `'/admin/dashboard'`
 *   + `'staff'`    -> `'/staff/checkin'`
 *   + `'customer'` -> `req.session.returnTo` (nếu hợp lệ) hoặc `'/'`
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function login(req, res, next) {
  try {
    const body = req.body || {};
    const email = cleanString(body.email).toLowerCase();
    const password = body.password || '';

    if (!email || !password) {
      return res.status(400).render('auth/login', {
        title: 'Đăng nhập',
        error: 'Vui lòng nhập đầy đủ email và mật khẩu.',
        success: null,
        oldInput: { email },
      });
    }

    const user = await userModel.findByEmail(email);
    const isPasswordValid =
      user && user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !isPasswordValid) {
      return res.status(401).render('auth/login', {
        title: 'Đăng nhập',
        error: 'Email hoặc mật khẩu không chính xác.',
        success: null,
        oldInput: { email },
      });
    }

    // Kiểm tra bắt buộc 1: Tài khoản phải được xác thực email trước khi đăng nhập
    if (!user.is_verified) {
      return res.status(403).render('auth/login', {
        title: 'Đăng nhập',
        error:
          'Tài khoản của bạn chưa được xác thực email. Vui lòng kiểm tra hộp thư (hoặc console log) và bấm vào link xác thực trước khi đăng nhập.',
        success: null,
        oldInput: { email },
      });
    }

    // Kiểm tra bắt buộc 2: Tài khoản không bị khóa bởi Quản trị viên
    if (!user.is_active) {
      return res.status(403).render('auth/login', {
        title: 'Đăng nhập',
        error:
          'Tài khoản của bạn đã bị khóa bởi Quản trị viên. Bạn không thể đăng nhập vào hệ thống.',
        success: null,
        oldInput: { email },
      });
    }

    // Lưu thông tin tài khoản vào phiên đăng nhập (Tuyệt đối không lưu password_hash, verify_token, reset_token)
    if (req.session) {
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
    }

    // Điều hướng tự động theo vai trò (3 roles: admin, staff, customer)
    if (user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }

    if (user.role === 'staff') {
      return res.redirect('/staff/checkin');
    }

    // Khách hàng (customer): kiểm tra returnTo hợp lệ trước khi về trang chủ '/'
    const returnTo = req.session && req.session.returnTo;
    if (req.session) {
      delete req.session.returnTo;
    }

    if (
      typeof returnTo === 'string' &&
      returnTo.startsWith('/') &&
      !returnTo.startsWith('//') &&
      !returnTo.startsWith('/\\') &&
      !returnTo.startsWith('/admin') &&
      !returnTo.startsWith('/staff')
    ) {
      return res.redirect(returnTo);
    }

    return res.redirect(getRedirectUrlByRole(user.role));
  } catch (err) {
    console.error('[AuthController.login] Lỗi khi đăng nhập:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.status(500).render('auth/login', {
      title: 'Đăng nhập',
      error: 'Đã xảy ra lỗi hệ thống khi đăng nhập. Vui lòng thử lại sau.',
      success: null,
      oldInput: {},
    });
  }
}

/**
 * 4. Đăng xuất khỏi hệ thống (`POST /auth/logout` & `GET /auth/logout`).
 * - Hủy `req.session`, xóa cookie `connect.sid` và chuyển hướng về trang chủ `'/'`.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @returns {any}
 */
function logout(req, res) {
  if (res && res.locals) {
    res.locals.currentUser = null;
  }
  if (!req.session || typeof req.session.destroy !== 'function') {
    if (typeof res.clearCookie === 'function') {
      res.clearCookie('connect.sid');
    }
    return res.redirect('/');
  }

  return req.session.destroy(() => {
    if (typeof res.clearCookie === 'function') {
      res.clearCookie('connect.sid');
    }
    return res.redirect('/');
  });
}

/**
 * 5a. Hiển thị giao diện Quên mật khẩu / Đặt lại mật khẩu mới (`GET /auth/forgot-password`).
 * Bí danh tương thích ngược với `src/app.js`: `renderForgotPassword`.
 * - Nếu có `?token=...` trên URL, hiển thị biểu mẫu nhập mật khẩu mới.
 * - Nếu không có `token`, hiển thị biểu mẫu nhập email nhận link khôi phục.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @returns {void}
 */
function showForgotPasswordPage(req, res) {
  const { error, success } = consumeFlashMessages(req, res);
  const token = cleanString(req.query && req.query.token);

  return res.render('auth/forgot-password', {
    title: token ? 'Đặt lại mật khẩu mới' : 'Quên mật khẩu',
    token,
    error,
    success,
    oldInput: {},
  });
}

/**
 * 5b. Xử lý yêu cầu gửi đường dẫn khôi phục mật khẩu (`POST /auth/forgot-password`).
 * - Kiểm tra định dạng email và sự tồn tại của tài khoản.
 * - Từ chối nếu tài khoản đang bị khóa (`!user.is_active`).
 * - Sinh mã `resetToken` 32 bytes hex, lưu vào DB qua `userModel.saveResetToken(email, resetToken)`.
 * - Render `verify-email.ejs` với `type: 'reset'`, in đường dẫn ra `console.log` và gửi email.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function forgotPassword(req, res, next) {
  try {
    const email = cleanString(req.body && req.body.email).toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).render('auth/forgot-password', {
        title: 'Quên mật khẩu',
        token: '',
        error: 'Vui lòng nhập địa chỉ email hợp lệ.',
        success: null,
        oldInput: { email },
      });
    }

    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(404).render('auth/forgot-password', {
        title: 'Quên mật khẩu',
        token: '',
        error: 'Không tìm thấy tài khoản nào đăng ký với địa chỉ email này.',
        success: null,
        oldInput: { email },
      });
    }

    if (!user.is_active) {
      return res.status(403).render('auth/forgot-password', {
        title: 'Quên mật khẩu',
        token: '',
        error: 'Tài khoản này đã bị khóa bởi Quản trị viên.',
        success: null,
        oldInput: { email },
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await userModel.saveResetToken(email, resetToken);

    const baseUrl = getBaseUrl(req);
    const resetUrl = `${baseUrl}/auth/forgot-password?token=${resetToken}`;

    await sendAuthEmailSafely({
      type: 'reset',
      fullName: user.full_name,
      email,
      actionUrl: resetUrl,
      subject: '[BusTicket] Yêu cầu đặt lại mật khẩu tài khoản của bạn',
    });

    return res.render('auth/forgot-password', {
      title: 'Quên mật khẩu',
      token: '',
      error: null,
      success:
        'Đường dẫn đặt lại mật khẩu đã được gửi tới email của bạn. Vui lòng kiểm tra hộp thư.',
      oldInput: {},
    });
  } catch (err) {
    console.error('[AuthController.forgotPassword] Lỗi khi xử lý quên mật khẩu:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.status(500).render('auth/forgot-password', {
      title: 'Quên mật khẩu',
      token: '',
      error: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      success: null,
      oldInput: {},
    });
  }
}

/**
 * 5c. Đặt lại mật khẩu mới bằng `reset_token` (`POST /auth/reset-password`).
 * - Kiểm tra `token`, độ dài mật khẩu mới (>= 6 ký tự) và xác nhận mật khẩu.
 * - Băm mật khẩu mới bằng `bcryptjs` (`SALT_ROUNDS = 10`).
 * - Cập nhật mật khẩu qua `userModel.resetPasswordByToken(token, newPasswordHash)`.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function resetPassword(req, res, next) {
  try {
    const body = req.body || {};
    const token = cleanString(body.token || (req.query && req.query.token));
    const password = body.newPassword || body.password || '';
    const confirmPassword = body.confirmPassword || body.confirm_password || '';

    if (!token) {
      return res.status(400).render('auth/forgot-password', {
        title: 'Quên mật khẩu',
        token: '',
        error: 'Mã khôi phục mật khẩu không hợp lệ hoặc bị thiếu.',
        success: null,
        oldInput: {},
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).render('auth/forgot-password', {
        title: 'Đặt lại mật khẩu mới',
        token,
        error: 'Mật khẩu mới phải có tối thiểu 6 ký tự.',
        success: null,
        oldInput: {},
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).render('auth/forgot-password', {
        title: 'Đặt lại mật khẩu mới',
        token,
        error: 'Mật khẩu xác nhận không khớp với mật khẩu mới.',
        success: null,
        oldInput: {},
      });
    }

    const newPasswordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const updatedUser = await userModel.resetPasswordByToken(token, newPasswordHash);

    if (!updatedUser) {
      return res.status(400).render('auth/forgot-password', {
        title: 'Quên mật khẩu',
        token: '',
        error: 'Mã khôi phục mật khẩu không hợp lệ hoặc đã hết hạn.',
        success: null,
        oldInput: {},
      });
    }

    const successMsg = 'Đặt lại mật khẩu mới thành công! Vui lòng đăng nhập bằng mật khẩu mới.';
    if (req.session) {
      req.session.successMsg = successMsg;
    }
    setFlash(req, 'success', successMsg);

    return res.redirect('/auth/login');
  } catch (err) {
    console.error('[AuthController.resetPassword] Lỗi khi đặt lại mật khẩu:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.status(500).render('auth/forgot-password', {
      title: 'Quên mật khẩu',
      token: '',
      error: 'Đã xảy ra lỗi hệ thống khi đặt lại mật khẩu. Vui lòng thử lại sau.',
      success: null,
      oldInput: {},
    });
  }
}

// ============================================================================
// PHẦN B: HỒ SƠ CÁ NHÂN, LỊCH SỬ ĐẶT VÉ & QUẢN TRỊ NGƯỜI DÙNG (ADMIN USERS)
// ============================================================================

/**
 * 6a. Hiển thị trang Hồ sơ cá nhân của người dùng đang đăng nhập (`GET /auth/profile`).
 * Bí danh tương thích ngược với `src/app.js`: `renderProfile`.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function showProfilePage(req, res, next) {
  try {
    const { error, success } = consumeFlashMessages(req, res);
    const sessionUser = req.session && req.session.user;

    if (!sessionUser || !sessionUser.id) {
      if (req.session) {
        req.session.returnTo = req.originalUrl || '/auth/profile';
        req.session.errorMsg = 'Vui lòng đăng nhập để xem hồ sơ cá nhân.';
      }
      return res.redirect('/auth/login');
    }

    const user = await userModel.findById(sessionUser.id);
    if (!user || user.is_active === false) {
      if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy(() => {});
      }
      return res.redirect('/auth/login?locked=1');
    }

    // Đồng bộ lại thông tin mới nhất vào session & res.locals
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
    if (res.locals) {
      res.locals.currentUser = req.session.user;
    }

    return res.render('auth/profile', {
      title: 'Hồ sơ cá nhân',
      user,
      profileUser: user,
      error,
      success,
    });
  } catch (err) {
    console.error('[AuthController.showProfilePage] Lỗi tải trang hồ sơ cá nhân:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/');
  }
}

/**
 * Hàm nội bộ xử lý nghiệp vụ Đổi mật khẩu trên trang Hồ sơ cá nhân.
 * Được gọi khi `POST /auth/profile` có `actionType = 'change_password'` (hoặc chứa `currentPassword`/`newPassword`)
 * và khi gọi trực tiếp `POST /auth/change-password`.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function handlePasswordChangeFlow(req, res, next) {
  try {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || !sessionUser.id) {
      if (isAjaxOrJsonRequest(req)) {
        return res.status(401).json({
          success: false,
          message: 'Vui lòng đăng nhập để đổi mật khẩu.',
        });
      }
      return res.redirect('/auth/login');
    }

    const body = req.body || {};
    const currentPassword =
      body.currentPassword || body.current_password || body.oldPassword || '';
    const newPassword = body.newPassword || body.new_password || body.password || '';
    const confirmNewPassword =
      body.confirmNewPassword ||
      body.confirmPassword ||
      body.confirm_new_password ||
      body.confirm_password ||
      '';

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      const missingMsg = 'Vui lòng nhập đầy đủ mật khẩu hiện tại, mật khẩu mới và xác nhận mật khẩu.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: missingMsg });
      }
      if (req.session) {
        req.session.errorMsg = missingMsg;
      }
      setFlash(req, 'error', missingMsg);
      return res.redirect('/auth/profile');
    }

    if (newPassword.length < 6) {
      const shortMsg = 'Mật khẩu mới phải có tối thiểu 6 ký tự.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: shortMsg });
      }
      if (req.session) {
        req.session.errorMsg = shortMsg;
      }
      setFlash(req, 'error', shortMsg);
      return res.redirect('/auth/profile');
    }

    if (newPassword !== confirmNewPassword) {
      const mismatchMsg = 'Mật khẩu xác nhận không khớp với mật khẩu mới.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: mismatchMsg });
      }
      if (req.session) {
        req.session.errorMsg = mismatchMsg;
      }
      setFlash(req, 'error', mismatchMsg);
      return res.redirect('/auth/profile');
    }

    // Lấy bản ghi đầy đủ có password_hash qua findByEmail (hoặc fallback findByIdWithPassword)
    const userWithHash =
      (sessionUser.email && (await userModel.findByEmail(sessionUser.email))) ||
      (await userModel.findByIdWithPassword(sessionUser.id));

    if (!userWithHash || !userWithHash.password_hash) {
      const notFoundMsg = 'Không tìm thấy thông tin tài khoản người dùng.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(404).json({ success: false, message: notFoundMsg });
      }
      if (req.session) {
        req.session.errorMsg = notFoundMsg;
      }
      setFlash(req, 'error', notFoundMsg);
      return res.redirect('/auth/profile');
    }

    const isMatch = await bcrypt.compare(currentPassword || '', userWithHash.password_hash);
    if (!isMatch) {
      const wrongCurrentMsg = 'Mật khẩu hiện tại không chính xác.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: wrongCurrentMsg });
      }
      if (req.session) {
        req.session.errorMsg = wrongCurrentMsg;
      }
      setFlash(req, 'error', wrongCurrentMsg);
      return res.redirect('/auth/profile');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userModel.updatePassword(sessionUser.id, newPasswordHash);

    const successMsg = 'Đổi mật khẩu thành công!';
    if (isAjaxOrJsonRequest(req)) {
      return res.json({ success: true, message: successMsg });
    }

    if (req.session) {
      req.session.successMsg = successMsg;
    }
    setFlash(req, 'success', successMsg);
    return res.redirect('/auth/profile');
  } catch (err) {
    console.error('[AuthController.changePassword] Lỗi khi đổi mật khẩu:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/auth/profile');
  }
}

/**
 * 6b. Xử lý biểu mẫu trên trang Hồ sơ cá nhân (`POST /auth/profile`).
 * Hỗ trợ đồng thời cả 2 trường hợp gửi form từ `profile.ejs`:
 * - Trường hợp 1: Đổi mật khẩu (`actionType === 'change_password'` hoặc có `currentPassword`/`newPassword`).
 * - Trường hợp 2: Cập nhật thông tin Họ và tên (`fullName`) & Số điện thoại (`phone`).
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function updateProfile(req, res, next) {
  try {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || !sessionUser.id) {
      if (isAjaxOrJsonRequest(req)) {
        return res.status(401).json({
          success: false,
          message: 'Vui lòng đăng nhập để cập nhật hồ sơ.',
        });
      }
      return res.redirect('/auth/login');
    }

    const body = req.body || {};
    const isPasswordChange =
      body.actionType === 'change_password' ||
      body.formType === 'change_password' ||
      Boolean(
        body.currentPassword ||
          body.newPassword ||
          body.current_password ||
          body.new_password
      );

    // Trường hợp 1: Người dùng gửi biểu mẫu Đổi mật khẩu
    if (isPasswordChange) {
      return await handlePasswordChangeFlow(req, res, next);
    }

    // Trường hợp 2: Người dùng cập nhật Họ tên & Số điện thoại
    const fullName = cleanString(body.fullName || body.full_name);
    const phone = cleanString(body.phone);

    let validationError = null;
    if (!fullName || fullName.length < 2) {
      validationError = 'Họ và tên phải có tối thiểu 2 ký tự.';
    } else if (!isValidVietnamPhone(phone)) {
      validationError = 'Số điện thoại không hợp lệ (phải gồm 10 chữ số và bắt đầu bằng số 0).';
    }

    if (validationError) {
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: validationError });
      }
      if (req.session) {
        req.session.errorMsg = validationError;
      }
      setFlash(req, 'error', validationError);
      return res.redirect('/auth/profile');
    }

    const updated = await userModel.updateProfile(sessionUser.id, { fullName, phone });
    if (!updated) {
      const notFoundMsg = 'Không tìm thấy tài khoản người dùng.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(404).json({ success: false, message: notFoundMsg });
      }
      if (req.session) {
        req.session.errorMsg = notFoundMsg;
      }
      setFlash(req, 'error', notFoundMsg);
      return res.redirect('/auth/profile');
    }

    // Cập nhật lại session với tên và số điện thoại mới
    req.session.user = {
      ...req.session.user,
      fullName: updated.full_name,
      full_name: updated.full_name,
      phone: updated.phone,
    };
    if (res.locals) {
      res.locals.currentUser = req.session.user;
    }

    const successMsg = 'Cập nhật thông tin hồ sơ thành công!';
    if (isAjaxOrJsonRequest(req)) {
      return res.json({
        success: true,
        message: successMsg,
        user: updated,
      });
    }

    if (req.session) {
      req.session.successMsg = successMsg;
    }
    setFlash(req, 'success', successMsg);
    return res.redirect('/auth/profile');
  } catch (err) {
    console.error('[AuthController.updateProfile] Lỗi khi cập nhật hồ sơ:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/auth/profile');
  }
}

/**
 * 6c. Đổi mật khẩu dành cho người dùng đang đăng nhập (`POST /auth/change-password`).
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function changePassword(req, res, next) {
  return handlePasswordChangeFlow(req, res, next);
}

/**
 * 7a. Hiển thị trang Lịch sử đặt vé của khách hàng (`GET /auth/booking-history`).
 * Bí danh tương thích ngược với `src/app.js`: `renderBookingHistory`.
 * - Gọi `userModel.getBookingHistoryByUserId(req.session.user.id)`.
 * - Tính toán chính xác `hoursUntilDeparture` và cờ `canCancel` cho từng đơn đặt vé:
 *   + Cho phép hủy (`canCancel = true`) khi:
 *     - `b.status === 'pending'` (đơn đang chờ thanh toán), HOẶC
 *     - `b.status === 'paid' && hoursUntilDeparture >= 24` (đã thanh toán và trước giờ khởi hành >= 24 giờ).
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function showBookingHistoryPage(req, res, next) {
  try {
    const { error, success } = consumeFlashMessages(req, res);
    const sessionUser = req.session && req.session.user;

    if (!sessionUser || !sessionUser.id) {
      if (req.session) {
        req.session.returnTo = req.originalUrl || '/auth/booking-history';
        req.session.errorMsg = 'Vui lòng đăng nhập để xem lịch sử đặt vé.';
      }
      return res.redirect('/auth/login');
    }

    const rawBookings = (await userModel.getBookingHistoryByUserId(sessionUser.id)) || [];

    const allBookings = rawBookings.map((b) => {
      const hoursUntilDeparture =
        (new Date(b.departure_time).getTime() - Date.now()) / (1000 * 60 * 60);
      const canCancel =
        b.status === 'pending' || (b.status === 'paid' && hoursUntilDeparture >= 24);

      return {
        ...b,
        hoursUntilDeparture,
        hours_until_departure: hoursUntilDeparture,
        canCancel,
        can_cancel: canCancel,
      };
    });

    const statusFilter = cleanString(req.query && req.query.status).toLowerCase();
    const bookings =
      statusFilter &&
      ['pending', 'paid', 'cancelled', 'expired', 'checked_in'].includes(statusFilter)
        ? allBookings.filter((b) => b.status === statusFilter)
        : allBookings;

    const stats = {
      total: allBookings.length,
      paid: allBookings.filter((b) => b.status === 'paid' || b.status === 'checked_in').length,
      pending: allBookings.filter((b) => b.status === 'pending').length,
      cancelled: allBookings.filter((b) => b.status === 'cancelled' || b.status === 'expired')
        .length,
    };

    return res.render('auth/booking-history', {
      title: 'Lịch sử đặt vé',
      bookings,
      allBookings,
      statusFilter,
      stats,
      error,
      success,
    });
  } catch (err) {
    console.error('[AuthController.showBookingHistoryPage] Lỗi tải lịch sử đặt vé:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/');
  }
}

/**
 * 7b. Xử lý Hủy đơn đặt vé của khách hàng từ trang Lịch sử đặt vé
 * (`POST /auth/booking-history/:bookingCode/cancel` hoặc `POST /auth/booking-history/cancel`).
 * Bí danh tương thích: `cancelBooking`.
 * - Kiểm tra quyền sở hữu đơn đặt vé của `req.session.user.id`.
 * - Kiểm tra quy tắc 24 giờ: Nếu `status === 'paid'` nhưng còn < 24 giờ trước giờ khởi hành,
 *   từ chối với thông báo:
 *   `"Không thể hủy vé: Theo chính sách nhà xe, vé đã thanh toán chỉ được hủy trước giờ khởi hành ít nhất 24 giờ."`
 * - Khi hợp lệ: ưu tiên gọi `bookingModel.cancelBooking(bookingCode, 'Khách hàng hủy từ lịch sử đặt vé')`
 *   (nếu TV4 đã định nghĩa), và tự động fallback sang Transaction `userModel.cancelCustomerBookingByCode(bookingCode, req.session.user.id)`.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function cancelMyBooking(req, res, next) {
  try {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser || !sessionUser.id) {
      if (isAjaxOrJsonRequest(req)) {
        return res.status(401).json({
          success: false,
          message: 'Vui lòng đăng nhập để thực hiện hủy vé.',
        });
      }
      return res.redirect('/auth/login');
    }

    const bookingCode = cleanString(
      (req.params && (req.params.bookingCode || req.params.code)) ||
        (req.body && (req.body.bookingCode || req.body.booking_code)) ||
        (req.query && (req.query.bookingCode || req.query.booking_code))
    );

    if (!bookingCode) {
      const missingCodeMsg = 'Mã đặt vé không hợp lệ.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: missingCodeMsg });
      }
      if (req.session) {
        req.session.errorMsg = missingCodeMsg;
      }
      setFlash(req, 'error', missingCodeMsg);
      return res.redirect('/auth/booking-history');
    }

    // 1. Lấy danh sách đơn của chính khách hàng đang đăng nhập để kiểm tra quyền sở hữu & thời gian khởi hành
    const userBookings = (await userModel.getBookingHistoryByUserId(sessionUser.id)) || [];
    const targetBooking = userBookings.find(
      (b) => cleanString(b.booking_code).toLowerCase() === bookingCode.toLowerCase()
    );

    if (!targetBooking) {
      const notFoundMsg = 'Không tìm thấy đơn đặt vé hoặc bạn không có quyền hủy đơn này.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(404).json({ success: false, message: notFoundMsg });
      }
      if (req.session) {
        req.session.errorMsg = notFoundMsg;
      }
      setFlash(req, 'error', notFoundMsg);
      return res.redirect('/auth/booking-history');
    }

    // 2. Kiểm tra điều kiện hủy vé theo trạng thái và quy tắc 24 giờ trước giờ khởi hành
    const hoursUntilDeparture =
      (new Date(targetBooking.departure_time).getTime() - Date.now()) / (1000 * 60 * 60);

    if (targetBooking.status === 'paid' && hoursUntilDeparture < 24) {
      const policyMsg =
        'Không thể hủy vé: Theo chính sách nhà xe, vé đã thanh toán chỉ được hủy trước giờ khởi hành ít nhất 24 giờ.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: policyMsg });
      }
      if (req.session) {
        req.session.errorMsg = policyMsg;
      }
      setFlash(req, 'error', policyMsg);
      return res.redirect('/auth/booking-history');
    }

    const isEligibleToCancel =
      targetBooking.status === 'pending' ||
      (targetBooking.status === 'paid' && hoursUntilDeparture >= 24);

    if (!isEligibleToCancel) {
      let statusErrorMsg = 'Đơn đặt vé này không đủ điều kiện để hủy.';
      if (targetBooking.status === 'cancelled') {
        statusErrorMsg = 'Đơn đặt vé này đã được hủy trước đó.';
      } else if (targetBooking.status === 'expired') {
        statusErrorMsg = 'Đơn đặt vé đã hết hạn giữ chỗ, không thể hủy.';
      } else if (targetBooking.status === 'checked_in') {
        statusErrorMsg = 'Vé đã được soát (check-in) lên xe, không thể hủy.';
      }

      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: statusErrorMsg });
      }
      if (req.session) {
        req.session.errorMsg = statusErrorMsg;
      }
      setFlash(req, 'error', statusErrorMsg);
      return res.redirect('/auth/booking-history');
    }

    // 3. Thực hiện hủy đơn đặt vé (gọi bookingModel.cancelBooking nếu có, hoặc fallback userModel.cancelCustomerBookingByCode)
    let cancelledBooking = null;
    let handledByBookingModel = false;

    try {
      // eslint-disable-next-line global-require
      const bookingModel = require('../models/booking.model');
      if (bookingModel && typeof bookingModel.cancelBooking === 'function') {
        cancelledBooking = await bookingModel.cancelBooking(
          targetBooking.booking_code,
          'Khách hàng hủy từ lịch sử đặt vé'
        );
        handledByBookingModel = true;
      }
    } catch (bookingErr) {
      console.warn(
        '[AuthController.cancelMyBooking] Chuyển sang fallback userModel.cancelCustomerBookingByCode:',
        bookingErr.message
      );
    }

    if (!handledByBookingModel) {
      cancelledBooking = await userModel.cancelCustomerBookingByCode(
        targetBooking.booking_code,
        sessionUser.id
      );
    }

    const successMessage = `Đã hủy đơn đặt vé #${targetBooking.booking_code} thành công!`;

    if (isAjaxOrJsonRequest(req)) {
      return res.json({
        success: true,
        message: successMessage,
        booking: cancelledBooking,
      });
    }

    if (req.session) {
      req.session.successMsg = successMessage;
    }
    setFlash(req, 'success', successMessage);
    return res.redirect('/auth/booking-history');
  } catch (err) {
    const statusCode = err.statusCode || 400;
    const errorMessage = err.message || 'Không thể hủy đơn đặt vé. Vui lòng thử lại sau.';

    if (statusCode >= 500) {
      console.error('[AuthController.cancelMyBooking] Lỗi khi hủy vé:', err.message);
    }

    if (isAjaxOrJsonRequest(req)) {
      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
      });
    }

    if (req.session) {
      req.session.errorMsg = errorMessage;
    }
    setFlash(req, 'error', errorMessage);
    return res.redirect('/auth/booking-history');
  }
}

/**
 * 8a. Hiển thị trang Quản lý người dùng & Phân quyền dành cho Admin (`GET /admin/users`).
 * Bí danh tương thích ngược với `src/app.js`: `listUsersAdmin`, `showAdminUsersPage`.
 * - Hỗ trợ tìm kiếm theo `keyword` (họ tên, email, SĐT), lọc theo `role` (`'customer' | 'staff' | 'admin' | ''`)
 *   và `status` (`'active' | 'locked' | ''`).
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function listUsers(req, res, next) {
  try {
    const { error, success } = consumeFlashMessages(req, res);
    const query = req.query || {};
    const keyword = cleanString(query.keyword || query.q || query.search);
    const role = cleanString(query.role).toLowerCase();
    const status = cleanString(query.status).toLowerCase();

    const users = await userModel.listAll({ keyword, role, status });

    const stats = {
      total: users.length,
      active: users.filter((u) => u.is_active).length,
      locked: users.filter((u) => !u.is_active).length,
      unverified: users.filter((u) => !u.is_verified).length,
      adminCount: users.filter((u) => u.role === 'admin').length,
      staffCount: users.filter((u) => u.role === 'staff').length,
      customerCount: users.filter((u) => u.role === 'customer').length,
    };

    const currentAdminId =
      (req.session && req.session.user && req.session.user.id) || null;

    return res.render('admin/users', {
      title: 'Quản lý người dùng',
      users,
      filters: { keyword, role, status },
      keyword,
      role,
      status,
      currentAdminId,
      stats,
      error,
      success,
    });
  } catch (err) {
    console.error('[AuthController.listUsers] Lỗi tải danh sách người dùng:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.status(500).send('Đã xảy ra lỗi khi tải danh sách người dùng.');
  }
}

/**
 * 8b. Khóa hoặc mở khóa tài khoản người dùng (`POST /admin/users/:id/toggle-active`).
 * Bí danh tương thích: `toggleUserStatus`.
 * - Chặn tuyệt đối không cho phép Admin tự khóa tài khoản của chính mình (`targetUserId === req.session.user.id`).
 * - Tìm người dùng qua `userModel.findById(targetUserId)`, đảo trạng thái `nextActiveState = !targetUser.is_active`
 *   và cập nhật qua `userModel.toggleActiveStatus(targetUserId, nextActiveState)`.
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function toggleUserActive(req, res, next) {
  try {
    const rawUserId =
      (req.params && (req.params.id || req.params.userId)) ||
      (req.body && (req.body.userId || req.body.id));
    const targetUserId = parseInt(rawUserId, 10);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      const invalidIdMsg = 'ID người dùng không hợp lệ.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: invalidIdMsg });
      }
      if (req.session) {
        req.session.errorMsg = invalidIdMsg;
      }
      setFlash(req, 'error', invalidIdMsg);
      return res.redirect('/admin/users');
    }

    const currentAdminId =
      req.session && req.session.user ? parseInt(req.session.user.id, 10) : null;

    if (currentAdminId && targetUserId === currentAdminId) {
      const selfLockMsg = 'Bạn không thể tự khóa tài khoản Quản trị viên của chính mình!';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: selfLockMsg });
      }
      if (req.session) {
        req.session.errorMsg = selfLockMsg;
      }
      setFlash(req, 'error', selfLockMsg);
      return res.redirect('/admin/users');
    }

    const targetUser = await userModel.findById(targetUserId);
    if (!targetUser) {
      const notFoundMsg = 'Không tìm thấy tài khoản người dùng cần cập nhật.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(404).json({ success: false, message: notFoundMsg });
      }
      if (req.session) {
        req.session.errorMsg = notFoundMsg;
      }
      setFlash(req, 'error', notFoundMsg);
      return res.redirect('/admin/users');
    }

    const nextActiveState = !targetUser.is_active;
    const updatedUser = await userModel.toggleActiveStatus(targetUserId, nextActiveState);

    const successMsg = `Đã ${nextActiveState ? 'mở khóa' : 'khóa'} tài khoản ${
      targetUser.email
    } thành công.`;

    if (isAjaxOrJsonRequest(req)) {
      return res.json({
        success: true,
        message: successMsg,
        user: updatedUser,
      });
    }

    if (req.session) {
      req.session.successMsg = successMsg;
    }
    setFlash(req, 'success', successMsg);
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('[AuthController.toggleUserActive] Lỗi khi khóa/mở khóa tài khoản:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/admin/users');
  }
}

/**
 * 8c. Cập nhật vai trò phân quyền (`role`: `'customer'` | `'staff'` | `'admin'`) cho người dùng
 * (`POST /admin/users/:id/role`).
 * Bí danh tương thích: `changeUserRole`.
 * - Chặn tuyệt đối không cho phép Admin tự hạ quyền của chính mình (`targetUserId === req.session.user.id && newRole !== 'admin'`).
 *
 * @param {import('express').Request} req - Đối tượng Request
 * @param {import('express').Response} res - Đối tượng Response
 * @param {import('express').NextFunction} next - Hàm chuyển tiếp lỗi
 * @returns {Promise<any>}
 */
async function updateUserRole(req, res, next) {
  try {
    const rawUserId =
      (req.params && (req.params.id || req.params.userId)) ||
      (req.body && (req.body.userId || req.body.id));
    const targetUserId = parseInt(rawUserId, 10);
    const newRole = cleanString(req.body && req.body.role).toLowerCase();

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      const invalidIdMsg = 'ID người dùng không hợp lệ.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: invalidIdMsg });
      }
      if (req.session) {
        req.session.errorMsg = invalidIdMsg;
      }
      setFlash(req, 'error', invalidIdMsg);
      return res.redirect('/admin/users');
    }

    if (!VALID_ROLES.includes(newRole)) {
      const invalidRoleMsg =
        'Vai trò phân quyền không hợp lệ (chỉ chấp nhận: customer, staff, admin).';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: invalidRoleMsg });
      }
      if (req.session) {
        req.session.errorMsg = invalidRoleMsg;
      }
      setFlash(req, 'error', invalidRoleMsg);
      return res.redirect('/admin/users');
    }

    const currentAdminId =
      req.session && req.session.user ? parseInt(req.session.user.id, 10) : null;

    if (currentAdminId && targetUserId === currentAdminId && newRole !== 'admin') {
      const selfDemoteMsg = 'Bạn không thể tự hạ quyền Quản trị viên của chính mình!';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: selfDemoteMsg });
      }
      if (req.session) {
        req.session.errorMsg = selfDemoteMsg;
      }
      setFlash(req, 'error', selfDemoteMsg);
      return res.redirect('/admin/users');
    }

    const updatedUser = await userModel.updateUserRole(targetUserId, newRole);
    if (!updatedUser) {
      const notFoundMsg = 'Không tìm thấy tài khoản người dùng cần phân quyền.';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(404).json({ success: false, message: notFoundMsg });
      }
      if (req.session) {
        req.session.errorMsg = notFoundMsg;
      }
      setFlash(req, 'error', notFoundMsg);
      return res.redirect('/admin/users');
    }

    const successMsg = 'Cập nhật phân quyền người dùng thành công.';

    if (isAjaxOrJsonRequest(req)) {
      return res.json({
        success: true,
        message: successMsg,
        user: updatedUser,
      });
    }

    if (req.session) {
      req.session.successMsg = successMsg;
    }
    setFlash(req, 'success', successMsg);
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('[AuthController.updateUserRole] Lỗi khi đổi vai trò người dùng:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/admin/users');
  }
}

// ============================================================================
// 13. ĐỒNG BỘ DỮ LIỆU KAGGLE & XUẤT / NHẬP CSV (KAGGLE CSV PIPELINE)
// ============================================================================

/**
 * Định dạng giá trị trường CSV chuẩn RFC 4180
 * @param {any} val
 * @returns {string}
 */
function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Phân tích chuỗi CSV người dùng chuẩn Kaggle (full_name,email,phone,role,is_verified,is_active)
 * @param {string} csvText
 * @returns {Array<Object>}
 */
function parseUsersCsvText(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return [];

  const lines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const splitCsvRow = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const firstCells = splitCsvRow(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = firstCells.includes('email') || firstCells.includes('full_name');
  const headerMap = hasHeader
    ? firstCells
    : ['full_name', 'email', 'phone', 'role', 'is_verified', 'is_active'];
  const startIdx = hasHeader ? 1 : 0;

  const rows = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    const vals = splitCsvRow(lines[i]);
    if (vals.length === 0) continue;
    const obj = {};
    headerMap.forEach((colName, idx) => {
      obj[colName] = vals[idx] !== undefined ? vals[idx] : '';
    });
    if (obj.email && obj.email.includes('@')) {
      rows.push({
        full_name: obj.full_name || obj.name || 'Hành khách BusTicket',
        email: obj.email.toLowerCase(),
        phone: obj.phone || '0901000111',
        role: obj.role || 'customer',
        is_verified: obj.is_verified !== undefined && obj.is_verified !== '' ? obj.is_verified : true,
        is_active: obj.is_active !== undefined && obj.is_active !== '' ? obj.is_active : true,
      });
    }
  }
  return rows;
}

/**
 * [GET] /admin/users/export-csv
 * Xuất danh sách người dùng ra file CSV chuẩn Kaggle (UTF-8 BOM)
 */
async function exportUsersCsv(req, res, next) {
  try {
    const query = (req && req.query) || {};
    const keyword = cleanString(query.keyword || query.q || query.search);
    const role = cleanString(query.role).toLowerCase();
    const status = cleanString(query.status).toLowerCase();

    const users = await userModel.listAll({ keyword, role, status });
    const headers = ['id', 'full_name', 'email', 'phone', 'role', 'is_verified', 'is_active', 'created_at'];
    const csvRows = [headers.join(',')];

    for (const u of users) {
      csvRows.push([
        escapeCsvField(u.id),
        escapeCsvField(u.full_name),
        escapeCsvField(u.email),
        escapeCsvField(u.phone),
        escapeCsvField(u.role),
        escapeCsvField(Boolean(u.is_verified)),
        escapeCsvField(Boolean(u.is_active)),
        escapeCsvField(u.created_at ? new Date(u.created_at).toISOString() : ''),
      ].join(','));
    }

    const csvContent = `\uFEFF${csvRows.join('\r\n')}\r\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="busticket_kaggle_users.csv"');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('[AuthController.exportUsersCsv] Lỗi khi xuất CSV người dùng:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/admin/users');
  }
}

/**
 * [POST] /admin/users/import-csv
 * Đồng bộ bộ dữ liệu chuẩn Kaggle (users + trip_stops + trips + 5-status bookings/tickets)
 * hoặc nhập danh sách người dùng hàng loạt từ chuỗi CSV chuẩn Kaggle.
 */
async function importUsersCsv(req, res, next) {
  try {
    const mode = cleanString(req && req.body && req.body.mode).toLowerCase();
    const defaultPasswordHash = await bcrypt.hash('123456', SALT_ROUNDS);

    if (mode === 'kaggle_preset') {
      const summary = await userModel.syncKaggleBusDataset(defaultPasswordHash);
      const successMsg = `Đã đồng bộ bộ dữ liệu chuẩn Kaggle thành công (${summary.usersCount} tài khoản, ${summary.tripsCount} chuyến xe, ${summary.bookingsCount} đơn đặt vé mẫu đủ 5 trạng thái).`;
      if (isAjaxOrJsonRequest(req)) {
        return res.json({ success: true, message: successMsg, summary });
      }
      if (req.session) {
        req.session.successMsg = successMsg;
      }
      setFlash(req, 'success', successMsg);
      return res.redirect('/admin/users');
    }

    const csvText = (req && req.body && req.body.csvData) ? String(req.body.csvData) : '';
    const parsedRows = parseUsersCsvText(csvText);

    if (parsedRows.length === 0) {
      const errMsg = 'Dữ liệu CSV trống hoặc không đúng định dạng chuẩn (cần có cột email hợp lệ).';
      if (isAjaxOrJsonRequest(req)) {
        return res.status(400).json({ success: false, message: errMsg });
      }
      if (req.session) {
        req.session.errorMsg = errMsg;
      }
      setFlash(req, 'error', errMsg);
      return res.redirect('/admin/users');
    }

    const importedUsers = await userModel.importUsersFromCsvRows(parsedRows, defaultPasswordHash);
    const successMsg = `Đã nhập / đồng bộ thành công ${importedUsers.length} tài khoản từ CSV chuẩn Kaggle (mật khẩu mặc định cho tài khoản mới: 123456).`;

    if (isAjaxOrJsonRequest(req)) {
      return res.json({ success: true, message: successMsg, count: importedUsers.length });
    }
    if (req.session) {
      req.session.successMsg = successMsg;
    }
    setFlash(req, 'success', successMsg);
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('[AuthController.importUsersCsv] Lỗi khi nhập dữ liệu CSV Kaggle:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/admin/users');
  }
}

/**
 * [GET] /auth/booking-history/export-csv
 * Xuất lịch sử đặt vé của khách hàng đang đăng nhập ra file CSV chuẩn Kaggle (UTF-8 BOM)
 */
async function exportMyBookingsCsv(req, res, next) {
  try {
    const sessionUser = req && req.session && req.session.user;
    if (!sessionUser || !sessionUser.id) {
      return res.redirect('/auth/login');
    }

    const bookings = await userModel.getBookingHistoryByUserId(sessionUser.id);
    const headers = [
      'booking_code',
      'origin_city',
      'destination_city',
      'departure_time',
      'arrival_time',
      'bus_type',
      'license_plate',
      'seat_numbers',
      'total_amount',
      'status',
      'created_at',
    ];
    const csvRows = [headers.join(',')];

    for (const b of bookings) {
      const seatList = Array.isArray(b.seat_numbers)
        ? b.seat_numbers.join(';')
        : (Array.isArray(b.tickets) ? b.tickets.map((t) => t.seat_number).join(';') : '');
      csvRows.push([
        escapeCsvField(b.booking_code),
        escapeCsvField(b.origin_city),
        escapeCsvField(b.destination_city),
        escapeCsvField(b.departure_time ? new Date(b.departure_time).toISOString() : ''),
        escapeCsvField(b.arrival_time ? new Date(b.arrival_time).toISOString() : ''),
        escapeCsvField(b.bus_type),
        escapeCsvField(b.license_plate),
        escapeCsvField(seatList),
        escapeCsvField(b.total_amount),
        escapeCsvField(b.status),
        escapeCsvField(b.created_at ? new Date(b.created_at).toISOString() : ''),
      ].join(','));
    }

    const csvContent = `\uFEFF${csvRows.join('\r\n')}\r\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="busticket_booking_history.csv"');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('[AuthController.exportMyBookingsCsv] Lỗi khi xuất CSV lịch sử đặt vé:', err.message);
    if (typeof next === 'function') {
      return next(err);
    }
    return res.redirect('/auth/booking-history');
  }
}

// ============================================================================
// ĐỊNH TUYẾN TÍCH HỢP (INTEGRATED EXPRESS ROUTER) CHO NHÓM 1
// ============================================================================
const router = createExpressRouter();

// Gắn middleware kiểm tra trạng thái tài khoản hoạt động & đồng bộ biến locals
router.use(checkAccountActive);

// 1. Tuyến đường Xác thực (Guest / Public)
router.get('/auth/register', redirectIfAuthenticated, showRegisterPage);
router.post('/auth/register', redirectIfAuthenticated, register);
router.get('/auth/verify', verifyEmail);
router.get('/auth/login', redirectIfAuthenticated, showLoginPage);
router.post('/auth/login', redirectIfAuthenticated, login);
router.post('/auth/logout', logout);
router.get('/auth/logout', logout);
router.get('/auth/forgot-password', showForgotPasswordPage);
router.post('/auth/forgot-password', forgotPassword);
router.get('/auth/reset-password', showForgotPasswordPage);
router.post('/auth/reset-password', resetPassword);

// 2. Tuyến đường Hồ sơ cá nhân & Lịch sử đặt vé (Bắt buộc đăng nhập)
router.get('/auth/profile', requireAuth, showProfilePage);
router.post('/auth/profile', requireAuth, updateProfile);
router.post('/auth/change-password', requireAuth, changePassword);
router.get('/auth/booking-history', requireAuth, showBookingHistoryPage);
router.get('/auth/booking-history/export-csv', requireAuth, exportMyBookingsCsv);
router.post('/auth/booking-history/:bookingCode/cancel', requireAuth, cancelMyBooking);
router.post('/auth/booking-history/cancel', requireAuth, cancelMyBooking);

// 3. Tuyến đường Quản trị người dùng (Chỉ dành cho Admin)
router.get('/admin/users', requireAuth, requireRole('admin'), listUsers);
router.get('/admin/users/export-csv', requireAuth, requireRole('admin'), exportUsersCsv);
router.post('/admin/users/import-csv', requireAuth, requireRole('admin'), importUsersCsv);
router.post('/admin/users/:id/toggle-active', requireAuth, requireRole('admin'), toggleUserActive);
router.post('/admin/users/:id/role', requireAuth, requireRole('admin'), updateUserRole);

module.exports = {
  router,

  // Phần A: Đăng ký, Xác thực Email, Đăng nhập, Đăng xuất, Quên mật khẩu & Đặt lại mật khẩu
  showRegisterPage,
  renderRegister: showRegisterPage,
  register,
  verifyEmail,
  showLoginPage,
  renderLogin: showLoginPage,
  login,
  logout,
  showForgotPasswordPage,
  renderForgotPassword: showForgotPasswordPage,
  forgotPassword,
  resetPassword,

  // Phần B: Hồ sơ cá nhân, Lịch sử đặt vé & Hủy vé, Quản trị người dùng (Admin) & Kaggle CSV
  showProfilePage,
  renderProfile: showProfilePage,
  updateProfile,
  changePassword,
  showBookingHistoryPage,
  renderBookingHistory: showBookingHistoryPage,
  exportMyBookingsCsv,
  cancelMyBooking,
  cancelBooking: cancelMyBooking,
  listUsers,
  listUsersAdmin: listUsers,
  showAdminUsersPage: listUsers,
  exportUsersCsv,
  importUsersCsv,
  toggleUserActive,
  toggleUserStatus: toggleUserActive,
  updateUserRole,
  changeUserRole: updateUserRole,
};
