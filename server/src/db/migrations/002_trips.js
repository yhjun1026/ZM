/* 002_trips - 出差申请/系统设置/通知表 + 种子数据
 * 等价于原 db-migrate.js
 */
module.exports = {
  id: '002_trips',

  up(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS business_trips (
    id TEXT PRIMARY KEY,
    applicant TEXT NOT NULL,
    from_city TEXT,
    to_city TEXT,
    start_date TEXT,
    end_date TEXT,
    days REAL,
    purpose TEXT,
    budget_transport REAL DEFAULT 0,
    budget_hotel REAL DEFAULT 0,
    budget_meal REAL DEFAULT 0,
    budget_other REAL DEFAULT 0,
    budget_total REAL DEFAULT 0,
    actual_spent REAL,
    status TEXT DEFAULT '待审批',
    approver TEXT,
    flow TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    category TEXT DEFAULT 'general',
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    title TEXT,
    content TEXT,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    link TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);
  },

  seed(db) {
    // --- 出差种子（表为空时插入） ---
    const tripCount = db.prepare('SELECT COUNT(*) as c FROM business_trips').get().c;
    if (tripCount === 0) {
      const insTrip = db.prepare(`INSERT INTO business_trips (id,applicant,from_city,to_city,start_date,end_date,days,purpose,budget_transport,budget_hotel,budget_meal,budget_other,budget_total,actual_spent,status,approver,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      [
        ['BT-2026-018','李明远','成都','绵阳','2026-07-25','2026-07-27',3,'拜访绵阳3家制造业客户，推进ERP系统推广',800,900,450,200,2350,null,'待审批','林伟杰','[{"step":"提交申请","user":"李明远","time":"2026-07-20","done":true},{"step":"部门审批","user":"林伟杰","time":"-","done":false},{"step":"总经理审批","user":"赵总","time":"-","done":false},{"step":"出行","user":"-","time":"-","done":false}]'],
        ['BT-2026-017','张浩然','成都','德阳','2026-07-22','2026-07-23',2,'跟进德阳地区客户需求，产品演示',500,600,300,100,1500,null,'待审批','李明远','[{"step":"提交申请","user":"张浩然","time":"2026-07-19","done":true},{"step":"部门审批","user":"李明远","time":"-","done":false},{"step":"总经理审批","user":"赵总","time":"-","done":false},{"step":"出行","user":"-","time":"-","done":false}]'],
        ['BT-2026-015','刘子轩','成都','重庆','2026-07-18','2026-07-20',3,'拓展重庆区域市场，拜访5家意向客户',1200,1200,600,300,3300,2950,'已完成','林伟杰','[{"step":"提交申请","user":"刘子轩","time":"2026-07-15","done":true},{"step":"部门审批","user":"李明远","time":"2026-07-16","done":true},{"step":"总经理审批","user":"赵总","time":"2026-07-17","done":true},{"step":"出行","user":"刘子轩","time":"2026-07-18","done":true}]'],
        ['BT-2026-013','吴海涛','成都','北京','2026-07-10','2026-07-12',3,'参加全国软件技术大会，学习前沿技术方案',2500,1800,500,300,5100,4800,'已完成','赵总','[{"step":"提交申请","user":"吴海涛","time":"2026-07-08","done":true},{"step":"部门审批","user":"赵总","time":"2026-07-09","done":true},{"step":"总经理审批","user":"赵总","time":"2026-07-09","done":true},{"step":"出行","user":"吴海涛","time":"2026-07-10","done":true}]'],
        ['BT-2026-011','王思琪','成都','南充','2026-07-05','2026-07-06',2,'南充区域客户回访，续签洽谈',600,500,200,100,1400,1350,'已完成','李明远','[{"step":"提交申请","user":"王思琪","time":"2026-07-03","done":true},{"step":"部门审批","user":"李明远","time":"2026-07-04","done":true},{"step":"总经理审批","user":"赵总","time":"2026-07-04","done":true},{"step":"出行","user":"王思琪","time":"2026-07-05","done":true}]'],
        ['BT-2026-016','陈雨桐','成都','宜宾','2026-07-28','2026-07-29',2,'宜宾白酒行业客户调研',500,400,200,100,1200,null,'已驳回','李明远','[{"step":"提交申请","user":"陈雨桐","time":"2026-07-20","done":true},{"step":"部门审批","user":"李明远","time":"2026-07-20","done":true,"remark":"试用期员工暂不安排长途出差"},{"step":"总经理审批","user":"-","time":"-","done":false},{"step":"出行","user":"-","time":"-","done":false}]'],
      ].forEach((t) => insTrip.run(...t));
    }

    // --- 系统设置种子（表为空时插入） ---
    const settingCount = db.prepare('SELECT COUNT(*) as c FROM system_settings').get().c;
    if (settingCount === 0) {
      const insSetting = db.prepare('INSERT INTO system_settings (key,value,category) VALUES (?,?,?)');
      [
        ['company_name', '四川卓盟科技有限公司', 'company'],
        ['company_address', '成都市高新区天府软件园D区7栋', 'company'],
        ['company_phone', '028-88888888', 'company'],
        ['checkin_radius', '500', 'attendance'],
        ['work_start_time', '09:00', 'attendance'],
        ['work_end_time', '18:00', 'attendance'],
        ['checkin_photo_required', 'true', 'attendance'],
        ['checkin_gps_required', 'true', 'attendance'],
        ['checkin_customer_required', 'true', 'attendance'],
        ['expense_monthly_budget', '5000', 'finance'],
        ['leave_annual_max', '8', 'hr'],
        ['leave_sick_max', '3', 'hr'],
        ['leave_personal_max', '2', 'hr'],
        ['system_version', 'V1.2', 'system'],
        ['system_maintainer', '技术部', 'system'],
      ].forEach((s) => insSetting.run(...s));
    }

    // --- 通知种子（表为空时插入） ---
    const notifCount = db.prepare('SELECT COUNT(*) as c FROM notifications').get().c;
    if (notifCount === 0) {
      const insNotif = db.prepare('INSERT INTO notifications (user_id,title,content,type,is_read,link) VALUES (?,?,?,?,?,?)');
      [
        ['ZM001','假期审批提醒','李明远提交的年假申请待审批','approval',0,'leave'],
        ['ZM001','报销审批提醒','李明远提交的交通费报销380元待审批','approval',0,'expense'],
        ['ZM001','合同审批提醒','CT-2026-052合同待审批','approval',0,'contract'],
        ['ZM001','出差审批提醒','BT-2026-018出差申请待审批','approval',0,'businesstrip'],
        ['ZM001','项目里程碑','PJ-2026-001开发阶段一期交付节点待审批','project',0,'project'],
      ].forEach((n) => insNotif.run(...n));
    }
  },
};
