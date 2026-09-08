// 业务模块的单一数据源：路由表与侧栏菜单都从此生成
// 菜单结构参考项目 backend/lib.js 的 MENU_GROUP 分组思路（组织/业务/财务/审批/日常/运营），
// 并保留本项目原有的分组命名习惯。
export const moduleGroups = [
  {
    title: '快捷入口',
    items: [
      { path: '/dashboard', title: '工作台', icon: 'Odometer' },
      { path: '/cockpit', title: '智能驾驶舱', icon: 'DataLine' },
    ]
  },
  {
    title: '业务管理',
    items: [
      { path: '/opportunity', title: '商机管理', icon: 'Opportunity' },
      { path: '/trade-customer', title: '客户管理', icon: 'User' },
      { path: '/dealer', title: '经销商管理', icon: 'Shop' },
      { path: '/trade-supplier', title: '供应商管理', icon: 'ShoppingBag' },
      { path: '/bid', title: '招投标管理', icon: 'Trophy' },
      { path: '/supply', title: '渠道履约', icon: 'Van' },
      { path: '/trade-archive', title: '合作方档案', icon: 'Files' },
      { path: '/trade-purchase', title: '采购管理', icon: 'ShoppingCart' },
      { path: '/trade-sales', title: '销售订单管理', icon: 'Sell' },
      { path: '/project', title: '项目管理', icon: 'Folder', badge: 'activeProjects' },
      { path: '/market', title: '市场活动', icon: 'Present' },
      { path: '/aftersale', title: '售后服务', icon: 'Service' },
      { path: '/qual', title: '资质合规', icon: 'Checked' },
      { path: '/archive', title: '资料档案', icon: 'FolderOpened' },
    ]
  },
  {
    title: '合同管理',
    items: [
      { path: '/contract', title: '合同管理', icon: 'Tickets', badge: 'pendingContracts' },
      { path: '/contract-analytics', title: '合同分析', icon: 'DataLine' },
      { path: '/contract-risk', title: '合同风险', icon: 'Warning' },
      { path: '/contract-template', title: '合同模板库', icon: 'Document' },
      { path: '/partner-credit', title: '合作方信用', icon: 'Handshake' },
    ]
  },
  {
    title: '财务管理',
    items: [
      { path: '/finance', title: '财务管理', icon: 'Coin', badge: 'pendingFinance' },
      { path: '/trade-finance', title: '财务互通中心', icon: 'Connection', badge: 'pendingTradeFin' },
      { path: '/budget', title: '预算管理', icon: 'Money' },
      { path: '/payout', title: '支付分成', icon: 'Wallet' },
      { path: '/statistics', title: '统计分析', icon: 'PieChart' },
      { path: '/payroll', title: '薪酬管理', icon: 'Wallet' },
      { path: '/kpi', title: '绩效管理', icon: 'TrendCharts' },
      { path: '/bizflow', title: '业财一体化', icon: 'Box' },
      { path: '/invoicing', title: '进销项发票', icon: 'Ticket' },
      { path: '/asset', title: '资产台账', icon: 'Box' },
    ]
  },
  {
    title: '考勤办公',
    items: [
      { path: '/checkin', title: '考勤管理', icon: 'Clock' },
      { path: '/reports', title: '工作汇报', icon: 'Document', badge: 'pendingReports' },
      { path: '/work-report', title: '工作报告', icon: 'Notebook' },
      { path: '/daily-office', title: '日常办公', icon: 'OfficeBuilding' },
      { path: '/leave', title: '请假管理', icon: 'Calendar' },
      { path: '/expense', title: '费用报销', icon: 'Money' },
      { path: '/businesstrip', title: '出差管理', icon: 'Promotion' },
      { path: '/att-archive', title: '考勤归档', icon: 'Files' },
    ]
  },
  {
    title: '人事行政',
    items: [
      { path: '/approvals', title: '审批中心', icon: 'CircleCheck', badge: 'pendingApprovals' },
      { path: '/hr', title: '人事管理', icon: 'UserFilled' },
      { path: '/hr-ext', title: '人事业务', icon: 'Postcard' },
      { path: '/org', title: '组织架构', icon: 'Share' },
      { path: '/department', title: '部门管理', icon: 'OfficeBuilding' },
      { path: '/team', title: '团队管理', icon: 'Connection' },
      { path: '/permission', title: '权限管理', icon: 'Lock' },
      { path: '/announcement', title: '公司公告', icon: 'Bell', badge: 'pendingAnnouncements' },
      { path: '/documents', title: '公司文件', icon: 'Document', badge: 'pendingDocuments' },
      { path: '/official-tpl', title: '公文模板库', icon: 'Collection' },
      { path: '/doclib', title: '制度与知识库', icon: 'Reading' },
      { path: '/training', title: '员工培训', icon: 'ReadingLamp' },
    ]
  },
  {
    title: '协同办公',
    items: [
      { path: '/message', title: '消息中心', icon: 'ChatDotRound' },
      { path: '/collab', title: '协同办公', icon: 'Calendar' },
      { path: '/seal', title: '印章管理', icon: 'Stamp' },
      { path: '/directory', title: '内部通讯录', icon: 'Phone' },
    ]
  },
  {
    title: '经营管理',
    items: [
      { path: '/ops', title: '经营驾驶舱', icon: 'DataAnalysis' },
      { path: '/coord', title: '业务协调', icon: 'Link' },
    ]
  },
  {
    title: '系统管理',
    items: [
      { path: '/settings', title: '系统设置', icon: 'Setting' },
      { path: '/audit', title: '审计日志', icon: 'View' },
      { path: '/search', title: '全局搜索', icon: 'Search' },
      { path: '/orgchange', title: '组织变更', icon: 'Refresh' },
      { path: '/qywx', title: '企业微信', icon: 'ChatLineSquare' },
    ]
  }
];

// 扁平化的模块列表（用于路由生成）
export const modules = moduleGroups.flatMap(group => group.items);

// 视图懒加载映射（按需加载，减小首屏体积）
const viewModules = {
  '/dashboard': () => import('../views/Dashboard.vue'),
  '/cockpit': () => import('../views/Cockpit.vue'),

  // 业务管理
  '/opportunity': () => import('../views/Opportunity.vue'),
  '/dealer': () => import('../views/Dealer.vue'),
  '/bid': () => import('../views/Bid.vue'),
  '/supply': () => import('../views/Supply.vue'),
  '/market': () => import('../views/Market.vue'),
  '/aftersale': () => import('../views/Aftersale.vue'),
  '/qual': () => import('../views/Qual.vue'),
  '/archive': () => import('../views/Archive.vue'),
  '/trade-customer': () => import('../views/TradeCustomer.vue'),
  '/trade-supplier': () => import('../views/TradeSupplier.vue'),
  '/trade-archive': () => import('../views/TradeArchive.vue'),
  '/trade-purchase': () => import('../views/TradePurchase.vue'),
  '/trade-sales': () => import('../views/TradeSales.vue'),
  '/project': () => import('../views/Project.vue'),

  // 合同管理
  '/contract': () => import('../views/Contract.vue'),
  '/contract-analytics': () => import('../views/ContractAnalytics.vue'),
  '/contract-risk': () => import('../views/ContractRisk.vue'),
  '/contract-template': () => import('../views/ContractTemplate.vue'),
  '/partner-credit': () => import('../views/PartnerCredit.vue'),

  // 财务管理
  '/finance': () => import('../views/FinanceModule.vue'),
  '/trade-finance': () => import('../views/TradeFinance.vue'),
  '/statistics': () => import('../views/Statistics.vue'),
  '/payroll': () => import('../views/Payroll.vue'),
  '/kpi': () => import('../views/Kpi.vue'),
  '/bizflow': () => import('../views/Bizflow.vue'),
  '/invoicing': () => import('../views/Invoicing.vue'),

  // 考勤办公
  '/checkin': () => import('../views/Checkin.vue'),
  '/reports': () => import('../views/Reports.vue'),
  '/leave': () => import('../views/Leave.vue'),
  '/expense': () => import('../views/Expense.vue'),
  '/businesstrip': () => import('../views/Businesstrip.vue'),
  '/att-archive': () => import('../views/AttArchive.vue'),

  // 人事行政
  '/approvals': () => import('../views/ApprovalCenter.vue'),
  '/hr': () => import('../views/Hr.vue'),
  '/hr-ext': () => import('../views/HrExt.vue'),
  '/org': () => import('../views/Org.vue'),
  '/department': () => import('../views/Department.vue'),
  '/team': () => import('../views/Team.vue'),
  '/permission': () => import('../views/Permission.vue'),
  '/announcement': () => import('../views/Announcement.vue'),
  '/documents': () => import('../views/Documents.vue'),
  '/official-tpl': () => import('../views/OfficialTpl.vue'),
  '/doclib': () => import('../views/Doclib.vue'),
  '/training': () => import('../views/Training.vue'),

  // 协同办公
  '/message': () => import('../views/Message.vue'),
  '/collab': () => import('../views/Collab.vue'),
  '/seal': () => import('../views/Seal.vue'),
  '/directory': () => import('../views/Directory.vue'),

  // 经营管理
  '/ops': () => import('../views/Ops.vue'),
  '/coord': () => import('../views/Coord.vue'),

  // 系统管理
  '/settings': () => import('../views/Settings.vue'),
  '/audit': () => import('../views/Audit.vue'),
  '/search': () => import('../views/Search.vue'),
  '/orgchange': () => import('../views/Orgchange.vue'),
  '/qywx': () => import('../views/Qywx.vue'),
  '/datasvc': () => import('../views/Datasvc.vue'),

  // 第10轮新增
  '/approvals': () => import('../views/ApprovalCenter.vue'),
  '/work-report': () => import('../views/WorkReport.vue'),
  '/daily-office': () => import('../views/DailyOffice.vue'),
  '/budget': () => import('../views/Budget.vue'),
  '/payout': () => import('../views/Payout.vue'),
  '/asset': () => import('../views/Asset.vue'),

  // 不在菜单中但保留路由的旧版/辅助页面
  '/customers': () => import('../views/Customers.vue'),
  '/purchase': () => import('../views/Purchase.vue'),
  '/supplier': () => import('../views/Supplier.vue'),
  '/sales': () => import('../views/Sales.vue'),
  '/logistics': () => import('../views/Logistics.vue'),
  '/finance-legacy': () => import('../views/Finance.vue'),
};

// 菜单路由
export const childRoutes = modules.map((m) => ({
  path: m.path.slice(1), // 子路由去掉前导 /
  name: m.path.slice(1),
  component: viewModules[m.path],
  meta: { title: m.title },
}));

// 隐藏路由（菜单不显示，但可通过链接访问）
export const hiddenChildRoutes = ['/customers', '/purchase', '/supplier', '/sales', '/logistics', '/finance-legacy'].map((p) => ({
  path: p.slice(1),
  name: p.slice(1),
  component: viewModules[p],
  meta: { title: p.slice(1), hidden: true },
}));
