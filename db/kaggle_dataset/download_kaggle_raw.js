/**
 * ============================================================================
 * TẢI DỮ LIỆU GỐC TRỰC TIẾP TỪ KAGGLE API CÔNG KHAI -> db/kaggle_dataset/raw/
 * ----------------------------------------------------------------------------
 * Cách chạy:
 *   node db/kaggle_dataset/download_kaggle_raw.js
 *
 * Nguồn Kaggle công khai (không cần API key):
 * 1. seatransport/southeast-asia-transport-data (ODbL 1.0)
 *    https://www.kaggle.com/datasets/seatransport/southeast-asia-transport-data
 *    - vietnam/vietnam-transport-map.geo.json
 *    - vietnam/vietnam-border-crossings.csv
 * 2. rohitgds/pan-india-bus-routes-35k-schedules-1000-cities (CC BY 4.0)
 *    https://www.kaggle.com/datasets/rohitgds/pan-india-bus-routes-35k-schedules-1000-cities
 *    - Pan-India_Bus_Routes.csv
 * 3. iamvijay7/bus-journey-demand-forecasting-dataset (CC0: Public Domain)
 *    https://www.kaggle.com/datasets/iamvijay7/bus-journey-demand-forecasting-dataset
 *    - train.csv -> bus_demand_train.csv
 * ============================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, 'raw');

const KAGGLE_FILES = [
  {
    dataset: 'seatransport/southeast-asia-transport-data',
    file: 'vietnam/vietnam-transport-map.geo.json',
    destName: 'vietnam-transport-map.geo.json',
    url: 'https://www.kaggle.com/api/v1/datasets/download/seatransport/southeast-asia-transport-data/vietnam%2Fvietnam-transport-map.geo.json',
  },
  {
    dataset: 'seatransport/southeast-asia-transport-data',
    file: 'vietnam/vietnam-border-crossings.csv',
    destName: 'vietnam-border-crossings.csv',
    url: 'https://www.kaggle.com/api/v1/datasets/download/seatransport/southeast-asia-transport-data/vietnam%2Fvietnam-border-crossings.csv',
  },
  {
    dataset: 'rohitgds/pan-india-bus-routes-35k-schedules-1000-cities',
    file: 'Pan-India_Bus_Routes.csv',
    destName: 'Pan-India_Bus_Routes.csv',
    url: 'https://www.kaggle.com/api/v1/datasets/download/rohitgds/pan-india-bus-routes-35k-schedules-1000-cities/Pan-India_Bus_Routes.csv',
  },
  {
    dataset: 'iamvijay7/bus-journey-demand-forecasting-dataset',
    file: 'train.csv',
    destName: 'bus_demand_train.csv',
    url: 'https://www.kaggle.com/api/v1/datasets/download/iamvijay7/bus-journey-demand-forecasting-dataset/train.csv',
  },
];

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  console.log('====================================================================');
  console.log(' TẢI TỆP DỮ LIỆU GỐC TỪ KAGGLE -> db/kaggle_dataset/raw/');
  console.log('====================================================================');

  for (const item of KAGGLE_FILES) {
    process.stdout.write(`-> [${item.dataset}] ${item.file} ... `);
    const res = await fetch(item.url, {
      headers: { 'User-Agent': 'BusTicket-Kaggle-ETL/1.0' },
    });
    if (!res.ok) {
      throw new Error(`Không thể tải ${item.file} từ Kaggle (HTTP ${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const destPath = path.join(RAW_DIR, item.destName);
    fs.writeFileSync(destPath, buf);
    console.log(`OK (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  console.log('✅ Đã tải hoàn tất toàn bộ tệp gốc từ Kaggle!');
}

main().catch((err) => {
  console.error('❌ Lỗi tải dữ liệu Kaggle:', err.message);
  process.exitCode = 1;
});
