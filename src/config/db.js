/**
 * @file src/config/db.js
 * @description [TV1 - Nhóm 1: Tài khoản, xác thực và bảo mật]
 * Cấu hình kết nối PostgreSQL 16 Connection Pool dùng chung cho toàn bộ 5 nhóm thành viên
 * trong Hệ thống Đặt vé Xe khách Liên tỉnh (SSR EJS + Express.js + PostgreSQL).
 *
 * Hỗ trợ linh hoạt cả 2 chế độ cấu hình:
 * 1. Chuỗi kết nối `DATABASE_URL` (Cloud / Production / Docker URL).
 * 2. Các biến môi trường thành phần (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
 *    hoặc chuẩn biến môi trường libpq (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`)
 *    tương thích với cả môi trường chạy Local và Docker Compose.
 *
 * ============================================================================
 * HƯỚNG DẪN SỬ DỤNG CHO CÁC NHÓM (TV1 -> TV5):
 * ============================================================================
 *
 * 1. Truy vấn đơn lẻ với Parameterized Queries ($1, $2, ...) chống SQL Injection:
 * ```js
 * const db = require('../config/db');
 *
 * async function findUserByEmail(email) {
 *   const sql = 'SELECT id, full_name, email, role FROM users WHERE email = $1 LIMIT 1';
 *   const { rows } = await db.query(sql, [email]);
 *   return rows[0] || null;
 * }
 * ```
 *
 * 2. Giao dịch (Transaction) với `BEGIN ... SELECT FOR UPDATE ... COMMIT / ROLLBACK`
 *    (Dùng cho TV3 - `trip.model.js` và TV4 - `booking.model.js` khi giữ ghế / đặt vé):
 * ```js
 * const db = require('../config/db');
 *
 * async function holdSeatsTransaction(tripId, seatCodes, bookingId) {
 *   // Có thể gọi `await db.pool.connect()` hoặc `await db.getClient()`
 *   const client = await db.pool.connect();
 *   try {
 *     await client.query('BEGIN');
 *
 *     // Khóa dòng chống tranh chấp ghế (Race Condition)
 *     const checkSql = `
 *       SELECT seat_code FROM tickets
 *       WHERE trip_id = $1 AND seat_code = ANY($2::varchar[])
 *         AND status IN ('held', 'paid', 'checked_in')
 *       FOR UPDATE
 *     `;
 *     const { rows: occupied } = await client.query(checkSql, [tripId, seatCodes]);
 *     if (occupied.length > 0) {
 *       throw new Error('Ghế đã có người đặt hoặc đang được giữ.');
 *     }
 *
 *     // Thực hiện cập nhật/thêm vé...
 *     await client.query('COMMIT');
 *   } catch (err) {
 *     await client.query('ROLLBACK');
 *     throw err;
 *   } finally {
 *     // BẮT BUỘC trả kết nối về Pool sau khi hoàn tất
 *     client.release();
 *   }
 * }
 * ```
 */

require('dotenv').config();
const { Pool } = require('pg');

/**
 * Cấu hình Pool kết nối PostgreSQL 16.
 * - `max`: Tối đa 20 kết nối đồng thời (đáp ứng tốt việc polling sơ đồ ghế AJAX của TV4).
 * - `idleTimeoutMillis`: Đóng client nhàn rỗi trong Pool sau 30 giây (30000ms).
 * - `connectionTimeoutMillis`: Báo lỗi nếu không lấy được kết nối sau 5 giây (5000ms).
 */
const poolConfig = {
  ...(process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
      }
    : {
        host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
        port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
        user: process.env.DB_USER || process.env.PGUSER || 'postgres',
        password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
        database: process.env.DB_NAME || process.env.PGDATABASE || 'bus_ticket_db',
      }),
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const pool = new Pool(poolConfig);

/**
 * Bắt sự kiện lỗi phát sinh trên các client đang nhàn rỗi (idle) trong Pool
 * để ghi log cảnh báo mà không làm sập (crash) tiến trình Node.js.
 */
pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]:', err.message);
});

/**
 * Thực thi câu lệnh SQL thông qua Pool kết nối (Parameterized Query: `$1, $2, ...`).
 * Tự động bắt lỗi và in chi tiết câu lệnh SQL, tham số cùng thông báo lỗi
 * khi chạy ở môi trường `development` trước khi ném lại lỗi cho tầng Model/Controller xử lý.
 *
 * @param {string} text - Câu lệnh SQL có chứa các placeholder `$1, $2, ...`
 * @param {Array<any>} [params] - Mảng giá trị tham số truyền vào câu lệnh SQL
 * @returns {Promise<import('pg').QueryResult>} Kết quả truy vấn từ PostgreSQL (`{ rows, rowCount, ... }`)
 * @throws {Error} Ném lại lỗi truy vấn SQL để Model/Controller bắt và xử lý
 *
 * @example
 * const { rows } = await db.query('SELECT * FROM stations WHERE province = $1', ['TP. Hồ Chí Minh']);
 */
async function query(text, params) {
  const start = Date.now();
  try {
    return await pool.query(text, params);
  } catch (err) {
    if ((process.env.NODE_ENV || 'development') === 'development') {
      const duration = Date.now() - start;
      console.error('[PostgreSQL Query Error]:', {
        sql: text,
        params: params || [],
        duration: `${duration}ms`,
        message: err.message,
      });
    }
    throw err;
  }
}

/**
 * Lấy một `PoolClient` riêng biệt từ Pool để thực hiện chuỗi giao dịch (Transaction:
 * `BEGIN`, `SELECT ... FOR UPDATE`, `COMMIT`, `ROLLBACK`).
 * Lưu ý: Luôn gọi `client.release()` trong khối `finally` để tránh rò rỉ kết nối.
 *
 * @returns {Promise<import('pg').PoolClient>} Đối tượng client kết nối PostgreSQL
 *
 * @example
 * const client = await db.getClient();
 * try {
 *   await client.query('BEGIN');
 *   // Thực hiện các câu lệnh SQL trong Transaction...
 *   await client.query('COMMIT');
 * } catch (err) {
 *   await client.query('ROLLBACK');
 *   throw err;
 * } finally {
 *   client.release();
 * }
 */
async function getClient() {
  return pool.connect();
}

/**
 * Kiểm tra kết nối tới cơ sở dữ liệu PostgreSQL khi khởi động ứng dụng
 * bằng câu truy vấn `SELECT NOW() AS current_time`.
 * In thông báo tiếng Việt rõ ràng ra console khi thành công hoặc thất bại.
 *
 * @returns {Promise<boolean>} Trả về `true` nếu kết nối thành công, `false` nếu thất bại
 */
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    const currentTime = result.rows && result.rows[0] ? result.rows[0].current_time : null;
    console.log(
      `[PostgreSQL] Kết nối cơ sở dữ liệu thành công! Thời gian máy chủ DB: ${currentTime}`
    );
    return true;
  } catch (err) {
    console.error(
      '[PostgreSQL] Không thể kết nối tới cơ sở dữ liệu PostgreSQL:',
      err.message
    );
    return false;
  }
}

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
};
