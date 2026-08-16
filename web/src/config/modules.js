// 业务模块的单一数据源：路由表与侧栏菜单都从此生成
// 菜单结构与参考项目 frontend/index.html 完全一致
// 支持菜单分组和badge数字提醒
export const moduleGroups = [
  {
    title: '快捷入口',
    items: [
      { path: '/dashboard', title: '工作台', icon: 'Odometer' },
      { path: '/cockpit', title: '智能驾驶舱', icon: 'DataLine' },
    ]
  },
  {
    title: '考勤办公',
    items: [
      { path: '/checkin', title: '考勤管理', icon: 'Clock' },
      { path: '/reports', title: '工作汇报', icon: 'Document', badge: 'pendingReports' },
      { path: '/leave', title: '请假管理', icon: 'Calendar' },
      { path: '/expense', title: '费用报销', icon: 'Money' },
      { path: '/businesstrip', title: '出差管理', icon: 'Promotion' },
      { path: '/att-archive', title: '考勤归档', icon: 'Files' },
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
    title: '业务管理',
    items: [
      { path: '/trade-customer', title: '客户管理', icon: 'User' },
      { path: '/trade-supplier', title: '供应商管理', icon: 'ShoppingBag' },
      { path: '/trade-archive', title: '合作方档案', icon: 'Files' },
      { path: '/trade-purchase', title: '采购管理', icon: 'ShoppingCart' },
      { path: '/trade-sales', title: '销售订单管理', icon: 'Sell' },
      { path: '/project', title: '项目管理', icon: 'Folder', badge: 'activeProjects' },
    ]
  },
  {
    title: '财务管理',
    items: [
      { path: '/finance', title: '财务管理', icon: 'Coin', badge: 'pendingFinance' },
      { path: '/trade-finance', title: '财务互通中心', icon: 'Connection', badge: 'pendingTradeFin' },
      { path: '/statistics', title: '统计分析', icon: 'PieChart' },
    ]
  },
  {
    title: '人事行政',
    items: [
      { path: '/hr', title: '人事管理', icon: 'UserFilled' },
      { path: '/department', title: '部门管理', icon: 'OfficeBuilding' },
      { path: '/team', title: '团队管理', icon: 'Connection' },
      { path: '/permission', title: '权限管理', icon: 'Lock' },
      { path: '/announcement', title: '公司公告', icon: 'Bell', badge: 'pendingAnnouncements' },
      { path: '/documents', title: '公司文件', icon: 'Document', badge: 'pendingDocuments' },
    ]
  },
  {
    title: '系统管理',
    items: [
      { path: '/settings', title: '系统设置', icon: 'Setting' },
    ]
  }
];

// 扁平化的模块列表（用于路由生成）
export const modules = moduleGroups.flatMap(group => group.items);

// 视图懒加载映射（按需加载，减小首屏体积）
const viewModules = {
  '/dashboard': () => import('../views/Dashboard.vue'),
  '/cockpit': () => import('../views/Cockpit.vue'),
  '/checkin': () => import('../views/Checkin.vue'),
  '/reports': () => import('../views/Reports.vue'),
  '/leave': () => import('../views/Leave.vue'),
  '/expense': () => import('../views/Expense.vue'),
  '/businesstrip': () => import('../views/Businesstrip.vue'),
  '/att-archive': () => import('../views/AttArchive.vue'),
  '/contract': () => import('../views/Contract.vue'),
  '/contract-analytics': () => import('../views/ContractAnalytics.vue'),
  '/contract-risk': () => import('../views/ContractRisk.vue'),
  '/contract-template': () => import('../views/ContractTemplate.vue'),
  '/partner-credit': () => import('../views/PartnerCredit.vue'),
  '/trade-customer': () => import('../views/TradeCustomer.vue'),
  '/trade-supplier': () => import('../views/TradeSupplier.vue'),
  '/trade-archive': () => import('../views/TradeArchive.vue'),
  '/trade-purchase': () => import('../views/TradePurchase.vue'),
  '/trade-sales': () => import('../views/TradeSales.vue'),
  '/project': () => import('../views/Project.vue'),
  '/finance': () => import('../views/FinanceModule.vue'),
  '/trade-finance': () => import('../views/TradeFinance.vue'),
  '/statistics': () => import('../views/Statistics.vue'),
  '/hr': () => import('../views/Hr.vue'),
  '/department': () => import('../views/Department.vue'),
  '/team': () => import('../views/Team.vue'),
  '/permission': () => import('../views/Permission.vue'),
  '/announcement': () => import('../views/Announcement.vue'),
  '/documents': () => import('../views/Documents.vue'),
  '/settings': () => import('../views/Settings.vue'),
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
