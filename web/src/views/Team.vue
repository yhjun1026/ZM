<template>
  <div v-loading="loading">
    <!-- 本部门团队统计 -->
    <div class="stats-grid">
      <StatCard label="团队人数" :value="teamMembers.length + '人'" color="#2563eb"><el-icon><UserFilled /></el-icon></StatCard>
      <StatCard label="在职" :value="teamMembers.filter(e => e.status === '在职').length + '人'" color="#10b981"><el-icon><CircleCheck /></el-icon></StatCard>
      <StatCard label="试用期" :value="teamMembers.filter(e => e.status === '试用期').length + '人'" color="#f59e0b"><el-icon><Clock /></el-icon></StatCard>
      <StatCard label="团队负责人" :value="deptHead ? deptHead.name : '—'" color="#8b5cf6"><el-icon><Star /></el-icon></StatCard>
    </div>

    <!-- 本部门成员 -->
    <el-card style="margin-bottom: 24px;">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600;">团队管理 - {{ user.dept }}</span>
          <el-button v-if="canAddMember" type="primary" size="small" @click="openAddMember"><el-icon><Plus /></el-icon> 添加成员</el-button>
        </div>
      </template>
      <el-table :data="teamMembers" stripe>
        <el-table-column prop="emp_id" label="工号" width="90" />
        <el-table-column label="姓名" width="110"><template #default="{ row }"><strong>{{ row.name }}</strong></template></el-table-column>
        <el-table-column label="角色" width="110">
          <template #default="{ row }">
            <el-tag :type="['部门经理', '总经理'].includes(row.role) ? 'primary' : row.role === '普通员工' ? 'warning' : 'success'" size="small">{{ row.role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="职级" width="90" />
        <el-table-column prop="education" label="学历" width="90" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag :type="row.status === '在职' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="join_date" label="入职日期" width="120" />
        <template #empty><span style="color: #909399;">暂无团队成员</span></template>
      </el-table>
    </el-card>

    <!-- 跨部门团队统计 -->
    <div class="stats-grid">
      <StatCard label="团队总数" :value="teams.filter(t => t.status !== '已解散').length + '个'" color="#2563eb"><el-icon><Grid /></el-icon></StatCard>
      <StatCard label="运作中" :value="teams.filter(t => t.status === '运作中').length + '个'" color="#10b981"><el-icon><VideoPlay /></el-icon></StatCard>
      <StatCard label="临期预警" :value="expiringCount + '个'" color="#ef4444"><el-icon><WarningFilled /></el-icon></StatCard>
      <StatCard label="已暂停" :value="teams.filter(t => t.status === '已暂停').length + '个'" color="#f59e0b"><el-icon><VideoPause /></el-icon></StatCard>
    </div>

    <!-- 跨部门团队卡片 -->
    <el-card style="margin-bottom: 24px;">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600;">跨部门团队 <span style="font-size: 12px; color: #909399; font-weight: normal;">类型：常设/临时/项目 · 临时团队到期前7天预警、到期自动暂停 · 解散需审批</span></span>
          <el-button v-if="canEdit" type="primary" size="small" @click="openTeamForm()"><el-icon><Plus /></el-icon> 创建团队</el-button>
        </div>
      </template>
      <p v-if="!teams.length" style="text-align: center; color: #909399; padding: 24px;">暂无团队，点击右上角创建</p>
      <div class="team-grid">
        <div v-for="t in teams" :key="t.id" class="team-card" :style="t.status === '已解散' ? 'opacity:0.6;' : ''">
          <div style="margin-bottom: 8px;">
            <strong>{{ t.name }}</strong>
            <el-tag size="small" effect="plain" :color="typeColor(t.type) + '15'" :style="{ color: typeColor(t.type), borderColor: typeColor(t.type) + '40', marginLeft: '6px' }">{{ t.type }}</el-tag>
            <el-tag size="small" effect="plain" :color="statusColor(t.status) + '15'" :style="{ color: statusColor(t.status), borderColor: statusColor(t.status) + '40', marginLeft: '4px' }">{{ t.status }}</el-tag>
            <el-tag v-if="t.expiring" type="danger" size="small" style="margin-left: 4px;"><el-icon><WarningFilled /></el-icon> {{ t.days_left }}天后到期</el-tag>
          </div>
          <p style="margin: 4px 0; font-size: 13px; color: #909399;">负责人：{{ t.leader_name || '—' }} · 成员{{ t.member_count }}人{{ t.dept_name ? ' · 挂靠：' + t.dept_name : '' }}</p>
          <p v-if="t.purpose" style="margin: 4px 0; font-size: 13px; color: #909399;">目标：{{ t.purpose }}</p>
          <p style="margin: 4px 0; font-size: 12px; color: #909399;">
            {{ t.start_date ? '起：' + t.start_date : '' }}{{ t.expire_date ? ' · 止：' + t.expire_date : '' }}{{ t.dissolved_at ? ' · 解散于 ' + String(t.dissolved_at).substring(0, 10) : '' }}
          </p>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <el-button size="small" @click="viewTeamDetail(t.id)"><el-icon><UserFilled /></el-icon> 成员</el-button>
            <el-button v-if="t.status !== '已解散' && canEdit" size="small" @click="openTeamForm(t.id)" title="编辑"><el-icon><Edit /></el-icon></el-button>
            <el-button v-if="t.status === '已暂停' && canEdit" size="small" type="primary" @click="resumeTeam(t.id)"><el-icon><VideoPlay /></el-icon> 恢复</el-button>
            <el-button v-if="t.status !== '已解散'" size="small" @click="dissolveTeam(t.id)" title="解散（需审批）"><el-icon><CircleClose /></el-icon></el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 团队解散审批台账 -->
    <el-card>
      <template #header><span style="font-weight: 600;"><el-icon><Stamp /></el-icon> 团队解散审批台账</span></template>
      <el-table :data="teamChanges" stripe>
        <el-table-column label="时间" width="150"><template #default="{ row }">{{ (row.created_at || '').substring(0, 16) }}</template></el-table-column>
        <el-table-column label="团队" min-width="140"><template #default="{ row }"><strong>{{ row.team_name }}</strong></template></el-table-column>
        <el-table-column label="类型" width="80"><template #default="{ row }"><el-tag type="primary" size="small">{{ row.change_type }}</el-tag></template></el-table-column>
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === '已生效' ? 'success' : row.status === '已驳回' ? 'danger' : 'warning'" size="small" effect="plain">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="流程" min-width="150">
          <template #default="{ row }">
            <div v-for="(s, i) in (row.approval_flow || [])" :key="i" :style="{ fontSize: '11px', color: s.done ? '#303133' : '#909399' }">
              {{ s.done ? '✓' : '○' }} {{ s.step }} {{ s.user || '' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="center">
          <template #default="{ row }">
            <template v-if="isGmOrAdmin && row.status === '待审批'">
              <el-button size="small" type="primary" @click="approveTeamChange(row.id)" title="通过"><el-icon><Check /></el-icon></el-button>
              <el-button size="small" @click="rejectTeamChange(row.id)" title="驳回"><el-icon><Close /></el-icon></el-button>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <template #empty><span style="color: #909399;">暂无解散审批记录</span></template>
      </el-table>
    </el-card>

    <!-- ===== 添加团队成员 ===== -->
    <el-dialog v-model="memberForm.visible" title="添加团队成员" width="520px">
      <el-form :model="memberForm.data" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="工号" required><el-input v-model="memberForm.data.emp_id" placeholder="如ZM030" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="姓名" required><el-input v-model="memberForm.data.name" placeholder="姓名" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="部门">
              <el-select v-model="memberForm.data.dept" style="width: 100%;">
                <el-option v-for="d in flatDepts" :key="d.id" :label="d.name" :value="d.name" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色">
              <el-select v-model="memberForm.data.role" style="width: 100%;">
                <el-option label="普通员工" value="普通员工" />
                <el-option label="部门经理" value="部门经理" />
                <el-option label="区域经理" value="区域经理" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="职级">
              <el-select v-model="memberForm.data.level" style="width: 100%;">
                <el-option v-for="l in ['P1','P2','P3','P4','P5','M1','M2','M3']" :key="l" :label="l" :value="l" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="学历">
              <el-select v-model="memberForm.data.education" style="width: 100%;">
                <el-option v-for="e in ['大专','本科','硕士','博士']" :key="e" :label="e" :value="e" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="密码"><el-input v-model="memberForm.data.password" type="password" show-password placeholder="初始密码" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="入职日期"><el-date-picker v-model="memberForm.data.join_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="memberForm.visible = false">取消</el-button>
        <el-button type="primary" :loading="memberForm.saving" @click="submitAddMember">添加</el-button>
      </template>
    </el-dialog>

    <!-- ===== 创建/编辑团队 ===== -->
    <el-dialog v-model="teamForm.visible" :title="teamForm.id ? '编辑团队' : '创建跨部门团队'" width="520px">
      <el-form :model="teamForm.data" label-width="110px">
        <el-form-item label="团队名称" required><el-input v-model="teamForm.data.name" placeholder="如：数字化转型专项组" /></el-form-item>
        <el-form-item label="团队类型" required>
          <el-select v-model="teamForm.data.type" style="width: 100%;">
            <el-option label="常设（长期存在）" value="常设" />
            <el-option label="临时（须设到期日，到期自动暂停）" value="临时" />
            <el-option label="项目（随项目周期）" value="项目" />
          </el-select>
        </el-form-item>
        <el-form-item label="挂靠部门">
          <el-select v-model="teamForm.data.dept_id" style="width: 100%;">
            <el-option label="不挂靠" :value="0" />
            <el-option v-for="d in flatDepts" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="teamForm.data.leader_emp" style="width: 100%;" placeholder="暂不指定（选择后自动入队）" clearable>
            <el-option v-for="e in activeEmps" :key="e.emp_id" :label="`${e.name}（${e.emp_id} · ${e.dept}）`" :value="e.emp_id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="teamForm.data.type === '临时'" label="到期日" required>
          <el-date-picker v-model="teamForm.data.expire_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
          <div style="font-size: 12px; color: #909399;">临时团队必填，到期前7天预警</div>
        </el-form-item>
        <el-form-item label="成立日期"><el-date-picker v-model="teamForm.data.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" /></el-form-item>
        <el-form-item label="团队目标/职责"><el-input v-model="teamForm.data.purpose" type="textarea" :rows="2" placeholder="跨部门协作目标" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="teamForm.visible = false">取消</el-button>
        <el-button type="primary" :loading="teamForm.saving" @click="submitTeamForm">{{ teamForm.id ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- ===== 团队详情/成员 ===== -->
    <el-dialog v-model="teamDetail.visible" width="680px">
      <template #header>
        <span>
          <el-icon><Grid /></el-icon> {{ teamDetail.data.name }}
          <el-tag type="primary" size="small">{{ teamDetail.data.type }}</el-tag>
          <el-tag type="success" size="small">{{ teamDetail.data.status }}</el-tag>
          <el-tag v-if="teamDetail.data.expiring" type="danger" size="small">{{ teamDetail.data.days_left }}天后到期</el-tag>
        </span>
      </template>
      <p style="color: #909399; font-size: 13px;">
        负责人：{{ teamDetail.data.leader_name || '—' }} · 在队{{ activeMembers.length }}人 · 历史成员{{ leftMembers.length }}人{{ teamDetail.data.purpose ? ' · 目标：' + teamDetail.data.purpose : '' }}
      </p>
      <el-table :data="activeMembers" stripe size="small">
        <el-table-column prop="emp_id" label="工号" width="90" />
        <el-table-column label="姓名" width="100"><template #default="{ row }"><strong>{{ row.user_name }}</strong></template></el-table-column>
        <el-table-column prop="dept" label="所属部门" width="110" />
        <el-table-column label="团队角色" width="100">
          <template #default="{ row }"><el-tag :type="row.role_in_team === '负责人' ? 'primary' : 'success'" size="small">{{ row.role_in_team }}</el-tag></template>
        </el-table-column>
        <el-table-column label="入队时间" width="110"><template #default="{ row }">{{ String(row.joined_at || '').substring(0, 10) }}</template></el-table-column>
        <el-table-column label="操作" width="70" align="center">
          <template #default="{ row }">
            <el-button v-if="canOperateTeam" size="small" @click="removeTeamMember(row)" title="移出团队"><el-icon><CloseBold /></el-icon></el-button>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <template #empty><span style="color: #909399;">暂无在队成员</span></template>
      </el-table>
      <el-collapse v-if="leftMembers.length" style="margin-top: 12px;">
        <el-collapse-item :title="`历史离队成员（${leftMembers.length}）`">
          <div style="font-size: 12px; color: #909399; padding: 8px 0;">
            {{ leftMembers.map(m => `${m.user_name}（${m.dept}，${String(m.left_at).substring(0, 10)}离队）`).join('；') }}
          </div>
        </el-collapse-item>
      </el-collapse>
      <div v-if="canAddTeamMemberHere" style="display: flex; gap: 8px; margin-top: 16px; align-items: center;">
        <el-select v-model="teamDetail.addEmp" placeholder="选择在职员工（可跨部门抽调）" style="flex: 1;">
          <el-option v-for="e in teamDetail.candidates" :key="e.emp_id" :label="`${e.name}（${e.emp_id} · ${e.dept}）`" :value="e.emp_id" />
        </el-select>
        <el-input v-model="teamDetail.addRole" placeholder="团队角色" style="width: 120px;" />
        <el-button type="primary" @click="addTeamMember"><el-icon><Plus /></el-icon> 添加</el-button>
      </div>
      <template #footer><el-button @click="teamDetail.visible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  UserFilled, CircleCheck, Clock, Star, Plus, Grid, VideoPlay, VideoPause, WarningFilled,
  Edit, CircleClose, Stamp, Check, Close, CloseBold
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const user = computed(() => auth.user || {});
const loading = ref(false);

const employees = ref([]);
const teams = ref([]);
const teamChanges = ref([]);
const flatDepts = ref([]);

/* ===== 权限（与参考项目 rbac.js 一致） ===== */
// canAddTeamMember
const canAddMember = computed(() => {
  const u = user.value;
  if (['超级管理员', '总经理'].includes(u.role)) return true;
  if (['副总', '销售总监', '区域经理'].includes(u.role)) return false;
  if (u.role === '部门经理' && ['技术部', '市场部'].includes(u.dept)) return false;
  if (u.role === '部门经理') return true;
  return u.role === '普通员工' && u.dept === '行政部';
});
// editDept（跨部门团队管理复用此权限）
const canEdit = computed(() => {
  const u = user.value;
  if (['超级管理员', '总经理', '人事专员'].includes(u.role)) return true;
  return u.dept === '行政部' && ['部门经理', '普通员工'].includes(u.role);
});
const isGmOrAdmin = computed(() => ['总经理', '超级管理员'].includes(user.value.role));

/* ===== 计算属性 ===== */
const teamMembers = computed(() => employees.value.filter(e => e.dept === user.value.dept));
const deptHead = computed(() => teamMembers.value.find(e => ['部门经理', '总经理', '副总', '销售总监', '超级管理员'].includes(e.role)));
const expiringCount = computed(() => teams.value.filter(t => t.expiring).length);
const activeEmps = computed(() => employees.value.filter(e => e.status !== '离职'));

function typeColor(t) { return t === '临时' ? '#ef4444' : t === '项目' ? '#8b5cf6' : '#2563eb'; }
function statusColor(s) { return s === '运作中' ? '#10b981' : s === '已暂停' ? '#f59e0b' : s === '已解散' ? '#9ca3af' : '#3b82f6'; }

/* ===== 统计卡片（还原 renderStatCard） ===== */
const StatCard = (props, { slots }) => h('div', { class: 'stat-card', style: { borderTop: `3px solid ${props.color}` } }, [
  h('div', { style: 'display:flex;align-items:center;justify-content:space-between;' }, [
    h('div', [
      h('p', { style: 'color:#909399;font-size:12px;margin:0 0 6px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;' }, props.label),
      h('p', { style: `font-size:26px;font-weight:700;margin:0;color:${props.color};` }, String(props.value))
    ]),
    h('div', { style: `width:48px;height:48px;border-radius:14px;background:${props.color}15;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px;color:${props.color};` }, slots.default && slots.default())
  ])
]);
StatCard.props = { label: String, value: [String, Number], color: String };

/* ===== 数据加载 ===== */
async function load() {
  loading.value = true;
  try {
    const [empResp, teamResp, teamChgResp, flatResp] = await Promise.all([
      request.get('/hr/employees'),
      request.get('/teams').catch(() => ({ code: 500 })),
      request.get('/teams/changes').catch(() => ({ code: 500 })),
      request.get('/departments/flat').catch(() => ({ code: 500 }))
    ]);
    if (empResp.code !== 200) { ElMessage.error(empResp.msg || '加载失败'); return; }
    employees.value = empResp.data || [];
    teams.value = teamResp.code === 200 ? (teamResp.data || []) : [];
    teamChanges.value = teamChgResp.code === 200 ? (teamChgResp.data || []) : [];
    flatDepts.value = flatResp.code === 200 ? (flatResp.data || []) : [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

/* ===== 添加团队成员（本部门） ===== */
const today = new Date().toISOString().slice(0, 10);
const memberForm = reactive({ visible: false, saving: false, data: {} });
function openAddMember() {
  memberForm.data = {
    emp_id: '', name: '', dept: user.value.dept || '', role: '普通员工',
    level: 'P3', education: '本科', password: 'zm2026', join_date: today
  };
  memberForm.visible = true;
}
async function submitAddMember() {
  const data = { ...memberForm.data, status: '试用期' };
  if (!data.emp_id || !data.name) { ElMessage.warning('请填写工号和姓名'); return; }
  memberForm.saving = true;
  try {
    const res = await request.post('/users', data);
    if (res.code === 200) {
      ElMessage.success(res.msg || '成员添加成功');
      memberForm.visible = false;
      load();
    } else ElMessage.error(res.msg || '添加失败');
  } finally {
    memberForm.saving = false;
  }
}

/* ===== 跨部门团队 ===== */
const teamForm = reactive({ visible: false, saving: false, id: 0, data: {} });

async function openTeamForm(id) {
  let team = null;
  if (id) {
    const r = await request.get('/teams/' + id);
    if (r.code !== 200) { ElMessage.error(r.msg || '团队不存在'); return; }
    team = r.data;
  }
  teamForm.id = id || 0;
  teamForm.data = team ? {
    name: team.name, type: team.type, dept_id: team.dept_id || 0,
    leader_emp: team.leader_emp || '', expire_date: team.expire_date || '',
    start_date: team.start_date || '', purpose: team.purpose || ''
  } : {
    name: '', type: '常设', dept_id: 0, leader_emp: '', expire_date: '', start_date: today, purpose: ''
  };
  teamForm.visible = true;
}

async function submitTeamForm() {
  const dept = flatDepts.value.find(d => d.id === teamForm.data.dept_id);
  const data = {
    name: (teamForm.data.name || '').trim(),
    type: teamForm.data.type,
    dept_id: teamForm.data.dept_id || 0,
    dept_name: dept ? dept.name : '',
    leader_emp: teamForm.data.leader_emp || '',
    expire_date: teamForm.data.type === '临时' ? (teamForm.data.expire_date || '') : '',
    start_date: teamForm.data.start_date || '',
    purpose: (teamForm.data.purpose || '').trim()
  };
  if (!data.name) { ElMessage.warning('请填写团队名称'); return; }
  if (data.type === '临时' && !data.expire_date) { ElMessage.warning('临时团队必须设置到期日'); return; }
  teamForm.saving = true;
  try {
    const res = teamForm.id
      ? await request.put('/teams/' + teamForm.id, data)
      : await request.post('/teams', data);
    if (res.code === 200) {
      ElMessage.success(res.msg || '操作成功');
      teamForm.visible = false;
      load();
    } else ElMessage.error(res.msg || '操作失败');
  } finally {
    teamForm.saving = false;
  }
}

const teamDetail = reactive({ visible: false, data: {}, addEmp: '', addRole: '成员', candidates: [] });
const activeMembers = computed(() => (teamDetail.data.members || []).filter(m => !m.left_at));
const leftMembers = computed(() => (teamDetail.data.members || []).filter(m => m.left_at));
const canOperateTeam = computed(() => {
  const t = teamDetail.data;
  return t.status !== '已解散' && (canEdit.value || user.value.name === t.leader_name);
});
const canAddTeamMemberHere = computed(() => {
  const t = teamDetail.data;
  return t.status !== '已解散' && t.status !== '已暂停' && (canEdit.value || user.value.name === t.leader_name);
});

async function viewTeamDetail(id) {
  const r = await request.get('/teams/' + id);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  teamDetail.data = r.data || {};
  const active = (teamDetail.data.members || []).filter(m => !m.left_at);
  teamDetail.candidates = employees.value.filter(e => e.status !== '离职' && !active.some(m => m.emp_id === e.emp_id));
  teamDetail.addEmp = '';
  teamDetail.addRole = '成员';
  teamDetail.visible = true;
}

async function addTeamMember() {
  if (!teamDetail.addEmp) { ElMessage.warning('请选择员工'); return; }
  const res = await request.post(`/teams/${teamDetail.data.id}/members`, {
    emp_id: teamDetail.addEmp,
    role_in_team: (teamDetail.addRole || '').trim() || '成员'
  });
  if (res.code === 200) {
    ElMessage.success(res.msg || '已添加');
    viewTeamDetail(teamDetail.data.id);
    load();
  } else ElMessage.error(res.msg || '操作失败');
}

async function removeTeamMember(m) {
  try {
    await ElMessageBox.confirm(`确认将「${m.user_name}」移出团队？将记录离队时间。`, '提示', { type: 'warning' });
  } catch { return; }
  const res = await request.delete(`/teams/${teamDetail.data.id}/members/${m.id}`);
  if (res.code === 200) {
    ElMessage.success(res.msg || '已移除');
    viewTeamDetail(teamDetail.data.id);
    load();
  } else ElMessage.error(res.msg || '操作失败');
}

async function resumeTeam(id) {
  try {
    await ElMessageBox.confirm('确认恢复该团队运作？', '提示', { type: 'info' });
  } catch { return; }
  const res = await request.post(`/teams/${id}/resume`);
  if (res.code === 200) {
    ElMessage.success(res.msg || '已恢复');
    load();
  } else ElMessage.error(res.msg || '操作失败');
}

async function dissolveTeam(id) {
  try {
    await ElMessageBox.confirm('确认发起解散该团队？解散需审批：总经理/超管直达生效，其他管理层需总经理审批。解散后成员全部离队。', '提示', { type: 'warning' });
  } catch { return; }
  const res = await request.post(`/teams/${id}/dissolve`);
  if (res.code === 200) {
    ElMessage.success(res.msg || '操作成功');
    load();
  } else ElMessage.error(res.msg || '操作失败');
}

async function approveTeamChange(id) {
  try {
    await ElMessageBox.confirm('确认审批通过解散申请？团队将解散，成员全部离队。', '提示', { type: 'warning' });
  } catch { return; }
  const res = await request.post(`/teams/changes/${id}/approve`);
  if (res.code === 200) {
    ElMessage.success(res.msg || '已通过');
    load();
  } else ElMessage.error(res.msg || '操作失败');
}

async function rejectTeamChange(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('驳回意见（必填）：', '驳回', {
      inputValidator: (v) => (v && v.trim()) ? true : '驳回必须填写意见'
    });
    remark = r.value.trim();
  } catch { return; }
  const res = await request.post(`/teams/changes/${id}/reject`, { remark });
  if (res.code === 200) {
    ElMessage.success(res.msg || '已驳回');
    load();
  } else ElMessage.error(res.msg || '操作失败');
}
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
:deep(.stat-card) {
  position: relative;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.team-card {
  padding: 16px;
  border-radius: 12px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
}
</style>
