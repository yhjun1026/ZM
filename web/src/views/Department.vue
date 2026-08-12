<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>部门管理</h2><p>组织架构管理</p></div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新增部门</el-button>
    </div>

    <!-- 桌面端：卡片式布局 -->
    <div v-if="!isMobile" class="department-cards">
      <div v-for="dept in departments" :key="dept.id" class="department-card">
        <div class="dept-header" :style="{ background: dept.color || '#6366f1' }">
          <div class="dept-icon">
            <el-icon :size="24"><component :is="getIcon(dept.icon)" /></el-icon>
          </div>
          <h3 class="dept-name">{{ dept.name }}</h3>
        </div>
        <div class="dept-body">
          <div class="dept-info">
            <span class="info-label">负责人：</span>
            <span class="info-value">{{ dept.head || '暂无' }}</span>
          </div>
          <div class="dept-info">
            <span class="info-label">人数：</span>
            <span class="info-value">{{ dept.count || 0 }}人</span>
          </div>
          <div v-if="dept.children && dept.children.length" class="sub-depts">
            <div v-for="child in dept.children" :key="child.id" class="sub-dept-item">
              <div class="sub-dept-header" :style="{ background: child.color || '#94a3b8' }">
                <el-icon :size="16"><component :is="getIcon(child.icon)" /></el-icon>
                <span>{{ child.name }}</span>
              </div>
              <div class="sub-dept-info">
                <span>负责人：{{ child.head || '暂无' }}</span>
                <span>人数：{{ child.count || 0 }}人</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 移动端：折叠卡片 -->
    <div v-else class="mobile-departments">
      <el-collapse>
        <el-collapse-item v-for="dept in departments" :key="dept.id" :name="dept.id">
          <template #title>
            <div class="mobile-dept-title">
              <el-icon :size="20" :style="{ color: dept.color || '#6366f1' }"><component :is="getIcon(dept.icon)" /></el-icon>
              <span>{{ dept.name }}</span>
              <el-tag size="small">{{ dept.count || 0 }}人</el-tag>
            </div>
          </template>
          <div class="mobile-dept-content">
            <div class="info-row">
              <span>负责人：</span>
              <span>{{ dept.head || '暂无' }}</span>
            </div>
            <div v-if="dept.children && dept.children.length" class="mobile-sub-depts">
              <div v-for="child in dept.children" :key="child.id" class="mobile-sub-dept">
                <div class="sub-dept-name">{{ child.name }}</div>
                <div class="sub-dept-detail">
                  <span>{{ child.head || '暂无' }}</span>
                  <span>{{ child.count || 0 }}人</span>
                </div>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getDepartments, addDepartment, deleteDepartment } from '../api/modules';

const departments = ref([]);
const flatDepts = computed(() => {
  const out = [];
  departments.value.forEach((d) => { out.push({ id: d.id, name: d.name }); (d.children || []).forEach((c) => out.push({ id: c.id, name: c.name })); });
  return out;
});

// 图标映射
function getIcon(iconName) {
  const iconMap = {
    'building': 'OfficeBuilding',
    'shopping-cart': 'ShoppingCart',
    'bullhorn': 'Bell',
    'code': 'Document',
    'cny': 'Money',
    'paperclip': 'Paperclip',
    'users': 'User',
    'folder': 'Folder',
    'sitemap': 'OfficeBuilding'
  };
  return iconMap[iconName] || 'OfficeBuilding';
}

async function load() {
  const r = await getDepartments();
  if (r.success) departments.value = r.data || [];
}
onMounted(load);

const dlg = reactive({ visible: false, saving: false, form: {} });
function openCreate() { dlg.form = { name: '', head: '', parentId: null }; dlg.visible = true; }
async function onSubmit() {
  if (!dlg.form.name) { ElMessage.warning('请填写部门名称'); return; }
  dlg.saving = true;
  const r = await addDepartment(dlg.form);
  dlg.saving = false;
  if (r.success) { ElMessage.success('已添加'); dlg.visible = false; load(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm(`确认删除部门「${row.name}」？`, '提示', { type: 'warning' }); } catch { return; }
  const r = await deleteDepartment(row.id);
  if (r.success) { ElMessage.success('已删除'); load(); }
}
</script>

<style scoped>
.department-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.department-card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  overflow: hidden;
}

.dept-header {
  color: #fff;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.dept-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255,255,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dept-name {
  margin: 0;
  font-size: 18px;
}

.dept-body {
  padding: 16px;
}

.dept-info {
  display: flex;
  margin-bottom: 8px;
  font-size: 14px;
}

.info-label {
  color: #909399;
  min-width: 70px;
}

.info-value {
  color: #303133;
}

.sub-depts {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.sub-dept-item {
  margin-bottom: 8px;
  border-radius: 6px;
  overflow: hidden;
}

.sub-dept-header {
  color: #fff;
  padding: 8px 12px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-dept-info {
  background: #f5f7fa;
  padding: 8px 12px;
  font-size: 12px;
  color: #606266;
  display: flex;
  gap: 16px;
}

/* 移动端样式 */
.mobile-departments {
  background: #fff;
  border-radius: 8px;
}

.mobile-dept-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.mobile-dept-content {
  padding: 12px;
}

.info-row {
  display: flex;
  font-size: 13px;
  margin-bottom: 8px;
}

.mobile-sub-depts {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.mobile-sub-dept {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
}

.sub-dept-name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.sub-dept-detail {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #606266;
}
</style>
