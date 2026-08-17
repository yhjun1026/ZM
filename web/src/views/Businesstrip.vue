<template>
  <div class="zm-trip">
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3><el-icon><Promotion /></el-icon> 出差管理</h3>
        <button class="btn btn-primary btn-sm" @click="openForm"><el-icon><Plus /></el-icon> 发起出差</button>
      </div>
      <div class="card-body">
        <div class="ca-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
          <button v-for="t in tabs" :key="t.k" class="btn btn-sm" :class="tab === t.k ? 'btn-primary' : 'btn-secondary'" @click="switchTab(t.k)">
            <el-icon><component :is="t.icon" /></el-icon> {{ t.t }}
          </button>
        </div>

        <div v-if="loading" class="loading"><el-icon class="is-loading"><Loading /></el-icon> 加载中...</div>
        <p v-else-if="errorMsg" class="text-muted">{{ errorMsg }}</p>

        <!-- 出差台账 -->
        <template v-else-if="tab === 'list'">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <select v-model="filters.status" class="form-control" style="width:130px;" @change="load">
              <option value="">全部状态</option>
              <option v-for="s in statusOptions" :key="s">{{ s }}</option>
            </select>
            <select v-model="filters.type" class="form-control" style="width:150px;" @change="load">
              <option value="">全部类型</option>
              <option v-for="s in typeOptions" :key="s">{{ s }}</option>
            </select>
            <input v-model="filters.month" type="month" class="form-control" style="width:150px;" @change="load">
            <input v-if="scope === 'all'" v-model="filters.name" class="form-control" style="width:140px;" placeholder="搜索申请人" @change="load">
            <span class="text-muted" style="align-self:center;font-size:12px;"><el-icon><Lock /></el-icon> {{ scopeTxt }} · 共{{ rows.length }}条</span>
          </div>
          <div class="table-wrap" style="overflow-x:auto;">
            <table class="table">
              <thead><tr><th>单号</th><th>申请人</th><th>部门</th><th>类型</th><th>目的地</th><th>起止</th><th>天数</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="r in rows" :key="r.id">
                  <td style="font-family:monospace;font-size:12px;">{{ r.id }}</td>
                  <td>{{ r.applicant }}</td>
                  <td>{{ r.dept }}</td>
                  <td><span class="tag" :class="tripTypeTag(r.trip_type)">{{ r.trip_type }}</span></td>
                  <td>
                    {{ r.destination }}
                    <el-icon v-if="r.cross_province" title="跨省市" style="color:#ef4444;"><LocationFilled /></el-icon>
                  </td>
                  <td>{{ r.start_date }} ~ {{ r.end_date }}</td>
                  <td><b>{{ r.days }}</b>天</td>
                  <td>
                    <span class="tag" :class="statusTag(r.status)">{{ r.status }}</span>
                    <template v-if="r.trip_phase"><br><span class="text-muted" style="font-size:11px;">{{ r.trip_phase }}</span></template>
                    <template v-else-if="r.status === '审批通过'"><br><span class="text-muted" style="font-size:11px;">出差执行中</span></template>
                  </td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-info" title="详情" @click="viewDetail(r.id)"><el-icon><Document /></el-icon></button>
                    <template v-if="canApproveRow(r)">
                      <button class="btn btn-sm btn-primary" title="通过" @click="approve(r.id)"><el-icon><Check /></el-icon></button>
                      <button class="btn btn-sm btn-secondary" title="驳回" @click="reject(r.id)"><el-icon><Close /></el-icon></button>
                    </template>
                    <button v-if="canSettle(r)" class="btn btn-sm btn-success" title="销差" @click="openSettle(r.id)"><el-icon><RefreshLeft /></el-icon> 销差</button>
                    <button v-if="canVoid(r)" class="btn btn-sm btn-secondary" title="作废" @click="voidTrip(r.id)"><el-icon><CircleClose /></el-icon></button>
                  </td>
                </tr>
                <tr v-if="!rows.length"><td colspan="9" class="text-center text-muted" style="padding:24px;">暂无出差单据</td></tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- 审批中心 -->
        <template v-else-if="tab === 'approve'">
          <p v-if="!approveRows.length" class="text-center text-muted" style="padding:32px;"><el-icon><CoffeeCup /></el-icon> 当前没有待您审批的出差单</p>
          <table v-else class="table">
            <thead><tr><th>单号</th><th>申请人</th><th>类型</th><th>目的地</th><th>起止</th><th>当前节点</th><th>AI预警</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="r in approveRows" :key="r.id">
                <td style="font-family:monospace;font-size:12px;">{{ r.id }}</td>
                <td>{{ r.applicant }}</td>
                <td><span class="tag" :class="tripTypeTag(r.trip_type)">{{ r.trip_type }}</span></td>
                <td>{{ r.destination }}</td>
                <td>{{ r.start_date }} ~ {{ r.end_date }}</td>
                <td>
                  <span class="tag tag-blue">{{ currentNode(r).step || '' }}</span><br>
                  <span class="text-muted" style="font-size:12px;">{{ currentNode(r).assignee || '' }}</span>
                </td>
                <td>
                  <span v-if="warnsOf(r).length" class="tag tag-red" :title="warnsOf(r).join('; ')"><el-icon><WarningFilled /></el-icon> {{ warnsOf(r).length }}项</span>
                  <span v-else class="text-muted">正常</span>
                </td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-sm btn-info" @click="viewDetail(r.id)"><el-icon><Document /></el-icon></button>
                  <button class="btn btn-sm btn-primary" @click="approve(r.id)"><el-icon><Check /></el-icon> 通过</button>
                  <button class="btn btn-sm btn-secondary" @click="reject(r.id)"><el-icon><Close /></el-icon> 驳回</button>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- 统计报表 -->
        <template v-else-if="tab === 'stats'">
          <p class="text-muted" style="margin-bottom:10px;"><el-icon><Lock /></el-icon> 出差数据统计仅行政部可查看 ({{ stats.kpi.month || '' }})</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px;">
            <div v-for="x in kpiCards" :key="x[0]" class="card" style="padding:12px;text-align:center;">
              <div class="text-muted" style="font-size:12px;">{{ x[0] }}</div>
              <div style="font-size:22px;font-weight:700;" :style="{ color: x[2] }">{{ x[1] == null ? 0 : x[1] }}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <h4 style="margin-bottom:8px;">按出差类型</h4>
              <template v-if="stats.byType && stats.byType.length">
                <div v-for="x in stats.byType" :key="x.t" style="margin-bottom:8px;">
                  <div style="display:flex;justify-content:space-between;font-size:13px;"><span>{{ x.t }}</span><span><b>{{ x.n }}</b>次 / {{ x.d || 0 }}天</span></div>
                  <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;"><div style="height:100%;background:#2563eb;" :style="{ width: barPct(stats.byType, x.n) }"></div></div>
                </div>
              </template>
              <p v-else class="text-muted">暂无数据</p>
            </div>
            <div>
              <h4 style="margin-bottom:8px;">按部门</h4>
              <template v-if="stats.byDept && stats.byDept.length">
                <div v-for="x in stats.byDept" :key="x.t" style="margin-bottom:8px;">
                  <div style="display:flex;justify-content:space-between;font-size:13px;"><span>{{ x.t }}</span><span><b>{{ x.n }}</b>次 / {{ x.d || 0 }}天</span></div>
                  <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;"><div style="height:100%;background:#10b981;" :style="{ width: barPct(stats.byDept, x.n) }"></div></div>
                </div>
              </template>
              <p v-else class="text-muted">暂无数据</p>
            </div>
          </div>
          <template v-if="stats.byPerson && stats.byPerson.length">
            <h4 style="margin:16px 0 8px;">个人出差时长TOP10</h4>
            <table class="table">
              <thead><tr><th>排名</th><th>员工</th><th>部门</th><th>次数</th><th>累计天数</th></tr></thead>
              <tbody>
                <tr v-for="(x, i) in stats.byPerson" :key="x.t">
                  <td>{{ i + 1 }}</td><td>{{ x.t }}</td><td>{{ x.dept }}</td><td>{{ x.n }}次</td><td><b>{{ x.d }}</b>天</td>
                </tr>
              </tbody>
            </table>
          </template>
        </template>

        <!-- 风险预警 -->
        <template v-else-if="tab === 'alerts'">
          <table class="table">
            <thead><tr><th>预警类型</th><th>级别</th><th>内容</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in alerts" :key="i">
                <td><span class="tag tag-blue">{{ r.alert_type }}</span></td>
                <td><span class="tag" :class="alertLevelTag(r.level)">{{ r.level }}</span></td>
                <td>{{ r.msg }}</td>
              </tr>
              <tr v-if="!alerts.length"><td colspan="3" class="text-center text-muted" style="padding:24px;"><el-icon><CircleCheck /></el-icon> 暂无预警</td></tr>
            </tbody>
          </table>
        </template>
      </div>
    </div>

    <!-- 发起出差弹窗 -->
    <div v-if="form.visible" class="modal-overlay" @click.self="form.visible = false">
      <div class="modal-box" style="max-width:640px;max-height:88vh;overflow-y:auto;">
        <div class="modal-header">
          <h3><el-icon><Promotion /></el-icon> 发起出差申请</h3>
          <button class="modal-close" @click="form.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group"><label>申请人</label><input class="form-control" :value="(user.name || '') + ' (' + (user.dept || '') + ')'" readonly></div>
            <div class="form-group">
              <label>出差性质</label>
              <div style="display:flex;gap:12px;align-items:center;padding-top:6px;">
                <label style="margin:0;"><input v-model="form.isLocal" type="checkbox" @change="typePreview"> 本地出差</label>
                <label style="margin:0;"><input v-model="form.crossProvince" type="checkbox" @change="typePreview"> 跨省市</label>
              </div>
            </div>
            <div class="form-group"><label>出差地点 *</label><input v-model="form.destination" class="form-control" placeholder="如: 重庆市渝中区客户现场"></div>
            <div class="form-group">
              <label><el-icon><MagicStick /></el-icon> AI类型判定</label>
              <div class="text-muted" style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px;padding:8px;font-size:13px;" :style="previewStyle" v-html="previewHtml"></div>
            </div>
            <div class="form-group"><label>开始时间 *</label><input v-model="form.startDate" type="date" class="form-control" @change="typePreview"></div>
            <div class="form-group"><label>结束时间 *</label><input v-model="form.endDate" type="date" class="form-control" @change="typePreview"></div>
          </div>
          <div class="form-group"><label>出差事由 *</label><textarea v-model="form.purpose" class="form-control" rows="2"></textarea></div>
          <div class="form-group"><label>工作任务 *</label><textarea v-model="form.task" class="form-control" rows="2"></textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group"><label>对接单位/人员 *</label><input v-model="form.counterpart" class="form-control"></div>
            <div class="form-group"><label>联系方式 *</label><input v-model="form.contact" class="form-control"></div>
            <div class="form-group"><label>随行人员 <span class="text-muted">(多人出差必填)</span></label><input v-model="form.companions" class="form-control" placeholder="如: 张三、李四"></div>
            <div class="form-group"><label>预算说明 <span class="text-muted">(异地出差必填)</span></label><input v-model="form.budgetNote" class="form-control" placeholder="如: 差旅预算约3000元"></div>
          </div>
          <div class="form-group"><label>行程安排 <span class="text-muted">(长途出差必填)</span></label><textarea v-model="form.itinerary" class="form-control" rows="2" placeholder="如: D1出发, D2-4驻场实施, D5返程"></textarea></div>
          <div class="form-group"><label>备注</label><input v-model="form.remark" class="form-control"></div>
          <div class="form-group"><label>相关附件 <span class="text-muted">(会议通知/合作文件名称, 逗号分隔)</span></label><input v-model="form.attachments" class="form-control"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="form.visible = false">取消</button>
          <button class="btn btn-secondary" @click="submit(1)">存草稿</button>
          <button class="btn btn-primary" @click="submit(0)"><el-icon><Promotion /></el-icon> 提交申请</button>
        </div>
      </div>
    </div>

    <!-- 出差详情弹窗 -->
    <div v-if="detail.visible" class="modal-overlay" @click.self="detail.visible = false">
      <div class="modal-box" style="max-width:700px;max-height:88vh;overflow-y:auto;">
        <div class="modal-header">
          <h3>出差单 {{ detail.data.id }}</h3>
          <button class="modal-close" @click="detail.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <table class="table" style="font-size:13px;">
            <tbody>
              <tr>
                <td style="width:110px;" class="text-muted">申请人</td>
                <td>{{ detail.data.applicant }} / {{ detail.data.dept }}</td>
                <td class="text-muted">状态</td>
                <td>
                  <span class="tag" :class="statusTag(detail.data.status)">{{ detail.data.status }}</span>
                  <span v-if="detail.data.trip_phase" class="tag tag-blue">{{ detail.data.trip_phase }}</span>
                </td>
              </tr>
              <tr>
                <td class="text-muted">类型</td>
                <td><span class="tag" :class="tripTypeTag(detail.data.trip_type)">{{ detail.data.trip_type }}</span></td>
                <td class="text-muted">天数</td>
                <td><b>{{ detail.data.days }}</b>天</td>
              </tr>
              <tr>
                <td class="text-muted">目的地</td>
                <td colspan="3">
                  {{ detail.data.destination }}
                  <span v-if="detail.data.cross_province" class="tag tag-red">跨省市</span>
                  <span v-if="detail.data.is_local" class="tag tag-gray">本地</span>
                </td>
              </tr>
              <tr><td class="text-muted">起止</td><td colspan="3">{{ detail.data.start_date }} ~ {{ detail.data.end_date }}</td></tr>
              <tr><td class="text-muted">事由/任务</td><td colspan="3">{{ detail.data.purpose || '—' }} / {{ detail.data.task || '—' }}</td></tr>
              <tr><td class="text-muted">对接单位</td><td colspan="3">{{ detail.data.counterpart || '—' }}</td></tr>
              <tr>
                <td class="text-muted">联系方式</td><td>{{ detail.data.contact || '—' }}</td>
                <td class="text-muted">随行人员</td><td>{{ detail.data.companions || '—' }}</td>
              </tr>
              <tr><td class="text-muted">行程安排</td><td colspan="3">{{ detail.data.itinerary || '—' }}</td></tr>
              <tr><td class="text-muted">预算说明</td><td colspan="3">{{ detail.data.budget_note || '—' }}</td></tr>
              <tr>
                <td class="text-muted">销差</td>
                <td colspan="3">
                  <template v-if="detail.data.actual_days > 0">
                    实际 <b>{{ detail.data.actual_days }}</b>天
                    <span v-if="detail.data.actual_days !== detail.data.days" class="tag tag-red">与申请{{ detail.data.days }}天存在差异</span>
                    <br><span class="text-muted">总结: {{ detail.data.summary || '—' }}</span>
                    <br><span class="text-muted">成果: {{ detail.data.feedback || '—' }}</span>
                  </template>
                  <template v-else>未销差</template>
                </td>
              </tr>
              <tr>
                <td class="text-muted">归档</td>
                <td colspan="3">
                  <template v-if="detail.data.archive">档案编号 <b style="font-family:monospace;">{{ detail.data.archive.archive_no }}</b> ({{ detail.data.archive.a_status }})</template>
                  <template v-else>未归档</template>
                </td>
              </tr>
            </tbody>
          </table>
          <h4 style="margin:12px 0 6px;"><el-icon><MagicStick /></el-icon> AI校验</h4>
          <div style="background:#f8fafc;border-radius:6px;padding:10px;font-size:13px;">
            AI判定类型: <b>{{ detail.data.trip_type }}</b><br>
            <template v-if="detailWarns.length">
              <span v-for="(w, i) in detailWarns" :key="i" style="color:#ef4444;"><el-icon><WarningFilled /></el-icon> {{ w }}<br></span>
            </template>
            <span v-else class="text-muted">无异常预警</span>
          </div>
          <h4 style="margin:12px 0 6px;"><el-icon><Connection /></el-icon> 审批流程</h4>
          <div v-for="(f, i) in detailFlow" :key="i"
            style="display:flex;gap:10px;align-items:center;padding:6px 10px;background:#fafafa;margin-bottom:4px;border-radius:0 6px 6px 0;"
            :style="{ borderLeft: '3px solid ' + (f.done ? (f.rejected ? '#ef4444' : '#10b981') : '#e5e7eb') }">
            <span>
              <el-icon v-if="f.done && f.rejected" style="color:#ef4444;"><CircleClose /></el-icon>
              <el-icon v-else-if="f.done" style="color:#10b981;"><CircleCheck /></el-icon>
              <el-icon v-else style="color:#9ca3af;"><Clock /></el-icon>
            </span>
            <b>{{ f.step }}</b><span class="text-muted">{{ f.assignee || '' }}</span>
            <span style="margin-left:auto;" class="text-muted">{{ f.done ? (f.user + ' · ' + (f.time || '')) : '待处理' }}</span>
            <span v-if="f.remark" class="text-muted" style="flex-basis:100%;font-size:12px;">意见: {{ f.remark }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 销差弹窗 -->
    <div v-if="settle.visible" class="modal-overlay" @click.self="settle.visible = false">
      <div class="modal-box" style="max-width:480px;">
        <div class="modal-header">
          <h3><el-icon><RefreshLeft /></el-icon> 销差申请 {{ settle.id }}</h3>
          <button class="modal-close" @click="settle.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>实际出差天数 * (AI将自动对比申请天数并标注差异)</label>
            <input v-model="settle.days" type="number" step="0.5" min="0.5" class="form-control" placeholder="如 2 或 1.5">
          </div>
          <div class="form-group"><label>出差工作总结 *</label><textarea v-model="settle.summary" class="form-control" rows="2"></textarea></div>
          <div class="form-group"><label>成果反馈 *</label><textarea v-model="settle.feedback" class="form-control" rows="2"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="settle.visible = false">取消</button>
          <button class="btn btn-success" @click="doSettle"><el-icon><Check /></el-icon> 确认销差</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Loading, Promotion, Plus, List, Finished, Histogram, Bell, Lock, LocationFilled,
  Document, Check, Close, RefreshLeft, CircleClose, CircleCheck, CoffeeCup,
  WarningFilled, MagicStick, Connection, Clock,
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const user = computed(() => auth.user || {});

const isAdmin = computed(() => user.value.dept === '行政部');
const isMgr = computed(() => ['总经理', '副总', '超级管理员'].includes(user.value.role) || user.value.dept === '行政部');

const tabs = computed(() => {
  const t = [
    { k: 'list', t: '出差台账', icon: List },
    { k: 'approve', t: '审批中心', icon: Finished },
  ];
  if (isAdmin.value) t.push({ k: 'stats', t: '统计报表', icon: Histogram });
  if (isMgr.value) t.push({ k: 'alerts', t: '风险预警', icon: Bell });
  return t;
});

const tab = ref('list');
const loading = ref(false);
const errorMsg = ref('');
const rows = ref([]);
const approveRows = ref([]);
const alerts = ref([]);
const stats = reactive({ kpi: {}, byType: [], byDept: [], byPerson: [] });
const filters = reactive({ status: '', type: '', month: '', name: '' });

const statusOptions = ['草稿', '待审批', '审批中', '审批通过', '已完成出差', '已销差', '已驳回', '已归档', '已作废'];
const typeOptions = ['本地出差', '异地短途出差', '异地长途出差', '跨省市长期出差'];

const scope = computed(() => (rows.value[0] ? rows.value[0]._scope : 'self'));
const scopeTxt = computed(() => ({ self: '仅显示本人单据', dept: '显示本部门单据', all: '显示全公司单据' }[scope.value] || ''));

const kpiCards = computed(() => {
  const k = stats.kpi || {};
  return [
    ['本月申请', k.total, '#2563eb'], ['本月天数', k.days_month, '#0ea5e9'], ['待审批', k.pending, '#f59e0b'],
    ['待销差', k.settle_wait, '#ef4444'], ['执行中', k.trips_active, '#8b5cf6'], ['已销差', k.settled, '#10b981'],
  ];
});

function statusTag(s) {
  const m = { 草稿: 'tag-gray', 待审批: 'tag-yellow', 审批中: 'tag-blue', 审批通过: 'tag-green', 已驳回: 'tag-red', 已销假: 'tag-green', 已归档: 'tag-gray', 已作废: 'tag-gray' };
  return m[s] || 'tag-yellow';
}
function tripTypeTag(t) {
  const m = { 本地出差: 'tag-gray', 异地短途出差: 'tag-green', 异地长途出差: 'tag-yellow', 跨省市长期出差: 'tag-red' };
  return m[t] || 'tag-blue';
}
function alertLevelTag(l) {
  return { 高: 'tag-red', 中: 'tag-yellow', 低: 'tag-gray' }[l] || 'tag-gray';
}
function barPct(arr, n) {
  const max = Math.max(...(arr || []).map((y) => y.n), 1);
  return Math.round((n / max) * 100) + '%';
}
function currentNode(r) {
  return (r.flow || []).find((f) => !f.done) || {};
}
function warnsOf(r) {
  return (r.ai_check || {}).warnings || [];
}

function canApproveRow(r) {
  if (!['待审批', '审批中'].includes(r.status) || !r.flow) return false;
  const u = user.value;
  const cur = (r.flow || []).find((f) => !f.done);
  if (!cur) return false;
  if (u.role === '超级管理员') return true;
  switch (cur.role) {
    case 'deptLeader': return (u.role === '部门经理' && u.dept === r.dept) || (r.dept === '销售部' && ['销售总监', '区域经理'].includes(u.role));
    case 'deptHead': return u.role === '副总' || (u.role === '销售总监' && r.dept === '销售部');
    case 'mgmt': return ['总经理', '副总'].includes(u.role);
    case 'adminVerify': return u.dept === '行政部';
    default: return false;
  }
}
function canSettle(r) {
  return (r.status === '审批通过' && r.applicant_id === user.value.id) || (isAdmin.value && r.status === '审批通过');
}
function canVoid(r) {
  return r.applicant_id === user.value.id && ['草稿', '待审批'].includes(r.status);
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    if (tab.value === 'list') {
      const p = {};
      if (filters.status) p.status = filters.status;
      if (filters.type) p.type = filters.type;
      if (filters.month) p.month = filters.month;
      if (filters.name) p.name = filters.name;
      const res = await request.get('/business-trips', { params: p });
      if (res.code !== 200) { errorMsg.value = res.msg || '加载失败'; return; }
      rows.value = res.data || [];
    } else if (tab.value === 'approve') {
      const [r1, r2] = await Promise.all([
        request.get('/business-trips', { params: { status: '待审批' } }),
        request.get('/business-trips', { params: { status: '审批中' } }),
      ]);
      if (r1.code !== 200) { errorMsg.value = r1.msg || '加载失败'; return; }
      approveRows.value = [...(r1.data || []), ...(r2.data || [])].filter((r) => canApproveRow(r));
    } else if (tab.value === 'stats') {
      const res = await request.get('/business-trips/stats');
      if (res.code !== 200) { errorMsg.value = res.msg || '加载失败'; return; }
      const d = res.data || {};
      stats.kpi = d.kpi || {};
      stats.byType = d.byType || [];
      stats.byDept = d.byDept || [];
      stats.byPerson = d.byPerson || [];
    } else if (tab.value === 'alerts') {
      const res = await request.get('/business-trips/alerts');
      if (res.code !== 200) { errorMsg.value = res.msg || '加载失败'; return; }
      alerts.value = res.data || [];
    }
  } finally {
    loading.value = false;
  }
}
function switchTab(k) {
  tab.value = k;
  load();
}
onMounted(load);

/* ===== 发起出差 ===== */
const form = reactive({
  visible: false, isLocal: false, crossProvince: false, destination: '',
  startDate: '', endDate: '', purpose: '', task: '', counterpart: '', contact: '',
  companions: '', budgetNote: '', itinerary: '', remark: '', attachments: '',
});
const previewHtml = ref('填写天数后AI自动判定类型并匹配审批流程');
const previewStyle = ref({});

function openForm() {
  Object.assign(form, {
    visible: true, isLocal: false, crossProvince: false, destination: '',
    startDate: '', endDate: '', purpose: '', task: '', counterpart: '', contact: '',
    companions: '', budgetNote: '', itinerary: '', remark: '', attachments: '',
  });
  previewHtml.value = '填写天数后AI自动判定类型并匹配审批流程';
  previewStyle.value = {};
}
function tripDays() {
  if (!form.startDate || !form.endDate) return NaN;
  return Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000) + 1;
}
function typePreview() {
  if (!form.startDate || !form.endDate) return;
  const days = tripDays();
  if (!(days > 0)) {
    previewHtml.value = '<span style="color:#ef4444;">结束时间不能早于开始时间</span>';
    previewStyle.value = {};
    return;
  }
  let t, flow;
  if (form.isLocal) { t = '本地出差'; flow = '直属上级(1级)'; }
  else if (form.crossProvince && days > 7) { t = '跨省市长期出差'; flow = '直属上级→部门负责人→高管(3级)'; }
  else if (days > 3) { t = '异地长途出差'; flow = '直属上级→部门负责人→高管(3级)'; }
  else { t = '异地短途出差'; flow = days > 1 ? '直属上级→部门负责人(2级)' : '直属上级(1级)'; }
  previewHtml.value = `<b style="color:#2563eb;">${t}</b> · ${days}天 · 审批: ${flow}`;
  previewStyle.value = { borderColor: '#2563eb' };
}
async function submit(draft) {
  const days = tripDays();
  const atts = form.attachments.trim() ? form.attachments.split(/[,，]/).map((x) => x.trim()).filter(Boolean) : [];
  const data = {
    destination: form.destination.trim(),
    is_local: form.isLocal ? 1 : 0,
    cross_province: form.crossProvince ? 1 : 0,
    start_date: form.startDate, end_date: form.endDate, days,
    purpose: form.purpose.trim(), task: form.task.trim(),
    counterpart: form.counterpart.trim(), contact: form.contact.trim(),
    companions: form.companions.trim(), budget_note: form.budgetNote.trim(),
    itinerary: form.itinerary.trim(), remark: form.remark.trim(),
    attachments: atts,
    companion_count: form.companions.trim() ? '多人' : '单人',
  };
  if (draft) data.draft = 1;
  const res = await request.post('/business-trips', data);
  if (res.code === 200) {
    const w = (res.data && res.data.warnings) || [];
    const msg = res.msg + (w.length ? ' | AI预警: ' + w[0] : '');
    if (w.length) ElMessage.warning(msg); else ElMessage.success(msg);
    form.visible = false;
    load();
  } else ElMessage.error(res.msg || '提交失败');
}

/* ===== 详情 ===== */
const detail = reactive({ visible: false, data: {} });
const detailWarns = computed(() => (detail.data.ai_check || {}).warnings || []);
const detailFlow = computed(() => detail.data.flow || []);
async function viewDetail(id) {
  const res = await request.get(`/business-trips/${id}`);
  if (res.code !== 200) { ElMessage.error(res.msg || '加载失败'); return; }
  detail.data = res.data;
  detail.visible = true;
}

/* ===== 审批 / 驳回 / 作废 ===== */
async function approve(id) {
  let remark = '';
  try {
    const r = await ElMessageBox.prompt('审批意见(选填):', '审批通过', { confirmButtonText: '确定', cancelButtonText: '取消' });
    remark = r.value || '';
  } catch { return; }
  const res = await request.post(`/business-trips/${id}/approve`, { remark });
  if (res.code === 200) { ElMessage.success(res.msg); load(); }
  else ElMessage.error(res.msg || '操作失败');
}
async function reject(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('驳回意见(必填):', '驳回', { confirmButtonText: '确定', cancelButtonText: '取消', inputPattern: /\S+/, inputErrorMessage: '驳回必须填写审批意见' });
    remark = (r.value || '').trim();
  } catch { return; }
  const res = await request.post(`/business-trips/${id}/reject`, { remark });
  if (res.code === 200) { ElMessage.success(res.msg); load(); }
  else ElMessage.error(res.msg || '操作失败');
}
async function voidTrip(id) {
  try {
    await ElMessageBox.confirm('确定作废此申请单? 作废后转入行政归档台账留存', '提示', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const res = await request.post(`/business-trips/${id}/void`);
  if (res.code === 200) { ElMessage.success(res.msg); load(); }
  else ElMessage.error(res.msg || '操作失败');
}

/* ===== 销差 ===== */
const settle = reactive({ visible: false, id: '', days: '', summary: '', feedback: '' });
function openSettle(id) {
  Object.assign(settle, { visible: true, id, days: '', summary: '', feedback: '' });
}
async function doSettle() {
  const days = Number(settle.days);
  if (!(days > 0)) { ElMessage.warning('请填写实际天数'); return; }
  const data = { actual_days: days, summary: settle.summary, feedback: settle.feedback };
  if (!data.summary.trim() || !data.feedback.trim()) { ElMessage.warning('销差必须填写工作总结与成果反馈'); return; }
  const res = await request.post(`/business-trips/${settle.id}/settle`, data);
  if (res.code === 200) { ElMessage.success(res.msg); settle.visible = false; load(); }
  else ElMessage.error(res.msg || '操作失败');
}
</script>

<style scoped>
.zm-trip {
  --primary: #2563eb; --primary-dark: #1d4ed8; --primary-light: #dbeafe;
  --success: #10b981; --success-light: #d1fae5;
  --warning: #f59e0b; --warning-light: #fef3c7;
  --danger: #ef4444; --danger-light: #fee2e2;
  --info: #06b6d4; --info-light: #cffafe;
  --purple: #8b5cf6; --purple-light: #ede9fe;
  --text-primary: #1e293b; --text-secondary: #64748b; --text-muted: #94a3b8;
  --border: #e2e8f0; --border-light: #f1f5f9;
  --bg-card: #ffffff; --bg-hover: #f8fafc; --bg-secondary: #f1f5f9;
  --radius: 12px; --radius-sm: 8px; --radius-lg: 16px;
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --transition: all 0.2s ease;
}
.card { background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow-md); overflow: hidden; }
.card-header { padding: 16px 20px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; }
.card-header h3 { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.card-body { padding: 20px; }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; transition: var(--transition); cursor: pointer; border: none; background: transparent; color: var(--text-primary); }
.btn-primary { background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: #fff; box-shadow: 0 4px 12px rgba(37,99,235,0.3); }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37,99,235,0.4); }
.btn-success { background: var(--success); color: #fff; }
.btn-success:hover { background: #059669; }
.btn-info { background: var(--info); color: #fff; }
.btn-secondary { background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--bg-secondary); }
.btn-sm { padding: 5px 12px; font-size: 12px; }

.table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
.table th { padding: 10px 14px; font-size: 13px; font-weight: 700; color: #1e293b; background: #e2e8f0; border: 1px solid #94a3b8; white-space: nowrap; text-align: left; }
.table td { padding: 10px 14px; border: 1px solid #cbd5e1; font-size: 13px; color: #1e293b; }
.table tr:nth-child(even) td { background: #f1f5f9; }
.table tr:hover td { background: #dbeafe; }

.tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.tag-green { background: var(--success-light); color: var(--success); }
.tag-red { background: var(--danger-light); color: var(--danger); }
.tag-yellow { background: var(--warning-light); color: var(--warning); }
.tag-blue { background: var(--primary-light); color: var(--primary); }
.tag-gray { background: #f1f5f9; color: var(--text-secondary); }
.tag-purple { background: var(--purple-light); color: var(--purple); }

.text-muted { color: var(--text-muted); }
.text-center { text-align: center; }
.loading { text-align: center; padding: 40px; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: 8px; }
.loading .el-icon { font-size: 20px; color: var(--primary); }

.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.form-control { width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 14px; background: var(--bg-card); transition: var(--transition); font-family: inherit; }
.form-control:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); outline: none; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; animation: zmFadeIn 0.2s ease; }
.modal-box { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-width: 600px; width: 90%; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; animation: zmModalIn 0.3s ease; }
.modal-header { padding: 16px 24px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; }
.modal-header h3 { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.modal-close { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 20px; transition: var(--transition); border: none; background: transparent; cursor: pointer; }
.modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-light); display: flex; justify-content: flex-end; gap: 10px; }
@keyframes zmFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes zmModalIn { from { opacity: 0; transform: translateY(20px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>
