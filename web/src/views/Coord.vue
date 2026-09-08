<template>
  <div class="coord">
    <div class="page-header">
      <h2>业务协调中心</h2>
      <p>跨模块断点检测（只读体检） → 一键联动补链（写操作） → 联动留痕可追溯，全程幂等</p>
    </div>

    <!-- KPI -->
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
      <span class="muted">链路健康度：{{ stats ? stats.blocked_chains : 0 }} / {{ stats ? stats.chains : 0 }} 条链路存在断点</span>
      <div>
        <el-button size="small" @click="loadAll">
          <el-icon style="margin-right:4px"><Refresh /></el-icon>重新扫描
        </el-button>
        <el-button type="primary" size="small" :disabled="!canOperate" @click="autoRun">
          <el-icon style="margin-right:4px"><MagicStick /></el-icon>自动跑批补链
        </el-button>
      </div>
    </div>

    <!-- 链路健康 -->
    <div class="chain-grid">
      <div class="chain-card" v-for="c in chains" :key="c.name">
        <div class="chain-head">
          <b>{{ c.name }}</b>
          <el-tag :type="c.breaks === 0 ? 'success' : c.breaks <= 2 ? 'warning' : 'danger'" size="small">
            {{ c.status }}（{{ c.breaks }}）
          </el-tag>
        </div>
        <div class="chain-nodes">
          <span v-for="(n, i) in c.nodes" :key="n">
            {{ n }}<span v-if="i < c.nodes.length - 1" class="arrow">→</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 断点规则 -->
    <el-divider content-position="left">断点检测（{{ breaks.length }} 条规则）</el-divider>
    <el-collapse v-model="activeRules">
      <el-collapse-item v-for="r in breaks" :key="r.code" :name="r.code">
        <template #title>
          <div class="rule-title">
            <el-tag :type="severityType(r.severity)" size="small">{{ r.severity }}</el-tag>
            <b>{{ r.name }}</b>
            <span class="muted">{{ r.from }} → {{ r.to }}</span>
            <el-tag type="info" size="small" effect="plain">{{ r.count }} 条</el-tag>
          </div>
        </template>
        <p class="hint">{{ r.hint }}</p>
        <el-table :data="r.items" stripe size="small" max-height="300">
          <el-table-column prop="no" label="单据号" width="160" show-overflow-tooltip />
          <el-table-column prop="title" label="事项" min-width="220" show-overflow-tooltip />
          <el-table-column prop="owner" label="责任人" width="100" />
          <el-table-column prop="extra" label="详情" min-width="280" show-overflow-tooltip />
          <el-table-column label="滞留(天)" width="90">
            <template #default="{ row }">{{ row.days != null ? row.days : '—' }}</template>
          </el-table-column>
          <template #empty><span class="muted">该规则当前无断点，链路畅通</span></template>
        </el-table>
        <div class="rule-actions" v-if="r.fix">
          <el-button type="primary" size="small" :disabled="!r.count || !canOperate" @click="runLink(r)">
            一键联动（{{ r.count }} 条）
          </el-button>
          <span class="muted">联动接口：{{ r.fix_api }}</span>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- 联动留痕 -->
    <el-divider content-position="left">联动留痕（coord_actions）</el-divider>
    <el-table :data="recentActions" stripe size="small">
      <el-table-column label="时间" width="150">
        <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column prop="rule_name" label="联动规则" width="180" />
      <el-table-column label="链路" width="200">
        <template #default="{ row }">{{ row.src_module }} → {{ row.dst_module }}</template>
      </el-table-column>
      <el-table-column prop="src_no" label="源单据" width="150" show-overflow-tooltip />
      <el-table-column prop="dst_no" label="目标单据" width="150" show-overflow-tooltip />
      <el-table-column prop="result" label="执行结果" min-width="240" show-overflow-tooltip />
      <el-table-column label="方式" width="90">
        <template #default="{ row }"><el-tag :type="row.auto ? 'warning' : 'primary'" size="small">{{ row.auto ? '自动' : '人工' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="operator_name" label="操作人" width="100" />
      <template #empty><span class="muted">暂无联动记录</span></template>
    </el-table>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Link, Warning, CircleCheck, Refresh, MagicStick, Connection } from '@element-plus/icons-vue';
import request from '../api/request';

const stats = ref(null);
const chains = ref([]);
const breaks = ref([]);
const recentActions = ref([]);
const activeRules = ref([]);

const canOperate = computed(() => !!(stats.value && stats.value.can_operate));

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '断点总数', value: s.total, sub: `覆盖 ${s.chains} 条主链路`, icon: Link, color: '#2563eb' },
    { title: '高危断点', value: s.high, sub: '需立即处理', icon: Warning, color: '#ef4444' },
    { title: '中/低危', value: `${s.mid} / ${s.low}`, sub: '可排期处理', icon: Connection, color: '#f59e0b' },
    { title: '链路健康度', value: s.health + '%', sub: `累计联动 ${s.actions} 次`, icon: CircleCheck, color: '#10b981' },
  ];
});

function severityType(s) { return s === '高' ? 'danger' : s === '中' ? 'warning' : 'info'; }

async function loadOverview() {
  const r = await request.get('/coord/overview');
  if (r.code === 200) {
    const d = r.data || {};
    stats.value = d.stats || null;
    chains.value = d.chains || [];
    breaks.value = d.breaks || [];
    recentActions.value = d.recent_actions || [];
    activeRules.value = (d.breaks || []).filter((b) => b.count > 0).map((b) => b.code);
  } else {
    stats.value = null; chains.value = []; breaks.value = []; recentActions.value = [];
    ElMessage.error(r.msg || '加载失败');
  }
}
async function loadAll() { await loadOverview(); }

const LINK_API = {
  bid_win_no_contract: '/coord/link/bid-win',
  contract_no_ar: '/coord/link/contract-ar',
  ar_overdue: '/coord/link/ar-urge',
};

async function runLink(rule) {
  const api = LINK_API[rule.code];
  if (!api) return;
  await ElMessageBox.confirm(`确认对「${rule.name}」的 ${rule.count} 条断点执行一键联动？重复执行会自动跳过已处理单据。`, '联动确认', { type: 'warning' }).catch(() => null);
  const r = await request.post(api, {});
  if (r.code === 200) {
    const res = (r.data && r.data.results) || [];
    const ok = res.filter((x) => !x.skipped && !x.error).length;
    const skip = res.filter((x) => x.skipped).length;
    ElMessage.success(`已联动 ${ok} 条${skip ? `，跳过 ${skip} 条` : ''}`);
    loadOverview();
  } else ElMessage.error(r.msg || '联动失败');
}

async function autoRun() {
  await ElMessageBox.confirm('确认执行自动跑批？将对所有可幂等补链的断点自动补链（中标→合同、合同→应收）。', '跑批确认', { type: 'warning' }).catch(() => null);
  const r = await request.post('/coord/auto/run', {});
  if (r.code === 200) { ElMessage.success(r.msg || '跑批完成'); loadOverview(); }
  else ElMessage.error(r.msg || '跑批失败');
}

onMounted(loadOverview);
</script>

<style scoped>
.coord { padding: 20px; }
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
.chain-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-bottom: 8px; }
.chain-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 14px 16px; }
.chain-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.chain-nodes { font-size: 12px; color: #606266; }
.arrow { margin: 0 6px; color: #c0c4cc; }
.rule-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hint { margin: 0 0 10px; color: #909399; font-size: 12px; line-height: 1.6; }
.rule-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
</style>
