import request from './request';

// 认证
export const login = (username, password) => request.post('/login', { username, password });
export const logout = () => request.post('/logout');
export const verifyToken = () => request.get('/verify-token');

// 工作台 / 驾驶舱
export const getDashboard = () => request.get('/dashboard');
export const getCockpit = () => request.get('/cockpit');

// 客户
export const getCustomers = () => request.get('/customers');
export const getCustomer = (id) => request.get(`/customers/${id}`);
export const addCustomer = (data) => request.post('/customers', data);
export const updateCustomer = (id, data) => request.put(`/customers/${id}`, data);
export const deleteCustomer = (id) => request.delete(`/customers/${id}`);
export const addFollowUp = (id, data) => request.post(`/customers/${id}/followup`, data);
export const getCustomerLevels = () => request.get('/customerLevels');
export const getCustomerLifecycle = () => request.get('/customerLifecycle');

// 假期
export const getLeave = () => request.get('/leave');
export const applyLeave = (data) => request.post('/leave', data);
export const approveLeave = (id, data) => request.put(`/leave/${id}/approve`, data);

// 工作汇报
export const getReports = () => request.get('/reports');
export const submitReport = (data) => request.post('/reports', data);
export const approveReport = (id, data) => request.put(`/reports/${id}/approve`, data);
export const deleteReport = (id) => request.delete(`/reports/${id}`);

// 费用报销
export const getExpense = () => request.get('/expense');
export const applyExpense = (data) => request.post('/expense', data);
export const approveExpense = (id, data) => request.put(`/expense/${id}/approve`, data);

// 合同
export const getContracts = () => request.get('/contracts');
export const addContract = (data) => request.post('/contracts', data);
export const approveContract = (id, data) => request.put(`/contracts/${id}/approve`, data);
export const updateContractProgress = (id, progress) => request.put(`/contracts/${id}/progress`, { progress });
export const deleteContract = (id) => request.delete(`/contracts/${id}`);

// 采购
export const getPurchases = () => request.get('/purchases');
export const addPurchase = (data) => request.post('/purchases', data);
export const approvePurchase = (id, data) => request.put(`/purchases/${id}/approve`, data);
export const deletePurchase = (id) => request.delete(`/purchases/${id}`);

// 供应商管理
export const getSuppliers = () => request.get('/suppliers');
export const getSupplier = (id) => request.get(`/suppliers/${id}`);
export const addSupplier = (data) => request.post('/suppliers', data);
export const updateSupplier = (id, data) => request.put(`/suppliers/${id}`, data);
export const deleteSupplier = (id) => request.delete(`/suppliers/${id}`);

// 公司文件
export const getDocuments = () => request.get('/documents');
export const getDocument = (id) => request.get(`/documents/${id}`);
export const createDocument = (data) => request.post('/documents', data);
export const submitDocument = (id) => request.post(`/documents/${id}/submit`);
export const approveDocument = (id, data) => request.post(`/documents/${id}/approve`, data);
export const rejectDocument = (id, data) => request.post(`/documents/${id}/reject`, data);
export const updateDocument = (id, data) => request.put(`/documents/${id}`, data);
export const deleteDocument = (id) => request.delete(`/documents/${id}`);

// 后勤管理
export const getLogisticsItems = () => request.get('/logistics/items');
export const getLogisticsItem = (id) => request.get(`/logistics/items/${id}`);
export const createLogisticsItem = (data) => request.post('/logistics/items', data);
export const updateLogisticsItem = (id, data) => request.put(`/logistics/items/${id}`, data);
export const getVehicles = () => request.get('/logistics/vehicles');
export const getVehicle = (id) => request.get(`/logistics/vehicles/${id}`);
export const createVehicle = (data) => request.post('/logistics/vehicles', data);
export const updateVehicle = (id, data) => request.put(`/logistics/vehicles/${id}`, data);

// 项目
export const getProjects = () => request.get('/projects');
export const addProject = (data) => request.post('/projects', data);
export const updateProject = (id, data) => request.put(`/projects/${id}`, data);
export const approveProject = (id, data) => request.put(`/projects/${id}/approve`, data);
export const deleteProject = (id) => request.delete(`/projects/${id}`);

// 出差
export const getBusinessTrips = () => request.get('/businessTrips');
export const applyTrip = (data) => request.post('/businessTrips', data);
export const approveTrip = (id, data) => request.put(`/businessTrips/${id}/approve`, data);
export const deleteTrip = (id) => request.delete(`/businessTrips/${id}`);

// 打卡
export const getCheckin = () => request.get('/checkin');
export const doCheckin = (data) => request.post('/checkin', data);

// 人事
export const getUsers = () => request.get('/users');
export const addUser = (data) => request.post('/users', data);
export const updateUser = (id, data) => request.put(`/users/${id}`, data);
export const deleteUser = (id) => request.delete(`/users/${id}`);

// 部门
export const getDepartments = () => request.get('/departments');
export const addDepartment = (data) => request.post('/departments', data);
export const updateDepartment = (id, data) => request.put(`/departments/${id}`, data);
export const deleteDepartment = (id) => request.delete(`/departments/${id}`);

// 团队
export const getTeamMembers = () => request.get('/teamMembers');

// 权限
export const getPermission = () => request.get('/permission');
export const applyPermission = (data) => request.post('/permission/approvals', data);
export const approvePermission = (id, data) => request.put(`/permission/approvals/${id}`, data);
export const getPermissionRoles = () => request.get('/permissions/roles');
export const getPermissionAuditLogs = () => request.get('/permissions/audit-logs');

// 销售 / 财务 / 统计
export const getSales = () => request.get('/sales');
export const getFinance = () => request.get('/finance');
export const getStatistics = () => request.get('/statistics');
// 销售明细录入
export const getSalesRecords = () => request.get('/sales/records');
export const addSalesRecord = (data) => request.post('/sales/records', data);
export const deleteSalesRecord = (id) => request.delete(`/sales/records/${id}`);

// 通知 / 设置 / 审计
export const getNotifications = () => request.get('/notifications');
export const markNotifRead = (id) => request.put(`/notifications/${id}/read`);
export const getSettings = () => request.get('/settings');
export const saveSettings = (data) => request.put('/settings', data);
export const getAuditLog = (params) => request.get('/audit-log', { params });
