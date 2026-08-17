import request from '../../api/request';

const qs = (params) => {
  if (!params) return '';
  const s = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return s ? '?' + s : '';
};

// 项目管理（医疗器械销售 + AI技术自研专项）接口，1:1 对应参考项目 /projects/* 端点
export const projectsApi = {
  list: (params) => request.get('/projects' + qs(params)),
  get: (id) => request.get(`/projects/${id}`),
  create: (data) => request.post('/projects', data),
  update: (id, data) => request.put(`/projects/${id}`, data),
  submit: (id) => request.post(`/projects/${id}/submit`),
  approve: (id, opinion) => request.post(`/projects/${id}/approve`, { opinion }),
  reject: (id, remark) => request.post(`/projects/${id}/reject`, { remark }),
  addMember: (id, data) => request.post(`/projects/${id}/members`, data),
  removeMember: (id, memberId) => request.delete(`/projects/${id}/members/${memberId}`),
  addTask: (id, data) => request.post(`/projects/${id}/tasks`, data),
  updateTask: (taskId, data) => request.put(`/projects/tasks/${taskId}`, data),
  addPayment: (id, data) => request.post(`/projects/${id}/payments`, data),
  recordPayment: (payId, data) => request.put(`/projects/payments/${payId}`, data),
  confirmPayment: (payId) => request.post(`/projects/payments/${payId}/confirm`),
  addDelivery: (id, data) => request.post(`/projects/${id}/deliveries`, data),
  updateDelivery: (did, data) => request.put(`/projects/deliveries/${did}`, data),
  addAftersale: (id, data) => request.post(`/projects/${id}/aftersales`, data),
  updateAftersale: (aid, data) => request.put(`/projects/aftersales/${aid}`, data),
  addVersion: (id, data) => request.post(`/projects/${id}/versions`, data),
  addTest: (id, data) => request.post(`/projects/${id}/tests`, data),
  updateTest: (tid, data) => request.put(`/projects/tests/${tid}`, data),
  uploadDoc: (id, data) => request.post(`/projects/${id}/docs`, data),
  deleteDoc: (docId) => request.delete(`/projects/docs/${docId}`),
  createChange: (id, data) => request.post(`/projects/${id}/changes`, data),
  approveChange: (changeId, opinion) => request.post(`/projects/changes/${changeId}/approve`, { opinion }),
  rejectChange: (changeId, remark) => request.post(`/projects/changes/${changeId}/reject`, { remark }),
  addRisk: (id, data) => request.post(`/projects/${id}/risks`, data),
  handleRisk: (rid, data) => request.put(`/projects/risks/${rid}`, data),
  risks: () => request.get('/projects/risks'),
  report: () => request.get('/projects/report'),
  close: (id, report) => request.post(`/projects/${id}/close`, { report }),
  closeApprove: (id, opinion) => request.post(`/projects/${id}/close-approve`, { opinion }),
  closeReject: (id, remark) => request.post(`/projects/${id}/close-reject`, { remark }),
  archive: (id) => request.post(`/projects/${id}/archive`),
};

/* ===== 通用标签颜色映射（对齐参考项目 tag-* 样式） ===== */
export const projStatusType = (s) =>
  s === '进行中' ? 'success'
    : ['待审批', '审批中', '结项审批中'].includes(s) ? 'warning'
      : s === '已驳回' ? 'danger' : 'primary';

export const riskLevelType = (l) => (l === '高' ? 'danger' : l === '中' ? 'warning' : 'success');

export const paymentStatusType = (s) => (s === '已回款' ? 'success' : s === '逾期' ? 'danger' : 'warning');

export const doneStatusType = (s) => (s === '已完成' ? 'success' : 'warning');

export const taskStatusType = (s) => (s === '已完成' ? 'success' : s === '已逾期' ? 'danger' : 'warning');

export const testResultType = (r) => (r === '通过' ? 'success' : r === '不通过' ? 'danger' : 'warning');

export const changeStatusType = (s) => (s === '已通过' ? 'success' : s === '已驳回' ? 'danger' : 'warning');

export const fmtMoney = (n) => '¥' + Number(n || 0).toLocaleString();
