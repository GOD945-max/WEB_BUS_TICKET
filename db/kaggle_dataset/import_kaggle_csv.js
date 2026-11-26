/**
 * ============================================================================
 * CÔNG CỤ NẠP TOÀN BỘ 9 TỆP CSV TỪ DỮ LIỆU KAGGLE -> 10 BẢNG POSTGRESQL
 * ----------------------------------------------------------------------------
 * Cách chạy CLI:
 *   node db/kaggle_dataset/import_kaggle_csv.js
 *
 * Nguồn dữ liệu gốc tại db/kaggle_dataset/raw/ (chuẩn hóa bởi build_kaggle_csvs.js):
 *   1. seatransport/southeast-asia-transport-data (ODbL 1.0)
 *   2. rohitgds/pan-india-bus-routes-35k-schedules-1000-cities (CC BY 4.0)
 *   3. iamvijay7/bus-journey-demand-forecasting-dataset (CC0: Public Domain)
 *
 * Đặc điểm an toàn cho cả 5 nhóm thành viên:
 * - Đọc trực tiếp đủ 9 tệp CSV: users, stations, routes, seat_layouts, buses,
 *   articles, trips, trip_stops, bookings (+ sinh bảng tickets tương ứng).
 * - Ánh xạ khóa ngoại bằng khóa tự nhiên (email, name, license_plate, route_name,
 *   station_name, booking_code) -> tương thích 100% dù DB trống sau 01_init_schema.sql
 *   hay đã chạy sẵn 02_seed_data.sql.
 * - Hoàn toàn Idempotent (chạy nhiều lần không gây trùng lặp, không vi phạm Unique Index).
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const db = require('../../src/config/db');

const CSV_DIR = __dirname;

/**
 * Phân tích tệp CSV chuẩn RFC 4180 (hỗ trợ dấu phẩy & ngoặc kép bên trong chuỗi)
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

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
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

function parseBool(val, defaultVal = true) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const s = String(val).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no') return false;
  if (s === 'true' || s === '1' || s === 'yes') return true;
  return defaultVal;
}

/**
 * Thực thi nạp toàn bộ 9 file CSV chuẩn hóa từ Kaggle vào 10 bảng PostgreSQL
 * (Có thể gọi từ CLI hoặc từ UserModel.syncKaggleBusDataset ở trang /admin/users)
 *
 * @param {string} [providedPasswordHash]
 * @param {{ quiet?: boolean, client?: import('pg').PoolClient }} [options]
 */
async function importKaggleDatasetToDb(providedPasswordHash, options = {}) {
  const quiet = Boolean(options.quiet);
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  const defaultPasswordHash = providedPasswordHash || (await bcrypt.hash('123456', 10));
  const externalClient = options.client || null;
  const client = externalClient || (await db.pool.connect());

  try {
    if (!externalClient) await client.query('BEGIN');

    // ------------------------------------------------------------------
    // 1. Bảng users (users.csv)
    // ------------------------------------------------------------------
    const usersCsv = parseCsvFile('users.csv');
    const userIdByEmail = new Map();
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
    for (const u of usersCsv) {
      if (!u.email || !u.email.includes('@')) continue;
      const role = ['admin', 'staff', 'customer'].includes(String(u.role).toLowerCase())
        ? String(u.role).toLowerCase()
        : 'customer';
      const { rows } = await client.query(userUpsertSql, [
        u.full_name || 'Hành khách BusTicket',
        u.email.toLowerCase(),
        u.phone || '0901000111',
        defaultPasswordHash,
        role,
        parseBool(u.is_verified, true),
        parseBool(u.is_active, true),
      ]);
      if (rows[0]) userIdByEmail.set(rows[0].email.toLowerCase(), rows[0].id);
    }
    log(`[1/8] Đã đồng bộ ${userIdByEmail.size} tài khoản từ users.csv.`);

    // ------------------------------------------------------------------
    // 2. Bảng stations (stations.csv)
    // ------------------------------------------------------------------
    const stationsCsv = parseCsvFile('stations.csv');
    const stationIdByName = new Map();
    for (const st of stationsCsv) {
      if (!st.name || !st.province) continue;
      const exist = await client.query(
        'SELECT id FROM stations WHERE LOWER(name) = LOWER($1) ORDER BY id ASC LIMIT 1',
        [st.name]
      );
      if (exist.rows.length > 0) {
        stationIdByName.set(st.name.toLowerCase(), exist.rows[0].id);
      } else {
        const { rows } = await client.query(
          `INSERT INTO stations (name, province, address, is_main_station, is_active)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            st.name,
            st.province,
            st.address || st.province,
            parseBool(st.is_main_station, true),
            parseBool(st.is_active, true),
          ]
        );
        stationIdByName.set(st.name.toLowerCase(), rows[0].id);
      }
    }
    log(`[2/8] Đã đồng bộ ${stationIdByName.size} bến xe & điểm đón/trả từ stations.csv (Kaggle OSM).`);

    // ------------------------------------------------------------------
    // 3. Bảng routes (routes.csv)
    // ------------------------------------------------------------------
    const routesCsv = parseCsvFile('routes.csv');
    const routeIdByName = new Map();
    const routeIdByCsvId = new Map();
    for (const rt of routesCsv) {
      if (!rt.name || !rt.origin_province || !rt.destination_province) continue;
      const exist = await client.query(
        'SELECT id FROM routes WHERE LOWER(name) = LOWER($1) ORDER BY id ASC LIMIT 1',
        [rt.name]
      );
      let dbRouteId;
      if (exist.rows.length > 0) {
        dbRouteId = exist.rows[0].id;
      } else {
        const { rows } = await client.query(
          `INSERT INTO routes (name, origin_province, destination_province, distance_km, duration_hours, base_price, description, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            rt.name,
            rt.origin_province,
            rt.destination_province,
            Math.max(10, Math.round(Number(rt.distance_km) || 200)),
            Number(rt.duration_hours) || 4.0,
            Math.round(Number(rt.base_price) || 200000),
            rt.description || '',
            parseBool(rt.is_active, true),
          ]
        );
        dbRouteId = rows[0].id;
      }
      routeIdByName.set(rt.name.toLowerCase(), dbRouteId);
      if (rt.route_id) routeIdByCsvId.set(String(rt.route_id), dbRouteId);
    }
    log(`[3/8] Đã đồng bộ ${routeIdByName.size} tuyến đường liên tỉnh từ routes.csv (Kaggle GeoJSON).`);

    // ------------------------------------------------------------------
    // 4. Bảng seat_layouts (seat_layouts.csv) & buses (buses.csv)
    // ------------------------------------------------------------------
    const layoutsCsv = parseCsvFile('seat_layouts.csv');
    const layoutIdByName = new Map();
    const layoutIdByCsvId = new Map();
    for (const sl of layoutsCsv) {
      if (!sl.name) continue;
      const exist = await client.query(
        'SELECT id FROM seat_layouts WHERE LOWER(name) = LOWER($1) ORDER BY id ASC LIMIT 1',
        [sl.name]
      );
      let dbLayoutId;
      if (exist.rows.length > 0) {
        dbLayoutId = exist.rows[0].id;
      } else {
        const floors = Number(sl.total_floors) === 1 ? 1 : 2;
        const { rows } = await client.query(
          `INSERT INTO seat_layouts (name, total_seats, total_floors, rows_per_floor, cols_per_floor, seat_map_json)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           RETURNING id`,
          [
            sl.name,
            Number(sl.total_seats) || 22,
            floors,
            Number(sl.rows_per_floor) || 6,
            Number(sl.cols_per_floor) || 2,
            sl.seat_map_json || '{"floor1":["A01","A02"]}',
          ]
        );
        dbLayoutId = rows[0].id;
      }
      layoutIdByName.set(sl.name.toLowerCase(), dbLayoutId);
      if (sl.layout_id) layoutIdByCsvId.set(String(sl.layout_id), dbLayoutId);
    }

    const busesCsv = parseCsvFile('buses.csv');
    const busIdByPlate = new Map();
    const busIdByCsvId = new Map();
    const fallbackLayoutId = [...layoutIdByName.values()][0] || 1;
    for (const b of busesCsv) {
      if (!b.license_plate) continue;
      const layoutId =
        (b.layout_name && layoutIdByName.get(b.layout_name.toLowerCase())) ||
        (b.seat_layout_id && layoutIdByCsvId.get(String(b.seat_layout_id))) ||
        fallbackLayoutId;
      const status = b.status === 'maintenance' ? 'maintenance' : 'active';
      const { rows } = await client.query(
        `INSERT INTO buses (license_plate, seat_layout_id, bus_type, amenities, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (license_plate) DO UPDATE
         SET bus_type = EXCLUDED.bus_type,
             amenities = EXCLUDED.amenities,
             status = EXCLUDED.status
         RETURNING id`,
        [
          b.license_plate,
          layoutId,
          b.bus_type || 'Giường Nằm 34 Chỗ',
          b.amenities || 'Wifi, Điều hòa, Nước suối',
          status,
        ]
      );
      busIdByPlate.set(b.license_plate, rows[0].id);
      if (b.bus_id) busIdByCsvId.set(String(b.bus_id), rows[0].id);
    }
    log(`[4/8] Đã đồng bộ ${layoutIdByName.size} sơ đồ ghế & ${busIdByPlate.size} xe khách từ seat_layouts.csv + buses.csv.`);

    // ------------------------------------------------------------------
    // 5. Bảng articles (articles.csv)
    // ------------------------------------------------------------------
    const articlesCsv = parseCsvFile('articles.csv');
    let articlesSynced = 0;
    const validCategories = new Set(['news', 'promotion', 'policy', 'faq']);
    for (const ar of articlesCsv) {
      if (!ar.title || !ar.slug) continue;
      const category = validCategories.has(ar.category) ? ar.category : 'news';
      await client.query(
        `INSERT INTO articles (title, slug, category, summary, content, is_published)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO NOTHING`,
        [
          ar.title,
          ar.slug,
          category,
          ar.summary || '',
          ar.content || ar.summary || ar.title,
          parseBool(ar.is_published, true),
        ]
      );
      articlesSynced += 1;
    }
    log(`[5/8] Đã đồng bộ ${articlesSynced} bài viết & tin tức từ articles.csv.`);

    // ------------------------------------------------------------------
    // 6. Bảng trips (trips.csv)
    // ------------------------------------------------------------------
    const tripsCsv = parseCsvFile('trips.csv');
    const tripIdByCode = new Map();
    const validTripStatuses = new Set(['draft', 'active', 'departed', 'completed', 'cancelled']);
    let tripsInserted = 0;

    for (const tr of tripsCsv) {
      const routeId =
        (tr.route_name && routeIdByName.get(tr.route_name.toLowerCase())) ||
        (tr.route_id && routeIdByCsvId.get(String(tr.route_id)));
      const busId =
        (tr.license_plate && busIdByPlate.get(tr.license_plate)) ||
        (tr.bus_id && busIdByCsvId.get(String(tr.bus_id))) ||
        null;
      if (!routeId) continue;

      const durationMins = Math.max(30, Math.round((Number(tr.duration_hours) || 4) * 60));
      const status = validTripStatuses.has(tr.status) ? tr.status : 'active';
      const ticketPrice = Math.round(Number(tr.ticket_price) || 200000);

      let dbTripId = null;
      if (tr.offset_hours_from_now !== undefined && tr.offset_hours_from_now !== '') {
        const nearExist = await client.query(
          `SELECT id FROM trips
           WHERE route_id = $1 AND bus_id IS NOT DISTINCT FROM $2 AND status = $3
             AND departure_time > NOW() + INTERVAL '1 hour'
             AND departure_time < NOW() + INTERVAL '18 hours'
           ORDER BY id ASC LIMIT 1`,
          [routeId, busId, status]
        );
        if (nearExist.rows.length > 0) {
          dbTripId = nearExist.rows[0].id;
        } else {
          const hrs = Number(tr.offset_hours_from_now) || 6;
          const ins = await client.query(
            `INSERT INTO trips (route_id, bus_id, departure_time, arrival_time, ticket_price, status)
             VALUES (
               $1, $2,
               date_trunc('minute', NOW() + ($3::numeric * INTERVAL '1 hour')),
               date_trunc('minute', NOW() + ($3::numeric * INTERVAL '1 hour')) + ($4::integer * INTERVAL '1 minute'),
               $5, $6
             )
             RETURNING id`,
            [routeId, busId, hrs, durationMins, ticketPrice, status]
          );
          dbTripId = ins.rows[0].id;
          tripsInserted += 1;
        }
      } else {
        const dayOffset = Number(tr.day_offset) || 1;
        const depMins = Math.round((Number(tr.departure_hour) || 8) * 60);
        const dayExist = await client.query(
          `SELECT id FROM trips
           WHERE route_id = $1 AND bus_id IS NOT DISTINCT FROM $2
             AND ABS(EXTRACT(EPOCH FROM (
               departure_time - (CURRENT_DATE + ($3::integer * INTERVAL '1 day') + ($4::integer * INTERVAL '1 minute'))
             ))) < 1800
           ORDER BY id ASC LIMIT 1`,
          [routeId, busId, dayOffset, depMins]
        );
        if (dayExist.rows.length > 0) {
          dbTripId = dayExist.rows[0].id;
        } else {
          const ins = await client.query(
            `INSERT INTO trips (route_id, bus_id, departure_time, arrival_time, ticket_price, status)
             VALUES (
               $1, $2,
               CURRENT_DATE + ($3::integer * INTERVAL '1 day') + ($4::integer * INTERVAL '1 minute'),
               CURRENT_DATE + ($3::integer * INTERVAL '1 day') + (($4::integer + $5::integer) * INTERVAL '1 minute'),
               $6, $7
             )
             RETURNING id`,
            [routeId, busId, dayOffset, depMins, durationMins, ticketPrice, status]
          );
          dbTripId = ins.rows[0].id;
          tripsInserted += 1;
        }
      }

      if (dbTripId && tr.trip_code) {
        tripIdByCode.set(tr.trip_code, dbTripId);
      }
    }
    log(`[6/8] Đã đồng bộ ${tripIdByCode.size} chuyến xe từ trips.csv (thêm mới: ${tripsInserted}).`);

    // ------------------------------------------------------------------
    // 7. Bảng trip_stops (trip_stops.csv)
    // ------------------------------------------------------------------
    const tripStopsCsv = parseCsvFile('trip_stops.csv');
    let stopsInserted = 0;

    // Nhóm điểm dừng mẫu theo db route_id
    const stopsByRouteId = new Map();
    for (const ts of tripStopsCsv) {
      const rId =
        (ts.route_name && routeIdByName.get(ts.route_name.toLowerCase())) ||
        (ts.route_id && routeIdByCsvId.get(String(ts.route_id)));
      const sId = ts.station_name && stationIdByName.get(ts.station_name.toLowerCase());
      if (!rId || !sId) continue;
      if (!stopsByRouteId.has(rId)) stopsByRouteId.set(rId, []);
      stopsByRouteId.get(rId).push({
        stationId: sId,
        stopType: ts.stop_type === 'dropoff' ? 'dropoff' : 'pickup',
        offsetMinutes: Number(ts.offset_minutes) || 0,
        stopOrder: Number(ts.stop_order) || 1,
      });
    }

    const { rows: allTripsInDb } = await client.query(
      'SELECT id, route_id, departure_time, arrival_time FROM trips ORDER BY id ASC'
    );
    for (const trip of allTripsInDb) {
      const routeStops = stopsByRouteId.get(trip.route_id);
      if (!routeStops || routeStops.length === 0) continue;
      for (const st of routeStops) {
        const exists = await client.query(
          `SELECT id FROM trip_stops
           WHERE trip_id = $1 AND station_id = $2 AND stop_type = $3
           LIMIT 1`,
          [trip.id, st.stationId, st.stopType]
        );
        if (exists.rows.length === 0) {
          await client.query(
            `INSERT INTO trip_stops (trip_id, station_id, stop_type, stop_time, stop_order)
             VALUES ($1, $2, $3, $4::timestamp + ($5::integer * INTERVAL '1 minute'), $6)`,
            [trip.id, st.stationId, st.stopType, trip.departure_time, st.offsetMinutes, st.stopOrder]
          );
          stopsInserted += 1;
        }
      }
    }
    log(`[7/8] Đã đồng bộ điểm đón/trả từ trip_stops.csv (thêm mới: ${stopsInserted} điểm dừng).`);

    // ------------------------------------------------------------------
    // 8. Bảng bookings & tickets (bookings.csv — từ phân bố nhu cầu Kaggle)
    // ------------------------------------------------------------------
    const bookingsCsv = parseCsvFile('bookings.csv');
    const validBookingStatuses = new Set(['pending', 'paid', 'expired', 'cancelled', 'checked_in']);
    const validTicketStatuses = new Set(['held', 'paid', 'checked_in', 'cancelled', 'expired']);
    const activeTicketStatuses = new Set(['held', 'paid', 'checked_in']);

    let bookingsInserted = 0;
    let ticketsInserted = 0;
    const fallbackTripId = [...tripIdByCode.values()][0] || (allTripsInDb[0] && allTripsInDb[0].id);

    for (const bk of bookingsCsv) {
      if (!bk.booking_code) continue;
      const tripId = (bk.trip_code && tripIdByCode.get(bk.trip_code)) || fallbackTripId;
      if (!tripId) continue;

      const userId = bk.passenger_email ? userIdByEmail.get(bk.passenger_email.toLowerCase()) || null : null;
      const seatCodes = String(bk.seat_codes || '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (seatCodes.length === 0) continue;

      const bookingStatus = validBookingStatuses.has(bk.status) ? bk.status : 'paid';
      const ticketStatus = validTicketStatuses.has(bk.ticket_status)
        ? bk.ticket_status
        : bookingStatus === 'pending'
          ? 'held'
          : bookingStatus;
      const totalAmount = Math.round(Number(bk.total_amount) || 300000);
      const refundAmount = Math.round(Number(bk.refund_amount) || 0);

      const { rows: pickupRows } = await client.query(
        "SELECT id FROM trip_stops WHERE trip_id = $1 AND stop_type = 'pickup' ORDER BY stop_order ASC LIMIT 1",
        [tripId]
      );
      const { rows: dropoffRows } = await client.query(
        "SELECT id FROM trip_stops WHERE trip_id = $1 AND stop_type = 'dropoff' ORDER BY stop_order DESC LIMIT 1",
        [tripId]
      );

      const { rows: insertedBk } = await client.query(
        `INSERT INTO bookings (
           booking_code, user_id, trip_id, pickup_stop_id, dropoff_stop_id,
           passenger_name, passenger_phone, passenger_email,
           seat_count, total_amount, status, hold_expires_at, refund_amount
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::varchar,
           CASE WHEN $11::varchar = 'pending' THEN NOW() + INTERVAL '10 minutes' ELSE NULL END,
           $12
         )
         ON CONFLICT (booking_code) DO NOTHING
         RETURNING id`,
        [
          bk.booking_code,
          userId,
          tripId,
          pickupRows[0] ? pickupRows[0].id : null,
          dropoffRows[0] ? dropoffRows[0].id : null,
          bk.passenger_name || 'Hành khách BusTicket',
          bk.passenger_phone || '0912345678',
          bk.passenger_email || 'khach1@gmail.com',
          seatCodes.length,
          totalAmount,
          bookingStatus,
          refundAmount,
        ]
      );

      if (insertedBk.length > 0) {
        bookingsInserted += 1;
        const bookingId = insertedBk[0].id;
        const unitPrice = Math.round(totalAmount / seatCodes.length);

        for (const seatCode of seatCodes) {
          // Kiểm tra chống trùng ghế active (idx_unique_active_seat_per_trip)
          if (activeTicketStatuses.has(ticketStatus)) {
            const seatBusy = await client.query(
              `SELECT id FROM tickets
               WHERE trip_id = $1 AND seat_code = $2 AND status IN ('held', 'paid', 'checked_in')
               LIMIT 1`,
              [tripId, seatCode]
            );
            if (seatBusy.rows.length > 0) continue;
          }

          const ticketCode = `TK-${bk.booking_code}-${seatCode}`.slice(0, 20);
          const { rows: insTk } = await client.query(
            `INSERT INTO tickets (booking_id, trip_id, seat_code, ticket_code, price, status, checked_in_at)
             VALUES ($1, $2, $3, $4, $5, $6::varchar, CASE WHEN $6::varchar = 'checked_in' THEN NOW() ELSE NULL END)
             ON CONFLICT (ticket_code) DO NOTHING
             RETURNING id`,
            [bookingId, tripId, seatCode, ticketCode, unitPrice, ticketStatus]
          );
          if (insTk.length > 0) ticketsInserted += 1;
        }
      }
    }
    log(`[8/8] Đã đồng bộ bookings.csv -> thêm mới ${bookingsInserted} đơn đặt vé & ${ticketsInserted} vé ghế điện tử.`);

    const { rows: countRows } = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM stations) AS stations,
        (SELECT COUNT(*)::int FROM routes) AS routes,
        (SELECT COUNT(*)::int FROM seat_layouts) AS seat_layouts,
        (SELECT COUNT(*)::int FROM buses) AS buses,
        (SELECT COUNT(*)::int FROM trips) AS trips,
        (SELECT COUNT(*)::int FROM trip_stops) AS trip_stops,
        (SELECT COUNT(*)::int FROM bookings) AS bookings,
        (SELECT COUNT(*)::int FROM tickets) AS tickets,
        (SELECT COUNT(*)::int FROM articles) AS articles
    `);

    if (!externalClient) await client.query('COMMIT');

    const counts = countRows[0];
    return {
      usersCount: counts.users,
      stationsCount: counts.stations,
      routesCount: counts.routes,
      busesCount: counts.buses,
      tripsCount: counts.trips,
      bookingsCount: counts.bookings,
      ticketsCount: counts.tickets,
      counts,
    };
  } catch (err) {
    if (!externalClient) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (!externalClient) client.release();
  }
}

async function runCli() {
  console.log('====================================================================');
  console.log(' ĐỒNG BỘ 9 TỆP CSV TỪ DỮ LIỆU THẬT KAGGLE -> 10 BẢNG POSTGRESQL');
  console.log('====================================================================');
  try {
    const result = await importKaggleDatasetToDb();
    console.log('\n📊 THỐNG KÊ 10 BẢNG TRONG POSTGRESQL SAU KHI NẠP DỮ LIỆU KAGGLE:');
    console.table(result.counts);
    console.log('✅ Hoàn tất nạp dữ liệu Kaggle chuẩn hóa cho toàn bộ 5 nhóm!');
  } catch (err) {
    console.error('❌ Lỗi khi nạp bộ dữ liệu CSV Kaggle:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  parseCsvFile,
  importKaggleDatasetToDb,
};
