/* 004_add_missing_tables - 添加缺失的业务表
 * 新增表：
 *   - suppliers（供应商管理）
 *   - documents（公司文件）
 *   - logistics（后勤工单）
 *   - vehicles（车辆管理）
 */
module.exports = {
  id: '004_add_missing_tables',

  up(db) {
    console.log('[Migration 004] 开始创建缺失的业务表...');

    // ===== 供应商表 =====
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        short_name  TEXT DEFAULT '',
        category    TEXT DEFAULT '',
        level       TEXT DEFAULT 'C',
        contact     TEXT DEFAULT '',
        phone       TEXT DEFAULT '',
        email       TEXT DEFAULT '',
        address     TEXT DEFAULT '',
        bank        TEXT DEFAULT '',
        account     TEXT DEFAULT '',
        business_scope TEXT DEFAULT '',
        total_orders INTEGER DEFAULT 0,
        total_amount REAL DEFAULT 0,
        rating      REAL DEFAULT 0,
        status      TEXT DEFAULT '合作中',
        coop_date   TEXT,
        remark      TEXT DEFAULT '',
        qualifications TEXT DEFAULT '[]',
        products    TEXT DEFAULT '[]',
        timeline    TEXT DEFAULT '[]',
        created_at  TEXT DEFAULT (datetime('now','localtime')),
        updated_at  TEXT DEFAULT (datetime('now','localtime'))
      );
    `);

    // ===== 公司文件表 =====
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        type        TEXT DEFAULT '通知公告',
        author      TEXT DEFAULT '',
        author_id   TEXT DEFAULT '',
        dept        TEXT DEFAULT '',
        date        TEXT,
        status      TEXT DEFAULT '草稿',
        distribute_scope TEXT DEFAULT '',
        content     TEXT DEFAULT '',
        read_count  INTEGER DEFAULT 0,
        doc_flow    TEXT DEFAULT '[]',
        created_at  TEXT DEFAULT (datetime('now','localtime')),
        updated_at  TEXT DEFAULT (datetime('now','localtime'))
      );
    `);

    // ===== 后勤工单表 =====
    db.exec(`
      CREATE TABLE IF NOT EXISTS logistics (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT DEFAULT '',
        title       TEXT DEFAULT '',
        applicant   TEXT DEFAULT '',
        applicant_id TEXT DEFAULT '',
        dept        TEXT DEFAULT '',
        status      TEXT DEFAULT '待处理',
        date        TEXT,
        detail      TEXT DEFAULT '',
        cost        REAL DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
      );
    `);

    // ===== 车辆管理表 =====
    db.exec(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        plate       TEXT DEFAULT '',
        model       TEXT DEFAULT '',
        driver      TEXT DEFAULT '',
        status      TEXT DEFAULT '可用',
        last_maintenance TEXT,
        next_maintenance TEXT,
        mileage     INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
      );
    `);

    console.log('[Migration 004] 表结构创建完成');
  },

  seed(db) {
    // 幂等保护：如果 suppliers 表已有数据则跳过
    if (db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c > 0) {
      console.log('[Migration 004] 种子数据已存在，跳过');
      return;
    }

    console.log('[Migration 004] 开始插入种子数据...');

    // ===== 插入供应商种子数据 =====
    const suppliers = [
      ['SUP001', '成都科技有限公司', '成都科技', '电子设备', 'A级', '张经理', '13800138001', 'zhang@supplier1.com', '成都市高新区', '中国银行', '1234567890', '电子元器件', 15, 1500000, 4.8, '合作中', '2025-01-15', '优质供应商，供货稳定'],
      ['SUP002', '重庆制造集团', '重庆制造', '机械设备', 'A级', '李总', '13800138002', 'li@supplier2.com', '重庆市渝北区', '工商银行', '2345678901', '工业设备', 8, 2300000, 4.6, '合作中', '2024-06-20', '大型设备供应商'],
      ['SUP003', '广州贸易公司', '广州贸易', '办公用品', 'B级', '王主管', '13800138003', 'wang@supplier3.com', '广州市天河区', '建设银行', '3456789012', '办公文具、耗材', 25, 350000, 4.2, '合作中', '2025-03-10', '办公用品长期供应商'],
      ['SUP004', '上海物流有限公司', '上海物流', '物流服务', 'B级', '陈经理', '13800138004', 'chen@supplier4.com', '上海市浦东新区', '交通银行', '4567890123', '货物运输', 12, 480000, 4.5, '合作中', '2024-09-05', '物流配送服务']
    ];

    const insertSupplier = db.prepare(`
      INSERT INTO suppliers (id, name, short_name, category, level, contact, phone, email, address, bank, account, business_scope, total_orders, total_amount, rating, status, coop_date, remark, qualifications, products, timeline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]')
    `);

    suppliers.forEach(s => insertSupplier.run(...s));

    // ===== 插入公司文件种子数据 =====
    const documents = [
      ['DOC001', '关于调整工作时间的通知', '通知公告', '马小丽', 'ZM006', '行政部', '2026-01-10', '已下发', '全体员工', '根据公司实际情况，现将工作时间调整为：\n上午：9:00-12:00\n下午：14:00-18:00\n请各部门遵照执行。', 45],
      ['DOC002', '员工考勤管理制度', '管理制度', '马小丽', 'ZM006', '行政部', '2026-02-20', '已下发', '全体员工', '第一章 总则\n第一条 为规范公司考勤管理，特制定本制度。\n第二条 本制度适用于公司全体员工。\n\n第二章 考勤规定\n第三条 工作时间\n公司实行每周五天工作制，每天工作8小时。', 32],
      ['DOC003', '差旅费报销操作规范', '操作规范', '郑雅琳', 'ZM005', '财务部', '2026-03-05', '审批中', '全体员工', '一、差旅费报销范围\n1. 交通费：乘坐火车、飞机、汽车等交通工具的费用\n2. 住宿费：出差期间的住宿费用\n3. 餐饮费：出差期间的餐饮费用\n\n二、报销标准\n详见附件。', 18]
    ];

    const insertDocument = db.prepare(`
      INSERT INTO documents (id, title, type, author, author_id, dept, date, status, distribute_scope, content, read_count, doc_flow)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
    `);

    documents.forEach(d => insertDocument.run(...d));

    // ===== 插入后勤工单种子数据 =====
    const logisticsItems = [
      ['设施维修', '三楼会议室空调故障', '林伟杰', 'ZM003', '销售部', '已完成', '2026-02-15', '空调不制冷，已安排维修', 500],
      ['办公设备', '申请打印机墨盒', '吴海涛', 'ZM004', '技术部', '已完成', '2026-03-01', '打印机墨盒不足，需更换', 280],
      ['车辆调度', '安排客户拜访用车', '陈志远', 'ZM018', '市场部', '待处理', '2026-03-10', '需安排车辆外出拜访客户', 0]
    ];

    const insertLogistics = db.prepare(`
      INSERT INTO logistics (type, title, applicant, applicant_id, dept, status, date, detail, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    logisticsItems.forEach(l => insertLogistics.run(...l));

    // ===== 插入车辆管理种子数据 =====
    const vehicles = [
      ['川A12345', '别克GL8商务车', '张师傅', '可用', '2026-01-15', '2026-04-15', 45600],
      ['川A23456', '大众帕萨特', '李师傅', '可用', '2026-02-20', '2026-05-20', 32100],
      ['川A34567', '丰田凯美瑞', '王师傅', '维修中', '2026-03-05', '2026-06-05', 28900]
    ];

    const insertVehicle = db.prepare(`
      INSERT INTO vehicles (plate, model, driver, status, last_maintenance, next_maintenance, mileage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    vehicles.forEach(v => insertVehicle.run(...v));

    console.log('[Migration 004] 种子数据插入完成');
  },

  down(db) {
    console.log('[Migration 004] 回滚表结构...');
    db.exec(`
      DROP TABLE IF EXISTS suppliers;
      DROP TABLE IF EXISTS documents;
      DROP TABLE IF EXISTS logistics;
      DROP TABLE IF EXISTS vehicles;
    `);
    console.log('[Migration 004] 回滚完成');
  }
};