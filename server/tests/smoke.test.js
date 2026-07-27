/* 冒烟测试：覆盖健康检查 / 登录 / 鉴权守卫 / 全量数据 / 审批流 / RBAC
 * 使用独立测试库（tests/test.db），不污染开发数据。
 */
const path = require('path');
const fs = require('fs');
const request = require('supertest');

// 必须在 require app/db 之前设置环境变量
const TEST_DB = path.join(__dirname, 'test.db');
process.env.DB_PATH = TEST_DB;
process.env.JWT_SECRET = 'jest-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';
process.env.PUBLIC_DIR = path.join(__dirname, '..', 'public');

const db = require('../src/db');
const m1 = require('../src/db/migrations/001_init');
const m2 = require('../src/db/migrations/002_trips');
const app = require('../src/app');

beforeAll(() => {
  // 全新初始化测试库
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  m1.up(db);
  m2.up(db);
  m1.seed(db);
  m2.seed(db);
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

let token = '';

describe('健康检查', () => {
  test('GET /api/health 返回 ok', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.status).toBe('ok');
  });
});

describe('认证', () => {
  test('POST /api/login 用 ZM001/123456 登录成功并签发 token', async () => {
    const r = await request(app).post('/api/login').send({ username: 'ZM001', password: '123456' });
    expect(r.body.success).toBe(true);
    expect(r.body.data.token).toBeTruthy();
    token = r.body.data.token;
  });

  test('POST /api/login 错误密码失败', async () => {
    const r = await request(app).post('/api/login').send({ username: 'ZM001', password: 'wrong' });
    expect(r.body.success).toBe(false);
  });

  test('无 token 访问受保护接口返回 401', async () => {
    const r = await request(app).get('/api/verify-token');
    expect(r.status).toBe(401);
  });

  test('携带 token 访问 verify-token 成功', async () => {
    const r = await request(app).get('/api/verify-token').set('Authorization', 'Bearer ' + token);
    expect(r.body.success).toBe(true);
    expect(r.body.data.userId).toBe('ZM001');
  });
});

describe('业务接口', () => {
  test('GET /api/allData 返回全量数据', async () => {
    const r = await request(app).get('/api/allData').set('Authorization', 'Bearer ' + token);
    expect(r.body.success).toBe(true);
    expect(r.body.data.users.length).toBeGreaterThan(0);
    expect(r.body.data.customers.length).toBeGreaterThan(0);
  });

  test('GET /api/customerLevels 不再 500（原缺失 key 已修复）', async () => {
    const r = await request(app).get('/api/customerLevels').set('Authorization', 'Bearer ' + token);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  test('GET /api/statistics 实时聚合', async () => {
    const r = await request(app).get('/api/statistics').set('Authorization', 'Bearer ' + token);
    expect(r.body.success).toBe(true);
    expect(r.body.data.users.total).toBeGreaterThan(0);
  });
});

describe('审批流', () => {
  test('PUT /api/leave/1/approve 区域经理(ZM001)可审批', async () => {
    const r = await request(app)
      .put('/api/leave/1/approve')
      .set('Authorization', 'Bearer ' + token)
      .send({ status: '已通过', approver: '李明远' });
    expect(r.body.success).toBe(true);
  });

  test('PUT /api/projects/:id/approve 推进 flow 步骤', async () => {
    const before = await request(app).get('/api/projects').set('Authorization', 'Bearer ' + token);
    const pending = before.body.data.find((p) => p.flow && p.flow.some((f) => !f.done));
    expect(pending).toBeTruthy();
    const undoneBefore = pending.flow.filter((f) => !f.done).length;

    const r = await request(app)
      .put('/api/projects/' + pending.id + '/approve')
      .set('Authorization', 'Bearer ' + token)
      .send({ status: '执行中', approver: '李明远' });
    expect(r.body.success).toBe(true);

    const after = await request(app).get('/api/projects').set('Authorization', 'Bearer ' + token);
    const updated = after.body.data.find((p) => p.id === pending.id);
    const undoneAfter = updated.flow.filter((f) => !f.done).length;
    expect(undoneAfter).toBe(undoneBefore - 1);
  });
});

describe('RBAC（roles 表精确模型）', () => {
  test('区域经理(ZM001) roles 表 can_delete=0 -> 删除用户被拒 403', async () => {
    const r = await request(app).delete('/api/users/ZM002').set('Authorization', 'Bearer ' + token);
    expect(r.status).toBe(403);
  });

  test('销售代表(ZM003) can_approve 兜底为 false -> 审批被拒 403', async () => {
    const login = await request(app).post('/api/login').send({ username: 'ZM003', password: '123456' });
    const lowToken = login.body.data.token;
    const r = await request(app)
      .put('/api/leave/1/approve')
      .set('Authorization', 'Bearer ' + lowToken)
      .send({ status: '已通过', approver: 'x' });
    expect(r.status).toBe(403);
  });

  test('销售总监(ZM012 未收录角色) can_approve 兜底放行 -> 审批通过', async () => {
    const login = await request(app).post('/api/login').send({ username: 'ZM012', password: '123456' });
    const dirToken = login.body.data.token;
    const r = await request(app)
      .put('/api/leave/2/approve')
      .set('Authorization', 'Bearer ' + dirToken)
      .send({ status: '已通过', approver: '林伟杰' });
    expect(r.body.success).toBe(true);
  });
});
