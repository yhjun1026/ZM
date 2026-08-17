<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="520px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @open="reset"
  >
    <div v-if="alert" class="pm-alert" :class="'pm-alert-' + (alert.type || 'info')">
      <el-icon style="vertical-align: -2px; margin-right: 4px;">
        <Warning v-if="alert.type === 'warning'" />
        <Lock v-else-if="alert.icon === 'shield'" />
        <InfoFilled v-else />
      </el-icon>
      <span v-html="alert.text"></span>
    </div>
    <el-form label-position="top">
      <el-row :gutter="12">
        <el-col v-for="f in fields" :key="f.key" :span="f.half ? 12 : 24">
          <el-form-item :label="f.label">
            <el-select v-if="f.type === 'select'" v-model="form[f.key]" style="width: 100%;">
              <el-option v-for="o in f.options" :key="o.value ?? o" :label="o.label ?? o" :value="o.value ?? o" />
            </el-select>
            <el-date-picker
              v-else-if="f.type === 'date'"
              v-model="form[f.key]"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%;"
            />
            <el-input
              v-else-if="f.type === 'textarea'"
              v-model="form[f.key]"
              type="textarea"
              :rows="f.rows || 2"
              :placeholder="f.placeholder"
            />
            <el-input
              v-else-if="f.type === 'number'"
              v-model="form[f.key]"
              type="number"
              :min="f.min"
              :placeholder="f.placeholder"
            />
            <input v-else-if="f.type === 'file'" type="file" class="pm-file" @change="(e) => (form[f.key] = e.target.files[0])" />
            <el-input v-else v-model="form[f.key]" :placeholder="f.placeholder" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="$emit('submit', { ...form })">提交</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive } from 'vue';
import { InfoFilled, Warning, Lock } from '@element-plus/icons-vue';

const props = defineProps({
  modelValue: Boolean,
  title: { type: String, default: '' },
  fields: { type: Array, default: () => [] },
  alert: { type: Object, default: null },
  loading: Boolean,
});
defineEmits(['update:modelValue', 'submit']);

const form = reactive({});
function reset() {
  Object.keys(form).forEach((k) => delete form[k]);
  props.fields.forEach((f) => {
    form[f.key] = f.def !== undefined ? f.def : '';
  });
}
</script>

<style scoped>
.pm-alert {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  margin-bottom: 12px;
  background: var(--el-fill-color);
}
.pm-alert-warning {
  background: rgba(245, 158, 11, 0.12);
}
.pm-file {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 13px;
}
</style>
