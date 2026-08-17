<template>
  <div v-loading="loading">
    <div class="tab-toolbar">
      <h3><el-icon><Tools /></el-icon> 财务配置中心</h3>
      <div style="display: flex; gap: 8px;">
        <el-button type="info" size="small" :icon="Stamp" @click="showSeals">签章记录</el-button>
        <el-button type="info" size="small" :icon="Connection" @click="showHookLogs">对接日志</el-button>
        <el-button type="primary" size="small" :icon="Plus" @click="showForm">新增配置</el-button>
      </div>
    </div>

    <el-card v-for="(items, type) in grouped" :key="type" shadow="never" style="margin-bottom: 16px;">
      <template #header>
        <h4 style="margin: 0;">{{ type }} ({{ items.length }})</h4>
      </template>
      <el-table :data="items" size="small">
        <el-table-column label="配置键" min-width="150">
          <template #default="{ row }"><code>{{ row.config_key }}</code></template>
        </el-table-column>
        <el-table-column label="配置值" min-width="180">
          <template #default="{ row }">
            <el-input v-model="cfgValues[row.id]" size="small" style="min-width: 120px;" />
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="110" />
        <el-table-column prop="description" label="描述" min-width="140" show-overflow-tooltip />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-button type="success" size="small" :icon="Select" circle title="保存" @click="saveConfig(row.id)" />
            <el-button v-if="!row.is_system" type="danger" size="small" :icon="Delete" circle title="删除" @click="deleteConfig(row.id)" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增配置 -->
    <el-dialog v-model="formVisible" title="新增配置" width="480px" draggable>
      <el-form label-width="80px">
        <el-form-item label="配置键" required><el-input v-model="form.config_key" /></el-form-item>
        <el-form-item label="配置值"><el-input v-model="form.config_value" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.config_type" style="width: 100%;">
            <el-option v-for="t in ['参数', '标准', '编码', '接口']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类"><el-input v-model="form.category" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="createConfig">创建</el-button>
      </template>
    </el-dialog>

    <!-- 签章记录 -->
    <el-dialog v-model="sealVisible" title="电子签章记录" width="860px" draggable top="6vh">
      <el-table :data="seals" size="small" v-loading="sealLoading">
        <el-table-column prop="seal_no" label="签章编号" width="120" />
        <el-table-column prop="source_type" label="单据类型" width="100" />
        <el-table-column prop="source_form_no" label="单据号" width="130" />
        <el-table-column prop="seal_type" label="印章" width="80" />
        <el-table-column prop="seal_position" label="位置" width="80" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.seal_status === '已签章' ? 'success' : row.seal_status === '已作废' ? 'info' : 'warning'" size="small">
              {{ row.seal_status || '待签章' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="seal_date" label="签章时间" width="150" />
        <el-table-column prop="operator" label="操作人" width="90" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="row.seal_status !== '已签章' && row.seal_status !== '已作废'" type="success" size="small" @click="executeSeal(row.id)">签章</el-button>
            <el-button v-if="row.seal_status === '已签章'" type="danger" size="small" @click="cancelSeal(row.id)">作废</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div style="text-align: center; padding: 20px; color: var(--el-text-color-secondary);">暂无签章记录</div>
        </template>
      </el-table>
      <template #footer>
        <el-button @click="sealVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 对接日志 -->
    <el-dialog v-model="hookVisible" title="财务对接日志" width="900px" draggable top="6vh">
      <div style="margin-bottom: 12px; display: flex; gap: 8px;">
        <el-select v-model="hookFilter" size="small" style="width: 130px;" @change="loadHookLogs">
          <el-option label="全部状态" value="all" />
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
          <el-option label="待推送" value="pending" />
        </el-select>
        <el-button size="small" :icon="Refresh" @click="loadHookLogs">刷新</el-button>
      </div>
      <el-table :data="hookLogs" size="small" v-loading="hookLoading">
        <el-table-column prop="source_type" label="单据类型" width="100" />
        <el-table-column prop="source_id" label="单据ID" min-width="120" show-overflow-tooltip />
        <el-table-column prop="sync_type" label="同步类型" width="100" />
        <el-table-column prop="target_system" label="目标系统" width="90" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="retry_count" label="重试" width="60" />
        <el-table-column prop="error_msg" label="错误信息" min-width="130" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" width="150" />
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button v-if="row.status === 'failed'" type="warning" size="small" @click="retryHook(row.id)">重推</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div style="text-align: center; padding: 20px; color: var(--el-text-color-secondary);">暂无对接日志</div>
        </template>
      </el-table>
      <template #footer>
        <el-button @click="hookVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Tools, Stamp, Connection, Plus, Select, Delete, Refresh } from '@element-plus/icons-vue';
import request from '../../api/request';

const loading = ref(false);
const saving = ref(false);
const grouped = ref({});
const cfgValues = ref({});

const formVisible = ref(false);
const form = ref({});

const sealVisible = ref(false);
const sealLoading = ref(false);
const seals = ref([]);

const hookVisible = ref(false);
const hookLoading = ref(false);
const hookLogs = ref([]);
const hookFilter = ref('all');

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/fin-config', { params: { pageSize: 100 } });
    const list = resp.code === 200 ? resp.data?.list || [] : [];
    const g = {};
    const vals = {};
    list.forEach((item) => {
      const t = item.config_type || '其他';
      if (!g[t]) g[t] = [];
      g[t].push(item);
      vals[item.id] = item.config_value;
    });
    grouped.value = g;
    cfgValues.value = vals;
  } finally {
    loading.value = false;
  }
}

async function saveConfig(id) {
  const resp = await request.put('/fin-config/' + id, { config_value: cfgValues.value[id] });
  if (resp.code === 200) ElMessage.success('已保存');
  else ElMessage.error(resp.msg || '操作失败');
}

async function deleteConfig(id) {
  try {
    await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete('/fin-config/' + id);
  if (resp.code === 200) { ElMessage.success('已删除'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

function showForm() {
  form.value = { config_key: '', config_value: '', config_type: '参数', category: '', description: '' };
  formVisible.value = true;
}

async function createConfig() {
  const f = form.value;
  if (!f.config_key) { ElMessage.warning('配置键必填'); return; }
  saving.value = true;
  try {
    const resp = await request.post('/fin-config', { ...f });
    if (resp.code === 200) {
      formVisible.value = false;
      ElMessage.success('已创建');
      load();
    } else {
      ElMessage.error(resp.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

// ===== 签章记录 (参考项目 _showSealList 未实现, 按后端接口补齐) =====
function showSeals() {
  sealVisible.value = true;
  loadSeals();
}

async function loadSeals() {
  sealLoading.value = true;
  try {
    const resp = await request.get('/fin-config/seals/list', { params: { pageSize: 100 } });
    seals.value = resp.code === 200 ? resp.data?.list || [] : [];
  } finally {
    sealLoading.value = false;
  }
}

async function executeSeal(id) {
  try {
    await ElMessageBox.confirm('确认执行签章？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-config/seals/${id}/execute`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '签章执行成功'); loadSeals(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function cancelSeal(id) {
  try {
    await ElMessageBox.confirm('确认作废该签章？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-config/seals/${id}/cancel`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '签章已作废'); loadSeals(); }
  else ElMessage.error(resp.msg || '操作失败');
}

// ===== 对接日志 (参考项目 _showHookLogs 未实现, 按后端接口补齐) =====
function showHookLogs() {
  hookVisible.value = true;
  loadHookLogs();
}

async function loadHookLogs() {
  hookLoading.value = true;
  try {
    const params = { pageSize: 100 };
    if (hookFilter.value && hookFilter.value !== 'all') params.status = hookFilter.value;
    const resp = await request.get('/fin-hook/logs', { params });
    hookLogs.value = resp.code === 200 ? resp.data?.list || [] : [];
  } finally {
    hookLoading.value = false;
  }
}

async function retryHook(id) {
  const resp = await request.post(`/fin-hook/logs/${id}/retry`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '已重新推送'); loadHookLogs(); }
  else ElMessage.error(resp.msg || '操作失败');
}

onMounted(load);
</script>

<style scoped>
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}
.tab-toolbar h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
