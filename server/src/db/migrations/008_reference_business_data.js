/* 008_reference_business_data - 参考项目业务数据对齐
 * 目的：让移植过来的参考版路由读取到与参考项目一致的数据。
 * 策略：
 *   - 共享表(customers/contracts/purchases/projects/suppliers/documents/business_trips/work_reports/announcements)
 *     清空后写入参考项目种子(避免新旧两套 id 混排);
 *   - 参考独有表(leaves/expenses/finance_records/fixed_assets/salary_templates/project_progress/
 *     perm_audit_logs/attendance_schedules/t_company_info/t_finance_config 等)空表才写入;
 *   - 合同流程专用账号(李法务/王印章/陈档案)按参考 database.js 补齐;
 *   - 全程幂等:kv_store 标记 seed_008_done,只执行一次。
 */
module.exports = {
  id: '008_reference_business_data',

  up() {},

  seed(db) {
    const done = db.prepare("SELECT value FROM kv_store WHERE key='seed_008_done'").get();
    if (done) {
      console.log('[Migration 008] 已执行过，跳过');
      return;
    }

    const now = '2026-08-14 10:00:00';

    // users.contract_role 由参考项目路由运行时 ALTER 添加，这里先确保存在
    try {
      const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
      if (!ucols.includes('contract_role')) db.exec("ALTER TABLE users ADD COLUMN contract_role TEXT DEFAULT ''");
    } catch (e) { /* ignore */ }

    // ===== 1. 共享表清库重写（与参考项目完全一致） =====
    // customers 主键类型与参考不一致(INTEGER vs TEXT 'CUS-001'),按参考 DDL 重建
    db.exec('DROP TABLE IF EXISTS customers');
    db.exec(`CREATE TABLE IF NOT EXISTS customers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      contact     TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      email       TEXT DEFAULT '',
      address     TEXT DEFAULT '',
      level       TEXT DEFAULT 'C',
      industry    TEXT DEFAULT '',
      source      TEXT DEFAULT '',
      status      TEXT DEFAULT '潜在',
      owner       TEXT DEFAULT '',
      owner_dept  TEXT DEFAULT '',
      submitter   TEXT DEFAULT '',
      submitter_id TEXT DEFAULT '',
      applicant_dept TEXT DEFAULT '',
      approval_flow TEXT DEFAULT '[]',
      remark      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
    )`);
    const customers = [
      ['CUS-001', '成都智联科技有限公司', '张志强', '028-88881111', 'zhang@zhilian.com', '成都市高新区天府软件园D区', 'A级', '信息技术', '网络推广', '合作中', '林伟杰', '销售部'],
      ['CUS-002', '四川长通建工集团', '李建国', '028-88882222', 'li@changtong.com', '成都市青羊区光华大道', 'A级', '建筑工程', '客户转介绍', '合作中', '李明远', '销售部'],
      ['CUS-003', '西南通信设备公司', '王芳', '028-88883333', 'wang@swt.com', '成都市武侯区高升桥', 'B级', '通信设备', '展会开发', '合作中', '李明远', '销售部'],
      ['CUS-004', '重庆万达机械制造', '陈明', '023-66661111', 'chen@wanda.com', '重庆市九龙坡区', 'B级', '机械制造', '网络推广', '潜在', '王思琪', '销售部'],
      ['CUS-005', '绵阳科创电子科技', '赵伟', '0816-2222333', 'zhao@kc.com', '绵阳市涪城区科创路', 'C级', '电子科技', '电话营销', '潜在', '王思琪', '销售部'],
      ['CUS-006', '德阳重型装备公司', '孙强', '0838-3333444', 'sun@dyzz.com', '德阳市旌阳区', 'B级', '重型装备', '客户转介绍', '合作中', '李明远', '销售部'],
      ['CUS-007', '乐山文旅投资集团', '周敏', '0833-4444555', 'zhou@lswl.com', '乐山市市中区', 'A级', '文化旅游', '展会开发', '合作中', '林伟杰', '销售部'],
      ['CUS-008', '宜宾新能源科技', '吴军', '0831-5555666', 'wu@ybxn.com', '宜宾市翠屏区', 'C级', '新能源', '网络推广', '潜在', '王思琪', '销售部'],
    ];
    const insCust = db.prepare('INSERT OR REPLACE INTO customers (id,name,contact,phone,email,address,level,industry,source,status,owner,owner_dept) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    customers.forEach((c) => insCust.run(...c));
    console.log(`[Migration 008] 客户: ${customers.length} 条`);

    db.prepare('DELETE FROM contracts').run();
    const contracts = [
      ['HT-2026-001', '智联科技信息化建设项目', '成都智联科技有限公司', '技术服务', 860000, '2026-01-01', '2026-12-31', '执行中', '林伟杰', '赵德明', '2025-12-28'],
      ['HT-2026-002', '长通建工网络系统集成', '四川长通建工集团', '系统集成', 520000, '2026-02-01', '2026-08-31', '执行中', '李明远', '赵德明', '2026-01-20'],
      ['HT-2026-003', '西南通信设备运维服务', '西南通信设备公司', '运维服务', 280000, '2026-03-01', '2027-02-28', '执行中', '李明远', '刘建华', '2026-02-15'],
      ['HT-2026-004', '乐山文旅智慧旅游平台', '乐山文旅投资集团', '软件开发', 1200000, '2026-04-01', '2027-03-31', '待审批', '林伟杰', '', ''],
      ['HT-2026-005', '德阳重型装备监控系统', '德阳重型装备公司', '系统集成', 450000, '2026-05-01', '2026-10-31', '待审批', '李明远', '', ''],
      ['HT-2026-006', '智联科技二期扩容项目', '成都智联科技有限公司', '技术服务', 320000, '2026-06-01', '2026-11-30', '已驳回', '王思琪', '刘建华', ''],
    ];
    const insContract = db.prepare('INSERT OR REPLACE INTO contracts (id,name,customer,type,amount,start_date,end_date,status,creator,approver,sign_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    contracts.forEach((c) => insContract.run(...c));
    console.log(`[Migration 008] 合同: ${contracts.length} 条`);

    db.prepare('DELETE FROM purchases').run();
    const purDone = JSON.stringify([
      { step: '申请', user: '吴海涛', time: '2026-06-15 09:00:00', done: true },
      { step: '部门负责人审批', user: '吴海涛', time: '2026-06-15 14:00:00', done: true },
      { step: '副总审批', user: '刘建华', time: '2026-06-16 10:00:00', done: true },
      { step: '总经理审批', user: '赵德明', time: '2026-06-17 09:00:00', done: true },
      { step: '采购入库', user: '系统', time: '2026-06-17 09:01:00', done: true },
    ]);
    const purchases = [
      ['CG-2026-001', '服务器扩容采购（ThinkSystem SR650×2）', 'IT设备', 96000, 2, '台', '已入库', '吴海涛', '技术部', '2026-06-15', '联想企业级分销', '技术部服务器扩容，满足新项目需求', purDone],
      ['CG-2026-002', '销售部笔记本电脑采购', '电子设备', 72000, 6, '台', '已入库', '林伟杰', '销售部', '2026-06-20', '戴尔商用', '销售部新员工配备笔记本电脑', purDone],
      ['CG-2026-003', '办公区空调更换', '电器设备', 38400, 4, '台', '待审批', '周国强', '行政部', '2026-08-01', '格力空调', '办公区老旧空调更换', purDone],
      ['CG-2026-004', '会议室投影仪采购', '电子设备', 15600, 3, '台', '待审批', '马小丽', '行政部', '2026-08-05', '爱普生投影', '会议室设备升级', purDone],
      ['CG-2026-005', '商务礼品定制采购', '商务礼品', 25000, 500, '份', '采购中', '赵晓彤', '市场部', '2026-07-10', '成都礼品定制', '客户答谢会商务礼品定制', purDone],
    ];
    const insPur = db.prepare('INSERT OR REPLACE INTO purchases (id,title,category,amount,qty,unit,status,applicant,applicant_dept,date,vendor,"desc",flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    purchases.forEach((p) => insPur.run(...p));
    console.log(`[Migration 008] 采购: ${purchases.length} 条`);

    db.prepare('DELETE FROM projects').run();
    const projApproved = JSON.stringify([
      { step: '销售总监提交', user: '林伟杰', time: '2026-01-01 10:00:00', done: true },
      { step: '总经理审批', user: '赵德明', time: '2026-01-02 14:00:00', done: true },
      { step: '项目立项', user: '系统', time: '2026-01-03 09:00:00', done: true },
    ]);
    const projects = [
      ['PRJ-2026-001', '智联科技信息化建设', '成都智联科技有限公司', '吴海涛', 860000, '2026-01-01', '2026-12-31', '进行中', 45, '信息化建设', '企业ERP+OA+CRM一体化建设', projApproved],
      ['PRJ-2026-002', '长通建工网络集成', '四川长通建工集团', '吴海涛', 520000, '2026-02-01', '2026-08-31', '进行中', 68, '网络集成', '集团总部网络及监控系统建设', projApproved],
      ['PRJ-2026-003', '西南通信运维服务', '西南通信设备公司', '李明远', 280000, '2026-03-01', '2027-02-28', '进行中', 20, '运维服务', '通信设备定期巡检维护', projApproved],
      ['PRJ-2026-004', '乐山文旅智慧旅游平台', '乐山文旅投资集团', '吴海涛', 1200000, '2026-04-01', '2027-03-31', '待审批', 10, '软件开发', '智慧旅游+大数据分析平台', projApproved],
    ];
    const insProj = db.prepare('INSERT OR REPLACE INTO projects (id,name,customer,manager,budget,start_date,end_date,status,progress,type,"desc",approval_flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    projects.forEach((p) => insProj.run(...p));
    console.log(`[Migration 008] 项目: ${projects.length} 条`);

    db.prepare('DELETE FROM suppliers').run();
    const suppliers = [
      ['SUP-001', '联想企业级分销（成都）', 'IT设备', 'A级', '陈经理', '028-88001100', '合作中', 4.5, '2023-01-15'],
      ['SUP-002', '戴尔商用（西南区）', '电子设备', 'A级', '林经理', '028-88002200', '合作中', 4.2, '2023-03-01'],
      ['SUP-003', '格力空调成都总代', '电器设备', 'B级', '张经理', '028-88003300', '合作中', 3.8, '2022-06-10'],
      ['SUP-004', '爱普生投影西南代理', '电子设备', 'B级', '刘经理', '028-88004400', '合作中', 3.5, '2024-01-20'],
      ['SUP-005', '成都礼品定制有限公司', '商务礼品', 'C级', '杨经理', '028-88005500', '合作中', 3.2, '2025-05-15'],
      ['SUP-006', '京东企业采购平台', '办公用品', 'A级', '客服热线', '400-606-5500', '合作中', 4.0, '2023-08-01'],
    ];
    const insSup = db.prepare('INSERT OR REPLACE INTO suppliers (id,name,category,level,contact,phone,status,rating,coop_date) VALUES (?,?,?,?,?,?,?,?,?)');
    suppliers.forEach((s) => insSup.run(...s));
    console.log(`[Migration 008] 供应商: ${suppliers.length} 条`);

    // 公司文件（参考项目数据，含审批流）
    db.prepare('DELETE FROM documents').run();
    const docFlow = JSON.stringify([
      { step: '编写', user: '马小丽', time: '2026-07-18', done: true, remark: '初稿完成' },
      { step: '行政部负责人审批', user: '马小丽', time: '2026-07-19', done: true, remark: '同意' },
      { step: '总经理签署下发', user: '赵德明', time: '2026-07-20', done: true, remark: '批准下发' },
    ]);
    const docs = [
      ['DOC-2026-001', '2026年度员工手册（修订版）', '管理制度', '马小丽', 'ZM006', '行政部', '2026-07-20', '已下发', '全体员工', '本手册旨在规范公司员工行为准则...', 68, docFlow],
      ['DOC-2026-002', '关于夏季作息时间调整的通知', '通知公告', '马小丽', 'ZM006', '行政部', '2026-07-15', '已下发', '全体员工', '经公司研究决定，自2026年7月15日起实行夏季作息时间...', 72, docFlow],
      ['DOC-2026-003', '公司差旅费报销管理规定', '管理制度', '郑雅琳', 'ZM005', '财务部', '2026-07-10', '已下发', '全体员工', '为规范差旅费报销流程...', 55, docFlow],
    ];
    const insDoc = db.prepare('INSERT OR REPLACE INTO documents (id,title,type,author,author_id,dept,date,status,distribute_scope,content,read_count,doc_flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    docs.forEach((d) => insDoc.run(...d));
    console.log(`[Migration 008] 公司文件: ${docs.length} 条`);

    // ===== 2. 参考独有业务表 =====
    if (db.prepare('SELECT COUNT(*) c FROM leaves').get().c === 0) {
      const leaves = [
        ['李明远', 'ZM008', '销售部', '年假', '2026-08-12', '2026-08-16', 3, '家庭出游', '已通过', '林伟杰'],
        ['王思琪', 'ZM009', '销售部', '病假', '2026-08-10', '2026-08-11', 1, '感冒发烧', '已通过', '林伟杰'],
        ['赵晓彤', 'ZM010', '市场部', '事假', '2026-08-15', '2026-08-15', 1, '办理证件', '待审批', ''],
        ['程俊豪', 'ZM022', '技术部', '调休', '2026-08-18', '2026-08-19', 1.5, '周末加班调休', '待审批', ''],
        ['刘文博', 'ZM019', '行政部', '年假', '2026-08-20', '2026-08-22', 2, '回老家探亲', '已驳回', '马小丽'],
      ];
      const ins = db.prepare('INSERT INTO leaves (applicant,applicant_id,dept,type,start_date,end_date,days,reason,status,approver) VALUES (?,?,?,?,?,?,?,?,?,?)');
      leaves.forEach((l) => ins.run(...l));
      console.log(`[Migration 008] 请假: ${leaves.length} 条`);
    }

    if (db.prepare('SELECT COUNT(*) c FROM expenses').get().c === 0) {
      const expenses = [
        ['李明远', 'ZM008', '销售部', '差旅费', 3500, '2026-08-05', '北京客户拜访差旅（机票+酒店+餐饮）', '已通过', 8],
        ['林伟杰', 'ZM003', '销售部', '招待费', 1200, '2026-08-03', '客户接待餐饮', '已通过', 3],
        ['吴海涛', 'ZM004', '技术部', '办公用品', 860, '2026-08-07', '网线及配件采购', '待审批', 2],
        ['陈志远', 'ZM018', '市场部', '差旅费', 2200, '2026-08-09', '上海展会差旅', '待审批', 5],
        ['马小丽', 'ZM006', '行政部', '办公用品', 450, '2026-08-01', '办公文具及打印纸', '已通过', 1],
      ];
      const ins = db.prepare('INSERT INTO expenses (applicant,applicant_id,dept,category,amount,date,"desc",status,receipts) VALUES (?,?,?,?,?,?,?,?,?)');
      expenses.forEach((e) => ins.run(...e));
      console.log(`[Migration 008] 费用报销: ${expenses.length} 条`);
    }

    if (db.prepare('SELECT COUNT(*) c FROM finance_records').get().c === 0) {
      const finFlow = JSON.stringify([
        { step: '财务部录入', user: '罗晓敏', time: '2026-08-01 09:00:00', done: true },
        { step: '财务负责人审批', user: '郑雅琳', time: '2026-08-01 14:00:00', done: true },
        { step: '总经理终审', user: '赵德明', time: '2026-08-02 10:00:00', done: true },
      ]);
      const finPending = JSON.stringify([
        { step: '财务部录入', user: '罗晓敏', time: '2026-08-12 10:00:00', done: true },
        { step: '财务负责人审批', user: '', time: '—', done: false },
        { step: '总经理终审', user: '', time: '—', done: false },
      ]);
      const fins = [
        ['AR-001', 'receivable', '合同款', 430000, '2026-09-30', '销售部', '智联科技第一期款', '已确认', '罗晓敏', 'ZM026', finFlow],
        ['AR-002', 'receivable', '合同款', 260000, '2026-08-31', '销售部', '长通建工第一期款', '已确认', '罗晓敏', 'ZM026', finFlow],
        ['AR-003', 'receivable', '服务费', 140000, '2026-07-31', '销售部', '西南通信运维费', '已确认', '郑雅琳', 'ZM005', finFlow],
        ['AR-004', 'receivable', '合同款', 85000, '2026-10-15', '销售部', '乐山文旅项目预付款', '待审批', '罗晓敏', 'ZM026', finPending],
        ['AP-001', 'payable', '采购款', 96000, '2026-08-30', '技术部', '联想服务器采购', '已确认', '罗晓敏', 'ZM026', finFlow],
        ['AP-002', 'payable', '采购款', 72000, '2026-09-15', '销售部', '戴尔笔记本采购', '已确认', '罗晓敏', 'ZM026', finFlow],
        ['AP-003', 'payable', '采购款', 25000, '2026-08-20', '市场部', '礼品定制采购', '已确认', '郑雅琳', 'ZM005', finFlow],
        ['AP-004', 'payable', '采购款', 38000, '2026-09-30', '技术部', '网络设备采购', '待审批', '罗晓敏', 'ZM026', finPending],
      ];
      const ins = db.prepare('INSERT OR REPLACE INTO finance_records (id,type,category,amount,date,dept,"desc",status,submitter,submitter_id,approval_flow) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      fins.forEach((f) => ins.run(...f));
      console.log(`[Migration 008] 应收应付: ${fins.length} 条`);
    }

    if (db.prepare('SELECT COUNT(*) c FROM fixed_assets').get().c === 0) {
      const assets = [
        ['FA-001', 'ThinkPad X1 Carbon笔记本', '电子设备', '销售部', '李明远', '2025-03-15', 12000, 5700, 6300],
        ['FA-002', 'ThinkSystem SR650服务器', 'IT设备', '技术部', '吴海涛', '2024-06-01', 45000, 17100, 27900],
        ['FA-003', '会议桌（大）', '办公家具', '行政部', '—', '2023-01-10', 8500, 5950, 2550],
        ['FA-004', '格力空调柜机×4', '电器设备', '行政部', '—', '2023-05-20', 27200, 15968, 11232],
        ['FA-005', '投影仪EPSON CB-FH52×3', '电子设备', '行政部', '—', '2024-01-15', 15600, 10660, 4940],
        ['FA-009', '别克GL8商务车', '车辆', '行政部', '钱志明', '2023-07-01', 235000, 52178, 182822],
        ['FA-010', '丰田凯美瑞', '车辆', '行政部', '钱志明', '2023-07-01', 185000, 41104, 143896],
      ];
      const ins = db.prepare('INSERT OR REPLACE INTO fixed_assets (id,name,category,dept,user,purchase_date,original_value,accumulated_dep,net_value,status) VALUES (?,?,?,?,?,?,?,?,?,?)');
      assets.forEach((a) => ins.run(...a, '使用中'));
      console.log(`[Migration 008] 固定资产: ${assets.length} 条`);
    }

    if (db.prepare('SELECT COUNT(*) c FROM salary_templates').get().c === 0) {
      const tpls = [
        ['M5', '高管', 25000, 0.4, 5000, 25000, 0.12, '总经理级'],
        ['M4', '高管', 20000, 0.35, 4000, 20000, 0.12, '副总级'],
        ['P8', '高级', 18000, 0.3, 3000, 18000, 0.12, '总监级'],
        ['P7', '高级', 15000, 0.25, 2500, 15000, 0.12, '高级专家'],
        ['P6', '中级', 12000, 0.2, 2000, 12000, 0.12, '经理级'],
        ['P5', '中级', 10000, 0.15, 1500, 10000, 0.1, '主管级'],
        ['P4', '中级', 8000, 0.12, 1200, 8000, 0.1, '高级专员'],
        ['P3', '初级', 6500, 0.1, 800, 6500, 0.08, '专员级'],
        ['P2', '初级', 5000, 0.08, 500, 5000, 0.08, '助理级'],
      ];
      const ins = db.prepare('INSERT OR REPLACE INTO salary_templates (level,level_name,base_salary,performance_ratio,allowance,social_ins_base,housing_fund_rate,"desc") VALUES (?,?,?,?,?,?,?,?)');
      tpls.forEach((t) => ins.run(...t));
      console.log(`[Migration 008] 薪酬模板: ${tpls.length} 条`);
    }

    if (db.prepare('SELECT COUNT(*) c FROM project_progress').get().c === 0) {
      const progApproved = JSON.stringify([
        { step: '销售总监录入进度', user: '林伟杰', time: '2026-06-01 10:00:00', done: true },
        { step: '总经理审批', user: '赵德明', time: '2026-06-02 14:00:00', done: true },
        { step: '进度确认', user: '系统', time: '2026-06-03 09:00:00', done: true },
      ]);
      const progs = [
        ['PRJ-2026-001', '需求调研阶段', '完成客户需求调研，确认ERP模块需求清单，OA流程梳理完毕，CRM客户分类方案确定。', 30, '林伟杰', 'ZM003', '已确认', progApproved],
        ['PRJ-2026-001', '系统设计阶段', '完成系统架构设计，数据库建模完成，API接口文档编制完毕，前端UI原型确认。', 45, '林伟杰', 'ZM003', '已确认', progApproved],
        ['PRJ-2026-002', '施工阶段', '完成集团总部1-3楼综合布线，监控设备安装完毕，网络设备调试中。', 68, '林伟杰', 'ZM003', '已确认', progApproved],
        ['PRJ-2026-003', '运维启动阶段', '完成通信设备首巡，建立运维档案，制定巡检计划表。', 20, '林伟杰', 'ZM003', '已确认', progApproved],
      ];
      const ins = db.prepare('INSERT INTO project_progress (project_id,phase,content,progress_pct,submitter,submitter_id,status,approval_flow) VALUES (?,?,?,?,?,?,?,?)');
      progs.forEach((p) => ins.run(...p));
      console.log(`[Migration 008] 项目进度: ${progs.length} 条`);
    }

    // 出差（参考数据，含审批流）；当前表结构(id TEXT/预算分列)与参考不一致，按参考 DDL 重建
    db.exec('DROP TABLE IF EXISTS business_trips');
    db.exec(`CREATE TABLE IF NOT EXISTS business_trips (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant   TEXT NOT NULL,
      applicant_id TEXT,
      dept        TEXT DEFAULT '',
      destination TEXT DEFAULT '',
      start_date  TEXT,
      end_date    TEXT,
      days        REAL DEFAULT 0,
      purpose     TEXT DEFAULT '',
      budget      REAL DEFAULT 0,
      status      TEXT DEFAULT '待审批',
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
    )`);
    const tripFlow = JSON.stringify([
      { step: '提交', user: '林伟杰', time: '2026-08-08 10:00:00', done: true },
      { step: '部门审批', user: '林伟杰', time: '2026-08-08 16:00:00', done: true },
      { step: '财务审核', user: '郑雅琳', time: '2026-08-09 09:00:00', done: true },
      { step: '副总审批', user: '刘建华', time: '2026-08-09 11:00:00', done: true },
    ]);
    const trips = [
      ['林伟杰', 'ZM003', '销售部', '成都', '2026-08-10', '2026-08-12', 2, '客户拜访', 3500, '已批准', tripFlow],
      ['赵德明', 'ZM001', '总经理办公室', '深圳', '2026-08-15', '2026-08-17', 3, '商务洽谈', 5000, '待审批', tripFlow],
      ['吴海涛', 'ZM004', '技术部', '绵阳', '2026-08-08', '2026-08-09', 1, '技术支持', 1200, '已批准', tripFlow],
      ['马小丽', 'ZM006', '行政部', '重庆', '2026-07-20', '2026-07-22', 2, '行政培训', 2800, '已驳回', tripFlow],
    ];
    const insTrip = db.prepare('INSERT INTO business_trips (applicant,applicant_id,dept,destination,start_date,end_date,days,purpose,budget,status,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    trips.forEach((t) => insTrip.run(...t));
    console.log(`[Migration 008] 出差申请: ${trips.length} 条`);

    // 工作汇报：重写为参考数据（带部门）
    db.prepare('DELETE FROM work_reports').run();
    const reports = [
      ['ZM001', '赵德明', '总经理办公室', '周报', '2026-08-09', '本周完成季度经营分析报告审批，推进智联项目落地，完成供应商合同谈判。', '下周重点推进乐山文旅项目启动，安排部门经理述职。', '已提交'],
      ['ZM003', '林伟杰', '销售部', '周报', '2026-08-09', '本周新签合同3份，总金额166万。完成乐山文旅项目方案报价，开拓2家新客户。', '下周跟进德阳重型装备合同审批，安排销售技能培训。', '已提交'],
      ['ZM008', '李明远', '销售部', '日报', '2026-08-09', '今日拜访智联科技项目负责人确认项目进度，跟进长通建工网络集成验收事项。', '明日准备西南通信运维服务方案。', '已提交'],
      ['ZM004', '吴海涛', '技术部', '周报', '2026-08-09', '本周完成智联项目二期服务器部署，处理长通建工网络故障3次，完成技术部设备盘点。', '下周推进乐山文旅平台需求调研，完成技术文档整理。', '待审核'],
      ['ZM006', '马小丽', '行政部', '周报', '2026-08-09', '本周完成2026员工手册修订下发，处理假期申请5份，组织全员消防安全培训。', '下周安排办公区空调更换，推进员工体检。', '已提交'],
    ];
    const insRpt = db.prepare('INSERT INTO work_reports (user_id,user_name,dept,type,date,content,plan,status) VALUES (?,?,?,?,?,?,?,?)');
    reports.forEach((r) => insRpt.run(...r));
    console.log(`[Migration 008] 工作汇报: ${reports.length} 条`);

    // 公告：重写为参考数据（带审批流）
    db.prepare('DELETE FROM announcements').run();
    const annDone = JSON.stringify([
      { step: '行政部录入', user: '刘文博', time: '2026-08-01 09:00:00', done: true },
      { step: '行政部负责人审批', user: '马小丽', time: '2026-08-01 14:00:00', done: true },
      { step: '总经理审批', user: '赵德明', time: '2026-08-02 10:00:00', done: true },
      { step: '发布', user: '系统自动', time: '2026-08-02 10:00:00', done: true },
    ]);
    const annPending = JSON.stringify([
      { step: '行政部录入', user: '刘文博', time: '2026-08-13 09:00:00', done: true },
      { step: '行政部负责人审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '发布', user: '', time: '—', done: false },
    ]);
    const anns = [
      ['GG-001', '关于召开2026年第三季度产品发布会的通知', '产品会议', '定于2026年8月20日在公司一楼会议室召开第三季度产品发布会，届时将发布新一代智能办公平台产品线。请各部门负责人准时参加，并提前准备相关汇报材料。', '刘文博', '行政部', '已发布', annDone, '2026-08-02 10:00:00'],
      ['GG-002', '2026年公司夏季团建活动通知', '公司团建', '为增强团队凝聚力，公司定于2026年8月25日组织全体员工前往都江堰开展夏季团建活动。', '刘文博', '行政部', '已发布', annDone, '2026-08-05 10:00:00'],
      ['GG-003', '关于中秋节放假安排的通知', '放假通知', '根据国家法定假日安排，2026年中秋节放假时间为9月15日至9月17日，共3天。', '刘文博', '行政部', '已发布', annDone, '2026-08-08 10:00:00'],
      ['GG-004', '关于任命林伟杰为销售总监的人事任命通知', '人事任命', '经公司研究决定，任命林伟杰同志为销售部总监，全面负责销售部管理工作，自2026年9月1日起执行。', '刘文博', '行政部', '待审批', annPending, '2026-08-13 09:00:00'],
      ['GG-005', '关于组织员工参加成都国际科技展的通知', '外出参访通知', '公司定于2026年8月22日组织技术部及销售部相关人员前往成都世纪城新国际会展中心参观2026成都国际科技展。', '刘文博', '行政部', '待审批', annPending, '2026-08-12 09:00:00'],
      ['GG-006', '关于开展全员网络安全培训的通知', '公司培训通知', '为提升员工网络安全意识，公司定于2026年8月18日下午14:00在三楼培训室开展全员网络安全培训。', '刘文博', '行政部', '已发布', annDone, '2026-08-10 10:00:00'],
      ['GG-007', '关于召开月度部门负责人工作会议的通知', '会议通知', '定于2026年8月16日上午9:00在二楼会议室召开月度部门负责人工作会议。', '刘文博', '行政部', '已发布', annDone, '2026-08-09 10:00:00'],
    ];
    const insAnn = db.prepare('INSERT OR REPLACE INTO announcements (id,title,category,content,author,dept,status,flow,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    anns.forEach((a) => insAnn.run(...a));
    console.log(`[Migration 008] 公司公告: ${anns.length} 条`);

    // ===== 3. 参考 database.js 的内联种子 =====
    if (db.prepare('SELECT COUNT(*) c FROM attendance_schedules').get().c === 0) {
      db.prepare('INSERT INTO attendance_schedules (season,work_start,work_end,lunch_start,lunch_end,active) VALUES (?,?,?,?,?,?)')
        .run('summer', '09:00', '18:00', '12:00', '13:30', 1);
      db.prepare('INSERT INTO attendance_schedules (season,work_start,work_end,lunch_start,lunch_end,active) VALUES (?,?,?,?,?,?)')
        .run('winter', '09:00', '17:30', '12:00', '13:00', 0);
      console.log('[Migration 008] 考勤作息: 2 条');
    }

    // 合同流程专用账号（李法务/王印章/陈档案，参考 database.js 内置）
    const contractUsers = [
      ['28', 'ZM028', 'fw2026', '李法务', '#8b5cf6', '行政部', '法务专员', '13800000028'],
      ['29', 'ZM029', 'yz2026', '王印章', '#f59e0b', '行政部', '印章管理员', '13800000029'],
      ['31', 'ZM031', 'da2026', '陈档案', '#14b8a6', '行政部', '合同档案管理员', '13800000031'],
    ];
    const insCU = db.prepare(`INSERT OR REPLACE INTO users (id,emp_id,password,name,avatar_color,dept,role,phone,status,join_date,level,education,age,salary,contract_role,avatar,leave_balance)
      VALUES (?,?,?,?,?,?,?,?,'在职','2024-03-15','P4','本科',30,'—',?,?,?)`);
    contractUsers.forEach(([id, empId, pass, name, color, dept, role, phone]) => {
      const contractRole = role === '法务专员' ? 'legal' : role === '印章管理员' ? 'seal' : 'archive';
      insCU.run(id, empId, pass, name, color, dept, role, phone, contractRole, name.charAt(0), '{}');
    });
    console.log('[Migration 008] 合同流程账号: 3 个');

    if (db.prepare('SELECT COUNT(*) c FROM t_company_info').get().c === 0) {
      db.prepare('INSERT OR IGNORE INTO t_company_info (id, company_name) VALUES (1, ?)').run('四川卓盟科技有限公司');
      console.log('[Migration 008] 公司信息: 1 条');
    }

    db.prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES ('seed_008_done', '1')").run();
    console.log('[Migration 008] 参考业务数据对齐完成');
  },
};
