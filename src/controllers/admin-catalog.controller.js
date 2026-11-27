// [TV2] Danh mục vận hành và nội dung.
const model = require("../models/catalog.model");
const names = {
  stations: "Bến xe & điểm đón/trả",
  routes: "Tuyến xe",
  "seat-layouts": "Sơ đồ ghế",
  buses: "Đội xe",
  articles: "Tin tức & nội dung",
};
const fields = {
  stations: ["name", "province", "address", "is_main_station"],
  routes: [
    "name",
    "origin_province",
    "destination_province",
    "distance_km",
    "duration_hours",
    "base_price",
    "description",
  ],
  "seat-layouts": [
    "name",
    "total_seats",
    "total_floors",
    "rows_per_floor",
    "cols_per_floor",
    "seat_map_json",
  ],
  buses: ["license_plate", "seat_layout_id", "bus_type", "amenities", "status"],
  articles: [
    "title",
    "slug",
    "category",
    "summary",
    "content",
    "thumbnail_url",
    "is_published",
  ],
};
function kind(req) {
  return req.baseUrl.split("/").pop();
}
function number(value, label, min = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || value === "")
    throw new Error(`${label} không hợp lệ`);
  return n;
}
function parse(kindName, body) {
  const v = {};
  for (const key of fields[kindName])
    v[key] = typeof body[key] === "string" ? body[key].trim() : "";
  if (kindName === "stations") {
    if (!v.name || !v.province || !v.address)
      throw new Error("Vui lòng nhập đầy đủ bến xe");
    v.is_main_station = body.is_main_station === "true";
  }
  if (kindName === "routes") {
    if (!v.name || !v.origin_province || !v.destination_province)
      throw new Error("Vui lòng nhập tên và điểm đi/đến");
    v.distance_km = number(v.distance_km, "Khoảng cách", 1);
    v.duration_hours = number(v.duration_hours, "Thời gian", 0.1);
    v.base_price = number(v.base_price, "Giá");
  }
  if (kindName === "seat-layouts") {
    if (!v.name) throw new Error("Vui lòng nhập tên sơ đồ");
    for (const key of [
      "total_seats",
      "total_floors",
      "rows_per_floor",
      "cols_per_floor",
    ]) {
      v[key] = number(v[key], key, 1);
      if (!Number.isInteger(v[key]))
        throw new Error("Số ghế, tầng, hàng, cột phải là số nguyên");
    }
    if (
      v.total_floors > 2 ||
      v.total_seats > v.total_floors * v.rows_per_floor * v.cols_per_floor ||
      v.total_seats > 200
    )
      throw new Error("Số tầng hoặc số ghế không hợp lệ");
    const map = { floor1: [], floor2: [] };
    for (let i = 0; i < v.total_seats; i++) {
      const floor = Math.floor(i / (v.rows_per_floor * v.cols_per_floor));
      map[`floor${floor + 1}`].push(
        `${floor ? "B" : "A"}${String((i % (v.rows_per_floor * v.cols_per_floor)) + 1).padStart(2, "0")}`,
      );
    }
    v.seat_map_json = JSON.stringify(map);
  }
  if (kindName === "buses") {
    if (
      !v.license_plate ||
      !v.bus_type ||
      !["active", "maintenance"].includes(v.status)
    )
      throw new Error("Vui lòng nhập đúng thông tin xe");
    v.seat_layout_id = number(v.seat_layout_id, "Sơ đồ ghế", 1);
  }
  if (kindName === "articles") {
    if (
      !v.title ||
      !v.content ||
      !["news", "promotion", "policy", "faq"].includes(v.category)
    )
      throw new Error("Vui lòng nhập đầy đủ bài viết");
    v.slug = (v.slug || v.title)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!v.slug) throw new Error("Slug không hợp lệ");
    v.is_published = body.is_published === "true";
  }
  return v;
}
const controller = {
  async list(req, res, next) {
    try {
      const k = kind(req);
      const category = ["news", "promotion", "policy", "faq"].includes(req.query.category) ? req.query.category : "";
      const rows = await model.list(k, category);
      const layouts = k === "buses" ? await model.list("seat-layouts") : [];
      res.render(`admin/catalog/${k}`, {
        title: names[k],
        kind: k,
        rows,
        layouts,
        category,
        error: req.query.error || "",
        success: req.query.success || "",
      });
    } catch (e) {
      next(e);
    }
  },
  async save(req, res, next) {
    const k = kind(req);
    try {
      const id = req.params.id ? number(req.params.id, "Mã", 1) : null;
      const saved = await model.save(k, parse(k, req.body), id);
      if (!saved) return res.status(404).send("Không tìm thấy dữ liệu");
      res.redirect(
        `/admin/${k}?success=${encodeURIComponent("Đã lưu thành công")}`,
      );
    } catch (e) {
      if (
        ["23505", "23503", "23514", "22001", "22P02"].includes(e.code) ||
        !e.code
      )
        return res.redirect(
          `/admin/${k}?error=${encodeURIComponent(e.code ? "Dữ liệu trùng, không hợp lệ hoặc đang được sử dụng" : e.message)}`,
        );
      next(e);
    }
  },
  async toggle(req, res, next) {
    const k = kind(req);
    try {
      if (!(await model.toggle(k, number(req.params.id, "Mã", 1))))
        return res.sendStatus(404);
      res.redirect(`/admin/${k}`);
    } catch (e) {
      next(e);
    }
  },
  async remove(req, res, next) {
    const k = kind(req);
    try {
      if (!(await model.remove(k, number(req.params.id, "Mã", 1))))
        return res.sendStatus(404);
      res.redirect(`/admin/${k}`);
    } catch (e) {
      if (["23503", "23001"].includes(e.code))
        return res.redirect(
          `/admin/${k}?error=${encodeURIComponent("Không thể xóa vì dữ liệu đang được sử dụng")}`,
        );
      next(e);
    }
  },
  async news(req, res, next) {
    try {
      const articles = await model.published(
        ["news", "promotion"],
        req.params.slug,
      );
      if (req.params.slug && !articles.length)
        return res.status(404).send("Không tìm thấy bài viết");
      res.render("customer/articles", {
        title: "Tin tức & Khuyến mãi",
        articles,
        detail: Boolean(req.params.slug),
      });
    } catch (e) {
      next(e);
    }
  },
  async staticPage(req, res, next) {
    const name = req.path.slice(1);
    const pages = {
      "gioi-thieu": ["about", "Giới thiệu", []],
      "chinh-sach": ["policy", "Chính sách", ["policy"]],
      faq: ["faq", "Câu hỏi thường gặp", ["faq"]],
    };
    const [view, title, categories] = pages[name];
    try {
      const articles = categories.length
        ? await model.published(categories)
        : [];
      res.render(`static-tailwind/${view}`, { title, articles });
    } catch (e) {
      next(e);
    }
  },
};
controller.renderCustomerArticles = controller.news;
module.exports = controller;
