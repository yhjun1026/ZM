<template>
  <div>
    <div class="page-header"><h2>外勤打卡</h2><p>签到 / 签退</p></div>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card>
          <div style="text-align: center; padding: 16px 0;">
            <div style="font-size: 13px; color: #909399;">当前时间</div>
            <div style="font-size: 38px; font-weight: 700; margin: 8px 0; color: #2563eb;">{{ now }}</div>
            <div style="font-size: 14px; color: #606266; margin-bottom: 16px;">
              {{ today.status === 'signed_out' ? '今日已签退' : today.status === 'signed_in' ? '已签到，待签退' : '今日未打卡' }}
            </div>
            <el-button v-if="!today.check_in_time" type="primary" size="large" :loading="loading" @click="onCheckin('in')"><el-icon><Location /></el-icon> 签到</el-button>
            <el-button v-else type="success" size="large" :loading="loading" :disabled="!!today.check_out_time" @click="onCheckin('out')"><el-icon><CircleCheck /></el-icon> {{ today.check_out_time ? '已签退' : '签退' }}</el-button>
          </div>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="签到时间">{{ today.check_in_time || '-' }}</el-descriptions-item>
            <el-descriptions-item label="签到地点">{{ today.check_in_loc || '-' }}</el-descriptions-item>
            <el-descriptions-item label="签退时间">{{ today.check_out_time || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12"><el-card><template #header>本周打卡分布</template><div ref="chart" style="height: 320px;"></div></el-card></el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import { getCheckin, doCheckin } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const today = ref({});
const now = ref('');
const loading = ref(false);
const chart = ref(null);
let inst = null;
let timer = null;

function tick() { now.value = new Date().toTimeString().slice(0, 8); }
function render(w) {
  if (!inst || !w) return;
  inst.setOption({ tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: w.labels || [] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: w.data || [], itemStyle: { color: '#2563eb' } }] });
}
async function load() {
  const r = await getCheckin();
  if (r.success) { today.value = r.data.today || {}; render(r.data.weekCheckinData); }
}
async function onCheckin(type) {
  loading.value = true;
  const r = await doCheckin({ userName: auth.userName, time: new Date().toTimeString().slice(0, 8), loc: '成都市高新区天府软件园D区', type });
  loading.value = false;
  if (r.success) { ElMessage.success(type === 'in' ? '签到成功' : '签退成功'); load(); }
}
function rz() { inst && inst.resize(); }
onMounted(async () => {
  tick();
  timer = setInterval(tick, 1000);
  inst = echarts.init(chart.value);
  await load();
  window.addEventListener('resize', rz);
});
onUnmounted(() => { clearInterval(timer); window.removeEventListener('resize', rz); inst && inst.dispose(); });
</script>
