<template>
  <div v-loading="loading">
    <!-- 我的角色卡片 -->
    <div v-if="myRole" style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <el-icon style="font-size:32px;"><Lock /></el-icon>
        <div>
          <div style="font-size:20px;font-weight:700;">{{ myRole.contractRole }}</div>
          <div style="font-size:13px;opacity:.85;">
            数据范围：{{ scopeMap[myRole.dataScope] || myRole.dataScope }} | 下载权限：
            <span v-if="myRole.canDownload" style="color:#86efac;">允许</span>
            <span v-else style="color:#fca5a5;">仅预览</span>
          </div>
        </div>
      </div>
    </div>

    <template v-if="rules">
      <!-- 通用权限约束 -->
      <div class="perm-panel">
        <h3 class="perm-title"><el-icon style="vertical-align:-2px;"><Setting /></el-icon> 通用权限约束</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">
          <div style="padding:8px 12px;background:#f0fdf4;border-radius:8px;font-size:13px;">
            <el-icon style="color:#16a34a;vertical-align:-2px;"><Lock /></el-icon> 归档锁定：{{ rules.universalConstraints?.archive_lock ? '已启用' : '未启用' }}
          </div>
          <div style="padding:8px 12px;background:#fef3c7;border-radius:8px;font-size:13px;">
            <el-icon style="color:#d97706;vertical-align:-2px;"><Hide /></el-icon> 涉密隔离：{{ rules.universalConstraints?.confidential_isolation ? '已启用' : '未启用' }}
          </div>
          <div style="padding:8px 12px;background:#dbeafe;border-radius:8px;font-size:13px;">
            <el-icon style="color:#2563eb;vertical-align:-2px;"><Download /></el-icon> 下载控制：{{ rules.universalConstraints?.download_control ? '已启用' : '未启用' }}
          </div>
          <div style="padding:8px 12px;background:#f3e8ff;border-radius:8px;font-size:13px;">
            <el-icon style="color:#7c3aed;vertical-align:-2px;"><Document /></el-icon> 审计日志：{{ rules.universalConstraints?.audit_log ? '已启用' : '未启用' }}
          </div>
        </div>
      </div>

      <!-- 角色权限规则表 -->
      <div class="perm-panel">
        <h3 class="perm-title"><el-icon style="vertical-align:-2px;"><UserFilled /></el-icon> 合同角色权限规则</h3>
        <div style="overflow-x:auto;">
          <table class="perm-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>角色</th><th>数据范围</th><th>表单权限</th><th>允许操作</th><th>禁止操作</th><th style="text-align:center;">下载</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(rule, idx) in (rules.rules || [])" :key="idx" :style="idx % 2 === 1 ? 'background:#f9fafb;' : ''">
                <td style="font-weight:600;">{{ rule.role }}</td>
                <td>{{ scopeMap2[rule.dataScope] || rule.dataScope }}</td>
                <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">{{ fmtFormPerms(rule.formPermissions) }}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;color:#16a34a;">{{ (rule.allowedActions || []).join(', ') }}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;color:#dc2626;">{{ (rule.forbiddenActions || []).join(', ') }}</td>
                <td style="text-align:center;">
                  <el-icon v-if="rule.canDownload" style="color:#16a34a;"><Check /></el-icon>
                  <el-icon v-else style="color:#dc2626;"><Close /></el-icon>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 下载权限角色 -->
      <div class="perm-panel">
        <h3 class="perm-title"><el-icon style="vertical-align:-2px;"><Download /></el-icon> 下载权限角色</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span v-for="(r, i) in (rules.downloadAllowedRoles || [])" :key="i"
                style="padding:4px 12px;background:#dbeafe;border-radius:16px;font-size:13px;color:#1e40af;">{{ r }}</span>
        </div>
      </div>

      <!-- 涉密合同配置 -->
      <div v-if="rules.confidentialConfig" class="perm-panel">
        <h3 class="perm-title"><el-icon style="vertical-align:-2px;"><View /></el-icon> 涉密合同访问配置</h3>
        <div style="font-size:13px;margin-bottom:8px;">
          状态：
          <span v-if="rules.confidentialConfig.enabled" style="color:#16a34a;">已启用</span>
          <span v-else style="color:#dc2626;">未启用</span>
        </div>
        <div style="font-size:13px;margin-bottom:4px;">默认可访问涉密合同的角色：</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span v-for="(r, i) in (rules.confidentialConfig.defaultRoles || [])" :key="i"
                style="padding:4px 12px;background:#fef3c7;border-radius:16px;font-size:13px;color:#92400e;">{{ r }}</span>
        </div>
      </div>
    </template>

    <!-- 涉密访问白名单 -->
    <div v-if="canManageConf" class="perm-panel">
      <h3 class="perm-title"><el-icon style="vertical-align:-2px;"><Key /></el-icon> 涉密合同访问白名单</h3>
      <table v-if="confAccess.length" class="perm-table" style="font-size:13px;">
        <thead>
          <tr><th>用户</th><th>部门</th><th>角色</th><th>授权人</th><th style="text-align:center;">状态</th><th style="text-align:center;">操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in confAccess" :key="r.id">
            <td>{{ r.user_name }}</td>
            <td>{{ r.user_dept }}</td>
            <td>{{ r.contract_role }}</td>
            <td>{{ r.granted_by }}</td>
            <td style="text-align:center;">
              <span v-if="r.status === 1" style="color:#16a34a;">有效</span>
              <span v-else style="color:#dc2626;">禁用</span>
            </td>
            <td style="text-align:center;">
              <el-button v-if="r.status === 1" size="small" type="danger" plain @click="removeConfAccess(r.id)">移除</el-button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else style="font-size:13px;color:#909399;">暂无白名单记录（默认角色自动放行）</div>
    </div>

    <!-- 审计日志 -->
    <div v-if="canViewAudit" class="perm-panel" style="margin-bottom:0;">
      <h3 class="perm-title">
        <el-icon style="vertical-align:-2px;"><Document /></el-icon> 审计日志
        <span v-if="pagination.total" style="font-size:13px;color:#909399;">(共{{ pagination.total }}条)</span>
      </h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
        <el-input v-model="auditFilter.contractId" placeholder="合同ID" size="small" style="width:140px;" />
        <el-select v-model="auditFilter.action" placeholder="全部操作" size="small" style="width:110px;" clearable>
          <el-option v-for="a in ['查看', '下载', '归档', '用印', '作废', '上传', '删除']" :key="a" :label="a" :value="a" />
        </el-select>
        <el-date-picker v-model="auditFilter.startDate" type="date" value-format="YYYY-MM-DD" size="small" style="width:140px;" />
        <span style="font-size:13px;color:#909399;">至</span>
        <el-date-picker v-model="auditFilter.endDate" type="date" value-format="YYYY-MM-DD" size="small" style="width:140px;" />
        <el-button type="primary" size="small" @click="loadAudit(1)"><el-icon><Search /></el-icon> 筛选</el-button>
        <el-button size="small" color="#7c3aed" plain @click="exportCSV"><el-icon><Document /></el-icon> 导出CSV</el-button>
      </div>
      <table v-if="auditLogs.length" class="perm-table" style="font-size:12px;">
        <thead>
          <tr><th>时间</th><th>操作人</th><th>部门</th><th>合同ID</th><th>操作类型</th><th>详情</th></tr>
        </thead>
        <tbody>
          <tr v-for="(log, idx) in auditLogs" :key="idx" :style="idx % 2 === 1 ? 'background:#f9fafb;' : ''">
            <td>{{ log.created_at }}</td>
            <td>{{ log.user_name }}</td>
            <td>{{ log.user_dept }}</td>
            <td style="font-size:11px;">{{ log.contract_id }}</td>
            <td><span :style="`color:${actionColor(log.action_type)};font-weight:600;`">{{ log.action_type }}</span></td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">{{ log.detail }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else style="font-size:13px;color:#909399;">暂无审计日志</div>
      <div v-if="pagination.totalPages > 1" style="display:flex;justify-content:center;gap:8px;margin-top:12px;align-items:center;">
        <el-button size="small" plain @click="loadAudit(Math.max(1, (pagination.page || 1) - 1))">上一页</el-button>
        <span style="padding:4px 12px;font-size:13px;color:#909399;">{{ pagination.page || 1 }} / {{ pagination.totalPages }}</span>
        <el-button size="small" plain @click="loadAudit(Math.min(pagination.totalPages, (pagination.page || 1) + 1))">下一页</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Lock, Setting, Hide, Download, Document, UserFilled, Check, Close, View, Key, Search } from '@element-plus/icons-vue';
import request from '../../api/request';

const loading = ref(false);
const myRole = ref(null);
const rules = ref(null);
const confAccess = ref([]);
const auditLogs = ref([]);
const pagination = ref({});

const scopeMap = { self: '仅本人发起合同', dept: '本部门全部合同', all: '公司全部合同', authorized: '授权范围内全部合同' };
const scopeMap2 = { self: '仅本人', dept: '本部门', all: '全部', authorized: '授权范围' };

const contractRole = computed(() => myRole.value?.contractRole || '');
const canViewAudit = computed(() => contractRole.value === '系统超级管理员' || contractRole.value === '合同档案管理员');
const canManageConf = canViewAudit;

const fmtFormPerms = (fp) => Object.entries(fp || {}).map(([k, v]) => `${k}:${v}`).join('; ');
const actionColor = (a) => ({ '查看': '#2563eb', '下载': '#7c3aed', '归档': '#16a34a', '用印': '#d97706', '作废': '#dc2626', '上传': '#0891b2', '删除': '#dc2626' }[a] || '#6b7280');

const auditFilter = reactive({ contractId: '', action: '', startDate: '', endDate: '' });

async function load() {
  loading.value = true;
  try {
    try {
      const r = await request.get('/contract-permissions/my-role');
      if (r.code === 200) myRole.value = r.data;
    } catch (e) { /* ignore */ }
    try {
      const r = await request.get('/contract-permissions/rules');
      if (r.code === 200) rules.value = r.data;
    } catch (e) { /* ignore */ }
    if (canViewAudit.value) await loadAudit(1);
    if (canManageConf.value) {
      try {
        const r = await request.get('/contract-permissions/confidential-access');
        if (r.code === 200) confAccess.value = r.data || [];
      } catch (e) { /* ignore */ }
    }
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function auditParams(page, pageSize) {
  const params = { page, pageSize };
  if (auditFilter.contractId) params.contractId = auditFilter.contractId;
  if (auditFilter.action) params.action = auditFilter.action;
  if (auditFilter.startDate) params.startDate = auditFilter.startDate;
  if (auditFilter.endDate) params.endDate = auditFilter.endDate;
  return params;
}

async function loadAudit(page) {
  try {
    const r = await request.get('/contract-permissions/audit-log', { params: auditParams(page, 20) });
    if (r.code === 200) {
      auditLogs.value = r.data || [];
      pagination.value = r.pagination || {};
    } else {
      ElMessage.error('筛选失败: ' + (r.msg || ''));
    }
  } catch (e) { ElMessage.error('筛选异常: ' + e.message); }
}

async function removeConfAccess(id) {
  try { await ElMessageBox.confirm('确认移除该用户的涉密合同访问权限？', '提示', { type: 'warning' }); } catch { return; }
  try {
    const r = await request.delete('/contract-permissions/confidential-access/' + id);
    if (r.code === 200) { ElMessage.success('已移除'); load(); }
    else ElMessage.error('操作失败: ' + (r.msg || r.error || ''));
  } catch (e) { ElMessage.error('操作失败: ' + e.message); }
}

async function exportCSV() {
  try {
    const r = await request.get('/contract-permissions/audit-log', { params: auditParams(1, 10000) });
    if (r.code !== 200 || !r.data) { ElMessage.error('导出失败: ' + (r.msg || '')); return; }
    const logs = r.data;
    if (!logs.length) { ElMessage.warning('无数据可导出'); return; }
    const headers = ['时间', '操作人', '部门', '合同ID', '操作类型', '详情', 'IP地址'];
    const csvRows = [headers.join(',')];
    logs.forEach((log) => {
      const row = [log.created_at || '', log.user_name || '', log.user_dept || '', log.contract_id || '', log.action_type || '', log.detail || '', log.ip_address || '']
        .map((v) => {
          const s = String(v);
          return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
        });
      csvRows.push(row.join(','));
    });
    const csv = '﻿' + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '合同审计日志_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('已导出' + logs.length + '条审计日志');
  } catch (e) { ElMessage.error('导出异常: ' + e.message); }
}
</script>

<style scoped>
.perm-panel { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #e5e7eb; }
.perm-title { margin: 0 0 12px; font-size: 16px; }
.perm-table { width: 100%; border-collapse: collapse; }
.perm-table th { padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb; background: #f9fafb; }
.perm-table td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
</style>
