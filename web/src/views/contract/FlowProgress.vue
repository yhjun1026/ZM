<template>
  <div v-if="!flow" style="color:#909399;font-size:13px;">暂无流程数据</div>
  <!-- 旧格式（数组） -->
  <div v-else-if="isArray" style="display:flex;gap:0;flex-wrap:wrap;align-items:center;">
    <template v-for="(s, i) in flow" :key="i">
      <div style="display:flex;align-items:center;gap:4px;">
        <div :style="`padding:6px 12px;border-radius:8px;font-size:12px;${s.done ? 'background:#10b981;color:#fff;' : 'background:#fff;color:#606266;border:1px solid #dcdfe6;'}`">
          <el-icon v-if="s.done" style="vertical-align:-2px;"><Check /></el-icon> {{ s.step }}
          <span v-if="s.user" style="font-size:11px;opacity:.8;">({{ s.user }})</span>
        </div>
        <el-icon v-if="i < flow.length - 1" style="color:#909399;font-size:10px;"><ArrowRight /></el-icon>
      </div>
    </template>
  </div>
  <!-- 新格式（对象，含 steps） -->
  <div v-else style="display:flex;flex-direction:column;gap:8px;">
    <div style="font-size:13px;color:#909399;">
      流程状态: <strong :style="`color:${flow.status === '已完成' ? '#10b981' : flow.status === '已驳回' ? '#ef4444' : '#3b82f6'}`">{{ flow.status || '进行中' }}</strong>
      <template v-if="flow.current_node"> | 当前节点: {{ flow.current_node }}</template>
      <template v-if="flow.contract_no"> | 合同编号: {{ flow.contract_no }}</template>
    </div>
    <div style="display:flex;gap:0;flex-wrap:wrap;align-items:flex-start;">
      <template v-for="(step, i) in steps" :key="i">
        <div style="display:flex;align-items:center;gap:4px;">
          <!-- 并行节点 -->
          <div v-if="step.type === 'parallel' && step.children"
               :style="`display:flex;flex-direction:column;gap:4px;border:2px solid ${parallelColor(step)};border-radius:10px;padding:8px;background:#fff;`">
            <div :style="`text-align:center;font-size:12px;color:${parallelColor(step)};font-weight:600;`">
              {{ step.name }} ({{ parallelDone(step) }}/{{ step.children.length }})
            </div>
            <div style="display:flex;gap:8px;justify-content:center;">
              <div v-for="(c, ci) in step.children" :key="ci" :style="nodeStyle(c.status)">
                {{ c.name }}
                <div v-if="c.approver" style="font-size:10px;opacity:.8;">{{ c.approver }} {{ c.time }}</div>
                <div v-if="c.comment" style="font-size:10px;opacity:.7;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ c.comment }}</div>
              </div>
            </div>
          </div>
          <!-- 条件分支节点 -->
          <div v-else-if="step.type === 'conditional'"
               :style="`display:flex;flex-direction:column;gap:4px;border:2px dashed ${colorOf(step.status)};border-radius:10px;padding:8px;background:#fff;`">
            <div :style="`text-align:center;font-size:12px;color:${colorOf(step.status)};font-weight:600;`">{{ step.name }}</div>
            <div style="text-align:center;font-size:11px;color:#909399;">
              金额: ¥{{ Number(step.amount || 0).toLocaleString() }} | 分支: <strong>{{ branchLabel(step) }}</strong>
            </div>
            <div v-if="activeNodes(step).length > 0" style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">
              <div v-for="(n, ni) in activeNodes(step)" :key="ni" :style="nodeStyle(n.status)">
                {{ n.name }}
                <span v-if="n.approver" style="font-size:10px;opacity:.8;"> {{ n.approver }} {{ n.time }}</span>
              </div>
            </div>
            <div v-else style="text-align:center;font-size:11px;color:#9ca3af;">无需额外审批（直接用印）</div>
          </div>
          <!-- 普通节点 -->
          <div v-else :style="nodeStyle(step.status) + 'min-width:80px;text-align:center;'">
            {{ step.name }}
            <div v-if="step.approver" style="font-size:10px;opacity:.8;">{{ step.approver }} {{ step.time }}</div>
            <div v-if="step.comment" style="font-size:10px;opacity:.7;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ step.comment }}</div>
          </div>
          <el-icon v-if="i < steps.length - 1" style="color:#909399;font-size:10px;"><ArrowRight /></el-icon>
        </div>
      </template>
    </div>
    <div v-if="flow.completed_at" style="font-size:12px;color:#10b981;margin-top:4px;">完成时间: {{ flow.completed_at }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Check, ArrowRight } from '@element-plus/icons-vue';

const props = defineProps({ flow: { type: [Object, Array], default: null } });

const isArray = computed(() => Array.isArray(props.flow));
const steps = computed(() => (props.flow && !Array.isArray(props.flow) ? props.flow.steps || [] : []));

const statusColors = { done: '#10b981', pending: '#f59e0b', rejected: '#ef4444', skipped: '#9ca3af', partial: '#3b82f6' };
const colorOf = (s) => statusColors[s] || '#9ca3af';

function nodeStyle(status) {
  const done = status === 'done', rejected = status === 'rejected';
  return `padding:4px 10px;border-radius:6px;font-size:11px;background:${done ? '#d1fae5' : rejected ? '#fee2e2' : '#f4f4f5'};color:${done ? '#065f46' : rejected ? '#991b1b' : '#606266'};border:1px solid ${done ? '#10b981' : rejected ? '#ef4444' : '#dcdfe6'};`;
}
function parallelDone(step) { return (step.children || []).filter(c => c.status === 'done').length; }
function parallelColor(step) {
  const done = parallelDone(step), total = (step.children || []).length;
  const st = done === total ? 'done' : done > 0 ? 'partial' : 'pending';
  return statusColors[st];
}
function branchLabel(step) {
  if (step.active_branch !== null && step.active_branch !== undefined && step.branches && step.branches[step.active_branch]) {
    return step.branches[step.active_branch].label;
  }
  return '待评估';
}
function activeNodes(step) {
  if (step.active_branch !== null && step.active_branch !== undefined && step.branches && step.branches[step.active_branch]) {
    return step.branches[step.active_branch].nodes || [];
  }
  return [];
}
</script>
