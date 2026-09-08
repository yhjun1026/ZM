<template>
  <div class="doclib">
    <div class="page-header">
      <h2>制度与知识库</h2>
      <p>制度发布 → 修订升版 → 查阅留痕 → 废止归档　｜　知识库：分类归档 → 标签检索 → 下载学习 → 版本追溯</p>
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

    <el-tabs v-model="tab">
      <!-- ============ 制度中心 ============ -->
      <el-tab-pane label="制度中心" name="docs">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="docFilter.category" placeholder="全部分类" style="width:140px" clearable @change="loadDocs">
              <el-option v-for="c in meta.sys_categories" :key="c" :label="c" :value="c" />
            </el-select>
            <el-select v-model="docFilter.status" placeholder="全部状态" style="width:130px" clearable @change="loadDocs">
              <el-option v-for="s in meta.sys_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="docFilter.q" placeholder="搜索制度编号/标题/正文" style="width:230px" clearable @change="loadDocs" />
          </div>
          <el-button type="primary" @click="openDocCreate">
            <el-icon style="margin-right:4px"><Plus /></el-icon>发布制度
          </el-button>
        </div>

        <el-table :data="docRows" stripe size="small" v-loading="docLoading">
          <el-table-column prop="doc_no" label="制度编号" width="130" />
          <el-table-column prop="title" label="制度名称" min-width="200" show-overflow-tooltip />
          <el-table-column prop="category" label="分类" width="110" />
          <el-table-column prop="version" label="版本" width="80" />
          <el-table-column prop="issuer_dept" label="发布部门" width="120" show-overflow-tooltip />
          <el-table-column prop="issuer" label="发布人" width="90" />
          <el-table-column label="发布日期" width="110">
            <template #default="{ row }">{{ row.issue_date || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="docStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openDocRead(row)">查阅</el-button>
              <el-button size="small" @click="openDocRevise(row)">修订</el-button>
              <el-button size="small" type="danger" plain @click="revokeDoc(row)">废止</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无制度，点击右上角「发布制度」新建</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 知识库 ============ -->
      <el-tab-pane label="知识库" name="items">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="itemFilter.category" placeholder="全部分类" style="width:140px" clearable @change="loadItems">
              <el-option v-for="c in meta.kb_categories" :key="c" :label="c" :value="c" />
            </el-select>
            <el-input v-model="itemFilter.q" placeholder="搜索标题/标签/关键词/正文" style="width:240px" clearable @change="loadItems" />
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="doSeed">
              <el-icon style="margin-right:4px"><Refresh /></el-icon>内置补种
            </el-button>
            <el-button type="primary" @click="openItemCreate">
              <el-icon style="margin-right:4px"><Plus /></el-icon>上传文档
            </el-button>
          </div>
        </div>

        <el-table :data="itemRows" stripe size="small" v-loading="itemLoading">
          <el-table-column prop="title" label="标题" min-width="230" show-overflow-tooltip />
          <el-table-column prop="category" label="分类" width="110" />
          <el-table-column prop="folder" label="目录" width="150" show-overflow-tooltip />
          <el-table-column prop="version" label="版本" width="80" />
          <el-table-column prop="tags" label="标签" width="160" show-overflow-tooltip />
          <el-table-column label="密级" width="90">
            <template #default="{ row }"><el-tag :type="row.secret_level === '内部' ? 'info' : 'danger'" size="small">{{ row.secret_level }}</el-tag></template>
          </el-table-column>
          <el-table-column label="下载" width="80" align="center">
            <template #default="{ row }">{{ row.download_count || 0 }}</template>
          </el-table-column>
          <el-table-column label="上传时间" width="140">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openItemDetail(row)">详情</el-button>
              <el-button size="small" @click="openItemEdit(row)">更新</el-button>
              <el-button size="small" @click="downloadItem(row)">下载</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无知识库文档，可点击「内置补种」导入内置内容或「上传文档」新增</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 发布制度 -->
    <el-dialog v-model="docDlg.visible" title="发布制度" width="620px">
      <el-form label-width="90px" size="small">
        <el-form-item label="制度编号">
          <el-input v-model="docDlg.form.doc_no" placeholder="留空自动生成（ZD+年份+序号）" />
        </el-form-item>
        <el-form-item label="制度名称" required>
          <el-input v-model="docDlg.form.title" placeholder="如：考勤与请休假管理办法" />
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="docDlg.form.category" style="width:100%">
            <el-option v-for="c in meta.sys_categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="发布部门">
          <el-input v-model="docDlg.form.issuer_dept" placeholder="默认行政人事部" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="docDlg.form.content" type="textarea" :rows="7" placeholder="制度正文" />
        </el-form-item>
        <el-form-item label="保存方式">
          <el-radio-group v-model="docDlg.form.action">
            <el-radio label="发布">发布（现行有效）</el-radio>
            <el-radio label="草稿">存草稿（仅拟稿人/管理层可见）</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="docDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="docDlg.saving" @click="submitDoc">提交</el-button>
      </template>
    </el-dialog>

    <!-- 修订制度 -->
    <el-dialog v-model="reviseDlg.visible" :title="'修订制度 · ' + reviseDlg.name" width="600px">
      <p class="muted" style="margin-top:0;">当前版本 {{ reviseDlg.version }}，提交后自动升版（次版本号 +1）并留存版本记录。</p>
      <el-form label-width="90px" size="small">
        <el-form-item label="制度名称">
          <el-input v-model="reviseDlg.form.title" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="reviseDlg.form.content" type="textarea" :rows="8" />
        </el-form-item>
        <el-form-item label="修订说明">
          <el-input v-model="reviseDlg.form.change_note" placeholder="如：依据新条例调整处罚条款" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviseDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="reviseDlg.saving" @click="submitRevise">确认修订</el-button>
      </template>
    </el-dialog>

    <!-- 上传知识库文档 -->
    <el-dialog v-model="itemDlg.visible" title="上传知识库文档" width="620px">
      <el-form label-width="90px" size="small">
        <el-form-item label="标题" required>
          <el-input v-model="itemDlg.form.title" placeholder="如：彩超产品销售话术手册V2.0" />
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="itemDlg.form.category" style="width:100%">
            <el-option v-for="c in meta.kb_categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="目录">
          <el-input v-model="itemDlg.form.folder" placeholder="如：产品资料/彩超" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="itemDlg.form.tags" placeholder="逗号分隔，如：彩超,话术,销售" />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="itemDlg.form.keywords" placeholder="空格分隔，便于检索" />
        </el-form-item>
        <el-form-item label="密级">
          <el-select v-model="itemDlg.form.secret_level" style="width:100%">
            <el-option v-for="s in meta.secret_levels" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="itemDlg.form.content" type="textarea" :rows="6" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="itemDlg.saving" @click="submitItem">提交</el-button>
      </template>
    </el-dialog>

    <!-- 更新文档 -->
    <el-dialog v-model="editDlg.visible" :title="'更新文档 · ' + editDlg.name" width="600px">
      <p class="muted" style="margin-top:0;">当前版本 {{ editDlg.version }}，提交后自动升版并留存版本记录。</p>
      <el-form label-width="90px" size="small">
        <el-form-item label="标题">
          <el-input v-model="editDlg.form.title" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="editDlg.form.content" type="textarea" :rows="8" />
        </el-form-item>
        <el-form-item label="更新说明">
          <el-input v-model="editDlg.form.change_note" placeholder="如：补充 2026 版参数" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="editDlg.saving" @click="submitEdit">确认更新</el-button>
      </template>
    </el-dialog>

    <!-- 文档详情（含版本历史） -->
    <el-dialog v-model="detailDlg.visible" :title="detailDlg.title" width="760px">
      <el-descriptions :column="2" size="small" border style="margin-bottom:12px;">
        <el-descriptions-item label="分类">{{ detailDlg.row.category }}</el-descriptions-item>
        <el-descriptions-item label="目录">{{ detailDlg.row.folder || '—' }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ detailDlg.row.version }}</el-descriptions-item>
        <el-descriptions-item label="密级">{{ detailDlg.row.secret_level }}</el-descriptions-item>
        <el-descriptions-item label="上传者">{{ detailDlg.row.uploader_name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="下载次数">{{ detailDlg.row.download_count || 0 }}</el-descriptions-item>
        <el-descriptions-item label="标签" :span="2">{{ detailDlg.row.tags || '—' }}</el-descriptions-item>
      </el-descriptions>
      <div class="content-box">{{ detailDlg.row.content || '（无正文）' }}</div>
      <div style="margin:12px 0 6px;font-weight:600;">版本历史</div>
      <el-table :data="detailDlg.versions" stripe size="small" max-height="200">
        <el-table-column prop="version" label="版本" width="90" />
        <el-table-column prop="change_note" label="变更说明" min-width="180" show-overflow-tooltip />
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
        </el-table-column>
        <template #empty><span class="muted">暂无版本记录</span></template>
      </el-table>
      <template #footer>
        <el-button @click="detailDlg.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Reading, Files, Download, Collection, Plus, Refresh } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('docs');
const meta = ref({ sys_categories: [], sys_status: [], kb_categories: [], secret_levels: [] });
const stats = ref(null);
const docRows = ref([]);
const itemRows = ref([]);
const docLoading = ref(false);
const itemLoading = ref(false);
const docFilter = reactive({ category: '', status: '', q: '' });
const itemFilter = reactive({ category: '', q: '' });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '制度总数', value: s.doc_total, sub: `现行有效 ${s.doc_valid} 份`, icon: Reading, color: '#2563eb' },
    { title: '已废止', value: s.doc_revoked, sub: `草稿 ${s.doc_draft} 份`, icon: Files, color: '#8b5cf6' },
    { title: '知识库条目', value: s.item_total, sub: `全库 ${s.item_all} 条`, icon: Collection, color: '#10b981' },
    { title: '累计下载', value: s.downloads, sub: `版本记录 ${s.versions} 条`, icon: Download, color: '#f59e0b' },
  ];
});

function docStatusType(s) {
  return { 现行有效: 'success', 修订中: 'warning', 已废止: 'danger', 草稿: 'info' }[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/doclib/meta');
  if (r.code === 200) meta.value = r.data || {};
}
async function loadStats() {
  const r = await request.get('/doclib/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadDocs() {
  docLoading.value = true;
  try {
    const params = {};
    ['category', 'status', 'q'].forEach((k) => { if (docFilter[k]) params[k] = docFilter[k]; });
    const r = await request.get('/doclib/docs', { params });
    docRows.value = r.code === 200 ? r.data || [] : [];
  } finally { docLoading.value = false; }
}
async function loadItems() {
  itemLoading.value = true;
  try {
    const params = {};
    ['category', 'q'].forEach((k) => { if (itemFilter[k]) params[k] = itemFilter[k]; });
    const r = await request.get('/doclib/items', { params });
    itemRows.value = r.code === 200 ? r.data || [] : [];
  } finally { itemLoading.value = false; }
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadDocs(); await loadItems(); });

/* ---------- 制度 ---------- */
const docDlg = reactive({
  visible: false, saving: false,
  form: { doc_no: '', title: '', category: '行政后勤', issuer_dept: '', content: '', action: '发布' },
});
function openDocCreate() {
  Object.assign(docDlg.form, { doc_no: '', title: '', category: '行政后勤', issuer_dept: '', content: '', action: '发布' });
  docDlg.visible = true;
}
async function submitDoc() {
  if (!docDlg.form.title || !docDlg.form.category) { ElMessage.warning('制度名称与分类必填'); return; }
  docDlg.saving = true;
  const r = await request.post('/doclib/docs', docDlg.form);
  docDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); docDlg.visible = false; loadDocs(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}

const reviseDlg = reactive({ visible: false, saving: false, id: null, name: '', version: '', form: { title: '', content: '', change_note: '' } });
async function openDocRevise(row) {
  const r = await request.get(`/doclib/docs/${row.id}`);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  reviseDlg.id = row.id;
  reviseDlg.name = row.title;
  reviseDlg.version = row.version;
  reviseDlg.form = { title: row.title, content: r.data.content || '', change_note: '' };
  reviseDlg.visible = true;
}
async function submitRevise() {
  reviseDlg.saving = true;
  const r = await request.put(`/doclib/docs/${reviseDlg.id}`, reviseDlg.form);
  reviseDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已修订'); reviseDlg.visible = false; loadDocs(); }
  else ElMessage.error(r.msg || '修订失败');
}

const detailDlg = reactive({ visible: false, title: '', row: {}, versions: [] });

async function openDocRead(row) {
  const r = await request.post(`/doclib/docs/${row.id}/read`);
  if (r.code !== 200) { ElMessage.error(r.msg || '查阅失败'); return; }
  const d = r.data;
  ElMessageBox.alert(
    `<div style="max-height:420px;overflow:auto;white-space:pre-wrap;text-align:left">${(d.content || '（无正文）').replace(/</g, '&lt;')}</div>`,
    `${d.doc_no} ${d.title}（${d.version}）`,
    { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
  ).catch(() => {});
}

async function revokeDoc(row) {
  if (row.status !== '现行有效') { ElMessage.warning('仅现行有效制度可废止'); return; }
  try { await ElMessageBox.confirm(`确认废止制度《${row.title}》？废止后不再对外执行。`, '废止确认', { type: 'warning' }); }
  catch (e) { return; }
  const r = await request.put(`/doclib/docs/${row.id}/revoke`);
  if (r.code === 200) { ElMessage.success('已废止'); loadDocs(); loadStats(); }
  else ElMessage.error(r.msg || '废止失败');
}

/* ---------- 知识库 ---------- */
const itemDlg = reactive({
  visible: false, saving: false,
  form: { title: '', category: '制度SOP', folder: '', tags: '', keywords: '', content: '', secret_level: '内部' },
});
function openItemCreate() {
  Object.assign(itemDlg.form, { title: '', category: '制度SOP', folder: '', tags: '', keywords: '', content: '', secret_level: '内部' });
  itemDlg.visible = true;
}
async function submitItem() {
  if (!itemDlg.form.title || !itemDlg.form.category) { ElMessage.warning('标题与分类必填'); return; }
  itemDlg.saving = true;
  const r = await request.post('/doclib/items', itemDlg.form);
  itemDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已上传'); itemDlg.visible = false; loadItems(); loadStats(); }
  else ElMessage.error(r.msg || '上传失败');
}

const editDlg = reactive({ visible: false, saving: false, id: null, name: '', version: '', form: { title: '', content: '', change_note: '' } });
async function openItemEdit(row) {
  const r = await request.get(`/doclib/items/${row.id}`);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  editDlg.id = row.id;
  editDlg.name = row.title;
  editDlg.version = row.version;
  editDlg.form = { title: row.title, content: r.data.content || '', change_note: '' };
  editDlg.visible = true;
}
async function submitEdit() {
  editDlg.saving = true;
  const r = await request.put(`/doclib/items/${editDlg.id}`, editDlg.form);
  editDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已更新'); editDlg.visible = false; loadItems(); }
  else ElMessage.error(r.msg || '更新失败');
}

async function openItemDetail(row) {
  const r = await request.get(`/doclib/items/${row.id}`);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  detailDlg.title = row.title;
  detailDlg.row = r.data || {};
  detailDlg.versions = r.data.versions || [];
  detailDlg.visible = true;
}

async function downloadItem(row) {
  const r = await request.post(`/doclib/items/${row.id}/download`);
  if (r.code !== 200) { ElMessage.error(r.msg || '下载失败'); return; }
  ElMessage.success(`已下载（累计 ${r.data.download_count} 次）`);
  loadItems();
}

async function doSeed() {
  const r = await request.post('/doclib/seed');
  if (r.code === 200) { ElMessage.success(r.msg || '补种完成'); loadItems(); loadStats(); }
  else ElMessage.error(r.msg || '补种失败');
}
</script>

<style scoped>
.doclib { padding: 20px; }
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
.content-box { white-space: pre-wrap; background: var(--el-fill-color-light); border-radius: 8px; padding: 12px; max-height: 260px; overflow: auto; font-size: 13px; line-height: 1.7; }
</style>
