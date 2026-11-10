// [TV1 viết SQL / TV2 commit] Hàm SQL bảng stations, routes, seat_layouts, buses, articles
const db = require('../config/db');

const CatalogModel = {
  async getStations() {
    const { rows } = await db.query('SELECT * FROM stations ORDER BY id ASC');
    return rows;
  },
  async getRoutes() {
    const { rows } = await db.query('SELECT * FROM routes ORDER BY id ASC');
    return rows;
  },
  async getSeatLayouts() {
    const { rows } = await db.query('SELECT * FROM seat_layouts ORDER BY id ASC');
    return rows;
  },
  async getBuses() {
    const { rows } = await db.query(
      `SELECT b.*, sl.name AS layout_name, sl.total_seats
       FROM buses b JOIN seat_layouts sl ON b.seat_layout_id = sl.id
       ORDER BY b.id ASC`
    );
    return rows;
  },
  async getArticlesByCategory(category) {
    const { rows } = await db.query(
      'SELECT * FROM articles WHERE ($1::text IS NULL OR category = $1) ORDER BY created_at DESC',
      [category || null]
    );
    return rows;
  },
};

module.exports = CatalogModel;
