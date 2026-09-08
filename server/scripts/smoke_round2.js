// 端到端冒烟：登录 + 探测所有新模块端点
const http = require('http');
const fs = require('fs');

const TK_FILE = '/tmp/.tk';

function req(path, method='GET', body=null) {
  return new Promise((resolve, reject) => {
    const tk = fs.readFileSync(TK_FILE, 'utf8').trim();
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port: 8080, path: '/api' + path, method,
      headers: {
        'Authorization': 'Bearer ' + tk,
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
      }
    }, (res) => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => resolve({ code: res.statusCode, body: chunks }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'ZM001', password: '123456' });
    const r = http.request({
      hostname: '127.0.0.1', port: 8080, path: '/api/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try {
          const d = JSON.parse(chunks);
          fs.writeFileSync(TK_FILE, d.data.token);
          console.log('登录成功，用户:', d.data.name, '角色:', d.data.role);
          resolve();
        } catch (e) { reject(new Error('登录解析失败: ' + chunks.slice(0, 200))); }
      });
    });
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

const tests = [
  // 审批中心
  ['GET', '/approvals/types'],
  ['GET', '/approvals/all-types'],
  ['GET', '/approvals/flow-charts'],
  ['GET', '/approvals/flows'],
  ['GET', '/approvals/todo'],
  ['GET', '/approvals/done'],
  ['GET', '/approvals/cc'],
  ['GET', '/approvals/stuck'],
  ['GET', '/approvals/stale'],
  ['GET', '/approvals/efficiency'],
  ['GET', '/approvals/health'],
  ['GET', '/approvals/stats'],
  ['GET', '/approvals/comments'],
  ['GET', '/approvals/favs'],
  ['GET', '/approvals/delegations'],
  ['GET', '/approvals/print/tokens'],
  ['GET', '/approvals'],
  ['POST', '/approvals/preview', { type: '请假审批' }],
  ['POST', '/approvals', { type: '请假审批', title: '测试' }],
  ['GET', '/approvals/flow-changes'],
  ['PUT', '/approvals/flows/请假审批', { nodes: [{ step_name: '主管', role: 'DEPT_LEAD' }] }],
  ['POST', '/approvals/delegations', { to_emp_id: 1, to_emp_name: 'test', start_date: '2026-09-01', end_date: '2026-09-30', scope: '全部' }],
  ['POST', '/approvals/comments', { content: '同意' }],
  // 工作报告
  ['GET', '/work-reports'],
  ['GET', '/work-reports/templates'],
  ['GET', '/work-reports/stats'],
  ['GET', '/work-reports/pending'],
  ['GET', '/work-reports/cc'],
  ['GET', '/work-reports/schedule'],
  ['GET', '/work-reports/dept-summary'],
  ['GET', '/work-reports/issues-top'],
  ['GET', '/work-reports/prev'],
  // 4 新台账
  ['GET', '/supplies-app'],
  ['GET', '/supplies-app/apps'],
  ['POST', '/supplies-app', { name: 'A4打印纸', category: '办公耗材', unit: '包', stock: 100, warn_qty: 20 }],
  ['GET', '/vehicles-app'],
  ['POST', '/vehicles-app/apply', { vehicle_id: 1, vehicle_plate: '川A12345', start_at: '2026-09-10 09:00', end_at: '2026-09-10 18:00', destination: '成都市区', reason: '客户拜访' }],
  ['GET', '/assets-ledger'],
  ['POST', '/assets-ledger', { name: 'ThinkPad', category: '电子设备', brand: 'Lenovo', model: 'X1', serial_no: 'SN001', purchase_date: '2026-01-01', purchase_amount: 12000, location: '总部', custodian_id: 'ZM001' }],
  ['GET', '/petty-funds'],
  ['GET', '/petty-funds/stats'],
  ['POST', '/petty-funds', { purpose: '差旅备用金', amount: 5000, expect_return_date: '2026-10-01' }],
  // 4 缺口补漏
  ['GET', '/checkin/settings'],
  ['PUT', '/checkin/settings', { am_start: '09:00', am_end: '12:00', pm_start: '13:30', pm_end: '18:00', flexible_minutes: 30, work_days: '1,2,3,4,5' }],
  ['GET', '/checkin/summary'],
  ['GET', '/checkin/records'],
  ['GET', '/checkin/export'],
  ['GET', '/announcement/unread'],
  ['POST', '/announcement/1/read'],
  ['GET', '/announcement/1/readers'],
  ['POST', '/announcement/1/remind-unread'],
  // 数据服务
  ['GET', '/dsvc/get_user_dashboard_data'],
  ['GET', '/dsvc/cross_dept_snapshot'],
  ['GET', '/dsvc/field_permissions'],
  ['GET', '/dsvc/compliance'],
  ['GET', '/dsvc/svc_audit'],
  // 预算
  ['GET', '/budgets'],
  ['GET', '/budgets/categories'],
  ['POST', '/budgets', { year: 2026, quarter: 0, month: 0, category: '采购', amount: 100, note: 'test' }],
  ['GET', '/budgets/executions'],
  ['GET', '/budgets/stats'],
  // 支付
  ['GET', '/payout/payouts'],
  ['GET', '/payout/sources'],
  ['POST', '/payout/payouts', { pay_type: '员工报销付款', amount: 1.5, payee: 'test' }],
];

(async () => {
  await login();
  let pass = 0, fail = 0;
  const fails = [];
  for (const [m, p, b] of tests) {
    try {
      const r = await req(p, m, b);
      const ok = r.code >= 200 && r.code < 500 && r.code !== 401;
      if (ok) { pass++; }
      else { fail++; fails.push(`${m} ${p} -> ${r.code}`); }
    } catch (e) { fail++; fails.push(`${m} ${p} -> ERR ${e.message}`); }
  }
  console.log('====== 端到端冒烟 ======');
  console.log('通过:', pass, '失败:', fail);
  if (fails.length) {
    console.log('\n失败列表:');
    fails.forEach(f => console.log('  ' + f));
  }
  process.exit(fail > 0 ? 1 : 0);
})();
