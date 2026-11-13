// [TV1 - Nhóm 1: Tài khoản, xác thực và bảo mật] Kết nối Pool tới PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'bus_booking',
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
