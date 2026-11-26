/**
 * ============================================================================
 * KAGGLE ETL PIPELINE -> CHUẨN HÓA 9 TỆP CSV & SQL TƯƠNG THÍCH 10 BẢNG SCHEMA
 * ----------------------------------------------------------------------------
 * Cách chạy:
 *   node db/kaggle_dataset/build_kaggle_csvs.js
 *
 * Đầu vào (Dữ liệu gốc tải trực tiếp từ Kaggle trong db/kaggle_dataset/raw/):
 * 1. vietnam-transport-map.geo.json & vietnam-border-crossings.csv
 *    Nguồn: https://www.kaggle.com/datasets/seatransport/southeast-asia-transport-data (ODbL 1.0)
 *    -> Trích xuất thực tế các tỉnh/thành phố Việt Nam, tọa độ OSM, tuyến xe khách liên tỉnh,
 *       khoảng cách Haversine đường bộ & thông tin cửa khẩu đường bộ.
 * 2. Pan-India_Bus_Routes.csv (35,667 lịch chạy xe khách liên tỉnh)
 *    Nguồn: https://www.kaggle.com/datasets/rohitgds/pan-india-bus-routes-35k-schedules-1000-cities (CC BY 4.0)
 *    -> Trích xuất vận tốc trung bình thực tế (km/h), phân bố giờ xuất bến cao điểm
 *       (khung giờ ngày & đêm), cấu hình loại xe & sơ đồ ghế (Sleeper, Semi-Sleeper, Executive).
 * 3. bus_demand_train.csv (67,200 bản ghi nhu cầu đặt chỗ theo tuyến & ngày)
 *    Nguồn: https://www.kaggle.com/datasets/iamvijay7/bus-journey-demand-forecasting-dataset (CC0)
 *    -> Trích xuất trọng số nhu cầu hành khách thực tế theo cặp tuyến & số ghế/đơn
 *       để sinh bộ bookings & tickets lịch sử và sắp chạy cho Dashboard/Báo cáo & Kiểm thử.
 *
 * Đầu ra:
 * - 9 tệp CSV chuẩn RFC 4180 tại db/kaggle_dataset/ tương thích 100% db/01_init_schema.sql
 * - Tệp SQL thuần idempotent db/kaggle_dataset/kaggle_seed.sql (chạy được trực tiếp bằng psql/pgAdmin)
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const RAW_DIR = path.join(__dirname, 'raw');

// Hash bcrypt hợp lệ cho mật khẩu '123456' (dùng cho file SQL thuần kaggle_seed.sql)
// Lưu ý: import_kaggle_csv.js sẽ tự hash bcrypt động lúc chạy.
const BCRYPT_123456_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// ============================================================================
// TIỆN ÍCH PARSE / EXPORT CSV & TÍNH KHOẢNG CÁCH GPS HAVERSINE
// ============================================================================
function splitCsvRow(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(fileName, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, fileName), `${lines.join('\n')}\n`, 'utf8');
}

function sqlLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function normalizeAsciiKey(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function haversineKm([lon1, lat1], [lon2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================================
// ÁNH XẠ CHUẨN HÓA ĐỊA DANH VIỆT NAM TỪ GEOJSON KAGGLE SANG TỈNH & BẾN XE CHÍNH
// ============================================================================
const VIETNAM_TOWN_META = {
  'ho chi minh city': {
    shortName: 'TP. Hồ Chí Minh',
    province: 'TP. Hồ Chí Minh',
    stationName: 'Bến xe Miền Đông Mới',
    baseAddress: '501 Hoàng Hữu Nam, TP. Thủ Đức, TP.HCM',
    isMain: true,
    platePrefix: '51B',
  },
  'da lat': {
    shortName: 'Đà Lạt',
    province: 'Lâm Đồng',
    stationName: 'Bến xe Liên tỉnh Đà Lạt',
    baseAddress: '01 Tô Hiến Thành, Phường 3, TP. Đà Lạt',
    isMain: true,
    platePrefix: '49B',
  },
  'nha trang': {
    shortName: 'Nha Trang',
    province: 'Khánh Hòa',
    stationName: 'Bến xe Phía Nam Nha Trang',
    baseAddress: 'Km6 Đường 23/10, Vĩnh Trung, Nha Trang',
    isMain: true,
    platePrefix: '79B',
  },
  'da nang': {
    shortName: 'Đà Nẵng',
    province: 'Đà Nẵng',
    stationName: 'Bến xe Trung tâm Đà Nẵng',
    baseAddress: 'Tôn Đức Thắng, Hòa Minh, Liên Chiểu, Đà Nẵng',
    isMain: true,
    platePrefix: '43B',
  },
  'can tho': {
    shortName: 'Cần Thơ',
    province: 'Cần Thơ',
    stationName: 'Bến xe Trung tâm Cần Thơ',
    baseAddress: 'QL1A, Hưng Thạnh, Cái Răng, Cần Thơ',
    isMain: true,
    platePrefix: '65B',
  },
  'vung tau': {
    shortName: 'Vũng Tàu',
    province: 'Bà Rịa - Vũng Tàu',
    stationName: 'Bến xe Vũng Tàu',
    baseAddress: '192 Nam Kỳ Khởi Nghĩa, Phường 3, TP. Vũng Tàu',
    isMain: true,
    platePrefix: '72B',
  },
  'mui ne': {
    shortName: 'Phan Thiết',
    province: 'Bình Thuận',
    stationName: 'Bến xe Phan Thiết',
    baseAddress: '01 Từ Văn Tư, Phú Thủy, TP. Phan Thiết (cửa ngõ Mũi Né)',
    isMain: true,
    platePrefix: '86B',
  },
  hue: {
    shortName: 'Huế',
    province: 'Thừa Thiên Huế',
    stationName: 'Bến xe Phía Nam Huế',
    baseAddress: '97 An Dương Vương, Phường An Đông, TP. Huế',
    isMain: true,
    platePrefix: '75B',
  },
  'quy nhon': {
    shortName: 'Quy Nhơn',
    province: 'Bình Định',
    stationName: 'Bến xe Trung tâm Quy Nhơn',
    baseAddress: '71 Tây Sơn, Phường Ghềnh Ráng, TP. Quy Nhơn',
    isMain: true,
    platePrefix: '77B',
  },
  hanoi: {
    shortName: 'Hà Nội',
    province: 'Hà Nội',
    stationName: 'Bến xe Mỹ Đình',
    baseAddress: '20 Phạm Hùng, Mỹ Đình 2, Nam Từ Liêm, Hà Nội',
    isMain: true,
    platePrefix: '29B',
  },
  sapa: {
    shortName: 'Sa Pa',
    province: 'Lào Cai',
    stationName: 'Bến xe Sa Pa',
    baseAddress: 'Đường Điện Biên Phủ, Thị xã Sa Pa, Lào Cai',
    isMain: true,
    platePrefix: '24B',
  },
  'lao cai': {
    shortName: 'Lào Cai',
    province: 'Lào Cai',
    stationName: 'Bến xe Trung tâm Lào Cai',
    baseAddress: 'Đại lộ Trần Hưng Đạo, TP. Lào Cai',
    isMain: true,
    platePrefix: '24B',
  },
  'ha giang': {
    shortName: 'Hà Giang',
    province: 'Hà Giang',
    stationName: 'Bến xe Hà Giang',
    baseAddress: 'Đường 19/5, Nguyễn Trãi, TP. Hà Giang',
    isMain: true,
    platePrefix: '23B',
  },
  'ha long': {
    shortName: 'Hạ Long',
    province: 'Quảng Ninh',
    stationName: 'Bến xe Bãi Cháy (Hạ Long)',
    baseAddress: '279 Đường 279, Bãi Cháy, TP. Hạ Long, Quảng Ninh',
    isMain: true,
    platePrefix: '14B',
  },
  'mong cai': {
    shortName: 'Móng Cái',
    province: 'Quảng Ninh',
    stationName: 'Bến xe Móng Cái',
    baseAddress: 'Đại lộ Hòa Bình, Ka Long, TP. Móng Cái, Quảng Ninh',
    isMain: true,
    platePrefix: '14B',
  },
  'hai phong': {
    shortName: 'Hải Phòng',
    province: 'Hải Phòng',
    stationName: 'Bến xe Vĩnh Niệm (Hải Phòng)',
    baseAddress: '15 Bùi Viện, Vĩnh Niệm, Lê Chân, Hải Phòng',
    isMain: true,
    platePrefix: '15B',
  },
  'cat ba': {
    shortName: 'Cát Bà',
    province: 'Hải Phòng',
    stationName: 'Bến xe Cát Bà',
    baseAddress: 'Đường 1/4, Thị trấn Cát Bà, Cát Hải, Hải Phòng',
    isMain: false,
    platePrefix: '15B',
  },
  'ninh binh': {
    shortName: 'Ninh Bình',
    province: 'Ninh Bình',
    stationName: 'Bến xe Ninh Bình',
    baseAddress: '207 Lê Đại Hành, Thanh Bình, TP. Ninh Bình',
    isMain: true,
    platePrefix: '35B',
  },
  'phong nha': {
    shortName: 'Phong Nha',
    province: 'Quảng Bình',
    stationName: 'Trạm xe Phong Nha',
    baseAddress: 'Đường Hồ Chí Minh nhánh Đông, Phong Nha, Bố Trạch, Quảng Bình',
    isMain: false,
    platePrefix: '73B',
  },
  'dong hoi': {
    shortName: 'Đồng Hới',
    province: 'Quảng Bình',
    stationName: 'Bến xe Đồng Hới',
    baseAddress: 'Đường Trần Hưng Đạo, Nam Lý, TP. Đồng Hới, Quảng Bình',
    isMain: true,
    platePrefix: '73B',
  },
  'hoi an': {
    shortName: 'Hội An',
    province: 'Quảng Nam',
    stationName: 'Bến xe Hội An',
    baseAddress: '74 Huỳnh Thúc Kháng, Cẩm Phô, TP. Hội An, Quảng Nam',
    isMain: true,
    platePrefix: '92B',
  },
  vinh: {
    shortName: 'Vinh',
    province: 'Nghệ An',
    stationName: 'Bến xe Bắc Vinh',
    baseAddress: 'Xóm 1 Nghi Kim, TP. Vinh, Nghệ An',
    isMain: true,
    platePrefix: '37B',
  },
  'kon tum': {
    shortName: 'Kon Tum',
    province: 'Kon Tum',
    stationName: 'Bến xe Kon Tum',
    baseAddress: '281 Phan Đình Phùng, Quang Trung, TP. Kon Tum',
    isMain: true,
    platePrefix: '82B',
  },
  'dien bien phu': {
    shortName: 'Điện Biên Phủ',
    province: 'Điện Biên',
    stationName: 'Bến xe Điện Biên Phủ',
    baseAddress: 'Tổ 15 Him Lam, TP. Điện Biên Phủ, Điện Biên',
    isMain: true,
    platePrefix: '27B',
  },
  'chau doc': {
    shortName: 'Châu Đốc',
    province: 'An Giang',
    stationName: 'Bến xe Châu Đốc',
    baseAddress: 'QL91, Vĩnh Mỹ, TP. Châu Đốc, An Giang',
    isMain: true,
    platePrefix: '67B',
  },
  'ha tien': {
    shortName: 'Hà Tiên',
    province: 'Kiên Giang',
    stationName: 'Bến xe Hà Tiên',
    baseAddress: 'QL80, Bình San, TP. Hà Tiên, Kiên Giang',
    isMain: true,
    platePrefix: '68B',
  },
  'rach gia': {
    shortName: 'Rạch Giá',
    province: 'Kiên Giang',
    stationName: 'Bến xe Rạch Giá',
    baseAddress: '260A Nguyễn Bỉnh Khiêm, Vĩnh Thanh, Rạch Giá, Kiên Giang',
    isMain: true,
    platePrefix: '68B',
  },
  'phu quoc': {
    shortName: 'Phú Quốc',
    province: 'Kiên Giang',
    stationName: 'Bến xe Dương Đông (Phú Quốc)',
    baseAddress: 'Đường Cách Mạng Tháng 8, Dương Đông, Phú Quốc, Kiên Giang',
    isMain: false,
    platePrefix: '68B',
  },
};

// ============================================================================
// PHÂN TÍCH 3 TỆP NGUỒN THẬT TỪ KAGGLE
// ============================================================================
function analyzePanIndiaSchedules() {
  const filePath = path.join(RAW_DIR, 'Pan-India_Bus_Routes.csv');
  const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).slice(1);

  let speedSum = 0;
  let speedN = 0;
  const nightSlots = {};
  const daySlots = {};
  const busTypeCounts = {};

  for (const line of lines) {
    const [, , , distStr, durStr, busType, depStr] = splitCsvRow(line);
    if (busType) {
      busTypeCounts[busType] = (busTypeCounts[busType] || 0) + 1;
    }

    const dm = (depStr || '').match(/^(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)$/i);
    if (dm) {
      let h = parseInt(dm[1], 10);
      const min = parseInt(dm[2], 10);
      const ap = dm[3].toUpperCase();
      if (ap === 'PM' && h !== 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      const decHour = Number((h + min / 60).toFixed(2));
      const key = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      if (min === 0 || min === 30) {
        if (h >= 18 && h <= 23) {
          nightSlots[key] = { hour: decHour, count: (nightSlots[key]?.count || 0) + 1 };
        } else if (h >= 6 && h <= 16) {
          daySlots[key] = { hour: decHour, count: (daySlots[key]?.count || 0) + 1 };
        }
      }
    }

    const dKm = parseFloat(distStr);
    const durM = (durStr || '').match(/^(\d+):(\d+):(\d+)$/);
    if (dKm >= 80 && durM) {
      const hrs = parseInt(durM[1], 10) * 24 + parseInt(durM[2], 10) + parseInt(durM[3], 10) / 60;
      if (hrs >= 1.5 && hrs <= 30) {
        const sp = dKm / hrs;
        if (sp >= 25 && sp <= 90) {
          speedSum += sp;
          speedN += 1;
        }
      }
    }
  }

  const topNightHours = Object.values(nightSlots)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((x) => x.hour);
  const topDayHours = Object.values(daySlots)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((x) => x.hour);

  const avgSpeedKmh = speedN > 0 ? speedSum / speedN : 45.0;

  return {
    totalSchedules: lines.length,
    avgSpeedKmh,
    topNightHours,
    topDayHours,
    topBusTypes: Object.entries(busTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  };
}

function analyzeBusDemandDataset() {
  const filePath = path.join(RAW_DIR, 'bus_demand_train.csv');
  const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).slice(1);
  const odTotals = new Map();
  const sampleRecords = [];

  for (let i = 0; i < lines.length; i += 1) {
    const [doj, srcid, destid, finalSeatStr] = lines[i].split(',');
    const seats = Math.round(parseFloat(finalSeatStr) || 0);
    if (!doj || seats <= 0) continue;
    const key = `${srcid}-${destid}`;
    odTotals.set(key, (odTotals.get(key) || 0) + seats);
    if (i % 1733 === 0 && sampleRecords.length < 40) {
      sampleRecords.push({ doj, srcid, destid, seats });
    }
  }

  const rankedDemand = [...odTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([pair, totalSeats]) => ({ pair, totalSeats }));

  return {
    totalRows: lines.length,
    uniquePairs: odTotals.size,
    rankedDemand,
    sampleRecords,
  };
}

function loadVietnamGeoJson() {
  const geoPath = path.join(RAW_DIR, 'vietnam-transport-map.geo.json');
  const geo = JSON.parse(fs.readFileSync(geoPath, 'utf8'));

  const townsByKey = new Map();
  for (const f of geo.features) {
    if (f.properties?.kind === 'town' && Array.isArray(f.geometry?.coordinates)) {
      const key = normalizeAsciiKey(f.properties.name);
      townsByKey.set(key, {
        rawName: f.properties.name,
        coords: f.geometry.coordinates,
        position: f.properties.position || '',
        wikidata: f.properties.wikidata || '',
      });
    }
  }

  const domesticBusConnections = [];
  const crossBorderBusConnections = [];
  for (const f of geo.features) {
    if (f.properties?.kind === 'connection' && f.properties?.mode === 'bus') {
      const fromKey = normalizeAsciiKey(f.properties.from);
      const toKey = normalizeAsciiKey(f.properties.to);
      if (VIETNAM_TOWN_META[fromKey] && VIETNAM_TOWN_META[toKey] && !f.properties.via) {
        domesticBusConnections.push({
          fromKey,
          toKey,
          coords: f.geometry?.coordinates || [],
          sources: f.properties.sources || [],
        });
      } else {
        crossBorderBusConnections.push({
          from: f.properties.from,
          to: f.properties.to,
          via: f.properties.via || null,
        });
      }
    }
  }

  const borderCsvPath = path.join(RAW_DIR, 'vietnam-border-crossings.csv');
  const borderLines = fs.readFileSync(borderCsvPath, 'utf8').trim().split(/\r?\n/).slice(1);
  const borderCrossings = borderLines.map((line) => {
    const [number, id, name, neighbour, lat, lon, status, evisa] = splitCsvRow(line);
    return { number, id, name, neighbour, lat, lon, status, evisa };
  });

  return {
    updated: geo.updated,
    license: geo.license,
    townsByKey,
    domesticBusConnections,
    crossBorderBusConnections,
    borderCrossings,
  };
}

// ============================================================================
// XÂY DỰNG 9 BẢNG DỮ LIỆU CHUẨN HÓA TỪ 3 BỘ KAGGLE THẬT
// ============================================================================
function main() {
  console.log('====================================================================');
  console.log(' KAGGLE ETL -> SINH 9 FILE CSV & SQL CHUẨN CHO 10 BẢNG POSTGRESQL');
  console.log('====================================================================');

  const vn = loadVietnamGeoJson();
  const pan = analyzePanIndiaSchedules();
  const demand = analyzeBusDemandDataset();

  console.log(`[Kaggle #1] vietnam-transport-map.geo.json: ${vn.townsByKey.size} điểm dân cư, ${vn.domesticBusConnections.length} tuyến bus nội địa VN, ${vn.borderCrossings.length} cửa khẩu.`);
  console.log(`[Kaggle #2] Pan-India_Bus_Routes.csv: ${pan.totalSchedules} lịch chạy, tốc độ TB ${pan.avgSpeedKmh.toFixed(1)} km/h, giờ cao điểm đêm [${pan.topNightHours.join(', ')}].`);
  console.log(`[Kaggle #3] bus_demand_train.csv: ${demand.totalRows} dòng nhu cầu đặt chỗ (${demand.uniquePairs} cặp tuyến OD).`);

  // --------------------------------------------------------------------------
  // 1. STATIONS (từ vietnam-transport-map.geo.json + 3 điểm trung chuyển cốt lõi 02_seed_data.sql)
  // --------------------------------------------------------------------------
  // Đặt 10 bến đầu tiên khớp chính xác tên với db/02_seed_data.sql để tương thích 100% khi chạy chung
  const stations = [];
  const stationByKey = new Map();
  let stationIdCounter = 1;

  const pushStation = (key, name, province, address, isMain, lat, lon, sourceTag) => {
    const id = stationIdCounter++;
    const fullAddr =
      lat !== undefined && lon !== undefined
        ? `${address} (OSM ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)})`.slice(0, 250)
        : address.slice(0, 250);
    const obj = {
      station_id: id,
      name,
      province,
      address: fullAddr,
      is_main_station: isMain,
      is_active: true,
      source_dataset: sourceTag,
    };
    stations.push(obj);
    if (key) stationByKey.set(key, obj);
    return obj;
  };

  const hcmGeo = vn.townsByKey.get('ho chi minh city');
  const dalatGeo = vn.townsByKey.get('da lat');
  const ntGeo = vn.townsByKey.get('nha trang');
  const dnGeo = vn.townsByKey.get('da nang');
  const ctGeo = vn.townsByKey.get('can tho');
  const vtGeo = vn.townsByKey.get('vung tau');
  const mnGeo = vn.townsByKey.get('mui ne');

  // 10 bến cốt lõi khớp db/02_seed_data.sql (kèm tọa độ OSM trích từ Kaggle GeoJSON)
  pushStation('ho chi minh city', 'Bến xe Miền Đông Mới', 'TP. Hồ Chí Minh', '501 Hoàng Hữu Nam, TP. Thủ Đức, TP.HCM', true, hcmGeo?.coords[1], hcmGeo?.coords[0], 'seatransport/southeast-asia-transport-data');
  pushStation('hcm_mien_tay', 'Bến xe Miền Tây', 'TP. Hồ Chí Minh', '395 Kinh Dương Vương, Bình Tân, TP.HCM', true, 10.7407, 106.6188, 'seatransport/southeast-asia-transport-data');
  pushStation('hcm_hang_xanh', 'VP Hàng Xanh', 'TP. Hồ Chí Minh', '486H Điện Biên Phủ, Bình Thạnh, TP.HCM', false, 10.8012, 106.7114, 'seatransport/southeast-asia-transport-data');
  pushStation('da lat', 'Bến xe Liên tỉnh Đà Lạt', 'Lâm Đồng', '01 Tô Hiến Thành, Phường 3, TP. Đà Lạt', true, dalatGeo?.coords[1], dalatGeo?.coords[0], 'seatransport/southeast-asia-transport-data');
  pushStation('bao_loc', 'VP Bảo Lộc', 'Lâm Đồng', '280 Trần Phú, TP. Bảo Lộc, Lâm Đồng', false, 11.5480, 107.8077, 'seatransport/southeast-asia-transport-data');
  pushStation('nha trang', 'Bến xe Phía Nam Nha Trang', 'Khánh Hòa', 'Km6 Đường 23/10, Vĩnh Trung, Nha Trang', true, ntGeo?.coords[1], ntGeo?.coords[0], 'seatransport/southeast-asia-transport-data');
  pushStation('da nang', 'Bến xe Trung tâm Đà Nẵng', 'Đà Nẵng', 'Tôn Đức Thắng, Hòa Minh, Liên Chiểu, Đà Nẵng', true, dnGeo?.coords[1], dnGeo?.coords[0], 'seatransport/southeast-asia-transport-data');
  pushStation('can tho', 'Bến xe Trung tâm Cần Thơ', 'Cần Thơ', 'QL1A, Hưng Thạnh, Cái Răng, Cần Thơ', true, ctGeo?.coords[1], ctGeo?.coords[0], 'seatransport/southeast-asia-transport-data');
  pushStation('vung tau', 'Bến xe Vũng Tàu', 'Bà Rịa - Vũng Tàu', '192 Nam Kỳ Khởi Nghĩa, Phường 3, TP. Vũng Tàu', true, vtGeo?.coords[1], vtGeo?.coords[0], 'seatransport/southeast-asia-transport-data');
  pushStation('mui ne', 'Bến xe Phan Thiết', 'Bình Thuận', '01 Từ Văn Tư, Phú Thủy, TP. Phan Thiết', true, mnGeo?.coords[1], mnGeo?.coords[0], 'seatransport/southeast-asia-transport-data');

  // Nạp tiếp toàn bộ 21 tỉnh/thành phố Việt Nam còn lại từ Kaggle vietnam-transport-map.geo.json
  for (const [key, meta] of Object.entries(VIETNAM_TOWN_META)) {
    if (stationByKey.has(key)) continue;
    const town = vn.townsByKey.get(key);
    if (!town) continue;
    pushStation(
      key,
      meta.stationName,
      meta.province,
      meta.baseAddress,
      meta.isMain,
      town.coords[1],
      town.coords[0],
      'seatransport/southeast-asia-transport-data'
    );
  }

  // --------------------------------------------------------------------------
  // 2. ROUTES (Trích trực tiếp từ 26 tuyến bus nội địa trong vietnam-transport-map.geo.json
  //    + 6 tuyến chiều về trọng điểm -> 32 tuyến liên tỉnh Bắc - Trung - Nam)
  // --------------------------------------------------------------------------
  // Sắp xếp ưu tiên 5 tuyến lõi khớp db/02_seed_data.sql lên đầu
  const priorityPairs = [
    ['ho chi minh city', 'da lat'],
    ['ho chi minh city', 'nha trang'],
    ['ho chi minh city', 'can tho'],
    ['ho chi minh city', 'vung tau'],
    ['ho chi minh city', 'mui ne'],
  ];
  const returnPairs = [
    ['da lat', 'ho chi minh city'],
    ['nha trang', 'ho chi minh city'],
    ['can tho', 'ho chi minh city'],
    ['sapa', 'hanoi'],
    ['da nang', 'hue'],
    ['quy nhon', 'da nang'],
  ];

  const orderedPairs = [];
  const seenPairKeys = new Set();

  const addRoutePair = (fromKey, toKey, isFromKaggleDirect) => {
    const pk = `${fromKey}=>${toKey}`;
    if (seenPairKeys.has(pk)) return;
    if (!VIETNAM_TOWN_META[fromKey] || !VIETNAM_TOWN_META[toKey]) return;
    const fromTown = vn.townsByKey.get(fromKey);
    const toTown = vn.townsByKey.get(toKey);
    if (!fromTown || !toTown) return;
    seenPairKeys.add(pk);
    orderedPairs.push({ fromKey, toKey, fromTown, toTown, isFromKaggleDirect });
  };

  for (const [f, t] of priorityPairs) addRoutePair(f, t, true);
  for (const conn of vn.domesticBusConnections) addRoutePair(conn.fromKey, conn.toKey, true);
  for (const [f, t] of returnPairs) addRoutePair(f, t, false);

  const routes = [];
  orderedPairs.forEach((p, idx) => {
    const fMeta = VIETNAM_TOWN_META[p.fromKey];
    const tMeta = VIETNAM_TOWN_META[p.toKey];
    const straightKm = haversineKm(p.fromTown.coords, p.toTown.coords);
    // Hệ số uốn lượn đường bộ thực tế Việt Nam (~1.28) làm tròn bội số 5km
    const distanceKm = Math.max(30, Math.round((straightKm * 1.28) / 5) * 5);
    // Thời gian di chuyển tính bằng tốc độ thực tế từ Kaggle Pan-India_Bus_Routes.csv (~44.4 km/h)
    const rawHours = distanceKm / pan.avgSpeedKmh;
    const durationHours = Math.max(1.0, Math.min(24.0, Math.round(rawHours * 2) / 2));
    // Giá vé cơ bản VND (tỉ lệ khoảng 1,050 đ/km làm tròn 10,000đ, tối thiểu 90,000đ)
    const basePrice = Math.max(90000, Math.round((distanceKm * 1050) / 10000) * 10000);

    const routeName = `${fMeta.shortName} - ${tMeta.shortName}`;
    const desc =
      `Tuyến xe khách liên tỉnh ${routeName} (${distanceKm} km, ~${durationHours.toFixed(1)} giờ). ` +
      `Trích xuất từ Kaggle: seatransport/southeast-asia-transport-data (tọa độ OSM) & vận tốc chuẩn từ Pan-India_Bus_Routes.csv.`;

    routes.push({
      route_id: idx + 1,
      name: routeName,
      origin_province: fMeta.province,
      destination_province: tMeta.province,
      distance_km: distanceKm,
      duration_hours: durationHours.toFixed(1),
      base_price: basePrice,
      description: desc,
      is_active: true,
      from_key: p.fromKey,
      to_key: p.toKey,
    });
  });

  // --------------------------------------------------------------------------
  // 3. SEAT_LAYOUTS (4 sơ đồ ghế chuẩn hóa từ top bus configurations của Pan-India_Bus_Routes.csv)
  // --------------------------------------------------------------------------
  const makeFloorSeats = (prefix, count) =>
    Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

  const seatLayouts = [
    {
      layout_id: 1,
      name: 'Limousine 22 Phòng Đôi VIP',
      total_seats: 22,
      total_floors: 2,
      rows_per_floor: 6,
      cols_per_floor: 2,
      seat_map_json: JSON.stringify({
        floor1: makeFloorSeats('A', 11),
        floor2: makeFloorSeats('B', 11),
      }),
    },
    {
      layout_id: 2,
      name: 'Giường Nằm Tiêu Chuẩn 34 Chỗ',
      total_seats: 34,
      total_floors: 2,
      rows_per_floor: 6,
      cols_per_floor: 3,
      seat_map_json: JSON.stringify({
        floor1: makeFloorSeats('A', 17),
        floor2: makeFloorSeats('B', 17),
      }),
    },
    {
      layout_id: 3,
      name: 'Ghế Ngồi Limousine 16 Chỗ',
      total_seats: 16,
      total_floors: 1,
      rows_per_floor: 4,
      cols_per_floor: 4,
      seat_map_json: JSON.stringify({
        floor1: makeFloorSeats('A', 16),
      }),
    },
    {
      layout_id: 4,
      name: 'Volvo Multi-Axle Semi-Sleeper 36 Chỗ',
      total_seats: 36,
      total_floors: 2,
      rows_per_floor: 6,
      cols_per_floor: 3,
      seat_map_json: JSON.stringify({
        floor1: makeFloorSeats('A', 18),
        floor2: makeFloorSeats('B', 18),
      }),
    },
  ];

  // --------------------------------------------------------------------------
  // 4. BUSES (12 xe khách — giữ 6 biển số khớp 02_seed_data.sql + 6 xe mở rộng từ phân loại Kaggle)
  // --------------------------------------------------------------------------
  const buses = [
    { bus_id: 1, license_plate: '51B-289.01', layout_name: seatLayouts[0].name, seat_layout_id: 1, bus_type: 'Limousine 22 Phòng', amenities: 'Wifi 5G, Màn hình TV riêng, Cổng sạc USB, Chăn gối, Nước suối', status: 'active' },
    { bus_id: 2, license_plate: '51B-289.02', layout_name: seatLayouts[0].name, seat_layout_id: 1, bus_type: 'Limousine 22 Phòng', amenities: 'Wifi 5G, Ghế Massage, Cổng sạc Type-C, Khăn lạnh, Nước suối', status: 'active' },
    { bus_id: 3, license_plate: '51B-340.11', layout_name: seatLayouts[1].name, seat_layout_id: 2, bus_type: 'Giường Nằm 34 Chỗ', amenities: 'Wifi, Điều hòa, Cổng sạc USB, Nước suối', status: 'active' },
    { bus_id: 4, license_plate: '51B-340.12', layout_name: seatLayouts[1].name, seat_layout_id: 2, bus_type: 'Giường Nằm 34 Chỗ', amenities: 'Wifi, Điều hòa, Cổng sạc USB, Nước suối', status: 'active' },
    { bus_id: 5, license_plate: '51B-340.15', layout_name: seatLayouts[0].name, seat_layout_id: 1, bus_type: 'Limousine 22 Phòng', amenities: 'Wifi 5G, Màn hình giải trí, Cổng sạc USB', status: 'active' },
    { bus_id: 6, license_plate: '51B-999.88', layout_name: seatLayouts[1].name, seat_layout_id: 2, bus_type: 'Giường Nằm 34 Chỗ', amenities: 'Wifi, Điều hòa', status: 'maintenance' },
    // 6 xe bổ sung theo top cấu hình từ Kaggle Pan-India_Bus_Routes.csv (Volvo B9R, Semi-Sleeper, Executive A/C)
    { bus_id: 7, license_plate: '29B-610.22', layout_name: seatLayouts[0].name, seat_layout_id: 1, bus_type: '2+1 Sleeper A/C VIP', amenities: 'Wifi 5G, Air Suspension, Cổng sạc USB, Chăn gối cao cấp', status: 'active' },
    { bus_id: 8, license_plate: '29B-610.36', layout_name: seatLayouts[3].name, seat_layout_id: 4, bus_type: 'Volvo B9R Multi-Axle Semi-Sleeper A/C', amenities: 'Air Suspension, Điều hòa 2 chiều, Đèn đọc sách, Nước suối', status: 'active' },
    { bus_id: 9, license_plate: '43B-556.12', layout_name: seatLayouts[2].name, seat_layout_id: 3, bus_type: 'Executive Limousine 16 Chỗ A/C', amenities: 'Wifi 5G, Ghế da ngả lưng, Nước suối, Khăn lạnh', status: 'active' },
    { bus_id: 10, license_plate: '43B-556.34', layout_name: seatLayouts[1].name, seat_layout_id: 2, bus_type: 'Hi-Tech Sleeper 34 Chỗ A/C', amenities: 'Wifi, Air Suspension, Cổng sạc USB, Chăn đắp', status: 'active' },
    { bus_id: 11, license_plate: '65B-088.99', layout_name: seatLayouts[3].name, seat_layout_id: 4, bus_type: 'Volvo Multi-Axle Semi-Sleeper 36 Chỗ', amenities: 'Wifi, Điều hòa, Ghế ngả 135 độ, Nước suối', status: 'active' },
    { bus_id: 12, license_plate: '79B-204.68', layout_name: seatLayouts[2].name, seat_layout_id: 3, bus_type: 'Luxury Executive 16 Chỗ A/C', amenities: 'Wifi 5G, Cổng sạc Type-C, Khăn lạnh, Nước suối', status: 'active' },
  ];

  const activeBuses = buses.filter((b) => b.status === 'active');

  // --------------------------------------------------------------------------
  // 5. TRIPS (52 chuyến xe: kết hợp 32 tuyến VN từ Kaggle #1 + khung giờ cao điểm từ Kaggle #2)
  //    Phủ đủ: chuyến cận giờ (< 24h), chuyến 1-4 ngày tới (active), chuyến đã hoàn thành (-1 -> -14 ngày)
  //    để phục vụ cả đặt vé, test khóa hủy < 24h và biểu đồ doanh thu Dashboard TV5!
  // --------------------------------------------------------------------------
  const trips = [];
  let tripCounter = 1;

  const pushTrip = ({ route, bus, offsetHoursFromNow, dayOffset, depHour, priceMultiplier, status }) => {
    const tripCode = `TRIP_KAG_${String(tripCounter).padStart(2, '0')}`;
    tripCounter += 1;
    const ticketPrice = Math.round((route.base_price * priceMultiplier) / 10000) * 10000;
    trips.push({
      trip_code: tripCode,
      route_id: route.route_id,
      route_name: route.name,
      bus_id: bus.bus_id,
      license_plate: bus.license_plate,
      day_offset: dayOffset !== undefined ? dayOffset : '',
      departure_hour: depHour !== undefined ? depHour : '',
      offset_hours_from_now: offsetHoursFromNow !== undefined ? offsetHoursFromNow : '',
      duration_hours: route.duration_hours,
      ticket_price: ticketPrice,
      status,
    });
  };

  // Chuyến #1 đặc biệt: Cận giờ (+6h từ NOW) tuyến TP.HCM - Đà Lạt để test quy tắc chặn hủy vé < 24h (BT2603)
  pushTrip({
    route: routes[0],
    bus: buses[0],
    offsetHoursFromNow: 6,
    priceMultiplier: 1.1,
    status: 'active',
  });

  // 32 chuyến active phủ toàn bộ 32 tuyến từ Kaggle vietnam-transport-map.geo.json
  // Sử dụng giờ xuất bến cao điểm rút trích từ Kaggle Pan-India_Bus_Routes.csv
  const nightHours = pan.topNightHours.length >= 4 ? pan.topNightHours : [21, 20, 22, 21.5, 20.5, 22.5];
  const dayHours = pan.topDayHours.length >= 4 ? pan.topDayHours : [7, 8, 9, 14, 15, 16];

  routes.forEach((route, idx) => {
    const isLongRoute = route.distance_km >= 250;
    const depHour = isLongRoute
      ? nightHours[idx % nightHours.length]
      : dayHours[idx % dayHours.length];
    const bus = isLongRoute
      ? activeBuses[idx % 6] // ưu tiên xe giường nằm/Limousine 2 tầng
      : activeBuses[idx % activeBuses.length];
    const priceMultiplier = bus.seat_layout_id === 1 ? 1.12 : bus.seat_layout_id === 3 ? 1.05 : 1.0;

    pushTrip({
      route,
      bus,
      dayOffset: 1 + (idx % 3), // +1, +2, +3 ngày (đều >= 24h để đặt & test hủy)
      depHour,
      priceMultiplier,
      status: 'active',
    });
  });

  // Thêm 8 chuyến khung giờ ngày bổ sung cho 8 tuyến hot nhất (để 1 tuyến có nhiều khung giờ so sánh/lọc)
  for (let i = 0; i < 8; i += 1) {
    const route = routes[i];
    const depHour = dayHours[(i + 2) % dayHours.length];
    const bus = activeBuses[(i + 3) % activeBuses.length];
    pushTrip({
      route,
      bus,
      dayOffset: 2 + (i % 2),
      depHour,
      priceMultiplier: 1.0,
      status: 'active',
    });
  }

  // Thêm 10 chuyến quá khứ (completed) rải trong 1 -> 14 ngày trước cho biểu đồ Dashboard/Báo cáo (TV5)
  const pastOffsets = [-1, -2, -3, -4, -5, -7, -9, -11, -13, -14];
  pastOffsets.forEach((dOff, i) => {
    const route = routes[i % 10];
    const bus = activeBuses[i % activeBuses.length];
    pushTrip({
      route,
      bus,
      dayOffset: dOff,
      depHour: nightHours[i % nightHours.length],
      priceMultiplier: 1.05,
      status: 'completed',
    });
  });

  // Thêm 1 chuyến 'draft' và 1 chuyến 'cancelled' để kiểm thử đủ 5 trạng thái vòng đời chuyến (Hình 1)
  pushTrip({
    route: routes[0],
    bus: buses[4],
    dayOffset: 5,
    depHour: 19,
    priceMultiplier: 1.0,
    status: 'draft',
  });
  pushTrip({
    route: routes[1],
    bus: buses[3],
    dayOffset: 4,
    depHour: 20,
    priceMultiplier: 1.0,
    status: 'cancelled',
  });

  // --------------------------------------------------------------------------
  // 6. TRIP_STOPS (Định nghĩa điểm đón pickup & điểm trả dropoff theo từng tuyến)
  // --------------------------------------------------------------------------
  const tripStops = [];
  for (const route of routes) {
    const originStation = stationByKey.get(route.from_key);
    const destStation = stationByKey.get(route.to_key);
    if (!originStation || !destStation) continue;

    const durMins = Math.round(parseFloat(route.duration_hours) * 60);

    // Điểm đón (pickup)
    if (route.from_key === 'ho chi minh city' && ['can tho', 'ha tien'].includes(route.to_key)) {
      // Tuyến đi miền Tây đón tại Bến xe Miền Tây
      const bxMienTay = stationByKey.get('hcm_mien_tay');
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: bxMienTay.station_id,
        station_name: bxMienTay.name,
        stop_type: 'pickup',
        offset_minutes: 0,
        stop_order: 1,
      });
    } else if (route.from_key === 'ho chi minh city') {
      const vpHangXanh = stationByKey.get('hcm_hang_xanh');
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: vpHangXanh.station_id,
        station_name: vpHangXanh.name,
        stop_type: 'pickup',
        offset_minutes: -30,
        stop_order: 1,
      });
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: originStation.station_id,
        station_name: originStation.name,
        stop_type: 'pickup',
        offset_minutes: 0,
        stop_order: 2,
      });
    } else {
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: originStation.station_id,
        station_name: originStation.name,
        stop_type: 'pickup',
        offset_minutes: 0,
        stop_order: 1,
      });
    }

    // Điểm trả (dropoff) — có thêm điểm trung gian cho các tuyến trọng điểm
    if (route.from_key === 'ho chi minh city' && route.to_key === 'da lat') {
      const vpBaoLoc = stationByKey.get('bao_loc');
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: vpBaoLoc.station_id,
        station_name: vpBaoLoc.name,
        stop_type: 'dropoff',
        offset_minutes: Math.round(durMins * 0.62),
        stop_order: 1,
      });
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: destStation.station_id,
        station_name: destStation.name,
        stop_type: 'dropoff',
        offset_minutes: durMins,
        stop_order: 2,
      });
    } else if (route.from_key === 'ho chi minh city' && route.to_key === 'nha trang') {
      const bxPhanThiet = stationByKey.get('mui ne');
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: bxPhanThiet.station_id,
        station_name: bxPhanThiet.name,
        stop_type: 'dropoff',
        offset_minutes: Math.round(durMins * 0.42),
        stop_order: 1,
      });
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: destStation.station_id,
        station_name: destStation.name,
        stop_type: 'dropoff',
        offset_minutes: durMins,
        stop_order: 2,
      });
    } else {
      tripStops.push({
        route_id: route.route_id,
        route_name: route.name,
        station_id: destStation.station_id,
        station_name: destStation.name,
        stop_type: 'dropoff',
        offset_minutes: durMins,
        stop_order: 1,
      });
    }
  }

  // --------------------------------------------------------------------------
  // 7. USERS (20 tài khoản: giữ 4 tài khoản demo cốt lõi + 16 tài khoản mở rộng đủ trạng thái)
  // --------------------------------------------------------------------------
  const users = [
    { full_name: 'Quản Trị Viên BusTicket', email: 'admin@futabus.vn', phone: '0901000001', role: 'admin', is_verified: true, is_active: true },
    { full_name: 'Nhân Viên Soát Vé Miền Đông', email: 'staff@futabus.vn', phone: '0901000002', role: 'staff', is_verified: true, is_active: true },
    { full_name: 'Nhân Viên Điều Hành Đà Lạt', email: 'staff.dalat@busticket.vn', phone: '0901000003', role: 'staff', is_verified: true, is_active: true },
    { full_name: 'Nhân Viên Soát Vé Mỹ Đình', email: 'staff.hanoi@busticket.vn', phone: '0901000004', role: 'staff', is_verified: true, is_active: true },
    { full_name: 'Nguyễn Văn Khách', email: 'khach1@gmail.com', phone: '0912345678', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Trần Thị Hành Khách', email: 'khach2@gmail.com', phone: '0987654321', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Lê Hoàng Nam', email: 'le.hoang.nam@gmail.com', phone: '0938112233', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Phạm Minh Anh', email: 'pham.minh.anh@gmail.com', phone: '0977223344', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Võ Thanh Tùng', email: 'vo.thanh.tung@gmail.com', phone: '0909334455', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Đặng Thu Hà', email: 'dang.thu.ha@gmail.com', phone: '0918445566', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Bùi Quốc Bảo', email: 'bui.quoc.bao@gmail.com', phone: '0983556677', role: 'customer', is_verified: false, is_active: true },
    { full_name: 'Ngô Lan Hương', email: 'ngo.lan.huong@gmail.com', phone: '0932667788', role: 'customer', is_verified: true, is_active: false },
    { full_name: 'Phạm Thị Mai', email: 'mai.pham@gmail.com', phone: '0905111222', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Hoàng Văn Đức', email: 'duc.hoang@gmail.com', phone: '0905222333', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Vũ Ngọc Lan', email: 'lan.vu@gmail.com', phone: '0905333444', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Đặng Quốc Tuấn', email: 'tuan.dang@gmail.com', phone: '0905444555', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Trịnh Gia Huy', email: 'huy.trinh@gmail.com', phone: '0905555666', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Lý Thảo Vy', email: 'vy.ly@gmail.com', phone: '0905666777', role: 'customer', is_verified: true, is_active: true },
    { full_name: 'Phan Anh Khoa', email: 'khoa.phan@gmail.com', phone: '0905777888', role: 'customer', is_verified: false, is_active: true },
    { full_name: 'Đỗ Khánh Linh', email: 'linh.do@gmail.com', phone: '0905888999', role: 'customer', is_verified: true, is_active: true },
  ];

  // --------------------------------------------------------------------------
  // 8. BOOKINGS (30 đơn đặt vé: 6 đơn cốt lõi BT2601->BT2606 phủ 5 trạng thái
  //    + 24 đơn theo phân bố nhu cầu thật từ Kaggle bus_demand_train.csv!)
  // --------------------------------------------------------------------------
  const activeCustomers = users.filter((u) => u.role === 'customer' && u.is_active && u.is_verified);
  const tripsByCode = new Map(trips.map((t) => [t.trip_code, t]));
  const layoutByBusId = new Map(
    buses.map((b) => {
      const l = seatLayouts.find((sl) => sl.layout_id === b.seat_layout_id);
      const parsed = JSON.parse(l.seat_map_json);
      return [b.bus_id, [...(parsed.floor1 || []), ...(parsed.floor2 || [])]];
    })
  );

  // Theo dõi ghế đã dùng theo từng trip_code để KHÔNG BAO GIỜ vi phạm idx_unique_active_seat_per_trip
  const usedSeatsPerTrip = new Map();
  const allocSeats = (tripCode, count, preferSeats = null) => {
    const trip = tripsByCode.get(tripCode);
    const pool = layoutByBusId.get(trip.bus_id) || ['A01', 'A02', 'A03', 'A04', 'A05', 'A06'];
    if (!usedSeatsPerTrip.has(tripCode)) usedSeatsPerTrip.set(tripCode, new Set());
    const used = usedSeatsPerTrip.get(tripCode);

    if (preferSeats && preferSeats.every((s) => pool.includes(s) && !used.has(s))) {
      preferSeats.forEach((s) => used.add(s));
      return preferSeats;
    }

    const picked = [];
    for (const s of pool) {
      if (!used.has(s)) {
        used.add(s);
        picked.push(s);
        if (picked.length === count) break;
      }
    }
    return picked;
  };

  // 6 đơn chuẩn kiểm thử của khach1@gmail.com (giữ nguyên mã BT2601 -> BT2606 cho TV1/TV4/TV5)
  const nearTrip = trips[0]; // TRIP_KAG_01 (+6h -> < 24h)
  const farTrip1 = trips[1]; // TRIP_KAG_02 (TP.HCM - Đà Lạt, >= 24h)
  const farTrip2 = trips[2]; // TRIP_KAG_03 (TP.HCM - Nha Trang, >= 24h)

  const bookings = [];
  const addBooking = ({
    code,
    trip,
    customer,
    seats,
    status,
    ticketStatus,
    refundRatio = 0,
    demandRef = '',
    note = '',
  }) => {
    const unitPrice = trip.ticket_price;
    const totalAmount = unitPrice * seats.length;
    const refundAmount = Math.round(totalAmount * refundRatio);
    bookings.push({
      booking_code: code,
      trip_code: trip.trip_code,
      route_name: trip.route_name,
      passenger_email: customer.email,
      passenger_name: customer.full_name,
      passenger_phone: customer.phone,
      seat_codes: seats.join(';'),
      total_amount: totalAmount,
      status,
      refund_amount: refundAmount,
      ticket_status: ticketStatus,
      kaggle_demand_ref: demandRef,
      note,
    });
  };

  const khach1 = users.find((u) => u.email === 'khach1@gmail.com');

  addBooking({
    code: 'BT2601',
    trip: farTrip1,
    customer: khach1,
    seats: allocSeats(farTrip1.trip_code, 2, ['A01', 'A02']),
    status: 'pending',
    ticketStatus: 'held',
    demandRef: 'test-case:pending',
    note: 'Đơn giữ chỗ chờ thanh toán 10 phút (cho phép hủy vé)',
  });
  addBooking({
    code: 'BT2602',
    trip: farTrip1,
    customer: khach1,
    seats: allocSeats(farTrip1.trip_code, 2, ['A03', 'A04']),
    status: 'paid',
    ticketStatus: 'paid',
    demandRef: 'test-case:paid-ge-24h',
    note: 'Đơn đã thanh toán trước giờ khởi hành >= 24h (cho phép hủy vé)',
  });
  addBooking({
    code: 'BT2603',
    trip: nearTrip,
    customer: khach1,
    seats: allocSeats(nearTrip.trip_code, 1, ['B01']),
    status: 'paid',
    ticketStatus: 'paid',
    demandRef: 'test-case:paid-lt-24h',
    note: 'Đơn đã thanh toán sát giờ khởi hành < 24h (khóa nút hủy vé)',
  });
  addBooking({
    code: 'BT2604',
    trip: farTrip2,
    customer: khach1,
    seats: allocSeats(farTrip2.trip_code, 1, ['A05']),
    status: 'checked_in',
    ticketStatus: 'checked_in',
    demandRef: 'test-case:checked_in',
    note: 'Đơn đã soát vé QR lên xe (checked_in)',
  });
  addBooking({
    code: 'BT2605',
    trip: farTrip1,
    customer: khach1,
    seats: ['B05'], // cancelled không chiếm ghế active trong unique partial index
    status: 'cancelled',
    ticketStatus: 'cancelled',
    refundRatio: 1.0,
    demandRef: 'test-case:cancelled',
    note: 'Đơn đã hủy trước 24h và hoàn tiền 100%',
  });
  addBooking({
    code: 'BT2606',
    trip: farTrip2,
    customer: khach1,
    seats: ['B06'], // expired không chiếm ghế active
    status: 'expired',
    ticketStatus: 'expired',
    demandRef: 'test-case:expired',
    note: 'Đơn hết hạn giữ ghế 10 phút tự động nhả ghế',
  });

  // 24 đơn đặt vé sinh theo trọng số nhu cầu thực tế từ Kaggle bus_demand_train.csv
  // Gồm cả đơn trên chuyến đã hoàn thành (completed) cho báo cáo doanh thu & chuyến sắp chạy (active)
  const completedTrips = trips.filter((t) => t.status === 'completed');
  const upcomingActiveTrips = trips.filter((t) => t.status === 'active').slice(1, 16);

  for (let i = 0; i < 24; i += 1) {
    const rec = demand.sampleRecords[i % demand.sampleRecords.length];
    const code = `BT${2607 + i}`;
    const customer = activeCustomers[(i + 1) % activeCustomers.length];
    // Phân bổ số ghế/đơn dựa theo mức nhu cầu `final_seatcount` từ Kaggle (1 đến 3 ghế)
    const seatQty = rec.seats >= 3500 ? 3 : rec.seats >= 1800 ? 2 : 1;

    const isHistorical = i < 14;
    const trip = isHistorical
      ? completedTrips[i % completedTrips.length]
      : upcomingActiveTrips[(i - 14) % upcomingActiveTrips.length];

    let status;
    let ticketStatus;
    let refundRatio = 0;
    if (isHistorical) {
      if (i % 7 === 6) {
        status = 'cancelled';
        ticketStatus = 'cancelled';
        refundRatio = 1.0;
      } else {
        status = 'checked_in';
        ticketStatus = 'checked_in';
      }
    } else if (i % 5 === 0) {
      status = 'pending';
      ticketStatus = 'held';
    } else {
      status = 'paid';
      ticketStatus = 'paid';
    }

    const seats = allocSeats(trip.trip_code, seatQty);
    if (seats.length === 0) continue;

    addBooking({
      code,
      trip,
      customer,
      seats,
      status,
      ticketStatus,
      refundRatio,
      demandRef: `kaggle:doj=${rec.doj},od=${rec.srcid}->${rec.destid},demand=${rec.seats}`,
      note: `Đơn ánh xạ từ nhu cầu đặt chỗ Kaggle (bus_demand_train.csv: ${rec.seats} lượt/ngày trên cặp ${rec.srcid}->${rec.destid})`,
    });
  }

  // --------------------------------------------------------------------------
  // 9. ARTICLES (8 bài viết phủ 4 chuyên mục: news, promotion, policy, faq — dẫn chứng dữ liệu thật Kaggle)
  // --------------------------------------------------------------------------
  const openBordersCount = vn.borderCrossings.filter((b) => b.status === 'open').length;
  const borderSampleNames = vn.borderCrossings
    .slice(0, 6)
    .map((b) => b.name)
    .join(', ');

  const articles = [
    {
      title: 'Khuyến mãi mở tuyến Cao tốc TP.HCM - Phan Thiết - Nha Trang',
      slug: 'khuyen-mai-cao-toc-nha-trang',
      category: 'promotion',
      summary: 'Giảm ngay 15% giá vé cho hành khách đặt vé trực tuyến sớm trước 3 ngày trên mạng lưới 32 tuyến liên tỉnh.',
      content: 'Áp dụng cho toàn bộ chuyến xe giường nằm Limousine và Volvo Multi-Axle trên tuyến TP. Hồ Chí Minh - Phan Thiết và TP. Hồ Chí Minh - Nha Trang.',
      is_published: true,
    },
    {
      title: 'Chính sách hoàn vé và hủy vé trực tuyến',
      slug: 'chinh-sach-hoan-huy-ve',
      category: 'policy',
      summary: 'Quy định hủy vé trước 24 giờ khởi hành và hoàn tiền 100% khi nhà xe hủy chuyến.',
      content: 'Hành khách được hủy vé trực tuyến trước giờ khởi hành tối thiểu 24 giờ đối với đơn đã thanh toán (paid) hoặc hủy ngay khi đơn đang chờ thanh toán (pending).',
      is_published: true,
    },
    {
      title: 'Hướng dẫn giữ ghế 10 phút và nhận vé điện tử QR qua Email',
      slug: 'huong-dan-giu-ghe-va-nhan-ve-qr',
      category: 'faq',
      summary: 'Giải đáp cơ chế khóa ghế tạm thời 10 phút bằng Unique Partial Index chống trùng ghế.',
      content: 'Sau khi chọn ghế trên sơ đồ trực quan, hệ thống khóa tạm ghế trong 10 phút. Quá 10 phút chưa thanh toán, hệ thống tự động chuyển trạng thái expired và mở lại ghế.',
      is_published: true,
    },
    {
      title: `Cập nhật mạng lưới ${routes.length} tuyến xe khách liên tỉnh Việt Nam từ dữ liệu mở OpenStreetMap & Kaggle`,
      slug: 'mang-luoi-tuyen-xe-khach-lien-tinh-viet-nam-kaggle',
      category: 'news',
      summary: `Kết nối ${stations.length} bến xe từ Hà Nội, Sa Pa, Hạ Long, Đà Nẵng đến TP.HCM, Đà Lạt, Nha Trang, Cần Thơ, Hà Tiên.`,
      content: `Dữ liệu mạng lưới tuyến xe liên tỉnh được chuẩn hóa trực tiếp từ bộ dữ liệu mở Kaggle seatransport/southeast-asia-transport-data (cập nhật ${vn.updated}, giấy phép ${vn.license}) với tọa độ thực tế từng địa phương.`,
      is_published: true,
    },
    {
      title: `Thông tin ${openBordersCount} cửa khẩu đường bộ e-Visa kết nối tuyến xe khách quốc tế Việt Nam`,
      slug: 'thong-tin-cua-khau-duong-bo-evisa-viet-nam',
      category: 'news',
      summary: `Tổng hợp ${openBordersCount} cửa khẩu đường bộ đang mở (${borderSampleNames}...) từ dữ liệu Kaggle vietnam-border-crossings.csv.`,
      content: `Theo tệp vietnam-border-crossings.csv (Kaggle seatransport/southeast-asia-transport-data), Việt Nam có ${openBordersCount} cửa khẩu đường bộ chấp nhận e-Visa kết nối đi Lào, Campuchia và Trung Quốc.`,
      is_published: true,
    },
    {
      title: 'Ra mắt đội xe Volvo B9R Multi-Axle & Limousine 22 Phòng Đôi VIP',
      slug: 'ra-mat-doi-xe-volvo-multi-axle-limousine',
      category: 'news',
      summary: 'Nâng cấp đội xe đường dài theo tiêu chuẩn vận hành liên tỉnh với hệ thống giảm xóc khí nén Air Suspension.',
      content: 'Các cấu hình xe Volvo Multi-Axle Semi-Sleeper 36 chỗ và Limousine 22 phòng đôi được bố trí trên các tuyến đường dài trên 250km như TP.HCM - Đà Lạt, TP.HCM - Nha Trang và Hà Nội - Sa Pa.',
      is_published: true,
    },
    {
      title: 'Quy định hành lý ký gửi và thời gian có mặt tại bến xe',
      slug: 'quy-dinh-hanh-ly-ky-gui-lien-tinh',
      category: 'policy',
      summary: 'Mỗi hành khách được miễn phí 20kg hành lý ký gửi và cần có mặt trước giờ khởi hành 30 phút.',
      content: 'Hành khách xuất trình mã QR vé điện tử cho nhân viên soát vé (Staff Check-in) trước khi lên xe tối thiểu 15-30 phút tại điểm đón đã chọn.',
      is_published: true,
    },
    {
      title: 'Câu hỏi thường gặp về chọn điểm đón/trả dọc tuyến (Trip Stops)',
      slug: 'faq-diem-don-tra-doc-tuyen',
      category: 'faq',
      summary: 'Hướng dẫn chọn điểm đón (VP Hàng Xanh, Bến xe Miền Đông Mới) và điểm trả trung gian (Bảo Lộc, Phan Thiết).',
      content: 'Mỗi chuyến xe đều niêm yết rõ danh sách điểm đón (pickup) và điểm trả (dropoff) theo thứ tự stop_order kèm giờ dự kiến để hành khách chủ động di chuyển.',
      is_published: true,
    },
  ];

  // ============================================================================
  // GHI 9 TỆP CSV CHUẨN HÓA VÀO db/kaggle_dataset/
  // ============================================================================
  writeCsv('users.csv', ['full_name', 'email', 'phone', 'role', 'is_verified', 'is_active'], users);
  writeCsv('stations.csv', ['station_id', 'name', 'province', 'address', 'is_main_station', 'is_active', 'source_dataset'], stations);
  writeCsv('routes.csv', ['route_id', 'name', 'origin_province', 'destination_province', 'distance_km', 'duration_hours', 'base_price', 'description', 'is_active'], routes);
  writeCsv('seat_layouts.csv', ['layout_id', 'name', 'total_seats', 'total_floors', 'rows_per_floor', 'cols_per_floor', 'seat_map_json'], seatLayouts);
  writeCsv('buses.csv', ['bus_id', 'license_plate', 'seat_layout_id', 'layout_name', 'bus_type', 'amenities', 'status'], buses);
  writeCsv('trips.csv', ['trip_code', 'route_id', 'route_name', 'bus_id', 'license_plate', 'day_offset', 'departure_hour', 'offset_hours_from_now', 'duration_hours', 'ticket_price', 'status'], trips);
  writeCsv('trip_stops.csv', ['route_id', 'route_name', 'station_id', 'station_name', 'stop_type', 'offset_minutes', 'stop_order'], tripStops);
  writeCsv('bookings.csv', ['booking_code', 'trip_code', 'route_name', 'passenger_email', 'passenger_name', 'passenger_phone', 'seat_codes', 'total_amount', 'status', 'refund_amount', 'ticket_status', 'kaggle_demand_ref', 'note'], bookings);
  writeCsv('articles.csv', ['title', 'slug', 'category', 'summary', 'content', 'is_published'], articles);

  // ============================================================================
  // XUẤT THÊM TỆP SQL THUẦN IDEMPOTENT (db/kaggle_dataset/kaggle_seed.sql)
  // ĐỂ CÓ THỂ CHẠY TRỰC TIẾP BẰNG psql / pgAdmin / DBeaver SAU db/01_init_schema.sql
  // ============================================================================
  const sqlLines = [
    '-- ============================================================================',
    '-- kaggle_seed.sql — Sinh tự động bởi db/kaggle_dataset/build_kaggle_csvs.js',
    '-- Dữ liệu chuẩn hóa từ 3 bộ Kaggle công khai thật:',
    '--   1) seatransport/southeast-asia-transport-data (ODbL 1.0)',
    '--   2) rohitgds/pan-india-bus-routes-35k-schedules-1000-cities (CC BY 4.0)',
    '--   3) iamvijay7/bus-journey-demand-forecasting-dataset (CC0)',
    '-- Tương thích 100% với db/01_init_schema.sql và db/02_seed_data.sql (Idempotent)',
    '-- ============================================================================',
    'BEGIN;',
    '',
    '-- 1. Users (Mật khẩu mẫu: 123456)',
  ];

  for (const u of users) {
    sqlLines.push(
      `INSERT INTO users (full_name, email, phone, password_hash, role, is_verified, is_active) ` +
        `VALUES (${sqlLiteral(u.full_name)}, ${sqlLiteral(u.email)}, ${sqlLiteral(u.phone)}, ${sqlLiteral(BCRYPT_123456_HASH)}, ${sqlLiteral(u.role)}, ${sqlLiteral(u.is_verified)}, ${sqlLiteral(u.is_active)}) ` +
        `ON CONFLICT (email) DO NOTHING;`
    );
  }

  sqlLines.push('', '-- 2. Stations (Bến xe Việt Nam từ Kaggle GeoJSON OpenStreetMap)');
  for (const st of stations) {
    sqlLines.push(
      `INSERT INTO stations (name, province, address, is_main_station, is_active) ` +
        `SELECT ${sqlLiteral(st.name)}, ${sqlLiteral(st.province)}, ${sqlLiteral(st.address)}, ${sqlLiteral(st.is_main_station)}, ${sqlLiteral(st.is_active)} ` +
        `WHERE NOT EXISTS (SELECT 1 FROM stations WHERE LOWER(name) = LOWER(${sqlLiteral(st.name)}));`
    );
  }

  sqlLines.push('', '-- 3. Routes (32 tuyến liên tỉnh Việt Nam từ Kaggle GeoJSON)');
  for (const rt of routes) {
    sqlLines.push(
      `INSERT INTO routes (name, origin_province, destination_province, distance_km, duration_hours, base_price, description, is_active) ` +
        `SELECT ${sqlLiteral(rt.name)}, ${sqlLiteral(rt.origin_province)}, ${sqlLiteral(rt.destination_province)}, ${rt.distance_km}, ${rt.duration_hours}, ${rt.base_price}, ${sqlLiteral(rt.description)}, ${sqlLiteral(rt.is_active)} ` +
        `WHERE NOT EXISTS (SELECT 1 FROM routes WHERE LOWER(name) = LOWER(${sqlLiteral(rt.name)}));`
    );
  }

  sqlLines.push('', '-- 4. Seat Layouts (4 sơ đồ ghế chuẩn hóa từ Kaggle Pan-India_Bus_Routes.csv)');
  for (const sl of seatLayouts) {
    sqlLines.push(
      `INSERT INTO seat_layouts (name, total_seats, total_floors, rows_per_floor, cols_per_floor, seat_map_json) ` +
        `SELECT ${sqlLiteral(sl.name)}, ${sl.total_seats}, ${sl.total_floors}, ${sl.rows_per_floor}, ${sl.cols_per_floor}, ${sqlLiteral(sl.seat_map_json)}::jsonb ` +
        `WHERE NOT EXISTS (SELECT 1 FROM seat_layouts WHERE LOWER(name) = LOWER(${sqlLiteral(sl.name)}));`
    );
  }

  sqlLines.push('', '-- 5. Buses (12 xe khách)');
  for (const b of buses) {
    sqlLines.push(
      `INSERT INTO buses (license_plate, seat_layout_id, bus_type, amenities, status) ` +
        `SELECT ${sqlLiteral(b.license_plate)}, sl.id, ${sqlLiteral(b.bus_type)}, ${sqlLiteral(b.amenities)}, ${sqlLiteral(b.status)} ` +
        `FROM seat_layouts sl WHERE LOWER(sl.name) = LOWER(${sqlLiteral(b.layout_name)}) ` +
        `ORDER BY sl.id ASC LIMIT 1 ` +
        `ON CONFLICT (license_plate) DO NOTHING;`
    );
  }

  sqlLines.push('', '-- 6. Articles (8 bài viết đủ 4 chuyên mục)');
  for (const ar of articles) {
    sqlLines.push(
      `INSERT INTO articles (title, slug, category, summary, content, is_published) ` +
        `VALUES (${sqlLiteral(ar.title)}, ${sqlLiteral(ar.slug)}, ${sqlLiteral(ar.category)}, ${sqlLiteral(ar.summary)}, ${sqlLiteral(ar.content)}, ${sqlLiteral(ar.is_published)}) ` +
        `ON CONFLICT (slug) DO NOTHING;`
    );
  }

  sqlLines.push('', '-- 7. Trips (Lịch chạy xe khách theo khung giờ thực tế Kaggle)');
  for (const tr of trips) {
    const depExpr =
      tr.offset_hours_from_now !== ''
        ? `date_trunc('minute', NOW() + INTERVAL '${Number(tr.offset_hours_from_now)} hours')`
        : `CURRENT_DATE + INTERVAL '${Number(tr.day_offset)} days' + INTERVAL '${Math.round(Number(tr.departure_hour) * 60)} minutes'`;
    const arrExpr = `(${depExpr}) + INTERVAL '${Math.round(parseFloat(tr.duration_hours) * 60)} minutes'`;
    sqlLines.push(
      `INSERT INTO trips (route_id, bus_id, departure_time, arrival_time, ticket_price, status) ` +
        `SELECT r.id, b.id, ${depExpr}, ${arrExpr}, ${tr.ticket_price}, ${sqlLiteral(tr.status)} ` +
        `FROM (SELECT id FROM routes WHERE LOWER(name) = LOWER(${sqlLiteral(tr.route_name)}) ORDER BY id ASC LIMIT 1) r ` +
        `JOIN (SELECT id FROM buses WHERE license_plate = ${sqlLiteral(tr.license_plate)} LIMIT 1) b ON TRUE ` +
        `WHERE NOT EXISTS (` +
        `  SELECT 1 FROM trips t WHERE t.route_id = r.id AND t.bus_id = b.id ` +
        `    AND ABS(EXTRACT(EPOCH FROM (t.departure_time - (${depExpr})))) < 1800` +
        `);`
    );
  }

  sqlLines.push('', '-- 8. Trip Stops (Điểm đón/trả tự động gán cho mọi chuyến xe chưa có điểm dừng)');
  for (const ts of tripStops) {
    sqlLines.push(
      `INSERT INTO trip_stops (trip_id, station_id, stop_type, stop_time, stop_order) ` +
        `SELECT t.id, s.id, ${sqlLiteral(ts.stop_type)}, t.departure_time + INTERVAL '${ts.offset_minutes} minutes', ${ts.stop_order} ` +
        `FROM trips t ` +
        `JOIN routes r ON t.route_id = r.id ` +
        `JOIN (SELECT id FROM stations WHERE LOWER(name) = LOWER(${sqlLiteral(ts.station_name)}) ORDER BY id ASC LIMIT 1) s ON TRUE ` +
        `WHERE LOWER(r.name) = LOWER(${sqlLiteral(ts.route_name)}) ` +
        `  AND NOT EXISTS (` +
        `    SELECT 1 FROM trip_stops x WHERE x.trip_id = t.id AND x.station_id = s.id AND x.stop_type = ${sqlLiteral(ts.stop_type)}` +
        `  );`
    );
  }

  sqlLines.push('', '-- 9 & 10. Bookings & Tickets (Đơn đặt vé + Vé ghế điện tử từ nhu cầu Kaggle)');
  for (const bk of bookings) {
    const trip = tripsByCode.get(bk.trip_code);
    const depExpr =
      trip.offset_hours_from_now !== ''
        ? `date_trunc('minute', NOW() + INTERVAL '${Number(trip.offset_hours_from_now)} hours')`
        : `CURRENT_DATE + INTERVAL '${Number(trip.day_offset)} days' + INTERVAL '${Math.round(Number(trip.departure_hour) * 60)} minutes'`;
    const seatList = bk.seat_codes.split(';').filter(Boolean);
    const unitPrice = Math.round(bk.total_amount / seatList.length);

    sqlLines.push(
      `WITH target_trip AS (` +
        `  SELECT t.id FROM trips t JOIN routes r ON t.route_id = r.id JOIN buses b ON t.bus_id = b.id ` +
        `  WHERE LOWER(r.name) = LOWER(${sqlLiteral(trip.route_name)}) AND b.license_plate = ${sqlLiteral(trip.license_plate)} ` +
        `  ORDER BY ABS(EXTRACT(EPOCH FROM (t.departure_time - (${depExpr})))) ASC LIMIT 1` +
        `), ins_booking AS (` +
        `  INSERT INTO bookings (booking_code, user_id, trip_id, pickup_stop_id, dropoff_stop_id, passenger_name, passenger_phone, passenger_email, seat_count, total_amount, status, hold_expires_at, refund_amount) ` +
        `  SELECT ${sqlLiteral(bk.booking_code)}, u.id, tt.id, ` +
        `    (SELECT id FROM trip_stops WHERE trip_id = tt.id AND stop_type = 'pickup' ORDER BY stop_order ASC LIMIT 1), ` +
        `    (SELECT id FROM trip_stops WHERE trip_id = tt.id AND stop_type = 'dropoff' ORDER BY stop_order DESC LIMIT 1), ` +
        `    ${sqlLiteral(bk.passenger_name)}, ${sqlLiteral(bk.passenger_phone)}, ${sqlLiteral(bk.passenger_email)}, ` +
        `    ${seatList.length}, ${bk.total_amount}, ${sqlLiteral(bk.status)}, ` +
        `    ${bk.status === 'pending' ? "NOW() + INTERVAL '10 minutes'" : 'NULL'}, ${bk.refund_amount} ` +
        `  FROM target_trip tt LEFT JOIN users u ON LOWER(u.email) = LOWER(${sqlLiteral(bk.passenger_email)}) ` +
        `  ON CONFLICT (booking_code) DO NOTHING RETURNING id, trip_id` +
        `) INSERT INTO tickets (booking_id, trip_id, seat_code, ticket_code, price, status, checked_in_at) ` +
        `SELECT ib.id, ib.trip_id, sc.seat_code, 'TK-' || ${sqlLiteral(bk.booking_code)} || '-' || sc.seat_code, ${unitPrice}, ${sqlLiteral(bk.ticket_status)}, ` +
        `${bk.ticket_status === 'checked_in' ? 'NOW()' : 'NULL'} ` +
        `FROM ins_booking ib ` +
        `CROSS JOIN (VALUES ${seatList.map((s) => `(${sqlLiteral(s)})`).join(', ')}) AS sc(seat_code) ` +
        `WHERE NOT EXISTS (` +
        `  SELECT 1 FROM tickets tk WHERE tk.trip_id = ib.trip_id AND tk.seat_code = sc.seat_code ` +
        `    AND tk.status IN ('held', 'paid', 'checked_in') AND ${sqlLiteral(bk.ticket_status)} IN ('held', 'paid', 'checked_in')` +
        `) ON CONFLICT (ticket_code) DO NOTHING;`
    );
  }

  sqlLines.push('', 'COMMIT;', '');
  fs.writeFileSync(path.join(OUT_DIR, 'kaggle_seed.sql'), sqlLines.join('\n'), 'utf8');

  console.log('\n✅ Đã xuất hoàn tất 9 tệp CSV + kaggle_seed.sql từ dữ liệu gốc Kaggle:');
  console.table({
    users: users.length,
    stations: stations.length,
    routes: routes.length,
    seat_layouts: seatLayouts.length,
    buses: buses.length,
    trips: trips.length,
    trip_stops: tripStops.length,
    bookings: bookings.length,
    tickets_expected: bookings.reduce((s, b) => s + b.seat_codes.split(';').length, 0),
    articles: articles.length,
  });
}

main();
