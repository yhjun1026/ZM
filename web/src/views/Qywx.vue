<template>
  <div class="qywx">
    <div class="page-header">
      <h2>企业微信</h2>
      <p>应用配置（CorpID/AgentID/Secret，Secret 脱敏且不回显） → 员工绑定（OAuth2 授权绑定） → 消息推送与推送留痕</p>
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

    <el-alert
      v-if="st && st.mock_mode"
      type="info"
      show-icon
      :closable="false"
      title="当前环境未接入企业微信 API"
      description="本模块为「配置管理 + 绑定管理 + 推送留痕」模式：不真实调用企微接口（无网络凭据），推送按「是否已配置 + 员工是否已绑定」判定并记录到推送日志。"
      style="margin-bottom:16px;"
    />

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <!-- ============ 绑定状态 ============ -->
      <el-tab-pane label="我的绑定" name="mine">
        <div class="tab-toolbar">
          <div class="muted">企业微信账号与系统员工一对一绑定；绑定后可在企微工作台免密登录</div>
          <div style="display:flex;gap:8px;">
            <el-button size="small" @click="loadOauthUrl('oauth')">生成授权地址</el-button>
            <el-button size="small" @click="loadOauthUrl('qr')">扫码登录地址</el-button>
          </div>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="企业微信配置">
            <el-tag size="small" :type="st && st.configured ? 'success' : 'danger'">{{ st && st.configured ? '已配置' : '未配置' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="CorpID">{{ (st && st.corp_id) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="AgentID">{{ (st && st.agent_id) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="系统访问地址">{{ (st && st.base_url) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="当前员工">{{ st && st.emp_name ? `${st.emp_name}（${st.emp_no}）` : '—' }}</el-descriptions-item>
          <el-descriptions-item label="绑定状态">
            <el-tag size="small" :type="st && st.bound ? 'success' : 'info'">{{ st && st.bound ? '已绑定' : '未绑定' }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="企微账号">{{ (st && st.qywx_userid) || '—' }}</el-descriptions-item>
          <el-descriptions-item label="绑定时间">{{ (st && st.bind_at || '').slice(0, 16) || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">绑定 / 解绑</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <el-input v-model="myUserid" placeholder="企业微信 userid" style="width:240px" clearable />
          <el-button type="primary" @click="bindSelf">
            <el-icon style="margin-right:4px"><Link /></el-icon>绑定本人
          </el-button>
          <el-button type="danger" :disabled="!(st && st.bound)" @click="unbindSelf">解绑本人</el-button>
        </div>

        <div v-if="oauth.url" class="oauth-box">
          <div class="muted">授权地址（{{ oauth.mode === 'qr' ? 'PC 扫码登录' : '企微内静默授权' }}）：</div>
          <el-input :model-value="oauth.url" readonly type="textarea" :rows="3" />
        </div>
      </el-tab-pane>

      <!-- ============ 配置 ============ -->
      <el-tab-pane label="应用配置" name="config">
        <div class="tab-toolbar">
          <div class="muted">仅总经理 / 行政人事负责人 / 信息管理部可配置；Secret 留空表示不修改</div>
          <el-button type="primary" size="small" @click="loadConfig">刷新</el-button>
        </div>
        <el-form label-width="150px" size="small" style="max-width:640px">
          <el-form-item label="企业ID (CorpID)" required><el-input v-model="cfgForm.corp_id" placeholder="ww 开头" /></el-form-item>
          <el-form-item label="应用ID (AgentID)" required><el-input-number v-model="cfgForm.agent_id" :min="0" style="width:100%" /></el-form-item>
          <el-form-item label="应用 Secret">
            <el-input v-model="cfgForm.secret" type="password" show-password placeholder="留空则不修改" />
            <div class="muted" v-if="cfg.secret_masked">当前已保存：{{ cfg.secret_masked }}</div>
          </el-form-item>
          <el-form-item label="系统访问地址"><el-input v-model="cfgForm.base_url" placeholder="https://oa.example.com" /></el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="cfgSaving" @click="saveCfg">保存配置</el-button>
          </el-form-item>
        </el-form>
        <div class="muted" v-if="cfg.updated_at">最近更新：{{ cfg.updated_by }} · {{ (cfg.updated_at || '').slice(0, 16) }}</div>
      </el-tab-pane>

      <!-- ============ 绑定管理 ============ -->
      <el-tab-pane label="绑定管理" name="binds">
        <div class="tab-toolbar">
          <el-input v-model="bindKw" placeholder="搜索工号/姓名/企微账号" style="width:240px" clearable />
          <el-button type="primary" size="small" @click="openBind">代员工绑定</el-button>
        </div>
        <el-table :data="filteredBinds" stripe size="small" v-loading="bindLoading">
          <el-table-column prop="emp_no" label="工号" width="110" />
          <el-table-column prop="emp_name" label="姓名" width="100" />
          <el-table-column prop="dept_name" label="部门" min-width="140" show-overflow-tooltip />
          <el-table-column prop="title" label="职位" min-width="140" show-overflow-tooltip />
          <el-table-column prop="qywx_userid" label="企微账号" min-width="160" show-overflow-tooltip />
          <el-table-column label="绑定时间" width="160">
            <template #default="{ row }">{{ (row.bind_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="danger" @click="unbindEmp(row)">解绑</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无绑定记录</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 消息推送 ============ -->
      <el-tab-pane label="消息推送" name="push">
        <div class="tab-toolbar">
          <div class="muted">填写工号与标题即可推送（当前环境为留痕模式，不真实调用企微接口）</div>
          <span />
        </div>
        <el-form label-width="90px" size="small" style="max-width:640px">
          <el-form-item label="员工工号" required><el-input v-model="pushForm.emp_no" placeholder="如 ZM003" /></el-form-item>
          <el-form-item label="消息标题" required><el-input v-model="pushForm.title" placeholder="如：您有一笔审批待处理" /></el-form-item>
          <el-form-item label="消息内容"><el-input v-model="pushForm.description" type="textarea" :rows="3" /></el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="pushSaving" @click="send">推送并记录</el-button>
          </el-form-item>
        </el-form>

        <div class="section-title">推送日志</div>
        <div class="tab-toolbar">
          <el-select v-model="logSent" placeholder="全部结果" style="width:130px" clearable @change="loadLogs">
            <el-option label="成功" :value="1" />
            <el-option label="失败" :value="0" />
          </el-select>
          <el-button size="small" @click="loadLogs">刷新</el-button>
        </div>
        <el-table :data="logs" stripe size="small" v-loading="logLoading">
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column prop="emp_no" label="工号" width="110" />
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="source" label="来源" width="100" />
          <el-table-column label="结果" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.sent ? 'success' : 'danger'">{{ row.sent ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="说明" min-width="220" show-overflow-tooltip />
          <template #empty><span class="muted">暂无推送记录</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 代绑 -->
    <el-dialog v-model="bindDlg.visible" title="代员工绑定企业微信" width="440px">
      <el-form label-width="90px" size="small">
        <el-form-item label="员工工号" required><el-input v-model="bindDlg.form.emp_no" placeholder="如 ZM003" /></el-form-item>
        <el-form-item label="企微账号" required><el-input v-model="bindDlg.form.userid" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bindDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="bindDlg.saving" @click="submitBind">绑定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ChatLineSquare, Setting, Connection, Message, Link } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('mine');
const st = ref(null);
const stats = ref(null);
const cfg = ref({});
const cfgSaving = ref(false);
const cfgForm = reactive({ corp_id: '', agent_id: 0, secret: '', base_url: '' });
const myUserid = ref('');
const oauth = reactive({ url: '', mode: '' });

const binds = ref([]);
const bindKw = ref('');
const bindLoading = ref(false);
const bindDlg = reactive({ visible: false, saving: false, form: { emp_no: '', userid: '' } });

const pushSaving = ref(false);
const pushForm = reactive({ emp_no: '', title: '', description: '' });
const logs = ref([]);
const logLoading = ref(false);
const logSent = ref('');

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '配置状态', value: s.configured ? '已配置' : '未配置', sub: 'CorpID/AgentID/Secret', icon: Setting, color: '#2563eb' },
    { title: '绑定人数', value: s.bound, sub: `在职 ${s.emp_total} 人`, icon: Connection, color: '#10b981' },
    { title: '绑定率', value: s.bind_rate + '%', sub: '已绑 / 在职', icon: ChatLineSquare, color: '#f59e0b' },
    { title: '推送记录', value: s.push_total, sub: `成功 ${s.push_sent} / 失败 ${s.push_fail}`, icon: Message, color: '#8b5cf6' },
  ];
});
const filteredBinds = computed(() => {
  const kw = bindKw.value.trim();
  if (!kw) return binds.value;
  return binds.value.filter((b) => [b.emp_no, b.emp_name, b.qywx_userid].some((x) => (x || '').includes(kw)));
});

async function loadStatus() {
  const r = await request.get('/qywx/status');
  if (r.code === 200) st.value = r.data;
}
async function loadStats() {
  const r = await request.get('/qywx/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadConfig() {
  const r = await request.get('/qywx/config');
  if (r.code === 200) {
    cfg.value = r.data || {};
    cfgForm.corp_id = r.data.corp_id || '';
    cfgForm.agent_id = r.data.agent_id || 0;
    cfgForm.base_url = r.data.base_url || '';
    cfgForm.secret = '';
  } else ElMessage.error(r.msg || '配置仅管理员可查看');
}
async function loadBinds() {
  bindLoading.value = true;
  try {
    const r = await request.get('/qywx/binds');
    binds.value = r.code === 200 ? r.data || [] : [];
  } finally { bindLoading.value = false; }
}
async function loadLogs() {
  logLoading.value = true;
  try {
    const params = {};
    if (logSent.value !== '' && logSent.value !== null) params.sent = logSent.value;
    const r = await request.get('/qywx/push-logs', { params });
    logs.value = r.code === 200 ? (r.data.rows || []) : [];
  } finally { logLoading.value = false; }
}
function onTabChange(name) {
  if (name === 'config') loadConfig();
  if (name === 'binds') loadBinds();
  if (name === 'push') loadLogs();
}
onMounted(async () => { await loadStatus(); await loadStats(); });

async function saveCfg() {
  if (!cfgForm.corp_id || !cfgForm.agent_id) { ElMessage.warning('CorpID 与 AgentID 必填'); return; }
  cfgSaving.value = true;
  const r = await request.post('/qywx/config', cfgForm);
  cfgSaving.value = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); loadConfig(); loadStatus(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}

async function loadOauthUrl(mode) {
  const r = await request.get('/qywx/oauth-url', { params: { mode } });
  if (r.code === 200) { oauth.url = r.data.url; oauth.mode = r.data.mode; }
  else ElMessage.error(r.msg || '生成失败');
}

async function bindSelf() {
  if (!myUserid.value) { ElMessage.warning('请填写企业微信 userid'); return; }
  const r = await request.post('/qywx/bind', { userid: myUserid.value });
  if (r.code === 200) { ElMessage.success(r.msg || '绑定成功'); myUserid.value = ''; loadStatus(); loadStats(); }
  else ElMessage.error(r.msg || '绑定失败');
}
async function unbindSelf() {
  try { await ElMessageBox.confirm('确认解绑本人的企业微信账号？', '解绑', { type: 'warning' }); } catch (e) { return; }
  const r = await request.post('/qywx/unbind', {});
  if (r.code === 200) { ElMessage.success(r.msg || '已解绑'); loadStatus(); loadStats(); }
  else ElMessage.error(r.msg || '解绑失败');
}

function openBind() {
  Object.assign(bindDlg.form, { emp_no: '', userid: '' });
  bindDlg.visible = true;
}
async function submitBind() {
  if (!bindDlg.form.emp_no || !bindDlg.form.userid) { ElMessage.warning('工号与企微账号必填'); return; }
  bindDlg.saving = true;
  const r = await request.post('/qywx/bind', bindDlg.form);
  bindDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '绑定成功'); bindDlg.visible = false; loadBinds(); loadStats(); }
  else ElMessage.error(r.msg || '绑定失败');
}
async function unbindEmp(row) {
  try { await ElMessageBox.confirm(`确认解绑 ${row.emp_name}（${row.emp_no}）？`, '解绑', { type: 'warning' }); } catch (e) { return; }
  const r = await request.post('/qywx/unbind', { emp_no: row.emp_no });
  if (r.code === 200) { ElMessage.success(r.msg || '已解绑'); loadBinds(); loadStats(); }
  else ElMessage.error(r.msg || '解绑失败');
}

async function send() {
  if (!pushForm.emp_no || !pushForm.title) { ElMessage.warning('员工工号与消息标题必填'); return; }
  pushSaving.value = true;
  const r = await request.post('/qywx/send', { ...pushForm, source: '手工' });
  pushSaving.value = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已记录推送');
    pushForm.description = '';
    loadLogs(); loadStats();
  } else ElMessage.error(r.msg || '推送失败');
}
</script>

<style scoped>
.qywx { padding: 20px; }
.muted { color: #909399; font-size: 12px; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.section-title { margin: 18px 0 8px; font-size: 14px; font-weight: 600; }
.oauth-box { margin-top: 14px; border: 1px solid var(--el-border-color-light); border-radius: 10px; padding: 12px; }
.el-form-item { margin-bottom: 12px; }
</style>
