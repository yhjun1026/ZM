<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>合同模板库</strong>
          <el-button v-if="canManage" type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon> 新建模板</el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="模板编号" width="130" />
        <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="分类" width="110">
          <template #default="{ row }">{{ row.category || '—' }}</template>
        </el-table-column>
        <el-table-column label="创建人" width="100">
          <template #default="{ row }">{{ row.creator || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :class="`tag ${row.status === '启用' ? 'tag-green' : 'tag-grey'}`">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="info" @click="openView(row)"><el-icon><View /></el-icon></el-button>
            <template v-if="canManage">
              <el-button size="small" @click="openEdit(row)"><el-icon><Edit /></el-icon></el-button>
              <el-button size="small" type="danger" @click="remove(row)"><el-icon><Delete /></el-icon></el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty>暂无模板</template>
      </el-table>
    </el-card>

    <!-- 新建/编辑模板 -->
    <el-dialog v-model="formDlg.visible" :title="formDlg.id ? '编辑合同模板' : '新建合同模板'" width="600px">
      <el-form label-width="90px">
        <el-form-item label="模板名称"><el-input v-model="formDlg.form.name" placeholder="如：标准销售合同模板" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="formDlg.form.category" style="width:100%;">
            <el-option v-for="t in ['销售合同', '采购合同', '服务合同', '技术合同', '劳动合同', '其他']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板内容"><el-input v-model="formDlg.form.content" type="textarea" :rows="10" placeholder="输入合同模板内容..." /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="formDlg.saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 查看模板 -->
    <el-dialog v-model="viewDlg.visible" :title="viewDlg.row?.name || '模板详情'" width="700px">
      <template v-if="viewDlg.row">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div class="info-item"><span class="info-label">模板编号</span><span class="info-value">{{ viewDlg.row.id }}</span></div>
          <div class="info-item"><span class="info-label">分类</span><span class="info-value">{{ viewDlg.row.category || '—' }}</span></div>
          <div class="info-item"><span class="info-label">创建人</span><span class="info-value">{{ viewDlg.row.creator || '—' }}</span></div>
          <div class="info-item"><span class="info-label">状态</span><span class="info-value">{{ viewDlg.row.status || '—' }}</span></div>
        </div>
        <h4 style="margin-bottom:8px;">模板内容</h4>
        <div style="background:#f9fafb;padding:16px;border-radius:8px;font-size:14px;line-height:1.8;white-space:pre-wrap;max-height:400px;overflow-y:auto;">{{ viewDlg.row.content || '（空）' }}</div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, View, Edit, Delete } from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const canManage = computed(() => {
  const u = auth.user || {};
  return u.role === '超级管理员' || u.role === '总经理'
    || (u.role === '普通员工' && u.dept === '行政部')
    || (u.role === '部门经理' && u.dept === '行政部');
});

const rows = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/contracts/templates/list');
    if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
    rows.value = resp.data || [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const formDlg = reactive({ visible: false, saving: false, id: null, form: { name: '', category: '销售合同', content: '' } });
function openCreate() {
  formDlg.id = null;
  formDlg.form = { name: '', category: '销售合同', content: '' };
  formDlg.visible = true;
}
function openEdit(row) {
  formDlg.id = row.id;
  formDlg.form = { name: row.name, category: row.category || '销售合同', content: row.content || '' };
  formDlg.visible = true;
}
async function submitForm() {
  if (!formDlg.form.name) { ElMessage.warning('请输入模板名称'); return; }
  formDlg.saving = true;
  try {
    const resp = formDlg.id
      ? await request.put('/contracts/templates/' + formDlg.id, { ...formDlg.form })
      : await request.post('/contracts/templates/create', { ...formDlg.form });
    if (resp.code === 200) {
      ElMessage.success(formDlg.id ? '模板已更新' : '模板创建成功');
      formDlg.visible = false;
      load();
    } else {
      ElMessage.error(resp.msg || '保存失败');
    }
  } finally { formDlg.saving = false; }
}

const viewDlg = reactive({ visible: false, row: null });
async function openView(row) {
  const resp = await request.get('/contracts/templates/' + row.id);
  if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
  viewDlg.row = resp.data || {};
  viewDlg.visible = true;
}

async function remove(row) {
  try { await ElMessageBox.confirm('确定删除此模板？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.delete('/contracts/templates/' + row.id);
  if (resp.code === 200) { ElMessage.success('模板已删除'); load(); }
  else ElMessage.error(resp.msg || '删除失败');
}
</script>

<style scoped>
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-green { background: #d1fae5; color: #065f46; }
.tag-grey { background: #f1f5f9; color: #606266; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 12px; color: #909399; font-weight: 500; }
.info-value { font-size: 14px; color: #303133; font-weight: 600; }
</style>
