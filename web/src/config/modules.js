// 业务模块的单一数据源：路由表与侧栏菜单都从此生成
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
      { path: '/checkin', title: '外勤打卡', icon: 'Location' },
      { path: '/reports', title: '工作汇报', icon: 'Document', badge: 'pendingReports' },
      { path: '/leave', title: '假期申请', icon: 'Calendar' },
      { path: '/expense', title: '费用报销', icon: 'Money' },
      { path: '/att-archive', title: '考勤归档', icon: 'Files' },
    ]
  },
  {
    title: '合同管理',
    items: [
      { path: '/contract', title: '合同审批', icon: 'Tickets', badge: 'pendingContracts' },
      { path: '/contract-analytics', title: '合同分析', icon: 'DataLine' },
      { path: '/contract-risk', title: '合同风险', icon: 'Warning' },
      { path: '/contract-template', title: '合同模板', icon: 'Document' },
      { path: '/partner-credit', title: '合作伙伴信用', icon: 'Handshake' },
    ]
  },
  {
    title: '业务管理',
    items: [
      { path: '/trade-customer', title: '交易客户', icon: 'User' },
      { path: '/trade-supplier', title: '交易供应商', icon: 'ShoppingBag' },
      { path: '/trade-archive', title: '交易归档', icon: 'Files' },
      { path: '/purchase', title: '采购管理', icon: 'ShoppingCart' },
      { path: '/project', title: '项目管理', icon: 'Folder', badge: 'activeProjects' },
      { path: '/businesstrip', title: '出差申请', icon: 'Promotion' },
      { path: '/sales', title: '销售统计', icon: 'TrendCharts' },
    ]
  },
  {
    title: '人事行政',
    items: [
      { path: '/hr', title: '人事管理', icon: 'UserFilled' },
      { path: '/department', title: '部门管理', icon: 'OfficeBuilding' },
      { path: '/team', title: '团队管理', icon: 'Connection' },
      { path: '/permission', title: '权限管理', icon: 'Lock' },
      { path: '/logistics', title: '后勤管理', icon: 'Van', badge: 'pendingLogistics' },
      { path: '/documents', title: '公司文件', icon: 'Document', badge: 'pendingDocuments' },
      { path: '/announcement', title: '公司公告', icon: 'Bell' },
    ]
  },
  {
    title: '财务数据',
    items: [
      { path: '/trade-finance', title: '交易财务', icon: 'Coin' },
      { path: '/finance', title: '财务管理', icon: 'Coin', badge: 'pendingFinance' },
      { path: '/statistics', title: '统计分析', icon: 'PieChart' },
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
  '/att-archive': () => import('../views/AttArchive.vue'),
  '/customers': () => import('../views/Customers.vue'),
  '/contract': () => import('../views/Contract.vue'),
  '/contract-analytics': () => import('../views/ContractAnalytics.vue'),
  '/contract-risk': () => import('../views/ContractRisk.vue'),
  '/contract-template': () => import('../views/ContractTemplate.vue'),
  '/partner-credit': () => import('../views/PartnerCredit.vue'),
  '/trade-customer': () => import('../views/TradeCustomer.vue'),
  '/trade-supplier': () => import('../views/TradeSupplier.vue'),
  '/trade-archive': () => import('../views/TradeArchive.vue'),
  '/purchase': () => import('../views/Purchase.vue'),
  '/project': () => import('../views/Project.vue'),
  '/businesstrip': () => import('../views/Businesstrip.vue'),
  '/sales': () => import('../views/Sales.vue'),
  '/supplier': () => import('../views/Supplier.vue'),
  '/documents': () => import('../views/Documents.vue'),
  '/logistics': () => import('../views/Logistics.vue'),
  '/hr': () => import('../views/Hr.vue'),
  '/department': () => import('../views/Department.vue'),
  '/team': () => import('../views/Team.vue'),
  '/permission': () => import('../views/Permission.vue'),
  '/announcement': () => import('../views/Announcement.vue'),
  '/trade-finance': () => import('../views/TradeFinance.vue'),
  '/finance': () => import('../views/Finance.vue'),
  '/statistics': () => import('../views/Statistics.vue'),
  '/settings': () => import('../views/Settings.vue'),
};

export const childRoutes = modules.map((m) => ({
  path: m.path.slice(1), // 子路由去掉前导 /
  name: m.path.slice(1),
  component: viewModules[m.path],
  meta: { title: m.title },
}));
