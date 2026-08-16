/* 一次性生成脚本：从参考项目 database.js 提取全部 CREATE TABLE DDL，
 * 与当前 DB 对比，生成 007_reference_schema.js：
 *   - 当前不存在的表 → 完整 CREATE TABLE IF NOT EXISTS
 *   - 已存在但缺列的表 → ALTER TABLE ADD COLUMN（PRAGMA 守卫，幂等）
 * 运行: node scripts/gen_007.js
 */
const fs = require('fs');
const path = require('path');

const REF_DB_JS = '/Users/yanghongjun/Downloads/卓盟办公平台最新代码/backend/config/database.js';
const OUT = path.join(__dirname, '../src/db/migrations/007_reference_schema.js');
const db = require('../src/db');

const src = fs.readFileSync(REF_DB_JS, 'utf8');

// 提取 db.exec(`...`) 模板字符串块
const blocks = [];
const re = /db\.exec\(\s*`([\s\S]*?)`\s*\)/g;
let m;
while ((m = re.exec(src))) {
  if (/CREATE TABLE/i.test(m[1])) blocks.push(m[1]);
}

// 从块中解析每个 CREATE TABLE 的表名与列定义
function parseCreates(sql) {
  const out = [];
  const cre = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\s*\)/gi;
  let mm;
  while ((mm = cre.exec(sql))) {
    out.push({ table: mm[1], body: mm[2] });
  }
  return out;
}

function parseCols(body) {
  const cols = [];
  for (let line of body.split('\n')) {
    line = line.trim().replace(/,\s*$/, '');
    if (!line || line.startsWith('--')) continue;
    const name = line.split(/\s+/)[0];
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)/i.test(name)) continue;
    cols.push({ name, def: line });
  }
  return cols;
}

const creates = [];
const alters = [];
const seen = new Set();

// 额外提取 database.js 里 try/catch 的内联 ALTER(后续版本追加的列)
const inlineAlterRe = /db\.exec\('(ALTER TABLE (\w+) ADD COLUMN ([^']+))'\)/g;
const inlineAlters = [];
let iam;
while ((iam = inlineAlterRe.exec(src))) {
  const colName = iam[3].trim().split(/\s+/)[0];
  inlineAlters.push({ table: iam[2], name: colName, def: iam[3].trim() });
}

for (const b of blocks) {
  for (const c of parseCreates(b)) {
    if (seen.has(c.table)) continue;
    seen.add(c.table);
    // 全量输出（不与当前 DB 对比）：CREATE IF NOT EXISTS 与 PRAGMA 守卫的 ALTER 均幂等,
    // 保证全新部署与增量升级走同一条路径。
    creates.push(`CREATE TABLE IF NOT EXISTS ${c.table} (\n${c.body}\n  )`);
    for (const col of parseCols(c.body)) {
      // 清洗列定义：去掉行内注释与尾逗号；ALTER ADD COLUMN 不支持 UNIQUE 与非常量默认值
      let def = col.def.replace(/--.*$/, '').trim().replace(/,+$/, '').trim();
      def = def.replace(/\s+UNIQUE/gi, '');
      def = def.replace(/DEFAULT \((?:datetime|date)\([\s\S]*?\)\)/gi, "DEFAULT ''");
      if (/NOT NULL/i.test(def) && !/DEFAULT/i.test(def)) def = def.replace(/\s+NOT NULL/i, " DEFAULT ''");
      alters.push({ table: c.table, name: col.name, def });
    }
  }
}

// 合并内联 ALTER（去重：同表同列只保留一次）
const alterSeen = new Set(alters.map((a) => a.table + '.' + a.name));
for (const a of inlineAlters) {
  if (!alterSeen.has(a.table + '.' + a.name)) {
    alterSeen.add(a.table + '.' + a.name);
    alters.push(a);
  }
}

const header = `/* 007_reference_schema - 对齐参考项目完整表结构
 * 由 scripts/gen_007.js 自动生成:
 *   - 新建当前缺失的表（CREATE TABLE IF NOT EXISTS,幂等)
 *   - 已有表补齐缺失列（ALTER TABLE ADD COLUMN,PRAGMA 守卫,幂等)
 */
module.exports = {
  id: '007_reference_schema',

  up(db) {
    const createStmts = [
${creates.map((s) => '      `' + s + '`,').join('\n')}
    ];
    for (const sql of createStmts) {
      try { db.exec(sql); } catch (e) { console.log('[Migration 007] 建表跳过/失败:', e.message); }
    }

    const alterStmts = [
${alters.map((a) => `      { table: '${a.table}', col: '${a.name}', def: ${JSON.stringify(a.def)} },`).join('\n')}
    ];
    for (const a of alterStmts) {
      try {
        const cols = db.prepare('PRAGMA table_info(' + a.table + ')').all().map((c) => c.name);
        if (!cols.includes(a.col)) {
          db.exec('ALTER TABLE ' + a.table + ' ADD COLUMN ' + a.def);
          console.log('[Migration 007] 补列: ' + a.table + '.' + a.col);
        }
      } catch (e) { console.log('[Migration 007] 补列跳过/失败 ' + a.table + '.' + a.col + ':', e.message); }
    }
    console.log('[Migration 007] 参考项目表结构对齐完成: 建表 ' + createStmts.length + ' 个, 补列 ' + alterStmts.length + ' 处');
  },
};
`;

fs.writeFileSync(OUT, header);
console.log(`生成完成: 新建表 ${creates.length} 个, 补列 ${alters.length} 处 -> ${OUT}`);
