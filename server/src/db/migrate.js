/* 数据库迁移运行器
 * 用法：
 *   npm run migrate        # 建表（up）
 *   npm run seed           # 插入种子数据
 *   npm run init-db        # up + seed
 *   npm run migrate:reset  # 清空所有表后重建并 seed
 */
const db = require('./index');
const logger = require('../utils/logger');

const migrations = [
  require('./migrations/001_init'),
  require('./migrations/002_trips'),
  require('./migrations/003_sales_records'),
  require('./migrations/004_add_missing_tables'),
  require('./migrations/005_seed_business_data'),
  require('./migrations/006_align_reference_org'),
  require('./migrations/007_reference_schema'),
  require('./migrations/008_reference_business_data'),
];

const ALL_TABLES = [
  'audit_log', 'business_trips', 'system_settings', 'notifications',
  'users', 'departments', 'customers', 'contracts', 'projects',
  'leave_records', 'expense_records', 'purchases', 'roles',
  'checkins', 'work_reports', 'kv_store', 'perm_logs', 'perm_approvals',
  'sales_records', 'suppliers', 'documents', 'logistics', 'vehicles',
];

function up() {
  for (const m of migrations) {
    if (m.up) {
      logger.info(`[migrate] up: ${m.id}`);
      m.up(db);
    }
  }
  logger.info('[migrate] 建表完成');
}

function seed() {
  for (const m of migrations) {
    if (m.seed) {
      logger.info(`[migrate] seed: ${m.id}`);
      m.seed(db);
    }
  }
  logger.info('[migrate] 种子数据插入完成');
}

function reset() {
  db.pragma('foreign_keys = OFF');
  for (const t of ALL_TABLES) {
    db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  db.pragma('foreign_keys = ON');
  logger.info('[migrate] 已清空所有表');
  up();
  seed();
}

function status() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('\n===== 数据表清单 =====');
  tables.forEach((t) => {
    const c = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get().c;
    console.log(`  - ${t.name}: ${c} 条`);
  });
  console.log('======================\n');
}

const cmd = process.argv[2] || 'up';
switch (cmd) {
  case 'up':
    up();
    status();
    break;
  case 'seed':
    seed();
    status();
    break;
  case 'reset':
    reset();
    status();
    break;
  case 'status':
    status();
    break;
  default:
    console.log('用法: node migrate.js [up|seed|reset|status]');
}

db.close();
