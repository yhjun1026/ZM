// 21 个业务模块的单一数据源：路由表与侧栏菜单都从此生成
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
    ]
  },
  {
    title: '业务管理',
    items: [
      { path: '/customers', title: '客户管理', icon: 'User' },
      { path: '/contract', title: '合同审批', icon: 'Tickets', badge: 'pendingContracts' },
      { path: '/purchase', title: '采购管理', icon: 'ShoppingCart' },
      { path: '/project', title: '项目管理', icon: 'Folder', badge: 'activeProjects' },
      { path: '/businesstrip', title: '出差申请', icon: 'Promotion' },
      { path: '/sales', title: '销售统计', icon: 'TrendCharts' },
      { path: '/supplier', title: '供应商管理', icon: 'ShoppingBag' },
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
    ]
  },
  {
    title: '财务数据',
    items: [
      { path: '/finance', title: '财务管理', icon: 'Coin', badge: 'pendingFinance' },
      { path: '/statistics', title: '统计分析', icon: 'PieChart' },
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
  '/customers': () => import('../views/Customers.vue'),
  '/contract': () => import('../views/Contract.vue'),
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
  '/finance': () => import('../views/Finance.vue'),
  '/statistics': () => import('../views/Statistics.vue'),
};

export const childRoutes = modules.map((m) => ({
  path: m.path.slice(1), // 子路由去掉前导 /
  name: m.path.slice(1),
  component: viewModules[m.path],
  meta: { title: m.title },
}));
