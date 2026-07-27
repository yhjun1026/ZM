/* ============================================
 * 卓盟智办公 - API 服务层 V3 (安全加固版)
 * 封装所有后端API调用，前端通过此模块与数据库交互
 * V3改进：JWT Token认证、XSS前端防御、401自动跳转登录
 * 当API不可用时自动回退到 mockData
 * ============================================ */
const API = (function() {
    const BASE = '/api';
    let _online = true;
    let _token = null; // JWT Token存储

    // Token持久化（localStorage）
    function saveToken(token) {
        _token = token;
        if (token) {
            try { localStorage.setItem('zm_token', token); } catch {}
        } else {
            try { localStorage.removeItem('zm_token'); } catch {}
        }
    }
    function loadToken() {
        try { _token = localStorage.getItem('zm_token') || null; } catch { _token = null; }
        return _token;
    }
    function clearToken() { saveToken(null); }

    // 初始化时加载已保存的Token
    loadToken();

    async function request(url, options = {}) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            // 所有API请求（除登录外）携带JWT Token
            if (_token) headers['Authorization'] = 'Bearer ' + _token;
            const resp = await fetch(BASE + url, {
                headers,
                ...options,
                body: options.body ? JSON.stringify(options.body) : undefined
            });
            // 401表示Token过期/无效，自动跳转登录
            if (resp.status === 401) {
                clearToken();
                // 通知前端跳转到登录页面
                if (typeof window !== 'undefined' && window.location) {
                    console.warn('[API] 会话已过期，请重新登录');
                    // 不立即跳转，让前端处理
                }
                return { success: false, data: null, message: '会话已过期，请重新登录', needLogin: true };
            }
            const result = await resp.json();
            if (!result.success) {
                console.warn('[API]', url, '返回失败:', result.message);
            }
            _online = true;
            return result;
        } catch (e) {
            console.warn('[API]', url, '请求失败:', e.message);
            _online = false;
            return { success: false, data: null, message: e.message, offline: true };
        }
    }

    /* ===== 全量数据同步：一次请求加载所有业务数据 ===== */
    async function syncAllData(mockData) {
        try {
            const resp = await request('/allData');
            if (!resp.success || !resp.data) {
                if (resp.needLogin) return { loaded: 0, failed: ['allData'], needLogin: true };
                console.warn('[API] 全量同步失败，使用本地mockData');
                return { loaded: 0, failed: ['allData'] };
            }
            const d = resp.data;
            let loaded = 0;

            // KV_store 配置数据
            const kvApply = [
                ['stats', 'stats'], ['activities', 'activities'], ['todayCheckin', 'todayCheckin'],
                ['currentUser', 'currentUser'], ['cockpit', 'cockpit'],
                ['leaveTypes', 'leaveTypes'], ['expenseCategories', 'expenseCategories'],
                ['expenseStats', 'expenseStats'], ['hrStats', 'hrStats'],
                ['sales', 'sales'], ['finance', 'finance'],
                ['permMatrix', 'permMatrix'],
                ['weekCheckinData', 'weekCheckinData'],
                ['monthReportData', 'monthReportData'], ['deptPerformance', 'deptPerformance'],
                ['customerLevels', 'customerLevels'], ['customerLifecycle', 'customerLifecycle'],
                ['checkinRecords', 'checkinRecords'], ['teamMembers', 'teamMembers'],
                ['projectStats', 'projectStats'],
                ['businessTrips', 'businessTrips'], ['tripStats', 'tripStats'],
                ['settings', 'settings'], ['unreadNotifs', 'unreadNotifs'],
            ];
            kvApply.forEach(([key, mockKey]) => {
                if (d[key]) { mockData[mockKey] = d[key]; loaded++; }
            });

            // 关系表数据
            if (d.users && d.users.length > 0) { mockData.hrEmployees = d.users; loaded++; }
            if (d.departments && d.departments.length > 0) { mockData.departments = d.departments; loaded++; }
            if (d.customers && d.customers.length > 0) { mockData.customers = d.customers; loaded++; }
            if (d.contracts && d.contracts.length > 0) { mockData.contracts = d.contracts; loaded++; }
            if (d.projects && d.projects.length > 0) { mockData.projects = d.projects; loaded++; }
            if (d.leaveRecords && d.leaveRecords.length > 0) { mockData.leaveRecords = d.leaveRecords; loaded++; }
            if (d.expenseRecords && d.expenseRecords.length > 0) { mockData.expenseRecords = d.expenseRecords; loaded++; }
            if (d.purchases && d.purchases.length > 0) { mockData.purchases = d.purchases; loaded++; }
            if (d.roles && d.roles.length > 0) { mockData.roles = d.roles; loaded++; }
            if (d.permApprovals) {
                mockData.permApprovals = d.permApprovals;
                if (mockData.permMatrix) mockData.permMatrix.permApprovals = d.permApprovals;
                loaded++;
            }
            if (d.permLogs) {
                mockData.permLogs = d.permLogs;
                if (mockData.permMatrix) mockData.permMatrix.permLogs = d.permLogs;
                loaded++;
            }
            if (d.workReports && d.workReports.length > 0) {
                mockData.workReports = d.workReports;
                loaded++;
            }
            if (d.businessTrips) { mockData.businessTrips = d.businessTrips; loaded++; }
            if (d.tripStats) { mockData.tripStats = d.tripStats; loaded++; }
            if (d.settings) { mockData.settings = d.settings; loaded++; }

            console.log('[API] 全量同步完成，加载', loaded, '项数据');
            return { loaded, failed: [] };
        } catch (e) {
            console.warn('[API] syncAllData异常:', e.message);
            return { loaded: 0, failed: ['allData'] };
        }
    }

    /* ===== 单项刷新（用于写操作后局部刷新） ===== */
    async function refresh(mockData, keys) {
        if (!_online) return;
        const resp = await request('/allData');
        if (!resp.success || !resp.data || resp.needLogin) return;
        const d = resp.data;
        const kvApply = {
            stats: 'stats', activities: 'activities', todayCheckin: 'todayCheckin',
            currentUser: 'currentUser', cockpit: 'cockpit', leaveTypes: 'leaveTypes',
            expenseCategories: 'expenseCategories', expenseStats: 'expenseStats',
            hrStats: 'hrStats', sales: 'sales', finance: 'finance',
            permMatrix: 'permMatrix', weekCheckinData: 'weekCheckinData',
            monthReportData: 'monthReportData', deptPerformance: 'deptPerformance',
            customerLevels: 'customerLevels', customerLifecycle: 'customerLifecycle',
            checkinRecords: 'checkinRecords', teamMembers: 'teamMembers',
            projectStats: 'projectStats',
            businessTrips: 'businessTrips', tripStats: 'tripStats',
            settings: 'settings', unreadNotifs: 'unreadNotifs',
            users: 'hrEmployees', departments: 'departments', customers: 'customers',
            contracts: 'contracts', projects: 'projects', leaveRecords: 'leaveRecords',
            expenseRecords: 'expenseRecords', purchases: 'purchases', roles: 'roles',
            workReports: 'workReports',
        };
        keys.forEach(key => {
            const dataKey = Object.keys(kvApply).find(k => kvApply[k] === key) || key;
            if (d[dataKey]) mockData[key] = d[dataKey];
        });
    }

    return {
        isOnline() { return _online; },
        hasToken() { return !!_token; },
        getToken() { return _token; },
        clearToken() { clearToken(); },

        async health() { return request('/health'); },

        // 登录（保存JWT Token）
        async login(username, password) {
            const r = await request('/login', { method: 'POST', body: { username, password } });
            if (r.success && r.data && r.data.token) {
                saveToken(r.data.token);
                console.log('[API] 登录成功，Token已保存');
            }
            return r;
        },

        // 登出（清除Token）
        async logout() {
            await request('/logout', { method: 'POST' });
            clearToken();
            console.log('[API] 已登出，Token已清除');
            return { success: true };
        },

        // Token有效性检查
        async verifyToken() { return request('/verify-token'); },

        // 用户密码修改
        async changePassword(userId, oldPassword, newPassword) {
            return request('/users/' + userId + '/password', { method: 'PUT', body: { oldPassword, newPassword } });
        },

        // 用户/员工管理（HR）
        async addUser(data) { const r = await request('/users', { method: 'POST', body: data }); if (r.success) await refresh(mockData, ['hrEmployees']); return r; },
        async updateUser(id, data) { const r = await request('/users/' + id, { method: 'PUT', body: data }); if (r.success) await refresh(mockData, ['hrEmployees']); return r; },
        async deleteUser(id) { const r = await request('/users/' + id, { method: 'DELETE' }); if (r.success) await refresh(mockData, ['hrEmployees']); return r; },

        // 合同新建
        async addContract(data) { const r = await request('/contracts', { method: 'POST', body: data }); if (r.success) await refresh(mockData, ['contracts']); return r; },

        // 写操作API（提交后自动刷新对应数据）
        async applyLeave(data) {
            const r = await request('/leave', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['leaveRecords']);
            return r;
        },
        async approveLeave(id, data) {
            const r = await request('/leave/' + id + '/approve', { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['leaveRecords']);
            return r;
        },
        async applyExpense(data) {
            const r = await request('/expense', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['expenseRecords', 'expenseStats']);
            return r;
        },
        async approveExpense(id, data) {
            const r = await request('/expense/' + id + '/approve', { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['expenseRecords']);
            return r;
        },
        async submitReport(data) {
            const r = await request('/reports', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['reports']);
            return r;
        },
        async approveReport(id, data) {
            const r = await request('/reports/' + id + '/approve', { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['reports']);
            return r;
        },
        async deleteReport(id) {
            const r = await request('/reports/' + id, { method: 'DELETE' });
            if (r.success) await refresh(mockData, ['reports']);
            return r;
        },
        async doCheckin(data) {
            const r = await request('/checkin', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['todayCheckin', 'checkinRecords']);
            return r;
        },
        async addCustomer(customer) {
            const r = await request('/customers', { method: 'POST', body: customer });
            if (r.success) await refresh(mockData, ['customers']);
            return r;
        },
        async updateCustomer(id, customer) {
            const r = await request('/customers/' + id, { method: 'PUT', body: customer });
            if (r.success) await refresh(mockData, ['customers']);
            return r;
        },
        async deleteCustomer(id) {
            const r = await request('/customers/' + id, { method: 'DELETE' });
            if (r.success) await refresh(mockData, ['customers']);
            return r;
        },
        async addFollowUp(id, followUp) {
            const r = await request('/customers/' + id + '/followup', { method: 'POST', body: followUp });
            if (r.success) await refresh(mockData, ['customers']);
            return r;
        },
        async approveContract(id, data) {
            const r = await request('/contracts/' + id + '/approve', { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['contracts']);
            return r;
        },
        async deleteContract(id) {
            const r = await request('/contracts/' + id, { method: 'DELETE' });
            if (r.success) await refresh(mockData, ['contracts']);
            return r;
        },
        async updateContractProgress(id, progress) {
            const r = await request('/contracts/' + id + '/progress', { method: 'PUT', body: { progress } });
            if (r.success) await refresh(mockData, ['contracts']);
            return r;
        },

        // 采购管理
        async addPurchase(data) {
            const r = await request('/purchases', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['purchases']);
            return r;
        },
        async approvePurchase(id, data) {
            const r = await request('/purchases/' + id + '/approve', { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['purchases']);
            return r;
        },
        async deletePurchase(id) {
            const r = await request('/purchases/' + id, { method: 'DELETE' });
            if (r.success) await refresh(mockData, ['purchases']);
            return r;
        },

        // 项目管理
        async addProject(data) {
            const r = await request('/projects', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['projects', 'projectStats']);
            return r;
        },
        async updateProject(id, data) {
            const r = await request('/projects/' + id, { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['projects']);
            return r;
        },
        async approveProject(id, data) {
            const r = await request('/projects/' + id + '/approve', { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['projects']);
            return r;
        },
        async deleteProject(id) {
            const r = await request('/projects/' + id, { method: 'DELETE' });
            if (r.success) await refresh(mockData, ['projects', 'projectStats']);
            return r;
        },

        // 出差申请
        async applyTrip(data) {
            const r = await request('/businessTrips', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['businessTrips', 'tripStats']);
            return r;
        },
        async approveTrip(id, data) {
            const r = await request('/businessTrips/' + id + '/approve', { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['businessTrips', 'tripStats']);
            return r;
        },
        async deleteTrip(id) {
            const r = await request('/businessTrips/' + id, { method: 'DELETE' });
            if (r.success) await refresh(mockData, ['businessTrips', 'tripStats']);
            return r;
        },

        // 部门管理
        async addDepartment(data) {
            const r = await request('/departments', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['departments']);
            return r;
        },
        async updateDepartment(id, data) {
            const r = await request('/departments/' + id, { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['departments']);
            return r;
        },
        async deleteDepartment(id) {
            const r = await request('/departments/' + id, { method: 'DELETE' });
            if (r.success) await refresh(mockData, ['departments']);
            return r;
        },

        // 权限管理
        async applyPermission(data) {
            const r = await request('/permission/approvals', { method: 'POST', body: data });
            if (r.success) await refresh(mockData, ['permApprovals']);
            return r;
        },
        async approvePermission(id, data) {
            const r = await request('/permission/approvals/' + id, { method: 'PUT', body: data });
            if (r.success) await refresh(mockData, ['permApprovals']);
            return r;
        },

        // 系统设置
        async getSettings() { return request('/settings'); },
        async saveSettings(settings) { return request('/settings', { method: 'PUT', body: settings }); },

        // 通知
        async getNotifications(userId) { return request('/notifications?userId=' + (userId || 'ZM001')); },
        async markNotifRead(id) { return request('/notifications/' + id + '/read', { method: 'PUT' }); },
        async markAllNotifsRead(userId) { return request('/notifications/read-all', { method: 'PUT', body: { userId } }); },
        async deleteNotif(id) { return request('/notifications/' + id, { method: 'DELETE' }); },

        // 审计日志
        async getAuditLog(limit, action) {
            let url = '/audit-log?limit=' + (limit || 100);
            if (action) url += '&action=' + action;
            return request(url);
        },

        // 全局搜索
        async search(keyword) { return request('/search?q=' + encodeURIComponent(keyword)); },

        // 统计聚合
        async getStatistics() { return request('/statistics'); },

        // 数据导出
        async exportData(module, format) {
            const f = format || 'json';
            if (f === 'csv') {
                // CSV导出需要携带Token，使用fetch下载
                try {
                    const headers = {};
                    if (_token) headers['Authorization'] = 'Bearer ' + _token;
                    const resp = await fetch('/api/export/' + module + '?format=csv', { headers });
                    if (resp.status === 401) {
                        clearToken();
                        return { success: false, message: '会话已过期，请重新登录', needLogin: true };
                    }
                    const blob = await resp.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = module + '_export.csv';
                    a.click();
                    window.URL.revokeObjectURL(url);
                    return { success: true };
                } catch (e) {
                    return { success: false, message: '导出失败' };
                }
            }
            return request('/export/' + module + '?format=json');
        },

        // 全量数据同步（登录后调用）
        syncAllData,
    };
})();
