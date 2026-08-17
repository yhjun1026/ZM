<template>
  <div class="leave-page">
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3><el-icon><Calendar /></el-icon> 请假管理</h3>
        <button class="btn btn-primary btn-sm" @click="openForm"><el-icon><Plus /></el-icon> 发起请假</button>
      </div>
      <div class="card-body">
        <div class="ca-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
          <button v-for="t in tabs" :key="t.k" class="btn btn-sm" :class="tab === t.k ? 'btn-primary' : 'btn-secondary'" @click="switchTab(t.k)">
            <el-icon><component :is="t.icon" /></el-icon> {{ t.t }}
          </button>
        </div>

        <!-- ===== 请假台账 ===== -->
        <template v-if="tab === 'list'">
          <div v-if="listError" class="text-muted">{{ listError }}</div>
          <template v-else>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
              <select class="form-control" style="width:130px;" v-model="filters.status" @change="loadList">
                <option value="">全部状态</option>
                <option v-for="s in ['草稿', '待审批', '审批中', '审批通过', '已销假', '已驳回', '已归档', '已作废']" :key="s" :value="s">{{ s }}</option>
              </select>
              <select class="form-control" style="width:120px;" v-model="filters.type" @change="loadList">
                <option value="">全部类型</option>
                <option v-for="s in leaveTypes" :key="s" :value="s">{{ s }}</option>
              </select>
              <input type="month" class="form-control" style="width:150px;" v-model="filters.month" @change="loadList">
              <input v-if="scope === 'all'" class="form-control" style="width:140px;" placeholder="搜索申请人" v-model="filters.name" @change="loadList">
              <span class="text-muted" style="align-self:center;font-size:12px;"><el-icon><Lock /></el-icon> {{ scopeTxt }} · 共{{ rows.length }}条</span>
            </div>
            <div class="table-wrap" style="overflow-x:auto;">
              <table class="table">
                <thead><tr><th>单号</th><th>申请人</th><th>部门</th><th>类型</th><th>开始</th><th>结束</th><th>天数</th><th>状态</th><th>销假差异</th><th>操作</th></tr></thead>
                <tbody>
                  <tr v-if="listLoading"><td colspan="10" class="text-center text-muted" style="padding:24px;">加载中...</td></tr>
                  <tr v-else-if="!rows.length"><td colspan="10" class="text-center text-muted" style="padding:24px;">暂无请假单据</td></tr>
                  <tr v-else v-for="r in rows" :key="r.id">
                    <td style="font-family:monospace;font-size:12px;">{{ r.id }}</td>
                    <td>{{ r.applicant }}</td><td>{{ r.dept }}</td>
                    <td><span class="tag tag-blue">{{ r.leave_type }}</span></td>
                    <td>{{ r.start_date }}{{ r.start_half === '下午' ? '(下午)' : '' }}</td>
                    <td>{{ r.end_date }}{{ r.end_half === '上午' ? '(上午)' : '' }}</td>
                    <td><b>{{ r.days }}</b>天</td>
                    <td><span class="tag" :class="statusTagClass(r.status)">{{ r.status }}</span></td>
                    <td>
                      <span v-if="r.actual_days > 0 && r.actual_days !== r.days" class="tag tag-red">申请{{ r.days }}/实休{{ r.actual_days }}</span>
                      <span v-else-if="r.status === '已销假' || r.status === '已归档'" class="text-muted">一致</span>
                      <template v-else>—</template>
                    </td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-sm btn-info" title="详情" @click="openDetail(r.id)"><el-icon><Document /></el-icon></button>
                      <template v-if="canApproveRow(r)">
                        <button class="btn btn-sm btn-primary" title="通过" @click="approveRow(r.id)"><el-icon><Check /></el-icon></button>
                        <button class="btn btn-sm btn-secondary" title="驳回" @click="rejectRow(r.id)"><el-icon><Close /></el-icon></button>
                      </template>
                      <button v-if="canSettle(r)" class="btn btn-sm btn-success" title="销假" @click="openSettle(r.id)"><el-icon><RefreshLeft /></el-icon> 销假</button>
                      <button v-if="canVoid(r)" class="btn btn-sm btn-secondary" title="作废" @click="voidRow(r.id)"><el-icon><CircleClose /></el-icon></button>
                      <button v-if="r.status === '草稿' && isApplicant(r)" class="btn btn-sm btn-primary" title="正式提交" @click="submitDraft(r.id)"><el-icon><Promotion /></el-icon></button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>

        <!-- ===== 我的额度 ===== -->
        <template v-else-if="tab === 'quota'">
          <div v-if="quotaError" class="text-muted">{{ quotaError }}</div>
          <template v-else>
            <p class="text-muted" style="margin-bottom:10px;"><el-icon><InfoFilled /></el-icon> AI自动校验额度, 申请超过剩余额度将自动拦截; 婚假/产假/陪产假/丧假为法定假期不设额度限制, 销假后按实际天数核销</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
              <div v-for="(v, t) in quota" :key="t" class="card" style="padding:14px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                  <b>{{ t }}</b>
                  <span :style="`color:${quotaColor(v)};font-weight:600;`">{{ v.unlimited ? '不限' : v.left + '/' + v.total + '天' }}</span>
                </div>
                <div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
                  <div :style="`height:100%;width:${quotaPct(v)}%;background:${quotaColor(v)};`"></div>
                </div>
                <div v-if="!v.unlimited" class="text-muted" style="font-size:12px;margin-top:6px;">已使用 {{ v.used }} 天</div>
              </div>
            </div>
          </template>
        </template>

        <!-- ===== 审批中心 ===== -->
        <template v-else-if="tab === 'approve'">
          <div v-if="approveError" class="text-muted">{{ approveError }}</div>
          <p v-else-if="!approveRows.length" class="text-center text-muted" style="padding:32px;"><el-icon><CircleCheck /></el-icon> 当前没有待您审批的请假单</p>
          <table v-else class="table">
            <thead><tr><th>单号</th><th>申请人</th><th>部门</th><th>类型</th><th>起止</th><th>天数</th><th>当前节点</th><th>AI预警</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="r in approveRows" :key="r.id">
                <td style="font-family:monospace;font-size:12px;">{{ r.id }}</td>
                <td>{{ r.applicant }}</td><td>{{ r.dept }}</td><td>{{ r.leave_type }}</td>
                <td>{{ r.start_date }} ~ {{ r.end_date }}</td><td><b>{{ r.days }}</b>天</td>
                <td>
                  <span class="tag tag-blue">{{ currentFlowStep(r).step || '' }}</span><br>
                  <span class="text-muted" style="font-size:12px;">{{ currentFlowStep(r).assignee || '' }}</span>
                </td>
                <td>
                  <span v-if="rowWarnings(r).length" class="tag tag-red" :title="rowWarnings(r).join('; ')"><el-icon><Warning /></el-icon> {{ rowWarnings(r).length }}项</span>
                  <span v-else class="text-muted">正常</span>
                </td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-sm btn-info" @click="openDetail(r.id)"><el-icon><Document /></el-icon></button>
                  <button class="btn btn-sm btn-primary" @click="approveRow(r.id)"><el-icon><Check /></el-icon> 通过</button>
                  <button class="btn btn-sm btn-secondary" @click="rejectRow(r.id)"><el-icon><Close /></el-icon> 驳回</button>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- ===== 统计报表（行政部） ===== -->
        <template v-else-if="tab === 'stats'">
          <div v-if="statsError" class="text-muted">{{ statsError }}</div>
          <template v-else>
            <p class="text-muted" style="margin-bottom:10px;"><el-icon><Lock /></el-icon> 请假数据统计仅行政部可查看 ({{ statsData.kpi?.month || '' }})</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:16px;">
              <div v-for="x in statCards" :key="x[0]" class="card" style="padding:12px;text-align:center;">
                <div class="text-muted" style="font-size:12px;">{{ x[0] }}</div>
                <div :style="`font-size:22px;font-weight:700;color:${x[2]};`">{{ x[1] == null ? 0 : x[1] }}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              <div>
                <h4 style="margin-bottom:8px;">按假期类型</h4>
                <template v-if="(statsData.byType || []).length">
                  <div v-for="x in statsData.byType" :key="x.t" style="margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;font-size:13px;"><span>{{ x.t }}</span><span><b>{{ x.n }}</b>次 / {{ x.d || 0 }}天</span></div>
                    <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;"><div :style="`height:100%;width:${barPct(x.n, statsData.byType)}%;background:#6366f1;`"></div></div>
                  </div>
                </template>
                <p v-else class="text-muted">暂无数据</p>
              </div>
              <div>
                <h4 style="margin-bottom:8px;">按部门</h4>
                <template v-if="(statsData.byDept || []).length">
                  <div v-for="x in statsData.byDept" :key="x.t" style="margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;font-size:13px;"><span>{{ x.t }}</span><span><b>{{ x.n }}</b>次 / {{ x.d || 0 }}天</span></div>
                    <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden;"><div :style="`height:100%;width:${barPct(x.n, statsData.byDept)}%;background:#10b981;`"></div></div>
                  </div>
                </template>
                <p v-else class="text-muted">暂无数据</p>
              </div>
            </div>
          </template>
        </template>

        <!-- ===== 风险预警 ===== -->
        <template v-else-if="tab === 'alerts'">
          <div v-if="alertsError" class="text-muted">{{ alertsError }}</div>
          <table v-else class="table">
            <thead><tr><th>预警类型</th><th>级别</th><th>内容</th></tr></thead>
            <tbody>
              <tr v-if="!alerts.length"><td colspan="3" class="text-center text-muted" style="padding:24px;"><el-icon><CircleCheck /></el-icon> 暂无预警, 一切正常</td></tr>
              <tr v-else v-for="(r, i) in alerts" :key="i">
                <td><span class="tag tag-blue">{{ r.alert_type }}</span></td>
                <td><span class="tag" :class="alertLevelClass(r.level)">{{ r.level }}</span></td>
                <td>{{ r.msg }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>
    </div>

    <!-- 发起请假弹窗 -->
    <el-dialog v-model="lv.visible" width="620px" top="6vh">
      <template #header><span style="font-weight:600;"><el-icon><Calendar /></el-icon> 发起请假申请</span></template>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group"><label>申请人</label><input class="form-control" :value="`${(auth.user || {}).name || ''} (${(auth.user || {}).dept || ''})`" readonly></div>
        <div class="form-group"><label>请假类型 *</label>
          <select class="form-control" v-model="lv.form.leave_type" @change="onTypeChange">
            <option v-for="t in leaveTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="form-group"><label>开始时间 *</label><input type="date" class="form-control" v-model="lv.form.start_date" @change="scheduleCalc"></div>
        <div class="form-group"><label>开始半天</label>
          <select class="form-control" v-model="lv.form.start_half" @change="scheduleCalc">
            <option value="全天">全天</option><option value="上午">上午(0.5天)</option><option value="下午">下午(0.5天)</option>
          </select>
        </div>
        <div class="form-group"><label>结束时间 *</label><input type="date" class="form-control" v-model="lv.form.end_date" @change="scheduleCalc"></div>
        <div class="form-group"><label>结束半天</label>
          <select class="form-control" v-model="lv.form.end_half" @change="scheduleCalc">
            <option value="全天">全天</option><option value="上午">上午(0.5天)</option><option value="下午">下午(0.5天)</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label><el-icon><MagicStick /></el-icon> AI天数核算预览</label>
        <div class="text-muted" :style="`background:#f8fafc;border:1px dashed ${lv.calc.error ? '#ef4444' : lv.calc.done ? '#6366f1' : '#cbd5e1'};border-radius:6px;padding:10px;font-size:13px;`">
          <template v-if="lv.calc.done">
            <b style="color:#6366f1;font-size:15px;">AI核算: {{ lv.calc.days }} 个工作日</b><br>
            <span class="text-muted">含工作日{{ lv.calc.detail.workdays }}天 · 自动剔除周末{{ lv.calc.detail.weekends }}天 · 法定节假日{{ lv.calc.detail.holidays }}天{{ lv.form.start_half !== '全天' ? ' · ' + lv.form.start_half + '起(计0.5)' : '' }}{{ lv.form.end_half !== '全天' ? ' · ' + lv.form.end_half + '止(计0.5)' : '' }}</span>
          </template>
          <span v-else-if="lv.calc.error" style="color:#ef4444;"><el-icon><Warning /></el-icon> {{ lv.calc.error }}</span>
          <template v-else>选择起止时间后AI自动核算(自动剔除周末与法定节假日)</template>
        </div>
      </div>
      <div class="form-group"><label>请假事由 * (事假必填)</label><textarea class="form-control" v-model="lv.form.reason" rows="2"></textarea></div>
      <div class="form-group"><label>联系方式 *</label><input class="form-control" v-model="lv.form.contact" placeholder="手机号码"></div>
      <div class="form-group"><label>紧急联系人</label><input class="form-control" v-model="lv.form.emergency_contact" placeholder="姓名+电话(选填)"></div>
      <div class="form-group"><label>工作交接说明 *</label><textarea class="form-control" v-model="lv.form.handover" rows="2" placeholder="交接给谁、交接事项"></textarea></div>
      <div class="form-group" v-if="needAttachments">
        <label>佐证材料 * <span class="text-muted">(病假需病历/就医凭证, 婚产丧假需证明, 多个用逗号分隔)</span></label>
        <input class="form-control" v-model="lv.form.attachmentsStr" placeholder="如: 市医院诊断证明.jpg, 挂号单.pdf">
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="lv.visible = false">取消</button>
        <button class="btn btn-secondary" @click="submitLeave(1)">存草稿</button>
        <button class="btn btn-primary" @click="submitLeave(0)"><el-icon><Promotion /></el-icon> 提交申请</button>
      </template>
    </el-dialog>

    <!-- 请假单详情弹窗 -->
    <el-dialog v-model="detail.visible" width="680px" top="6vh">
      <template #header><span style="font-weight:600;">请假单 {{ detail.data ? detail.data.id : '' }}</span></template>
      <template v-if="detail.data">
        <table class="table" style="font-size:13px;">
          <tbody>
            <tr><td style="width:110px;" class="text-muted">申请人</td><td>{{ detail.data.applicant }} / {{ detail.data.dept }}</td><td class="text-muted">状态</td><td><span class="tag" :class="statusTagClass(detail.data.status)">{{ detail.data.status }}</span></td></tr>
            <tr><td class="text-muted">类型</td><td>{{ detail.data.leave_type }}</td><td class="text-muted">天数</td><td><b>{{ detail.data.days }}</b>个工作日</td></tr>
            <tr><td class="text-muted">起止</td><td colspan="3">{{ detail.data.start_date }} {{ detail.data.start_half }} ~ {{ detail.data.end_date }} {{ detail.data.end_half }}</td></tr>
            <tr><td class="text-muted">事由</td><td colspan="3">{{ detail.data.reason || '—' }}</td></tr>
            <tr><td class="text-muted">联系方式</td><td>{{ detail.data.contact || '—' }}</td><td class="text-muted">紧急联系人</td><td>{{ detail.data.emergency_contact || '—' }}</td></tr>
            <tr><td class="text-muted">工作交接</td><td colspan="3">{{ detail.data.handover || '—' }}</td></tr>
            <tr><td class="text-muted">佐证材料</td><td colspan="3">
              <template v-if="(detail.data.attachments || []).length">
                <span v-for="a in detail.data.attachments" :key="a" class="tag tag-blue" style="margin-right:4px;"><el-icon><Paperclip /></el-icon> {{ a }}</span>
              </template>
              <template v-else>—</template>
            </td></tr>
            <tr><td class="text-muted">销假</td><td colspan="3">
              <template v-if="detail.data.actual_days > 0">
                实际休假 <b>{{ detail.data.actual_days }}</b>天
                <span v-if="detail.data.actual_days !== detail.data.days" class="tag tag-red">与申请{{ detail.data.days }}天存在差异</span>
                <span v-else class="tag tag-green">一致</span>
              </template>
              <template v-else>未销假</template>
            </td></tr>
            <tr><td class="text-muted">归档</td><td colspan="3">
              <template v-if="detail.data.archive">档案编号 <b style="font-family:monospace;">{{ detail.data.archive.archive_no }}</b> ({{ detail.data.archive.a_status }}, {{ detail.data.archive.filed_by || '' }} {{ detail.data.archive.filed_at || '' }})</template>
              <template v-else>未归档</template>
            </td></tr>
          </tbody>
        </table>
        <h4 style="margin:12px 0 6px;"><el-icon><MagicStick /></el-icon> AI校验</h4>
        <div style="background:#f8fafc;border-radius:6px;padding:10px;font-size:13px;">
          <template v-if="detailAi.days_detail">核算: {{ detailAi.days_detail.workdays }}工作日/剔除周末{{ detailAi.days_detail.weekends }}/节假日{{ detailAi.days_detail.holidays }}<br></template>
          <template v-if="detailQuota.unlimited">假期类型: 法定假不设额度<br></template>
          <template v-else-if="detailQuota.total != null">额度: 剩余{{ detailQuota.left }}/{{ detailQuota.total }}天(申请时)<br></template>
          <template v-if="detailWarnings.length">
            <span v-for="(w, i) in detailWarnings" :key="i" style="color:#ef4444;"><el-icon><Warning /></el-icon> {{ w }}<br></span>
          </template>
          <span v-else class="text-muted">无异常预警</span>
        </div>
        <h4 style="margin:12px 0 6px;"><el-icon><Share /></el-icon> 审批流程</h4>
        <div v-for="(f, i) in (detail.data.flow || [])" :key="i" :style="`display:flex;gap:10px;align-items:center;padding:6px 10px;border-left:3px solid ${f.done ? (f.rejected ? '#ef4444' : '#10b981') : '#e5e7eb'};background:#fafafa;margin-bottom:4px;border-radius:0 6px 6px 0;flex-wrap:wrap;`">
          <el-icon v-if="f.done && f.rejected" color="#ef4444"><CircleClose /></el-icon>
          <el-icon v-else-if="f.done" color="#10b981"><CircleCheck /></el-icon>
          <el-icon v-else color="#9ca3af"><Clock /></el-icon>
          <b>{{ f.step }}</b><span class="text-muted">{{ f.assignee || '' }}</span>
          <span style="margin-left:auto;" class="text-muted">{{ f.done ? (f.user + ' · ' + (f.time || '')) : '待处理' }}</span>
          <span v-if="f.remark" class="text-muted" style="flex-basis:100%;font-size:12px;">意见: {{ f.remark }}</span>
        </div>
      </template>
    </el-dialog>

    <!-- 销假弹窗 -->
    <el-dialog v-model="settle.visible" width="480px">
      <template #header><span style="font-weight:600;"><el-icon><RefreshLeft /></el-icon> 销假申请 {{ settle.id }}</span></template>
      <div class="form-group">
        <label>实际休假天数 * (AI将自动对比申请天数并标注差异)</label>
        <input type="number" step="0.5" min="0.5" class="form-control" v-model="settle.days" placeholder="如 2 或 1.5">
      </div>
      <div class="form-group"><label>销假备注</label><textarea class="form-control" v-model="settle.note" rows="2"></textarea></div>
      <template #footer>
        <button class="btn btn-secondary" @click="settle.visible = false">取消</button>
        <button class="btn btn-success" @click="submitSettle"><el-icon><Check /></el-icon> 确认销假</button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Calendar, Plus, Tickets, Odometer, Finished, DataAnalysis, Bell, Document,
  Check, Close, RefreshLeft, CircleClose, Promotion, InfoFilled, MagicStick,
  Warning, CircleCheck, Clock, Paperclip, Lock, Share
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const leaveTypes = ['事假', '病假', '年假', '婚假', '产假', '陪产假', '丧假', '调休假'];

/* ===== 角色判断 ===== */
const isAdminDept = computed(() => (auth.user || {}).dept === '行政部');
const isMgr = computed(() => {
  const u = auth.user || {};
  return ['总经理', '副总', '超级管理员'].includes(u.role) || u.dept === '行政部';
});

/* ===== Tab ===== */
const tab = ref('list');
const tabs = computed(() => {
  const t = [
    { k: 'list', t: '请假台账', icon: Tickets },
    { k: 'quota', t: '我的额度', icon: Odometer },
    { k: 'approve', t: '审批中心', icon: Finished }
  ];
  if (isAdminDept.value) t.push({ k: 'stats', t: '统计报表', icon: DataAnalysis });
  if (isMgr.value) t.push({ k: 'alerts', t: '风险预警', icon: Bell });
  return t;
});
function switchTab(k) {
  tab.value = k;
  if (k === 'list') loadList();
  else if (k === 'quota') loadQuota();
  else if (k === 'approve') loadApprove();
  else if (k === 'stats') loadStats();
  else if (k === 'alerts') loadAlerts();
}

/* ===== 状态标签 ===== */
function statusTagClass(s) {
  const m = {
    '草稿': 'tag-gray', '待审批': 'tag-yellow', '审批中': 'tag-blue', '审批通过': 'tag-green',
    '已驳回': 'tag-red', '已销假': 'tag-green', '已归档': 'tag-gray', '已作废': 'tag-gray'
  };
  return m[s] || 'tag-yellow';
}

/* ===== 请假台账 ===== */
const rows = ref([]);
const listLoading = ref(false);
const listError = ref('');
const filters = reactive({ status: '', type: '', month: '', name: '' });
const scope = computed(() => (rows.value[0] ? rows.value[0]._scope : 'self') || 'self');
const scopeTxt = computed(() => ({ self: '仅显示本人单据', dept: '显示本部门单据', all: '显示全公司单据' }[scope.value] || ''));
async function loadList() {
  listLoading.value = true;
  listError.value = '';
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.type) params.type = filters.type;
  if (filters.month) params.month = filters.month;
  if (filters.name) params.name = filters.name;
  const resp = await request.get('/leaves', { params });
  listLoading.value = false;
  if (resp.code !== 200) { listError.value = resp.msg || '加载失败'; return; }
  rows.value = resp.data || [];
}

/* ===== 行级权限 ===== */
function isApplicant(r) {
  return String(r.applicant_id) === String((auth.user || {}).id);
}
function canApproveRow(r) {
  if (!['待审批', '审批中'].includes(r.status) || !r.flow) return false;
  const u = auth.user || {};
  const cur = (r.flow || []).find(f => !f.done);
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
  return (r.status === '审批通过' && isApplicant(r)) || (isAdminDept.value && r.status === '审批通过');
}
function canVoid(r) {
  return isApplicant(r) && ['草稿', '待审批'].includes(r.status);
}

/* ===== 我的额度 ===== */
const quota = ref({});
const quotaError = ref('');
async function loadQuota() {
  quotaError.value = '';
  const resp = await request.get('/leaves/quota');
  if (resp.code !== 200) { quotaError.value = resp.msg || '加载失败'; return; }
  quota.value = resp.data || {};
}
function quotaPct(v) {
  return v.unlimited ? 100 : (v.total ? Math.round(v.left / v.total * 100) : 0);
}
function quotaColor(v) {
  if (v.unlimited) return '#8b5cf6';
  const pct = quotaPct(v);
  return pct > 50 ? '#10b981' : pct > 20 ? '#f59e0b' : '#ef4444';
}

/* ===== 审批中心 ===== */
const approveRows = ref([]);
const approveError = ref('');
async function loadApprove() {
  approveError.value = '';
  const resp = await request.get('/leaves', { params: { status: '待审批' } });
  const resp2 = await request.get('/leaves', { params: { status: '审批中' } });
  if (resp.code !== 200) { approveError.value = resp.msg || '加载失败'; return; }
  approveRows.value = [...(resp.data || []), ...(resp2.code === 200 ? resp2.data || [] : [])].filter(r => canApproveRow(r));
}
function currentFlowStep(r) {
  return (r.flow || []).find(f => !f.done) || {};
}
function rowWarnings(r) {
  return ((r.ai_check || {}).warnings) || [];
}

/* ===== 统计报表 ===== */
const statsData = ref({});
const statsError = ref('');
async function loadStats() {
  statsError.value = '';
  const resp = await request.get('/leaves/stats');
  if (resp.code !== 200) { statsError.value = resp.msg || '加载失败'; return; }
  statsData.value = resp.data || {};
}
const statCards = computed(() => {
  const k = statsData.value.kpi || {};
  return [
    ['本月申请', k.total, '#6366f1'], ['本月天数', k.days_month, '#8b5cf6'], ['待审批', k.pending, '#f59e0b'],
    ['待销假', k.settle_wait, '#ef4444'], ['已销假', k.settled, '#10b981'], ['销假差异', k.diff_cnt, '#f43f5e']
  ];
});
function barPct(n, arr) {
  const max = Math.max(...(arr || []).map(y => y.n), 1);
  return Math.round(n / max * 100);
}

/* ===== 风险预警 ===== */
const alerts = ref([]);
const alertsError = ref('');
async function loadAlerts() {
  alertsError.value = '';
  const resp = await request.get('/leaves/alerts');
  if (resp.code !== 200) { alertsError.value = resp.msg || '加载失败'; return; }
  alerts.value = resp.data || [];
}
function alertLevelClass(l) {
  return { '高': 'tag-red', '中': 'tag-yellow', '低': 'tag-gray' }[l] || 'tag-gray';
}

/* ===== 发起请假 ===== */
const lv = reactive({
  visible: false,
  form: {
    leave_type: '事假', start_date: '', start_half: '全天',
    end_date: '', end_half: '全天', reason: '', contact: '',
    emergency_contact: '', handover: '', attachmentsStr: ''
  },
  calc: { done: false, error: '', days: 0, detail: {} }
});
const needAttachments = computed(() => ['病假', '婚假', '产假', '陪产假', '丧假'].includes(lv.form.leave_type));
function openForm() {
  lv.form = {
    leave_type: '事假', start_date: '', start_half: '全天',
    end_date: '', end_half: '全天', reason: '', contact: '',
    emergency_contact: '', handover: '', attachmentsStr: ''
  };
  lv.calc = { done: false, error: '', days: 0, detail: {} };
  lv.visible = true;
}
function onTypeChange() {
  scheduleCalc();
}
let calcTimer = null;
function scheduleCalc() {
  clearTimeout(calcTimer);
  calcTimer = setTimeout(doCalc, 300);
}
async function doCalc() {
  const f = lv.form;
  if (!f.start_date || !f.end_date) return;
  const resp = await request.post('/leaves/calc-days', {
    start_date: f.start_date, start_half: f.start_half,
    end_date: f.end_date, end_half: f.end_half
  });
  if (resp.code === 200) {
    lv.calc = { done: true, error: '', days: resp.data.days, detail: resp.data.detail || {} };
  } else {
    lv.calc = { done: false, error: resp.msg || '核算失败', days: 0, detail: {} };
  }
}
async function submitLeave(draft) {
  const f = lv.form;
  const atts = f.attachmentsStr ? f.attachmentsStr.split(/[,，]/).map(x => x.trim()).filter(Boolean) : [];
  const data = {
    leave_type: f.leave_type, start_date: f.start_date, start_half: f.start_half,
    end_date: f.end_date, end_half: f.end_half,
    reason: (f.reason || '').trim(), contact: (f.contact || '').trim(),
    emergency_contact: (f.emergency_contact || '').trim(),
    handover: (f.handover || '').trim(), attachments: atts
  };
  if (draft) data.draft = 1;
  const resp = await request.post('/leaves', data);
  if (resp.code === 200) {
    const w = (resp.data && resp.data.warnings) || [];
    if (w.length) ElMessage.warning(resp.msg + ' | AI预警: ' + w[0]);
    else ElMessage.success(resp.msg);
    lv.visible = false;
    switchTab(tab.value);
  } else ElMessage.error(resp.msg || '提交失败');
}

/* ===== 详情 ===== */
const detail = reactive({ visible: false, data: null });
const detailAi = computed(() => (detail.data && detail.data.ai_check) || {});
const detailQuota = computed(() => detailAi.value.quota || {});
const detailWarnings = computed(() => detailAi.value.warnings || []);
async function openDetail(id) {
  const resp = await request.get(`/leaves/${id}`);
  if (resp.code !== 200) { ElMessage.error(resp.msg || '加载失败'); return; }
  detail.data = resp.data;
  detail.visible = true;
}

/* ===== 审批 / 驳回 / 作废 / 提交草稿 ===== */
async function approveRow(id) {
  let remark = '';
  try {
    const { value } = await ElMessageBox.prompt('审批意见(选填):', '通过', { confirmButtonText: '确定', cancelButtonText: '取消' });
    remark = value || '';
  } catch { remark = ''; }
  const resp = await request.post(`/leaves/${id}/approve`, { remark });
  if (resp.code === 200) { ElMessage.success(resp.msg); switchTab(tab.value); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function rejectRow(id) {
  let remark;
  try {
    const { value } = await ElMessageBox.prompt('驳回意见(必填):', '驳回', { confirmButtonText: '确定', cancelButtonText: '取消' });
    remark = value;
  } catch { return; }
  if (!(remark || '').trim()) { ElMessage.warning('驳回必须填写审批意见'); return; }
  const resp = await request.post(`/leaves/${id}/reject`, { remark: remark.trim() });
  if (resp.code === 200) { ElMessage.success(resp.msg); switchTab(tab.value); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function voidRow(id) {
  try { await ElMessageBox.confirm('确定作废此申请单? 作废后转入行政归档台账留存', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.post(`/leaves/${id}/void`);
  if (resp.code === 200) { ElMessage.success(resp.msg); switchTab(tab.value); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function submitDraft(id) {
  const resp = await request.post(`/leaves/${id}/submit`);
  if (resp.code === 200) { ElMessage.success(resp.msg); switchTab(tab.value); }
  else ElMessage.error(resp.msg || '操作失败');
}

/* ===== 销假 ===== */
const settle = reactive({ visible: false, id: '', days: '', note: '' });
function openSettle(id) {
  settle.id = id;
  settle.days = '';
  settle.note = '';
  settle.visible = true;
}
async function submitSettle() {
  const days = Number(settle.days);
  if (!(days > 0)) { ElMessage.warning('请填写实际天数'); return; }
  const resp = await request.post(`/leaves/${settle.id}/settle`, { actual_days: days, settle_note: settle.note });
  if (resp.code === 200) { ElMessage.success(resp.msg); settle.visible = false; switchTab(tab.value); }
  else ElMessage.error(resp.msg || '操作失败');
}

onMounted(loadList);
</script>

<style scoped>
.leave-page {
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --primary-light: #dbeafe;
  --success: #10b981;
  --success-light: #d1fae5;
  --warning: #f59e0b;
  --warning-light: #fef3c7;
  --danger: #ef4444;
  --danger-light: #fee2e2;
  --info: #06b6d4;
  --info-light: #cffafe;
  --purple: #8b5cf6;
  --purple-light: #ede9fe;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;
  --border: #e2e8f0;
  --border-light: #f1f5f9;
  --border-color: #e5e7eb;
  --bg-card: #ffffff;
  --bg-hover: #f8fafc;
  --bg-secondary: #f1f5f9;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 16px;
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  --transition: all 0.2s ease;
}

/* ===== 卡片 ===== */
.card {
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  transition: var(--transition);
}
.card:hover { box-shadow: var(--shadow-lg); }
.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 8px;
}
.card-header h3 { font-size: 15px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 6px; }
.card-body { padding: 20px; }

/* ===== 按钮 ===== */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 600;
  transition: var(--transition);
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
}
.btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: #fff;
  border: none;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4); }
.btn-success { background: var(--success); color: #fff; border: none; }
.btn-success:hover { background: #059669; }
.btn-secondary { background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--bg-secondary); }
.btn-info { background: var(--info); color: #fff; border: none; }
.btn-warning { background: var(--warning); color: #fff; border: none; }
.btn-sm { padding: 5px 12px; font-size: 12px; }

/* ===== 表格 ===== */
.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left; padding: 10px 16px;
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}
.table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
}
.table tbody tr { transition: var(--transition); }
.table tbody tr:hover { background: var(--bg-hover); }
.table tr:last-child td { border-bottom: none; }

/* ===== 标签 ===== */
.tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 20px;
  font-size: 11px; font-weight: 600;
}
.tag-green { background: var(--success-light); color: var(--success); }
.tag-red { background: var(--danger-light); color: var(--danger); }
.tag-yellow { background: var(--warning-light); color: var(--warning); }
.tag-blue { background: var(--primary-light); color: var(--primary); }
.tag-purple { background: var(--purple-light); color: var(--purple); }
.tag-gray { background: #f1f5f9; color: var(--text-secondary); }

/* ===== 表单 ===== */
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); }
.form-control {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  transition: var(--transition);
}
.form-control:focus { border-color: var(--primary); outline: none; }
textarea.form-control { resize: vertical; }

/* ===== 工具 ===== */
.text-muted { color: var(--text-muted); }
.text-center { text-align: center; }
</style>
