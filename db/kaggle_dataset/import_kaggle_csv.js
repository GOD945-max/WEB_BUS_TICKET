/**
 * ============================================================================
 * CÔNG CỤ NẠP DỮ LIỆU MẪU CHUẨN KAGGLE (GTFS & BUS DEMAND DATASET) CHO CẢ 5 NHÓM
 * ----------------------------------------------------------------------------
 * Cách chạy cho toàn bộ thành viên trong nhóm:
 *   node db/kaggle_dataset/import_kaggle_csv.js
 *
 * Đọc trực tiếp bộ 9 file CSV trong thư mục db/kaggle_dataset/ và đồng bộ
 * vào toàn bộ 10 bảng PostgreSQL của dự án BusTicket (01_init_schema.sql)
 * một cách an toàn (Idempotent — chạy nhiều lần không bị trùng dữ liệu).
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('../../src/config/db');
const userModel = require('../../src/models/user.model');

const CSV_DIR = __dirname;

/**
 * Phân tích tệp CSV chuẩn RFC 4180 (hỗ trợ dấu phẩy và dấu ngoặc kép bên trong chuỗi)
 * @param {string} fileName
 * @returns {Array<Object>}
 */
function parseCsvFile(fileName) {
  const filePath = path.join(CSV_DIR, fileName);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
  if (!raw) return [];

  const splitRow = (line) => {
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

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const parts = splitRow(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = parts[idx] !== undefined ? parts[idx] : '';
    });
    return obj;
  });
}

async function main() {
  console.log('====================================================================');
  console.log(' ĐỒNG BỘ BỘ DỮ LIỆU CSV CHUẨN KAGGLE -> POSTGRESQL (10 BẢNG DỰ ÁN)');
  console.log('====================================================================');

  try {
    const defaultPasswordHash = await bcrypt.hash('123456', 10);

    // 1. Bảng users (users.csv)
    const usersCsv = parseCsvFile('users.csv');
    console.log(`[1/6] Đang đồng bộ ${usersCsv.length} tài khoản từ users.csv (Mật khẩu mặc định: 123456)...`);
    await userModel.importUsersFromCsvRows(usersCsv, defaultPasswordHash);

    // 2. Bảng stations (stations.csv)
    const stationsCsv = parseCsvFile('stations.csv');
    for (const st of stationsCsv) {
      if (!st.name || !st.province) continue;
      const exist = await db.query(
        'SELECT id FROM stations WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [st.name]
      );
      if (exist.rows.length === 0) {
        await db.query(
          `INSERT INTO stations (name, province, address, is_main_station, is_active)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            st.name,
            st.province,
            st.address || st.province,
            String(st.is_main_station).toLowerCase() !== 'false',
            String(st.is_active).toLowerCase() !== 'false',
          ]
        );
      }
    }
    console.log(`[2/6] Đã đồng bộ ${stationsCsv.length} bến xe & điểm đón/trả từ stations.csv.`);

    // 3. Bảng routes (routes.csv)
    const routesCsv = parseCsvFile('routes.csv');
    for (const rt of routesCsv) {
      if (!rt.name || !rt.origin_province || !rt.destination_province) continue;
      const exist = await db.query(
        'SELECT id FROM routes WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [rt.name]
      );
      if (exist.rows.length === 0) {
        await db.query(
          `INSERT INTO routes (name, origin_province, destination_province, distance_km, duration_hours, base_price, description, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            rt.name,
            rt.origin_province,
            rt.destination_province,
            Number(rt.distance_km) || 200,
            Number(rt.duration_hours) || 4.0,
            Number(rt.base_price) || 250000,
            rt.description || '',
            String(rt.is_active).toLowerCase() !== 'false',
          ]
        );
      }
    }
    console.log(`[3/6] Đã đồng bộ ${routesCsv.length} tuyến xe liên tỉnh từ routes.csv.`);

    // 4. Bảng seat_layouts (seat_layouts.csv) & buses (buses.csv)
    const layoutsCsv = parseCsvFile('seat_layouts.csv');
    for (const sl of layoutsCsv) {
      if (!sl.name) continue;
      const exist = await db.query(
        'SELECT id FROM seat_layouts WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [sl.name]
      );
      if (exist.rows.length === 0) {
        await db.query(
          `INSERT INTO seat_layouts (name, total_seats, total_floors, rows_per_floor, cols_per_floor, seat_map_json)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [
            sl.name,
            Number(sl.total_seats) || 22,
            Number(sl.total_floors) || 2,
            Number(sl.rows_per_floor) || 6,
            Number(sl.cols_per_floor) || 2,
            sl.seat_map_json || '{"floor1":["A01","A02"]}',
          ]
        );
      }
    }

    const busesCsv = parseCsvFile('buses.csv');
    for (const b of busesCsv) {
      if (!b.license_plate) continue;
      await db.query(
        `INSERT INTO buses (license_plate, seat_layout_id, bus_type, amenities, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (license_plate) DO NOTHING`,
        [
          b.license_plate,
          Number(b.seat_layout_id) || 1,
          b.bus_type || 'Giường Nằm 34 Chỗ',
          b.amenities || 'Wifi, Điều hòa, Nước suối',
          b.status === 'maintenance' ? 'maintenance' : 'active',
        ]
      );
    }
    console.log(`[4/6] Đã đồng bộ ${layoutsCsv.length} sơ đồ ghế (seat_layouts.csv) & ${busesCsv.length} xe khách (buses.csv).`);

    // 5. Bảng articles (articles.csv)
    const articlesCsv = parseCsvFile('articles.csv');
    for (const ar of articlesCsv) {
      if (!ar.title || !ar.slug) continue;
      await db.query(
        `INSERT INTO articles (title, slug, category, summary, content, is_published)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO NOTHING`,
        [
          ar.title,
          ar.slug,
          ar.category || 'news',
          ar.summary || '',
          ar.content || '',
          String(ar.is_published).toLowerCase() !== 'false',
        ]
      );
    }
    console.log(`[5/6] Đã đồng bộ ${articlesCsv.length} bài viết & chính sách (articles.csv).`);

    // 6. Đồng bộ trips, trip_stops, bookings & tickets đủ 5 trạng thái
    const summary = await userModel.syncKaggleBusDataset(defaultPasswordHash);
    console.log(`[6/6] Đã đồng bộ lịch trình chuyến xe (trips + trip_stops) & đơn đặt vé mẫu (bookings + tickets):`);
    console.log(`      - Số chuyến xe đang hoạt động : ${summary.tripsCount} chuyến`);
    console.log(`      - Đơn đặt vé mẫu 5 trạng thái : BT2601 -> BT2606 (kèm vé ghế điện tử tickets)`);

    // In bảng thống kê 10 bảng trong CSDL
    const counts = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM stations) AS stations,
        (SELECT COUNT(*) FROM routes) AS routes,
        (SELECT COUNT(*) FROM seat_layouts) AS seat_layouts,
        (SELECT COUNT(*) FROM buses) AS buses,
        (SELECT COUNT(*) FROM trips) AS trips,
        (SELECT COUNT(*) FROM trip_stops) AS trip_stops,
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COUNT(*) FROM tickets) AS tickets,
        (SELECT COUNT(*) FROM articles) AS articles
    `);
    console.log('\n📊 THỐNG KÊ 10 BẢNG TRONG POSTGRESQL SAU KHI NẠP DỮ LIỆU KAGGLE:');
    console.table(counts.rows[0]);
    console.log('✅ Hoàn tất nạp dữ liệu mẫu chuẩn Kaggle cho toàn bộ 5 nhóm!');
  } catch (err) {
    console.error('❌ Lỗi khi nạp bộ dữ liệu CSV Kaggle:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

main();
