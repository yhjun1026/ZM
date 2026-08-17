<template>
  <div>
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 16px; font-weight: 600;">公司文件</span>
          <el-button v-if="canCreate" type="primary" size="small" @click="openCreate">
            <el-icon><Plus /></el-icon> 编写文件
          </el-button>
        </div>
      </template>

      <el-table :data="rows" stripe v-loading="loading">
        <el-table-column prop="id" label="编号" width="110" />
        <el-table-column label="标题" min-width="200">
          <template #default="{ row }">
            <el-link type="primary" :underline="false" style="font-weight: 500;" @click="viewDocument(row.id)">{{ row.title }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }"><el-tag type="primary" size="small">{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="author" label="作者" width="90" />
        <el-table-column prop="dept" label="部门" width="110" />
        <el-table-column prop="date" label="日期" width="110" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === '已下发' ? 'success' : row.status === '审批中' ? 'warning' : row.status === '已驳回' ? 'danger' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="阅读量" width="80" align="center">
          <template #default="{ row }">{{ row.read_count || 0 }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewDocument(row.id)" title="查看"><el-icon><View /></el-icon></el-button>
            <el-button size="small" @click="printDocument(row.id)" title="打印"><el-icon><Printer /></el-icon></el-button>
            <el-button v-if="row.status === '草稿'" size="small" type="primary" @click="submitDoc(row)">提交</el-button>
            <template v-if="canApprove && row.status === '审批中'">
              <el-button size="small" type="success" @click="approveDoc(row)" title="审批通过"><el-icon><Check /></el-icon></el-button>
              <el-button size="small" type="danger" @click="rejectDoc(row)" title="驳回"><el-icon><Close /></el-icon></el-button>
            </template>
            <el-button v-if="row.status === '草稿' && canCreate" size="small" type="danger" plain @click="onDelete(row)" title="删除"><el-icon><Delete /></el-icon></el-button>
          </template>
        </el-table-column>
        <template #empty><span style="color: #909399;">暂无文件</span></template>
      </el-table>
    </el-card>

    <!-- 编写文件 -->
    <el-dialog v-model="form.visible" title="编写公司文件" width="600px">
      <el-form :model="form.data" label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.data.title" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.data.type" style="width: 100%;">
            <el-option label="通知公告" value="通知公告" />
            <el-option label="管理制度" value="管理制度" />
            <el-option label="操作规范" value="操作规范" />
          </el-select>
        </el-form-item>
        <el-form-item label="发放范围">
          <el-input v-model="form.data.distribute_scope" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.data.content" type="textarea" :rows="8" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="form.visible = false">取消</el-button>
        <el-button type="primary" :loading="form.saving" @click="submitDocForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 文件详情 -->
    <el-dialog v-model="detail.visible" title="文件详情" width="700px">
      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 18px; font-weight: 700; margin: 0 0 8px;">{{ detail.data.title }}</h4>
        <div style="display: flex; gap: 20px; font-size: 13px; color: #909399; flex-wrap: wrap;">
          <span><el-icon><PriceTag /></el-icon> {{ detail.data.type }}</span>
          <span><el-icon><User /></el-icon> {{ detail.data.author }}</span>
          <span><el-icon><OfficeBuilding /></el-icon> {{ detail.data.dept }}</span>
          <span><el-icon><Calendar /></el-icon> {{ detail.data.date }}</span>
          <span><el-icon><InfoFilled /></el-icon> {{ detail.data.status }}</span>
          <span><el-icon><View /></el-icon> 阅读 {{ detail.data.read_count || 0 }} 次</span>
        </div>
      </div>
      <div v-if="detail.data.distribute_scope" style="margin-bottom: 12px;">
        <el-tag type="primary" size="small">发放范围：{{ detail.data.distribute_scope }}</el-tag>
      </div>
      <div style="padding: 16px; background: #f5f7fa; border-radius: 8px; min-height: 120px; line-height: 1.8; white-space: pre-wrap;">{{ detail.data.content || '（无内容）' }}</div>

      <!-- 审批流程图 -->
      <div v-if="flowSteps.length" class="wf-container">
        <div class="wf-track">
          <template v-for="(f, i) in flowSteps" :key="i">
            <div class="wf-step" :class="flowClass(f, i)">
              <div class="wf-icon">
                <el-icon v-if="f.done"><CircleCheck /></el-icon>
                <el-icon v-else-if="isCurrent(i)"><Loading /></el-icon>
                <el-icon v-else><CircleClose /></el-icon>
              </div>
              <div class="wf-info">
                <div class="wf-name">{{ f.step }}</div>
                <div class="wf-user">{{ f.user || (f.done ? '已完成' : '待处理') }}</div>
                <div v-if="f.time && f.time !== '—'" class="wf-time">{{ f.time }}</div>
              </div>
            </div>
            <div v-if="i < flowSteps.length - 1" class="wf-arrow"><el-icon><ArrowRight /></el-icon></div>
          </template>
        </div>
      </div>

      <template #footer>
        <el-button @click="detail.visible = false">关闭</el-button>
        <el-button v-if="detail.data.status === '草稿'" type="primary" @click="submitDoc(detail.data)">提交审批</el-button>
        <template v-if="canApprove && detail.data.status === '审批中'">
          <el-button type="success" @click="approveDoc(detail.data)"><el-icon><Check /></el-icon> 审批通过</el-button>
          <el-button type="danger" @click="rejectDoc(detail.data)"><el-icon><Close /></el-icon> 驳回</el-button>
        </template>
        <el-button type="primary" plain @click="printDocument(detail.data.id)"><el-icon><Printer /></el-icon> 打印</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, View, Printer, Check, Close, Delete, PriceTag, User, OfficeBuilding, Calendar, InfoFilled, CircleCheck, CircleClose, Loading, ArrowRight } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const rows = ref([]);
const loading = ref(false);

// 编写权限：普通员工仅行政部可创建（与参考项目一致）
const canCreate = computed(() => {
  const u = auth.user || {};
  return u.role !== '普通员工' || u.dept === '行政部';
});
// 审批权限：非普通员工
const canApprove = computed(() => (auth.user || {}).role && auth.user.role !== '普通员工');

async function load() {
  loading.value = true;
  try {
    const res = await request.get('/documents');
    if (res.code === 200) rows.value = res.data || [];
    else ElMessage.error(res.msg || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

/* ===== 新建 ===== */
const form = reactive({
  visible: false,
  saving: false,
  data: { title: '', type: '通知公告', distribute_scope: '全体员工', content: '' }
});

function openCreate() {
  form.data = { title: '', type: '通知公告', distribute_scope: '全体员工', content: '' };
  form.visible = true;
}

async function submitDocForm() {
  if (!form.data.title) { ElMessage.warning('请输入标题'); return; }
  form.saving = true;
  try {
    const res = await request.post('/documents', form.data);
    if (res.code === 200) {
      ElMessage.success(res.msg || '文件创建成功');
      form.visible = false;
      load();
    } else ElMessage.error(res.msg || '创建失败');
  } finally {
    form.saving = false;
  }
}

/* ===== 详情 ===== */
const detail = reactive({ visible: false, data: {} });
const flowSteps = computed(() => detail.data.doc_flow || []);

function isCurrent(i) {
  const flow = flowSteps.value;
  if (flow[i].done) return false;
  return i === 0 || flow.slice(0, i).every(s => s.done);
}
function flowClass(f, i) {
  if (f.done) return 'wf-done';
  return isCurrent(i) ? 'wf-current' : 'wf-pending';
}

async function viewDocument(id) {
  const res = await request.get('/documents/' + id);
  if (res.code !== 200) { ElMessage.error(res.msg || '加载失败'); return; }
  detail.data = res.data || {};
  detail.visible = true;
}

/* ===== 提交 / 审批 / 驳回 / 删除 ===== */
async function submitDoc(row) {
  try {
    await ElMessageBox.confirm(`确定提交文件「${row.title}」进行审批吗？`, '确认提交', { type: 'info' });
  } catch { return; }
  const res = await request.post(`/documents/${row.id}/submit`);
  if (res.code === 200) {
    ElMessage.success(res.msg || '文件已提交审批');
    detail.visible = false;
    load();
  } else ElMessage.error(res.msg || '提交失败');
}

async function approveDoc(row) {
  let remark = '';
  try {
    const r = await ElMessageBox.prompt('请输入审批意见（可选）', '审批通过', { inputPlaceholder: '审批意见' });
    remark = r.value || '';
  } catch { return; }
  const res = await request.post(`/documents/${row.id}/approve`, { remark });
  if (res.code === 200) {
    ElMessage.success(res.msg || '审批通过');
    detail.visible = false;
    load();
  } else ElMessage.error(res.msg || '审批失败');
}

async function rejectDoc(row) {
  try {
    await ElMessageBox.confirm(`确定驳回文件「${row.title}」吗？`, '确认驳回', { type: 'warning' });
  } catch { return; }
  const res = await request.post(`/documents/${row.id}/reject`);
  if (res.code === 200) {
    ElMessage.success(res.msg || '已驳回');
    detail.visible = false;
    load();
  } else ElMessage.error(res.msg || '操作失败');
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除文件「${row.title}」吗？`, '确认删除', { type: 'warning' });
  } catch { return; }
  const res = await request.delete(`/documents/${row.id}`);
  if (res.code === 200) {
    ElMessage.success(res.msg || '文件已删除');
    load();
  } else ElMessage.error(res.msg || '删除失败');
}

/* ===== 打印（1:1 还原参考项目） ===== */
async function printDocument(id) {
  const res = await request.get('/documents/' + id);
  if (res.code !== 200) { ElMessage.error(res.msg || '加载失败'); return; }
  const d = res.data || {};
  const flow = d.doc_flow || [];
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>${esc(d.title || '公司文件')}</title>
    <style>
      body { font-family: 'Microsoft YaHei', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
      .doc-header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
      .doc-header h1 { font-size: 24px; }
      .doc-meta { display: flex; justify-content: space-between; font-size: 13px; color: #666; margin-bottom: 20px; }
      .doc-content { line-height: 2; font-size: 15px; white-space: pre-wrap; }
      .doc-flow { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; }
      .flow-step { display: inline-block; padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; margin: 4px; font-size: 12px; }
      .flow-arrow { display: inline-block; margin: 0 4px; color: #999; }
      .doc-footer { margin-top: 60px; text-align: right; font-size: 13px; color: #999; }
      @media print { .no-print { display: none; } }
    </style></head><body>
    <div class="doc-header">
      <h1>${esc(d.title || '')}</h1>
      <p style="font-size:14px;color:#666;">四川卓盟科技有限公司</p>
    </div>
    <div class="doc-meta">
      <span>编号：${esc(d.id || '')}</span>
      <span>类型：${esc(d.type || '')}</span>
      <span>作者：${esc(d.author || '')}</span>
      <span>日期：${esc(d.date || '')}</span>
    </div>
    ${d.distribute_scope ? `<p style="font-size:13px;color:#666;">发放范围：${esc(d.distribute_scope)}</p>` : ''}
    <div class="doc-content">${esc(d.content || '（无内容）')}</div>
    ${flow.length ? `<div class="doc-flow"><strong>审批流程：</strong><br>${flow.map((f, i) => `${i > 0 ? '<span class="flow-arrow">→</span>' : ''}<span class="flow-step">${esc(f.step)}：${esc(f.user || '待定')} ${esc(f.time || '')}</span>`).join('')}</div>` : ''}
    <div class="doc-footer">本文件由卓盟智办公系统生成 · 打印时间：${new Date().toLocaleString('zh-CN')}</div>
    <div class="no-print" style="text-align:center;margin-top:20px;">
      <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">打印</button>
    </div>
    </body></html>
  `);
  w.document.close();
}
</script>

<style scoped>
.wf-container {
  margin-top: 16px;
  overflow-x: auto;
}
.wf-track {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}
.wf-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  font-size: 12px;
  flex-shrink: 0;
}
.wf-step.wf-done {
  background: #d1fae5;
  border-color: #10b981;
  color: #065f46;
}
.wf-step.wf-current {
  background: #dbeafe;
  border-color: #2563eb;
  color: #1e40af;
}
.wf-step.wf-pending {
  background: #f9fafb;
  color: #909399;
}
.wf-icon {
  font-size: 18px;
  display: flex;
  align-items: center;
}
.wf-name {
  font-weight: 600;
}
.wf-user,
.wf-time {
  font-size: 11px;
  opacity: 0.85;
}
.wf-arrow {
  color: #c0c4cc;
  display: flex;
  align-items: center;
}
</style>
