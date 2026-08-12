<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>供应商管理</h2><p>管理供应商信息与评级</p></div>
      <el-button v-if="!isMobile" type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新增供应商</el-button>
      <el-button v-else type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon> 新增</el-button>
    </div>

    <!-- 桌面端：表格展示 -->
    <el-card v-if="!isMobile">
      <el-table :data="suppliers" stripe>
        <el-table-column prop="id" label="编号" width="100" />
        <el-table-column prop="name" label="供应商名称" min-width="180" />
        <el-table-column label="等级" width="90">
          <template #default="{ row }">
            <el-tag :type="levelType(row.level)">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="类别" width="120" />
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column label="评级" width="80">
          <template #default="{ row }">
            <span style="color: #f59e0b;">★</span> {{ row.rating || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '合作中' ? 'success' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
            <el-button size="small" type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 移动端：卡片展示 -->
    <div v-else class="mobile-supplier-list">
      <div v-for="item in suppliers" :key="item.id" class="supplier-card" @click="openDetail(item)">
        <div class="supplier-header">
          <div class="supplier-name">{{ item.name }}</div>
          <el-tag :type="levelType(item.level)" size="small">{{ item.level }}</el-tag>
        </div>
        <div class="supplier-info">
          <div class="info-item">
            <span class="label">联系人：</span>
            <span class="value">{{ item.contact }}</span>
          </div>
          <div class="info-item">
            <span class="label">电话：</span>
            <span class="value">{{ item.phone }}</span>
          </div>
          <div class="info-item">
            <span class="label">评级：</span>
            <span class="value rating"><span style="color: #f59e0b;">★</span> {{ item.rating || 0 }}</span>
          </div>
          <div class="info-item">
            <span class="label">状态：</span>
            <el-tag :type="item.status === '合作中' ? 'success' : 'info'" size="small">{{ item.status }}</el-tag>
          </div>
        </div>
        <div class="supplier-actions">
          <el-button size="small" @click.stop="openEdit(item)">编辑</el-button>
          <el-button size="small" type="danger" @click.stop="onDelete(item)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!suppliers.length" description="暂无供应商数据" :image-size="80" />
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑供应商' : '新增供应商'" :width="isMobile ? '90%' : '560px'">
      <el-form :model="dialog.form" label-width="90px">
        <el-form-item label="供应商名称" required>
          <el-input v-model="dialog.form.name" placeholder="请输入供应商名称" />
        </el-form-item>
        <el-form-item label="简称">
          <el-input v-model="dialog.form.shortName" placeholder="供应商简称" />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="dialog.form.category" placeholder="选择类别" style="width: 100%;">
            <el-option label="电子设备" value="电子设备" />
            <el-option label="机械设备" value="机械设备" />
            <el-option label="办公用品" value="办公用品" />
            <el-option label="物流服务" value="物流服务" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="dialog.form.level" placeholder="选择等级" style="width: 100%;">
            <el-option label="A级 - 战略供应商" value="A级" />
            <el-option label="B级 - 重要供应商" value="B级" />
            <el-option label="C级 - 普通供应商" value="C级" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="dialog.form.contact" placeholder="联系人姓名" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="dialog.form.phone" placeholder="联系电话" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="dialog.form.email" placeholder="电子邮箱" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="dialog.form.address" placeholder="供应商地址" />
        </el-form-item>
        <el-form-item label="开户银行">
          <el-input v-model="dialog.form.bank" placeholder="开户银行" />
        </el-form-item>
        <el-form-item label="银行账号">
          <el-input v-model="dialog.form.account" placeholder="银行账号" />
        </el-form-item>
        <el-form-item label="业务范围">
          <el-input v-model="dialog.form.businessScope" type="textarea" :rows="3" placeholder="主营业务范围" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="dialog.form.remark" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detail.visible" title="供应商详情" :width="isMobile ? '90%' : '700px'">
      <el-descriptions :column="isMobile ? 1 : 2" border>
        <el-descriptions-item label="供应商编号">{{ detail.data.id }}</el-descriptions-item>
        <el-descriptions-item label="供应商名称">{{ detail.data.name }}</el-descriptions-item>
        <el-descriptions-item label="简称">{{ detail.data.short_name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="等级">
          <el-tag :type="levelType(detail.data.level)">{{ detail.data.level }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="类别">{{ detail.data.category }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="detail.data.status === '合作中' ? 'success' : 'info'">{{ detail.data.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="联系人">{{ detail.data.contact }}</el-descriptions-item>
        <el-descriptions-item label="电话">{{ detail.data.phone }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ detail.data.email || '—' }}</el-descriptions-item>
        <el-descriptions-item label="地址">{{ detail.data.address || '—' }}</el-descriptions-item>
        <el-descriptions-item label="开户银行">{{ detail.data.bank || '—' }}</el-descriptions-item>
        <el-descriptions-item label="银行账号">{{ detail.data.account || '—' }}</el-descriptions-item>
        <el-descriptions-item label="评级">
          <span style="color: #f59e0b;">★</span> {{ detail.data.rating || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="合作日期">{{ detail.data.coop_date || '—' }}</el-descriptions-item>
        <el-descriptions-item label="业务范围" :span="2">{{ detail.data.business_scope || '—' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detail.data.remark || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import request from '../api/request';

// 移动端检测
const isMobile = computed(() => window.innerWidth <= 768);

const suppliers = ref([]);

const dialog = reactive({
  visible: false,
  isEdit: false,
  saving: false,
  form: {
    name: '',
    shortName: '',
    category: '',
    level: 'C级',
    contact: '',
    phone: '',
    email: '',
    address: '',
    bank: '',
    account: '',
    businessScope: '',
    remark: ''
  }
});

const detail = reactive({
  visible: false,
  data: {}
});

// 获取供应商列表
async function loadSuppliers() {
  try {
    const res = await request.get('/suppliers');
    if (res.data.success) {
      suppliers.value = res.data.data;
    }
  } catch (e) {
    ElMessage.error('加载供应商列表失败');
  }
}

// 等级标签类型
function levelType(level) {
  const map = { 'A级': 'success', 'B级': 'primary', 'C级': 'warning' };
  return map[level] || 'info';
}

// 打开新增对话框
function openCreate() {
  dialog.isEdit = false;
  dialog.visible = true;
  Object.assign(dialog.form, {
    name: '',
    shortName: '',
    category: '',
    level: 'C级',
    contact: '',
    phone: '',
    email: '',
    address: '',
    bank: '',
    account: '',
    businessScope: '',
    remark: ''
  });
}

// 打开编辑对话框
function openEdit(row) {
  dialog.isEdit = true;
  dialog.visible = true;
  Object.assign(dialog.form, {
    name: row.name,
    shortName: row.short_name || '',
    category: row.category || '',
    level: row.level || 'C级',
    contact: row.contact || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    bank: row.bank || '',
    account: row.account || '',
    businessScope: row.business_scope || '',
    remark: row.remark || '',
    id: row.id
  });
}

// 打开详情对话框
async function openDetail(row) {
  try {
    const res = await request.get(`/suppliers/${row.id}`);
    if (res.data.success) {
      detail.data = res.data.data;
      detail.visible = true;
    }
  } catch (e) {
    ElMessage.error('获取供应商详情失败');
  }
}

// 提交表单
async function onSubmit() {
  if (!dialog.form.name) {
    ElMessage.warning('请输入供应商名称');
    return;
  }

  dialog.saving = true;
  try {
    // 转换字段名为后端期望的格式（下划线命名）
    const formData = {
      name: dialog.form.name,
      shortName: dialog.form.shortName,  // 后端会自动处理
      category: dialog.form.category,
      level: dialog.form.level,
      contact: dialog.form.contact,
      phone: dialog.form.phone,
      email: dialog.form.email,
      address: dialog.form.address,
      bank: dialog.form.bank,
      account: dialog.form.account,
      businessScope: dialog.form.businessScope,  // 后端会自动处理
      remark: dialog.form.remark
    };

    const url = dialog.isEdit ? `/suppliers/${dialog.form.id}` : '/suppliers';
    const method = dialog.isEdit ? 'put' : 'post';
    const res = await request[method](url, formData);

    if (res.data.success) {
      ElMessage.success(dialog.isEdit ? '供应商更新成功' : '供应商创建成功');
      dialog.visible = false;
      loadSuppliers();
    } else {
      ElMessage.error(res.data.message || '操作失败');
    }
  } catch (e) {
    ElMessage.error('操作失败');
  } finally {
    dialog.saving = false;
  }
}

// 删除供应商
async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除供应商「${row.name}」吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });

    const res = await request.delete(`/suppliers/${row.id}`);
    if (res.data.success) {
      ElMessage.success('供应商已删除');
      loadSuppliers();
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
  loadSuppliers();
});
</script>

<style scoped>
.mobile-supplier-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.supplier-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.3s;
}

.supplier-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.supplier-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.supplier-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.supplier-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item {
  display: flex;
  font-size: 14px;
}

.info-item .label {
  color: #909399;
  min-width: 70px;
}

.info-item .value {
  color: #303133;
}

.supplier-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}
</style>