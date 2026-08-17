<template>
  <el-dialog
    :model-value="modelValue"
    title="发起项目立项"
    width="640px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @open="reset"
  >
    <el-form label-position="top">
      <el-form-item label="项目类型">
        <el-select v-model="form.type" style="width: 100%;">
          <el-option label="医疗设备销售项目" value="sales" />
          <el-option label="AI技术自研项目" value="ai" />
        </el-select>
      </el-form-item>
      <el-form-item label="项目名称">
        <el-input v-model="form.name" placeholder="请输入项目名称" />
      </el-form-item>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="项目等级">
            <el-select v-model="form.level" style="width: 100%;">
              <el-option label="普通" value="普通" />
              <el-option label="重点" value="重点" />
              <el-option label="重大（触发管理层终审+督办）" value="重大" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="计划结束日期">
            <el-date-picker v-model="form.plan_end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
          </el-form-item>
        </el-col>
      </el-row>

      <template v-if="form.type === 'sales'">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="客户名称"><el-input v-model="form.customer_name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="设备品类"><el-input v-model="form.device_category" placeholder="如：CT/核磁/超声" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="招投标编号"><el-input v-model="form.tender_no" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="合同金额(¥)"><el-input v-model="form.contract_amount" type="number" min="0" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="预计回款周期(天)"><el-input v-model="form.payment_cycle_days" type="number" min="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="交付周期"><el-input v-model="form.deliver_cycle" placeholder="如：90天内" /></el-form-item></el-col>
        </el-row>
      </template>

      <template v-else>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="研发方向">
              <el-select v-model="form.research_direction" style="width: 100%;">
                <el-option value="医疗AI算法" />
                <el-option value="智能设备系统" />
                <el-option value="AI辅助工具" />
                <el-option value="技术迭代升级" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="迭代版本"><el-input v-model="form.iter_version" placeholder="如：V1.0" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="技术难点"><el-input v-model="form.tech_difficulty" type="textarea" :rows="2" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="研发周期(天)"><el-input v-model="form.rd_cycle_days" type="number" min="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="所需资源"><el-input v-model="form.resource_needs" placeholder="算力/设备/人员" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="落地应用场景"><el-input v-model="form.application_scene" /></el-form-item>
      </template>

      <el-form-item label="项目说明"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>

      <div class="pm-alert">
        <el-icon style="vertical-align: -2px; margin-right: 4px;"><InfoFilled /></el-icon>
        审批流固化：<strong>销售</strong>=部门总监→财务合规初审（重大+管理层终审）；<strong>AI自研</strong>=技术总监评审→资源配置审核（重大+管理层终审）
      </div>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onSubmit">提交立项审批</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { InfoFilled } from '@element-plus/icons-vue';
import { projectsApi } from './api';

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue', 'done']);

const loading = ref(false);
const form = reactive({});

function reset() {
  Object.assign(form, {
    type: 'sales', name: '', level: '普通', plan_end_date: '', description: '',
    customer_name: '', device_category: '', tender_no: '', contract_amount: '', payment_cycle_days: '', deliver_cycle: '',
    research_direction: '医疗AI算法', iter_version: '', tech_difficulty: '', rd_cycle_days: '', resource_needs: '', application_scene: '',
  });
}

async function onSubmit() {
  const data = {
    type: form.type,
    name: (form.name || '').trim(),
    level: form.level,
    plan_end_date: form.plan_end_date || '',
    description: (form.description || '').trim(),
  };
  if (!data.name) { ElMessage.warning('请输入项目名称'); return; }
  if (form.type === 'sales') {
    data.customer_name = (form.customer_name || '').trim();
    data.device_category = (form.device_category || '').trim();
    data.tender_no = (form.tender_no || '').trim();
    data.contract_amount = parseFloat(form.contract_amount) || 0;
    data.payment_cycle_days = parseInt(form.payment_cycle_days) || 0;
    data.deliver_cycle = (form.deliver_cycle || '').trim();
    if (!data.customer_name) { ElMessage.warning('销售项目必须填写客户名称'); return; }
  } else {
    data.research_direction = form.research_direction;
    data.iter_version = (form.iter_version || '').trim();
    data.tech_difficulty = (form.tech_difficulty || '').trim();
    data.rd_cycle_days = parseInt(form.rd_cycle_days) || 0;
    data.resource_needs = (form.resource_needs || '').trim();
    data.application_scene = (form.application_scene || '').trim();
  }
  loading.value = true;
  const resp = await projectsApi.create(data);
  loading.value = false;
  if (resp.code === 200) {
    ElMessage.success(resp.msg || '已提交立项审批');
    emit('update:modelValue', false);
    emit('done');
  } else {
    ElMessage.error(resp.msg || '创建失败');
  }
}
</script>

<style scoped>
.pm-alert {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  background: var(--el-fill-color);
}
</style>
