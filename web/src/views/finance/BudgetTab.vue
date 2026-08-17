<template>
  <div v-loading="loading">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <StatCard title="预算总额" :value="'¥' + fmtMoney(ov.total_amount)" :sub="(ov.total_budgets || 0) + '个预算'" :icon="PieChart" color="#2563eb" />
      <StatCard title="已使用" :value="'¥' + fmtMoney(ov.used_amount)" :sub="'执行率:' + (ov.usage_rate || 0) + '%'" :icon="CircleCheck" color="#10b981" />
      <StatCard title="占用中" :value="'¥' + fmtMoney(ov.occupied_amount)" :sub="'占用率:' + (ov.occupy_rate || 0) + '%'" :icon="Clock" color="#f59e0b" />
      <StatCard title="可用余额" :value="'¥' + fmtMoney(ov.available_amount)" sub="可用" :icon="Money" color="#8b5cf6" />
    </div>

    <div class="tab-toolbar">
      <h3><el-icon><PieChart /></el-icon> 预算列表 ({{ total }})</h3>
      <el-button type="primary" size="small" :icon="Plus" @click="showForm">编制预算</el-button>
    </div>

    <el-table :data="list">
      <el-table-column prop="budget_no" label="预算编号" min-width="110" />
      <el-table-column prop="dept" label="部门" width="100" />
      <el-table-column label="类别" width="100">
        <template #default="{ row }"><el-tag type="primary" size="small">{{ row.category }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="year" label="年度" width="70" />
      <el-table-column label="总额" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.total_amount) }}</template>
      </el-table-column>
      <el-table-column label="已用" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.used_amount) }}</template>
      </el-table-column>
      <el-table-column label="占用" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.occupied_amount) }}</template>
      </el-table-column>
      <el-table-column label="可用" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.available_amount) }}</template>
      </el-table-column>
      <el-table-column label="执行率" width="130">
        <template #default="{ row }">
          <div style="display: flex; align-items: center; gap: 6px;">
            <el-progress
              :percentage="Math.min(parseFloat(row.usage_rate) || 0, 100)"
              :stroke-width="8"
              :show-text="false"
              :color="(parseFloat(row.usage_rate) || 0) > 80 ? 'var(--el-color-danger)' : 'var(--el-color-success)'"
              style="width: 60px;"
            />
            <span style="font-size: 12px;">{{ row.usage_rate || 0 }}%</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button type="info" size="small" :icon="View" circle title="详情" @click="viewRow(row.id)" />
          <template v-if="row.status === '草稿'">
            <el-button type="success" size="small" :icon="Promotion" circle title="提交" @click="submitRow(row.id)" />
            <el-button type="danger" size="small" :icon="Delete" circle title="删除" @click="deleteRow(row.id)" />
          </template>
          <template v-if="row.status === '待审批' || row.status === '审批中'">
            <el-button type="success" size="small" :icon="Check" circle title="审批" @click="approveRow(row.id)" />
            <el-button type="danger" size="small" :icon="Close" circle title="驳回" @click="rejectRow(row.id)" />
          </template>
          <template v-if="(row.status === '已审批' || row.status === '已执行') && isBoss">
            <el-button type="warning" size="small" :icon="Snowflake" circle title="冻结/解冻" @click="freezeRow(row.id)" />
            <el-button type="primary" size="small" :icon="CirclePlus" circle title="超支特批" @click="specialApproveRow(row.id)" />
          </template>
        </template>
      </el-table-column>
      <template #empty>
        <div style="text-align: center; padding: 20px; color: var(--el-text-color-secondary);">暂无预算</div>
      </template>
    </el-table>

    <!-- 编制预算 -->
    <el-dialog v-model="formVisible" title="编制预算" width="480px" draggable>
      <el-form label-width="110px">
        <el-form-item label="年度">
          <el-input-number v-model="form.year" :min="2000" :max="2100" :precision="0" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="部门"><el-input v-model="form.dept" /></el-form-item>
        <el-form-item label="类别">
          <el-select v-model="form.category" style="width: 100%;">
            <el-option v-for="t in ['人员成本', '办公费用', '差旅费用', '采购费用', '营销费用', '其他']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="预算总额(¥)">
          <el-input-number v-model="form.total_amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button :loading="saving" @click="saveForm('草稿')">存草稿</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm('待审批')">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 预算详情 -->
    <el-dialog v-model="detailVisible" :title="'预算详情 - ' + (detail?.budget_no || '')" width="640px" draggable>
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="部门">{{ detail.dept }}</el-descriptions-item>
          <el-descriptions-item label="类别">{{ detail.category }}</el-descriptions-item>
          <el-descriptions-item label="年度">{{ detail.year }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detail.status)" size="small">{{ detail.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="总额">¥{{ fmtAmt(detail.total_amount) }}</el-descriptions-item>
          <el-descriptions-item label="已用">¥{{ fmtAmt(detail.used_amount) }}</el-descriptions-item>
          <el-descriptions-item label="占用">¥{{ fmtAmt(detail.occupied_amount) }}</el-descriptions-item>
          <el-descriptions-item label="可用">¥{{ fmtAmt(detail.available_amount) }}</el-descriptions-item>
          <el-descriptions-item label="执行率" :span="2">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-progress
                :percentage="Math.min(parseFloat(detail.usage_rate) || 0, 100)"
                :stroke-width="12"
                :show-text="false"
                :color="(parseFloat(detail.usage_rate) || 0) > 80 ? 'var(--el-color-danger)' : 'var(--el-color-success)'"
                style="width: 200px;"
              />
              {{ detail.usage_rate || 0 }}%
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <template v-if="detail.occupies && detail.occupies.length">
          <h4 class="sec-title">占用明细</h4>
          <el-table :data="detail.occupies" size="small">
            <el-table-column prop="occupy_type" label="类型" />
            <el-table-column prop="related_form_no" label="单号" />
            <el-table-column label="金额" width="110">
              <template #default="{ row }">¥{{ fmtAmt(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === '占用中' ? 'warning' : row.status === '已确认' ? 'success' : 'info'" size="small">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </template>
        <p v-else style="color: var(--el-text-color-secondary);">无占用记录</p>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  PieChart, CircleCheck, Clock, Money, Plus, View, Promotion, Delete, Check, Close,
  MagicStick as Snowflake, CirclePlus,
} from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { fmtAmt, fmtMoney, statusType } from './finUtils';
import StatCard from './StatCard.vue';

const auth = useAuthStore();
const isBoss = computed(() => auth.user?.role === '总经理' || auth.user?.role === '超级管理员');

const year = new Date().getFullYear();
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const ov = ref({});

const formVisible = ref(false);
const form = ref({});
const detailVisible = ref(false);
const detail = ref(null);

async function load() {
  loading.value = true;
  try {
    const [listResp, dashResp] = await Promise.all([
      request.get('/fin-budget', { params: { year, pageSize: 50 } }),
      request.get('/fin-budget/stats/dashboard', { params: { year } }),
    ]);
    list.value = listResp.code === 200 ? listResp.data?.list || [] : [];
    total.value = listResp.code === 200 ? listResp.data?.total || 0 : 0;
    ov.value = dashResp.code === 200 ? dashResp.data?.overview || {} : {};
  } finally {
    loading.value = false;
  }
}

function showForm() {
  form.value = {
    year, dept: auth.user?.dept || '', category: '人员成本', total_amount: undefined, remark: '',
  };
  formVisible.value = true;
}

async function saveForm(status) {
  const f = form.value;
  if (!f.total_amount) { ElMessage.warning('请输入金额'); return; }
  const data = {
    year: parseInt(f.year),
    dept: f.dept,
    category: f.category,
    total_amount: parseFloat(f.total_amount) || 0,
    remark: f.remark || '',
    status,
  };
  saving.value = true;
  try {
    const resp = await request.post('/fin-budget', data);
    if (resp.code === 200) {
      formVisible.value = false;
      ElMessage.success('操作成功');
      load();
    } else {
      ElMessage.error(resp.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

async function viewRow(id) {
  const resp = await request.get('/fin-budget/' + id);
  if (resp.code !== 200) { ElMessage.error(resp.msg || '加载失败'); return; }
  detail.value = resp.data;
  detailVisible.value = true;
}

async function submitRow(id) {
  try {
    await ElMessageBox.confirm('确认提交？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-budget/${id}/submit`);
  if (resp.code === 200) { ElMessage.success('已提交'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function approveRow(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('审批意见:', '审批', { inputValue: '同意' });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-budget/${id}/approve`, { remark });
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批成功'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function rejectRow(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('驳回意见(必填):', '驳回', {
      inputValidator: (v) => (v && v.trim() ? true : '驳回意见必填'),
    });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-budget/${id}/reject`, { remark });
  if (resp.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function freezeRow(id) {
  try {
    await ElMessageBox.confirm('确认冻结/解冻？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-budget/${id}/freeze`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '操作成功'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function specialApproveRow(id) {
  let amt;
  try {
    const r = await ElMessageBox.prompt('追加预算金额(¥):', '超支特批', {
      inputPattern: /^\d+(\.\d+)?$/,
      inputErrorMessage: '请输入有效金额',
    });
    amt = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-budget/${id}/special-approve`, {
    extra_amount: parseFloat(amt),
    remark: '超支特批',
  });
  if (resp.code === 200) { ElMessage.success(resp.msg || '操作成功'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function deleteRow(id) {
  try {
    await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete('/fin-budget/' + id);
  if (resp.code === 200) { ElMessage.success('已删除'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

onMounted(load);
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
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
.sec-title { font-size: 15px; margin: 16px 0 8px; }
</style>
