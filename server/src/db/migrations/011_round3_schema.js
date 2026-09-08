/**
 * 第十一轮迁移：补齐第三轮端点所需的表
 * - dealer_orders    经销商订单（dms/orders/:id/confirm|ship）
 * - hr_contract_files 人事合同附件（contract/hr/:id/file）
 * - kpi_reports      KPI 报告草稿（performance/generate）
 * - receipt_orders   收货单（coord/link/receipt-stock）
 */
module.exports = {
  up(db) {
    // 经销商订单
    db.exec(`
      CREATE TABLE IF NOT EXISTS dealer_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        do_no TEXT UNIQUE,
        dealer_id INTEGER,
        dealer_name TEXT,
        product TEXT,
        qty REAL DEFAULT 0,
        amount REAL DEFAULT 0,
        status TEXT DEFAULT '待确认',
        confirmed_at TEXT,
        shipped_at TEXT,
        operator_id INTEGER,
        operator_name TEXT,
        remark TEXT,
        created_at TEXT
      );
    `);
    // 人事合同附件
    db.exec(`
      CREATE TABLE IF NOT EXISTS hr_contract_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hr_contract_id INTEGER,
        file_name TEXT,
        file_path TEXT,
        file_size INTEGER,
        uploader_id INTEGER,
        uploader_name TEXT,
        created_at TEXT
      );
    `);
    // KPI 报告草稿
    db.exec(`
      CREATE TABLE IF NOT EXISTS kpi_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT,
        emp_id INTEGER,
        emp_name TEXT,
        contracts_count INTEGER DEFAULT 0,
        contracts_amount REAL DEFAULT 0,
        score REAL DEFAULT 0,
        status TEXT DEFAULT '草稿',
        created_by INTEGER,
        created_at TEXT
      );
    `);
    // 收货单
    db.exec(`
      CREATE TABLE IF NOT EXISTS receipt_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rc_no TEXT UNIQUE,
        po_id INTEGER,
        po_no TEXT,
        supplier_id INTEGER,
        supplier_name TEXT,
        rc_date TEXT,
        item_name TEXT,
        qty REAL DEFAULT 0,
        unit_cost REAL DEFAULT 0,
        amount REAL DEFAULT 0,
        status TEXT DEFAULT '待收货',
        operator_id INTEGER,
        operator_name TEXT,
        created_at TEXT
      );
    `);
    // 招标文件（参考 bidgen.js）
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_no TEXT UNIQUE,
        title TEXT,
        issuer TEXT,
        deadline TEXT,
        content TEXT,
        status TEXT DEFAULT '待处理',
        created_by INTEGER,
        created_at TEXT
      );
    `);
  },
  seed(db) {
    // 给 dealer_orders seed 几条订单（如果表是空的）
    const n = db.prepare('SELECT COUNT(*) c FROM dealer_orders').get().c;
    if (n === 0) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const stmt = db.prepare(`INSERT INTO dealer_orders(do_no, dealer_id, dealer_name, product, qty, amount, status, operator_id, operator_name, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`);
      const samples = [
        ['DO001', 1, '重庆华润医药', 'A型试剂盒', 50, 12500, '待确认', 1, '系统', now],
        ['DO002', 2, '遂宁中心医院', 'B型耗材', 200, 8000, '待确认', 1, '系统', now],
        ['DO003', 3, '南岸区医院', 'C型设备', 5, 25000, '已确认', 1, '系统', now],
      ];
      samples.forEach((s) => stmt.run(...s));
    }
    // 给 receipt_orders seed
    const n2 = db.prepare('SELECT COUNT(*) c FROM receipt_orders').get().c;
    if (n2 === 0) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const stmt = db.prepare(`INSERT INTO receipt_orders(rc_no, po_id, po_no, supplier_id, supplier_name, rc_date, item_name, qty, unit_cost, amount, status, operator_id, operator_name, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      stmt.run('RC001', 1, 'PO001', 1, '迈瑞医疗', now.slice(0, 10), 'A型试剂盒', 100, 100, 10000, '已收货', 1, '系统', now);
      stmt.run('RC002', 2, 'PO002', 2, '华润医药', now.slice(0, 10), 'B型耗材', 500, 20, 10000, '待收货', 1, '系统', now);
    }
  },
};
