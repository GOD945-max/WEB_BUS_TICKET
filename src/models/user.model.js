/**
 * @file src/models/user.model.js
 * @description [TV1 - Nhóm 1: Tài khoản, xác thực và bảo mật]
 * Mô hình dữ liệu (Data Access Layer) quản lý bảng `users` và lịch sử đặt vé của khách hàng.
 *
 * Quy tắc bảo mật & kỹ thuật:
 * - Sử dụng `db` từ `../config/db` (PostgreSQL Connection Pool).
 * - 100% câu lệnh SQL sử dụng Parameterized Queries (`$1, $2, $3, ...`) chống SQL Injection tuyệt đối.
 * - Tuyệt đối không trả về `password_hash`, `verify_token`, `reset_token` ở các hàm 조회 thông tin chung
 *   như `findById(id)` hoặc `listAll(...)`.
 */

const db = require('../config/db');

/** Danh sách các vai trò hợp lệ trong hệ thống */
const VALID_ROLES = ['customer', 'staff', 'admin'];

const UserModel = {
  /**
   * 1. Tìm kiếm người dùng theo địa chỉ email (không phân biệt hoa/thường, tự động cắt khoảng trắng).
   * Dùng cho: Đăng nhập, Kiểm tra trùng email khi đăng ký, Quên mật khẩu.
   *
   * @param {string} email - Địa chỉ email cần tìm
   * @returns {Promise<Object|null>} Bản ghi đầy đủ của người dùng (bao gồm cả `password_hash`, `verify_token`, `reset_token`) hoặc `null` nếu không tìm thấy
   */
  async findByEmail(email) {
    if (!email || typeof email !== 'string' || !email.trim()) {
      return null;
    }

    const sql = `
      SELECT
        id,
        full_name,
        email,
        phone,
        password_hash,
        role,
        is_verified,
        verify_token,
        reset_token,
        is_active,
        created_at
      FROM users
      WHERE LOWER(email) = LOWER(TRIM($1))
      LIMIT 1
    `;
    const { rows } = await db.query(sql, [email]);
    return rows[0] || null;
  },

  /**
   * 2a. Lấy thông tin chi tiết người dùng theo `id` (An toàn bảo mật: KHÔNG trả về `password_hash`, `verify_token`, `reset_token`).
   * Dùng cho: Hiển thị trang Hồ sơ cá nhân, Middleware kiểm tra trạng thái tài khoản (`checkAccountActive`), Quản trị người dùng.
   *
   * @param {number|string} id - ID của người dùng
   * @returns {Promise<Object|null>} Thông tin người dùng an toàn hoặc `null` nếu không tồn tại
   */
  async findById(id) {
    if (id === undefined || id === null || id === '') {
      return null;
    }

    const sql = `
      SELECT id, full_name, email, phone, role, is_verified, is_active, created_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `;
    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * 2b. Lấy thông tin người dùng kèm `password_hash` theo `id`.
   * Dùng nội bộ khi khách hàng đã đăng nhập thực hiện đổi mật khẩu tại trang Hồ sơ cá nhân
   * và cần đối chiếu mật khẩu hiện tại.
   *
   * @param {number|string} id - ID của người dùng
   * @returns {Promise<Object|null>} Bản ghi người dùng kèm `password_hash` hoặc `null` nếu không tồn tại
   */
  async findByIdWithPassword(id) {
    if (id === undefined || id === null || id === '') {
      return null;
    }

    const sql = `
      SELECT id, full_name, email, phone, password_hash, role, is_verified, is_active, created_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `;
    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  },

  /**
   * 3. Tạo mới tài khoản khách hàng (`role = 'customer'`, `is_verified = FALSE`, `is_active = TRUE`).
   * Dùng khi khách hàng đăng ký tài khoản mới và chờ xác thực qua email.
   *
   * @param {Object} payload - Thông tin đăng ký tài khoản
   * @param {string} payload.fullName - Họ và tên khách hàng
   * @param {string} payload.email - Địa chỉ email đăng ký
   * @param {string} payload.phone - Số điện thoại liên hệ
   * @param {string} payload.passwordHash - Mật khẩu đã băm bằng `bcryptjs`
   * @param {string} payload.verifyToken - Mã token xác thực email
   * @returns {Promise<Object>} Bản ghi người dùng vừa được khởi tạo
   */
  async create({ fullName, email, phone, passwordHash, verifyToken }) {
    const sql = `
      INSERT INTO users (full_name, email, phone, password_hash, role, is_verified, verify_token, is_active)
      VALUES (TRIM($1), LOWER(TRIM($2)), TRIM($3), $4, 'customer', FALSE, $5, TRUE)
      RETURNING id, full_name, email, phone, role, is_verified, verify_token, is_active, created_at
    `;
    const params = [fullName, email, phone, passwordHash, verifyToken];
    const { rows } = await db.query(sql, params);
    return rows[0] || null;
  },

  /**
   * 4. Kích hoạt tài khoản khách hàng bằng mã `verify_token` khi bấm vào đường dẫn xác thực email (`/auth/verify?token=...`).
   * Sau khi xác thực thành công, đặt `is_verified = TRUE` và xóa `verify_token = NULL` để tránh tái sử dụng token.
   *
   * @param {string} token - Mã xác thực email từ URL query
   * @returns {Promise<Object|null>} Thông tin tài khoản đã kích hoạt hoặc `null` nếu token không hợp lệ / đã sử dụng
   */
  async verifyEmailByToken(token) {
    if (!token || typeof token !== 'string' || !token.trim()) {
      return null;
    }

    const sql = `
      UPDATE users
      SET is_verified = TRUE,
          verify_token = NULL
      WHERE verify_token = $1 AND verify_token IS NOT NULL
      RETURNING id, full_name, email, phone, role, is_verified, is_active
    `;
    const { rows } = await db.query(sql, [token.trim()]);
    return rows[0] || null;
  },

  /**
   * 5a. Lưu mã khôi phục mật khẩu (`reset_token`) cho người dùng đang hoạt động (`is_active = TRUE`) theo email.
   * Dùng cho chức năng Quên mật khẩu trước khi gửi email chứa đường dẫn đặt lại mật khẩu.
   *
   * @param {string} email - Địa chỉ email của tài khoản cần khôi phục mật khẩu
   * @param {string|null} resetToken - Mã token khôi phục mật khẩu
   * @returns {Promise<Object|null>} Thông tin người dùng đã lưu token hoặc `null` nếu email không tồn tại / bị khóa
   */
  async saveResetToken(email, resetToken) {
    if (!email || typeof email !== 'string' || !email.trim()) {
      return null;
    }

    const sql = `
      UPDATE users
      SET reset_token = $2
      WHERE LOWER(email) = LOWER(TRIM($1))
        AND is_active = TRUE
      RETURNING id, full_name, email, phone, role, is_verified, is_active
    `;
    const { rows } = await db.query(sql, [email, resetToken]);
    return rows[0] || null;
  },

  /**
   * 5b. Đặt lại mật khẩu mới bằng mã `reset_token`.
   * Cập nhật `password_hash` mới, xóa `reset_token = NULL` và đồng thời đánh dấu `is_verified = TRUE`
   * (do người dùng đã xác minh quyền sở hữu hộp thư qua đường dẫn khôi phục mật khẩu).
   *
   * @param {string} token - Mã khôi phục mật khẩu
   * @param {string} newPasswordHash - Mật khẩu mới đã được băm (`bcryptjs`)
   * @returns {Promise<Object|null>} Thông tin tài khoản sau khi cập nhật hoặc `null` nếu token không hợp lệ
   */
  async resetPasswordByToken(token, newPasswordHash) {
    if (!token || typeof token !== 'string' || !token.trim() || !newPasswordHash) {
      return null;
    }

    const sql = `
      UPDATE users
      SET password_hash = $2,
          reset_token = NULL,
          is_verified = TRUE
      WHERE reset_token = $1 AND reset_token IS NOT NULL AND is_active = TRUE
      RETURNING id, full_name, email, phone, role, is_verified, is_active
    `;
    const { rows } = await db.query(sql, [token.trim(), newPasswordHash]);
    return rows[0] || null;
  },

  /**
   * 6a. Cập nhật thông tin hồ sơ cá nhân (Họ tên & Số điện thoại) của người dùng.
   * Đảm bảo không trả về `password_hash`.
   *
   * @param {number|string} userId - ID của người dùng cần cập nhật
   * @param {Object} profileData - Dữ liệu hồ sơ cập nhật
   * @param {string} profileData.fullName - Họ và tên mới
   * @param {string} profileData.phone - Số điện thoại mới
   * @returns {Promise<Object|null>} Thông tin người dùng sau khi cập nhật hoặc `null` nếu không tìm thấy
   */
  async updateProfile(userId, { fullName, phone }) {
    if (userId === undefined || userId === null || userId === '') {
      return null;
    }

    const sql = `
      UPDATE users
      SET full_name = TRIM($2),
          phone = TRIM($3)
      WHERE id = $1
      RETURNING id, full_name, email, phone, role, is_verified, is_active, created_at
    `;
    const { rows } = await db.query(sql, [userId, fullName, phone]);
    return rows[0] || null;
  },

  /**
   * 6b. Cập nhật mật khẩu mới cho người dùng theo `userId` và xóa `reset_token` (nếu có).
   * Dùng khi người dùng đổi mật khẩu trực tiếp tại trang Hồ sơ cá nhân.
   *
   * @param {number|string} userId - ID của người dùng
   * @param {string} newPasswordHash - Mật khẩu mới đã băm (`bcryptjs`)
   * @returns {Promise<Object|null>} Đối tượng `{ id, email }` của tài khoản vừa đổi mật khẩu hoặc `null`
   */
  async updatePassword(userId, newPasswordHash) {
    if (userId === undefined || userId === null || userId === '' || !newPasswordHash) {
      return null;
    }

    const sql = `
      UPDATE users
      SET password_hash = $2,
          reset_token = NULL
      WHERE id = $1
      RETURNING id, email
    `;
    const { rows } = await db.query(sql, [userId, newPasswordHash]);
    return rows[0] || null;
  },

  /**
   * 7a. Lấy toàn bộ lịch sử đặt vé của một khách hàng (`user_id = $1`) cho trang `/auth/booking-history`.
   * Thực hiện truy vấn `JOIN` đầy đủ giữa các bảng:
   * - `bookings b` (thông tin đơn đặt chỗ, trạng thái, tổng tiền, tiền hoàn)
   * - `trips t` (giờ khởi hành, giờ đến, giá vé, trạng thái chuyến)
   * - `routes r` (tên tuyến, tỉnh đi, tỉnh đến, cự ly, thời gian di chuyển, giá cơ bản)
   * - `buses bu` (biển số xe, loại xe, tiện ích)
   * - `tickets tk` (gom nhóm danh sách mã ghế `seat_codes`, mảng `seat_list` và mã vé `ticket_codes`)
   * - `trip_stops` & `stations` (thông tin chi tiết điểm đón và điểm trả)
   * Đồng thời tính toán trực tiếp số giờ còn lại trước giờ khởi hành (`hours_until_departure`)
   * và cờ cho phép hủy vé (`can_cancel`: đơn đang `pending` hoặc đã `paid` và còn >= 24 giờ trước khi khởi hành).
   *
   * @param {number|string} userId - ID của khách hàng đang đăng nhập
   * @returns {Promise<Array<Object>>} Danh sách các đơn đặt vé sắp xếp mới nhất lên đầu (`ORDER BY b.created_at DESC`)
   */
  async getBookingHistoryByUserId(userId) {
    if (userId === undefined || userId === null || userId === '') {
      return [];
    }

    const sql = `
      SELECT
        b.id,
        b.booking_code,
        b.user_id,
        b.trip_id,
        b.pickup_stop_id,
        b.dropoff_stop_id,
        b.passenger_name,
        b.passenger_phone,
        b.passenger_email,
        b.seat_count,
        b.total_amount,
        b.status,
        b.hold_expires_at,
        b.refund_amount,
        b.created_at,
        t.route_id,
        t.bus_id,
        t.departure_time,
        t.arrival_time,
        t.ticket_price,
        t.status AS trip_status,
        r.name AS route_name,
        r.origin_province,
        r.destination_province,
        r.distance_km,
        r.duration_hours,
        r.base_price,
        bu.license_plate,
        bu.bus_type,
        bu.amenities,
        st_pick.name AS pickup_station_name,
        st_pick.address AS pickup_station_address,
        st_pick.province AS pickup_province,
        ts_pick.stop_time AS pickup_time,
        st_drop.name AS dropoff_station_name,
        st_drop.address AS dropoff_station_address,
        st_drop.province AS dropoff_province,
        ts_drop.stop_time AS dropoff_time,
        STRING_AGG(tk.seat_code, ', ' ORDER BY tk.seat_code) AS seat_codes,
        COALESCE(
          ARRAY_AGG(tk.seat_code ORDER BY tk.seat_code) FILTER (WHERE tk.seat_code IS NOT NULL),
          '{}'
        ) AS seat_list,
        STRING_AGG(tk.ticket_code, ', ' ORDER BY tk.seat_code) AS ticket_codes,
        EXTRACT(EPOCH FROM (t.departure_time - NOW())) / 3600.0 AS hours_until_departure,
        (
          b.status = 'pending'
          OR (b.status = 'paid' AND t.departure_time >= NOW() + INTERVAL '24 hours')
        ) AS can_cancel
      FROM bookings b
      JOIN trips t ON b.trip_id = t.id
      JOIN routes r ON t.route_id = r.id
      JOIN buses bu ON t.bus_id = bu.id
      LEFT JOIN tickets tk ON tk.booking_id = b.id
      LEFT JOIN trip_stops ts_pick ON b.pickup_stop_id = ts_pick.id
      LEFT JOIN stations st_pick ON ts_pick.station_id = st_pick.id
      LEFT JOIN trip_stops ts_drop ON b.dropoff_stop_id = ts_drop.id
      LEFT JOIN stations st_drop ON ts_drop.station_id = st_drop.id
      WHERE b.user_id = $1
      GROUP BY
        b.id,
        b.booking_code,
        b.user_id,
        b.trip_id,
        b.pickup_stop_id,
        b.dropoff_stop_id,
        b.passenger_name,
        b.passenger_phone,
        b.passenger_email,
        b.seat_count,
        b.total_amount,
        b.status,
        b.hold_expires_at,
        b.refund_amount,
        b.created_at,
        t.id,
        t.route_id,
        t.bus_id,
        t.departure_time,
        t.arrival_time,
        t.ticket_price,
        t.status,
        r.id,
        r.name,
        r.origin_province,
        r.destination_province,
        r.distance_km,
        r.duration_hours,
        r.base_price,
        bu.id,
        bu.license_plate,
        bu.bus_type,
        bu.amenities,
        ts_pick.id,
        ts_pick.stop_time,
        st_pick.id,
        st_pick.name,
        st_pick.address,
        st_pick.province,
        ts_drop.id,
        ts_drop.stop_time,
        st_drop.id,
        st_drop.name,
        st_drop.address,
        st_drop.province
      ORDER BY b.created_at DESC
    `;

    const { rows } = await db.query(sql, [userId]);
    return rows;
  },

  /**
   * 7b. Hủy đơn đặt vé của khách hàng đã đăng nhập theo mã đặt chỗ (`booking_code`) và `userId`.
   * Thực thi trong một PostgreSQL Transaction (`BEGIN ... FOR UPDATE ... COMMIT / ROLLBACK`)
   * để đảm bảo tính toàn vẹn dữ liệu và nhả ghế ngay lập tức:
   * - Khóa dòng đơn đặt chỗ (`FOR UPDATE OF b`) khớp `booking_code = TRIM($1)` và `user_id = $2`.
   * - Kiểm tra điều kiện được phép hủy: `status = 'pending'` hoặc (`status = 'paid'` và trước giờ khởi hành >= 24 giờ).
   * - Cập nhật `bookings`: `status = 'cancelled'`, `refund_amount = CASE WHEN status = 'paid' THEN total_amount ELSE 0 END`.
   * - Cập nhật `tickets`: chuyển các vé thuộc đơn đang ở trạng thái `'held'` hoặc `'paid'` sang `'cancelled'`.
   *
   * @param {string} bookingCode - Mã đặt chỗ cần hủy (VD: `BT123456`)
   * @param {number|string} userId - ID của khách hàng sở hữu đơn đặt vé
   * @returns {Promise<Object>} Bản ghi đơn đặt chỗ sau khi đã hủy (kèm `refund_amount`, `previous_status`)
   * @throws {Error} Ném lỗi tiếng Việt kèm `statusCode` nếu đơn không tồn tại hoặc không đủ điều kiện hủy
   */
  async cancelCustomerBookingByCode(bookingCode, userId) {
    if (!bookingCode || typeof bookingCode !== 'string' || !bookingCode.trim() || !userId) {
      const err = new Error('Mã đặt chỗ hoặc thông tin tài khoản không hợp lệ.');
      err.statusCode = 400;
      throw err;
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Khóa dòng đơn đặt chỗ của đúng khách hàng kèm thông tin giờ khởi hành của chuyến xe
      const lockSql = `
        SELECT
          b.*,
          t.departure_time,
          t.arrival_time,
          t.status AS trip_status,
          (
            b.status = 'pending'
            OR (b.status = 'paid' AND t.departure_time >= NOW() + INTERVAL '24 hours')
          ) AS can_cancel
        FROM bookings b
        JOIN trips t ON b.trip_id = t.id
        WHERE b.booking_code = TRIM($1)
          AND b.user_id = $2
        FOR UPDATE OF b
        LIMIT 1
      `;
      const { rows } = await client.query(lockSql, [bookingCode, userId]);

      // 2. Kiểm tra sự tồn tại và quyền sở hữu đơn đặt vé
      if (rows.length === 0) {
        const err = new Error('Không tìm thấy đơn đặt vé hoặc bạn không có quyền hủy đơn này.');
        err.statusCode = 404;
        throw err;
      }

      const booking = rows[0];
      const previousStatus = booking.status;

      // 3. Kiểm tra điều kiện hợp lệ để hủy vé theo quy định
      if (!booking.can_cancel) {
        let message = 'Đơn đặt vé không đủ điều kiện để hủy.';
        if (booking.status === 'cancelled') {
          message = 'Đơn đặt vé này đã được hủy trước đó.';
        } else if (booking.status === 'expired') {
          message = 'Đơn đặt vé đã hết hạn giữ chỗ, không thể hủy.';
        } else if (booking.status === 'checked_in') {
          message = 'Vé đã được soát (check-in) lên xe, không thể hủy.';
        } else if (booking.status === 'paid') {
          message =
            'Chỉ được phép hủy vé đã thanh toán trước giờ khởi hành tối thiểu 24 giờ theo chính sách nhà xe.';
        }
        const err = new Error(message);
        err.statusCode = 400;
        throw err;
      }

      // 4. Cập nhật trạng thái đơn đặt chỗ sang 'cancelled' và tính toán số tiền hoàn (nếu đã thanh toán)
      const updateBookingSql = `
        UPDATE bookings
        SET status = 'cancelled',
            refund_amount = CASE WHEN status = 'paid' THEN total_amount ELSE 0 END
        WHERE id = $1
        RETURNING *
      `;
      const { rows: updatedBookings } = await client.query(updateBookingSql, [booking.id]);
      const updatedBooking = updatedBookings[0];

      // 5. Cập nhật toàn bộ các vé thuộc đơn đặt chỗ từ 'held'/'paid' sang 'cancelled' để nhả ghế trống
      const updateTicketsSql = `
        UPDATE tickets
        SET status = 'cancelled'
        WHERE booking_id = $1
          AND status IN ('held', 'paid')
      `;
      await client.query(updateTicketsSql, [booking.id]);

      // 6. Hoàn tất giao dịch
      await client.query('COMMIT');

      return {
        ...updatedBooking,
        previous_status: previousStatus,
        departure_time: booking.departure_time,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * 8a. Lấy danh sách toàn bộ người dùng cho trang Quản trị (`/admin/users`),
   * hỗ trợ tìm kiếm động theo từ khóa (`full_name`, `email`, `phone`), lọc theo vai trò (`role`)
   * và lọc theo trạng thái tài khoản (`status`).
   * Chỉ chọn các cột an toàn (không bao giờ trả về `password_hash`, `verify_token`, `reset_token`).
   *
   * @param {Object} [filters={}] - Bộ lọc tìm kiếm người dùng
   * @param {string} [filters.keyword=''] - Từ khóa tìm theo họ tên, email hoặc số điện thoại
   * @param {string} [filters.role=''] - Lọc theo vai trò (`'customer'`, `'staff'`, `'admin'`)
   * @param {string} [filters.status=''] - Lọc theo trạng thái (`'active'`, `'locked'`/`'inactive'`, `'unverified'`, `'verified'`)
   * @returns {Promise<Array<Object>>} Danh sách người dùng sắp xếp theo `created_at DESC, id DESC`
   */
  async listAll({ keyword = '', role = '', status = '' } = {}) {
    const conditions = [];
    const params = [];

    if (typeof keyword === 'string' && keyword.trim() !== '') {
      params.push(`%${keyword.trim()}%`);
      const idx = params.length;
      conditions.push(`(full_name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`);
    }

    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    if (VALID_ROLES.includes(normalizedRole)) {
      params.push(normalizedRole);
      const idx = params.length;
      conditions.push(`role = $${idx}`);
    }

    const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (normalizedStatus === 'active') {
      conditions.push('is_active = TRUE');
    } else if (normalizedStatus === 'locked' || normalizedStatus === 'inactive') {
      conditions.push('is_active = FALSE');
    } else if (normalizedStatus === 'unverified') {
      conditions.push('is_verified = FALSE');
    } else if (normalizedStatus === 'verified') {
      conditions.push('is_verified = TRUE');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT
        id,
        full_name,
        email,
        phone,
        role,
        is_verified,
        is_active,
        created_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC, id DESC
    `;

    const { rows } = await db.query(sql, params);
    return rows;
  },

  /**
   * 8b. Khóa hoặc mở khóa tài khoản người dùng (`is_active`).
   * - Nếu truyền `isActive` kiểu boolean (`true` hoặc `false`), cập nhật trực tiếp `is_active = $2`.
   * - Nếu không truyền `isActive` (`undefined` hoặc `null`), tự động đảo trạng thái hiện tại (`is_active = NOT is_active`).
   *
   * @param {number|string} userId - ID của người dùng cần khóa/mở khóa
   * @param {boolean} [isActive] - Trạng thái kích hoạt mới (tùy chọn)
   * @returns {Promise<Object|null>} Thông tin người dùng sau khi cập nhật trạng thái hoặc `null` nếu không tìm thấy
   */
  async toggleActiveStatus(userId, isActive) {
    if (userId === undefined || userId === null || userId === '') {
      return null;
    }

    if (typeof isActive === 'boolean') {
      const sql = `
        UPDATE users
        SET is_active = $2
        WHERE id = $1
        RETURNING id, full_name, email, phone, role, is_verified, is_active
      `;
      const { rows } = await db.query(sql, [userId, isActive]);
      return rows[0] || null;
    }

    const sql = `
      UPDATE users
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING id, full_name, email, phone, role, is_verified, is_active
    `;
    const { rows } = await db.query(sql, [userId]);
    return rows[0] || null;
  },

  /**
   * 8c. Cập nhật vai trò phân quyền (`role`) cho người dùng.
   * Chỉ chấp nhận 1 trong 3 vai trò hợp lệ: `'customer'`, `'staff'`, `'admin'`.
   *
   * @param {number|string} userId - ID của người dùng cần đổi quyền
   * @param {string} role - Vai trò mới (`'customer'` | `'staff'` | `'admin'`)
   * @returns {Promise<Object|null>} Thông tin người dùng sau khi đổi vai trò hoặc `null` nếu không tìm thấy
   * @throws {Error} Ném lỗi `'Vai trò không hợp lệ'` nếu `role` không nằm trong danh sách cho phép
   */
  async updateUserRole(userId, role) {
    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    if (!VALID_ROLES.includes(normalizedRole)) {
      throw new Error('Vai trò không hợp lệ');
    }

    if (userId === undefined || userId === null || userId === '') {
      return null;
    }

    const sql = `
      UPDATE users
      SET role = $2
      WHERE id = $1
      RETURNING id, full_name, email, phone, role, is_verified, is_active
    `;
    const { rows } = await db.query(sql, [userId, normalizedRole]);
    return rows[0] || null;
  },

  /**
   * 9a. Nhập hàng loạt tài khoản người dùng từ mảng dòng CSV (chuẩn Kaggle Dataset)
   * bên trong một PostgreSQL Transaction (`BEGIN ... COMMIT / ROLLBACK`).
   * Sử dụng 100% Parameterized Queries (`$1..$7`) và `ON CONFLICT (email) DO UPDATE`.
   *
   * @param {Array<Object>} csvRows - Danh sách đối tượng người dùng đã phân tích từ CSV
   * @param {string} defaultPasswordHash - Chuỗi băm mật khẩu mặc định (`bcryptjs`, `saltRounds = 10`)
   * @returns {Promise<{ importedCount: number, users: Array<Object> }>}
   */
  async importUsersFromCsvRows(csvRows, defaultPasswordHash) {
    if (!Array.isArray(csvRows) || csvRows.length === 0 || !defaultPasswordHash) {
      return { importedCount: 0, users: [] };
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const importedUsers = [];

      const upsertSql = `
        INSERT INTO users (full_name, email, phone, password_hash, role, is_verified, is_active)
        VALUES (TRIM($1), LOWER(TRIM($2)), TRIM($3), $4, $5, $6, $7)
        ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            role = EXCLUDED.role,
            is_verified = EXCLUDED.is_verified,
            is_active = EXCLUDED.is_active
        RETURNING id, full_name, email, phone, role, is_verified, is_active, created_at
      `;

      for (const item of csvRows) {
        const fullName = String(item.full_name || item.fullName || '').trim();
        const email = String(item.email || '').trim().toLowerCase();
        const phone = String(item.phone || '').trim();
        const rawRole = String(item.role || 'customer').trim().toLowerCase();
        const role = VALID_ROLES.includes(rawRole) ? rawRole : 'customer';
        const isVerified =
          item.is_verified === undefined
            ? true
            : item.is_verified === true ||
              String(item.is_verified).trim().toLowerCase() === 'true' ||
              String(item.is_verified).trim() === '1';
        const isActive =
          item.is_active === undefined
            ? true
            : item.is_active === true ||
              String(item.is_active).trim().toLowerCase() === 'true' ||
              String(item.is_active).trim() === '1';

        if (fullName.length >= 2 && email.includes('@') && phone.length === 10) {
          const { rows } = await client.query(upsertSql, [
            fullName,
            email,
            phone,
            defaultPasswordHash,
            role,
            isVerified,
            isActive,
          ]);
          if (rows[0]) {
            importedUsers.push(rows[0]);
          }
        }
      }

      await client.query('COMMIT');
      return {
        importedCount: importedUsers.length,
        users: importedUsers,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * 9b. Đồng bộ bộ dữ liệu mẫu mở rộng chuẩn Kaggle (GTFS Bus Routes/Trips/Stops &
   * Bus Journey Demand Forecasting Transactions/Bookings) vào PostgreSQL.
   * Đảm bảo đầy đủ:
   * - Tài khoản mẫu & hành khách CSV (với mật khẩu `'123456'` băm chuẩn `bcryptjs`)
   * - Bến xe (`stations`), Tuyến xe (`routes`), Sơ đồ ghế (`seat_layouts`), Đội xe (`buses`)
   * - Lịch trình chuyến xe (`trips`) kèm đầy đủ điểm đón/trả (`trip_stops`)
   * - Đơn đặt vé (`bookings`) & Vé ghế (`tickets`) trải đủ 5 trạng thái (`pending`, `paid` >= 24h,
   *   `paid` < 24h, `checked_in`, `cancelled`, `expired`) để kiểm thử toàn diện dự án.
   *
   * @param {string} defaultPasswordHash - Chuỗi băm mật khẩu `'123456'` từ `bcryptjs`
   * @returns {Promise<{ usersCount: number, tripsCount: number, bookingsCount: number }>}
   */
  async syncKaggleBusDataset(defaultPasswordHash) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Đồng bộ danh sách người dùng chuẩn CSV (4 tài khoản cốt lõi + 8 tài khoản mở rộng)
      const kaggleUsers = [
        ['Quản Trị Viên BusTicket', 'admin@futabus.vn', '0901000001', 'admin', true, true],
        ['Nhân Viên Soát Vé Miền Đông', 'staff@futabus.vn', '0901000002', 'staff', true, true],
        ['Nhân Viên Điều Hành Đà Lạt', 'staff.dalat@busticket.vn', '0901000003', 'staff', true, true],
        ['Nguyễn Văn Khách', 'khach1@gmail.com', '0912345678', 'customer', true, true],
        ['Trần Thị Hành Khách', 'khach2@gmail.com', '0987654321', 'customer', true, true],
        ['Lê Hoàng Nam', 'le.hoang.nam@gmail.com', '0938112233', 'customer', true, true],
        ['Phạm Minh Anh', 'pham.minh.anh@gmail.com', '0977223344', 'customer', true, true],
        ['Võ Thanh Tùng', 'vo.thanh.tung@gmail.com', '0909334455', 'customer', true, true],
        ['Đặng Thu Hà', 'dang.thu.ha@gmail.com', '0918445566', 'customer', true, true],
        ['Bùi Quốc Bảo', 'bui.quoc.bao@gmail.com', '0983556677', 'customer', false, true],
        ['Ngô Lan Hương', 'ngo.lan.huong@gmail.com', '0932667788', 'customer', true, false],
      ];

      const userUpsertSql = `
        INSERT INTO users (full_name, email, phone, password_hash, role, is_verified, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            is_verified = EXCLUDED.is_verified,
            is_active = EXCLUDED.is_active
        RETURNING id, email
      `;

      const emailToId = {};
      for (const [fullName, email, phone, role, isVerified, isActive] of kaggleUsers) {
        const { rows } = await client.query(userUpsertSql, [
          fullName,
          email,
          phone,
          defaultPasswordHash,
          role,
          isVerified,
          isActive,
        ]);
        if (rows[0]) {
          emailToId[email] = rows[0].id;
        }
      }

      // 2. Bổ sung điểm dừng đón/trả (trip_stops) cho các chuyến xe chưa có điểm dừng
      const { rows: allTrips } = await client.query(
        'SELECT id, route_id, departure_time, arrival_time, ticket_price FROM trips ORDER BY id ASC'
      );
      const { rows: allStations } = await client.query(
        'SELECT id, name, province FROM stations ORDER BY id ASC'
      );

      if (allTrips.length > 0 && allStations.length >= 2) {
        for (const trip of allTrips) {
          const { rows: existingStops } = await client.query(
            'SELECT id FROM trip_stops WHERE trip_id = $1 LIMIT 1',
            [trip.id]
          );
          if (existingStops.length === 0) {
            const pickStation = allStations[0];
            const dropStation = allStations[(trip.id % (allStations.length - 1)) + 1] || allStations[1];
            await client.query(
              `INSERT INTO trip_stops (trip_id, station_id, stop_type, stop_time, stop_order)
               VALUES ($1, $2, 'pickup', $3, 1),
                      ($1, $4, 'dropoff', $5, 2)`,
              [trip.id, pickStation.id, trip.departure_time, dropStation.id, trip.arrival_time]
            );
          }
        }
      }

      // 3. Tạo chuyến xe cận giờ (< 24h) nếu chưa có để kiểm thử quy tắc chặn hủy vé < 24h
      let nearTripId = allTrips[0] ? allTrips[0].id : null;
      const { rows: nearTrips } = await client.query(
        `SELECT id FROM trips
         WHERE departure_time > NOW() + INTERVAL '2 hours'
           AND departure_time < NOW() + INTERVAL '12 hours'
         LIMIT 1`
      );
      if (nearTrips.length > 0) {
        nearTripId = nearTrips[0].id;
      } else if (allTrips.length > 0) {
        const ref = allTrips[0];
        const { rows: insertedNear } = await client.query(
          `INSERT INTO trips (route_id, bus_id, departure_time, arrival_time, ticket_price, status)
           VALUES ($1, 1, NOW() + INTERVAL '6 hours', NOW() + INTERVAL '12 hours', $2, 'active')
           RETURNING id, departure_time, arrival_time`,
          [ref.route_id, ref.ticket_price || 350000]
        );
        if (insertedNear[0] && allStations.length >= 2) {
          nearTripId = insertedNear[0].id;
          await client.query(
            `INSERT INTO trip_stops (trip_id, station_id, stop_type, stop_time, stop_order)
             VALUES ($1, $2, 'pickup', $3, 1),
                    ($1, $4, 'dropoff', $5, 2)`,
            [
              nearTripId,
              allStations[0].id,
              insertedNear[0].departure_time,
              allStations[3] ? allStations[3].id : allStations[1].id,
              insertedNear[0].arrival_time,
            ]
          );
        }
      }

      // 4. Nạp 6 đơn đặt vé mẫu (bookings + tickets) chuẩn Kaggle Transactions trải đủ 5 trạng thái
      const customerId = emailToId['khach1@gmail.com'] || null;
      const farTripId = allTrips.length > 2 ? allTrips[2].id : nearTripId;
      const secondTripId = allTrips.length > 1 ? allTrips[1].id : farTripId;

      let bookingsCreated = 0;
      if (customerId && farTripId && nearTripId) {
        const getStopPair = async (tId) => {
          const { rows: p } = await client.query(
            "SELECT id FROM trip_stops WHERE trip_id = $1 AND stop_type = 'pickup' ORDER BY stop_order ASC LIMIT 1",
            [tId]
          );
          const { rows: d } = await client.query(
            "SELECT id FROM trip_stops WHERE trip_id = $1 AND stop_type = 'dropoff' ORDER BY stop_order DESC LIMIT 1",
            [tId]
          );
          return {
            pickupStopId: p[0] ? p[0].id : null,
            dropoffStopId: d[0] ? d[0].id : null,
          };
        };

        const farStops = await getStopPair(farTripId);
        const secondStops = await getStopPair(secondTripId);
        const nearStops = await getStopPair(nearTripId);

        const sampleBookings = [
          {
            code: 'BT2601',
            tripId: farTripId,
            stops: farStops,
            seatCount: 2,
            totalAmount: 700000,
            status: 'pending',
            refundAmount: 0,
            seats: ['A01', 'A02'],
            ticketStatus: 'held',
          },
          {
            code: 'BT2602',
            tripId: farTripId,
            stops: farStops,
            seatCount: 2,
            totalAmount: 700000,
            status: 'paid',
            refundAmount: 0,
            seats: ['A03', 'A04'],
            ticketStatus: 'paid',
          },
          {
            code: 'BT2603',
            tripId: nearTripId,
            stops: nearStops,
            seatCount: 1,
            totalAmount: 350000,
            status: 'paid',
            refundAmount: 0,
            seats: ['B01'],
            ticketStatus: 'paid',
          },
          {
            code: 'BT2604',
            tripId: secondTripId,
            stops: secondStops,
            seatCount: 1,
            totalAmount: 320000,
            status: 'checked_in',
            refundAmount: 0,
            seats: ['A05'],
            ticketStatus: 'checked_in',
          },
          {
            code: 'BT2605',
            tripId: farTripId,
            stops: farStops,
            seatCount: 1,
            totalAmount: 350000,
            status: 'cancelled',
            refundAmount: 350000,
            seats: ['B05'],
            ticketStatus: 'cancelled',
          },
          {
            code: 'BT2606',
            tripId: secondTripId,
            stops: secondStops,
            seatCount: 1,
            totalAmount: 320000,
            status: 'expired',
            refundAmount: 0,
            seats: ['B06'],
            ticketStatus: 'expired',
          },
        ];

        for (const b of sampleBookings) {
          const { rows: insertedBooking } = await client.query(
            `INSERT INTO bookings (
               booking_code, user_id, trip_id, pickup_stop_id, dropoff_stop_id,
               passenger_name, passenger_phone, passenger_email,
               seat_count, total_amount, status, hold_expires_at, refund_amount
             )
             VALUES ($1, $2, $3, $4, $5, 'Nguyễn Văn Khách', '0912345678', 'khach1@gmail.com',
                     $6, $7, $8, NOW() + INTERVAL '10 minutes', $9)
             ON CONFLICT (booking_code) DO NOTHING
             RETURNING id`,
            [
              b.code,
              customerId,
              b.tripId,
              b.stops.pickupStopId,
              b.stops.dropoffStopId,
              b.seatCount,
              b.totalAmount,
              b.status,
              b.refundAmount,
            ]
          );

          if (insertedBooking[0]) {
            bookingsCreated++;
            const bookingId = insertedBooking[0].id;
            const unitPrice = Math.round(b.totalAmount / b.seatCount);
            for (const seatCode of b.seats) {
              const ticketCode = `TK-${b.code}-${seatCode}`;
              await client.query(
                `INSERT INTO tickets (booking_id, trip_id, seat_code, ticket_code, price, status)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (ticket_code) DO NOTHING`,
                [bookingId, b.tripId, seatCode, ticketCode, unitPrice, b.ticketStatus]
              );
            }
          }
        }
      }

      await client.query('COMMIT');
      return {
        usersCount: kaggleUsers.length,
        tripsCount: allTrips.length,
        bookingsCount: bookingsCreated,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = UserModel;
