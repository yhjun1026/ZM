/* ============================================
 * 卓盟智办公 V3.0 - 应用核心逻辑
 * 四川卓盟科技有限公司
 * 包含18个功能模块
 * ============================================ */

/* ===== 模拟数据 ===== */
const mockData = {
    currentUser: {
        id: 'ZM001', name: '李明远', avatar: '李', avatarColor: '#2563eb',
        dept: '销售部', role: '区域经理', phone: '138****8888',
        leaveBalance: { annual: 5, sick: 3, personal: 2, totalUsed: 3 }
    },
    todayCheckin: { checkInTime: '08:52', checkInLoc: '成都市高新区天府软件园D区', checkOutTime: null, status: 'signed_in' },
    stats: { todayCheckin: 42, totalStaff: 56, pendingReports: 3, todayVisits: 18, weekCheckinRate: 94, monthReportRate: 87, newCustomers: 12, pendingApprovals: 5 },
    // --- 驾驶舱数据 ---
    cockpit: {
        revenue: 945.6, revenueTarget: 1200, revenueRate: 78.8,
        expense: 312.5, profit: 633.1, profitRate: 67,
        headcount: 56, headcountTarget: 60, customerTotal: 127,
        activeContracts: 38, pendingContracts: 2, overdueAR: 48.5,
        alerts: [
            { type: 'danger', msg: '应收账款逾期 ¥48.5万，涉及5家客户，请尽快催收', icon: 'exclamation-triangle' },
            { type: 'warning', msg: '本月预算执行率已达72%，请控制支出节奏', icon: 'exclamation-circle' },
            { type: 'success', msg: '新增A级客户3家，客户满意度评分上升至4.6', icon: 'check-circle' },
            { type: 'info', msg: '2份合同待审批，3份假期申请待处理', icon: 'info-circle' },
        ],
        revenueTrend: { labels: ['1月','2月','3月','4月','5月','6月','7月'], data: [680,720,790,850,910,920,945] },
        expenseTrend: { labels: ['1月','2月','3月','4月','5月','6月','7月'], data: [220,245,268,280,295,305,312] },
    },
    // --- 假期数据 ---
    leaveTypes: [
        { type: '年假', icon: 'suitcase', color: '#2563eb', balance: 5, used: 3, total: 8 },
        { type: '病假', icon: 'hospital-o', color: '#ef4444', balance: 3, used: 0, total: 3 },
        { type: '事假', icon: 'calendar-times-o', color: '#f59e0b', balance: 2, used: 0, total: 2 },
        { type: '调休', icon: 'exchange', color: '#8b5cf6', balance: 1, used: 1, total: 2 },
        { type: '婚假', icon: 'heart', color: '#ec4899', balance: 10, used: 0, total: 10 },
        { type: '产假', icon: 'baby', color: '#06b6d4', balance: 158, used: 0, total: 158 },
    ],
    leaveRecords: [
        { id: 1, applicant: '李明远', type: '年假', startDate: '2026-07-25', endDate: '2026-07-26', days: 2, reason: '个人事务', status: '待审批', approver: '王总监' },
        { id: 2, applicant: '周梦瑶', type: '事假', startDate: '2026-07-20', endDate: '2026-07-21', days: 1, reason: '家庭原因', status: '已通过', approver: '李明远' },
        { id: 3, applicant: '陈雨桐', type: '病假', startDate: '2026-07-18', endDate: '2026-07-19', days: 1, reason: '身体不适需休息', status: '已通过', approver: '李明远' },
        { id: 4, applicant: '张浩然', type: '年假', startDate: '2026-08-01', endDate: '2026-08-03', days: 3, reason: '暑期休假', status: '待审批', approver: '李明远' },
        { id: 5, applicant: '王思琪', type: '调休', startDate: '2026-07-22', endDate: '2026-07-22', days: 1, reason: '上周加班调休', status: '已通过', approver: '李明远' },
    ],
    // --- 费用报销 ---
    expenseCategories: ['交通费','餐饮费','住宿费','办公用品','通讯费','差旅费','招待费','其他'],
    expenseRecords: [
        { id: 1, applicant: '李明远', category: '交通费', amount: 380, date: '2026-07-20', desc: '拜访客户打车费用', status: '待审批', receipts: 3 },
        { id: 2, applicant: '张浩然', category: '餐饮费', amount: 256, date: '2026-07-20', desc: '客户招待午餐', status: '待审批', receipts: 1 },
        { id: 3, applicant: '刘子轩', category: '差旅费', amount: 1850, date: '2026-07-19', desc: '出差成都-绵阳交通住宿', status: '已通过', receipts: 5 },
        { id: 4, applicant: '王思琪', category: '办公用品', amount: 128, date: '2026-07-18', desc: '打印纸和办公耗材', status: '已通过', receipts: 2 },
        { id: 5, applicant: '李明远', category: '通讯费', amount: 200, date: '2026-07-17', desc: '手机话费报销', status: '已通过', receipts: 1 },
        { id: 6, applicant: '孙博文', category: '交通费', amount: 120, date: '2026-07-16', desc: '客户拜访地铁公交', status: '已驳回', receipts: 2 },
    ],
    expenseStats: { totalSubmitted: 4320, totalApproved: 2178, pending: 636, rejected: 120, monthBudget: 5000, usedRate: 43.6 },
    // --- 合同审批 ---
    contracts: [
        { id: 'CT-2026-038', name: '成都锦程信息科技年度合作协议', customer: '成都锦程信息科技有限公司', type: '销售合同', amount: 1280000, startDate: '2026-01-15', endDate: '2026-12-31', status: '执行中', progress: 65, creator: '李明远', approver: '王总监', signDate: '2026-01-12',
          flow: [{step:'提交',user:'李明远',time:'2026-01-08',done:true},{step:'部门审批',user:'王总监',time:'2026-01-10',done:true},{step:'财务审核',user:'财务部张经理',time:'2026-01-11',done:true},{step:'总经理签字',user:'赵总',time:'2026-01-12',done:true}] },
        { id: 'CT-2026-045', name: '四川鼎盛建设集团技术方案合同', customer: '四川鼎盛建设集团', type: '服务合同', amount: 2560000, startDate: '2026-03-01', endDate: '2027-02-28', status: '执行中', progress: 40, creator: '李明远', approver: '王总监', signDate: '2026-02-28',
          flow: [{step:'提交',user:'李明远',time:'2026-02-25',done:true},{step:'部门审批',user:'王总监',time:'2026-02-27',done:true},{step:'财务审核',user:'财务部张经理',time:'2026-02-28 10:00',done:true},{step:'总经理签字',user:'赵总',time:'2026-02-28 14:00',done:true}] },
        { id: 'CT-2026-052', name: '四川智联物流仓储管理合同', customer: '四川智联物流有限公司', type: '销售合同', amount: 450000, startDate: '2026-08-01', endDate: '2027-07-31', status: '待审批', progress: 0, creator: '张浩然', approver: '李明远',
          flow: [{step:'提交',user:'张浩然',time:'2026-07-18',done:true},{step:'部门审批',user:'李明远',time:'—',done:false},{step:'财务审核',user:'财务部张经理',time:'—',done:false},{step:'总经理签字',user:'赵总',time:'—',done:false}] },
        { id: 'CT-2026-053', name: '成都汇通商贸续签合同', customer: '成都汇通商贸有限公司', type: '续签合同', amount: 450000, startDate: '2026-09-01', endDate: '2027-08-31', status: '待审批', progress: 0, creator: '刘子轩', approver: '李明远',
          flow: [{step:'提交',user:'刘子轩',time:'2026-07-20',done:true},{step:'部门审批',user:'李明远',time:'—',done:false},{step:'财务审核',user:'财务部张经理',time:'—',done:false},{step:'总经理签字',user:'赵总',time:'—',done:false}] },
        { id: 'CT-2026-041', name: '办公设备采购合同', customer: '联想（北京）有限公司', type: '采购合同', amount: 168000, startDate: '2026-06-01', endDate: '2026-06-30', status: '已完成', progress: 100, creator: '行政部', approver: '王总监', signDate: '2026-05-28',
          flow: [{step:'提交',user:'行政部',time:'2026-05-25',done:true},{step:'部门审批',user:'王总监',time:'2026-05-27',done:true},{step:'财务审核',user:'财务部张经理',time:'2026-05-28',done:true},{step:'总经理签字',user:'赵总',time:'2026-05-28',done:true}] },
        { id: 'CT-2026-048', name: '天府数字科技运维服务合同', customer: '四川天府数字科技有限公司', type: '服务合同', amount: 1890000, startDate: '2026-04-01', endDate: '2027-03-31', status: '执行中', progress: 55, creator: '李明远', approver: '王总监', signDate: '2026-03-28',
          flow: [{step:'提交',user:'李明远',time:'2026-03-25',done:true},{step:'部门审批',user:'王总监',time:'2026-03-27',done:true},{step:'财务审核',user:'财务部张经理',time:'2026-03-28',done:true},{step:'总经理签字',user:'赵总',time:'2026-03-28',done:true}] },
    ],
    // --- 采购管理 ---
    purchases: [
        { id: 'PO-2026-028', title: '笔记本电脑采购（销售部）', category: '电子设备', amount: 96000, qty: 12, unit: '台', status: '已入库', applicant: '行政部', date: '2026-06-15', vendor: '联想（北京）有限公司', flow: [{step:'申请',done:true},{step:'审批',done:true},{step:'采购',done:true},{step:'入库',done:true}] },
        { id: 'PO-2026-032', title: '打印纸及办公耗材', category: '办公用品', amount: 3200, qty: 200, unit: '箱', status: '采购中', applicant: '王思琪', date: '2026-07-10', vendor: '成都纸业供应商', flow: [{step:'申请',done:true},{step:'审批',done:true},{step:'采购',done:false},{step:'入库',done:false}] },
        { id: 'PO-2026-033', title: '服务器扩容采购', category: 'IT设备', amount: 85000, qty: 2, unit: '台', status: '待审批', applicant: '技术部', date: '2026-07-18', vendor: '华为技术有限公司', flow: [{step:'申请',done:true},{step:'审批',done:false},{step:'采购',done:false},{step:'入库',done:false}] },
        { id: 'PO-2026-034', title: '客户礼品采购', category: '商务礼品', amount: 15000, qty: 50, unit: '份', status: '待审批', applicant: '李明远', date: '2026-07-20', vendor: '—', flow: [{step:'申请',done:true},{step:'审批',done:false},{step:'采购',done:false},{step:'入库',done:false}] },
    ],
    // --- 销售统计 ---
    sales: {
        thisMonth: { revenue: 9456000, target: 12000000, rate: 78.8, deals: 18, avgDeal: 525333 },
        pipeline: { leads: 45, qualified: 28, proposal: 15, negotiation: 8, closed: 5 },
        funnelRates: { lead2qual: 62, qual2prop: 54, prop2neg: 53, neg2close: 63 },
        monthlyRevenue: { labels: ['1月','2月','3月','4月','5月','6月','7月'], data: [680,720,790,850,910,920,945] },
        productRevenue: { labels: ['ERP系统','CRM系统','数据平台','运维服务','定制开发'], data: [320,280,190,150,105] },
        territory: [
            { region: '高新区', revenue: 320, deals: 6, rate: 85 },
            { region: '天府新区', revenue: 189, deals: 3, rate: 78 },
            { region: '武侯区', revenue: 145, deals: 4, rate: 72 },
            { region: '金牛区', revenue: 256, deals: 2, rate: 90 },
            { region: '其他区域', revenue: 135, deals: 3, rate: 65 },
        ],
        topPerformers: [
            { name: '李明远', avatar: '李', color: '#2563eb', revenue: 320, deals: 4, targetRate: 85 },
            { name: '刘子轩', avatar: '刘', color: '#ef4444', revenue: 256, deals: 2, targetRate: 90 },
            { name: '张浩然', avatar: '张', color: '#10b981', revenue: 145, deals: 3, targetRate: 72 },
            { name: '王思琪', avatar: '王', color: '#8b5cf6', revenue: 98, deals: 2, targetRate: 65 },
            { name: '孙博文', avatar: '孙', color: '#f59e0b', revenue: 85, deals: 3, targetRate: 58 },
        ],
    },
    // --- 人事管理 ---
    hrEmployees: [
        { id: 'ZM001', name: '李明远', dept: '销售部', role: '区域经理', status: '在职', joinDate: '2024-03-15', salary: '—', level: 'P6', phone: '138****8888', education: '本科', age: 32 },
        { id: 'ZM002', name: '王思琪', dept: '销售部', role: '高级销售', status: '在职', joinDate: '2025-06-01', salary: '—', level: 'P4', phone: '139****6666', education: '本科', age: 26 },
        { id: 'ZM003', name: '张浩然', dept: '销售部', role: '销售代表', status: '在职', joinDate: '2025-09-10', salary: '—', level: 'P3', phone: '137****5555', education: '大专', age: 24 },
        { id: 'ZM004', name: '陈雨桐', dept: '销售部', role: '销售代表', status: '试用期', joinDate: '2026-06-01', salary: '—', level: 'P2', phone: '136****4444', education: '本科', age: 23 },
        { id: 'ZM005', name: '刘子轩', dept: '销售部', role: '销售代表', status: '在职', joinDate: '2024-08-20', salary: '—', level: 'P4', phone: '135****3333', education: '本科', age: 28 },
        { id: 'ZM006', name: '赵晓彤', dept: '市场部', role: '市场专员', status: '在职', joinDate: '2025-01-15', salary: '—', level: 'P3', phone: '133****2222', education: '本科', age: 25 },
        { id: 'ZM007', name: '孙博文', dept: '销售部', role: '销售代表', status: '在职', joinDate: '2025-11-01', salary: '—', level: 'P3', phone: '132****1111', education: '本科', age: 27 },
        { id: 'ZM008', name: '周梦瑶', dept: '销售部', role: '销售代表', status: '请假', joinDate: '2024-12-01', salary: '—', level: 'P3', phone: '131****0000', education: '本科', age: 25 },
        { id: 'ZM009', name: '吴海涛', dept: '技术部', role: '技术总监', status: '在职', joinDate: '2023-01-10', salary: '—', level: 'P7', phone: '130****9999', education: '硕士', age: 35 },
        { id: 'ZM010', name: '郑雅琳', dept: '财务部', role: '财务经理', status: '在职', joinDate: '2023-06-15', salary: '—', level: 'P5', phone: '129****8888', education: '本科', age: 30 },
        { id: 'ZM011', name: '马小丽', dept: '行政部', role: '行政主管', status: '在职', joinDate: '2024-02-01', salary: '—', level: 'P4', phone: '128****7777', education: '本科', age: 28 },
        { id: 'ZM012', name: '林伟杰', dept: '销售部', role: '销售总监', status: '在职', joinDate: '2022-08-01', salary: '—', level: 'P8', phone: '127****6666', education: '硕士', age: 38 },
    ],
    hrStats: { total: 56, active: 52, trial: 3, leave: 1, avgAge: 28.5, avgTenure: '2.1年', turnoverRate: 5.2, newHires: 8 },
    // --- 部门管理 ---
    departments: [
        { id: 1, name: '总经理办公室', head: '赵总', count: 3, color: '#1e293b', icon: 'building', children: [] },
        { id: 2, name: '销售部', head: '林伟杰', count: 25, color: '#2563eb', icon: 'shopping-cart', children: [
            { id: 21, name: '销售一部', head: '李明远', count: 8, color: '#2563eb' },
            { id: 22, name: '销售二部', head: '王思琪', count: 7, color: '#3b82f6' },
            { id: 23, name: '销售三部', head: '赵晓彤', count: 10, color: '#60a5fa' },
        ]},
        { id: 3, name: '市场部', head: '陈总监', count: 8, color: '#8b5cf6', icon: 'bullhorn', children: [] },
        { id: 4, name: '技术部', head: '吴海涛', count: 12, color: '#10b981', icon: 'code', children: [] },
        { id: 5, name: '财务部', head: '郑雅琳', count: 5, color: '#f59e0b', icon: 'cny', children: [] },
        { id: 6, name: '行政部', head: '马小丽', count: 3, color: '#06b6d4', icon: 'paperclip', children: [] },
    ],
    // --- 权限管理 ---
    roles: [
        { id: 1, name: '超级管理员', desc: '拥有所有系统权限', color: '#1e293b', users: 1 },
        { id: 2, name: '部门经理', desc: '管理本部门所有事务', color: '#2563eb', users: 4 },
        { id: 3, name: '区域经理', desc: '管理本区域销售业务', color: '#8b5cf6', users: 3 },
        { id: 4, name: '普通员工', desc: '基础办公功能权限', color: '#10b981', users: 42 },
        { id: 5, name: '财务专员', desc: '财务相关功能权限', color: '#f59e0b', users: 5 },
        { id: 6, name: '人事专员', desc: '人事管理功能权限', color: '#06b6d4', users: 2 },
    ],
    permMatrix: {
        modules: ['外勤打卡','工作汇报','假期申请','费用报销','合同审批','采购管理','项目管理','出差申请','客户管理','销售统计','人事管理','部门管理','权限管理','财务管理','系统设置'],
        roles: ['超级管理员','部门经理','区域经理','普通员工','财务专员','人事专员'],
        data: [
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,0.5,0.5,0,0.5,0,0],
            [1,1,1,1,0.5,0,1,1,1,1,0,0,0,0,0],
            [1,1,1,1,0,0,0.5,1,0.5,0,0,0,0,0,0],
            [0,0.5,0,1,0.5,0.5,0.5,0,0,0.5,0,0,0,1,0],
            [0,0.5,0.5,0.5,0,0,0.5,0.5,0,0,1,0.5,0,0.5,0],
        ],
        permLevels: {
            1: { label: '完全权限', desc: '可查看、编辑、删除、审批', color: '#10b981', icon: 'fa-check' },
            0.5: { label: '部分权限', desc: '仅可查看或部分编辑', color: '#f59e0b', icon: 'fa-adjust' },
            0: { label: '无权限', desc: '不可访问该模块', color: '#94a3b8', icon: 'fa-minus' }
        },
        roleDetails: [
            { id: 1, name: '超级管理员', desc: '拥有所有系统权限', color: '#1e293b', users: 1, level: '最高级',
              scope: '全公司', scopeDesc: '可查看所有部门数据',
              canCreate: true, canEdit: true, canDelete: true, canApprove: true,
              duties: ['系统配置与维护','用户权限分配','全公司数据审计','安全策略制定','紧急事项审批'] },
            { id: 2, name: '部门经理', desc: '管理本部门所有事务', color: '#2563eb', users: 4, level: '管理层',
              scope: '本部门', scopeDesc: '仅可查看本部门及下属数据',
              canCreate: true, canEdit: true, canDelete: false, canApprove: true,
              duties: ['部门日常管理','员工考勤审批','费用报销审批','合同审批','部门数据查看'] },
            { id: 3, name: '区域经理', desc: '管理本区域销售业务', color: '#8b5cf6', users: 3, level: '管理层',
              scope: '本区域', scopeDesc: '仅可查看本区域销售数据',
              canCreate: true, canEdit: true, canDelete: false, canApprove: true,
              duties: ['区域销售管理','客户分配跟进','出差审批','销售目标制定','区域业绩分析'] },
            { id: 4, name: '普通员工', desc: '基础办公功能权限', color: '#10b981', users: 42, level: '执行层',
              scope: '本人', scopeDesc: '仅可查看本人数据',
              canCreate: true, canEdit: false, canDelete: false, canApprove: false,
              duties: ['日常打卡签到','工作汇报提交','假期申请提交','费用报销申请','出差申请提交'] },
            { id: 5, name: '财务专员', desc: '财务相关功能权限', color: '#f59e0b', users: 5, level: '专业层',
              scope: '财务数据', scopeDesc: '可查看全公司财务数据',
              canCreate: true, canEdit: true, canDelete: false, canApprove: false,
              duties: ['财务数据录入','费用审核核算','应收应付管理','预算编制执行','财务报表制作'] },
            { id: 6, name: '人事专员', desc: '人事管理功能权限', color: '#06b6d4', users: 2, level: '专业层',
              scope: '人事数据', scopeDesc: '可查看全公司人事数据',
              canCreate: true, canEdit: true, canDelete: false, canApprove: false,
              duties: ['员工档案管理','考勤数据汇总','假期审批初审','培训计划制定','绩效考核辅助'] },
        ],
        permApprovals: [
            { id: 'PA-001', applicant: '陈雨桐', applicantRole: '普通员工', targetRole: '区域经理', targetModules: ['合同审批','客户管理'], reason: '因业务拓展需要，申请客户管理和合同审批权限', status: '待审批', applyDate: '2026-07-20', approver: '李明远', urgency: '普通' },
            { id: 'PA-002', applicant: '马小丽', applicantRole: '人事专员', targetRole: '人事专员(扩展)', targetModules: ['假期申请(审批)'], reason: '因人事主管休假，申请假期审批权限临时授权', status: '待审批', applyDate: '2026-07-19', approver: '林伟杰', urgency: '紧急' },
            { id: 'PA-003', applicant: '赵晓彤', applicantRole: '普通员工', targetRole: '部门经理(临时)', targetModules: ['费用报销(审批)'], reason: '临时负责市场部费用审批，申请一周临时审批权限', status: '已通过', applyDate: '2026-07-15', approver: '林伟杰', approveDate: '2026-07-16', urgency: '紧急', remark: '临时授权，有效期至2026-07-22' },
            { id: 'PA-004', applicant: '张浩然', applicantRole: '普通员工', targetRole: '区域经理', targetModules: ['销售统计','客户管理'], reason: '申请查看销售数据和客户数据用于业务分析', status: '已拒绝', applyDate: '2026-07-10', approver: '李明远', approveDate: '2026-07-11', urgency: '普通', remark: '权限范围过大，建议先申请客户管理部分权限' },
            { id: 'PA-005', applicant: '吴海涛', applicantRole: '部门经理(技术部)', targetRole: '超级管理员(部分)', targetModules: ['系统设置'], reason: '系统配置需求，申请系统设置模块权限', status: '已通过', applyDate: '2026-07-08', approver: '林伟杰', approveDate: '2026-07-09', urgency: '普通', remark: '仅授权系统配置查看权限' },
        ],
        permLogs: [
            { id: 'PL-001', date: '2026-07-20', operator: '林伟杰', target: '陈雨桐', action: '权限申请提交', detail: '申请客户管理+合同审批模块权限', module: '权限管理', beforeRole: '普通员工', afterRole: '普通员工(待审批)' },
            { id: 'PL-002', date: '2026-07-19', operator: '马小丽', target: '马小丽', action: '权限申请提交', detail: '申请假期审批权限临时授权', module: '权限管理', beforeRole: '人事专员', afterRole: '人事专员(待审批)' },
            { id: 'PL-003', date: '2026-07-16', operator: '林伟杰', target: '赵晓彤', action: '权限审批通过', detail: '临时授权费用报销审批权限（有效期至2026-07-22）', module: '费用报销', beforeRole: '普通员工', afterRole: '普通员工+临时审批' },
            { id: 'PL-004', date: '2026-07-15', operator: '赵晓彤', target: '赵晓彤', action: '权限申请提交', detail: '申请市场部费用审批临时权限', module: '权限管理', beforeRole: '普通员工', afterRole: '普通员工(待审批)' },
            { id: 'PL-005', date: '2026-07-11', operator: '李明远', target: '张浩然', action: '权限审批拒绝', detail: '拒绝销售统计+客户管理权限申请，建议先申请部分权限', module: '权限管理', beforeRole: '普通员工', afterRole: '普通员工' },
            { id: 'PL-006', date: '2026-07-09', operator: '林伟杰', target: '吴海涛', action: '权限审批通过', detail: '授权系统配置查看权限（仅查看，不含编辑删除）', module: '系统设置', beforeRole: '部门经理', afterRole: '部门经理+系统查看' },
            { id: 'PL-007', date: '2026-07-01', operator: '林伟杰', target: '全体员工', action: '权限批量调整', detail: '新增项目管理、出差申请模块，所有管理层获得审批权限', module: '系统设置', beforeRole: '—', afterRole: '—' },
            { id: 'PL-008', date: '2026-06-15', operator: '林伟杰', target: '郑雅琳', action: '权限范围调整', detail: '财务专员数据范围从本部门扩展到全公司', module: '财务管理', beforeRole: '财务专员(本部门)', afterRole: '财务专员(全公司)' },
        ],
        dataScope: [
            { level: '最高级', scope: '全公司', desc: '可查看和操作所有部门、区域、个人的数据', roles: ['超级管理员'] },
            { level: '管理层', scope: '本部门/本区域', desc: '可查看和操作所管辖范围内的数据', roles: ['部门经理','区域经理'] },
            { level: '专业层', scope: '专业领域', desc: '可查看和操作本专业领域内的数据（财务/人事）', roles: ['财务专员','人事专员'] },
            { level: '执行层', scope: '本人', desc: '仅可查看和操作个人产生的数据', roles: ['普通员工'] },
        ]
    },
    // --- 财务管理 ---
    finance: {
        thisMonth: { revenue: 945.6, expense: 312.5, profit: 633.1, profitMargin: 67, budget: 500, budgetRate: 62.5 },
        receivable: [
            { customer: '成都锦程信息科技有限公司', amount: 42, dueDate: '2026-07-15', overdue: 5, status: '逾期' },
            { customer: '四川鼎盛建设集团', amount: 128, dueDate: '2026-08-01', overdue: 0, status: '正常' },
            { customer: '四川天府数字科技有限公司', amount: 95, dueDate: '2026-09-01', overdue: 0, status: '正常' },
            { customer: '成都汇通商贸有限公司', amount: 22, dueDate: '2026-07-10', overdue: 10, status: '逾期' },
            { customer: '四川智联物流有限公司', amount: 18, dueDate: '2026-08-15', overdue: 0, status: '未到期' },
        ],
        payable: [
            { vendor: '联想（北京）有限公司', amount: 9.6, dueDate: '2026-07-30', status: '未到期' },
            { vendor: '华为技术有限公司', amount: 8.5, dueDate: '2026-08-15', status: '未到期' },
            { vendor: '电信运营商', amount: 2.8, dueDate: '2026-07-25', status: '即将到期' },
        ],
        expenseBreakdown: { labels: ['人员薪酬','办公租金','差旅费用','采购支出','营销费用','其他'], data: [180,45,38,25,18,6.5] },
    },
    // --- 项目管理 ---
    projects: [
        { id: 'PJ-2026-001', name: '鼎盛建设集团ERP系统开发', customer: '四川鼎盛建设集团', status: '执行中', priority: '高', startDate: '2026-03-01', endDate: '2026-12-31', progress: 45, budget: 2560000, spent: 1152000, manager: '李明远',
          team: [
            { name: '李明远', role: '项目经理', avatar: '李', color: '#2563eb', dept: '销售部' },
            { name: '吴海涛', role: '技术负责人', avatar: '吴', color: '#10b981', dept: '技术部' },
            { name: '陈雨桐', role: '需求分析师', avatar: '陈', color: '#f59e0b', dept: '销售部' },
            { name: '赵晓彤', role: 'UI设计师', avatar: '赵', color: '#06b6d4', dept: '市场部' },
            { name: '技术部3人', role: '开发工程师', avatar: '技', color: '#8b5cf6', dept: '技术部' },
          ],
          milestones: [
            { name: '项目启动', date: '2026-03-01', status: 'done', approver: '林伟杰', approveTime: '2026-03-01' },
            { name: '需求调研完成', date: '2026-04-15', status: 'done', approver: '吴海涛', approveTime: '2026-04-16' },
            { name: '方案设计评审', date: '2026-05-30', status: 'done', approver: '吴海涛', approveTime: '2026-06-01' },
            { name: '开发阶段一期交付', date: '2026-08-15', status: 'current', approver: '待审批', approveTime: '—' },
            { name: '开发阶段二期交付', date: '2026-10-15', status: 'pending', approver: '—', approveTime: '—' },
            { name: '系统测试验收', date: '2026-11-30', status: 'pending', approver: '—', approveTime: '—' },
            { name: '上线部署', date: '2026-12-15', status: 'pending', approver: '—', approveTime: '—' },
            { name: '项目结项', date: '2026-12-31', status: 'pending', approver: '—', approveTime: '—' },
          ],
          audits: [
            { id: 1, date: '2026-04-20', auditor: '吴海涛', type: '需求评审', result: '通过', remark: '需求文档完整，客户确认无误' },
            { id: 2, date: '2026-06-05', auditor: '郑雅琳', type: '预算审计', result: '通过', remark: '预算执行率44.5%，在合理范围内' },
            { id: 3, date: '2026-07-10', auditor: '林伟杰', type: '进度检查', result: '待整改', remark: '一期开发进度略有延迟，需加快节奏' },
          ],
          flow: [{step:'提交立项',user:'李明远',time:'2026-02-25',done:true},{step:'部门审批',user:'林伟杰',time:'2026-02-28',done:true},{step:'财务审核',user:'郑雅琳',time:'2026-03-01',done:true},{step:'总经理批准',user:'赵总',time:'2026-03-01',done:true}],
        },
        { id: 'PJ-2026-002', name: '天府数字科技数据平台搭建', customer: '四川天府数字科技有限公司', status: '执行中', priority: '中', startDate: '2026-04-01', endDate: '2027-03-31', progress: 55, budget: 1890000, spent: 1039500, manager: '张浩然',
          team: [
            { name: '张浩然', role: '项目经理', avatar: '张', color: '#10b981', dept: '销售部' },
            { name: '吴海涛', role: '架构设计', avatar: '吴', color: '#10b981', dept: '技术部' },
            { name: '刘子轩', role: '客户对接', avatar: '刘', color: '#ef4444', dept: '销售部' },
            { name: '技术部4人', role: '开发工程师', avatar: '技', color: '#8b5cf6', dept: '技术部' },
          ],
          milestones: [
            { name: '项目启动', date: '2026-04-01', status: 'done', approver: '林伟杰', approveTime: '2026-04-02' },
            { name: '数据源对接完成', date: '2026-05-30', status: 'done', approver: '吴海涛', approveTime: '2026-06-01' },
            { name: '平台核心功能开发', date: '2026-09-01', status: 'current', approver: '待审批', approveTime: '—' },
            { name: '数据可视化模块', date: '2026-12-01', status: 'pending', approver: '—', approveTime: '—' },
            { name: '验收上线', date: '2027-02-28', status: 'pending', approver: '—', approveTime: '—' },
            { name: '项目结项', date: '2027-03-31', status: 'pending', approver: '—', approveTime: '—' },
          ],
          audits: [
            { id: 1, date: '2026-05-15', auditor: '吴海涛', type: '架构评审', result: '通过', remark: '架构方案合理，可扩展性好' },
            { id: 2, date: '2026-07-15', auditor: '郑雅琳', type: '中期预算审计', result: '通过', remark: '支出占比55%，符合项目进度' },
          ],
          flow: [{step:'提交立项',user:'张浩然',time:'2026-03-25',done:true},{step:'部门审批',user:'李明远',time:'2026-03-28',done:true},{step:'财务审核',user:'郑雅琳',time:'2026-03-30',done:true},{step:'总经理批准',user:'赵总',time:'2026-04-01',done:true}],
        },
        { id: 'PJ-2026-003', name: '锦程信息年度运维服务', customer: '成都锦程信息科技有限公司', status: '执行中', priority: '低', startDate: '2026-01-15', endDate: '2026-12-31', progress: 65, budget: 1280000, spent: 832000, manager: '刘子轩',
          team: [
            { name: '刘子轩', role: '项目经理', avatar: '刘', color: '#ef4444', dept: '销售部' },
            { name: '技术部2人', role: '运维工程师', avatar: '技', color: '#10b981', dept: '技术部' },
          ],
          milestones: [
            { name: '项目启动', date: '2026-01-15', status: 'done', approver: '林伟杰', approveTime: '2026-01-15' },
            { name: 'Q1运维报告', date: '2026-03-31', status: 'done', approver: '吴海涛', approveTime: '2026-04-02' },
            { name: 'Q2运维报告', date: '2026-06-30', status: 'done', approver: '吴海涛', approveTime: '2026-07-02' },
            { name: 'Q3运维报告', date: '2026-09-30', status: 'current', approver: '待审批', approveTime: '—' },
            { name: '项目结项', date: '2026-12-31', status: 'pending', approver: '—', approveTime: '—' },
          ],
          audits: [
            { id: 1, date: '2026-04-10', auditor: '吴海涛', type: '服务质量审计', result: '通过', remark: 'SLA达标率99.2%，超合同要求' },
          ],
          flow: [{step:'提交立项',user:'刘子轩',time:'2026-01-08',done:true},{step:'部门审批',user:'李明远',time:'2026-01-10',done:true},{step:'财务审核',user:'郑雅琳',time:'2026-01-12',done:true},{step:'总经理批准',user:'赵总',time:'2026-01-14',done:true}],
        },
        { id: 'PJ-2026-004', name: '智联物流仓储管理系统', customer: '四川智联物流有限公司', status: '立项审批中', priority: '中', startDate: '—', endDate: '—', progress: 0, budget: 450000, spent: 0, manager: '张浩然',
          team: [
            { name: '张浩然', role: '项目经理', avatar: '张', color: '#10b981', dept: '销售部' },
            { name: '待分配', role: '开发工程师', avatar: '?', color: '#94a3b8', dept: '技术部' },
          ],
          milestones: [],
          audits: [],
          flow: [{step:'提交立项',user:'张浩然',time:'2026-07-18',done:true},{step:'部门审批',user:'李明远',time:'—',done:false},{step:'财务审核',user:'郑雅琳',time:'—',done:false},{step:'总经理批准',user:'赵总',time:'—',done:false}],
        },
        { id: 'PJ-2026-005', name: '公司内部OA系统升级', customer: '内部项目', status: '待立项', priority: '高', startDate: '—', endDate: '—', progress: 0, budget: 380000, spent: 0, manager: '行政部',
          team: [],
          milestones: [],
          audits: [],
          flow: [{step:'提交立项',user:'马小丽',time:'—',done:false},{step:'部门审批',user:'—',time:'—',done:false},{step:'财务审核',user:'—',time:'—',done:false},{step:'总经理批准',user:'—',time:'—',done:false}],
        },
    ],
    projectStats: { total: 5, active: 3, approval: 1, pending: 1, avgProgress: 53, totalBudget: 6960000, totalSpent: 3023500 },
    // --- 出差申请 ---
    businessTrips: [
        { id: 'BT-2026-018', applicant: '李明远', fromCity: '成都', toCity: '绵阳', startDate: '2026-07-25', endDate: '2026-07-27', days: 3, purpose: '拜访绵阳3家制造业客户，推进ERP系统推广', budget: { transport: 800, hotel: 900, meal: 450, other: 200, total: 2350 }, status: '待审批', approver: '林伟杰', flow: [{step:'提交申请',user:'李明远',time:'2026-07-20',done:true},{step:'部门审批',user:'林伟杰',time:'—',done:false},{step:'总经理审批',user:'赵总',time:'—',done:false},{step:'出行',user:'—',time:'—',done:false}] },
        { id: 'BT-2026-017', applicant: '张浩然', fromCity: '成都', toCity: '德阳', startDate: '2026-07-22', endDate: '2026-07-23', days: 2, purpose: '跟进德阳地区客户需求，产品演示', budget: { transport: 500, hotel: 600, meal: 300, other: 100, total: 1500 }, status: '待审批', approver: '李明远', flow: [{step:'提交申请',user:'张浩然',time:'2026-07-19',done:true},{step:'部门审批',user:'李明远',time:'—',done:false},{step:'总经理审批',user:'赵总',time:'—',done:false},{step:'出行',user:'—',time:'—',done:false}] },
        { id: 'BT-2026-015', applicant: '刘子轩', fromCity: '成都', toCity: '重庆', startDate: '2026-07-18', endDate: '2026-07-20', days: 3, purpose: '拓展重庆区域市场，拜访5家意向客户', budget: { transport: 1200, hotel: 1200, meal: 600, other: 300, total: 3300 }, actualSpent: 2950, status: '已完成', approver: '林伟杰', flow: [{step:'提交申请',user:'刘子轩',time:'2026-07-15',done:true},{step:'部门审批',user:'李明远',time:'2026-07-16',done:true},{step:'总经理审批',user:'赵总',time:'2026-07-17',done:true},{step:'出行',user:'刘子轩',time:'2026-07-18',done:true}] },
        { id: 'BT-2026-013', applicant: '吴海涛', fromCity: '成都', toCity: '北京', startDate: '2026-07-10', endDate: '2026-07-12', days: 3, purpose: '参加全国软件技术大会，学习前沿技术方案', budget: { transport: 2500, hotel: 1800, meal: 500, other: 300, total: 5100 }, actualSpent: 4800, status: '已完成', approver: '赵总', flow: [{step:'提交申请',user:'吴海涛',time:'2026-07-08',done:true},{step:'部门审批',user:'赵总',time:'2026-07-09',done:true},{step:'总经理审批',user:'赵总',time:'2026-07-09',done:true},{step:'出行',user:'吴海涛',time:'2026-07-10',done:true}] },
        { id: 'BT-2026-011', applicant: '王思琪', fromCity: '成都', toCity: '南充', startDate: '2026-07-05', endDate: '2026-07-06', days: 2, purpose: '南充区域客户回访，续签洽谈', budget: { transport: 600, hotel: 500, meal: 200, other: 100, total: 1400 }, actualSpent: 1350, status: '已完成', approver: '李明远', flow: [{step:'提交申请',user:'王思琪',time:'2026-07-03',done:true},{step:'部门审批',user:'李明远',time:'2026-07-04',done:true},{step:'总经理审批',user:'赵总',time:'2026-07-04',done:true},{step:'出行',user:'王思琪',time:'2026-07-05',done:true}] },
        { id: 'BT-2026-016', applicant: '陈雨桐', fromCity: '成都', toCity: '宜宾', startDate: '2026-07-28', endDate: '2026-07-29', days: 2, purpose: '宜宾白酒行业客户调研', budget: { transport: 500, hotel: 400, meal: 200, other: 100, total: 1200 }, status: '已驳回', approver: '李明远', flow: [{step:'提交申请',user:'陈雨桐',time:'2026-07-20',done:true},{step:'部门审批',user:'李明远',time:'2026-07-20',done:true,remark:'试用期员工暂不安排长途出差'},{step:'总经理审批',user:'—',time:'—',done:false},{step:'出行',user:'—',time:'—',done:false}] },
    ],
    tripStats: { totalTrips: 6, pending: 2, completed: 3, rejected: 1, thisMonthTrips: 4, avgDays: 2.5, totalBudget: 14850, totalActual: 9100 },
    // --- 原有数据保持不变 ---
    teamMembers: [
        { id: 'ZM001', name: '李明远', dept: '销售部', role: '区域经理', avatar: '李', color: '#2563eb', phone: '138****8888', checkinStatus: 'signed_in', todayReports: 1, weekCheckins: 5, status: '在线' },
        { id: 'ZM002', name: '王思琪', dept: '销售部', role: '高级销售', avatar: '王', color: '#8b5cf6', phone: '139****6666', checkinStatus: 'signed_in', todayReports: 0, weekCheckins: 4, status: '在线' },
        { id: 'ZM003', name: '张浩然', dept: '销售部', role: '销售代表', avatar: '张', color: '#10b981', phone: '137****5555', checkinStatus: 'signed_in', todayReports: 1, weekCheckins: 5, status: '外勤中' },
        { id: 'ZM004', name: '陈雨桐', dept: '销售部', role: '销售代表', avatar: '陈', color: '#f59e0b', phone: '136****4444', checkinStatus: 'unsigned', todayReports: 0, weekCheckins: 3, status: '离线' },
        { id: 'ZM005', name: '刘子轩', dept: '销售部', role: '销售代表', avatar: '刘', color: '#ef4444', phone: '135****3333', checkinStatus: 'signed_in', todayReports: 1, weekCheckins: 5, status: '在线' },
        { id: 'ZM006', name: '赵晓彤', dept: '市场部', role: '市场专员', avatar: '赵', color: '#06b6d4', phone: '133****2222', checkinStatus: 'signed_in', todayReports: 0, weekCheckins: 5, status: '在线' },
        { id: 'ZM007', name: '孙博文', dept: '销售部', role: '销售代表', avatar: '孙', color: '#8b5cf6', phone: '132****1111', checkinStatus: 'signed_in', todayReports: 0, weekCheckins: 4, status: '外勤中' },
        { id: 'ZM008', name: '周梦瑶', dept: '销售部', role: '销售代表', avatar: '周', color: '#ec4899', phone: '131****0000', checkinStatus: 'unsigned', todayReports: 0, weekCheckins: 2, status: '请假' },
    ],
    checkinRecords: [
        { id: 1, user: '李明远', avatar: '李', color: '#2563eb', type: '签到', time: '08:52', loc: '成都市高新区天府软件园D区7栋', customer: '—', remark: '到达公司', photo: true },
        { id: 2, user: '李明远', avatar: '李', color: '#2563eb', type: '外勤签到', time: '10:15', loc: '成都市锦江区春熙路IFS国际金融中心', customer: '成都锦程信息科技有限公司', remark: '拜访客户，洽谈年度合作协议', photo: true },
        { id: 3, user: '张浩然', avatar: '张', color: '#10b981', type: '外勤签到', time: '09:30', loc: '成都市武侯区来福士广场', customer: '四川智联物流有限公司', remark: '产品演示及需求确认', photo: true },
        { id: 4, user: '王思琪', avatar: '王', color: '#8b5cf6', type: '签到', time: '08:45', loc: '成都市高新区天府软件园D区7栋', customer: '—', remark: '正常到岗', photo: true },
        { id: 5, user: '刘子轩', avatar: '刘', color: '#ef4444', type: '外勤签到', time: '14:20', loc: '成都市青羊区万达广场', customer: '成都汇通商贸有限公司', remark: '合同续签洽谈', photo: true },
        { id: 6, user: '李明远', avatar: '李', color: '#2563eb', type: '外勤签到', time: '14:30', loc: '成都市金牛区万达广场写字楼', customer: '四川鼎盛建设集团', remark: '跟进项目进度，提交技术方案', photo: true },
        { id: 7, user: '孙博文', avatar: '孙', color: '#8b5cf6', type: '外勤签到', time: '15:00', loc: '成都市成华区万象城', customer: '成都易达电子商务有限公司', remark: '新客户首次拜访', photo: true },
    ],
    reports: [
        { id: 1, author: '李明远', avatar: '李', color: '#2563eb', type: '日报', date: '2026-07-20', status: '已提交', completed: '1. 拜访成都锦程信息科技，达成年度合作初步意向\n2. 完成四川鼎盛建设集团技术方案提交\n3. 跟进3家意向客户回访', plan: '1. 签订锦程信息年度合作协议\n2. 拜访2家新客户\n3. 整理本周客户拜访数据', issues: '鼎盛建设对技术方案有修改需求', approver: '王总监', approveStatus: '待审批' },
        { id: 2, author: '张浩然', avatar: '张', color: '#10b981', type: '日报', date: '2026-07-20', status: '已提交', completed: '1. 为四川智联物流做产品演示\n2. 确认客户核心需求', plan: '1. 根据客户需求定制方案报价\n2. 跟进智联物流决策流程', issues: '客户预算有限，需制定分期付款方案', approver: '李明远', approveStatus: '已审批' },
        { id: 3, author: '刘子轩', avatar: '刘', color: '#ef4444', type: '日报', date: '2026-07-19', status: '已提交', completed: '1. 拜访成都汇通商贸\n2. 完成上月销售数据汇总', plan: '1. 推进汇通商贸续签流程\n2. 拜访3家金牛区客户', issues: '汇通商贸希望降低续签价格', approver: '李明远', approveStatus: '待审批' },
        { id: 4, author: '李明远', avatar: '李', color: '#2563eb', type: '周报', date: '2026-07-19', status: '已提交', completed: '本周共拜访客户12家，新签合同3份（合同总额86万），回款4笔（合计52万）', plan: '下周计划拜访客户15家，重点推进3大项目', issues: '技术部方案交付周期较长', approver: '王总监', approveStatus: '待审批' },
        { id: 5, author: '王思琪', avatar: '王', color: '#8b5cf6', type: '日报', date: '2026-07-19', status: '已提交', completed: '1. 完成高新区3家企业电话拜访\n2. 整理客户资料库', plan: '1. 上门拜访2家意向客户\n2. 参加产品培训', issues: '无', approver: '李明远', approveStatus: '已审批' },
    ],
    // --- 客户分级定义 ---
    customerLevels: [
        { level: 'S', name: '战略客户', color: '#8b5cf6', criteria: '年营收≥¥200万 / 长期战略合作合同', maxVisitInterval: 7, privilege: '总经理定期拜访 / 优先资源分配 / 专属客服经理' },
        { level: 'A', name: '核心客户', color: '#ef4444', criteria: '年营收¥50~200万 / 稳定合作1年以上', maxVisitInterval: 14, privilege: '销售总监季度拜访 / 优先售后响应 / 年度客户答谢' },
        { level: 'B', name: '重要客户', color: '#f59e0b', criteria: '年营收¥10~50万 / 有持续合作潜力', maxVisitInterval: 30, privilege: '区域经理月度拜访 / 标准售后服务' },
        { level: 'C', name: '一般客户', color: '#10b981', criteria: '年营收<¥10万 / 初期合作阶段', maxVisitInterval: 60, privilege: '销售员定期回访 / 基础售后服务' },
        { level: 'D', name: '待开发客户', color: '#94a3b8', criteria: '无营收 / 潜客探索阶段', maxVisitInterval: 90, privilege: '销售员跟进 / 商机评估' },
    ],
    // --- 客户生命周期阶段 ---
    customerLifecycle: [
        { stage: '潜客', icon: 'search', color: '#94a3b8', desc: '线索发现，初步接触' },
        { stage: '初访', icon: 'phone', color: '#06b6d4', desc: '首次拜访/电话沟通' },
        { stage: '跟进', icon: 'handshake-o', color: '#f59e0b', desc: '持续跟进，需求挖掘' },
        { stage: '谈判', icon: 'gavel', color: '#8b5cf6', desc: '商务谈判，方案提交' },
        { stage: '签约', icon: 'file-text', color: '#10b981', desc: '合同签署，正式合作' },
        { stage: '续约', icon: 'refresh', color: '#2563eb', desc: '合同续签，深化合作' },
        { stage: '流失', icon: 'remove', color: '#ef4444', desc: '合作终止，需挽回' },
    ],
    // --- 客户数据 ---
    customers: [
        { id: 1, name: '成都锦程信息科技有限公司', shortName: '锦程科技', contact: '赵明华', contactTitle: '总经理', phone: '138-0000-1111', email: 'zhao@jincheng.com', address: '高新区天府大道888号锦程大厦', level: 'A', lifecycle: '签约', status: '合作中', industry: '信息技术', area: '高新区', source: '行业展会', owner: '李明远', creditRating: '优秀', satisfaction: 4.8, contractCount: 3, lastVisit: '2026-07-20', dealAmount: 1280000, visits: 8, createDate: '2024-03-15', tags: ['战略合作','长期合同','信息化'], followUps: [
            { date: '2026-07-20', type: '拜访', content: '讨论下半年合作规划，客户对ERP升级方案满意', operator: '李明远' },
            { date: '2026-07-05', type: '电话', content: '确认合同续签意向，客户表示继续合作', operator: '李明远' },
            { date: '2026-06-20', type: '会议', content: '项目交付验收会议，系统运行稳定', operator: '李明远' },
            { date: '2026-05-10', type: '拜访', content: '上门回访，收集系统使用反馈', operator: '周梦瑶' },
        ]},
        { id: 2, name: '四川智联物流有限公司', shortName: '智联物流', contact: '钱志强', contactTitle: '业务经理', phone: '139-0000-2222', email: 'qian@zhilian.com', address: '武侯区人民南路物流园区', level: 'B', lifecycle: '跟进', status: '跟进中', industry: '物流运输', area: '武侯区', source: '客户推荐', owner: '张浩然', creditRating: '良好', satisfaction: 4.2, contractCount: 0, lastVisit: '2026-07-20', dealAmount: 0, visits: 3, createDate: '2025-11-20', tags: ['物流','TMS需求','商机'], followUps: [
            { date: '2026-07-20', type: '拜访', content: '客户参观了TMS演示，表示有采购意向', operator: '张浩然' },
            { date: '2026-07-08', type: '电话', content: '确认需求，客户需要物流运输管理系统', operator: '张浩然' },
            { date: '2026-06-25', type: '会议', content: '需求沟通会议，确定3个核心模块', operator: '张浩然' },
        ]},
        { id: 3, name: '四川鼎盛建设集团', shortName: '鼎盛建设', contact: '孙国强', contactTitle: '董事长', phone: '137-0000-3333', email: 'sun@dingsheng.com', address: '金牛区蜀汉路鼎盛大厦', level: 'S', lifecycle: '续约', status: '合作中', industry: '建筑工程', area: '金牛区', source: '政府引荐', owner: '王思琪', creditRating: '优秀', satisfaction: 4.9, contractCount: 5, lastVisit: '2026-07-20', dealAmount: 2560000, visits: 12, createDate: '2023-06-01', tags: ['战略合作','建筑信息化','VIP'], followUps: [
            { date: '2026-07-20', type: '拜访', content: '总经理陪同拜访，讨论新项目BIM管理系统方案', operator: '王思琪' },
            { date: '2026-07-15', type: '会议', content: '季度战略会议，续签3年合作协议', operator: '王思琪' },
            { date: '2026-06-28', type: '拜访', content: '售后回访，项目管理系统使用满意度调研', operator: '陈雨桐' },
            { date: '2026-05-20', type: '电话', content: '紧急需求沟通，新增工地监控模块', operator: '王思琪' },
            { date: '2026-04-10', type: '会议', content: '年度规划会议，确定3大合作方向', operator: '王思琪' },
        ]},
        { id: 4, name: '成都汇通商贸有限公司', shortName: '汇通商贸', contact: '李建华', contactTitle: '总经理', phone: '136-0000-4444', email: 'li@huitong.com', address: '青羊区光华大道汇通商业中心', level: 'B', lifecycle: '谈判', status: '续签中', industry: '商贸流通', area: '青羊区', source: '网络推广', owner: '刘子轩', creditRating: '良好', satisfaction: 4.1, contractCount: 1, lastVisit: '2026-07-20', dealAmount: 450000, visits: 6, createDate: '2025-01-10', tags: ['商贸','库存管理','续签'], followUps: [
            { date: '2026-07-20', type: '拜访', content: '续签谈判，客户希望增加仓储管理功能', operator: '刘子轩' },
            { date: '2026-07-12', type: '电话', content: '发送续签方案报价，等待反馈', operator: '刘子轩' },
            { date: '2026-06-30', type: '会议', content: '续签方案演示会议', operator: '刘子轩' },
        ]},
        { id: 5, name: '成都易达电子商务有限公司', shortName: '易达电商', contact: '周小鹏', contactTitle: '运营总监', phone: '135-0000-5555', email: 'zhou@yida.com', address: '成华区东郊记忆易达园区', level: 'C', lifecycle: '初访', status: '初次接触', industry: '电子商务', area: '成华区', source: '线上咨询', owner: '周梦瑶', creditRating: '待评估', satisfaction: 0, contractCount: 0, lastVisit: '2026-07-20', dealAmount: 0, visits: 1, createDate: '2026-07-18', tags: ['电商','初步接触','新线索'], followUps: [
            { date: '2026-07-20', type: '电话', content: '首次电话沟通，了解电商管理需求', operator: '周梦瑶' },
        ]},
        { id: 6, name: '四川天府数字科技有限公司', shortName: '天府数字', contact: '吴建民', contactTitle: 'CTO', phone: '133-0000-6666', email: 'wu@tianfu-digital.com', address: '天府新区科学城数字大厦', level: 'S', lifecycle: '签约', status: '合作中', industry: '信息技术', area: '天府新区', source: '战略合作', owner: '李明远', creditRating: '优秀', satisfaction: 4.7, contractCount: 4, lastVisit: '2026-07-18', dealAmount: 1890000, visits: 15, createDate: '2024-01-20', tags: ['数字化转型','长期合作','大数据'], followUps: [
            { date: '2026-07-18', type: '拜访', content: '讨论大数据平台二期项目需求', operator: '李明远' },
            { date: '2026-07-10', type: '会议', content: '一期项目验收会议，顺利交付', operator: '李明远' },
            { date: '2026-06-15', type: '拜访', content: '季度回访，客户满意度4.7分', operator: '陈雨桐' },
            { date: '2026-05-08', type: '电话', content: '二期需求初步沟通', operator: '李明远' },
        ]},
        { id: 7, name: '成都西部制造有限公司', shortName: '西部制造', contact: '郑德胜', contactTitle: '厂长', phone: '132-0000-7777', email: 'zheng@xibu-mfg.com', address: '龙泉驿区经开区西部工业园', level: 'B', lifecycle: '跟进', status: '跟进中', industry: '制造业', area: '龙泉驿', source: '行业协会', owner: '孙博文', creditRating: '良好', satisfaction: 3.8, contractCount: 0, lastVisit: '2026-07-17', dealAmount: 0, visits: 4, createDate: '2025-09-05', tags: ['制造业','MES需求','评估中'], followUps: [
            { date: '2026-07-17', type: '拜访', content: '参观产线，讨论MES系统实施方案', operator: '孙博文' },
            { date: '2026-07-05', type: '电话', content: '发送MES方案文档，等待技术评估', operator: '孙博文' },
            { date: '2026-06-20', type: '会议', content: '需求对接会议，确定4个生产模块', operator: '孙博文' },
            { date: '2026-05-25', type: '拜访', content: '首次现场考察，了解生产流程', operator: '孙博文' },
        ]},
        { id: 8, name: '四川长虹新能源有限公司', shortName: '长虹新能源', contact: '韩经理', contactTitle: '采购总监', phone: '131-0000-8888', email: 'han@changhong-energy.com', address: '高新区长虹科技园', level: 'A', lifecycle: '谈判', status: '谈判中', industry: '新能源', area: '高新区', source: '招标渠道', owner: '张浩然', creditRating: '优秀', satisfaction: 4.3, contractCount: 0, lastVisit: '2026-07-19', dealAmount: 0, visits: 7, createDate: '2026-02-10', tags: ['新能源','招投标','大客户'], followUps: [
            { date: '2026-07-19', type: '会议', content: '招投标方案评审，进入第二轮', operator: '张浩然' },
            { date: '2026-07-08', type: '拜访', content: '提交投标方案，与采购总监沟通', operator: '张浩然' },
            { date: '2026-06-25', type: '电话', content: '获取招标文件，分析需求要点', operator: '张浩然' },
        ]},
        { id: 9, name: '成都润泽医疗器械有限公司', shortName: '润泽医疗', contact: '马总', contactTitle: '总经理', phone: '130-0000-9999', email: 'ma@runze-medical.com', address: '温江区成都医学城', level: 'C', lifecycle: '跟进', status: '跟进中', industry: '医疗器械', area: '温江区', source: '客户推荐', owner: '周梦瑶', creditRating: '待评估', satisfaction: 3.5, contractCount: 0, lastVisit: '2026-07-16', dealAmount: 0, visits: 2, createDate: '2026-04-20', tags: ['医疗','合规管理','小客户'], followUps: [
            { date: '2026-07-16', type: '电话', content: '了解合规管理系统需求，客户表示感兴趣', operator: '周梦瑶' },
            { date: '2026-06-10', type: '拜访', content: '首次上门拜访，介绍公司产品线', operator: '周梦瑶' },
        ]},
        { id: 10, name: '重庆万里达电子科技有限公司', shortName: '万里达电子', contact: '冯总监', contactTitle: '技术总监', phone: '158-0000-0001', email: 'feng@wanlida.com', address: '中国重庆市渝北区仙桃数据谷', level: 'D', lifecycle: '潜客', status: '待开发', industry: '电子科技', area: '中国重庆市', source: '线上咨询', owner: '待分配', creditRating: '未评估', satisfaction: 0, contractCount: 0, lastVisit: '—', dealAmount: 0, visits: 0, createDate: '2026-07-12', tags: ['电子','跨区域','潜客'], followUps: [] },
    ],
    weekCheckinData: { labels: ['周一','周二','周三','周四','周五','周六','周日'], data: [48,52,50,49,42,8,3] },
    monthReportData: { labels: ['第1周','第2周','第3周','第4周'], daily: [38,42,40,45], weekly: [8,9,7,10] },
    deptPerformance: { labels: ['销售一部','销售二部','销售三部','市场部'], data: [320,280,195,150] },
    activities: [
        { time: '14:30', user: '李明远', action: '完成了外勤打卡', loc: '金牛区万达广场', type: 'checkin' },
        { time: '14:15', user: '刘子轩', action: '提交了日报', type: 'report' },
        { time: '13:50', user: '孙博文', action: '新增客户「成都易达电子商务」', type: 'customer' },
        { time: '12:00', user: '张浩然', action: '完成了外勤打卡', loc: '武侯区来福士广场', type: 'checkin' },
        { time: '10:30', user: '王思琪', action: '审批通过了刘子轩的日报', type: 'approve' },
        { time: '10:15', user: '李明远', action: '完成了外勤打卡', loc: '锦江区IFS', type: 'checkin' },
        { time: '09:30', user: '张浩然', action: '完成了外勤打卡', loc: '武侯区来福士广场', type: 'checkin' },
        { time: '08:52', user: '李明远', action: '完成上班签到', loc: '天府软件园D区', type: 'checkin' },
    ]
};

let currentView = 'dashboard';
let currentReportTab = 'daily';
let charts = {};

/* ===== 工具 ===== */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function showToast(msg, type = 'success') {
    const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fa fa-${icons[type]} toast-icon"></i><span class="toast-msg">${msg}</span>`;
    $('#toastContainer').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}
function openModal(id) { $('#' + id).classList.add('show'); }
function closeModal(id) { $('#' + id).classList.remove('show'); }
function formatDate(d) {
    const days = ['日','一','二','三','四','五','六'];
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${days[d.getDay()]}`;
}
function getTimeStr() { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; }
function moneyFmt(v) { return v >= 10000 ? `¥${(v/10000).toFixed(1)}万` : `¥${v}`; }

/* ===== 登录（连接后端数据库验证） ===== */
$('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = $('#loginForm').querySelectorAll('input');
    const username = inputs[0] ? inputs[0].value.trim() : 'ZM001';
    const password = inputs[1] ? inputs[1].value.trim() : '123456';
    showToast('正在登录...', 'info');
    try {
        const result = await API.login(username, password);
        if (result.success && result.data) {
            // Token已由API.login自动保存到localStorage
            // 用数据库返回的用户信息更新当前用户（排除token）
            const userData = { ...result.data };
            delete userData.token; // 不将token存入mockData
            mockData.currentUser = userData;
            showToast('登录成功，正在加载数据...', 'success');
            // 从数据库同步所有数据
            const syncResult = await API.syncAllData(mockData);
            if (syncResult.needLogin) {
                // Token同步时失效，回退到登录页
                showToast('会话过期，请重新登录', 'error');
                return;
            }
            setTimeout(() => {
                $('#loginPage').style.display = 'none';
                $('#mainApp').style.display = 'flex';
                renderView('dashboard');
                showToast(API.isOnline() ? '数据已从数据库加载' : '使用本地缓存数据', 'info');
            }, 600);
        } else {
            showToast('登录失败：' + (result.message || '账号或密码错误'), 'error');
        }
    } catch (err) {
        // API不可用时回退到离线模式
        showToast('服务器未启动，使用离线模式', 'warning');
        setTimeout(() => {
            $('#loginPage').style.display = 'none';
            $('#mainApp').style.display = 'flex';
            renderView('dashboard');
        }, 600);
    }
});
$('#toggleSidebar').addEventListener('click', () => { $('#sidebar').classList.toggle('collapsed'); $('.main-content').classList.toggle('expanded'); });
$$('.nav-item').forEach(item => { item.addEventListener('click', () => { const v = item.dataset.view; if (v) { renderView(v); if (window.innerWidth <= 768) { $('#sidebar').classList.remove('show'); } } }); });
$('#userMenu').addEventListener('click', (e) => { e.stopPropagation(); $('#userDropdown').classList.toggle('show'); });
document.addEventListener('click', () => $('#userDropdown').classList.remove('show'));
$('#logoutBtn').addEventListener('click', (e) => { e.preventDefault(); $('#mainApp').style.display = 'none'; $('#loginPage').style.display = 'flex'; showToast('已安全退出','info'); });
function updateTopbarDate() { $('#topbarDate').textContent = formatDate(new Date()); }
updateTopbarDate(); setInterval(updateTopbarDate, 60000);

/* ===== 视图路由 ===== */
const viewTitles = { dashboard:'工作台', cockpit:'智能驾驶舱', checkin:'外勤打卡', reports:'工作汇报', leave:'假期申请', expense:'费用报销', customers:'客户管理', contract:'合同审批', purchase:'采购管理', project:'项目管理', businesstrip:'出差申请', sales:'销售统计', hr:'人事管理', department:'部门管理', team:'团队管理', permission:'权限管理', finance:'财务管理', statistics:'统计分析', settings:'系统设置' };

function renderView(view) {
    currentView = view;
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
    $('#breadcrumb').textContent = viewTitles[view] || '';
    const c = $('#viewContainer');
    // Destroy old charts before clearing
    Object.keys(charts).forEach(k => { if (charts[k]) { charts[k].destroy(); charts[k] = null; } });
    charts = {};
    c.innerHTML = '';
    switch(view) {
        case 'dashboard': renderDashboard(c); break;
        case 'cockpit': renderCockpit(c); break;
        case 'checkin': renderCheckin(c); break;
        case 'reports': renderReports(c); break;
        case 'leave': renderLeave(c); break;
        case 'expense': renderExpense(c); break;
        case 'customers': renderCustomers(c); break;
        case 'contract': renderContract(c); break;
        case 'purchase': renderPurchase(c); break;
        case 'project': renderProject(c); break;
        case 'businesstrip': renderBusinessTrip(c); break;
        case 'sales': renderSales(c); break;
        case 'hr': renderHR(c); break;
        case 'department': renderDepartment(c); break;
        case 'team': renderTeam(c); break;
        case 'permission': renderPermission(c); break;
        case 'finance': renderFinance(c); break;
        case 'statistics': renderStatistics(c); break;
        case 'settings': renderSettings(c); break;
    }
}

/* ============================================
 * 工作台
 * ============================================ */
function renderDashboard(c) {
    const s = mockData.stats;
    c.innerHTML = `
        <div class="page-header"><h2>早上好，${mockData.currentUser.name} 👋</h2><p>今天是${formatDate(new Date())}，祝您工作顺利！</p></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-map-marker"></i></div></div><div class="stat-value">${s.todayCheckin}<span class="fs-16 text-muted">/${s.totalStaff}</span></div><div class="stat-label">今日打卡人数</div><div class="stat-trend up"><i class="fa fa-arrow-up"></i> 较昨日 +3人</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-file-text-o"></i></div></div><div class="stat-value">${s.pendingReports}</div><div class="stat-label">待审批汇报</div><div class="stat-trend up"><i class="fa fa-clock-o"></i> 请尽快处理</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-handshake-o"></i></div></div><div class="stat-value">${s.todayVisits}</div><div class="stat-label">今日客户拜访</div><div class="stat-trend up"><i class="fa fa-arrow-up"></i> 较昨日 +5次</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-line-chart"></i></div></div><div class="stat-value">${s.weekCheckinRate}<span class="fs-16 text-muted">%</span></div><div class="stat-label">本周打卡率</div><div class="stat-trend up"><i class="fa fa-arrow-up"></i> 较上周 +2%</div></div>
        </div>
        <div class="grid-2-1 mb-24">
            <div class="card"><div class="card-header"><h3><i class="fa fa-bar-chart" style="color:var(--primary);margin-right:8px;"></i>本周打卡趋势</h3><span class="tag tag-primary">最近7天</span></div><div class="card-body"><div class="chart-container"><canvas id="weekCheckinChart"></canvas></div></div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-bell-o" style="color:var(--warning);margin-right:8px;"></i>待办事项</h3></div><div class="card-body" style="padding:12px;">
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--danger-light);border-radius:8px;"><i class="fa fa-file-text" style="color:var(--danger);font-size:18px;"></i><div style="flex:1;"><div class="fw-600 fs-13">3份日报待审批</div><div class="fs-12 text-muted">来自团队成员</div></div><button class="btn btn-primary btn-sm" onclick="renderView('reports')">去处理</button></div>
                    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--warning-light);border-radius:8px;"><i class="fa fa-map-marker" style="color:var(--warning);font-size:18px;"></i><div style="flex:1;"><div class="fw-600 fs-13">您今日尚未签退</div><div class="fs-12 text-muted">请记得下班前签退</div></div><button class="btn btn-outline btn-sm" onclick="renderView('checkin')">去签到</button></div>
                    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--info-light);border-radius:8px;"><i class="fa fa-calendar" style="color:var(--info);font-size:18px;"></i><div style="flex:1;"><div class="fw-600 fs-13">2份合同待审批</div><div class="fs-12 text-muted">请及时审批避免延误</div></div><button class="btn btn-outline btn-sm" onclick="renderView('contract')">去审批</button></div>
                    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--purple-light);border-radius:8px;"><i class="fa fa-money" style="color:var(--purple);font-size:18px;"></i><div style="flex:1;"><div class="fw-600 fs-13">2笔费用报销待审批</div><div class="fs-12 text-muted">¥636待审批报销</div></div><button class="btn btn-outline btn-sm" onclick="renderView('expense')">去审批</button></div>
                </div>
            </div></div>
        </div>
        <div class="grid-2">
            <div class="card"><div class="card-header"><h3><i class="fa fa-users" style="color:var(--success);margin-right:8px;"></i>客户拜访排行</h3><a class="fs-13" style="color:var(--primary);cursor:pointer;" onclick="renderView('customers')">查看全部</a></div><div class="card-body" style="padding:8px 20px;">${renderCustomerRankList()}</div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-history" style="color:var(--purple);margin-right:8px;"></i>团队动态</h3></div><div class="card-body" style="padding:16px 20px;max-height:360px;overflow-y:auto;"><div class="timeline">${renderActivityTimeline()}</div></div></div>
        </div>`;
    setTimeout(() => renderWeekCheckinChart(), 100);
}
function renderCustomerRankList() { const sorted = [...mockData.customers].sort((a,b) => b.visits - a.visits).slice(0,5); const medals = ['#f59e0b','#94a3b8','#cd7f32']; return sorted.map((c,i) => `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--border-light);"><div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;${i<3?`background:${medals[i]}20;color:${medals[i]};`:'background:var(--bg-hover);color:var(--text-muted);'}">${i+1}</div><div style="flex:1;"><div class="fw-600 fs-13">${c.name}</div><div class="fs-12 text-muted">${c.area} · ${c.industry}</div></div><div class="text-right"><div class="fw-700 fs-16" style="color:var(--primary);">${c.visits}</div><div class="fs-12 text-muted">次拜访</div></div></div>`).join(''); }
function renderActivityTimeline() { const iconMap = { checkin:'map-marker', report:'file-text', customer:'user-plus', approve:'check' }; const colorMap = { checkin:'var(--primary)', report:'var(--success)', customer:'var(--warning)', approve:'var(--purple)' }; return mockData.activities.map(a => `<div class="timeline-item"><div class="timeline-dot" style="background:${colorMap[a.type]};box-shadow:0 0 0 2px ${colorMap[a.type]};"></div><div class="timeline-time">${a.time}</div><div class="timeline-content"><div class="timeline-title">${a.user} ${a.action}</div>${a.loc?`<div class="timeline-desc"><i class="fa fa-map-marker"></i> ${a.loc}</div>`:''}</div></div>`).join(''); }
function renderWeekCheckinChart() { const ctx = $('#weekCheckinChart'); if(!ctx) return; charts.weekCheckin = new Chart(ctx, { type:'bar', data:{ labels:mockData.weekCheckinData.labels, datasets:[{label:'打卡人数',data:mockData.weekCheckinData.data,backgroundColor:'#2563eb',borderRadius:8,barThickness:28}] }, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'}},x:{grid:{display:false}}} } }); }

/* ============================================
 * 智能驾驶舱
 * ============================================ */
function renderCockpit(c) {
    const ck = mockData.cockpit;
    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>智能数据驾驶舱</h2><p>全维度数据实时监控，一目了然掌握全局</p></div><span class="tag tag-info"><i class="fa fa-refresh"></i> 数据每5分钟刷新</span></div>
        <div class="cockpit-hero">
            <div class="cockpit-hero-item"><div class="hero-label">本月营收</div><div class="hero-value">¥${ck.revenue}万</div><div class="hero-sub">目标 ¥${ck.revenueTarget}万 · 完成 ${ck.revenueRate}%</div><div class="hero-bar"><div class="hero-bar-fill" style="width:${ck.revenueRate}%;"></div></div></div>
            <div class="cockpit-hero-item"><div class="hero-label">本月净利</div><div class="hero-value">¥${ck.profit}万</div><div class="hero-sub">利润率 ${ck.profitRate}% · 同比↑12%</div><div class="hero-bar"><div class="hero-bar-fill" style="width:${ck.profitRate}%;background:#10b981;"></div></div></div>
            <div class="cockpit-hero-item"><div class="hero-label">团队规模</div><div class="hero-value">${ck.headcount}人</div><div class="hero-sub">目标${ck.headcountTarget}人 · 在线42人</div><div class="hero-bar"><div class="hero-bar-fill" style="width:${ck.headcount/ck.headcountTarget*100}%;background:#8b5cf6;"></div></div></div>
        </div>
        <div style="margin-bottom:24px;">${ck.alerts.map(a => `<div class="alert-strip alert-${a.type}"><i class="fa fa-${a.icon}"></i><span>${a.msg}</span></div>`).join('')}</div>
        <div class="cockpit-grid mb-24">
            <div class="cockpit-kpi"><div class="kpi-icon" style="background:var(--primary-light);color:var(--primary);"><i class="fa fa-cny"></i></div><div class="kpi-value amount positive">¥${ck.revenue}万</div><div class="kpi-label">累计营收</div><div class="kpi-trend up" style="color:var(--success);"><i class="fa fa-arrow-up"></i> +12% 环比</div></div>
            <div class="cockpit-kpi"><div class="kpi-icon" style="background:var(--danger-light);color:var(--danger);"><i class="fa fa-credit-card"></i></div><div class="kpi-value amount negative">¥${ck.expense}万</div><div class="kpi-label">累计支出</div><div class="kpi-trend down" style="color:var(--danger);"><i class="fa fa-arrow-up"></i> +8% 环比</div></div>
            <div class="cockpit-kpi"><div class="kpi-icon" style="background:var(--success-light);color:var(--success);"><i class="fa fa-handshake-o"></i></div><div class="kpi-value">${ck.activeContracts}</div><div class="kpi-label">执行中合同</div><div class="kpi-trend up" style="color:var(--success);"><i class="fa fa-plus"></i> 本月+2</div></div>
            <div class="cockpit-kpi"><div class="kpi-icon" style="background:var(--warning-light);color:var(--warning);"><i class="fa fa-users"></i></div><div class="kpi-value">${ck.customerTotal}</div><div class="kpi-label">客户总数</div><div class="kpi-trend up" style="color:var(--success);"><i class="fa fa-plus"></i> 本月+3</div></div>
            <div class="cockpit-kpi"><div class="kpi-icon" style="background:var(--purple-light);color:var(--purple);"><i class="fa fa-file-contract"></i></div><div class="kpi-value">${ck.pendingContracts}</div><div class="kpi-label">待审批合同</div><div class="kpi-trend" style="color:var(--warning);"><i class="fa fa-clock-o"></i> 需及时处理</div></div>
            <div class="cockpit-kpi"><div class="kpi-icon" style="background:var(--danger-light);color:var(--danger);"><i class="fa fa-exclamation-triangle"></i></div><div class="kpi-value amount negative">¥${ck.overdueAR}万</div><div class="kpi-label">逾期应收</div><div class="kpi-trend down" style="color:var(--danger);"><i class="fa fa-arrow-up"></i> 涉及5家客户</div></div>
        </div>
        <div class="grid-2 mb-24">
            <div class="card"><div class="card-header"><h3><i class="fa fa-line-chart" style="color:var(--primary);margin-right:8px;"></i>营收与支出趋势</h3></div><div class="card-body"><div class="chart-container-lg"><canvas id="cockpitTrendChart"></canvas></div></div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-pie-chart" style="color:var(--success);margin-right:8px;"></i>部门业绩占比</h3></div><div class="card-body"><div class="chart-container-lg"><canvas id="cockpitDeptChart"></canvas></div></div></div>
        </div>`;
    setTimeout(() => {
        const ctx1 = $('#cockpitTrendChart');
        if(ctx1) charts.cockpitTrend = new Chart(ctx1, { type:'line', data:{ labels:ck.revenueTrend.labels, datasets:[{label:'营收(万)',data:ck.revenueTrend.data,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,0.1)',fill:true,tension:0.4,pointRadius:5},{label:'支出(万)',data:ck.expenseTrend.data,borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,0.05)',fill:true,tension:0.4,pointRadius:5}] }, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{usePointStyle:true}}},scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'}},x:{grid:{display:false}}} } });
        const ctx2 = $('#cockpitDeptChart');
        if(ctx2) charts.cockpitDept = new Chart(ctx2, { type:'doughnut', data:{ labels:mockData.deptPerformance.labels, datasets:[{data:mockData.deptPerformance.data,backgroundColor:['#2563eb','#8b5cf6','#10b981','#f59e0b'],borderWidth:0}] }, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{usePointStyle:true}}},cutout:'65%'} });
    }, 100);
}

/* ============================================
 * 外勤打卡
 * ============================================ */
function renderCheckin(c) {
    const tc = mockData.todayCheckin;
    c.innerHTML = `
        <div class="page-header"><h2>外勤打卡</h2><p>记录每一次外勤足迹，高效管理团队考勤</p></div>
        <div class="checkin-hero"><div class="checkin-hero-left"><h3><i class="fa fa-clock-o"></i> 当前时间</h3><div class="checkin-time" id="liveClock">${getTimeStr()}</div><div class="checkin-loc"><i class="fa fa-map-marker"></i><span>成都市高新区天府软件园D区7栋（精度：8米）</span></div><div style="margin-top:12px;display:flex;gap:16px;font-size:13px;"><span><i class="fa fa-sign-in"></i> 签到：${tc.checkInTime||'未签到'}</span><span><i class="fa fa-sign-out"></i> 签退：${tc.checkOutTime||'未签退'}</span></div></div><div class="checkin-hero-right"><button class="btn-checkin in" id="btnCheckIn" ${tc.checkInTime?'disabled':''}><i class="fa fa-sign-in"></i><span>${tc.checkInTime?'已签到':'外勤签到'}</span><small>${tc.checkInTime?tc.checkInTime:'点击签到'}</small></button><button class="btn-checkin out" id="btnCheckOut" ${!tc.checkInTime?'disabled':''}><i class="fa fa-sign-out"></i><span>外勤签退</span><small>${tc.checkOutTime||'点击签退'}</small></button></div></div>
        <div class="grid-2-1 mb-24">
            <div class="card"><div class="card-header"><h3><i class="fa fa-map" style="color:var(--primary);margin-right:8px;"></i>当前位置</h3><button class="btn btn-outline btn-sm" onclick="refreshLocation()"><i class="fa fa-refresh"></i> 刷新定位</button></div><div class="card-body"><div class="map-mock"><div class="map-grid"></div><div class="map-roads"></div><div class="map-pin"><div class="map-pin-icon"><i class="fa fa-map-marker"></i></div><div class="map-pin-label">天府软件园D区7栋</div></div></div><div class="loc-info mt-16"><i class="fa fa-location-arrow"></i><div class="loc-info-text"><strong>成都市高新区天府软件园D区7栋</strong><span>经纬度：30.5752°N, 104.0723°E · 精度：8米</span></div><span class="tag tag-success"><i class="fa fa-check"></i> 定位正常</span></div></div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-tasks" style="color:var(--success);margin-right:8px;"></i>今日打卡概览</h3></div><div class="card-body"><div style="text-align:center;padding:10px 0 20px;"><div style="font-size:40px;font-weight:700;color:var(--primary);">${mockData.stats.todayCheckin}<span style="font-size:18px;color:var(--text-muted);">/${mockData.stats.totalStaff}</span></div><div class="fs-13 text-muted mt-16">已打卡 / 总人数</div></div><div style="display:flex;gap:8px;"><div style="flex:1;text-align:center;padding:12px;background:var(--success-light);border-radius:8px;"><div class="fw-700 fs-20" style="color:var(--success);">42</div><div class="fs-12 text-secondary">已签到</div></div><div style="flex:1;text-align:center;padding:12px;background:var(--warning-light);border-radius:8px;"><div class="fw-700 fs-20" style="color:var(--warning);">10</div><div class="fs-12 text-secondary">外勤中</div></div><div style="flex:1;text-align:center;padding:12px;background:var(--danger-light);border-radius:8px;"><div class="fw-700 fs-20" style="color:var(--danger);">4</div><div class="fs-12 text-secondary">未签到</div></div></div></div></div>
        </div>
        <div class="card"><div class="card-header"><h3><i class="fa fa-history" style="color:var(--purple);margin-right:8px;"></i>打卡记录</h3></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>员工</th><th>类型</th><th>时间</th><th>位置</th><th>客户</th><th>备注</th><th>照片</th></tr></thead><tbody>${renderCheckinTable()}</tbody></table></div></div></div>`;
    if(window._clockInterval) clearInterval(window._clockInterval);
    window._clockInterval = setInterval(() => { const el=$('#liveClock'); if(el) el.textContent=getTimeStr(); }, 1000);
    $('#btnCheckIn')?.addEventListener('click', openCheckinModal);
    $('#btnCheckOut')?.addEventListener('click', () => openCheckinModal('checkout'));
}
function renderCheckinTable() { const typeColors = {'签到':'tag-success','外勤签到':'tag-primary','签退':'tag-info'}; return mockData.checkinRecords.map(r => `<tr><td><div style="display:flex;align-items:center;gap:8px;"><div style="width:32px;height:32px;border-radius:50%;background:${r.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;">${r.avatar}</div><span class="fw-600">${r.user}</span></div></td><td><span class="tag ${typeColors[r.type]||'tag-gray'}">${r.type}</span></td><td class="fw-600">${r.time}</td><td style="max-width:200px;"><div class="fs-12">${r.loc}</div></td><td>${r.customer==='—'?'<span class="text-muted">—</span>':`<span class="fw-600 fs-12">${r.customer}</span>`}</td><td style="max-width:200px;"><span class="fs-12 text-secondary">${r.remark}</span></td><td>${r.photo?'<i class="fa fa-check-circle" style="color:var(--success);font-size:16px;"></i>':'<span class="text-muted">—</span>'}</td></tr>`).join(''); }
function openCheckinModal(type='checkin') { const isCheckout=type==='checkout'; $('#checkinModalTitle').textContent=isCheckout?'外勤签退':'外勤签到'; $('#checkinModalBody').innerHTML=`<div class="loc-info"><i class="fa fa-location-arrow"></i><div class="loc-info-text"><strong>成都市高新区天府软件园D区7栋</strong><span>30.5752°N, 104.0723°E · 精度8米</span></div><span class="tag tag-success"><i class="fa fa-check"></i> 定位成功</span></div><div class="form-field"><label>打卡类型</label><select id="checkinType"><option value="外勤签到" ${!isCheckout?'selected':''}>外勤签到</option><option value="签退" ${isCheckout?'selected':''}>外勤签退</option><option value="客户拜访">客户拜访</option></select></div><div class="form-field"><label>关联客户</label><select id="checkinCustomer"><option value="">请选择</option>${mockData.customers.map(c=>`<option value="${c.name}">${c.name}</option>`).join('')}</select></div><div class="form-field"><label>现场照片 <span class="required">*</span></label><div class="photo-upload" onclick="this.outerHTML='<div class=photo-preview style=width:100%;height:160px;border-radius:8px;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:40px;position:relative;><i class=fa-check-circle></i></div>'"><i class="fa fa-camera"></i><span>点击拍照上传</span></div></div><div class="form-field"><label>备注说明</label><textarea id="checkinRemark" placeholder="请输入备注"></textarea></div><div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:8px;"><button class="btn btn-outline" onclick="closeModal('checkinModal')">取消</button><button class="btn btn-primary" onclick="submitCheckin(${isCheckout})"><i class="fa fa-check"></i> 确认${isCheckout?'签退':'签到'}</button></div>`; openModal('checkinModal'); }
async function submitCheckin(isCheckout) {
    closeModal('checkinModal');
    const time = getTimeStr().substring(0, 5);
    const loc = '成都市高新区天府软件园D区7栋';
    if (isCheckout) {
        mockData.todayCheckin.checkOutTime = time;
        mockData.todayCheckin.status = 'signed_out';
        await API.doCheckin({ userId: mockData.currentUser.id, userName: mockData.currentUser.name, time, loc, type: 'out' });
        showToast(`签退成功！时间：${time}`, 'success');
    } else {
        mockData.todayCheckin.checkInTime = time;
        mockData.todayCheckin.status = 'signed_in';
        await API.doCheckin({ userId: mockData.currentUser.id, userName: mockData.currentUser.name, time, loc, type: 'in' });
        showToast(`签到成功！时间：${time}`, 'success');
        if (!mockData.checkinRecords) mockData.checkinRecords = [];
        mockData.checkinRecords.unshift({ id: Date.now(), user: '李明远', avatar: '李', color: '#2563eb', type: '外勤签到', time, loc, customer: $('#checkinCustomer')?.value || '—', remark: $('#checkinRemark')?.value || '外勤签到', photo: true });
    }
    renderView('checkin');
}
function refreshLocation() { showToast('正在重新定位...','info'); setTimeout(()=>showToast('定位已刷新','success'),1000); }

/* ============================================
 * 工作汇报
 * ============================================ */
function renderReports(c) { c.innerHTML=`<div class="page-header flex-between"><div><h2>工作汇报</h2><p>高效的工作汇报，让团队协作更加顺畅</p></div><div class="flex gap-8"><button class="btn btn-outline" onclick="openReportModal('weekly')"><i class="fa fa-file-text-o"></i> 写周报</button><button class="btn btn-primary" onclick="openReportModal('daily')"><i class="fa fa-plus"></i> 写日报</button></div></div><div class="stats-grid"><div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-file-text-o"></i></div></div><div class="stat-value">28</div><div class="stat-label">本月已提交</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-clock-o"></i></div></div><div class="stat-value">${mockData.stats.pendingReports}</div><div class="stat-label">待审批</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-check-circle"></i></div></div><div class="stat-value">25</div><div class="stat-label">已通过</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-line-chart"></i></div></div><div class="stat-value">89<span class="fs-16 text-muted">%</span></div><div class="stat-label">汇报完成率</div></div></div><div class="tabs"><div class="tab ${currentReportTab==='daily'?'active':''}" onclick="switchReportTab('daily')">日报</div><div class="tab ${currentReportTab==='weekly'?'active':''}" onclick="switchReportTab('weekly')">周报</div><div class="tab ${currentReportTab==='pending'?'active':''}" onclick="switchReportTab('pending')">待审批 (${mockData.stats.pendingReports})</div></div><div id="reportListContainer">${renderReportList()}</div>`; }
function switchReportTab(tab) { currentReportTab=tab; $$('.tab').forEach((t,i)=>{const tabs=['daily','weekly','pending'];t.classList.toggle('active',tabs[i]===tab);}); $('#reportListContainer').innerHTML=renderReportList(); }
function renderReportList() { let reports=mockData.reports; if(currentReportTab==='daily')reports=reports.filter(r=>r.type==='日报'); else if(currentReportTab==='weekly')reports=reports.filter(r=>r.type==='周报'); else if(currentReportTab==='pending')reports=reports.filter(r=>r.approveStatus==='待审批'); if(!reports.length)return`<div class="card"><div class="card-body"><div class="empty-state"><i class="fa fa-inbox"></i><p>暂无汇报记录</p></div></div></div>`; return reports.map(r=>{const approveTag=r.approveStatus==='已审批'?'tag-success':'tag-warning';return`<div class="report-item" onclick="viewReport(${r.id})"><div class="report-avatar" style="background:${r.color};color:#fff;">${r.avatar}</div><div class="report-content"><div class="report-meta"><strong>${r.author}</strong><span class="tag tag-primary report-type">${r.type}</span><span class="tag ${approveTag}">${r.approveStatus}</span><span class="report-date">${r.date}</span></div><div class="report-preview"><strong>今日完成：</strong>${r.completed.split('\n')[0]}...</div></div>${r.approveStatus==='待审批'&&currentReportTab==='pending'?`<button class="btn btn-success btn-sm" onclick="event.stopPropagation();approveReport(${r.id})"><i class="fa fa-check"></i> 审批</button>`:''}<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteReport(${r.id})"><i class="fa fa-trash"></i></button></div>`;}).join(''); }
function openReportModal(type) { const typeNames={daily:'日报',weekly:'周报'}; $('#reportModalTitle').textContent=`新建${typeNames[type]}`; const today=new Date().toISOString().split('T')[0]; $('#reportModalBody').innerHTML=`<div class="form-field"><label>汇报类型</label><select id="reportType"><option value="日报" ${type==='daily'?'selected':''}>日报</option><option value="周报" ${type==='weekly'?'selected':''}>周报</option></select></div><div class="grid-2"><div class="form-field"><label>日期</label><input type="date" id="reportDate" value="${today}"></div><div class="form-field"><label>审批人</label><select id="reportApprover"><option>王总监</option><option>李明远</option></select></div></div><div class="form-field"><label>工作完成情况 <span class="required">*</span></label><textarea id="reportCompleted" placeholder="请描述已完成的工作"></textarea></div><div class="form-field"><label>工作计划 <span class="required">*</span></label><textarea id="reportPlan" placeholder="请描述工作计划"></textarea></div><div class="form-field"><label>遇到的问题及建议</label><textarea id="reportIssues" placeholder="问题或建议..."></textarea></div><div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:8px;"><button class="btn btn-outline" onclick="closeModal('reportModal')">取消</button><button class="btn btn-primary" onclick="saveReport()"><i class="fa fa-paper-plane"></i> 提交汇报</button></div>`; openModal('reportModal'); }
async function saveReport() {
    const type=$('#reportType').value, date=$('#reportDate').value, completed=$('#reportCompleted').value.trim(), plan=$('#reportPlan').value.trim();
    if(!completed||!plan){showToast('请填写必填项','warning');return;}
    closeModal('reportModal');
    const reportData = { userName: mockData.currentUser.name, type, date, content: completed, plan };
    showToast('正在提交...', 'info');
    const result = await API.submitReport(reportData);
    const report = { id: result.success ? result.data.id : Date.now(), author: mockData.currentUser.name, avatar: '李', color: '#2563eb', type, date, status: '已提交', completed, plan, issues: $('#reportIssues').value||'无', approver: $('#reportApprover').value, approveStatus: '待审批' };
    mockData.reports.unshift(report);
    showToast(result.success ? `${type}已提交并存入数据库！` : `${type}提交成功（本地缓存）`, 'success');
    renderView('reports');
}
function viewReport(id) { const r=mockData.reports.find(x=>x.id===id); if(!r)return; $('#reportModalTitle').textContent=`${r.type}详情`; $('#reportModalBody').innerHTML=`<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-light);"><div class="report-avatar" style="background:${r.color};color:#fff;width:48px;height:48px;font-size:18px;">${r.avatar}</div><div style="flex:1;"><div class="fw-700 fs-16">${r.author}</div><div class="fs-12 text-muted">${r.date} · ${r.type}</div></div><span class="tag ${r.approveStatus==='已审批'?'tag-success':'tag-warning'}">${r.approveStatus}</span></div><div class="form-field"><label><i class="fa fa-check-square-o" style="color:var(--success);"></i> 工作完成情况</label><div style="padding:14px;background:var(--bg-hover);border-radius:8px;white-space:pre-wrap;font-size:14px;line-height:1.8;">${esc(r.completed)}</div></div><div class="form-field"><label><i class="fa fa-calendar-check-o" style="color:var(--primary);"></i> 工作计划</label><div style="padding:14px;background:var(--bg-hover);border-radius:8px;white-space:pre-wrap;font-size:14px;line-height:1.8;">${r.plan}</div></div><div class="form-field"><label><i class="fa fa-exclamation-circle" style="color:var(--warning);"></i> 问题与建议</label><div style="padding:14px;background:var(--bg-hover);border-radius:8px;white-space:pre-wrap;font-size:14px;line-height:1.8;">${r.issues}</div></div>${r.approveStatus==='待审批'?`<div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;"><button class="btn btn-outline" onclick="closeModal('reportModal')">关闭</button><button class="btn btn-success" onclick="approveReport(${r.id})"><i class="fa fa-check"></i> 通过审批</button></div>`:`<div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;"><button class="btn btn-outline" onclick="closeModal('reportModal')">关闭</button></div>`}`; openModal('reportModal'); }
async function approveReport(id) { const r=await API.approveReport(id,{approver:mockData.currentUser.name}); if(r.success){closeModal('reportModal');showToast('审批通过！','success');renderView('reports');}else{showToast(r.message||'审批失败','error');} }

/* ============================================
 * 假期申请
 * ============================================ */
function renderLeave(c) {
    const lb = mockData.currentUser.leaveBalance;
    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>假期申请</h2><p>在线申请假期，智能审批流程，透明管理假期余额</p></div><button class="btn btn-primary" onclick="openLeaveModal()"><i class="fa fa-plus"></i> 申请假期</button></div>
        <div class="stats-grid">
            ${mockData.leaveTypes.map(lt => `<div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:${lt.color}15;color:${lt.color};"><i class="fa fa-${lt.icon}"></i></div></div><div class="stat-value">${lt.balance}<span class="fs-16 text-muted">/${lt.total}</span></div><div class="stat-label">${lt.type}余额（天）</div><div style="margin-top:8px;"><div class="progress-bar"><div class="progress-bar-fill" style="width:${lt.balance/lt.total*100}%;background:${lt.color};"></div></div></div></div>`).join('')}
        </div>
        <div class="card"><div class="card-header"><h3><i class="fa fa-list" style="color:var(--primary);margin-right:8px;"></i>假期申请记录</h3><div class="flex gap-8"><button class="btn btn-outline btn-sm" onclick="exportLeave()"><i class="fa fa-download"></i> 导出</button></div></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>申请人</th><th>假期类型</th><th>起始日期</th><th>结束日期</th><th>天数</th><th>原因</th><th>审批人</th><th>状态</th><th>操作</th></tr></thead><tbody>${mockData.leaveRecords.map(lr => {const statusTag=lr.status==='已通过'?'tag-success':lr.status==='待审批'?'tag-warning':'tag-danger'; return `<tr><td class="fw-600">${lr.applicant}</td><td><span class="tag tag-primary">${lr.type}</span></td><td>${lr.startDate}</td><td>${lr.endDate}</td><td class="fw-600">${lr.days}天</td><td class="fs-12">${esc(lr.reason)}</td><td>${lr.approver}</td><td><span class="tag ${statusTag}">${lr.status}</span></td><td>${lr.status==='待审批'?`<button class="btn btn-success btn-sm" onclick="approveLeave(${lr.id})"><i class="fa fa-check"></i></button><button class="btn btn-danger btn-sm" onclick="rejectLeave(${lr.id})"><i class="fa fa-times"></i></button>`:'<span class="text-muted">—</span>'}</td></tr>`;}).join('')}</tbody></table></div></div></div>`;
}
function openLeaveModal() {
    $('#genericModalTitle').textContent = '申请假期';
    $('#genericModalBody').innerHTML = `<div class="form-field"><label>假期类型 <span class="required">*</span></label><select id="leaveType">${mockData.leaveTypes.map(lt=>`<option>${lt.type}（余额${lt.balance}天）</option>`).join('')}</select></div><div class="grid-2"><div class="form-field"><label>起始日期 <span class="required">*</span></label><input type="date" id="leaveStart" value="${new Date().toISOString().split('T')[0]}"></div><div class="form-field"><label>结束日期 <span class="required">*</span></label><input type="date" id="leaveEnd" value="${new Date().toISOString().split('T')[0]}"></div></div><div class="form-field"><label>请假原因 <span class="required">*</span></label><textarea id="leaveReason" placeholder="请详细说明请假原因"></textarea></div><div class="form-field"><label>审批人</label><select id="leaveApprover"><option>王总监</option><option>李明远</option></select></div><div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:8px;"><button class="btn btn-outline" onclick="closeModal('genericModal')">取消</button><button class="btn btn-primary" onclick="submitLeave()"><i class="fa fa-paper-plane"></i> 提交申请</button></div>`;
    openModal('genericModal');
}
async function submitLeave() {
    closeModal('genericModal');
    const leaveData = {
        applicant: mockData.currentUser.name,
        type: $('#leaveType').value.split('（')[0],
        startDate: $('#leaveStart').value,
        endDate: $('#leaveEnd').value,
        days: 1,
        reason: $('#leaveReason').value,
        approver: $('#leaveApprover').value
    };
    showToast('正在提交...', 'info');
    const result = await API.applyLeave(leaveData);
    if (result.success) {
        leaveData.id = result.data.id;
        leaveData.status = '待审批';
        showToast('假期申请已提交并存入数据库！', 'success');
    } else {
        leaveData.id = Date.now();
        leaveData.status = '待审批';
        showToast('已提交（本地缓存）', 'success');
    }
    mockData.leaveRecords.unshift(leaveData);
    renderView('leave');
}
async function approveLeave(id) {
    const r = mockData.leaveRecords.find(x => x.id === id);
    if (r) {
        r.status = '已通过';
        await API.approveLeave(id, { status: '已通过', approver: mockData.currentUser.name });
    }
    showToast('已通过', 'success'); renderView('leave');
}
async function rejectLeave(id) {
    const r = mockData.leaveRecords.find(x => x.id === id);
    if (r) {
        r.status = '已驳回';
        await API.approveLeave(id, { status: '已驳回', approver: mockData.currentUser.name });
    }
    showToast('已驳回', 'warning'); renderView('leave');
}

/* ============================================
 * 费用报销
 * ============================================ */
function renderExpense(c) {
    const es = mockData.expenseStats;
    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>费用报销</h2><p>规范报销流程，高效费用管理</p></div><button class="btn btn-primary" onclick="openExpenseModal()"><i class="fa fa-plus"></i> 申请报销</button></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-cny"></i></div></div><div class="stat-value amount">¥${es.totalSubmitted}<span class="fs-16 text-muted">元</span></div><div class="stat-label">本月累计报销</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-check-circle"></i></div></div><div class="stat-value amount positive">¥${es.totalApproved}</div><div class="stat-label">已审批金额</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-clock-o"></i></div></div><div class="stat-value amount primary">¥${es.pending}</div><div class="stat-label">待审批金额</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-line-chart"></i></div></div><div class="stat-value">${es.usedRate}<span class="fs-16 text-muted">%</span></div><div class="stat-label">预算使用率（预算¥${es.monthBudget}）</div><div style="margin-top:8px;"><div class="progress-bar"><div class="progress-bar-fill" style="width:${es.usedRate}%;background:${es.usedRate>80?'var(--danger)':'var(--success)'};"></div></div></div></div>
        </div>
        <div class="card"><div class="card-header"><h3><i class="fa fa-list-alt" style="color:var(--primary);margin-right:8px;"></i>报销记录</h3></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>申请人</th><th>费用类别</th><th>金额</th><th>日期</th><th>说明</th><th>凭证数</th><th>状态</th><th>操作</th></tr></thead><tbody>${mockData.expenseRecords.map(er => {const statusTag=er.status==='已通过'?'tag-success':er.status==='待审批'?'tag-warning':'tag-danger'; return `<tr><td class="fw-600">${er.applicant}</td><td><span class="tag tag-info">${er.category}</span></td><td class="fw-700 amount primary">¥${er.amount}</td><td>${er.date}</td><td class="fs-12">${er.desc}</td><td>${er.receipts}张</td><td><span class="tag ${statusTag}">${er.status}</span></td><td>${er.status==='待审批'?`<button class="btn btn-success btn-sm" onclick="approveExpense(${er.id})"><i class="fa fa-check"></i></button><button class="btn btn-danger btn-sm" onclick="rejectExpense(${er.id})"><i class="fa fa-times"></i></button>`:'—'}</td></tr>`;}).join('')}</tbody></table></div></div></div>`;
}
function openExpenseModal() {
    $('#genericModalTitle').textContent = '申请费用报销';
    $('#genericModalBody').innerHTML = `<div class="form-field"><label>费用类别 <span class="required">*</span></label><select id="expCategory">${mockData.expenseCategories.map(c=>`<option>${c}</option>`).join('')}</select></div><div class="form-field"><label>报销金额 <span class="required">*</span></label><input type="text" id="expAmount" placeholder="请输入金额（元）"></div><div class="form-field"><label>费用说明 <span class="required">*</span></label><textarea id="expDesc" placeholder="请详细说明费用用途"></textarea></div><div class="form-field"><label>上传凭证</label><div class="photo-upload" onclick="this.outerHTML='<div class=photo-preview style=width:100%;height:120px;border-radius:8px;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;><i class=fa-check-circle></i></div>'"><i class="fa fa-camera" style="font-size:24px;"></i><span>点击上传报销凭证</span></div></div><div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:8px;"><button class="btn btn-outline" onclick="closeModal('genericModal')">取消</button><button class="btn btn-primary" onclick="submitExpense()"><i class="fa fa-paper-plane"></i> 提交报销</button></div>`;
    openModal('genericModal');
}
async function submitExpense() {
    closeModal('genericModal');
    const expData = {
        applicant: mockData.currentUser.name,
        category: $('#expCategory').value,
        amount: parseInt($('#expAmount').value) || 0,
        date: new Date().toISOString().split('T')[0],
        desc: $('#expDesc').value,
        receipts: 1
    };
    showToast('正在提交...', 'info');
    const result = await API.applyExpense(expData);
    if (result.success) {
        expData.id = result.data.id;
        showToast('报销已提交并存入数据库！', 'success');
    } else {
        expData.id = Date.now();
        showToast('已提交（本地缓存）', 'success');
    }
    expData.status = '待审批';
    mockData.expenseRecords.unshift(expData);
    renderView('expense');
}
async function approveExpense(id) {
    const r = mockData.expenseRecords.find(x => x.id === id);
    if (r) { r.status = '已通过'; await API.approveExpense(id, { status: '已通过' }); }
    showToast('报销已通过', 'success'); renderView('expense');
}
async function rejectExpense(id) {
    const r = mockData.expenseRecords.find(x => x.id === id);
    if (r) { r.status = '已驳回'; await API.approveExpense(id, { status: '已驳回' }); }
    showToast('报销已驳回', 'warning'); renderView('expense');
}

/* ============================================
 * 合同审批
 * ============================================ */
function renderContract(c) {
    const statusCounts = {执行中: mockData.contracts.filter(c=>c.status==='执行中').length, 待审批: mockData.contracts.filter(c=>c.status==='待审批').length, 已完成: mockData.contracts.filter(c=>c.status==='已完成').length};
    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>合同审批</h2><p>规范化合同审批流程，防范法律风险，保障业务安全</p></div><button class="btn btn-primary" onclick="showNewContractForm()"><i class="fa fa-plus"></i> 新建合同</button></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-file-contract"></i></div></div><div class="stat-value">${mockData.contracts.length}</div><div class="stat-label">合同总数</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-check-circle"></i></div></div><div class="stat-value">${statusCounts['执行中']}</div><div class="stat-label">执行中</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-clock-o"></i></div></div><div class="stat-value">${statusCounts['待审批']}</div><div class="stat-label">待审批</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-cny"></i></div></div><div class="stat-value amount large" style="color:var(--primary);">¥${mockData.contracts.reduce((s,c)=>s+c.amount,0)/10000}万</div><div class="stat-label">合同总金额</div></div>
        </div>
        <div class="card"><div class="card-header"><h3><i class="fa fa-file-text" style="color:var(--primary);margin-right:8px;"></i>合同列表</h3></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>合同编号</th><th>合同名称</th><th>客户</th><th>类型</th><th>金额</th><th>有效期</th><th>进度</th><th>状态</th><th>操作</th></tr></thead><tbody>${mockData.contracts.map(ct => {const statusTag=ct.status==='执行中'?'tag-success':ct.status==='待审批'?'tag-warning':'tag-info'; return `<tr><td class="fw-600 fs-12">${ct.id}</td><td style="max-width:200px;"><span class="fw-600">${ct.name}</span></td><td>${ct.customer}</td><td><span class="tag tag-primary">${ct.type}</span></td><td class="fw-700 amount primary">¥${ct.amount/10000}万</td><td class="fs-12">${ct.startDate} ~ ${ct.endDate}</td><td><div style="display:flex;align-items:center;gap:6px;"><div class="progress-bar" style="width:80px;"><div class="progress-bar-fill" style="width:${ct.progress}%;background:var(--success);"></div></div><span class="fs-12">${ct.progress}%</span></div></td><td><span class="tag ${statusTag}">${ct.status}</span></td><td><button class="btn btn-outline btn-sm" onclick="viewContract('${ct.id}')">详情</button><button class="btn btn-danger btn-sm" onclick="deleteContract('${ct.id}')"><i class="fa fa-trash"></i></button></td></tr>`;}).join('')}</tbody></table></div></div></div>`;
}
function viewContract(id) {
    const ct = mockData.contracts.find(x=>x.id===id); if(!ct) return;
    $('#contractModalTitle').textContent = ct.name;
    $('#contractModalBody').innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:20px;"><div style="width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,var(--primary),var(--purple));color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;"><i class="fa fa-file-contract"></i></div><div style="flex:1;"><h3 class="fw-700">${ct.name}</h3><div class="flex gap-8 mt-16"><span class="tag tag-primary">${ct.type}</span><span class="tag ${ct.status==='执行中'?'tag-success':ct.status==='待审批'?'tag-warning':'tag-info'}">${ct.status}</span></div></div></div>
        <div class="grid-2">
            <div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">合同编号</label><div class="fw-600">${ct.id}</div></div>
            <div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">合同金额</label><div class="fw-700 amount large" style="color:var(--primary);">¥${ct.amount/10000}万</div></div>
            <div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">客户</label><div class="fw-600">${ct.customer}</div></div>
            <div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">创建人</label><div class="fw-600">${ct.creator}</div></div>
            <div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">有效期</label><div class="fw-600">${ct.startDate} ~ ${ct.endDate}</div></div>
            <div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">执行进度</label><div class="fw-600">${ct.progress}%</div></div>
        </div>
        <div class="form-field"><label><i class="fa fa-route" style="color:var(--primary);"></i> 审批流程</label>
            <div class="approval-bar">${ct.flow.map((f,i) => `<div class="approval-node ${f.done?'done':(i===ct.flow.findIndex(x=>!x.done))?'current':'pending'}"><div class="node-title">${f.step}</div><div class="node-name">${f.user}</div><div class="node-time">${f.time}</div></div>${i<ct.flow.length-1?`<div class="approval-connector ${f.done?'done':''}"><i class="fa fa-arrow-right"></i></div>`:''}`).join('')}</div>
        </div>
        ${ct.status==='待审批'?`<div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;"><button class="btn btn-outline" onclick="closeModal('contractModal')">关闭</button><button class="btn btn-danger" onclick="rejectContract('${ct.id}')"><i class="fa fa-times"></i> 驳回</button><button class="btn btn-success" onclick="approveContract('${ct.id}')"><i class="fa fa-check"></i> 通过审批</button></div>`:`<div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;"><button class="btn btn-outline" onclick="closeModal('contractModal')">关闭</button></div>`}`;
    openModal('contractModal');
}
async function approveContract(id) { const r=await API.approveContract(id,{status:'执行中',approver:mockData.currentUser.name}); if(r.success){closeModal('contractModal');showToast('合同审批通过！','success');renderView('contract');}else{showToast(r.message||'审批失败','error');} }
async function rejectContract(id) { const r=await API.approveContract(id,{status:'已驳回',approver:mockData.currentUser.name}); if(r.success){closeModal('contractModal');showToast('合同已驳回','warning');renderView('contract');}else{showToast(r.message||'操作失败','error');} }

/* ============================================
 * 采购管理
 * ============================================ */
function renderPurchase(c) {
    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>采购管理</h2><p>规范采购流程，优化资源配置，控制采购成本</p></div><button class="btn btn-primary" onclick="showNewPurchaseForm()"><i class="fa fa-plus"></i> 新建采购</button></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-cart-plus"></i></div></div><div class="stat-value">${mockData.purchases.length}</div><div class="stat-label">采购申请</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-check-circle"></i></div></div><div class="stat-value">${mockData.purchases.filter(p=>p.status==='已入库').length}</div><div class="stat-label">已入库</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-clock-o"></i></div></div><div class="stat-value">${mockData.purchases.filter(p=>p.status==='待审批'||p.status==='采购中').length}</div><div class="stat-label">进行中</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-cny"></i></div></div><div class="stat-value amount large" style="color:var(--primary);">¥${mockData.purchases.reduce((s,p)=>s+p.amount,0)/10000}万</div><div class="stat-label">采购总金额</div></div>
        </div>
        <div class="card"><div class="card-header"><h3><i class="fa fa-shopping-cart" style="color:var(--primary);margin-right:8px;"></i>采购列表</h3></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>采购编号</th><th>名称</th><th>类别</th><th>金额</th><th>数量</th><th>供应商</th><th>申请人</th><th>审批流程</th><th>状态</th><th>操作</th></tr></thead><tbody>${mockData.purchases.map(p => {const statusTag=p.status==='已入库'?'tag-success':p.status==='采购中'?'tag-info':'tag-warning'; const steps=p.flow.map(f=>f.done?'flow-step done':'flow-step'+(p.flow.findIndex(x=>!x.done)===p.flow.indexOf(f)?' active':'')).map((cls,i)=>`<span class="${cls}">${p.flow[i].step}</span>`).join('<span class="flow-arrow">→</span>'); return `<tr><td class="fw-600 fs-12">${p.id}</td><td class="fw-600">${p.title}</td><td><span class="tag tag-gray">${p.category}</span></td><td class="fw-700 amount primary">¥${p.amount.toLocaleString()}</td><td>${p.qty}${p.unit}</td><td class="fs-12">${p.vendor}</td><td>${p.applicant}</td><td><div class="flow-steps">${steps}</div></td><td><span class="tag ${statusTag}">${p.status}</span></td><td>${p.status==='待审批'?`<button class="btn btn-success btn-xs" onclick="approvePurchase('${p.id}')"><i class="fa fa-check"></i></button>`:''}<button class="btn btn-danger btn-xs" onclick="deletePurchase('${p.id}')"><i class="fa fa-trash"></i></button></td></tr>`;}).join('')}</tbody></table></div></div></div>`;
}

/* ============================================
 * 客户管理
 * ============================================ */
let currentCustomerTab = 'archive';
let currentCustomerFilter = { level: '', lifecycle: '', keyword: '' };

function renderCustomers(c) {
    const cust = mockData.customers;
    const lvls = mockData.customerLevels;
    const lc = mockData.customerLifecycle;
    const lvMap = {}; lvls.forEach(l => lvMap[l.level] = l);
    const lcMap = {}; lc.forEach(l => lcMap[l.stage] = l);
    const totalDeal = cust.reduce((s,cu) => s + cu.dealAmount, 0);
    const totalVisits = cust.reduce((s,cu) => s + cu.visits, 0);
    // 统计各级别数量
    const levelCounts = {}; lvls.forEach(l => levelCounts[l.level] = cust.filter(cu => cu.level === l.level).length);
    // 统计各生命周期数量
    const lcCounts = {}; lc.forEach(l => lcCounts[l.stage] = cust.filter(cu => cu.lifecycle === l.stage).length);

    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>客户管理</h2><p>分级管理客户档案，深耕客户关系，明确客户级别与服务标准</p></div><div class="flex gap-8"><button class="btn btn-outline" onclick="showNewCustomerForm()"><i class="fa fa-user-plus"></i> 新增客户</button><button class="btn btn-primary" onclick="switchCustomerTab('levelMgmt')"><i class="fa fa-star"></i> 分级管理</button></div></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-users"></i></div></div><div class="stat-value">${cust.length}</div><div class="stat-label">客户总数</div><div class="stat-trend up"><i class="fa fa-arrow-up"></i> 本月新增${cust.filter(cu=>cu.createDate&&cu.createDate.startsWith('2026-07')).length}</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-star"></i></div></div><div class="stat-value">${cust.filter(cu=>cu.level==='S').length}</div><div class="stat-label">战略(S)级</div><div class="stat-trend" style="color:var(--purple);"><i class="fa fa-diamond"></i> 核心资源</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-handshake-o"></i></div></div><div class="stat-value">${moneyFmt(totalDeal)}</div><div class="stat-label">累计成交</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-car"></i></div></div><div class="stat-value">${totalVisits}</div><div class="stat-label">累计拜访</div><div class="stat-trend up"><i class="fa fa-arrow-up"></i> 本周${cust.reduce((s,cu)=>s+(cu.followUps.filter(f=>f.date.startsWith('2026-07-2')).length),0)}次</div></div>
        </div>
        <div class="tab-bar" id="customerTabs">
            <button class="tab-item ${currentCustomerTab==='archive'?'active':''}" onclick="switchCustomerTab('archive')"><i class="fa fa-address-card-o"></i> 客户档案</button>
            <button class="tab-item ${currentCustomerTab==='levelMgmt'?'active':''}" onclick="switchCustomerTab('levelMgmt')"><i class="fa fa-star"></i> 分级管理</button>
            <button class="tab-item ${currentCustomerTab==='lifecycle'?'active':''}" onclick="switchCustomerTab('lifecycle')"><i class="fa fa-random"></i> 生命周期</button>
            <button class="tab-item ${currentCustomerTab==='followUp'?'active':''}" onclick="switchCustomerTab('followUp')"><i class="fa fa-comments-o"></i> 跟进记录</button>
        </div>
        <div id="customerTabContent"></div>`;
    renderCustomerTabContent();
}

function switchCustomerTab(tab) {
    currentCustomerTab = tab;
    $$('#customerTabs .tab-item').forEach(t => t.classList.toggle('active', t.textContent.includes(tab==='archive'?'档案':tab==='levelMgmt'?'分级':tab==='lifecycle'?'生命':'跟进')));
    renderCustomerTabContent();
}

function renderCustomerTabContent() {
    const cust = mockData.customers;
    const lvls = mockData.customerLevels;
    const lc = mockData.customerLifecycle;
    const lvMap = {}; lvls.forEach(l => lvMap[l.level] = l);
    const lcMap = {}; lc.forEach(l => lcMap[l.stage] = l);
    const tc = $('#customerTabContent');
    if (!tc) return;

    if (currentCustomerTab === 'archive') {
        // 筛选后的客户列表
        let filtered = cust;
        if (currentCustomerFilter.level) filtered = filtered.filter(cu => cu.level === currentCustomerFilter.level);
        if (currentCustomerFilter.lifecycle) filtered = filtered.filter(cu => cu.lifecycle === currentCustomerFilter.lifecycle);
        if (currentCustomerFilter.keyword) filtered = filtered.filter(cu => cu.name.includes(currentCustomerFilter.keyword) || cu.shortName.includes(currentCustomerFilter.keyword) || cu.contact.includes(currentCustomerFilter.keyword));
        tc.innerHTML = `
        <div class="card"><div class="card-header"><h3><i class="fa fa-address-card-o" style="color:var(--primary);margin-right:8px;"></i>客户档案</h3>
            <div class="flex gap-8" style="flex-wrap:wrap;">
                <select id="filterCustomerLevel" onchange="currentCustomerFilter.level=this.value;renderCustomerTabContent();" style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
                    <option value="">全部级别</option>${lvls.map(l => `<option value="${l.level}" ${currentCustomerFilter.level===l.level?'selected':''}>${l.level}级 - ${l.name}</option>`).join('')}
                </select>
                <select id="filterCustomerLifecycle" onchange="currentCustomerFilter.lifecycle=this.value;renderCustomerTabContent();" style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
                    <option value="">全部阶段</option>${lc.map(l => `<option value="${l.stage}" ${currentCustomerFilter.lifecycle===l.stage?'selected':''}>${l.stage}</option>`).join('')}
                </select>
                <div class="input-wrap" style="width:200px;"><i class="fa fa-search"></i><input type="text" placeholder="搜索客户名称/联系人" value="${currentCustomerFilter.keyword}" oninput="currentCustomerFilter.keyword=this.value;renderCustomerTabContent();" style="padding:8px 14px 8px 36px;border:1px solid var(--border);border-radius:8px;width:100%;"></div>
            </div>
        </div>
        <div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>客户名称</th><th>等级</th><th>生命周期</th><th>状态</th><th>联系人</th><th>负责人</th><th>行业</th><th>区域</th><th>成交金额</th><th>满意度</th><th>操作</th></tr></thead><tbody>
        ${filtered.map(cu => {
            const lv = lvMap[cu.level] || { color:'#94a3b8', name:'未知' };
            const lcItem = lcMap[cu.lifecycle] || { color:'#94a3b8', icon:'question', stage:'未知' };
            const statusTag = cu.status==='合作中'?'tag-success':cu.status==='跟进中'?'tag-warning':cu.status==='续签中'||cu.status==='续签中'?'tag-info':cu.status==='谈判中'?'tag-primary':cu.status==='待开发'?'tag-gray':'tag-gray';
            const satDisplay = cu.satisfaction > 0 ? `<span style="color:${cu.satisfaction>=4.5?'#10b981':cu.satisfaction>=4?'#2563eb':cu.satisfaction>=3?'#f59e0b':'#ef4444'};">${cu.satisfaction}</span>` : '<span class="text-muted">—</span>';
            return `<tr><td class="fw-600"><div style="display:flex;align-items:center;gap:8px;"><div style="width:32px;height:32px;border-radius:8px;background:${lv.color}15;color:${lv.color};display:flex;align-items:center;justify-content:center;font-size:13px;"><i class="fa fa-building"></i></div><div><div class="fw-600 fs-14">${cu.shortName || cu.name}</div><div class="fs-12 text-muted">${cu.name.length>10?cu.name.substring(0,10)+'...':cu.name}</div></div></div></td>
            <td><span class="customer-level-badge" style="background:${lv.color};color:#fff;">${cu.level}</span><span class="fs-12" style="color:${lv.color};margin-left:4px;">${lv.name}</span></td>
            <td><span class="tag" style="background:${lcItem.color}15;color:${lcItem.color};border:1px solid ${lcItem.color}30;"><i class="fa fa-${lcItem.icon}" style="margin-right:4px;"></i>${cu.lifecycle}</span></td>
            <td><span class="tag ${statusTag}">${cu.status}</span></td>
            <td><div class="fw-600">${cu.contact}</div><div class="fs-12 text-muted">${cu.contactTitle}</div></td>
            <td>${cu.owner}</td><td>${cu.industry}</td><td>${cu.area}</td>
            <td class="fw-700 amount primary">${cu.dealAmount>0?moneyFmt(cu.dealAmount):'—'}</td>
            <td>${satDisplay}</td>
            <td><button class="btn btn-outline btn-sm" onclick="viewCustomerDetail(${cu.id})">详情</button><button class="btn btn-danger btn-sm" onclick="deleteCustomer(${cu.id})"><i class="fa fa-trash"></i></button></td></tr>`;
        }).join('')}
        </tbody></table></div></div></div>`;
    }
    else if (currentCustomerTab === 'levelMgmt') {
        // 分级管理视图 — 展示各级别定义及对应客户
        tc.innerHTML = `
        <div class="grid-2 mb-24">
            <div class="card"><div class="card-header"><h3><i class="fa fa-pie-chart" style="color:var(--primary);margin-right:8px;"></i>客户级别分布</h3></div><div class="card-body"><div class="chart-container-lg"><canvas id="customerLevelChart"></canvas></div></div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-bar-chart" style="color:var(--success);margin-right:8px;"></i>各级别成交金额</h3></div><div class="card-body"><div class="chart-container-lg"><canvas id="customerLevelDealChart"></canvas></div></div></div>
        </div>
        ${lvls.map(lv => {
            const lvCust = cust.filter(cu => cu.level === lv.level);
            const lvDeal = lvCust.reduce((s,cu) => s + cu.dealAmount, 0);
            return `<div class="card mb-16"><div class="card-header" style="border-left:4px solid ${lv.color};padding-left:16px;">
                <div style="display:flex;align-items:center;gap:12px;flex:1;">
                    <span class="customer-level-badge lg" style="background:${lv.color};color:#fff;">${lv.level}</span>
                    <div><h3 style="margin:0;font-size:16px;">${lv.name}</h3><p style="margin:0;font-size:12px;color:var(--text-muted);">${lv.criteria}</p></div>
                </div>
                <div class="flex gap-8" style="font-size:13px;">
                    <span class="tag" style="background:${lv.color}15;color:${lv.color};">${lvCust.length}家</span>
                    <span class="tag tag-primary">${lvDeal>0?moneyFmt(lvDeal):'暂无成交'}</span>
                </div>
            </div>
            <div class="card-body" style="padding:0 20px;">
                <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-light);font-size:12px;color:var(--text-muted);">
                    <span style="width:30px;">编号</span><span style="width:120px;">客户名称</span><span style="width:60px;">生命周期</span><span style="width:50px;">满意度</span><span style="width:80px;">负责人</span><span style="width:80px;">成交金额</span><span>拜访间隔 ≤${lv.maxVisitInterval}天</span>
                </div>
                ${lvCust.length === 0 ? '<div style="padding:16px;text-align:center;color:var(--text-muted);">暂无此级别客户</div>' :
                lvCust.map((cu,i) => {
                    const lcItem = lcMap[cu.lifecycle] || { color:'#94a3b8', icon:'question' };
                    const daysSinceVisit = cu.lastVisit !== '—' ? Math.floor((new Date() - new Date(cu.lastVisit)) / 86400000) : '—';
                    const visitWarn = typeof daysSinceVisit === 'number' && daysSinceVisit > lv.maxVisitInterval;
                    return `<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-light);font-size:13px;align-items:center;">
                        <span style="width:30px;color:var(--text-muted);">${cu.id}</span>
                        <span style="width:120px;" class="fw-600">${cu.shortName || cu.name}</span>
                        <span style="width:60px;"><span class="tag tag-xs" style="background:${lcItem.color}15;color:${lcItem.color};">${cu.lifecycle}</span></span>
                        <span style="width:50px;color:${cu.satisfaction>=4.5?'#10b981':cu.satisfaction>=4?'#2563eb':'#f59e0b'};">${cu.satisfaction>0?cu.satisfaction:'—'}</span>
                        <span style="width:80px;">${cu.owner}</span>
                        <span style="width:80px;" class="fw-700 amount primary">${cu.dealAmount>0?moneyFmt(cu.dealAmount):'—'}</span>
                        <span style="${visitWarn?'color:var(--danger);font-weight:600;':''}">${cu.lastVisit !== '—' ? daysSinceVisit+'天前' : '—'}${visitWarn?' ⚠️超期':''}</span>
                    </div>`;
                }).join('')}
                <div style="padding:12px 0;font-size:12px;color:var(--text-muted);"><i class="fa fa-shield" style="color:${lv.color};margin-right:4px;"></i><strong>服务权益：</strong>${lv.privilege}</div>
            </div></div>`;
        }).join('')}`;
        setTimeout(() => {
            const ctx1 = $('#customerLevelChart');
            if (ctx1) charts.customerLevel = new Chart(ctx1, { type: 'doughnut', data: { labels: lvls.map(l => `${l.level}级-${l.name}`), datasets: [{ data: lvls.map(l => cust.filter(cu => cu.level === l.level).length), backgroundColor: lvls.map(l => l.color), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { usePointStyle: true, padding: 16 } } }, cutout: '55%' } });
            const ctx2 = $('#customerLevelDealChart');
            if (ctx2) charts.customerLevelDeal = new Chart(ctx2, { type: 'bar', data: { labels: lvls.map(l => `${l.level}级`), datasets: [{ label: '成交金额(万)', data: lvls.map(l => cust.filter(cu => cu.level === l.level).reduce((s,cu) => s + cu.dealAmount, 0) / 10000), backgroundColor: lvls.map(l => l.color + '80'), borderColor: lvls.map(l => l.color), borderWidth: 2, borderRadius: 8, barThickness: 32 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } } });
        }, 100);
    }
    else if (currentCustomerTab === 'lifecycle') {
        // 生命周期视图
        tc.innerHTML = `
        <div class="card mb-24"><div class="card-header"><h3><i class="fa fa-random" style="color:var(--primary);margin-right:8px;"></i>客户生命周期漏斗</h3></div><div class="card-body">
            <div style="display:flex;flex-direction:column;gap:8px;">
            ${lc.map(l => {
                const count = cust.filter(cu => cu.lifecycle === l.stage).length;
                const pct = count / cust.length * 100;
                return `<div style="display:flex;align-items:center;gap:12px;padding:6px 0;">
                    <div style="width:40px;height:40px;border-radius:10px;background:${l.color}15;color:${l.color};display:flex;align-items:center;justify-content:center;"><i class="fa fa-${l.icon}"></i></div>
                    <span class="fw-600" style="width:70px;">${l.stage}</span>
                    <span class="fs-12 text-muted" style="width:140px;">${l.desc}</span>
                    <div style="flex:1;height:32px;background:${l.color}10;border-radius:8px;overflow:hidden;"><div style="height:100%;width:${Math.max(pct,5)}%;background:${l.color};border-radius:8px;display:flex;align-items:center;padding-left:10px;color:#fff;font-size:13px;font-weight:600;">${count}家</div></div>
                    <span class="fs-13 fw-600" style="color:${l.color};">${pct.toFixed(0)}%</span>
                </div>`;
            }).join('')}
            </div>
        </div></div>
        ${lc.map(l => {
            const lcCust = cust.filter(cu => cu.lifecycle === l.stage);
            if (lcCust.length === 0) return '';
            return `<div class="card mb-16"><div class="card-header" style="border-left:4px solid ${l.color};padding-left:16px;">
                <div style="display:flex;align-items:center;gap:8px;"><i class="fa fa-${l.icon}" style="color:${l.color};"></i><h3 style="margin:0;">${l.stage}阶段客户</h3><span class="tag" style="background:${l.color}15;color:${l.color};">${lcCust.length}家</span></div>
            </div><div class="card-body" style="padding:8px 20px;">
            ${lcCust.map(cu => `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light);">
                <span class="customer-level-badge" style="background:${(lvMap[cu.level]||{color:'#94a3b8'}).color};color:#fff;">${cu.level}</span>
                <div style="flex:1;"><span class="fw-600">${cu.shortName || cu.name}</span><span class="fs-12 text-muted" style="margin-left:8px;">${cu.industry} · ${cu.area}</span></div>
                <span class="fs-12 text-muted">负责人：${cu.owner}</span>
                <span class="fw-700 amount primary">${cu.dealAmount>0?moneyFmt(cu.dealAmount):'—'}</span>
                <button class="btn btn-outline btn-sm" onclick="viewCustomerDetail(${cu.id})">详情</button><button class="btn btn-danger btn-sm" onclick="deleteCustomer(${cu.id})"><i class="fa fa-trash"></i></button>
            </div>`).join('')}
            </div></div>`;
        }).join('')}`;
    }
    else if (currentCustomerTab === 'followUp') {
        // 跟进记录视图
        const allFollowUps = cust.flatMap(cu => cu.followUps.map(f => ({ ...f, customerId: cu.id, customerName: cu.shortName || cu.name, customerLevel: cu.level })));
        const sortedFollowUps = allFollowUps.sort((a,b) => b.date.localeCompare(a.date));
        tc.innerHTML = `
        <div class="card mb-24"><div class="card-header"><h3><i class="fa fa-comments-o" style="color:var(--primary);margin-right:8px;"></i>最近跟进记录</h3><div class="flex gap-8"><span class="tag tag-primary">${allFollowUps.length}条记录</span></div></div>
        <div class="card-body" style="padding:8px 20px;">
        ${sortedFollowUps.slice(0, 30).map(f => {
            const lv = lvMap[f.customerLevel] || { color:'#94a3b8' };
            const typeIcon = f.type==='拜访'?'car':f.type==='电话'?'phone':f.type==='会议'?'group':'comment';
            const typeColor = f.type==='拜访'?'#10b981':f.type==='电话'?'#2563eb':f.type==='会议'?'#8b5cf6':'#f59e0b';
            return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-light);">
                <div style="width:36px;height:36px;border-radius:8px;background:${typeColor}15;color:${typeColor};display:flex;align-items:center;justify-content:center;"><i class="fa fa-${typeIcon}"></i></div>
                <div style="flex:1;">
                    <div style="display:flex;align-items:center;gap:8px;"><span class="fw-600">${f.customerName}</span><span class="customer-level-badge" style="background:${lv.color};color:#fff;">${f.customerLevel}</span><span class="tag tag-xs" style="background:${typeColor}15;color:${typeColor};">${f.type}</span><span class="fs-12 text-muted">${f.date}</span></div>
                    <div style="font-size:13px;margin-top:4px;color:var(--text-secondary);">${f.content}</div>
                    <div class="fs-12 text-muted" style="margin-top:2px;">${f.operator}</div>
                </div>
                <button class="btn btn-outline btn-xs" onclick="viewCustomerDetail(${f.customerId})">查看客户</button>
            </div>`;
        }).join('')}
        </div></div>`;
    }
}

function showNewCustomerForm() {
    const lvls = mockData.customerLevels;
    const lc = mockData.customerLifecycle;
    $('#customerModalTitle').textContent = '新增客户';
    $('#customerModalBody').innerHTML = `
        <div class="form-field"><label>客户名称 <span class="text-danger">*</span></label><input type="text" id="newCustName" placeholder="请输入客户全称" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
        <div class="grid-2">
            <div class="form-field"><label>简称</label><input type="text" id="newCustShortName" placeholder="客户简称" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
            <div class="form-field"><label>行业</label><input type="text" id="newCustIndustry" placeholder="所属行业" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>联系人 <span class="text-danger">*</span></label><input type="text" id="newCustContact" placeholder="联系人姓名" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
            <div class="form-field"><label>联系人职位</label><input type="text" id="newCustContactTitle" placeholder="如：总经理、采购总监" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>电话 <span class="text-danger">*</span></label><input type="text" id="newCustPhone" placeholder="联系电话" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
            <div class="form-field"><label>邮箱</label><input type="text" id="newCustEmail" placeholder="电子邮箱" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>区域</label><input type="text" id="newCustArea" placeholder="所在区域" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
            <div class="form-field"><label>地址</label><input type="text" id="newCustAddress" placeholder="详细地址" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>客户来源</label><select id="newCustSource" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"><option value="线上咨询">线上咨询</option><option value="行业展会">行业展会</option><option value="客户推荐">客户推荐</option><option value="政府引荐">政府引荐</option><option value="战略合作">战略合作</option><option value="招标渠道">招标渠道</option><option value="行业协会">行业协会</option><option value="网络推广">网络推广</option></select></div>
            <div class="form-field"><label>负责人</label><input type="text" id="newCustOwner" placeholder="负责销售员" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>客户级别 <span class="text-danger">*</span></label><select id="newCustLevel" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">${lvls.map(l => `<option value="${l.level}">${l.level}级 - ${l.name} (${l.criteria})</option>`).join('')}</select></div>
            <div class="form-field"><label>生命周期阶段</label><select id="newCustLifecycle" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">${lc.map(l => `<option value="${l.stage}">${l.stage} - ${l.desc}</option>`).join('')}</select></div>
        </div>
        <div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;">
            <button class="btn btn-outline" onclick="closeModal('customerModal')">取消</button>
            <button class="btn btn-primary" onclick="addNewCustomer()"><i class="fa fa-plus"></i> 确认添加</button>
        </div>`;
    openModal('customerModal');
}

async function addNewCustomer() {
    const name = $('#newCustName').value.trim();
    const contact = $('#newCustContact').value.trim();
    const phone = $('#newCustPhone').value.trim();
    const level = $('#newCustLevel').value;
    if (!name || !contact || !phone) { showToast('请填写必填项（客户名称、联系人、电话）', 'warning'); return; }
    const newCust = {
        id: mockData.customers.length + 1,
        name, shortName: $('#newCustShortName').value.trim() || name,
        contact, contactTitle: $('#newCustContactTitle').value.trim() || '联系人',
        phone, email: $('#newCustEmail').value.trim() || '',
        address: $('#newCustAddress').value.trim() || '',
        level, lifecycle: $('#newCustLifecycle').value || '潜客',
        status: '待开发', industry: $('#newCustIndustry').value.trim() || '未知',
        area: $('#newCustArea').value.trim() || '', source: $('#newCustSource').value || '线上咨询',
        owner: $('#newCustOwner').value.trim() || '待分配',
        creditRating: '未评估', satisfaction: 0, contractCount: 0,
        lastVisit: '—', dealAmount: 0, visits: 0,
        createDate: new Date().toISOString().slice(0,10),
        tags: ['新增'], followUps: []
    };
    const r = await API.addCustomer(newCust);
    if (!r.success) { showToast(r.message || '添加失败', 'error'); return; }
    closeModal('customerModal');
    showToast(`客户「${newCust.shortName}」添加成功，级别为${newCust.level}级`, 'success');
    renderCustomers($('#viewContainer'));
}

function viewCustomerDetail(id) {
    const cu = mockData.customers.find(x => x.id === id);
    if (!cu) return;
    const lvls = mockData.customerLevels;
    const lc = mockData.customerLifecycle;
    const lv = lvls.find(l => l.level === cu.level) || { color:'#94a3b8', name:'未知', criteria:'无', maxVisitInterval:999, privilege:'标准服务' };
    const lcItem = lc.find(l => l.stage === cu.lifecycle) || { color:'#94a3b8', icon:'question', stage:'未知', desc:'' };
    const creditColors = { '优秀':'#10b981', '良好':'#2563eb', '一般':'#f59e0b', '待评估':'#94a3b8', '未评估':'#94a3b8' };
    const creditColor = creditColors[cu.creditRating] || '#94a3b8';
    // 判断是否可以升级
    const currentLevelIdx = lvls.findIndex(l => l.level === cu.level);
    const canUpgrade = currentLevelIdx > 0;
    const canDowngrade = currentLevelIdx < lvls.length - 1;
    $('#customerModalTitle').textContent = cu.name;
    $('#customerModalBody').innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:20px;">
            <div style="width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,${lv.color},${lv.color}80);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;">${cu.level}</div>
            <div style="flex:1;"><h3 class="fw-700">${cu.name}</h3><div class="flex gap-8 mt-8">
                <span class="customer-level-badge" style="background:${lv.color};color:#fff;">${cu.level}级 · ${lv.name}</span>
                <span class="tag" style="background:${lcItem.color}15;color:${lcItem.color};border:1px solid ${lcItem.color}30;"><i class="fa fa-${lcItem.icon}" style="margin-right:4px;"></i>${cu.lifecycle}</span>
                <span class="tag ${cu.status==='合作中'?'tag-success':cu.status==='跟进中'?'tag-warning':'tag-gray'}">${cu.status}</span>
                <span class="tag" style="background:${creditColor}15;color:${creditColor};">信用:${cu.creditRating}</span>
            </div><div class="fs-12 text-muted mt-4">${lv.criteria}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
            <div class="form-field"><label class="fs-12 text-muted"><i class="fa fa-user" style="margin-right:4px;"></i>联系人</label><div class="fw-600">${cu.contact} · ${cu.contactTitle}</div></div>
            <div class="form-field"><label class="fs-12 text-muted"><i class="fa fa-phone" style="margin-right:4px;"></i>电话</label><div class="fw-600">${cu.phone}</div></div>
            <div class="form-field"><label class="fs-12 text-muted"><i class="fa fa-envelope-o" style="margin-right:4px;"></i>邮箱</label><div>${cu.email || '—'}</div></div>
            <div class="form-field"><label class="fs-12 text-muted"><i class="fa fa-map-marker" style="margin-right:4px;"></i>地址</label><div style="font-size:13px;">${cu.area} · ${cu.address || '—'}</div></div>
            <div class="form-field"><label class="fs-12 text-muted"><i class="fa fa-tag" style="margin-right:4px;"></i>行业</label><div>${cu.industry}</div></div>
            <div class="form-field"><label class="fs-12 text-muted"><i class="fa fa-link" style="margin-right:4px;"></i>来源</label><div>${cu.source}</div></div>
            <div class="form-field"><label class="fs-12 text-muted"><i class="fa fa-user-circle-o" style="margin-right:4px;"></i>负责人</label><div class="fw-600">${cu.owner}</div></div>
            <div class="form-field"><label class="fs-12 text-muted"><i class="fa fa-calendar" style="margin-right:4px;"></i>建档日期</label><div>${cu.createDate}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px;background:var(--bg-hover);border-radius:12px;padding:16px;">
            <div style="text-align:center;"><div class="fw-700 amount large" style="color:var(--primary);">${cu.dealAmount>0?moneyFmt(cu.dealAmount):'—'}</div><div class="fs-12 text-muted">成交金额</div></div>
            <div style="text-align:center;"><div class="fw-700" style="color:var(--success);">${cu.visits}次</div><div class="fs-12 text-muted">拜访次数</div></div>
            <div style="text-align:center;"><div class="fw-700" style="color:${cu.satisfaction>=4.5?'#10b981':cu.satisfaction>=4?'#2563eb':'#f59e0b'};">${cu.satisfaction>0?cu.satisfaction+'分':'—'}</div><div class="fs-12 text-muted">满意度</div></div>
            <div style="text-align:center;"><div class="fw-700">${cu.contractCount}份</div><div class="fs-12 text-muted">合同数</div></div>
        </div>
        ${cu.tags.length > 0 ? `<div style="margin-bottom:16px;"><label class="fs-12 text-muted">客户标签</label><div class="flex gap-8 mt-4" style="flex-wrap:wrap;">${cu.tags.map(t => `<span class="tag" style="background:var(--primary)10;color:var(--primary);border:1px solid var(--primary)30;"><i class="fa fa-tag" style="margin-right:2px;font-size:10px;"></i>${t}</span>`).join('')}</div></div>` : ''}
        <div style="margin-bottom:16px;"><label class="fs-12 text-muted"><i class="fa fa-shield" style="color:${lv.color};margin-right:4px;"></i>服务权益 (${lv.name})</label><div class="fs-13 mt-4" style="padding:8px 12px;background:${lv.color}08;border-radius:8px;border:1px solid ${lv.color}20;">${lv.privilege}</div></div>
        ${cu.followUps.length > 0 ? `<div style="margin-bottom:16px;"><label class="fs-12 text-muted"><i class="fa fa-comments-o" style="margin-right:4px;"></i>跟进记录 (${cu.followUps.length}条)</label>
            <div style="max-height:200px;overflow-y:auto;margin-top:8px;">
            ${cu.followUps.map(f => {
                const typeIcon = f.type==='拜访'?'car':f.type==='电话'?'phone':f.type==='会议'?'group':'comment';
                const typeColor = f.type==='拜访'?'#10b981':f.type==='电话'?'#2563eb':f.type==='会议'?'#8b5cf6':'#f59e0b';
                return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light);">
                    <div style="width:28px;height:28px;border-radius:6px;background:${typeColor}15;color:${typeColor};display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa fa-${typeIcon}"></i></div>
                    <div style="flex:1;"><div style="display:flex;align-items:center;gap:6px;"><span class="fw-600 fs-13">${f.type}</span><span class="fs-12 text-muted">${f.date}</span><span class="fs-12 text-muted">${f.operator}</span></div><div class="fs-13 text-secondary" style="margin-top:2px;">${f.content}</div></div>
                </div>`;
            }).join('')}
            </div></div>` : ''}
        <div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;">
            ${canUpgrade ? `<button class="btn btn-sm" style="background:var(--success);color:#fff;" onclick="upgradeCustomerLevel(${cu.id})"><i class="fa fa-arrow-up"></i> 升级</button>` : ''}
            ${canDowngrade ? `<button class="btn btn-sm" style="background:var(--danger);color:#fff;" onclick="downgradeCustomerLevel(${cu.id})"><i class="fa fa-arrow-down"></i> 降级</button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="addCustomerFollowup(${cu.id})"><i class="fa fa-plus"></i> 添加跟进</button>
            <button class="btn btn-outline" onclick="closeModal('customerModal')">关闭</button>
        </div>`;
    openModal('customerModal');
}

function upgradeCustomerLevel(id) {
    const cu = mockData.customers.find(x => x.id === id);
    const lvls = mockData.customerLevels;
    const idx = lvls.findIndex(l => l.level === cu.level);
    if (idx > 0) {
        cu.level = lvls[idx - 1].level;
        showToast(`客户「${cu.shortName}」已升级为 ${cu.level}级(${lvls[idx-1].name})`, 'success');
        closeModal('customerModal');
        viewCustomerDetail(id);
    }
}

function downgradeCustomerLevel(id) {
    const cu = mockData.customers.find(x => x.id === id);
    const lvls = mockData.customerLevels;
    const idx = lvls.findIndex(l => l.level === cu.level);
    if (idx < lvls.length - 1) {
        cu.level = lvls[idx + 1].level;
        showToast(`客户「${cu.shortName}」已降级为 ${cu.level}级(${lvls[idx+1].name})`, 'warning');
        closeModal('customerModal');
        viewCustomerDetail(id);
    }
}

/* ============================================
 * 销售统计
 * ============================================ */
function renderSales(c) {
    const s = mockData.sales;
    c.innerHTML = `
        <div class="page-header"><h2>销售数据统计</h2><p>深度分析销售数据，洞察业务增长机会</p></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-cny"></i></div></div><div class="stat-value amount large" style="color:var(--primary);">¥${(s.thisMonth.revenue/10000).toFixed(0)}万</div><div class="stat-label">本月销售额</div><div class="stat-trend up"><i class="fa fa-arrow-up"></i> 完成率 ${s.thisMonth.rate}%</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-handshake-o"></i></div></div><div class="stat-value">${s.thisMonth.deals}</div><div class="stat-label">成交单数</div><div class="stat-trend up"><i class="fa fa-arrow-up"></i> 均单 ¥${(s.thisMonth.avgDeal/10000).toFixed(1)}万</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-filter"></i></div></div><div class="stat-value">${s.pipeline.leads}</div><div class="stat-label">线索总数</div><div class="stat-trend" style="color:var(--warning);"><i class="fa fa-arrow-right"></i> 商机${s.pipeline.qualified}个</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-trophy"></i></div></div><div class="stat-value">${s.funnelRates.neg2close}<span class="fs-16 text-muted">%</span></div><div class="stat-label">谈判→成交率</div><div class="stat-trend up"><i class="fa fa-arrow-up"></i> 同比+5%</div></div>
        </div>
        <div class="grid-2 mb-24">
            <div class="card"><div class="card-header"><h3><i class="fa fa-line-chart" style="color:var(--primary);margin-right:8px;"></i>月度销售额趋势</h3></div><div class="card-body"><div class="chart-container-lg"><canvas id="salesRevenueChart"></canvas></div></div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-pie-chart" style="color:var(--success);margin-right:8px;"></i>产品营收占比</h3></div><div class="card-body"><div class="chart-container-lg"><canvas id="salesProductChart"></canvas></div></div></div>
        </div>
        <div class="grid-2 mb-24">
            <div class="card"><div class="card-header"><h3><i class="fa fa-filter" style="color:var(--warning);margin-right:8px;"></i>销售漏斗</h3></div><div class="card-body">
                <div style="display:flex;flex-direction:column;gap:6px;">
                    ${[{label:'线索',val:s.pipeline.leads,color:'#94a3b8',rate:'—'},{label:'合格商机',val:s.pipeline.qualified,color:'#f59e0b',rate:s.funnelRates.lead2qual+'%'},{label:'方案提交',val:s.pipeline.proposal,color:'#8b5cf6',rate:s.funnelRates.qual2prop+'%'},{label:'谈判中',val:s.pipeline.negotiation,color:'#2563eb',rate:s.funnelRates.prop2neg+'%'},{label:'已成交',val:s.pipeline.closed,color:'#10b981',rate:s.funnelRates.neg2close+'%'}].map(f => `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;"><span class="fw-600 fs-13" style="width:80px;">${f.label}</span><div style="flex:1;height:28px;background:${f.color}20;border-radius:6px;overflow:hidden;"><div style="height:100%;width:${f.val/s.pipeline.leads*100}%;background:${f.color};border-radius:6px;display:flex;align-items:center;padding-left:8px;color:#fff;font-size:12px;font-weight:600;">${f.val}</div></div><span class="fs-12 text-muted" style="width:60px;">转化${f.rate}</span></div>`).join('')}
                </div>
            </div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-trophy" style="color:var(--warning);margin-right:8px;"></i>销售业绩排行</h3></div><div class="card-body" style="padding:8px 20px;">
                ${s.topPerformers.map((p,i) => `<div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--border-light);"><div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;${i<3?'background:#f59e0b20;color:#f59e0b;':'background:var(--bg-hover);color:var(--text-muted);'}">${i+1}</div><div style="width:32px;height:32px;border-radius:50%;background:${p.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;">${p.avatar}</div><div style="flex:1;"><div class="fw-600">${p.name}</div><div class="fs-12 text-muted">${p.deals}单成交</div></div><div class="text-right"><div class="fw-700" style="color:var(--primary);">¥${p.revenue}万</div><div class="fs-12 text-muted">完成率${p.targetRate}%</div></div></div>`).join('')}
            </div></div>
        </div>`;
    setTimeout(() => {
        const ctx1=$('#salesRevenueChart'); if(ctx1) charts.salesRevenue=new Chart(ctx1,{type:'bar',data:{labels:s.monthlyRevenue.labels,datasets:[{label:'销售额(万)',data:s.monthlyRevenue.data,backgroundColor:'#2563eb',borderRadius:8,barThickness:24}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'}},x:{grid:{display:false}}}}});
        const ctx2=$('#salesProductChart'); if(ctx2) charts.salesProduct=new Chart(ctx2,{type:'doughnut',data:{labels:s.productRevenue.labels,datasets:[{data:s.productRevenue.data,backgroundColor:['#2563eb','#8b5cf6','#10b981','#f59e0b','#94a3b8'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{usePointStyle:true}}},cutout:'60%'}});
    },100);
}

/* ============================================
 * 人事管理
 * ============================================ */
function renderHR(c) {
    const hs = mockData.hrStats;
    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>人事管理</h2><p>全方位员工档案管理，智能人事数据分析</p></div><div class="flex gap-8"><button class="btn btn-outline" onclick="showNewEmployeeForm()"><i class="fa fa-user-plus"></i> 入职办理</button><button class="btn btn-primary" onclick="showNewEmployeeForm()"><i class="fa fa-plus"></i> 新增员工</button></div></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-users"></i></div></div><div class="stat-value">${hs.total}</div><div class="stat-label">员工总数</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-user"></i></div></div><div class="stat-value">${hs.active}</div><div class="stat-label">在职人数</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-user-plus"></i></div></div><div class="stat-value">${hs.newHires}</div><div class="stat-label">本月入职</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-line-chart"></i></div></div><div class="stat-value">${hs.turnoverRate}<span class="fs-16 text-muted">%</span></div><div class="stat-label">离职率</div><div class="stat-trend down" style="color:var(--success);"><i class="fa fa-arrow-down"></i> 较去年↓</div></div>
        </div>
        <div class="card"><div class="card-header"><h3><i class="fa fa-address-book-o" style="color:var(--primary);margin-right:8px;"></i>员工档案</h3><div class="flex gap-8"><div class="input-wrap" style="width:200px;"><i class="fa fa-search"></i><input type="text" placeholder="搜索员工" style="padding:8px 14px 8px 36px;border:1px solid var(--border);border-radius:8px;width:100%;"></div></div></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>工号</th><th>姓名</th><th>部门</th><th>职位</th><th>职级</th><th>学历</th><th>入职日期</th><th>状态</th><th>操作</th></tr></thead><tbody>${mockData.hrEmployees.map(e => {const statusTag=e.status==='在职'?'tag-success':e.status==='试用期'?'tag-warning':e.status==='请假'?'tag-info':'tag-gray'; return `<tr><td class="fw-600 fs-12">${e.id}</td><td class="fw-600">${e.name}</td><td>${e.dept}</td><td>${e.role}</td><td><span class="tag tag-primary">${e.level}</span></td><td>${e.education}</td><td>${e.joinDate}</td><td><span class="tag ${statusTag}">${e.status}</span></td><td><button class="btn btn-outline btn-sm" onclick="showNewEmployeeForm('${e.id}')">编辑</button><button class="btn btn-danger btn-sm" onclick="deleteEmployee('${e.id}')"><i class="fa fa-trash"></i></button></td></tr>`;}).join('')}</tbody></table></div></div></div>`;
}

/* ============================================
 * 部门管理
 * ============================================ */
function renderDepartment(c) {
    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>部门管理</h2><p>组织架构管理，灵活配置部门体系</p></div><button class="btn btn-primary" onclick="showNewDeptForm()"><i class="fa fa-plus"></i> 新增部门</button></div>
        <div class="grid-2-1">
            <div class="card"><div class="card-header"><h3><i class="fa fa-sitemap" style="color:var(--primary);margin-right:8px;"></i>组织架构</h3></div><div class="card-body">
                <div class="dept-tree">
                    ${mockData.departments.map(d => `<div class="dept-node expanded"><div class="dept-icon" style="background:${d.color};"><i class="fa fa-${d.icon}"></i></div><div style="flex:1;"><div class="dept-name">${d.name}</div><div class="dept-count">${d.count}人 · 负责人：${d.head}</div></div><button class="btn btn-danger btn-sm" onclick="deleteDept(${d.id})"><i class="fa fa-trash"></i></button></div>${d.children.length?`<div class="dept-children">${d.children.map(ch=>`<div class="dept-node"><div class="dept-icon" style="background:${ch.color};"><i class="fa fa-users"></i></div><div style="flex:1;"><div class="dept-name">${ch.name}</div><div class="dept-count">${ch.count}人 · 负责人：${ch.head}</div></div><button class="btn btn-danger btn-xs" onclick="deleteDept(${ch.id})"><i class="fa fa-trash"></i></button></div>`).join('')}</div>`:''}`).join('')}
                </div>
            </div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-bar-chart" style="color:var(--success);margin-right:8px;"></i>部门人员分布</h3></div><div class="card-body"><div class="chart-container-lg"><canvas id="deptDistChart"></canvas></div></div></div>
        </div>`;
    setTimeout(() => { const ctx=$('#deptDistChart'); if(ctx) charts.deptDist=new Chart(ctx,{type:'doughnut',data:{labels:mockData.departments.map(d=>d.name),datasets:[{data:mockData.departments.map(d=>d.count),backgroundColor:mockData.departments.map(d=>d.color),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{usePointStyle:true}}},cutout:'55%'}}); },100);
}

/* ============================================
 * 团队管理
 * ============================================ */
function renderTeam(c) { c.innerHTML=`<div class="page-header flex-between"><div><h2>团队管理</h2><p>管理团队成员，查看考勤和工作状态</p></div><button class="btn btn-primary" onclick="showToast('新增成员功能演示中','info')"><i class="fa fa-user-plus"></i> 添加成员</button></div><div class="stats-grid"><div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-users"></i></div></div><div class="stat-value">${mockData.teamMembers.length}</div><div class="stat-label">团队总人数</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-circle"></i></div></div><div class="stat-value">${mockData.teamMembers.filter(m=>m.status==='在线').length}</div><div class="stat-label">在线</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-map-marker"></i></div></div><div class="stat-value">${mockData.teamMembers.filter(m=>m.status==='外勤中').length}</div><div class="stat-label">外勤中</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-file-text-o"></i></div></div><div class="stat-value">${mockData.teamMembers.filter(m=>m.todayReports>0).length}</div><div class="stat-label">今日已汇报</div></div></div><div class="card"><div class="card-header"><h3><i class="fa fa-users" style="color:var(--primary);margin-right:8px;"></i>团队成员</h3></div><div class="card-body"><div class="grid-3">${mockData.teamMembers.map(m=>{const statusColor=m.status==='在线'?'var(--success)':m.status==='外勤中'?'var(--warning)':m.status==='请假'?'var(--info)':'var(--text-muted)';const checkinTag=m.checkinStatus==='signed_in'?'<span class="tag tag-success">已签到</span>':'<span class="tag tag-danger">未签到</span>';return`<div style="border:1px solid var(--border-light);border-radius:var(--radius);padding:20px;transition:var(--transition);cursor:pointer;" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow='var(--shadow)'"><div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;"><div style="position:relative;"><div style="width:52px;height:52px;border-radius:50%;background:${m.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;">${m.avatar}</div><div style="position:absolute;bottom:0;right:0;width:14px;height:14px;border-radius:50%;background:${statusColor};border:2px solid #fff;"></div></div><div style="flex:1;"><div class="fw-700">${m.name}</div><div class="fs-12 text-muted">${m.role}</div></div></div><div style="display:flex;flex-direction:column;gap:8px;font-size:13px;"><div class="flex-between"><span class="text-muted">今日打卡</span>${checkinTag}</div><div class="flex-between"><span class="text-muted">本周出勤</span><span class="fw-600">${m.weekCheckins}/5天</span></div><div class="flex-between"><span class="text-muted">今日汇报</span>${m.todayReports>0?'<span class="tag tag-success">已提交</span>':'<span class="tag tag-gray">未提交</span>'}</div></div></div>`;}).join('')}</div></div></div>`; }

/* ============================================
 * 权限管理
 * ============================================ */
let currentPermTab = 'matrix';

function renderPermission(c) {
    const pm = mockData.permMatrix;
    const rd = pm.roleDetails;
    const pa = pm.permApprovals;
    const pl = pm.permLogs;
    const ds = pm.dataScope;
    const pendingCount = pa.filter(a => a.status === '待审批').length;

    c.innerHTML = `
        <div class="page-header flex-between"><div><h2>权限管理</h2><p>精细化角色权限配置，审批流程管理，保障系统安全合规</p></div><button class="btn btn-primary" onclick="showNewPermApplyForm()"><i class="fa fa-plus"></i> 申请权限</button></div>
        <div class="stats-grid">
            ${rd.map(r => `<div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:${r.color}15;color:${r.color};"><i class="fa fa-shield"></i></div></div><div class="stat-value">${r.users}</div><div class="stat-label">${r.name}</div><div class="fs-12 text-muted">${r.level} · ${r.scope}</div></div>`).join('')}
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon" style="background:#ef444415;color:#ef4444;"><i class="fa fa-bell"></i></div></div><div class="stat-value">${pendingCount}</div><div class="stat-label">待审批</div><div class="fs-12 text-muted">权限变更申请</div></div>
        </div>

        <div class="tab-bar mb-24" id="permTabBar">
            <button class="tab-item ${currentPermTab==='matrix'?'active':''}" onclick="switchPermTab('matrix')"><i class="fa fa-th"></i> 权限矩阵</button>
            <button class="tab-item ${currentPermTab==='roles'?'active':''}" onclick="switchPermTab('roles')"><i class="fa fa-users"></i> 角色管理</button>
            <button class="tab-item ${currentPermTab==='approval'?'active':''}" onclick="switchPermTab('approval')"><i class="fa fa-check-square-o"></i> 权限审批${pendingCount>0?`<span class="badge-danger">${pendingCount}</span>`:''}</button>
            <button class="tab-item ${currentPermTab==='logs'?'active':''}" onclick="switchPermTab('logs')"><i class="fa fa-history"></i> 变更日志</button>
            <button class="tab-item ${currentPermTab==='scope'?'active':''}" onclick="switchPermTab('scope')"><i class="fa fa-database"></i> 数据范围</button>
        </div>

        <div id="permTabContent"></div>`;

    renderPermTabContent();
}

function switchPermTab(tab) {
    currentPermTab = tab;
    const tabBar = document.getElementById('permTabBar');
    if (tabBar) {
        tabBar.querySelectorAll('.tab-item').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.includes(tab==='matrix'?'权限矩阵':tab==='roles'?'角色管理':tab==='approval'?'权限审批':tab==='logs'?'变更日志':'数据范围'));
        });
    }
    renderPermTabContent();
}

function renderPermTabContent() {
    const container = document.getElementById('permTabContent');
    if (!container) return;
    const pm = mockData.permMatrix;
    const rd = pm.roleDetails;
    const pa = pm.permApprovals;
    const pl = pm.permLogs;
    const ds = pm.dataScope;
    const pLevels = pm.permLevels;

    switch(currentPermTab) {
    case 'matrix':
        container.innerHTML = `
            <div class="card"><div class="card-header flex-between"><h3><i class="fa fa-th" style="color:var(--primary);margin-right:8px;"></i>功能模块权限矩阵</h3><div><button class="btn btn-outline btn-sm" onclick="showToast('权限矩阵已导出为Excel','success')"><i class="fa fa-download"></i> 导出</button></div></div><div class="card-body" style="padding:0;overflow-x:auto;"><table class="perm-table"><thead><tr><th style="min-width:120px;">功能模块</th>${pm.roles.map(r=>`<th style="min-width:80px;">${r}</th>`).join('')}</tr></thead><tbody>${pm.modules.map((m,i) => `<tr><td class="fw-600">${m}</td>${pm.data[i].map(v => {const lv=pLevels[v]||pLevels[0];return `<td><span class="perm-check ${v===1?'yes':v===0?'no':'partial'}" title="${lv.label}: ${lv.desc}">${v===1?'<i class="fa fa-check"></i>':v===0?'<i class="fa fa-minus"></i>':'<i class="fa fa-adjust"></i>'}</span></td>`;}).join('')}</tr>`).join('')}</tbody></table></div></div>
            <div class="card mt-24"><div class="card-header"><h3><i class="fa fa-info-circle" style="color:var(--info);margin-right:8px;"></i>权限等级说明</h3></div><div class="card-body"><div class="grid-3">${Object.values(pLevels).map(lv => `<div style="padding:14px;background:${lv.color}15;border-radius:8px;text-align:center;"><span class="perm-check ${lv.label==='完全权限'?'yes':lv.label==='无权限'?'no':'partial'}" style="width:24px;height:24px;font-size:14px;"><i class="fa ${lv.icon}"></i></span><div class="fw-600 mt-16 fs-13">${lv.label}</div><div class="fs-12 text-muted">${lv.desc}</div></div>`).join('')}</div></div></div>`;
        break;

    case 'roles':
        container.innerHTML = `
            <div class="grid-2">${rd.map(r => `
                <div class="card" style="cursor:pointer;" onclick="showRoleDetail(${r.id})">
                    <div class="card-body">
                        <div style="display:flex;gap:16px;margin-bottom:16px;">
                            <div style="width:48px;height:48px;border-radius:12px;background:${r.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;"><i class="fa fa-shield"></i></div>
                            <div style="flex:1;"><h3 class="fw-700">${r.name}</h3><div class="flex gap-8 mt-8"><span class="tag" style="background:${r.color}15;color:${r.color};">${r.level}</span><span class="tag tag-gray">${r.users}人</span><span class="tag tag-gray">${r.scope}数据范围</span></div></div>
                        </div>
                        <div class="fs-13 text-muted mb-16">${r.desc}</div>
                        <div class="card-section">
                            <div class="fs-12 text-muted mb-8">职责范围</div>
                            ${r.duties.map(d => `<div class="fs-13" style="padding:4px 0;display:flex;align-items:center;gap:8px;"><i class="fa fa-check-circle" style="color:${r.color};font-size:12px;"></i>${d}</div>`).join('')}
                        </div>
                        <div class="card-section mt-16">
                            <div class="fs-12 text-muted mb-8">操作权限</div>
                            <div class="flex gap-8 flex-wrap">
                                ${r.canCreate?`<span class="tag" style="background:#10b98115;color:#10b981;"><i class="fa fa-plus"></i> 创建</span>`:''}
                                ${r.canEdit?`<span class="tag" style="background:#2563eb15;color:#2563eb;"><i class="fa fa-edit"></i> 编辑</span>`:''}
                                ${r.canDelete?`<span class="tag" style="background:#ef444415;color:#ef4444;"><i class="fa fa-trash"></i> 删除</span>`:''}
                                ${r.canApprove?`<span class="tag" style="background:#8b5cf615;color:#8b5cf6;"><i class="fa fa-check-square-o"></i> 审批</span>`:''}
                                ${!r.canCreate&&!r.canEdit&&!r.canDelete&&!r.canApprove?`<span class="tag tag-gray">仅查看</span>`:''}
                            </div>
                        </div>
                    </div>
                </div>`).join('')}</div>`;
        break;

    case 'approval':
        const statusColors = { '待审批': '#f59e0b', '已通过': '#10b981', '已拒绝': '#ef4444' };
        const urgencyColors = { '紧急': 'tag-danger', '普通': 'tag-gray' };
        container.innerHTML = `
            <div class="card mb-24"><div class="card-header flex-between"><h3><i class="fa fa-check-square-o" style="color:var(--primary);margin-right:8px;"></i>权限审批列表</h3><div class="flex gap-8"><button class="btn btn-sm btn-outline" onclick="showToast('已筛选待审批项','info')"><i class="fa fa-filter"></i> 待审批</button></div></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>申请编号</th><th>申请人</th><th>当前角色</th><th>目标权限</th><th>申请原因</th><th>紧急度</th><th>审批人</th><th>申请日期</th><th>状态</th><th>操作</th></tr></thead><tbody>${pa.map(a => {const sColor=statusColors[a.status]||'#94a3b8';const uTag=urgencyColors[a.urgency]||'tag-gray';return `<tr><td class="fw-600">${a.id}</td><td>${a.applicant}</td><td><span class="tag tag-gray">${a.applicantRole}</span></td><td>${a.targetModules.map(m=>`<span class="tag tag-info">${m}</span>`).join(' ')}</td><td class="fs-13" style="max-width:200px;">${a.reason}</td><td><span class="tag ${uTag}">${a.urgency}</span></td><td>${a.approver}</td><td>${a.applyDate}</td><td><span class="tag" style="background:${sColor}15;color:${sColor};">${a.status}</span></td><td>${a.status==='待审批'?`<button class="btn btn-success btn-xs" onclick="approvePerm('${a.id}')"><i class="fa fa-check"></i></button><button class="btn btn-danger btn-xs" onclick="rejectPerm('${a.id}')"><i class="fa fa-times"></i></button>`:`<button class="btn btn-outline btn-xs" onclick="showPermDetail('${a.id}')"><i class="fa fa-eye"></i></button>`}</td></tr>`;}).join('')}</tbody></table></div></div></div>

            <div class="card"><div class="card-header"><h3><i class="fa fa-sitemap" style="color:var(--primary);margin-right:8px;"></i>权限审批流程</h3></div><div class="card-body">
                <div class="approval-flow-row" style="display:flex;gap:0;align-items:stretch;">
                    <div style="flex:1;padding:20px;text-align:center;border-radius:8px;background:#2563eb15;border:1px solid #2563eb30;">
                        <div style="width:36px;height:36px;border-radius:50%;background:#2563eb;color:#fff;display:inline-flex;align-items:center;justify-content:center;"><i class="fa fa-user"></i></div>
                        <div class="fw-600 mt-16 fs-13">1. 员工提交申请</div>
                        <div class="fs-12 text-muted mt-8">选择目标模块+填写申请原因</div>
                    </div>
                    <div style="display:flex;align-items:center;padding:0 8px;"><i class="fa fa-arrow-right" style="color:var(--primary);font-size:18px;"></i></div>
                    <div style="flex:1;padding:20px;text-align:center;border-radius:8px;background:#8b5cf615;border:1px solid #8b5cf630;">
                        <div style="width:36px;height:36px;border-radius:50%;background:#8b5cf6;color:#fff;display:inline-flex;align-items:center;justify-content:center;"><i class="fa fa-search"></i></div>
                        <div class="fw-600 mt-16 fs-13">2. 直属主管初审</div>
                        <div class="fs-12 text-muted mt-8">核实申请必要性+业务合理性</div>
                    </div>
                    <div style="display:flex;align-items:center;padding:0 8px;"><i class="fa fa-arrow-right" style="color:var(--primary);font-size:18px;"></i></div>
                    <div style="flex:1;padding:20px;text-align:center;border-radius:8px;background:#f59e0b15;border:1px solid #f59e0b30;">
                        <div style="width:36px;height:36px;border-radius:50%;background:#f59e0b;color:#fff;display:inline-flex;align-items:center;justify-content:center;"><i class="fa fa-shield"></i></div>
                        <div class="fw-600 mt-16 fs-13">3. 权限管理员复核</div>
                        <div class="fs-12 text-muted mt-8">安全风险评估+合规性审查</div>
                    </div>
                    <div style="display:flex;align-items:center;padding:0 8px;"><i class="fa fa-arrow-right" style="color:var(--primary);font-size:18px;"></i></div>
                    <div style="flex:1;padding:20px;text-align:center;border-radius:8px;background:#10b98115;border:1px solid #10b98130;">
                        <div style="width:36px;height:36px;border-radius:50%;background:#10b981;color:#fff;display:inline-flex;align-items:center;justify-content:center;"><i class="fa fa-check-circle"></i></div>
                        <div class="fw-600 mt-16 fs-13">4. 最终审批决定</div>
                        <div class="fs-12 text-muted mt-8">通过/拒绝+设置有效期</div>
                    </div>
                </div>
                <div class="mt-24 fs-13 text-muted" style="padding:12px;background:var(--bg-hover);border-radius:8px;">
                    <i class="fa fa-info-circle" style="color:var(--info);"></i> 审批规则：紧急权限申请24小时内完成审批，普通权限申请3个工作日内完成审批；临时权限有效期最长不超过30天。
                </div>
            </div></div>`;
        break;

    case 'logs':
        const actionIcons = { '权限申请提交': 'fa-upload', '权限审批通过': 'fa-check-circle', '权限审批拒绝': 'fa-times-circle', '权限范围调整': 'fa-cog', '权限批量调整': 'fa-th-large' };
        const actionColors = { '权限申请提交': '#2563eb', '权限审批通过': '#10b981', '权限审批拒绝': '#ef4444', '权限范围调整': '#f59e0b', '权限批量调整': '#8b5cf6' };
        container.innerHTML = `
            <div class="card"><div class="card-header flex-between"><h3><i class="fa fa-history" style="color:var(--primary);margin-right:8px;"></i>权限变更日志</h3><div class="flex gap-8"><button class="btn btn-sm btn-outline" onclick="showToast('已导出变更日志','success')"><i class="fa fa-download"></i> 导出</button></div></div><div class="card-body"><div class="milestone-timeline">${pl.map(l => {const aIcon=actionIcons[l.action]||'fa-circle';const aColor=actionColors[l.action]||'#94a3b8';return `<div class="milestone-item"><div class="milestone-marker" style="background:${aColor};"><i class="fa ${aIcon}" style="color:#fff;font-size:12px;"></i></div><div class="milestone-content"><div class="flex-between mb-8"><div class="fw-600 fs-14">${l.action}</div><div class="fs-12 text-muted">${l.date}</div></div><div class="fs-13">${l.detail}</div><div class="flex gap-8 mt-8"><span class="tag" style="background:${aColor}15;color:${aColor};">${l.module}</span><span class="tag tag-gray">操作人: ${l.operator}</span><span class="tag tag-gray">对象: ${l.target}</span><span class="fs-12 text-muted" style="color:#10b981;">${l.beforeRole} → ${l.afterRole}</span></div></div></div>`;}).join('')}</div></div></div>`;
        break;

    case 'scope':
        container.innerHTML = `
            <div class="grid-2">${ds.map(s => `
                <div class="card">
                    <div class="card-body">
                        <div style="display:flex;gap:16px;margin-bottom:16px;">
                            <div style="width:48px;height:48px;border-radius:12px;background:${s.level==='最高级'?'#1e293b':s.level==='管理层'?'#2563eb':s.level==='专业层'?'#f59e0b':'#10b981'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;"><i class="fa fa-database"></i></div>
                            <div style="flex:1;"><h3 class="fw-700">${s.level}</h3><div class="mt-8"><span class="tag" style="background:${s.level==='最高级'?'#1e293b15':s.level==='管理层'?'#2563eb15':s.level==='专业层'?'#f59e0b15':'#10b98115'};color:${s.level==='最高级'?'#1e293b':s.level==='管理层'?'#2563eb':s.level==='专业层'?'#f59e0b':'#10b981'};">${s.scope}</span></div></div>
                        </div>
                        <div class="fs-13 text-muted mb-16">${s.desc}</div>
                        <div class="card-section">
                            <div class="fs-12 text-muted mb-8">适用角色</div>
                            <div class="flex gap-8 flex-wrap">${s.roles.map(r => {const rdItem=pm.roleDetails.find(d=>d.name===r);return `<span class="tag" style="background:${rdItem?rdItem.color+'15':'#94a3b815'};color:${rdItem?rdItem.color:'#94a3b8'};">${r}</span>`;}).join('')}</div>
                        </div>
                    </div>
                </div>`).join('')}</div>

            <div class="card mt-24"><div class="card-header"><h3><i class="fa fa-sitemap" style="color:var(--primary);margin-right:8px;"></i>数据范围层级关系</h3></div><div class="card-body">
                <div style="display:flex;flex-direction:column;gap:0;align-items:center;">
                    <div style="width:240px;padding:16px 24px;background:#1e293b;color:#fff;border-radius:12px 12px 0 0;text-align:center;font-weight:700;font-size:14px;">最高级 — 全公司数据</div>
                    <div style="width:1px;height:16px;background:#1e293b;"></div>
                    <div style="display:flex;gap:24px;">
                        <div style="width:180px;padding:14px;background:#2563eb15;border:1px solid #2563eb;border-radius:12px;text-align:center;font-weight:600;font-size:13px;color:#2563eb;">管理层 — 本部门/区域</div>
                    </div>
                    <div style="width:1px;height:16px;background:#2563eb;"></div>
                    <div style="display:flex;gap:24px;">
                        <div style="width:160px;padding:14px;background:#f59e0b15;border:1px solid #f59e0b;border-radius:12px;text-align:center;font-weight:600;font-size:13px;color:#f59e0b;">专业层 — 专业领域</div>
                        <div style="width:160px;padding:14px;background:#10b98115;border:1px solid #10b981;border-radius:12px;text-align:center;font-weight:600;font-size:13px;color:#10b981;">执行层 — 仅本人</div>
                    </div>
                </div>
                <div class="mt-24 fs-13 text-muted" style="padding:12px;background:var(--bg-hover);border-radius:8px;">
                    <i class="fa fa-lock" style="color:var(--danger);"></i> 数据安全原则：上级可查看下级数据，同级数据不可互看；专业层仅限本专业领域；所有数据操作均记录审计日志。
                </div>
            </div></div>`;
        break;
    }
}

function showRoleDetail(id) {
    const rd = mockData.permMatrix.roleDetails.find(r => r.id === id);
    const pm = mockData.permMatrix;
    if (!rd) return;
    $('#genericModalTitle').textContent = rd.name + ' — 角色详情';
    $('#genericModalBody').innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:20px;">
            <div style="width:64px;height:64px;border-radius:12px;background:${rd.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;"><i class="fa fa-shield"></i></div>
            <div style="flex:1;"><h3 class="fw-700">${rd.name}</h3><div class="flex gap-8 mt-8"><span class="tag" style="background:${rd.color}15;color:${rd.color};">${rd.level}</span><span class="tag tag-gray">${rd.users}人</span><span class="tag tag-info">${rd.scope}</span></div><div class="fs-13 text-muted mt-8">${rd.desc}</div></div>
        </div>
        <div class="card-section mb-20">
            <div class="fw-600 fs-13 mb-8"><i class="fa fa-database" style="color:var(--primary);margin-right:6px;"></i>数据范围</div>
            <div style="padding:12px;background:var(--bg-hover);border-radius:8px;"><div class="fw-600">${rd.scope}</div><div class="fs-12 text-muted mt-4">${rd.scopeDesc}</div></div>
        </div>
        <div class="card-section mb-20">
            <div class="fw-600 fs-13 mb-8"><i class="fa fa-key" style="color:var(--warning);margin-right:6px;"></i>操作权限</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
                ${rd.canCreate?`<div style="padding:10px 16px;background:#10b98115;border-radius:8px;"><i class="fa fa-plus" style="color:#10b981;"></i> <span class="fw-600 fs-13">创建</span><div class="fs-12 text-muted">可新增数据记录</div></div>`:''}
                ${rd.canEdit?`<div style="padding:10px 16px;background:#2563eb15;border-radius:8px;"><i class="fa fa-edit" style="color:#2563eb;"></i> <span class="fw-600 fs-13">编辑</span><div class="fs-12 text-muted">可修改已有数据</div></div>`:''}
                ${rd.canDelete?`<div style="padding:10px 16px;background:#ef444415;border-radius:8px;"><i class="fa fa-trash" style="color:#ef4444;"></i> <span class="fw-600 fs-13">删除</span><div class="fs-12 text-muted">可删除数据记录</div></div>`:''}
                ${rd.canApprove?`<div style="padding:10px 16px;background:#8b5cf615;border-radius:8px;"><i class="fa fa-check-square-o" style="color:#8b5cf6;"></i> <span class="fw-600 fs-13">审批</span><div class="fs-12 text-muted">可审批流程申请</div></div>`:''}
                ${!rd.canCreate&&!rd.canEdit&&!rd.canDelete&&!rd.canApprove?`<div style="padding:10px 16px;background:var(--bg-hover);border-radius:8px;"><i class="fa fa-eye" style="color:var(--text-muted);"></i> <span class="fw-600 fs-13">仅查看</span><div class="fs-12 text-muted">可查看但不可操作</div></div>`:''}
            </div>
        </div>
        <div class="card-section mb-20">
            <div class="fw-600 fs-13 mb-8"><i class="fa fa-list-alt" style="color:var(--success);margin-right:6px;"></i>职责范围</div>
            <div>${rd.duties.map(d => `<div style="padding:6px 0;display:flex;align-items:center;gap:8px;"><span style="width:20px;height:20px;border-radius:50%;background:${rd.color}15;color:${rd.color};display:flex;align-items:center;justify-content:center;font-size:10px;"><i class="fa fa-check"></i></span><span class="fs-13">${d}</span></div>`).join('')}</div>
        </div>
        <div class="card-section">
            <div class="fw-600 fs-13 mb-8"><i class="fa fa-th" style="color:var(--info);margin-right:6px;"></i>模块权限明细</div>
            <div style="overflow-x:auto;"><table class="perm-table" style="font-size:12px;"><thead><tr><th>模块</th><th>权限</th></tr></thead><tbody>${pm.modules.map((m, i) => {const roleIdx=pm.roles.indexOf(rd.name);const val=roleIdx>=0?pm.data[i][roleIdx]:0;const lv=pm.permLevels[val]||pm.permLevels[0];return `<tr><td>${m}</td><td><span style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:4px;background:${lv.color}15;color:${lv.color};font-size:11px;font-weight:600;"><i class="fa ${lv.icon}" style="font-size:10px;"></i>${lv.label}</span></td></tr>`;}).join('')}</tbody></table></div>
        </div>
        <div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;"><button class="btn btn-outline" onclick="closeModal('genericModal')">关闭</button></div>`;
    openModal('genericModal');
}

async function approvePerm(id) {
    const r = await API.approvePermission(id, { status: '已通过', remark: '审批通过' });
    if (!r.success) { showToast(r.message || '操作失败', 'error'); return; }
    await API.syncAllData(mockData);
    showToast(`权限申请 ${id} 已通过`, 'success');
    renderPermTabContent();
}

async function rejectPerm(id) {
    const r = await API.approvePermission(id, { status: '已拒绝', remark: '审批拒绝' });
    if (!r.success) { showToast(r.message || '操作失败', 'error'); return; }
    await API.syncAllData(mockData);
    showToast(`权限申请 ${id} 已拒绝`, 'warning');
    renderPermTabContent();
}

function showPermDetail(id) {
    const a = mockData.permMatrix.permApprovals.find(x => x.id === id);
    if (!a) return;
    const statusColor = a.status==='已通过'?'#10b981':a.status==='已拒绝'?'#ef4444':'#f59e0b';
    $('#genericModalTitle').textContent = '权限审批详情 — ' + a.id;
    $('#genericModalBody').innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:20px;">
            <div style="width:48px;height:48px;border-radius:12px;background:${statusColor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;"><i class="fa fa-${a.status==='已通过'?'check-circle':a.status==='已拒绝'?'times-circle':'hourglass-half'}"></i></div>
            <div style="flex:1;"><h3 class="fw-700">${a.applicant}</h3><div class="flex gap-8 mt-8"><span class="tag" style="background:${statusColor}15;color:${statusColor};">${a.status}</span><span class="tag tag-gray">${a.applicantRole}</span><span class="tag ${a.urgency==='紧急'?'tag-danger':'tag-gray'}">${a.urgency}</span></div></div>
        </div>
        <div class="card-section mb-20">
            <div class="fw-600 fs-13 mb-8">目标权限</div>
            <div class="flex gap-8 flex-wrap">${a.targetModules.map(m=>`<span class="tag tag-info">${m}</span>`).join('')}</div>
            <div class="fs-13 text-muted mt-8">目标角色: ${a.targetRole}</div>
        </div>
        <div class="card-section mb-20">
            <div class="fw-600 fs-13 mb-8">申请原因</div>
            <div class="fs-13">${a.reason}</div>
        </div>
        <div class="grid-2">
            <div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">申请日期</label><div class="fw-600">${a.applyDate}</div></div>
            <div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">审批人</label><div class="fw-600">${a.approver}</div></div>
            ${a.approveDate?`<div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">审批日期</label><div class="fw-600">${a.approveDate}</div></div>`:''}
            ${a.remark?`<div class="form-field" style="margin-bottom:12px;"><label class="fs-12 text-muted">备注</label><div class="fw-600">${a.remark}</div></div>`:''}
        </div>
        <div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;"><button class="btn btn-outline" onclick="closeModal('genericModal')">关闭</button></div>`;
    openModal('genericModal');
}

function showNewPermApplyForm() {
    $('#genericModalTitle').textContent = '申请权限变更';
    const pm = mockData.permMatrix;
    $('#genericModalBody').innerHTML = `
        <div class="card-section mb-20">
            <div class="fw-600 fs-13 mb-12">申请人信息</div>
            <div class="grid-2">
                <div class="form-field"><label class="fs-12 text-muted">姓名</label><div class="fw-600">${mockData.currentUser.name}</div></div>
                <div class="form-field"><label class="fs-12 text-muted">当前角色</label><div class="fw-600">${mockData.currentUser.role}</div></div>
            </div>
        </div>
        <div class="card-section mb-20">
            <div class="fw-600 fs-13 mb-12">申请权限</div>
            <div class="form-field mb-16"><label class="fs-12 text-muted mb-8">目标角色</label><select id="permTargetRole" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;">${pm.roles.filter(r=>r!==mockData.currentUser.role).map(r=>`<option value="${r}">${r}</option>`).join('')}</select></div>
            <div class="form-field mb-16"><label class="fs-12 text-muted mb-8">目标模块</label><div class="flex gap-8 flex-wrap">${pm.modules.map(m=>`<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--border);border-radius:8px;font-size:12px;cursor:pointer;"><input type="checkbox" class="permModule" value="${m}" style="margin:0;">${m}</label>`).join('')}</div></div>
            <div class="form-field mb-16"><label class="fs-12 text-muted mb-8">紧急程度</label><div class="flex gap-8"><label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--border);border-radius:8px;font-size:12px;cursor:pointer;"><input type="radio" name="permUrgency" value="普通" checked style="margin:0;">普通</label><label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--border);border-radius:8px;font-size:12px;cursor:pointer;"><input type="radio" name="permUrgency" value="紧急" style="margin:0;">紧急</label></div></div>
        </div>
        <div class="card-section mb-20">
            <div class="fw-600 fs-13 mb-12">申请原因</div>
            <textarea id="permReason" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;min-height:80px;resize:vertical;" placeholder="请详细描述权限申请原因..."></textarea>
        </div>
        <div class="card-section">
            <div class="fw-600 fs-13 mb-12">审批流程预览</div>
            <div style="padding:12px;background:var(--bg-hover);border-radius:8px;">
                <div class="fs-13" style="display:flex;align-items:center;gap:8px;padding:4px 0;"><span style="width:20px;height:20px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;">1</span> ${mockData.currentUser.name} 提交申请</div>
                <div class="fs-13" style="display:flex;align-items:center;gap:8px;padding:4px 0;"><span style="width:20px;height:20px;border-radius:50%;background:#8b5cf6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;">2</span> 直属主管初审</div>
                <div class="fs-13" style="display:flex;align-items:center;gap:8px;padding:4px 0;"><span style="width:20px;height:20px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;">3</span> 权限管理员复核</div>
                <div class="fs-13" style="display:flex;align-items:center;gap:8px;padding:4px 0;"><span style="width:20px;height:20px;border-radius:50%;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;">4</span> 最终审批决定</div>
            </div>
        </div>
        <div class="modal-footer" style="padding:16px 0 0;border-top:1px solid var(--border-light);margin-top:16px;"><button class="btn btn-primary" onclick="submitPermApply()"><i class="fa fa-paper-plane"></i> 提交申请</button><button class="btn btn-outline" onclick="closeModal('genericModal')">取消</button></div>`;
    openModal('genericModal');
}

async function submitPermApply() {
    const targetRole = $('#permTargetRole').value;
    const targetModules = Array.from(document.querySelectorAll('.permModule:checked')).map(c => c.value);
    const urgency = (document.querySelector('input[name="permUrgency"]:checked') || {}).value || '普通';
    const reason = $('#permReason').value.trim();
    if (!targetModules.length || !reason) { showToast('请选择目标模块并填写申请原因', 'warning'); return; }
    const r = await API.applyPermission({
        applicant: mockData.currentUser.name,
        applicantRole: mockData.currentUser.role,
        targetRole, targetModules, reason,
        approver: mockData.currentUser.name, urgency
    });
    if (r.success) { closeModal('genericModal'); await API.syncAllData(mockData); showToast('权限申请已提交，等待审批', 'success'); renderView('permission'); }
    else { showToast(r.message || '提交失败', 'error'); }
}

/* ============================================
 * 财务管理
 * ============================================ */
function renderFinance(c) {
    const f = mockData.finance;
    c.innerHTML = `
        <div class="page-header"><h2>财务管理</h2><p>全方位财务数据管理，保障资金安全与合规</p></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-cny"></i></div></div><div class="stat-value amount large" style="color:var(--success);">¥${f.thisMonth.revenue}万</div><div class="stat-label">本月营收</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-check-circle"></i></div></div><div class="stat-value amount large" style="color:var(--success);">¥${f.thisMonth.profit}万</div><div class="stat-label">本月净利润</div><div class="stat-trend up" style="color:var(--success);"><i class="fa fa-arrow-up"></i> 利润率${f.thisMonth.profitMargin}%</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-credit-card"></i></div></div><div class="stat-value amount large" style="color:var(--danger);">¥${f.thisMonth.expense}万</div><div class="stat-label">本月支出</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-line-chart"></i></div></div><div class="stat-value">${f.thisMonth.budgetRate}<span class="fs-16 text-muted">%</span></div><div class="stat-label">预算执行率（¥${f.thisMonth.budget}万）</div><div style="margin-top:8px;"><div class="progress-bar"><div class="progress-bar-fill" style="width:${f.thisMonth.budgetRate}%;background:${f.thisMonth.budgetRate>80?'var(--danger)':'var(--success)'};"></div></div></div></div>
        </div>
        <div class="grid-2 mb-24">
            <div class="card"><div class="card-header"><h3><i class="fa fa-arrow-circle-down" style="color:var(--success);margin-right:8px;"></i>应收账款</h3><span class="tag tag-danger"><i class="fa fa-exclamation-triangle"></i> 2笔逾期</span></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>客户</th><th>金额</th><th>到期日</th><th>逾期天数</th><th>状态</th></tr></thead><tbody>${f.receivable.map(r => {const statusTag=r.status==='逾期'?'tag-danger':r.status==='即将到期'?'tag-warning':'tag-success'; return `<tr><td class="fw-600">${r.customer}</td><td class="fw-700 amount primary">¥${r.amount}万</td><td>${r.dueDate}</td><td>${r.overdue>0?`<span style="color:var(--danger);">${r.overdue}天</span>`:'—'}</td><td><span class="tag ${statusTag}">${r.status}</span></td></tr>`;}).join('')}</tbody></table></div></div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-arrow-circle-up" style="color:var(--danger);margin-right:8px;"></i>应付账款</h3></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>供应商</th><th>金额</th><th>到期日</th><th>状态</th></tr></thead><tbody>${f.payable.map(p => {const statusTag=p.status==='即将到期'?'tag-warning':'tag-success'; return `<tr><td class="fw-600">${p.vendor}</td><td class="fw-700 amount">¥${p.amount}万</td><td>${p.dueDate}</td><td><span class="tag ${statusTag}">${p.status}</span></td></tr>`;}).join('')}</tbody></table></div></div></div>
        </div>
        <div class="grid-2">
            <div class="card"><div class="card-header"><h3><i class="fa fa-pie-chart" style="color:var(--primary);margin-right:8px;"></i>支出构成分析</h3></div><div class="card-body"><div class="chart-container"><canvas id="financeExpenseChart"></canvas></div></div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-line-chart" style="color:var(--success);margin-right:8px;"></i>收支趋势</h3></div><div class="card-body"><div class="chart-container"><canvas id="financeTrendChart"></canvas></div></div></div>
        </div>`;
    setTimeout(() => {
        const ctx1=$('#financeExpenseChart'); if(ctx1) charts.finExp=new Chart(ctx1,{type:'doughnut',data:{labels:f.expenseBreakdown.labels,datasets:[{data:f.expenseBreakdown.data,backgroundColor:['#2563eb','#8b5cf6','#f59e0b','#10b981','#ef4444','#94a3b8'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{usePointStyle:true}}},cutout:'55%'}});
        const ctx2=$('#financeTrendChart'); if(ctx2) charts.finTrend=new Chart(ctx2,{type:'line',data:{labels:mockData.cockpit.revenueTrend.labels,datasets:[{label:'营收(万)',data:mockData.cockpit.revenueTrend.data,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,0.1)',fill:true,tension:0.4},{label:'支出(万)',data:mockData.cockpit.expenseTrend.data,borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,0.05)',fill:true,tension:0.4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{usePointStyle:true}}},scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'}},x:{grid:{display:false}}}}});
    },100);
}

/* ============================================
 * 统计分析
 * ============================================ */
function renderStatistics(c) { c.innerHTML=`<div class="page-header"><h2>统计分析</h2><p>数据驱动管理决策，全面掌握团队运营状况</p></div><div class="stats-grid"><div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-calendar-check-o"></i></div></div><div class="stat-value">94<span class="fs-16 text-muted">%</span></div><div class="stat-label">本月打卡率</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-file-text-o"></i></div></div><div class="stat-value">87<span class="fs-16 text-muted">%</span></div><div class="stat-label">汇报提交率</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-handshake-o"></i></div></div><div class="stat-value">186</div><div class="stat-label">本月客户拜访</div></div><div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-cny"></i></div></div><div class="stat-value">945<span class="fs-16 text-muted">万</span></div><div class="stat-label">本月成交额</div></div></div><div class="grid-2 mb-24"><div class="card"><div class="card-header"><h3><i class="fa fa-bar-chart" style="color:var(--primary);margin-right:8px;"></i>月度汇报趋势</h3></div><div class="card-body"><div class="chart-container"><canvas id="reportTrendChart"></canvas></div></div></div><div class="card"><div class="card-header"><h3><i class="fa fa-pie-chart" style="color:var(--success);margin-right:8px;"></i>部门业绩占比</h3></div><div class="card-body"><div class="chart-container"><canvas id="deptPerfChart"></canvas></div></div></div></div><div class="grid-2"><div class="card"><div class="card-header"><h3><i class="fa fa-trophy" style="color:var(--warning);margin-right:8px;"></i>员工打卡排行</h3></div><div class="card-body" style="padding:12px 20px;">${renderCheckinRankList()}</div></div><div class="card"><div class="card-header"><h3><i class="fa fa-table" style="color:var(--purple);margin-right:8px;"></i>各部门考勤统计</h3></div><div class="card-body" style="padding:0;"><div class="table-wrap"><table class="data-table"><thead><tr><th>部门</th><th>应到</th><th>实到</th><th>外勤</th><th>请假</th><th>打卡率</th></tr></thead><tbody>${[{name:'销售一部',expect:18,actual:17,field:5,leave:1,rate:94},{name:'销售二部',expect:15,actual:14,field:4,leave:1,rate:93},{name:'销售三部',expect:12,actual:11,field:3,leave:0,rate:92},{name:'市场部',expect:8,actual:8,field:2,leave:0,rate:100},{name:'技术部',expect:3,actual:3,field:0,leave:0,rate:100}].map(d=>`<tr><td class="fw-600">${d.name}</td><td>${d.expect}</td><td class="fw-600" style="color:var(--success);">${d.actual}</td><td><span class="tag tag-primary">${d.field}</span></td><td><span class="tag tag-warning">${d.leave}</span></td><td><div style="display:flex;align-items:center;gap:8px;"><div style="width:60px;"><div class="progress-bar"><div class="progress-bar-fill" style="width:${d.rate}%;background:${d.rate>=90?'var(--success)':'var(--warning)'};"></div></div></div><span class="fw-600 fs-12">${d.rate}%</span></div></td></tr>`).join('')}</tbody></table></div></div></div></div>`; setTimeout(()=>{const ctx1=$('#reportTrendChart');if(ctx1)charts.reportTrend=new Chart(ctx1,{type:'bar',data:{labels:mockData.monthReportData.labels,datasets:[{label:'日报',data:mockData.monthReportData.daily,backgroundColor:'#2563eb',borderRadius:6,barThickness:20},{label:'周报',data:mockData.monthReportData.weekly,backgroundColor:'#8b5cf6',borderRadius:6,barThickness:20}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{usePointStyle:true}}},scales:{y:{beginAtZero:true,grid:{color:'#f1f5f9'}},x:{grid:{display:false}}}}}); const ctx2=$('#deptPerfChart');if(ctx2)charts.deptPerf=new Chart(ctx2,{type:'doughnut',data:{labels:mockData.deptPerformance.labels,datasets:[{data:mockData.deptPerformance.data,backgroundColor:['#2563eb','#8b5cf6','#10b981','#f59e0b'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{usePointStyle:true}}},cutout:'65%'}}); },100); }
function renderCheckinRankList() { const sorted=[...mockData.teamMembers].sort((a,b)=>b.weekCheckins-a.weekCheckins).slice(0,6); const medals=['#f59e0b','#94a3b8','#cd7f32']; return sorted.map((m,i)=>{const rate=m.weekCheckins/5*100;return`<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border-light);"><div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;${i<3?`background:${medals[i]}20;color:${medals[i]};`:'background:var(--bg-hover);color:var(--text-muted);'}">${i+1}</div><div style="width:32px;height:32px;border-radius:50%;background:${m.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;">${m.avatar}</div><div style="flex:1;"><div class="fw-600 fs-13">${m.name}</div><div class="fs-12 text-muted">${m.role}</div></div><div style="width:100px;"><div class="progress-bar"><div class="progress-bar-fill" style="width:${rate}%;background:${rate>=80?'var(--success)':rate>=60?'var(--warning)':'var(--danger)'};"></div></div></div><div class="fw-600 fs-13" style="width:60px;text-align:right;">${m.weekCheckins}/5天</div></div>`;}).join(''); }

/* ============================================
 * 项目管理
 * ============================================ */
let currentProjectTab = 'list';
let currentProjectDetail = null;

function renderProject(c) {
    const ps = mockData.projectStats;
    const statusColors = { '执行中': '#2563eb', '立项审批中': '#f59e0b', '待立项': '#94a3b8', '已完成': '#10b981', '已暂停': '#ef4444' };
    const priorityColors = { '高': '#ef4444', '中': '#f59e0b', '低': '#10b981' };

    c.innerHTML = `
        <div class="page-header"><h2>项目管理</h2><p>全流程项目管理：立项审批、执行跟进、节点审批、项目审计</p></div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-folder-open-o"></i></div></div><div class="stat-value">${ps.total}</div><div class="stat-label">项目总数</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-play-circle"></i></div></div><div class="stat-value">${ps.active}</div><div class="stat-label">执行中</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon orange"><i class="fa fa-hourglass-half"></i></div></div><div class="stat-value">${ps.approval}</div><div class="stat-label">立项审批中</div></div>
            <div class="stat-card"><div class="stat-card-top"><div class="stat-icon purple"><i class="fa fa-line-chart"></i></div></div><div class="stat-value">${ps.avgProgress}<span class="fs-16 text-muted">%</span></div><div class="stat-label">平均进度</div></div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:20px;">
            <button class="btn btn-primary" onclick="showNewProjectForm()"><i class="fa fa-plus"></i> 新建项目</button>
            <div style="flex:1;"></div>
            <div class="project-status-bar">
                <div class="status-chip" style="background:${statusColors['执行中']}15;color:${statusColors['执行中']};"><span class="chip-count">${ps.active}</span> 执行中</div>
                <div class="status-chip" style="background:${statusColors['立项审批中']}15;color:${statusColors['立项审批中']};"><span class="chip-count">${ps.approval}</span> 审批中</div>
                <div class="status-chip" style="background:${statusColors['待立项']}15;color:${statusColors['待立项']};"><span class="chip-count">${ps.pending}</span> 待立项</div>
            </div>
        </div>

        <div class="card mb-24">
            <div class="card-header">
                <h3><i class="fa fa-list" style="color:var(--primary);margin-right:8px;"></i>项目列表</h3>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-sm ${currentProjectTab==='list'?'btn-primary':'btn-ghost'}" onclick="switchProjectTab('list')">全部项目</button>
                    <button class="btn btn-sm ${currentProjectTab==='approval'?'btn-primary':'btn-ghost'}" onclick="switchProjectTab('approval')">立项审批</button>
                    <button class="btn btn-sm ${currentProjectTab==='audit'?'btn-primary':'btn-ghost'}" onclick="switchProjectTab('audit')">项目审计</button>
                </div>
            </div>
            <div class="card-body" id="projectListContent"></div>
        </div>

        <div class="grid-2">
            <div class="card"><div class="card-header"><h3><i class="fa fa-pie-chart" style="color:var(--success);margin-right:8px;"></i>项目预算概览</h3></div><div class="card-body"><div class="chart-container-sm"><canvas id="projectBudgetChart"></canvas></div></div></div>
            <div class="card"><div class="card-header"><h3><i class="fa fa-bar-chart" style="color:var(--warning);margin-right:8px;"></i>项目进度对比</h3></div><div class="card-body"><div class="chart-container-sm"><canvas id="projectProgressChart"></canvas></div></div></div>
        </div>`;

    renderProjectTabContent();
    setTimeout(() => renderProjectCharts(), 100);
}

function switchProjectTab(tab) {
    currentProjectTab = tab;
    renderProjectTabContent();
    $$('.btn-sm').forEach(b => {
        const isActive = b.textContent.trim() === (tab==='list'?'全部项目':tab==='approval'?'立项审批':'项目审计');
        b.className = isActive ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';
    });
}

function renderProjectTabContent() {
    const container = $('#projectListContent');
    if (!container) return;

    const statusColors = { '执行中': '#2563eb', '立项审批中': '#f59e0b', '待立项': '#94a3b8', '已完成': '#10b981', '已暂停': '#ef4444' };
    const priorityColors = { '高': '#ef4444', '中': '#f59e0b', '低': '#10b981' };

    if (currentProjectTab === 'list') {
        container.innerHTML = mockData.projects.map(p => {
            const statusTag = p.status==='执行中'?'tag-info':p.status==='立项审批中'?'tag-warning':p.status==='待立项'?'tag-default':'tag-success';
            const budgetRate = p.budget > 0 ? (p.spent / p.budget * 100).toFixed(1) : 0;
            const budgetWarn = budgetRate > 80;
            return `<div class="project-card-item" onclick="showProjectDetail('${p.id}')">
                <div class="project-title-row">
                    <h4>${p.name}</h4>
                    <div style="display:flex;gap:6px;">
                        <span class="tag tag-xs" style="background:${priorityColors[p.priority]}15;color:${priorityColors[p.priority]};">优先级:${p.priority}</span>
                        <span class="tag ${statusTag}">${p.status}</span>
                    </div>
                </div>
                <div class="project-meta">
                    <span><i class="fa fa-hashtag"></i>${p.id}</span>
                    <span><i class="fa fa-user"></i>${p.manager}</span>
                    <span><i class="fa fa-building-o"></i>${p.customer}</span>
                    ${p.startDate !== '—' ? `<span><i class="fa fa-calendar"></i>${p.startDate} ~ ${p.endDate}</span>` : ''}
                </div>
                <div class="member-avatars">
                    ${p.team.slice(0,5).map(t => `<div class="member-avatar" style="background:${t.color};" title="${t.name}·${t.role}">${t.avatar}</div>`).join('')}
                    ${p.team.length > 5 ? `<div class="member-avatar" style="background:#94a3b8;">+${p.team.length-5}</div>` : ''}
                </div>
                ${p.progress > 0 ? `<div style="display:flex;align-items:center;gap:12px;"><div style="flex:1;"><div class="progress-bar"><div class="progress-bar-fill" style="width:${p.progress}%;background:${statusColors[p.status]};"></div></div></div><span class="fw-700" style="color:${statusColors[p.status]};font-size:13px;">${p.progress}%</span></div>` : ''}
                ${p.budget > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-top:4px;"><span>预算 ¥${(p.budget/10000).toFixed(1)}万</span><span style="color:${budgetWarn?'var(--danger)':'var(--text-secondary)'};">已用 ${budgetRate}%（¥${(p.spent/10000).toFixed(1)}万）</span></div>` : ''}
            </div>`;
        }).join('');
    } else if (currentProjectTab === 'approval') {
        const pendingProjects = mockData.projects.filter(p => p.status === '立项审批中' || p.status === '待立项');
        container.innerHTML = pendingProjects.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fa fa-check-circle" style="font-size:36px;color:var(--success);"></i><p class="mt-12">暂无待审批项目</p></div>' :
        pendingProjects.map(p => `<div class="project-card-item">
            <div class="project-title-row"><h4>${p.name}</h4><span class="tag ${p.status==='立项审批中'?'tag-warning':'tag-default'}">${p.status}</span></div>
            <div class="project-meta">
                <span><i class="fa fa-hashtag"></i>${p.id}</span>
                <span><i class="fa fa-user"></i>${p.manager}</span>
                <span><i class="fa fa-cny"></i>预算 ¥${(p.budget/10000).toFixed(1)}万</span>
            </div>
            <div style="margin-top:12px;display:flex;align-items:center;gap:8px;">
                <div class="approval-flow-row">
                    ${p.flow.map(f => `<div class="approval-node ${f.done?'done':'pending'}"><div class="node-title">${f.step}</div><div class="node-name">${f.user}</div>${f.done?`<div class="node-time">${f.time}</div>`:''}</div>${f !== p.flow[p.flow.length-1] ? `<div class="approval-connector ${f.done?'done':''}"><i class="fa fa-arrow-right"></i></div>` : ''}`).join('')}
                </div>
            </div>
            ${p.status === '立项审批中' ? `<div style="margin-top:12px;display:flex;gap:8px;"><button class="btn btn-sm btn-primary" onclick="approveProject('${p.id}')"><i class="fa fa-check"></i> 批准立项</button><button class="btn btn-sm btn-danger" onclick="rejectProject('${p.id}')"><i class="fa fa-times"></i> 驳回</button></div>` : `<div style="margin-top:12px;"><button class="btn btn-sm btn-primary" onclick="submitProject('${p.id}')"><i class="fa fa-paper-plane"></i> 提交立项申请</button></div>`}
        </div>`).join('');
    } else if (currentProjectTab === 'audit') {
        const projectsWithAudits = mockData.projects.filter(p => p.audits && p.audits.length > 0);
        container.innerHTML = projectsWithAudits.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fa fa-file-text-o" style="font-size:36px;"></i><p class="mt-12">暂无审计记录</p></div>' :
        `<div class="table-wrap"><table class="data-table"><thead><tr><th>项目</th><th>审计日期</th><th>审计人</th><th>审计类型</th><th>结果</th><th>备注</th></tr></thead><tbody>
        ${projectsWithAudits.flatMap(p => p.audits.map(a => `<tr><td class="fw-600">${p.name}</td><td>${a.date}</td><td>${a.auditor}</td><td>${a.type}</td><td><span class="audit-badge ${a.result==='通过'?'pass':a.result==='待整改'?'fail':'pending'}">${a.result}</span></td><td style="max-width:200px;color:var(--text-secondary);">${a.remark}</td></tr>`)).join('')}
        </tbody></table></div>`;
    }
}

function showProjectDetail(id) {
    const p = mockData.projects.find(proj => proj.id === id);
    if (!p) return;
    currentProjectDetail = p;

    const statusColors = { '执行中': '#2563eb', '立项审批中': '#f59e0b', '待立项': '#94a3b8', '已完成': '#10b981', '已暂停': '#ef4444' };
    const budgetRate = p.budget > 0 ? (p.spent / p.budget * 100).toFixed(1) : 0;

    const body = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div><h3 style="font-size:18px;font-weight:700;">${p.name}</h3><div style="font-size:13px;color:var(--text-secondary);">${p.id} · ${p.customer}</div></div>
            <span class="tag" style="background:${statusColors[p.status]}15;color:${statusColors[p.status]};font-size:14px;font-weight:700;">${p.status}</span>
        </div>

        <!-- 项目进度条 -->
        ${p.progress > 0 ? `<div style="margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span class="fw-600">项目进度</span><span class="fw-700" style="color:${statusColors[p.status]};">${p.progress}%</span></div>
            <div class="progress-bar" style="height:10px;border-radius:5px;"><div class="progress-bar-fill" style="width:${p.progress}%;background:${statusColors[p.status]};border-radius:5px;"></div></div>
        </div>` : ''}

        <!-- 参与执行成员名单 -->
        <div class="card-section mb-20">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-users" style="color:var(--primary);margin-right:6px;"></i>项目参与执行成员</h4>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>姓名</th><th>角色</th><th>所属部门</th></tr></thead>
                    <tbody>
                    ${p.team.map(t => `<tr><td><div style="display:flex;align-items:center;gap:8px;"><div style="width:28px;height:28px;border-radius:50%;background:${t.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">${t.avatar}</div><span class="fw-600">${t.name}</span></div></td><td>${t.role}</td><td>${t.dept}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 立项审批流程 -->
        <div class="card-section mb-20">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-check-circle" style="color:var(--success);margin-right:6px;"></i>立项审批流程</h4>
            <div class="approval-flow-row">
                ${p.flow.map(f => `<div class="approval-node ${f.done?'done':'pending'}"><div class="node-title">${f.step}</div><div class="node-name">${f.user}</div>${f.done?`<div class="node-time">${f.time}</div>`:''}</div>${f !== p.flow[p.flow.length-1] ? `<div class="approval-connector ${f.done?'done':''}"><i class="fa fa-arrow-right"></i></div>` : ''}`).join('')}
            </div>
        </div>

        <!-- 项目跟进 / 节点里程碑 -->
        <div class="card-section mb-20">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-flag" style="color:var(--warning);margin-right:6px;"></i>项目节点与跟进情况</h4>
            ${p.milestones.length > 0 ? `
            <div class="milestone-timeline">
                ${p.milestones.map(m => `<div class="milestone-item ${m.status}">
                    <div class="milestone-content">
                        <div class="milestone-title" style="${m.status==='done'?'color:var(--success);':m.status==='current'?'color:var(--primary);font-weight:700;':''}">${m.name}</div>
                        <div class="milestone-date">${m.date}</div>
                        <div class="milestone-approver">审批人: ${m.approver} ${m.approveTime !== '—' ? `(${m.approveTime})` : ''}</div>
                        ${m.status === 'current' ? `<div style="margin-top:6px;display:flex;gap:6px;"><button class="btn btn-xs btn-primary" onclick="approveNode('${p.id}','${m.name}')"><i class="fa fa-check"></i> 通过</button><button class="btn btn-xs btn-danger" onclick="rejectNode('${p.id}','${m.name}')"><i class="fa fa-times"></i> 驳回</button></div>` : ''}
                    </div>
                </div>`).join('')}
            </div>` : '<div style="text-align:center;padding:20px;color:var(--text-muted);">暂未设置里程碑</div>'}
        </div>

        <!-- 项目审计 -->
        <div class="card-section">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-shield" style="color:var(--danger);margin-right:6px;"></i>项目审计记录</h4>
            ${p.audits.length > 0 ? `
            <div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th>审计人</th><th>类型</th><th>结果</th><th>备注</th></tr></thead><tbody>
            ${p.audits.map(a => `<tr><td>${a.date}</td><td>${a.auditor}</td><td>${a.type}</td><td><span class="audit-badge ${a.result==='通过'?'pass':a.result==='待整改'?'fail':'pending'}">${a.result}</span></td><td style="color:var(--text-secondary);">${a.remark}</td></tr>`).join('')}
            </tbody></table></div>` : '<div style="text-align:center;padding:20px;color:var(--text-muted);">暂无审计记录</div>'}
            ${p.status === '执行中' ? `<div style="margin-top:8px;"><button class="btn btn-sm btn-primary" onclick="showToast('已发起项目审计申请','info')"><i class="fa fa-plus"></i> 发起审计</button></div>` : ''}
        </div>`;

    $('#genericModalTitle').textContent = `项目详情 - ${p.id}`;
    $('#genericModalBody').innerHTML = body;
    openModal('genericModal');
}

async function approveProject(id) { const r=await API.approveProject(id,{status:'执行中',approver:mockData.currentUser.name}); closeModal('genericModal'); showToast(r.success?`项目 ${id} 立项审批已通过`:(r.message||'操作失败'), r.success?'success':'error'); if(r.success) renderView('project'); }
async function rejectProject(id) { const r=await API.approveProject(id,{status:'已驳回',approver:mockData.currentUser.name}); closeModal('genericModal'); showToast(r.success?`项目 ${id} 立项申请已驳回`:(r.message||'操作失败'), r.success?'warning':'error'); if(r.success) renderView('project'); }
function submitProject(id) { showToast(`项目 ${id} 立项申请已提交`, 'info'); }
function approveNode(projId, nodeName) { showToast(`节点「${nodeName}」审批通过`, 'success'); }
function rejectNode(projId, nodeName) { showToast(`节点「${nodeName}」审批驳回`, 'error'); }
function showNewProjectForm() {
    $('#genericModalTitle').textContent = '新建项目';
    $('#genericModalBody').innerHTML = `
        <div class="form-field"><label>项目名称 <span class="required">*</span></label><input type="text" id="newProjName" placeholder="请输入项目名称"></div>
        <div class="form-field"><label>客户名称</label><input type="text" id="newProjCustomer" placeholder="请输入客户名称"></div>
        <div class="grid-2">
            <div class="form-field"><label>项目预算（元）</label><input type="number" id="newProjBudget" placeholder="请输入项目预算"></div>
            <div class="form-field"><label>优先级</label><select id="newProjPriority" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"><option>高</option><option>中</option><option>低</option></select></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>开始日期</label><input type="date" id="newProjStart"></div>
            <div class="form-field"><label>结束日期</label><input type="date" id="newProjEnd"></div>
        </div>
        <div class="form-field"><label>项目描述</label><textarea rows="3" placeholder="请输入项目描述和目标"></textarea></div>
        <div class="form-field"><label>项目经理</label><select id="newProjManager" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"><option>李明远</option><option>张浩然</option><option>刘子轩</option></select></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-ghost" onclick="closeModal('genericModal')">取消</button>
            <button class="btn btn-primary" onclick="submitNewProject()"><i class="fa fa-paper-plane"></i> 提交立项</button>
        </div>`;
    openModal('genericModal');
}

function renderProjectCharts() {
    const ctx1 = $('#projectBudgetChart');
    if (ctx1) {
        const projectsWithBudget = mockData.projects.filter(p => p.budget > 0);
        charts.projBudget = new Chart(ctx1, {
            type: 'doughnut',
            data: { labels: projectsWithBudget.map(p => p.name.substring(0,8)+'...'), datasets: [{ data: projectsWithBudget.map(p => p.spent/10000), backgroundColor: ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 11 } } } }, cutout: '50%' }
        });
    }
    const ctx2 = $('#projectProgressChart');
    if (ctx2) {
        const activeProjects = mockData.projects.filter(p => p.progress > 0);
        charts.projProgress = new Chart(ctx2, {
            type: 'bar',
            data: { labels: activeProjects.map(p => p.name.substring(0,6)+'...'), datasets: [{ label: '完成进度(%)', data: activeProjects.map(p => p.progress), backgroundColor: activeProjects.map(p => p.progress >= 80 ? '#10b981' : p.progress >= 50 ? '#2563eb' : '#f59e0b'), borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
        });
    }
}

/* ============================================
 * 出差申请审批
 * ============================================ */
let currentTripTab = 'list';

function renderBusinessTrip(c) {
    const ts = mockData.tripStats;
    const statusTagMap = { '待审批': 'tag-warning', '已完成': 'tag-success', '已驳回': 'tag-danger', '出行中': 'tag-info' };
    c.innerHTML = `
        <div class="page-header"><h2>出差申请审批</h2><p>出差申请、审批流程、费用管控一站式管理</p></div>
        <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);">
            <div class="trip-stat-card"><div class="trip-stat-icon" style="color:var(--primary);"><i class="fa fa-plane"></i></div><div class="trip-stat-value" style="color:var(--primary);">${ts.thisMonthTrips}</div><div class="trip-stat-label">本月出差人次</div></div>
            <div class="trip-stat-card"><div class="trip-stat-icon" style="color:var(--warning);"><i class="fa fa-hourglass-half"></i></div><div class="trip-stat-value" style="color:var(--warning);">${ts.pending}</div><div class="trip-stat-label">待审批</div></div>
            <div class="trip-stat-card"><div class="trip-stat-icon" style="color:var(--success);"><i class="fa fa-check-circle"></i></div><div class="trip-stat-value" style="color:var(--success);">${ts.completed}</div><div class="trip-stat-label">已完成</div></div>
            <div class="trip-stat-card"><div class="trip-stat-icon" style="color:var(--danger);"><i class="fa fa-times-circle"></i></div><div class="trip-stat-value" style="color:var(--danger);">${ts.rejected}</div><div class="trip-stat-label">已驳回</div></div>
            <div class="trip-stat-card"><div class="trip-stat-icon" style="color:var(--purple);"><i class="fa fa-calendar"></i></div><div class="trip-stat-value" style="color:var(--purple);">${ts.avgDays}</div><div class="trip-stat-label">平均天数</div></div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:20px;">
            <button class="btn btn-primary" onclick="showNewTripForm()"><i class="fa fa-plus"></i> 申请出差</button>
            <div style="flex:1;"></div>
            <button class="btn btn-sm ${currentTripTab==='list'?'btn-primary':'btn-ghost'}" onclick="switchTripTab('list')">出差记录</button>
            <button class="btn btn-sm ${currentTripTab==='approval'?'btn-primary':'btn-ghost'}" onclick="switchTripTab('approval')">待我审批</button>
            <button class="btn btn-sm ${currentTripTab==='stats'?'btn-primary':'btn-ghost'}" onclick="switchTripTab('stats')">费用统计</button>
        </div>

        <div class="card">
            <div class="card-body" id="tripListContent"></div>
        </div>`;

    renderTripTabContent();
}

function switchTripTab(tab) {
    currentTripTab = tab;
    renderTripTabContent();
}

function renderTripTabContent() {
    const container = $('#tripListContent');
    if (!container) return;

    const statusTagMap = { '待审批': 'tag-warning', '已完成': 'tag-success', '已驳回': 'tag-danger', '出行中': 'tag-info' };

    if (currentTripTab === 'list') {
        container.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>编号</th><th>申请人</th><th>行程</th><th>日期</th><th>天数</th><th>目的</th><th>预算</th><th>状态</th><th>操作</th></tr></thead><tbody>
        ${mockData.businessTrips.map(t => `<tr>
            <td class="fw-600">${t.id}</td>
            <td>${t.applicant}</td>
            <td><div class="trip-route"><span>${t.fromCity}</span><div class="trip-arrow"></div><span>${t.toCity}</span></div></td>
            <td>${t.startDate} ~ ${t.endDate}</td>
            <td><span class="trip-days-badge"><i class="fa fa-calendar"></i> ${t.days}天</span></td>
            <td style="max-width:180px;color:var(--text-secondary);">${t.purpose}</td>
            <td class="fw-700" style="color:var(--primary);">¥${t.budget.total}</td>
            <td><span class="tag ${statusTagMap[t.status]}">${t.status}</span></td>
            <td><button class="btn btn-xs btn-ghost" onclick="showTripDetail('${t.id}')"><i class="fa fa-eye"></i> 详情</button><button class="btn btn-danger btn-xs" onclick="deleteTrip('${t.id}')"><i class="fa fa-trash"></i></button></td>
        </tr>`).join('')}
        </tbody></table></div>`;
    } else if (currentTripTab === 'approval') {
        const pendingTrips = mockData.businessTrips.filter(t => t.status === '待审批');
        container.innerHTML = pendingTrips.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fa fa-check-circle" style="font-size:36px;color:var(--success);"></i><p class="mt-12">暂无待审批出差申请</p></div>' :
        pendingTrips.map(t => `<div class="project-card-item">
            <div class="project-title-row"><h4>${t.applicant} · ${t.fromCity} → ${t.toCity}</h4><span class="tag tag-warning">${t.status}</span></div>
            <div class="project-meta">
                <span><i class="fa fa-hashtag"></i>${t.id}</span>
                <span><i class="fa fa-calendar"></i>${t.startDate} ~ ${t.endDate}（${t.days}天）</span>
                <span><i class="fa fa-cny"></i>预算 ¥${t.budget.total}</span>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${t.purpose}</div>
            <div style="margin-top:12px;display:flex;align-items:center;gap:8px;">
                <div class="approval-flow-row">
                    ${t.flow.map(f => `<div class="approval-node ${f.done?'done':'pending'}"><div class="node-title">${f.step}</div><div class="node-name">${f.user}</div>${f.done?`<div class="node-time">${f.time}</div>`:''}</div>${f !== t.flow[t.flow.length-1] ? `<div class="approval-connector ${f.done?'done':''}"><i class="fa fa-arrow-right"></i></div>` : ''}`).join('')}
                </div>
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;"><button class="btn btn-sm btn-primary" onclick="approveTrip('${t.id}')"><i class="fa fa-check"></i> 批准</button><button class="btn btn-sm btn-danger" onclick="rejectTrip('${t.id}')"><i class="fa fa-times"></i> 驳回</button></div>
        </div>`).join('');
    } else if (currentTripTab === 'stats') {
        const completedTrips = mockData.businessTrips.filter(t => t.actualSpent);
        container.innerHTML = `
            <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px;">
                <div class="stat-card"><div class="stat-card-top"><div class="stat-icon blue"><i class="fa fa-cny"></i></div></div><div class="stat-value" style="color:var(--primary);">¥${ts_totalBudget()}</div><div class="stat-label">出差总预算</div></div>
                <div class="stat-card"><div class="stat-card-top"><div class="stat-icon green"><i class="fa fa-check-circle"></i></div></div><div class="stat-value" style="color:var(--success);">¥${completedTrips.reduce((s,t)=>s+t.actualSpent,0)}</div><div class="stat-label">实际支出（已完成）</div></div>
            </div>
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-list-alt" style="color:var(--primary);margin-right:6px;"></i>出差费用明细</h4>
            ${completedTrips.map(t => `
            <div class="project-card-item" style="cursor:default;">
                <div class="project-title-row"><h4>${t.applicant} · ${t.fromCity} → ${t.toCity}</h4><span class="tag tag-success">已完成</span></div>
                <div style="margin-top:8px;">
                    <div class="trip-expense-row"><span class="expense-label">交通费</span><span>预算 ¥${t.budget.transport} / 实际 ¥${Math.round(t.actualSpent*0.35)}</span></div>
                    <div class="trip-expense-row"><span class="expense-label">住宿费</span><span>预算 ¥${t.budget.hotel} / 实际 ¥${Math.round(t.actualSpent*0.40)}</span></div>
                    <div class="trip-expense-row"><span class="expense-label">餐饮费</span><span>预算 ¥${t.budget.meal} / 实际 ¥${Math.round(t.actualSpent*0.18)}</span></div>
                    <div class="trip-expense-row"><span class="expense-label">其他</span><span>预算 ¥${t.budget.other} / 实际 ¥${Math.round(t.actualSpent*0.07)}</span></div>
                    <div class="trip-expense-row" style="font-weight:700;"><span>合计</span><span class="expense-value ${t.actualSpent>t.budget.total?'over-budget':''}" style="color:var(--success);">预算 ¥${t.budget.total} / 实际 ¥${t.actualSpent}</span></div>
                </div>
            </div>`).join('')}
            <div style="margin-top:16px;"><div class="chart-container-sm"><canvas id="tripExpenseChart"></canvas></div></div>`;

        setTimeout(() => {
            const ctx = $('#tripExpenseChart');
            if (ctx) {
                charts.tripExp = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: completedTrips.map(t => `${t.applicant}(${t.toCity})`),
                        datasets: [
                            { label: '预算', data: completedTrips.map(t => t.budget.total), backgroundColor: '#dbeafe', borderRadius: 6 },
                            { label: '实际支出', data: completedTrips.map(t => t.actualSpent), backgroundColor: '#2563eb', borderRadius: 6 },
                        ]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true } } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
                });
            }
        }, 100);
    }
}

function ts_totalBudget() { return mockData.businessTrips.reduce((s,t)=>s+t.budget.total,0); }

function showTripDetail(id) {
    const t = mockData.businessTrips.find(trip => trip.id === id);
    if (!t) return;

    const statusTagMap = { '待审批': 'tag-warning', '已完成': 'tag-success', '已驳回': 'tag-danger', '出行中': 'tag-info' };
    const body = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div><h3 style="font-size:18px;font-weight:700;">${t.id} · 出差详情</h3></div>
            <span class="tag ${statusTagMap[t.status]}">${t.status}</span>
        </div>

        <div class="trip-route" style="font-size:18px;margin-bottom:16px;">
            <i class="fa fa-map-marker" style="color:var(--primary);"></i><span>${t.fromCity}</span>
            <div class="trip-arrow"></div>
            <i class="fa fa-map-marker" style="color:var(--danger);"></i><span>${t.toCity}</span>
            <span class="trip-days-badge" style="margin-left:12px;"><i class="fa fa-calendar"></i> ${t.days}天</span>
        </div>

        <div class="card-section mb-20">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-info-circle" style="color:var(--primary);margin-right:6px;"></i>基本信息</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
                <div><span style="color:var(--text-muted);">申请人：</span><span class="fw-600">${t.applicant}</span></div>
                <div><span style="color:var(--text-muted);">审批人：</span><span class="fw-600">${t.approver}</span></div>
                <div><span style="color:var(--text-muted);">出发日期：</span>${t.startDate}</div>
                <div><span style="color:var(--text-muted);">返回日期：</span>${t.endDate}</div>
            </div>
            <div style="margin-top:8px;font-size:13px;"><span style="color:var(--text-muted);">出差目的：</span>${t.purpose}</div>
        </div>

        <div class="card-section mb-20">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-cny" style="color:var(--warning);margin-right:6px;"></i>费用预算</h4>
            <div class="trip-expense-row"><span class="expense-label">交通费</span><span class="expense-value">¥${t.budget.transport}</span></div>
            <div class="trip-expense-row"><span class="expense-label">住宿费</span><span class="expense-value">¥${t.budget.hotel}</span></div>
            <div class="trip-expense-row"><span class="expense-label">餐饮费</span><span class="expense-value">¥${t.budget.meal}</span></div>
            <div class="trip-expense-row"><span class="expense-label">其他</span><span class="expense-value">¥${t.budget.other}</span></div>
            <div class="trip-expense-row" style="font-weight:700;border-top:2px solid var(--border);"><span>预算合计</span><span class="expense-value primary" style="font-size:16px;">¥${t.budget.total}</span></div>
        </div>

        <div class="card-section">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-check-circle" style="color:var(--success);margin-right:6px;"></i>审批流程</h4>
            <div class="approval-flow-row">
                ${t.flow.map(f => `<div class="approval-node ${f.done?'done':'pending'}"><div class="node-title">${f.step}</div><div class="node-name">${f.user}</div>${f.done?`<div class="node-time">${f.time}</div>`:''}</div>${f !== t.flow[t.flow.length-1] ? `<div class="approval-connector ${f.done?'done':''}"><i class="fa fa-arrow-right"></i></div>` : ''}`).join('')}
            </div>
        </div>`;

    $('#genericModalTitle').textContent = '出差详情';
    $('#genericModalBody').innerHTML = body;
    openModal('genericModal');
}

async function approveTrip(id) { const r=await API.approveTrip(id,{status:'已通过',approver:mockData.currentUser.name}); closeModal('genericModal'); showToast(r.success?`出差申请 ${id} 已批准`:(r.message||'操作失败'), r.success?'success':'error'); if(r.success) renderView('businesstrip'); }
async function rejectTrip(id) { const r=await API.approveTrip(id,{status:'已驳回',approver:mockData.currentUser.name}); closeModal('genericModal'); showToast(r.success?`出差申请 ${id} 已驳回`:(r.message||'操作失败'), r.success?'warning':'error'); if(r.success) renderView('businesstrip'); }
function showNewTripForm() {
    $('#genericModalTitle').textContent = '申请出差';
    $('#genericModalBody').innerHTML = `
        <div class="grid-2">
            <div class="form-field"><label>出发城市</label><input type="text" id="newTripFrom" value="成都"></div>
            <div class="form-field"><label>目的城市 <span class="required">*</span></label><input type="text" id="newTripTo" placeholder="请输入目的城市"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>出发日期 <span class="required">*</span></label><input type="date" id="newTripStart"></div>
            <div class="form-field"><label>返回日期</label><input type="date" id="newTripEnd"></div>
        </div>
        <div class="form-field"><label>出差天数</label><input type="number" id="newTripDays" placeholder="0"></div>
        <div class="form-field"><label>出差目的</label><textarea rows="3" id="newTripPurpose" placeholder="请输入出差目的和任务安排"></textarea></div>
        <div class="card-section">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;"><i class="fa fa-cny" style="color:var(--warning);margin-right:6px;"></i>费用预估</h4>
            <div class="grid-2">
                <div class="form-field"><label>交通费</label><input type="number" id="newTripTransport" placeholder="0"></div>
                <div class="form-field"><label>住宿费</label><input type="number" id="newTripHotel" placeholder="0"></div>
            </div>
            <div class="grid-2">
                <div class="form-field"><label>餐饮费</label><input type="number" id="newTripMeal" placeholder="0"></div>
                <div class="form-field"><label>其他费用</label><input type="number" id="newTripOther" placeholder="0"></div>
            </div>
        </div>
        <div class="form-field"><label>审批人</label><select id="newTripApprover" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"><option>林伟杰</option><option>赵总</option></select></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-ghost" onclick="closeModal('genericModal')">取消</button>
            <button class="btn btn-primary" onclick="submitNewTrip()"><i class="fa fa-paper-plane"></i> 提交申请</button>
        </div>`;
    openModal('genericModal');
}

/* ===== 新增：导出/新建提交（接后端 API） ===== */
function exportLeave() { API.exportData('leave', 'csv'); }
async function submitNewProject() {
    const data = {
        name: $('#newProjName').value.trim(),
        customer: $('#newProjCustomer').value.trim() || '-',
        priority: $('#newProjPriority').value,
        startDate: $('#newProjStart').value || '-',
        endDate: $('#newProjEnd').value || '-',
        budget: Number($('#newProjBudget').value) || 0,
        manager: $('#newProjManager').value
    };
    if (!data.name) { showToast('请输入项目名称', 'warning'); return; }
    const r = await API.addProject(data);
    if (r.success) { closeModal('genericModal'); showToast('项目立项申请已提交', 'success'); renderView('project'); }
    else { showToast(r.message || '提交失败', 'error'); }
}
async function submitNewTrip() {
    const transport = Number($('#newTripTransport').value) || 0;
    const hotel = Number($('#newTripHotel').value) || 0;
    const meal = Number($('#newTripMeal').value) || 0;
    const other = Number($('#newTripOther').value) || 0;
    const data = {
        applicant: mockData.currentUser.name,
        fromCity: $('#newTripFrom').value.trim() || '成都',
        toCity: $('#newTripTo').value.trim(),
        startDate: $('#newTripStart').value,
        endDate: $('#newTripEnd').value,
        days: $('#newTripDays').value ? Number($('#newTripDays').value) : 0,
        purpose: $('#newTripPurpose').value.trim(),
        budget: { transport, hotel, meal, other, total: transport + hotel + meal + other },
        approver: $('#newTripApprover').value
    };
    if (!data.toCity || !data.startDate) { showToast('请填写目的城市和出发日期', 'warning'); return; }
    const r = await API.applyTrip(data);
    if (r.success) { closeModal('genericModal'); showToast('出差申请已提交', 'success'); renderView('businesstrip'); }
    else { showToast(r.message || '提交失败', 'error'); }
}

/* ===== 采购管理（新建/审批/删除） ===== */
function showNewPurchaseForm() {
    $('#genericModalTitle').textContent = '新建采购';
    $('#genericModalBody').innerHTML = `
        <div class="form-field"><label>采购名称 <span class="required">*</span></label><input type="text" id="newPurTitle" placeholder="请输入采购名称"></div>
        <div class="grid-2">
            <div class="form-field"><label>类别</label><select id="newPurCategory" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"><option>电子设备</option><option>办公用品</option><option>IT设备</option><option>商务礼品</option><option>其他</option></select></div>
            <div class="form-field"><label>供应商</label><input type="text" id="newPurVendor" placeholder="供应商"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>金额（元）</label><input type="number" id="newPurAmount" placeholder="0"></div>
            <div class="form-field"><label>数量</label><input type="number" id="newPurQty" placeholder="1"></div>
        </div>
        <div class="form-field"><label>单位</label><input type="text" id="newPurUnit" value="件" placeholder="件"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-ghost" onclick="closeModal('genericModal')">取消</button>
            <button class="btn btn-primary" onclick="submitNewPurchase()"><i class="fa fa-paper-plane"></i> 提交申请</button>
        </div>`;
    openModal('genericModal');
}
async function submitNewPurchase() {
    const data = {
        title: $('#newPurTitle').value.trim(),
        category: $('#newPurCategory').value,
        vendor: $('#newPurVendor').value.trim() || '-',
        amount: Number($('#newPurAmount').value) || 0,
        qty: Number($('#newPurQty').value) || 1,
        unit: $('#newPurUnit').value.trim() || '件',
        applicant: mockData.currentUser.name
    };
    if (!data.title) { showToast('请输入采购名称', 'warning'); return; }
    const r = await API.addPurchase(data);
    if (r.success) { closeModal('genericModal'); showToast('采购申请已提交', 'success'); renderView('purchase'); }
    else { showToast(r.message || '提交失败', 'error'); }
}
async function approvePurchase(id) {
    const r = await API.approvePurchase(id, { status: '采购中', approver: mockData.currentUser.name });
    showToast(r.success ? '采购审批已更新' : (r.message || '操作失败'), r.success ? 'success' : 'error');
    if (r.success) renderView('purchase');
}
async function deletePurchase(id) {
    const r = await API.deletePurchase(id);
    showToast(r.success ? '已删除' : (r.message || '删除失败'), r.success ? 'success' : 'error');
    if (r.success) renderView('purchase');
}

/* ===== 人事管理（新增/编辑/删除） ===== */
function showNewEmployeeForm(id) {
    const e = id ? mockData.hrEmployees.find(x => x.id === id) : null;
    $('#genericModalTitle').textContent = e ? '编辑员工' : '新增员工';
    $('#genericModalBody').innerHTML = `
        <div class="grid-2">
            <div class="form-field"><label>工号 <span class="required">*</span></label><input type="text" id="empId" value="${e ? e.id : ''}" ${e ? 'readonly' : ''} placeholder="如 ZM013"></div>
            <div class="form-field"><label>姓名 <span class="required">*</span></label><input type="text" id="empName" value="${e ? e.name : ''}" placeholder="姓名"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>部门</label><input type="text" id="empDept" value="${e ? e.dept : ''}" placeholder="部门"></div>
            <div class="form-field"><label>职位</label><input type="text" id="empRole" value="${e ? e.role : ''}" placeholder="职位"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>职级</label><input type="text" id="empLevel" value="${e ? e.level : ''}" placeholder="如 P3"></div>
            <div class="form-field"><label>学历</label><input type="text" id="empEdu" value="${e ? e.education : ''}" placeholder="如 本科"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>手机</label><input type="text" id="empPhone" placeholder="手机"></div>
            <div class="form-field"><label>状态</label><select id="empStatus" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"><option ${e && e.status === '在职' ? 'selected' : ''}>在职</option><option ${e && e.status === '试用期' ? 'selected' : ''}>试用期</option><option ${e && e.status === '请假' ? 'selected' : ''}>请假</option></select></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-ghost" onclick="closeModal('genericModal')">取消</button>
            <button class="btn btn-primary" onclick="submitEmployee('${e ? e.id : ''}')"><i class="fa fa-paper-plane"></i> ${e ? '保存修改' : '提交'}</button>
        </div>`;
    openModal('genericModal');
}
async function submitEmployee(editId) {
    const data = {
        id: $('#empId').value.trim(),
        name: $('#empName').value.trim(),
        dept: $('#empDept').value.trim(),
        role: $('#empRole').value.trim(),
        level: $('#empLevel').value.trim(),
        education: $('#empEdu').value.trim(),
        phone: $('#empPhone').value.trim(),
        status: $('#empStatus').value
    };
    if (!data.id || !data.name) { showToast('请填写工号和姓名', 'warning'); return; }
    const r = editId ? await API.updateUser(editId, data) : await API.addUser(data);
    if (r.success) { closeModal('genericModal'); showToast(editId ? '员工已更新' : '员工已添加', 'success'); renderView('hr'); }
    else { showToast(r.message || '操作失败', 'error'); }
}
async function deleteEmployee(id) {
    const r = await API.deleteUser(id);
    showToast(r.success ? '员工已删除' : (r.message || '删除失败'), r.success ? 'success' : 'error');
    if (r.success) renderView('hr');
}

/* ===== 部门管理（新增/删除） ===== */
function showNewDeptForm() {
    $('#genericModalTitle').textContent = '新增部门';
    const parentOpts = mockData.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    $('#genericModalBody').innerHTML = `
        <div class="form-field"><label>部门名称 <span class="required">*</span></label><input type="text" id="deptName" placeholder="部门名称"></div>
        <div class="grid-2">
            <div class="form-field"><label>负责人</label><input type="text" id="deptHead" placeholder="负责人"></div>
            <div class="form-field"><label>上级部门</label><select id="deptParent" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"><option value="">无（顶级部门）</option>${parentOpts}</select></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-ghost" onclick="closeModal('genericModal')">取消</button>
            <button class="btn btn-primary" onclick="submitNewDept()"><i class="fa fa-paper-plane"></i> 添加</button>
        </div>`;
    openModal('genericModal');
}
async function submitNewDept() {
    const data = { name: $('#deptName').value.trim(), head: $('#deptHead').value.trim() || '-', parentId: $('#deptParent').value || null };
    if (!data.name) { showToast('请输入部门名称', 'warning'); return; }
    const r = await API.addDepartment(data);
    if (r.success) { closeModal('genericModal'); showToast('部门已添加', 'success'); renderView('department'); }
    else { showToast(r.message || '添加失败', 'error'); }
}
async function deleteDept(id) {
    const r = await API.deleteDepartment(id);
    showToast(r.success ? '部门已删除' : (r.message || '删除失败'), r.success ? 'success' : 'error');
    if (r.success) renderView('department');
}

/* ===== 系统设置保存 ===== */
async function saveCompanySettings() {
    const r = await API.saveSettings({ company_address: $('#setAddress').value, checkin_radius: $('#setRadius').value });
    showToast(r.success ? '企业信息已保存' : (r.message || '保存失败'), r.success ? 'success' : 'error');
}
async function saveAttendanceSettings() {
    const r = await API.saveSettings({ work_start_time: $('#setStart').value, work_end_time: $('#setEnd').value });
    showToast(r.success ? '考勤规则已保存' : (r.message || '保存失败'), r.success ? 'success' : 'error');
}

/* ===== 列表删除（通用）+ 合同新建 + XSS 转义 ===== */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
async function deleteCustomer(id) { if (!confirm('确认删除该客户？')) return; const r = await API.deleteCustomer(id); showToast(r.success ? '已删除' : (r.message || '删除失败'), r.success ? 'success' : 'error'); if (r.success) renderCustomers($('#viewContainer')); }
async function deleteContract(id) { if (!confirm('确认删除该合同？')) return; const r = await API.deleteContract(id); showToast(r.success ? '已删除' : (r.message || '删除失败'), r.success ? 'success' : 'error'); if (r.success) renderView('contract'); }
async function deleteProject(id) { if (!confirm('确认删除该项目？')) return; const r = await API.deleteProject(id); showToast(r.success ? '已删除' : (r.message || '删除失败'), r.success ? 'success' : 'error'); if (r.success) renderView('project'); }
async function deleteTrip(id) { if (!confirm('确认删除该出差申请？')) return; const r = await API.deleteTrip(id); showToast(r.success ? '已删除' : (r.message || '删除失败'), r.success ? 'success' : 'error'); if (r.success) renderView('businesstrip'); }
async function deleteReport(id) { if (!confirm('确认删除该汇报？')) return; const r = await API.deleteReport(id); showToast(r.success ? '已删除' : (r.message || '删除失败'), r.success ? 'success' : 'error'); if (r.success) renderView('reports'); }
function showNewContractForm() {
    $('#genericModalTitle').textContent = '新建合同';
    $('#genericModalBody').innerHTML = `
        <div class="grid-2">
            <div class="form-field"><label>合同编号 <span class="required">*</span></label><input type="text" id="ctId" placeholder="如 CT-2026-060"></div>
            <div class="form-field"><label>合同名称 <span class="required">*</span></label><input type="text" id="ctName" placeholder="合同名称"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>客户名称</label><input type="text" id="ctCustomer" placeholder="客户"></div>
            <div class="form-field"><label>合同类型</label><select id="ctType" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"><option>销售合同</option><option>服务合同</option><option>采购合同</option><option>续签合同</option></select></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>金额（元）</label><input type="number" id="ctAmount" placeholder="0"></div>
            <div class="form-field"><label>创建人</label><input type="text" id="ctCreator" value="${mockData.currentUser.name}"></div>
        </div>
        <div class="grid-2">
            <div class="form-field"><label>开始日期</label><input type="date" id="ctStart"></div>
            <div class="form-field"><label>结束日期</label><input type="date" id="ctEnd"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button class="btn btn-ghost" onclick="closeModal('genericModal')">取消</button>
            <button class="btn btn-primary" onclick="submitNewContract()"><i class="fa fa-paper-plane"></i> 提交</button>
        </div>`;
    openModal('genericModal');
}
async function submitNewContract() {
    const data = {
        id: $('#ctId').value.trim(),
        name: $('#ctName').value.trim(),
        customer: $('#ctCustomer').value.trim() || '-',
        type: $('#ctType').value,
        amount: Number($('#ctAmount').value) || 0,
        startDate: $('#ctStart').value || '-',
        endDate: $('#ctEnd').value || '-',
        creator: $('#ctCreator').value.trim() || mockData.currentUser.name
    };
    if (!data.id || !data.name) { showToast('请填写合同编号和名称', 'warning'); return; }
    const r = await API.addContract(data);
    if (r.success) { closeModal('genericModal'); showToast('合同提交成功', 'success'); renderView('contract'); }
    else { showToast(r.message || '提交失败', 'error'); }
}

async function addCustomerFollowup(id) {
    const content = prompt('请输入跟进记录内容：');
    if (!content) return;
    const r = await API.addFollowUp(id, { date: new Date().toISOString().slice(0, 10), type: '拜访', content, operator: mockData.currentUser.name });
    if (r.success) { showToast('跟进记录已添加', 'success'); await API.syncAllData(mockData); viewCustomerDetail(id); }
    else { showToast(r.message || '添加失败', 'error'); }
}

/* ============================================
 * 系统设置
 * ============================================ */
function renderSettings(c) { c.innerHTML=`<div class="page-header"><h2>系统设置</h2><p>配置系统参数，个性化您的办公体验</p></div><div class="grid-2"><div class="card"><div class="card-header"><h3><i class="fa fa-building" style="color:var(--primary);margin-right:8px;"></i>企业信息</h3></div><div class="card-body"><div class="form-field"><label>企业名称</label><input type="text" value="四川卓盟科技有限公司" readonly></div><div class="form-field"><label>企业地址</label><input type="text" id="setAddress" value="成都市高新区天府软件园D区7栋"></div><div class="form-field"><label>考勤半径（米）</label><input type="text" id="setRadius" value="500"><div class="hint">员工打卡位置距公司在此范围内视为正常考勤</div></div><button class="btn btn-primary" onclick="saveCompanySettings()"><i class="fa fa-save"></i> 保存设置</button></div></div><div class="card"><div class="card-header"><h3><i class="fa fa-clock-o" style="color:var(--success);margin-right:8px;"></i>考勤规则</h3></div><div class="card-body"><div class="grid-2"><div class="form-field"><label>上班时间</label><input type="text" id="setStart" value="09:00"></div><div class="form-field"><label>下班时间</label><input type="text" id="setEnd" value="18:00"></div></div><div class="form-field"><label>外勤打卡要求</label><div style="display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--bg-hover);border-radius:8px;"><label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" checked> 需要拍照</label><label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" checked> 需要GPS定位</label><label style="display:flex;align-items:center;gap:8px;font-weight:400;"><input type="checkbox" checked> 需要关联客户</label></div></div><button class="btn btn-primary" onclick="saveAttendanceSettings()"><i class="fa fa-save"></i> 保存规则</button></div></div></div><div class="card mt-24"><div class="card-header"><h3><i class="fa fa-shield" style="color:var(--warning);margin-right:8px;"></i>关于系统</h3></div><div class="card-body"><div class="grid-3"><div style="text-align:center;padding:20px;"><i class="fa fa-cube" style="font-size:36px;color:var(--primary);"></i><div class="fw-700 mt-16">卓盟智办公</div><div class="fs-12 text-muted">版本 V2.6.0</div></div><div style="text-align:center;padding:20px;"><i class="fa fa-server" style="font-size:36px;color:var(--success);"></i><div class="fw-600 mt-16 fs-13">服务状态</div><span class="tag tag-success">运行正常</span></div><div style="text-align:center;padding:20px;"><i class="fa fa-headphones" style="font-size:36px;color:var(--purple);"></i><div class="fw-600 mt-16 fs-13">技术支持</div><div class="fs-12 text-muted">400-888-XXXX</div></div></div></div></div>`; }

/* ===== 弹窗外部关闭 ===== */
$$('.modal-overlay').forEach(overlay => { overlay.addEventListener('click', (e) => { if(e.target===overlay) overlay.classList.remove('show'); }); });
