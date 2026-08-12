<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>公司文件</h2><p>公司制度、通知公告管理</p></div>
      <el-button v-if="canCreate && !isMobile" type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 编写文件</el-button>
      <el-button v-if="canCreate && isMobile" type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon> 编写</el-button>
    </div>

    <!-- 桌面端：表格展示 -->
    <el-card v-if="!isMobile">
      <el-table :data="documents" stripe>
        <el-table-column prop="id" label="编号" width="100" />
        <el-table-column prop="title" label="文件标题" min-width="200" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="typeTag(row.type)">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="author" label="作者" width="100" />
        <el-table-column prop="dept" label="部门" width="120" />
        <el-table-column prop="date" label="日期" width="110" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">查看</el-button>
            <el-button v-if="row.status === '草稿'" size="small" type="primary" @click="submitDoc(row)">提交</el-button>
            <el-button v-if="canApprove && row.status === '审批中'" size="small" type="success" @click="approveDoc(row)">审批</el-button>
            <el-button v-if="row.status === '草稿'" size="small" type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 移动端：卡片展示 -->
    <div v-else class="mobile-document-list">
      <el-collapse v-model="activeCollapse">
        <el-collapse-item v-for="doc in documents" :key="doc.id" :name="doc.id">
          <template #title>
            <div class="document-title">
              <span class="title">{{ doc.title }}</span>
              <el-tag :type="statusType(doc.status)" size="small">{{ doc.status }}</el-tag>
            </div>
          </template>
          <div class="document-content">
            <div class="doc-meta">
              <div class="meta-item">
                <span class="label">类型：</span>
                <el-tag :type="typeTag(doc.type)" size="small">{{ doc.type }}</el-tag>
              </div>
              <div class="meta-item">
                <span class="label">作者：</span>
                <span>{{ doc.author }}</span>
              </div>
              <div class="meta-item">
                <span class="label">部门：</span>
                <span>{{ doc.dept }}</span>
              </div>
              <div class="meta-item">
                <span class="label">日期：</span>
                <span>{{ doc.date }}</span>
              </div>
            </div>
            <div class="doc-actions">
              <el-button size="small" type="primary" @click="openDetail(doc)">查看详情</el-button>
              <el-button v-if="doc.status === '草稿'" size="small" @click="submitDoc(doc)">提交审批</el-button>
              <el-button v-if="canApprove && doc.status === '审批中'" size="small" type="success" @click="approveDoc(doc)">审批通过</el-button>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
      <el-empty v-if="!documents.length" description="暂无文件" :image-size="80" />
    </div>

    <!-- 编写文件对话框 -->
    <el-dialog v-model="dialog.visible" title="编写公司文件" :width="isMobile ? '90%' : '640px'">
      <el-form :model="dialog.form" label-width="90px">
        <el-form-item label="文件标题" required>
          <el-input v-model="dialog.form.title" placeholder="请输入文件标题" />
        </el-form-item>
        <el-form-item label="文件类型">
          <el-select v-model="dialog.form.type" placeholder="选择文件类型" style="width: 100%;">
            <el-option label="通知公告" value="通知公告" />
            <el-option label="管理制度" value="管理制度" />
            <el-option label="操作规范" value="操作规范" />
          </el-select>
        </el-form-item>
        <el-form-item label="发放范围">
          <el-input v-model="dialog.form.distributeScope" placeholder="发放范围（默认：全体员工）" />
        </el-form-item>
        <el-form-item label="文件内容">
          <el-input v-model="dialog.form.content" type="textarea" :rows="10" placeholder="请输入文件内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detail.visible" title="文件详情" :width="isMobile ? '90%' : '640px'">
      <el-descriptions :column="isMobile ? 1 : 2" border>
        <el-descriptions-item label="文件编号">{{ detail.data.id }}</el-descriptions-item>
        <el-descriptions-item label="文件标题">{{ detail.data.title }}</el-descriptions-item>
        <el-descriptions-item label="文件类型">
          <el-tag :type="typeTag(detail.data.type)">{{ detail.data.type }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="文件状态">
          <el-tag :type="statusType(detail.data.status)">{{ detail.data.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="作者">{{ detail.data.author }}</el-descriptions-item>
        <el-descriptions-item label="部门">{{ detail.data.dept }}</el-descriptions-item>
        <el-descriptions-item label="发布日期">{{ detail.data.date }}</el-descriptions-item>
        <el-descriptions-item label="发放范围">{{ detail.data.distribute_scope || '全体员工' }}</el-descriptions-item>
        <el-descriptions-item label="阅读次数">{{ detail.data.read_count || 0 }} 次</el-descriptions-item>
        <el-descriptions-item label="文件内容" :span="2">
          <div style="white-space: pre-wrap; max-height: 400px; overflow-y: auto;">{{ detail.data.content }}</div>
        </el-descriptions-item>
      </el-descriptions>

      <!-- 审批流程 -->
      <div v-if="detail.data.doc_flow && detail.data.doc_flow.length" style="margin-top: 24px;">
        <h4 style="margin-bottom: 12px;">审批流程</h4>
        <el-timeline>
          <el-timeline-item
            v-for="(step, index) in detail.data.doc_flow"
            :key="index"
            :type="step.done ? 'success' : 'info'"
            :timestamp="step.time || ''"
          >
            <div><strong>{{ step.action }}</strong></div>
            <div v-if="step.user" style="color: #606266;">{{ step.user }}</div>
            <div v-if="step.remark" style="color: #909399; font-size: 13px;">{{ step.remark }}</div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const isMobile = computed(() => window.innerWidth <= 768);

const documents = ref([]);
const activeCollapse = ref([]);

// 权限检查
const canCreate = computed(() => {
  return auth.user && (auth.user.role !== '普通员工' || auth.user.dept === '行政部');
});

const canApprove = computed(() => {
  return auth.user && auth.user.role !== '普通员工';
});

const dialog = reactive({
  visible: false,
  saving: false,
  form: {
    title: '',
    type: '通知公告',
    distributeScope: '全体员工',
    content: ''
  }
});

const detail = reactive({
  visible: false,
  data: {}
});

// 加载文件列表
async function loadDocuments() {
  try {
    const res = await request.get('/documents');
    if (res.data.success) {
      documents.value = res.data.data;
    }
  } catch (e) {
    ElMessage.error('加载文件列表失败');
  }
}

// 类型标签
function typeTag(type) {
  const map = {
    '通知公告': 'primary',
    '管理制度': 'success',
    '操作规范': 'warning'
  };
  return map[type] || 'info';
}

// 状态标签
function statusType(status) {
  const map = {
    '草稿': 'info',
    '审批中': 'warning',
    '已下发': 'success',
    '已驳回': 'danger'
  };
  return map[status] || 'info';
}

// 打开编写对话框
function openCreate() {
  dialog.visible = true;
  Object.assign(dialog.form, {
    title: '',
    type: '通知公告',
    distributeScope: '全体员工',
    content: ''
  });
}

// 打开详情
async function openDetail(row) {
  try {
    const res = await request.get(`/documents/${row.id}`);
    if (res.data.success) {
      detail.data = res.data.data;
      detail.visible = true;
    }
  } catch (e) {
    ElMessage.error('获取文件详情失败');
  }
}

// 提交表单
async function onSubmit() {
  if (!dialog.form.title) {
    ElMessage.warning('请输入文件标题');
    return;
  }

  dialog.saving = true;
  try {
    // 字段名转换（后端会自动处理驼峰到下划线的转换）
    const formData = {
      title: dialog.form.title,
      type: dialog.form.type,
      distributeScope: dialog.form.distributeScope,
      content: dialog.form.content
    };

    const res = await request.post('/documents', formData);
    if (res.data.success) {
      ElMessage.success('文件创建成功');
      dialog.visible = false;
      loadDocuments();
    } else {
      ElMessage.error(res.data.message || '操作失败');
    }
  } catch (e) {
    ElMessage.error('操作失败');
  } finally {
    dialog.saving = false;
  }
}

// 提交审批
async function submitDoc(row) {
  try {
    await ElMessageBox.confirm(`确定提交文件「${row.title}」进行审批吗？`, '确认提交', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info'
    });

    const res = await request.post(`/documents/${row.id}/submit`);
    if (res.data.success) {
      ElMessage.success('文件已提交审批');
      loadDocuments();
    } else {
      ElMessage.error(res.data.message || '提交失败');
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('提交失败');
    }
  }
}

// 审批通过
async function approveDoc(row) {
  try {
    const { value: remark } = await ElMessageBox.prompt('请输入审批意见（可选）', '审批通过', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: '审批意见'
    });

    const res = await request.post(`/documents/${row.id}/approve`, { remark: remark || '' });
    if (res.data.success) {
      ElMessage.success('审批成功');
      loadDocuments();
    } else {
      ElMessage.error(res.data.message || '审批失败');
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('审批失败');
    }
  }
}

// 删除文件
async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除文件「${row.title}」吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const res = await request.delete(`/documents/${row.id}`);
    if (res.data.success) {
      ElMessage.success('文件已删除');
      loadDocuments();
    } else {
      ElMessage.error(res.data.message || '删除失败');
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败');
    }
  }
}

onMounted(() => {
  loadDocuments();
});
</script>

<style scoped>
.mobile-document-list {
  background: #fff;
}

.document-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.document-title .title {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.document-content {
  padding: 12px;
}

.doc-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.meta-item {
  display: flex;
  font-size: 14px;
}

.meta-item .label {
  color: #909399;
  min-width: 60px;
}

.doc-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>