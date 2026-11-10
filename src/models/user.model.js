// [TV1] Hàm SQL bảng users
const db = require('../config/db');

const UserModel = {
  async findByEmail(email) {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0];
  },
  async findById(id) {
    const { rows } = await db.query('SELECT id, full_name, email, phone, role, is_verified, is_active, created_at FROM users WHERE id = $1', [id]);
    return rows[0];
  },
  async create({ fullName, email, phone, passwordHash, verifyToken }) {
    const { rows } = await db.query(
      `INSERT INTO users (full_name, email, phone, password_hash, verify_token)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, role`,
      [fullName, email, phone, passwordHash, verifyToken]
    );
    return rows[0];
  },
  async listAll() {
    const { rows } = await db.query('SELECT id, full_name, email, phone, role, is_verified, is_active, created_at FROM users ORDER BY id ASC');
    return rows;
  },
};

module.exports = UserModel;
