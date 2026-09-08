/**
 * 前后端 API 路径交叉校验
 * 逐个比对「Vue 页面里 request 调用的相对路径」与「对应 routes 文件里定义的路径」，
 * 找出前端调了但后端没定义的端点（会导致页面 404 白屏）。
 *
 * 用法：node server/scripts/check_api_match.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const VIEWS = path.join(ROOT, 'web', 'src', 'views');
const ROUTES = path.join(ROOT, 'server', 'src', 'routes');

// 模块名 -> { vue, route, prefix }
const MODULES = [
  { key: 'opportunity', vue: 'Opportunity.vue', route: 'opportunity.routes.js', prefix: '/opportunity' },
  { key: 'dealer', vue: 'Dealer.vue', route: 'dealer.routes.js', prefix: '/dealer' },
  { key: 'supply', vue: 'Supply.vue', route: 'supply.routes.js', prefix: '/supply' },
  { key: 'bid', vue: 'Bid.vue', route: 'bid.routes.js', prefix: '/bid' },
  { key: 'market', vue: 'Market.vue', route: 'market.routes.js', prefix: '/market' },
  { key: 'aftersale', vue: 'Aftersale.vue', route: 'aftersale.routes.js', prefix: '/aftersale' },
  { key: 'payroll', vue: 'Payroll.vue', route: 'payroll.routes.js', prefix: '/payroll' },
  { key: 'kpi', vue: 'Kpi.vue', route: 'kpi.routes.js', prefix: '/kpi' },
  { key: 'qual', vue: 'Qual.vue', route: 'qual.routes.js', prefix: '/qual' },
  { key: 'archive', vue: 'Archive.vue', route: 'archive.routes.js', prefix: '/archive' },
  { key: 'training', vue: 'Training.vue', route: 'training.routes.js', prefix: '/training' },
  { key: 'bizflow', vue: 'Bizflow.vue', route: 'bizflow.routes.js', prefix: '/bizflow' },
  { key: 'invoicing', vue: 'Invoicing.vue', route: 'invoicing.routes.js', prefix: '/invoicing' },
  { key: 'doclib', vue: 'Doclib.vue', route: 'doclib.routes.js', prefix: '/doclib' },
  { key: 'officialTpl', vue: 'OfficialTpl.vue', route: 'officialTpl.routes.js', prefix: '/official-tpl' },
  { key: 'seal', vue: 'Seal.vue', route: 'seal.routes.js', prefix: '/seal' },
  { key: 'directory', vue: 'Directory.vue', route: 'directory.routes.js', prefix: '/directory' },
  { key: 'collab', vue: 'Collab.vue', route: 'collab.routes.js', prefix: '/collab' },
  { key: 'message', vue: 'Message.vue', route: 'message.routes.js', prefix: '/message' },
  { key: 'search', vue: 'Search.vue', route: 'search.routes.js', prefix: '/search' },
  { key: 'audit', vue: 'Audit.vue', route: 'audit.routes.js', prefix: '/audit' },
  { key: 'coord', vue: 'Coord.vue', route: 'coord.routes.js', prefix: '/coord' },
  { key: 'org', vue: 'Org.vue', route: 'org.routes.js', prefix: '/org' },
  { key: 'hrExt', vue: 'HrExt.vue', route: 'hrExt.routes.js', prefix: '/hr-ext' },
  { key: 'orgchange', vue: 'Orgchange.vue', route: 'orgchange.routes.js', prefix: '/orgchange' },
  { key: 'ops', vue: 'Ops.vue', route: 'ops.routes.js', prefix: '/ops' },
  { key: 'qywx', vue: 'Qywx.vue', route: 'qywx.routes.js', prefix: '/qywx' },
];

/** 从 routes 文件抽取已定义路径：{ METHOD:path } */
function parseRoutes(file) {
  const s = fs.readFileSync(file, 'utf8');
  const out = new Set();
  const re = /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(s))) out.add(m[1].toUpperCase() + ' ' + m[2]);
  return out;
}

/** 从 Vue 抽取调用：request.get('/xxx') 内含模板串时取静态前缀 */
function parseVue(file) {
  const s = fs.readFileSync(file, 'utf8');
  const calls = [];
  const re = /request\.(get|post|put|delete|patch)\s*\(\s*([`'"])([^`'"]*)\2/g;
  let m;
  while ((m = re.exec(s))) calls.push({ method: m[1].toUpperCase(), path: m[3] });
  return calls;
}

/** 路由是否匹配（考虑 /:id 等参数占位） */
function matches(defSet, method, p) {
  for (const d of defSet) {
    const [dm, dp] = d.split(' ');
    if (dm !== method) continue;
    const a = dp.split('/').filter(Boolean);
    const b = p.split('/').filter(Boolean);
    if (a.length !== b.length) continue;
    let ok = true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (a[i].startsWith(':')) continue;
      ok = false; break;
    }
    if (ok) return true;
  }
  return false;
}

let missTotal = 0;
console.log('===== 前后端 API 路径交叉校验 =====\n');
for (const mod of MODULES) {
  const vuePath = path.join(VIEWS, mod.vue);
  const routePath = path.join(ROUTES, mod.route);
  if (!fs.existsSync(vuePath)) { console.log(`❌ ${mod.key}: 缺前端 ${mod.vue}`); continue; }
  if (!fs.existsSync(routePath)) { console.log(`❌ ${mod.key}: 缺后端 ${mod.route}`); continue; }

  const defs = parseRoutes(routePath);
  const calls = parseVue(vuePath);
  const miss = [];
  for (const c of calls) {
    if (!c.path.startsWith(mod.prefix)) continue; // 只校验本模块的调用
    const rel = c.path.slice(mod.prefix.length) || '/';
    if (!matches(defs, c.method, rel)) miss.push(`${c.method} ${c.path}`);
  }
  const uniq = [...new Set(miss)];
  if (uniq.length) {
    missTotal += uniq.length;
    console.log(`⚠️  ${mod.key.padEnd(12)} 前端调用 ${calls.length} 处，后端未定义 ${uniq.length} 处:`);
    uniq.forEach((x) => console.log(`      ${x}`));
  } else {
    console.log(`✅ ${mod.key.padEnd(12)} 前端调用 ${calls.length} 处，全部匹配`);
  }
}
console.log(`\n===== 合计未匹配端点: ${missTotal} =====`);
