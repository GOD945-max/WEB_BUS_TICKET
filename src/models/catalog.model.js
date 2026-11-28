// [TV2] Truy vấn danh mục vận hành và nội dung.
const db = require("../config/db");
const catalog = {
  stations: {
    table: "stations",
    fields: ["name", "province", "address", "is_main_station"],
  },
  routes: {
    table: "routes",
    fields: [
      "name",
      "origin_province",
      "destination_province",
      "distance_km",
      "duration_hours",
      "base_price",
      "description",
    ],
  },
  "seat-layouts": {
    table: "seat_layouts",
    fields: [
      "name",
      "total_seats",
      "total_floors",
      "rows_per_floor",
      "cols_per_floor",
      "seat_map_json",
    ],
  },
  buses: {
    table: "buses",
    fields: [
      "license_plate",
      "seat_layout_id",
      "bus_type",
      "amenities",
      "status",
    ],
  },
  articles: {
    table: "articles",
    fields: [
      "title",
      "slug",
      "category",
      "summary",
      "content",
      "thumbnail_url",
      "is_published",
    ],
  },
};
function definition(kind) {
  if (!Object.hasOwn(catalog, kind)) throw new Error("Danh mục không hợp lệ");
  return catalog[kind];
}
async function list(kind, category) {
  const { table } = definition(kind);
  if (kind === "articles" && category) {
    return (await db.query("SELECT * FROM articles WHERE category = $1 ORDER BY id", [category])).rows;
  }
  if (kind === "buses")
    return (
      await db.query(`SELECT b.*, sl.name AS layout_name, EXISTS (
    SELECT 1 FROM trips t WHERE t.bus_id = b.id AND t.status = 'active' AND t.departure_time >= NOW()
    ) AS has_upcoming_trip FROM buses b JOIN seat_layouts sl ON sl.id = b.seat_layout_id ORDER BY b.id`)
    ).rows;
  return (await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
}
async function save(kind, values, id) {
  const { table, fields } = definition(kind);
  if (kind === "seat-layouts" && id) {
    const { rows } = await db.query(
      `SELECT sl.*, EXISTS
      (SELECT 1 FROM buses b WHERE b.seat_layout_id = sl.id) AS in_use
      FROM seat_layouts sl WHERE sl.id = $1`,
      [id],
    );
    const existing = rows[0];
    if (!existing) return undefined;
    const dimensions = [
      "total_seats",
      "total_floors",
      "rows_per_floor",
      "cols_per_floor",
    ];
    const changed = dimensions.some(
      (field) => Number(existing[field]) !== Number(values[field]),
    );
    if (changed && existing.in_use) {
      throw new Error(
        "Không thể thay đổi cấu trúc sơ đồ ghế đang được xe sử dụng",
      );
    }
    // Giữ mã ghế hiện có khi chỉ sửa tên, không tự tạo lại sơ đồ của nhóm.
    if (!changed) values.seat_map_json = JSON.stringify(existing.seat_map_json);
  }
  const params = fields.map((field) => values[field]);
  if (id) {
    const assignments = fields
      .map((field, i) => `${field} = $${i + 1}`)
      .join(", ");
    return (
      await db.query(
        `UPDATE ${table} SET ${assignments} WHERE id = $${fields.length + 1} RETURNING *`,
        [...params, id],
      )
    ).rows[0];
  }
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(", ");
  return (
    await db.query(
      `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      params,
    )
  ).rows[0];
}
async function toggle(kind, id) {
  if (!["stations", "routes"].includes(kind))
    throw new Error("Không hỗ trợ thao tác này");
  const { table } = definition(kind);
  return (
    await db.query(
      `UPDATE ${table} SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [id],
    )
  ).rows[0];
}
async function remove(kind, id) {
  if (!["seat-layouts", "articles"].includes(kind))
    throw new Error("Không hỗ trợ xóa danh mục này");
  const { table } = definition(kind);
  return (
    await db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id])
  ).rows[0];
}
async function published(categories, slug) {
  return (
    await db.query(
      `SELECT * FROM articles WHERE is_published = TRUE
    AND category = ANY($1::text[]) AND ($2::text IS NULL OR slug = $2) ORDER BY created_at DESC`,
      [categories, slug || null],
    )
  ).rows;
}
module.exports = {
  list,
  save,
  toggle,
  remove,
  published,
  getStations: () => list("stations"),
  getRoutes: () => list("routes"),
  getSeatLayouts: () => list("seat-layouts"),
  getBuses: () => list("buses"),
  async getArticlesByCategory(category) {
    return (
      await db.query(
        "SELECT * FROM articles WHERE ($1::text IS NULL OR category = $1) ORDER BY created_at DESC",
        [category || null],
      )
    ).rows;
  },
};
