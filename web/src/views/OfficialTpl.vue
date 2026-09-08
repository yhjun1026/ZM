<template>
  <div class="official-tpl">
    <div class="page-header">
      <h2>公文模板库</h2>
      <p>覆盖法定公文 15 种 + 企业常用文书 15 种：查阅规范 → 套用模板生成草稿 → 会签签发 → 归档留痕</p>
    </div>

    <div class="kpi-grid" v-if="stats">
      <div class="kpi-card" v-for="k in kpis" :key="k.title">
        <div class="kpi-icon" :style="{ background: k.color + '20' }">
          <el-icon :size="18" :color="k.color"><component :is="k.icon" /></el-icon>
        </div>
        <div>
          <div class="kpi-title">{{ k.title }}</div>
          <div class="kpi-value">{{ k.value }}</div>
          <div class="kpi-sub">{{ k.sub }}</div>
        </div>
      </div>
    </div>

    <div class="tab-toolbar">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <el-select v-model="filter.cat" placeholder="全部分类" style="width:150px" clearable @change="loadList">
          <el-option v-for="c in meta.cats" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="filter.kind" placeholder="全部文种" style="width:150px" clearable filterable @change="loadList">
          <el-option v-for="k in meta.kind_list" :key="k" :label="k" :value="k" />
        </el-select>
        <el-input v-model="filter.q" placeholder="搜索文种/标题/适用范围" style="width:240px" clearable @change="loadList" />
      </div>
      <div style="display:flex;gap:8px;">
        <el-button @click="doSeed">
          <el-icon style="margin-right:4px"><Refresh /></el-icon>内置补种
        </el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon style="margin-right:4px"><Plus /></el-icon>自定义模板
        </el-button>
      </div>
    </div>

    <el-table :data="rows" stripe size="small" v-loading="loading">
      <el-table-column prop="tpl_no" label="模板编号" width="110" />
      <el-table-column prop="kind" label="文种" width="110" />
      <el-table-column label="分类" width="130">
        <template #default="{ row }"><el-tag :type="row.cat === '法定公文' ? 'danger' : 'warning'" size="small" effect="plain">{{ row.cat }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="scope" label="适用范围" min-width="240" show-overflow-tooltip />
      <el-table-column label="来源" width="90">
        <template #default="{ row }">
          <el-tag :type="row.builtin ? 'info' : 'success'" size="small">{{ row.builtin ? '内置' : '自定义' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="使用次数" width="100" align="center">
        <template #default="{ row }"><b>{{ row.use_count || 0 }}</b></template>
      </el-table-column>
      <el-table-column label="操作" width="330" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">详情</el-button>
          <el-button size="small" type="primary" @click="openUse(row)">套用</el-button>
          <el-button size="small" @click="copyTpl(row)">调用</el-button>
          <el-button size="small" :disabled="!!row.builtin" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain :disabled="!!row.builtin" @click="removeTpl(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="muted">暂无公文模板，点击「内置补种」导入 30 种内置规范与模板</span></template>
    </el-table>

    <!-- 模板详情（七要素） -->
    <el-dialog v-model="detailDlg.visible" :title="'公文规范 · ' + detailDlg.row.kind" width="820px">
      <el-descriptions :column="2" size="small" border style="margin-bottom:12px;">
        <el-descriptions-item label="模板编号">{{ detailDlg.row.tpl_no }}</el-descriptions-item>
        <el-descriptions-item label="文种">{{ detailDlg.row.kind }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ detailDlg.row.cat }}</el-descriptions-item>
        <el-descriptions-item label="使用次数">{{ detailDlg.row.use_count || 0 }}</el-descriptions-item>
        <el-descriptions-item label="标题" :span="2">{{ detailDlg.row.title }}</el-descriptions-item>
      </el-descriptions>
      <div v-for="f in fields" :key="f.key" class="field-block">
        <div class="field-title">{{ f.label }}</div>
        <div class="content-box">{{ detailDlg.row[f.key] || '—' }}</div>
      </div>
      <template #footer>
        <el-button @click="detailDlg.visible = false">关闭</el-button>
        <el-button type="primary" @click="openUse(detailDlg.row)">套用生成草稿</el-button>
      </template>
    </el-dialog>

    <!-- 套用模板生成草稿 -->
    <el-dialog v-model="useDlg.visible" :title="'套用模板 · ' + useDlg.kind" width="560px">
      <p class="muted" style="margin-top:0;">套用后生成公文草稿（状态：草稿），须经会签 → 签发审批后正式生效。</p>
      <el-form label-width="100px" size="small">
        <el-form-item label="公文标题">
          <el-input v-model="useDlg.form.title" :placeholder="useDlg.tplTitle" />
        </el-form-item>
        <el-form-item label="公文类型">
          <el-select v-model="useDlg.form.doc_type" style="width:100%">
            <el-option v-for="t in meta.doc_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="主送单位">
          <el-input v-model="useDlg.form.to_org" placeholder="如：各科室、各分支机构" />
        </el-form-item>
        <el-form-item label="密级">
          <el-select v-model="useDlg.form.secret_level" style="width:100%">
            <el-option v-for="s in meta.secret_levels" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="useDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="useDlg.saving" @click="submitUse">生成草稿</el-button>
      </template>
    </el-dialog>

    <!-- 自定义模板 -->
    <el-dialog v-model="editDlg.visible" :title="editDlg.id ? '编辑自定义模板' : '新增自定义模板'" width="680px">
      <el-form label-width="100px" size="small">
        <el-form-item label="文种" required>
          <el-input v-model="editDlg.form.kind" placeholder="如：通知 / 授权委托书" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editDlg.form.cat" style="width:100%">
            <el-option v-for="c in meta.cats" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="editDlg.form.title" placeholder="模板标题" />
        </el-form-item>
        <el-form-item label="适用范围">
          <el-input v-model="editDlg.form.scope" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="结构要素">
          <el-input v-model="editDlg.form.structure" type="textarea" :rows="2" placeholder="① … ② … ③ …" />
        </el-form-item>
        <el-form-item label="书写规范">
          <el-input v-model="editDlg.form.norms" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="模板正文">
          <el-input v-model="editDlg.form.template" type="textarea" :rows="6" />
        </el-form-item>
        <el-form-item label="常见错误">
          <el-input v-model="editDlg.form.tips" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="法规依据">
          <el-input v-model="editDlg.form.basis" placeholder="如：《党政机关公文处理工作条例》第八条第（八）项" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="editDlg.saving" @click="submitEdit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Collection, Document, Files, TrendCharts, Plus, Refresh } from '@element-plus/icons-vue';
import request from '../api/request';

const rows = ref([]);
const stats = ref(null);
const loading = ref(false);
const meta = ref({ cats: [], kind_list: [], kinds: {}, doc_types: ['收文', '发文', '内部请示'], secret_levels: ['内部', '秘密', '机密'] });
const filter = reactive({ cat: '', kind: '', q: '' });

const fields = [
  { key: 'scope', label: '适用范围' },
  { key: 'fmt', label: '格式要素' },
  { key: 'structure', label: '结构要素' },
  { key: 'norms', label: '书写规范' },
  { key: 'template', label: '模板正文' },
  { key: 'tips', label: '常见错误与禁忌' },
  { key: 'basis', label: '法规依据' },
];

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '模板总数', value: s.total, sub: `内置 ${s.builtin} 种 / 自定义 ${s.custom} 种`, icon: Collection, color: '#2563eb' },
    { title: '法定公文', value: s.by_cat?.[0]?.count ?? 0, sub: `使用 ${s.by_cat?.[0]?.use_count ?? 0} 次`, icon: Document, color: '#dc2626' },
    { title: '企业常用文书', value: s.by_cat?.[1]?.count ?? 0, sub: `使用 ${s.by_cat?.[1]?.use_count ?? 0} 次`, icon: Files, color: '#f59e0b' },
    { title: '累计调用', value: s.use_count, sub: `已生成草稿 ${s.drafts} 份`, icon: TrendCharts, color: '#10b981' },
  ];
});

async function loadMeta() {
  const r = await request.get('/official-tpl/meta');
  if (r.code === 200) meta.value = r.data || meta.value;
}
async function loadStats() {
  const r = await request.get('/official-tpl/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['cat', 'kind', 'q'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/official-tpl', { params });
    rows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadList(); });

/* ---------- 详情 ---------- */
const detailDlg = reactive({ visible: false, row: {} });
async function openDetail(row) {
  const r = await request.get(`/official-tpl/${row.id}`);
  detailDlg.row = r.code === 200 ? r.data : row;
  detailDlg.visible = true;
}

/* ---------- 套用 ---------- */
const useDlg = reactive({
  visible: false, saving: false, id: null, kind: '', tplTitle: '',
  form: { title: '', doc_type: '发文', to_org: '', secret_level: '内部' },
});
function openUse(row) {
  useDlg.id = row.id;
  useDlg.kind = row.kind;
  useDlg.tplTitle = row.title;
  useDlg.form = { title: '', doc_type: '发文', to_org: '', secret_level: '内部' };
  useDlg.visible = true;
}
async function submitUse() {
  useDlg.saving = true;
  const r = await request.post(`/official-tpl/${useDlg.id}/use`, useDlg.form);
  useDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(`草稿已生成：${r.data.doc_no}`);
    useDlg.visible = false;
    detailDlg.visible = false;
    loadList(); loadStats();
  } else ElMessage.error(r.msg || '套用失败');
}

/* ---------- 调用留痕 ---------- */
async function copyTpl(row) {
  const r = await request.post(`/official-tpl/${row.id}/copy`);
  if (r.code !== 200) { ElMessage.error(r.msg || '调用失败'); return; }
  detailDlg.row = r.data;
  detailDlg.visible = true;
  ElMessage.success('模板已调用（使用次数 +1）');
  loadList();
}

/* ---------- 自定义模板 ---------- */
const editDlg = reactive({
  visible: false, saving: false, id: null,
  form: { kind: '', cat: '企业常用文书', title: '', scope: '', structure: '', norms: '', template: '', tips: '', basis: '' },
});
function openCreate() {
  editDlg.id = null;
  editDlg.form = { kind: '', cat: '企业常用文书', title: '', scope: '', structure: '', norms: '', template: '', tips: '', basis: '' };
  editDlg.visible = true;
}
async function openEdit(row) {
  const r = await request.get(`/official-tpl/${row.id}`);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  const d = r.data;
  editDlg.id = row.id;
  editDlg.form = {
    kind: d.kind, cat: d.cat, title: d.title, scope: d.scope || '', structure: d.structure || '',
    norms: d.norms || '', template: d.template || '', tips: d.tips || '', basis: d.basis || '',
  };
  editDlg.visible = true;
}
async function submitEdit() {
  if (!editDlg.form.kind || !editDlg.form.title) { ElMessage.warning('文种与标题必填'); return; }
  editDlg.saving = true;
  const r = editDlg.id
    ? await request.put(`/official-tpl/${editDlg.id}`, editDlg.form)
    : await request.post('/official-tpl', editDlg.form);
  editDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); editDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------- 补种 ---------- */
async function doSeed() {
  const r = await request.post('/official-tpl/seed');
  if (r.code === 200) { ElMessage.success(r.msg || '补种完成'); loadList(); loadStats(); }
  else ElMessage.error(r.msg || '补种失败');
}

/* 删除（内置禁删，仅自定义可用） */
async function removeTpl(row) {
  try { await ElMessageBox.confirm(`确认删除模板《${row.title}》？`, '删除确认', { type: 'warning' }); }
  catch (e) { return; }
  const r = await request.delete(`/official-tpl/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); loadList(); loadStats(); }
  else ElMessage.error(r.msg || '删除失败');
}
</script>

<style scoped>
.official-tpl { padding: 20px; }
.muted { color: #909399; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.el-form-item { margin-bottom: 12px; }
.field-block { margin-bottom: 12px; }
.field-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.content-box { white-space: pre-wrap; background: var(--el-fill-color-light); border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.7; max-height: 200px; overflow: auto; }
</style>
