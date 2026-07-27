/* 001_init - 初始 schema + 种子数据
 * 等价于原 db-init.js + supplement-kv.js：
 *   - 建 14 张业务表
 *   - 清空并插入全部种子数据（用户/部门/客户/合同/项目/假期/费用/采购/角色/权限/打卡）
 *   - kv_store 含全部配置与统计数据（含补充的 customerLevels/customerLifecycle/
 *     checkinRecords/teamMembers/projectStats/reportsList，修复原 6 个接口 500）
 */
module.exports = {
  id: '001_init',

  up(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dept TEXT,
    role TEXT,
    status TEXT DEFAULT '在职',
    join_date TEXT,
    level TEXT,
    phone TEXT,
    email TEXT,
    education TEXT,
    age INTEGER,
    password TEXT DEFAULT '123456',
    avatar TEXT,
    avatar_color TEXT,
    leave_balance TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    head TEXT,
    count INTEGER DEFAULT 0,
    color TEXT,
    icon TEXT,
    parent_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    contact TEXT,
    contact_title TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    level TEXT,
    lifecycle TEXT,
    status TEXT,
    industry TEXT,
    area TEXT,
    source TEXT,
    owner TEXT,
    credit_rating TEXT,
    satisfaction REAL DEFAULT 0,
    contract_count INTEGER DEFAULT 0,
    last_visit TEXT,
    deal_amount REAL DEFAULT 0,
    visits INTEGER DEFAULT 0,
    create_date TEXT,
    tags TEXT,
    follow_ups TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    customer TEXT,
    type TEXT,
    amount REAL,
    start_date TEXT,
    end_date TEXT,
    status TEXT,
    progress INTEGER DEFAULT 0,
    creator TEXT,
    approver TEXT,
    sign_date TEXT,
    flow TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    customer TEXT,
    status TEXT,
    priority TEXT,
    start_date TEXT,
    end_date TEXT,
    progress INTEGER DEFAULT 0,
    budget REAL DEFAULT 0,
    spent REAL DEFAULT 0,
    manager TEXT,
    team TEXT,
    milestones TEXT,
    audits TEXT,
    flow TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS leave_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    applicant TEXT,
    type TEXT,
    start_date TEXT,
    end_date TEXT,
    days REAL,
    reason TEXT,
    status TEXT DEFAULT '待审批',
    approver TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS expense_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    applicant TEXT,
    category TEXT,
    amount REAL,
    date TEXT,
    desc_text TEXT,
    status TEXT DEFAULT '待审批',
    receipts INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    title TEXT,
    category TEXT,
    amount REAL,
    qty INTEGER,
    unit TEXT,
    status TEXT,
    applicant TEXT,
    date TEXT,
    vendor TEXT,
    flow TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    desc_text TEXT,
    color TEXT,
    users INTEGER DEFAULT 0,
    level TEXT,
    scope TEXT,
    scope_desc TEXT,
    can_create INTEGER DEFAULT 0,
    can_edit INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,
    can_approve INTEGER DEFAULT 0,
    duties TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    user_name TEXT,
    check_in_time TEXT,
    check_in_loc TEXT,
    check_out_time TEXT,
    check_out_loc TEXT,
    status TEXT,
    date TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS work_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT,
    type TEXT,
    date TEXT,
    content TEXT,
    plan TEXT,
    status TEXT DEFAULT '已提交',
    submitted_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS perm_logs (
    id TEXT PRIMARY KEY,
    log_date TEXT,
    operator TEXT,
    target TEXT,
    action TEXT,
    detail TEXT,
    module TEXT,
    before_role TEXT,
    after_role TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS perm_approvals (
    id TEXT PRIMARY KEY,
    applicant TEXT,
    applicant_role TEXT,
    target_role TEXT,
    target_modules TEXT,
    reason TEXT,
    status TEXT DEFAULT '待审批',
    apply_date TEXT,
    approver TEXT,
    approve_date TEXT,
    urgency TEXT,
    remark TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);
  },

  seed(db) {
    // 幂等保护：已有数据则跳过，避免每次 seed 清空生产数据。
    // 需要重置请用 `npm run migrate:reset`。
    if (db.prepare('SELECT COUNT(*) as c FROM users').get().c > 0) return;

    // 清空旧数据（重新初始化时）
    db.exec(`
DELETE FROM users; DELETE FROM departments; DELETE FROM customers;
DELETE FROM contracts; DELETE FROM projects; DELETE FROM leave_records;
DELETE FROM expense_records; DELETE FROM purchases; DELETE FROM roles;
DELETE FROM checkins; DELETE FROM work_reports; DELETE FROM kv_store;
DELETE FROM perm_logs; DELETE FROM perm_approvals;
`);

    const today = new Date().toISOString().slice(0, 10);

    // --- 用户 ---
    const insUser = db.prepare(`INSERT INTO users (id,name,dept,role,status,join_date,level,phone,email,education,age,password,avatar,avatar_color,leave_balance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const users = [
      ['ZM001','李明远','销售部','区域经理','在职','2024-03-15','P6','138****8888','limingyuan@zhuomeng.com','本科',32,'123456','李','#2563eb','{"annual":5,"sick":3,"personal":2,"totalUsed":3}'],
      ['ZM002','王思琪','销售部','高级销售','在职','2025-06-01','P4','139****6666','wangsiqi@zhuomeng.com','本科',26,'123456','王','#8b5cf6','{"annual":6,"sick":3,"personal":2,"totalUsed":1}'],
      ['ZM003','张浩然','销售部','销售代表','在职','2025-09-10','P3','137****5555','zhanghaoran@zhuomeng.com','大专',24,'123456','张','#10b981','{"annual":5,"sick":3,"personal":2,"totalUsed":0}'],
      ['ZM004','陈雨桐','销售部','销售代表','试用期','2026-06-01','P2','136****4444','chenyutong@zhuomeng.com','本科',23,'123456','陈','#f59e0b','{"annual":2,"sick":3,"personal":1,"totalUsed":0}'],
      ['ZM005','刘子轩','销售部','销售代表','在职','2024-08-20','P4','135****3333','liuzixuan@zhuomeng.com','本科',28,'123456','刘','#ef4444','{"annual":5,"sick":3,"personal":2,"totalUsed":2}'],
      ['ZM006','赵晓彤','市场部','市场专员','在职','2025-01-15','P3','133****2222','zhaoxiaotong@zhuomeng.com','本科',25,'123456','赵','#06b6d4','{"annual":5,"sick":3,"personal":2,"totalUsed":1}'],
      ['ZM007','孙博文','销售部','销售代表','在职','2025-11-01','P3','132****1111','sunbowen@zhuomeng.com','本科',27,'123456','孙','#f59e0b','{"annual":5,"sick":3,"personal":2,"totalUsed":0}'],
      ['ZM008','周梦瑶','销售部','销售代表','请假','2024-12-01','P3','131****0000','zhoumengyao@zhuomeng.com','本科',25,'123456','周','#ec4899','{"annual":4,"sick":3,"personal":2,"totalUsed":2}'],
      ['ZM009','吴海涛','技术部','技术总监','在职','2023-01-10','P7','130****9999','wuhaitao@zhuomeng.com','硕士',35,'123456','吴','#10b981','{"annual":8,"sick":3,"personal":2,"totalUsed":1}'],
      ['ZM010','郑雅琳','财务部','财务经理','在职','2023-06-15','P5','129****8888','zhengyalin@zhuomeng.com','本科',30,'123456','郑','#f59e0b','{"annual":6,"sick":3,"personal":2,"totalUsed":1}'],
      ['ZM011','马小丽','行政部','行政主管','在职','2024-02-01','P4','128****7777','maxiaoli@zhuomeng.com','本科',28,'123456','马','#06b6d4','{"annual":5,"sick":3,"personal":2,"totalUsed":0}'],
      ['ZM012','林伟杰','销售部','销售总监','在职','2022-08-01','P8','127****6666','linweijie@zhuomeng.com','硕士',38,'123456','林','#1e293b','{"annual":10,"sick":3,"personal":2,"totalUsed":2}'],
    ];
    users.forEach((u) => insUser.run(...u));

    // --- 部门 ---
    const insDept = db.prepare(`INSERT INTO departments (id,name,head,count,color,icon,parent_id) VALUES (?,?,?,?,?,?,?)`);
    [
      [1,'总经理办公室','赵总',3,'#1e293b','building',null],
      [2,'销售部','林伟杰',25,'#2563eb','shopping-cart',null],
      [21,'销售一部','李明远',8,'#2563eb','users',2],
      [22,'销售二部','王思琪',7,'#3b82f6','users',2],
      [23,'销售三部','赵晓彤',10,'#60a5fa','users',2],
      [3,'市场部','陈总监',8,'#8b5cf6','bullhorn',null],
      [4,'技术部','吴海涛',12,'#10b981','code',null],
      [5,'财务部','郑雅琳',5,'#f59e0b','cny',null],
      [6,'行政部','马小丽',3,'#06b6d4','paperclip',null],
    ].forEach((d) => insDept.run(...d));

    // --- 客户 ---
    const insCust = db.prepare(`INSERT INTO customers (id,name,short_name,contact,contact_title,phone,email,address,level,lifecycle,status,industry,area,source,owner,credit_rating,satisfaction,contract_count,last_visit,deal_amount,visits,create_date,tags,follow_ups) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    [
      [1,'成都锦程信息科技有限公司','锦程科技','赵明华','总经理','138-0000-1111','zhao@jincheng.com','高新区天府大道888号锦程大厦','A','签约','合作中','信息技术','高新区','行业展会','李明远','优秀',4.8,3,'2026-07-20',1280000,8,'2024-03-15','["战略合作","长期合同","信息化"]','[{"date":"2026-07-20","type":"拜访","content":"讨论下半年合作规划，客户对ERP升级方案满意","operator":"李明远"},{"date":"2026-07-05","type":"电话","content":"确认合同续签意向，客户表示继续合作","operator":"李明远"},{"date":"2026-06-20","type":"会议","content":"项目交付验收会议，系统运行稳定","operator":"李明远"}]'],
      [2,'四川智联物流有限公司','智联物流','钱志强','业务经理','139-0000-2222','qian@zhilian.com','武侯区人民南路物流园区','B','跟进','跟进中','物流运输','武侯区','客户推荐','张浩然','良好',4.2,0,'2026-07-20',0,3,'2025-11-20','["物流","TMS需求","商机"]','[{"date":"2026-07-20","type":"拜访","content":"客户参观了TMS演示，表示有采购意向","operator":"张浩然"},{"date":"2026-07-08","type":"电话","content":"确认需求，客户需要物流运输管理系统","operator":"张浩然"}]'],
      [3,'四川鼎盛建设集团','鼎盛建设','孙国强','董事长','137-0000-3333','sun@dingsheng.com','金牛区蜀汉路鼎盛大厦','S','续约','合作中','建筑工程','金牛区','政府引荐','王思琪','优秀',4.9,5,'2026-07-20',2560000,12,'2023-06-01','["战略合作","建筑信息化","VIP"]','[{"date":"2026-07-20","type":"拜访","content":"总经理陪同拜访，讨论新项目BIM管理系统方案","operator":"王思琪"},{"date":"2026-07-15","type":"会议","content":"季度战略会议，续签3年合作协议","operator":"王思琪"}]'],
      [4,'成都汇通商贸有限公司','汇通商贸','李建华','总经理','136-0000-4444','li@huitong.com','青羊区光华大道汇通商业中心','B','谈判','续签中','商贸流通','青羊区','网络推广','刘子轩','良好',4.1,1,'2026-07-20',450000,6,'2025-01-10','["商贸","库存管理","续签"]','[{"date":"2026-07-20","type":"拜访","content":"续签谈判，客户希望增加仓储管理功能","operator":"刘子轩"}]'],
      [5,'成都易达电子商务有限公司','易达电商','周小鹏','运营总监','135-0000-5555','zhou@yida.com','成华区东郊记忆易达园区','C','初访','初次接触','电子商务','成华区','线上咨询','周梦瑶','待评估',0,0,'2026-07-20',0,1,'2026-07-18','["电商","初步接触","新线索"]','[{"date":"2026-07-20","type":"电话","content":"首次电话沟通，了解电商管理需求","operator":"周梦瑶"}]'],
      [6,'四川天府数字科技有限公司','天府数字','吴建民','CTO','133-0000-6666','wu@tianfu-digital.com','天府新区科学城数字大厦','S','签约','合作中','信息技术','天府新区','战略合作','李明远','优秀',4.7,4,'2026-07-18',1890000,15,'2024-01-20','["数字化转型","长期合作","大数据"]','[{"date":"2026-07-18","type":"拜访","content":"讨论大数据平台二期项目需求","operator":"李明远"},{"date":"2026-07-10","type":"会议","content":"一期项目验收会议，顺利交付","operator":"李明远"}]'],
      [7,'成都西部制造有限公司','西部制造','郑德胜','厂长','132-0000-7777','zheng@xibu-mfg.com','龙泉驿区经开区西部工业园','B','跟进','跟进中','制造业','龙泉驿','行业协会','孙博文','良好',3.8,0,'2026-07-17',0,4,'2025-09-05','["制造业","MES需求","评估中"]','[{"date":"2026-07-17","type":"拜访","content":"参观产线，讨论MES系统实施方案","operator":"孙博文"}]'],
      [8,'四川长虹新能源有限公司','长虹新能源','韩经理','采购总监','131-0000-8888','han@changhong-energy.com','高新区长虹科技园','A','谈判','谈判中','新能源','高新区','招标渠道','张浩然','优秀',4.3,0,'2026-07-19',0,7,'2026-02-10','["新能源","招投标","大客户"]','[{"date":"2026-07-19","type":"会议","content":"招投标方案评审，进入第二轮","operator":"张浩然"}]'],
      [9,'成都润泽医疗器械有限公司','润泽医疗','马总','总经理','130-0000-9999','ma@runze-medical.com','温江区成都医学城','C','跟进','跟进中','医疗器械','温江区','客户推荐','周梦瑶','待评估',3.5,0,'2026-07-16',0,2,'2026-04-20','["医疗","合规管理","小客户"]','[{"date":"2026-07-16","type":"电话","content":"了解合规管理系统需求，客户表示感兴趣","operator":"周梦瑶"}]'],
      [10,'重庆万里达电子科技有限公司','万里达电子','冯总监','技术总监','158-0000-0001','feng@wanlida.com','中国重庆市渝北区仙桃数据谷','D','潜客','待开发','电子科技','中国重庆市','线上咨询','待分配','未评估',0,0,'-',0,0,'2026-07-12','["电子","跨区域","潜客"]','[]'],
    ].forEach((c) => insCust.run(...c));

    // --- 合同 ---
    const insContract = db.prepare(`INSERT INTO contracts (id,name,customer,type,amount,start_date,end_date,status,progress,creator,approver,sign_date,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    [
      ['CT-2026-038','成都锦程信息科技年度合作协议','成都锦程信息科技有限公司','销售合同',1280000,'2026-01-15','2026-12-31','执行中',65,'李明远','王总监','2026-01-12','[{"step":"提交","user":"李明远","time":"2026-01-08","done":true},{"step":"部门审批","user":"王总监","time":"2026-01-10","done":true},{"step":"财务审核","user":"财务部张经理","time":"2026-01-11","done":true},{"step":"总经理签字","user":"赵总","time":"2026-01-12","done":true}]'],
      ['CT-2026-045','四川鼎盛建设集团技术方案合同','四川鼎盛建设集团','服务合同',2560000,'2026-03-01','2027-02-28','执行中',40,'李明远','王总监','2026-02-28','[{"step":"提交","user":"李明远","time":"2026-02-25","done":true},{"step":"部门审批","user":"王总监","time":"2026-02-27","done":true},{"step":"财务审核","user":"财务部张经理","time":"2026-02-28 10:00","done":true},{"step":"总经理签字","user":"赵总","time":"2026-02-28 14:00","done":true}]'],
      ['CT-2026-052','四川智联物流仓储管理合同','四川智联物流有限公司','销售合同',450000,'2026-08-01','2027-07-31','待审批',0,'张浩然','李明远',null,'[{"step":"提交","user":"张浩然","time":"2026-07-18","done":true},{"step":"部门审批","user":"李明远","time":"-","done":false},{"step":"财务审核","user":"财务部张经理","time":"-","done":false},{"step":"总经理签字","user":"赵总","time":"-","done":false}]'],
      ['CT-2026-053','成都汇通商贸续签合同','成都汇通商贸有限公司','续签合同',450000,'2026-09-01','2027-08-31','待审批',0,'刘子轩','李明远',null,'[{"step":"提交","user":"刘子轩","time":"2026-07-20","done":true},{"step":"部门审批","user":"李明远","time":"-","done":false},{"step":"财务审核","user":"财务部张经理","time":"-","done":false},{"step":"总经理签字","user":"赵总","time":"-","done":false}]'],
      ['CT-2026-041','办公设备采购合同','联想（北京）有限公司','采购合同',168000,'2026-06-01','2026-06-30','已完成',100,'行政部','王总监','2026-05-28','[{"step":"提交","user":"行政部","time":"2026-05-25","done":true},{"step":"部门审批","user":"王总监","time":"2026-05-27","done":true},{"step":"财务审核","user":"财务部张经理","time":"2026-05-28","done":true},{"step":"总经理签字","user":"赵总","time":"2026-05-28","done":true}]'],
      ['CT-2026-048','天府数字科技运维服务合同','四川天府数字科技有限公司','服务合同',1890000,'2026-04-01','2027-03-31','执行中',55,'李明远','王总监','2026-03-28','[{"step":"提交","user":"李明远","time":"2026-03-25","done":true},{"step":"部门审批","user":"王总监","time":"2026-03-27","done":true},{"step":"财务审核","user":"财务部张经理","time":"2026-03-28","done":true},{"step":"总经理签字","user":"赵总","time":"2026-03-28","done":true}]'],
    ].forEach((c) => insContract.run(...c));

    // --- 假期记录 ---
    const insLeave = db.prepare(`INSERT INTO leave_records (applicant,type,start_date,end_date,days,reason,status,approver) VALUES (?,?,?,?,?,?,?,?)`);
    [
      ['李明远','年假','2026-07-25','2026-07-26',2,'个人事务','待审批','王总监'],
      ['周梦瑶','事假','2026-07-20','2026-07-21',1,'家庭原因','已通过','李明远'],
      ['陈雨桐','病假','2026-07-18','2026-07-19',1,'身体不适需休息','已通过','李明远'],
      ['张浩然','年假','2026-08-01','2026-08-03',3,'暑期休假','待审批','李明远'],
      ['王思琪','调休','2026-07-22','2026-07-22',1,'上周加班调休','已通过','李明远'],
    ].forEach((l) => insLeave.run(...l));

    // --- 费用报销 ---
    const insExpense = db.prepare(`INSERT INTO expense_records (applicant,category,amount,date,desc_text,status,receipts) VALUES (?,?,?,?,?,?,?)`);
    [
      ['李明远','交通费',380,'2026-07-20','拜访客户打车费用','待审批',3],
      ['张浩然','餐饮费',256,'2026-07-20','客户招待午餐','待审批',1],
      ['刘子轩','差旅费',1850,'2026-07-19','出差成都-绵阳交通住宿','已通过',5],
      ['王思琪','办公用品',128,'2026-07-18','打印纸和办公耗材','已通过',2],
      ['李明远','通讯费',200,'2026-07-17','手机话费报销','已通过',1],
      ['孙博文','交通费',120,'2026-07-16','客户拜访地铁公交','已驳回',2],
    ].forEach((e) => insExpense.run(...e));

    // --- 采购 ---
    const insPurchase = db.prepare(`INSERT INTO purchases (id,title,category,amount,qty,unit,status,applicant,date,vendor,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    [
      ['PO-2026-028','笔记本电脑采购（销售部）','电子设备',96000,12,'台','已入库','行政部','2026-06-15','联想（北京）有限公司','[{"step":"申请","done":true},{"step":"审批","done":true},{"step":"采购","done":true},{"step":"入库","done":true}]'],
      ['PO-2026-032','打印纸及办公耗材','办公用品',3200,200,'箱','采购中','王思琪','2026-07-10','成都纸业供应商','[{"step":"申请","done":true},{"step":"审批","done":true},{"step":"采购","done":false},{"step":"入库","done":false}]'],
      ['PO-2026-033','服务器扩容采购','IT设备',85000,2,'台','待审批','技术部','2026-07-18','华为技术有限公司','[{"step":"申请","done":true},{"step":"审批","done":false},{"step":"采购","done":false},{"step":"入库","done":false}]'],
      ['PO-2026-034','客户礼品采购','商务礼品',15000,50,'份','待审批','李明远','2026-07-20','-','[{"step":"申请","done":true},{"step":"审批","done":false},{"step":"采购","done":false},{"step":"入库","done":false}]'],
    ].forEach((p) => insPurchase.run(...p));

    // --- 项目 ---
    const insProject = db.prepare(`INSERT INTO projects (id,name,customer,status,priority,start_date,end_date,progress,budget,spent,manager,team,milestones,audits,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    [
      ['PJ-2026-001','鼎盛建设集团ERP系统开发','四川鼎盛建设集团','执行中','高','2026-03-01','2026-12-31',45,2560000,1152000,'李明远','[{"name":"李明远","role":"项目经理","avatar":"李","color":"#2563eb","dept":"销售部"},{"name":"吴海涛","role":"技术负责人","avatar":"吴","color":"#10b981","dept":"技术部"},{"name":"陈雨桐","role":"需求分析师","avatar":"陈","color":"#f59e0b","dept":"销售部"},{"name":"赵晓彤","role":"UI设计师","avatar":"赵","color":"#06b6d4","dept":"市场部"},{"name":"技术部3人","role":"开发工程师","avatar":"技","color":"#8b5cf6","dept":"技术部"}]','[{"name":"项目启动","date":"2026-03-01","status":"done","approver":"林伟杰","approveTime":"2026-03-01"},{"name":"需求调研完成","date":"2026-04-15","status":"done","approver":"吴海涛","approveTime":"2026-04-16"},{"name":"方案设计评审","date":"2026-05-30","status":"done","approver":"吴海涛","approveTime":"2026-06-01"},{"name":"开发阶段一期交付","date":"2026-08-15","status":"current","approver":"待审批","approveTime":"-"},{"name":"开发阶段二期交付","date":"2026-10-15","status":"pending","approver":"-","approveTime":"-"},{"name":"系统测试验收","date":"2026-11-30","status":"pending","approver":"-","approveTime":"-"},{"name":"上线部署","date":"2026-12-15","status":"pending","approver":"-","approveTime":"-"},{"name":"项目结项","date":"2026-12-31","status":"pending","approver":"-","approveTime":"-"}]','[{"id":1,"date":"2026-04-20","auditor":"吴海涛","type":"需求评审","result":"通过","remark":"需求文档完整，客户确认无误"},{"id":2,"date":"2026-06-05","auditor":"郑雅琳","type":"预算审计","result":"通过","remark":"预算执行率44.5%，在合理范围内"},{"id":3,"date":"2026-07-10","auditor":"林伟杰","type":"进度检查","result":"待整改","remark":"一期开发进度略有延迟，需加快节奏"}]','[{"step":"提交立项","user":"李明远","time":"2026-02-25","done":true},{"step":"部门审批","user":"林伟杰","time":"2026-02-28","done":true},{"step":"财务审核","user":"郑雅琳","time":"2026-03-01","done":true},{"step":"总经理批准","user":"赵总","time":"2026-03-01","done":true}]'],
      ['PJ-2026-002','天府数字科技数据平台搭建','四川天府数字科技有限公司','执行中','中','2026-04-01','2027-03-31',55,1890000,1039500,'张浩然','[{"name":"张浩然","role":"项目经理","avatar":"张","color":"#10b981","dept":"销售部"},{"name":"吴海涛","role":"架构设计","avatar":"吴","color":"#10b981","dept":"技术部"},{"name":"刘子轩","role":"客户对接","avatar":"刘","color":"#ef4444","dept":"销售部"},{"name":"技术部4人","role":"开发工程师","avatar":"技","color":"#8b5cf6","dept":"技术部"}]','[{"name":"项目启动","date":"2026-04-01","status":"done","approver":"林伟杰","approveTime":"2026-04-02"},{"name":"数据源对接完成","date":"2026-05-30","status":"done","approver":"吴海涛","approveTime":"2026-06-01"},{"name":"平台核心功能开发","date":"2026-09-01","status":"current","approver":"待审批","approveTime":"-"},{"name":"数据可视化模块","date":"2026-12-01","status":"pending","approver":"-","approveTime":"-"},{"name":"验收上线","date":"2027-02-28","status":"pending","approver":"-","approveTime":"-"},{"name":"项目结项","date":"2027-03-31","status":"pending","approver":"-","approveTime":"-"}]','[{"id":1,"date":"2026-05-15","auditor":"吴海涛","type":"架构评审","result":"通过","remark":"架构方案合理，可扩展性好"},{"id":2,"date":"2026-07-15","auditor":"郑雅琳","type":"中期预算审计","result":"通过","remark":"支出占比55%，符合项目进度"}]','[{"step":"提交立项","user":"张浩然","time":"2026-03-25","done":true},{"step":"部门审批","user":"李明远","time":"2026-03-28","done":true},{"step":"财务审核","user":"郑雅琳","time":"2026-03-30","done":true},{"step":"总经理批准","user":"赵总","time":"2026-04-01","done":true}]'],
      ['PJ-2026-003','锦程信息年度运维服务','成都锦程信息科技有限公司','执行中','低','2026-01-15','2026-12-31',65,1280000,832000,'刘子轩','[{"name":"刘子轩","role":"项目经理","avatar":"刘","color":"#ef4444","dept":"销售部"},{"name":"技术部2人","role":"运维工程师","avatar":"技","color":"#10b981","dept":"技术部"}]','[{"name":"项目启动","date":"2026-01-15","status":"done","approver":"林伟杰","approveTime":"2026-01-15"},{"name":"Q1运维报告","date":"2026-03-31","status":"done","approver":"吴海涛","approveTime":"2026-04-02"},{"name":"Q2运维报告","date":"2026-06-30","status":"done","approver":"吴海涛","approveTime":"2026-07-02"},{"name":"Q3运维报告","date":"2026-09-30","status":"current","approver":"待审批","approveTime":"-"},{"name":"项目结项","date":"2026-12-31","status":"pending","approver":"-","approveTime":"-"}]','[{"id":1,"date":"2026-04-10","auditor":"吴海涛","type":"服务质量审计","result":"通过","remark":"SLA达标率99.2%，超合同要求"}]','[{"step":"提交立项","user":"刘子轩","time":"2026-01-08","done":true},{"step":"部门审批","user":"李明远","time":"2026-01-10","done":true},{"step":"财务审核","user":"郑雅琳","time":"2026-01-12","done":true},{"step":"总经理批准","user":"赵总","time":"2026-01-14","done":true}]'],
      ['PJ-2026-004','智联物流仓储管理系统','四川智联物流有限公司','立项审批中','中','-','-',0,450000,0,'张浩然','[{"name":"张浩然","role":"项目经理","avatar":"张","color":"#10b981","dept":"销售部"},{"name":"待分配","role":"开发工程师","avatar":"?","color":"#94a3b8","dept":"技术部"}]','[]','[]','[{"step":"提交立项","user":"张浩然","time":"2026-07-18","done":true},{"step":"部门审批","user":"李明远","time":"-","done":false},{"step":"财务审核","user":"郑雅琳","time":"-","done":false},{"step":"总经理批准","user":"赵总","time":"-","done":false}]'],
      ['PJ-2026-005','公司内部OA系统升级','内部项目','待立项','高','-','-',0,380000,0,'行政部','[]','[]','[]','[{"step":"提交立项","user":"马小丽","time":"-","done":false},{"step":"部门审批","user":"-","time":"-","done":false},{"step":"财务审核","user":"-","time":"-","done":false},{"step":"总经理批准","user":"-","time":"-","done":false}]'],
    ].forEach((p) => insProject.run(...p));

    // --- 角色 ---
    const insRole = db.prepare(`INSERT INTO roles (id,name,desc_text,color,users,level,scope,scope_desc,can_create,can_edit,can_delete,can_approve,duties) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    [
      [1,'超级管理员','拥有所有系统权限','#1e293b',1,'最高级','全公司','可查看所有部门数据',1,1,1,1,'["系统配置与维护","用户权限分配","全公司数据审计","安全策略制定","紧急事项审批"]'],
      [2,'部门经理','管理本部门所有事务','#2563eb',4,'管理层','本部门','仅可查看本部门及下属数据',1,1,0,1,'["部门日常管理","员工考勤审批","费用报销审批","合同审批","部门数据查看"]'],
      [3,'区域经理','管理本区域销售业务','#8b5cf6',3,'管理层','本区域','仅可查看本区域销售数据',1,1,0,1,'["区域销售管理","客户分配跟进","出差审批","销售目标制定","区域业绩分析"]'],
      [4,'普通员工','基础办公功能权限','#10b981',42,'执行层','本人','仅可查看本人数据',1,0,0,0,'["日常打卡签到","工作汇报提交","假期申请提交","费用报销申请","出差申请提交"]'],
      [5,'财务专员','财务相关功能权限','#f59e0b',5,'专业层','财务数据','可查看全公司财务数据',1,1,0,0,'["财务数据录入","费用审核核算","应收应付管理","预算编制执行","财务报表制作"]'],
      [6,'人事专员','人事管理功能权限','#06b6d4',2,'专业层','人事数据','可查看全公司人事数据',1,1,0,0,'["员工档案管理","考勤数据汇总","假期审批初审","培训计划制定","绩效考核辅助"]'],
    ].forEach((r) => insRole.run(...r));

    // --- 权限审批记录 ---
    const insPermApp = db.prepare(`INSERT INTO perm_approvals (id,applicant,applicant_role,target_role,target_modules,reason,status,apply_date,approver,approve_date,urgency,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    [
      ['PA-001','陈雨桐','普通员工','区域经理','["合同审批","客户管理"]','因业务拓展需要，申请客户管理和合同审批权限','待审批','2026-07-20','李明远',null,'普通',null],
      ['PA-002','马小丽','人事专员','人事专员(扩展)','["假期申请(审批)"]','因人事主管休假，申请假期审批权限临时授权','待审批','2026-07-19','林伟杰',null,'紧急',null],
      ['PA-003','赵晓彤','普通员工','部门经理(临时)','["费用报销(审批)"]','临时负责市场部费用审批，申请一周临时审批权限','已通过','2026-07-15','林伟杰','2026-07-16','紧急','临时授权，有效期至2026-07-22'],
      ['PA-004','张浩然','普通员工','区域经理','["销售统计","客户管理"]','申请查看销售数据和客户数据用于业务分析','已拒绝','2026-07-10','李明远','2026-07-11','普通','权限范围过大，建议先申请客户管理部分权限'],
      ['PA-005','吴海涛','部门经理(技术部)','超级管理员(部分)','["系统设置"]','系统配置需求，申请系统设置模块权限','已通过','2026-07-08','林伟杰','2026-07-09','普通','仅授权系统配置查看权限'],
    ].forEach((p) => insPermApp.run(...p));

    // --- 权限变更日志 ---
    const insPermLog = db.prepare(`INSERT INTO perm_logs (id,log_date,operator,target,action,detail,module,before_role,after_role) VALUES (?,?,?,?,?,?,?,?,?)`);
    [
      ['PL-001','2026-07-20','林伟杰','陈雨桐','权限申请提交','申请客户管理+合同审批模块权限','权限管理','普通员工','普通员工(待审批)'],
      ['PL-002','2026-07-19','马小丽','马小丽','权限申请提交','申请假期审批权限临时授权','权限管理','人事专员','人事专员(待审批)'],
      ['PL-003','2026-07-16','林伟杰','赵晓彤','权限审批通过','临时授权费用报销审批权限（有效期至2026-07-22）','费用报销','普通员工','普通员工+临时审批'],
      ['PL-004','2026-07-15','赵晓彤','赵晓彤','权限申请提交','申请市场部费用审批临时权限','权限管理','普通员工','普通员工(待审批)'],
      ['PL-005','2026-07-11','李明远','张浩然','权限审批拒绝','拒绝销售统计+客户管理权限申请，建议先申请部分权限','权限管理','普通员工','普通员工'],
      ['PL-006','2026-07-09','林伟杰','吴海涛','权限审批通过','授权系统配置查看权限（仅查看，不含编辑删除）','系统设置','部门经理','部门经理+系统查看'],
      ['PL-007','2026-07-01','林伟杰','全体员工','权限批量调整','新增项目管理、出差申请模块，所有管理层获得审批权限','系统设置','-','-'],
      ['PL-008','2026-06-15','林伟杰','郑雅琳','权限范围调整','财务专员数据范围从本部门扩展到全公司','财务管理','财务专员(本部门)','财务专员(全公司)'],
    ].forEach((p) => insPermLog.run(...p));

    // --- kv_store：配置与统计数据（含补充项） ---
    const insKV = db.prepare(`INSERT OR REPLACE INTO kv_store (key,value) VALUES (?,?)`);
    const kvData = {
      currentUser: JSON.stringify({ id:'ZM001',name:'李明远',avatar:'李',avatarColor:'#2563eb',dept:'销售部',role:'区域经理',phone:'138****8888',leaveBalance:{annual:5,sick:3,personal:2,totalUsed:3} }),
      todayCheckin: JSON.stringify({ checkInTime:'08:52',checkInLoc:'成都市高新区天府软件园D区',checkOutTime:null,status:'signed_in' }),
      stats: JSON.stringify({ todayCheckin:42,totalStaff:56,pendingReports:3,todayVisits:18,weekCheckinRate:94,monthReportRate:87,newCustomers:12,pendingApprovals:5 }),
      cockpit: JSON.stringify({ revenue:945.6,revenueTarget:1200,revenueRate:78.8,expense:312.5,profit:633.1,profitRate:67,headcount:56,headcountTarget:60,customerTotal:127,activeContracts:38,pendingContracts:2,overdueAR:48.5,alerts:[{type:'danger',msg:'应收账款逾期 ¥48.5万，涉及5家客户，请尽快催收',icon:'exclamation-triangle'},{type:'warning',msg:'本月预算执行率已达72%，请控制支出节奏',icon:'exclamation-circle'},{type:'success',msg:'新增A级客户3家，客户满意度评分上升至4.6',icon:'check-circle'},{type:'info',msg:'2份合同待审批，3份假期申请待处理',icon:'info-circle'}],revenueTrend:{labels:['1月','2月','3月','4月','5月','6月','7月'],data:[680,720,790,850,910,920,945]},expenseTrend:{labels:['1月','2月','3月','4月','5月','6月','7月'],data:[220,245,268,280,295,305,312]} }),
      leaveTypes: JSON.stringify([{type:'年假',icon:'suitcase',color:'#2563eb',balance:5,used:3,total:8},{type:'病假',icon:'hospital-o',color:'#ef4444',balance:3,used:0,total:3},{type:'事假',icon:'calendar-times-o',color:'#f59e0b',balance:2,used:0,total:2},{type:'调休',icon:'exchange',color:'#8b5cf6',balance:1,used:1,total:2},{type:'婚假',icon:'heart',color:'#ec4899',balance:10,used:0,total:10},{type:'产假',icon:'baby',color:'#06b6d4',balance:158,used:0,total:158}]),
      expenseCategories: JSON.stringify(['交通费','餐饮费','住宿费','办公用品','通讯费','差旅费','招待费','其他']),
      expenseStats: JSON.stringify({ totalSubmitted:4320,totalApproved:2178,pending:636,rejected:120,monthBudget:5000,usedRate:43.6 }),
      hrStats: JSON.stringify({ total:56,active:52,trial:3,leave:1,avgAge:28.5,avgTenure:'2.1年',turnoverRate:5.2,newHires:8 }),
      sales: JSON.stringify({ thisMonth:{revenue:9456000,target:12000000,rate:78.8,deals:18,avgDeal:525333},pipeline:{leads:45,qualified:28,proposal:15,negotiation:8,closed:5},funnelRates:{lead2qual:62,qual2prop:54,prop2neg:53,neg2close:63},monthlyRevenue:{labels:['1月','2月','3月','4月','5月','6月','7月'],data:[680,720,790,850,910,920,945]},productRevenue:{labels:['ERP系统','CRM系统','数据平台','运维服务','定制开发'],data:[320,280,190,150,105]},territory:[{region:'高新区',revenue:320,deals:6,rate:85},{region:'天府新区',revenue:189,deals:3,rate:78},{region:'武侯区',revenue:145,deals:4,rate:72},{region:'金牛区',revenue:256,deals:2,rate:90},{region:'其他区域',revenue:135,deals:3,rate:65}],topPerformers:[{name:'李明远',avatar:'李',color:'#2563eb',revenue:320,deals:4,targetRate:85},{name:'刘子轩',avatar:'刘',color:'#ef4444',revenue:256,deals:2,targetRate:90},{name:'张浩然',avatar:'张',color:'#10b981',revenue:145,deals:3,targetRate:72},{name:'王思琪',avatar:'王',color:'#8b5cf6',revenue:98,deals:2,targetRate:65},{name:'孙博文',avatar:'孙',color:'#f59e0b',revenue:85,deals:3,targetRate:58}] }),
      finance: JSON.stringify({ thisMonth:{revenue:945.6,expense:312.5,profit:633.1,profitMargin:67,budget:500,budgetRate:62.5},receivable:[{customer:'成都锦程信息科技有限公司',amount:42,dueDate:'2026-07-15',overdue:5,status:'逾期'},{customer:'四川鼎盛建设集团',amount:128,dueDate:'2026-08-01',overdue:0,status:'正常'},{customer:'四川天府数字科技有限公司',amount:95,dueDate:'2026-09-01',overdue:0,status:'正常'},{customer:'成都汇通商贸有限公司',amount:22,dueDate:'2026-07-10',overdue:10,status:'逾期'},{customer:'四川智联物流有限公司',amount:18,dueDate:'2026-08-15',overdue:0,status:'未到期'}],payable:[{vendor:'联想（北京）有限公司',amount:9.6,dueDate:'2026-07-30',status:'未到期'},{vendor:'华为技术有限公司',amount:8.5,dueDate:'2026-08-15',status:'未到期'},{vendor:'电信运营商',amount:2.8,dueDate:'2026-07-25',status:'即将到期'}],expenseBreakdown:{labels:['人员薪酬','办公租金','差旅费用','采购支出','营销费用','其他'],data:[180,45,38,25,18,6.5]} }),
      permMatrix: JSON.stringify({ modules:['外勤打卡','工作汇报','假期申请','费用报销','合同审批','采购管理','项目管理','出差申请','客户管理','销售统计','人事管理','部门管理','权限管理','财务管理','系统设置'],roles:['超级管理员','部门经理','区域经理','普通员工','财务专员','人事专员'],data:[[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,0.5,0.5,0,0.5,0,0],[1,1,1,1,0.5,0,1,1,1,1,0,0,0,0,0],[1,1,1,1,0,0,0.5,1,0.5,0,0,0,0,0,0],[0,0.5,0,1,0.5,0.5,0.5,0,0,0.5,0,0,0,1,0],[0,0.5,0.5,0.5,0,0,0.5,0.5,0,0,1,0.5,0,0.5,0]],permLevels:{'1':{label:'完全权限',desc:'可查看、编辑、删除、审批',color:'#10b981',icon:'fa-check'},'0.5':{label:'部分权限',desc:'仅可查看或部分编辑',color:'#f59e0b',icon:'fa-adjust'},'0':{label:'无权限',desc:'不可访问该模块',color:'#94a3b8',icon:'fa-minus'}},dataScope:[{level:'最高级',scope:'全公司',desc:'可查看和操作所有部门、区域、个人的数据',roles:['超级管理员']},{level:'管理层',scope:'本部门/本区域',desc:'可查看和操作所管辖范围内的数据',roles:['部门经理','区域经理']},{level:'专业层',scope:'专业领域',desc:'可查看和操作本专业领域内的数据（财务/人事）',roles:['财务专员','人事专员']},{level:'执行层',scope:'本人',desc:'仅可查看和操作个人产生的数据',roles:['普通员工']}] }),
      weekCheckinData: JSON.stringify({ labels:['周一','周二','周三','周四','周五','周六','周日'],data:[48,52,50,49,42,8,3] }),
      monthReportData: JSON.stringify({ labels:['第1周','第2周','第3周','第4周'],daily:[38,42,40,45],weekly:[8,9,7,10] }),
      deptPerformance: JSON.stringify({ labels:['销售一部','销售二部','销售三部','市场部'],data:[320,280,195,150] }),
      activities: JSON.stringify([{time:'14:30',user:'李明远',action:'完成了外勤打卡',loc:'金牛区万达广场',type:'checkin'},{time:'14:15',user:'刘子轩',action:'提交了日报',type:'report'},{time:'13:50',user:'孙博文',action:'新增客户「成都易达电子商务」',type:'customer'},{time:'12:00',user:'张浩然',action:'完成了外勤打卡',loc:'武侯区来福士广场',type:'checkin'},{time:'10:30',user:'王思琪',action:'审批通过了刘子轩的日报',type:'approve'},{time:'10:15',user:'李明远',action:'完成了外勤打卡',loc:'锦江区IFS',type:'checkin'},{time:'09:30',user:'张浩然',action:'完成了外勤打卡',loc:'武侯区来福士广场',type:'checkin'},{time:'08:52',user:'李明远',action:'完成上班签到',loc:'天府软件园D区',type:'checkin'}]),
      // 以下为原 supplement-kv.js 补充的键（修复 /api/customerLevels 等 6 个接口 500）
      customerLevels: JSON.stringify([{level:'S',name:'战略客户',color:'#8b5cf6',criteria:'年营收≥¥200万 / 长期战略合作合同',maxVisitInterval:7,privilege:'总经理定期拜访 / 优先资源分配 / 专属客服经理'},{level:'A',name:'核心客户',color:'#ef4444',criteria:'年营收¥50~200万 / 稳定合作1年以上',maxVisitInterval:14,privilege:'销售总监季度拜访 / 优先售后响应 / 年度客户答谢'},{level:'B',name:'重要客户',color:'#f59e0b',criteria:'年营收¥10~50万 / 有持续合作潜力',maxVisitInterval:30,privilege:'区域经理月度拜访 / 标准售后服务'},{level:'C',name:'一般客户',color:'#10b981',criteria:'年营收<¥10万 / 初期合作阶段',maxVisitInterval:60,privilege:'销售员定期回访 / 基础售后服务'},{level:'D',name:'待开发客户',color:'#94a3b8',criteria:'无营收 / 潜客探索阶段',maxVisitInterval:90,privilege:'销售员跟进 / 商机评估'}]),
      customerLifecycle: JSON.stringify([{stage:'潜客',icon:'search',color:'#94a3b8',desc:'线索发现，初步接触'},{stage:'初访',icon:'phone',color:'#06b6d4',desc:'首次拜访/电话沟通'},{stage:'跟进',icon:'handshake-o',color:'#f59e0b',desc:'持续跟进，需求挖掘'},{stage:'谈判',icon:'gavel',color:'#8b5cf6',desc:'商务谈判，方案提交'},{stage:'签约',icon:'file-text',color:'#10b981',desc:'合同签署，正式合作'},{stage:'续约',icon:'refresh',color:'#2563eb',desc:'合同续签，深化合作'},{stage:'流失',icon:'remove',color:'#ef4444',desc:'合作终止，需挽回'}]),
      checkinRecords: JSON.stringify([{id:1,user:'李明远',avatar:'李',color:'#2563eb',type:'签到',time:'08:52',loc:'成都市高新区天府软件园D区7栋',customer:'-',remark:'到达公司',photo:true},{id:2,user:'李明远',avatar:'李',color:'#2563eb',type:'外勤签到',time:'10:15',loc:'成都市锦江区春熙路IFS国际金融中心',customer:'成都锦程信息科技有限公司',remark:'拜访客户',photo:true},{id:3,user:'张浩然',avatar:'张',color:'#10b981',type:'外勤签到',time:'09:30',loc:'成都市武侯区来福士广场',customer:'四川智联物流有限公司',remark:'产品演示',photo:true},{id:4,user:'王思琪',avatar:'王',color:'#8b5cf6',type:'签到',time:'08:45',loc:'成都市高新区天府软件园D区7栋',customer:'-',remark:'正常到岗',photo:true},{id:5,user:'刘子轩',avatar:'刘',color:'#ef4444',type:'外勤签到',time:'14:20',loc:'成都市青羊区万达广场',customer:'成都汇通商贸有限公司',remark:'合同续签洽谈',photo:true},{id:6,user:'李明远',avatar:'李',color:'#2563eb',type:'外勤签到',time:'14:30',loc:'成都市金牛区万达广场写字楼',customer:'四川鼎盛建设集团',remark:'跟进项目进度',photo:true},{id:7,user:'孙博文',avatar:'孙',color:'#8b5cf6',type:'外勤签到',time:'15:00',loc:'成都市成华区万象城',customer:'成都易达电子商务有限公司',remark:'新客户首次拜访',photo:true}]),
      teamMembers: JSON.stringify([{id:'ZM001',name:'李明远',dept:'销售部',role:'区域经理',avatar:'李',color:'#2563eb',phone:'138****8888',checkinStatus:'signed_in',todayReports:1,weekCheckins:5,status:'在线'},{id:'ZM002',name:'王思琪',dept:'销售部',role:'高级销售',avatar:'王',color:'#8b5cf6',phone:'139****6666',checkinStatus:'signed_in',todayReports:0,weekCheckins:4,status:'在线'},{id:'ZM003',name:'张浩然',dept:'销售部',role:'销售代表',avatar:'张',color:'#10b981',phone:'137****5555',checkinStatus:'signed_in',todayReports:1,weekCheckins:5,status:'外勤中'},{id:'ZM004',name:'陈雨桐',dept:'销售部',role:'销售代表',avatar:'陈',color:'#f59e0b',phone:'136****4444',checkinStatus:'unsigned',todayReports:0,weekCheckins:3,status:'离线'},{id:'ZM005',name:'刘子轩',dept:'销售部',role:'销售代表',avatar:'刘',color:'#ef4444',phone:'135****3333',checkinStatus:'signed_in',todayReports:1,weekCheckins:5,status:'在线'},{id:'ZM006',name:'赵晓彤',dept:'市场部',role:'市场专员',avatar:'赵',color:'#06b6d4',phone:'133****2222',checkinStatus:'signed_in',todayReports:0,weekCheckins:5,status:'在线'},{id:'ZM007',name:'孙博文',dept:'销售部',role:'销售代表',avatar:'孙',color:'#8b5cf6',phone:'132****1111',checkinStatus:'signed_in',todayReports:0,weekCheckins:4,status:'外勤中'},{id:'ZM008',name:'周梦瑶',dept:'销售部',role:'销售代表',avatar:'周',color:'#ec4899',phone:'131****0000',checkinStatus:'unsigned',todayReports:0,weekCheckins:2,status:'请假'}]),
      projectStats: JSON.stringify({ total:5,active:3,approval:1,pending:1,avgProgress:53,totalBudget:6960000,totalSpent:3023500 }),
      reportsList: JSON.stringify([{id:1,author:'李明远',avatar:'李',color:'#2563eb',type:'日报',date:'2026-07-20',status:'已提交',completed:'1. 拜访成都锦程信息科技\n2. 完成四川鼎盛建设集团技术方案\n3. 跟进3家意向客户回访',plan:'1. 签订锦程信息年度合作协议\n2. 拜访2家新客户\n3. 整理本周客户拜访数据',issues:'鼎盛建设对技术方案有修改需求',approver:'王总监',approveStatus:'待审批'},{id:2,author:'张浩然',avatar:'张',color:'#10b981',type:'日报',date:'2026-07-20',status:'已提交',completed:'1. 为四川智联物流做产品演示\n2. 确认客户核心需求',plan:'1. 根据客户需求定制方案报价\n2. 跟进智联物流决策流程',issues:'客户预算有限',approver:'李明远',approveStatus:'已审批'},{id:3,author:'刘子轩',avatar:'刘',color:'#ef4444',type:'日报',date:'2026-07-19',status:'已提交',completed:'1. 拜访成都汇通商贸\n2. 完成上月销售数据汇总',plan:'1. 推进汇通商贸续签流程\n2. 拜访3家金牛区客户',issues:'汇通商贸希望降低续签价格',approver:'李明远',approveStatus:'待审批'},{id:4,author:'李明远',avatar:'李',color:'#2563eb',type:'周报',date:'2026-07-19',status:'已提交',completed:'本周共拜访客户12家，新签合同3份',plan:'下周计划拜访客户15家',issues:'技术部方案交付周期较长',approver:'王总监',approveStatus:'待审批'},{id:5,author:'王思琪',avatar:'王',color:'#8b5cf6',type:'日报',date:'2026-07-19',status:'已提交',completed:'1. 完成高新区3家企业电话拜访\n2. 整理客户资料库',plan:'1. 上门拜访2家意向客户\n2. 参加产品培训',issues:'无',approver:'李明远',approveStatus:'已审批'}]),
      // 出差数据：KV 副本（allData 中由 business_trips 表数据覆盖，这里仅作兼容）
      businessTrips: JSON.stringify([]),
      tripStats: JSON.stringify({ totalTrips:0,pending:0,completed:0,rejected:0,thisMonthTrips:0,avgDays:0,totalBudget:0,totalActual:0 }),
    };
    Object.entries(kvData).forEach(([k, v]) => insKV.run(k, v));

    // --- 打卡记录（今日 ZM001 签到） ---
    db.prepare(`INSERT INTO checkins (user_id,user_name,check_in_time,check_in_loc,status,date) VALUES (?,?,?,?,?,?)`)
      .run('ZM001', '李明远', '08:52', '成都市高新区天府软件园D区', 'signed_in', today);
  },
};
