<template>
  <div class="announcement">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2>公司公告</h2>
        <p>公司重要通知与公告发布</p>
      </div>
      <el-button v-if="canCreate" type="primary" size="small" @click="showDialog = true">
        <el-icon><Plus /></el-icon> 发布公告
      </el-button>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="16" style="margin-bottom: 20px;">
      <el-col :xs="12" :sm="4">
        <el-card shadow="hover">
          <div style="text-align: center;">
            <div style="font-size: 13px; color: #909399;">已发布</div>
            <div style="font-size: 24px; font-weight: 700; color: #10b981;">{{ publishedCount }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="4">
        <el-card shadow="hover">
          <div style="text-align: center;">
            <div style="font-size: 13px; color: #909399;">待审批</div>
            <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">{{ pendingCount }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 公告列表 -->
    <el-card>
      <div v-for="item in announcements" :key="item.id" style="padding: 16px 0; border-bottom: 1px solid #f0f0f0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <el-tag :type="getCategoryType(item.category)" size="small" style="margin-right: 8px;">
              {{ item.category }}
            </el-tag>
            <el-tag :type="getStatusType(item.status)" size="small" style="margin-right: 8px;">
              {{ item.status }}
            </el-tag>
            <strong style="font-size: 16px;">{{ item.title }}</strong>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #909399; font-size: 13px;">{{ item.author }} · {{ item.created_at }}</span>
            <el-button v-if="canApprove && item.status === '待审批'" size="small" type="success" @click="approve(item)">通过</el-button>
            <el-button v-if="canApprove && item.status === '待审批'" size="small" type="danger" @click="reject(item)">驳回</el-button>
          </div>
        </div>
        <p style="margin: 12px 0 0; color: #606266; line-height: 1.6;">{{ item.content }}</p>
      </div>
      <el-empty v-if="!announcements.length" description="暂无公告" :image-size="80" />
    </el-card>

    <!-- 发布公告对话框 -->
    <el-dialog v-model="showDialog" title="发布公告" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="公告标题">
          <el-input v-model="form.title" placeholder="请输入公告标题" />
        </el-form-item>
        <el-form-item label="公告类别">
          <el-select v-model="form.category" style="width: 100%;">
            <el-option label="产品会议" value="产品会议" />
            <el-option label="公司团建" value="公司团建" />
            <el-option label="会议通知" value="会议通知" />
            <el-option label="放假通知" value="放假通知" />
            <el-option label="人事任命" value="人事任命" />
          </el-select>
        </el-form-item>
        <el-form-item label="公告内容">
          <el-input v-model="form.content" type="textarea" :rows="6" placeholder="请输入公告内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submitForm">提交审批</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();
const canCreate = computed(() => auth.user?.dept === '行政部');
const canApprove = computed(() => ['行政部经理', '总经理', '超级管理员'].includes(auth.user?.role));

const announcements = ref([]);
const showDialog = ref(false);
const form = ref({
  title: '',
  category: '会议通知',
  content: ''
});

const publishedCount = computed(() => announcements.value.filter(a => a.status === '已发布').length);
const pendingCount = computed(() => announcements.value.filter(a => a.status === '待审批').length);

function getCategoryType(category) {
  const map = {
    '产品会议': 'primary',
    '公司团建': 'success',
    '会议通知': 'warning',
    '放假通知': 'danger',
    '人事任命': 'info'
  };
  return map[category] || 'info';
}

function getStatusType(status) {
  const map = {
    '已发布': 'success',
    '待审批': 'warning',
    '已驳回': 'danger'
  };
  return map[status] || 'info';
}

async function loadAnnouncements() {
  try {
    const res = await request.get('/announcement');
    if (res.data.success) {
      announcements.value = res.data.data;
    }
  } catch (e) {
    console.error('加载公告失败:', e);
  }
}

async function submitForm() {
  try {
    const res = await request.post('/announcement', form.value);
    if (res.data.success) {
      ElMessage.success('公告已提交审批');
      showDialog.value = false;
      form.value = { title: '', category: '会议通知', content: '' };
      loadAnnouncements();
    } else {
      ElMessage.error(res.data.message || '发布失败');
    }
  } catch (e) {
    ElMessage.error('发布失败');
  }
}

async function approve(item) {
  try {
    const { value } = await ElMessageBox.prompt('请输入审批意见（可选）', '审批通过', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: '审批意见'
    });

    const res = await request.post(`/announcement/${item.id}/approve`, { remark: value || '' });
    if (res.data.success) {
      ElMessage.success('公告已发布');
      loadAnnouncements();
    } else {
      ElMessage.error(res.data.message || '审批失败');
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('审批失败');
    }
  }
}

async function reject(item) {
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回公告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: '驳回原因',
      inputValidator: (val) => !!val || '请输入驳回原因'
    });

    const res = await request.post(`/announcement/${item.id}/reject`, { remark: value });
    if (res.data.success) {
      ElMessage.success('已驳回');
      loadAnnouncements();
    } else {
      ElMessage.error(res.data.message || '驳回失败');
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('驳回失败');
    }
  }
}

onMounted(() => {
  loadAnnouncements();
});
</script>

<style scoped>
.announcement {
  padding: 20px;
}
</style>
