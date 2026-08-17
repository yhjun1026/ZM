<template>
  <div v-loading="loading">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <StatCard label="在职员工" :value="stats.total || 0" color="#10b981"><el-icon><UserFilled /></el-icon></StatCard>
      <StatCard label="试用期" :value="stats.trial || 0" color="#f59e0b"><el-icon><Clock /></el-icon></StatCard>
      <StatCard label="转正到期提醒" :value="reminders.length" color="#ef4444"><el-icon><Bell /></el-icon></StatCard>
      <StatCard label="请假" :value="stats.leave || 0" color="#8b5cf6"><el-icon><Calendar /></el-icon></StatCard>
      <StatCard label="待审批" :value="pendingApps.length" color="#f97316"><el-icon><Timer /></el-icon></StatCard>
    </div>

    <!-- 转正到期提醒 -->
    <el-card v-if="reminders.length > 0" style="margin-bottom: 24px; border-left: 4px solid #ef4444;">
      <template #header>
        <span style="font-weight: 600;"><el-icon style="color: #ef4444; margin-right: 8px;"><Bell /></el-icon>转正到期提醒（到期前10天）</span>
      </template>
      <el-table :data="reminders" stripe>
        <el-table-column prop="emp_id" label="工号" width="90" />
        <el-table-column label="姓名" width="100"><template #default="{ row }"><strong>{{ row.name }}</strong></template></el-table-column>
        <el-table-column prop="dept" label="部门" width="110" />
        <el-table-column prop="join_date" label="入职日期" width="110" />
        <el-table-column label="试用期" width="80"><template #default="{ row }">{{ row.probation_months || 3 }}个月</template></el-table-column>
        <el-table-column prop="regular_date" label="转正日期" width="110" />
        <el-table-column label="剩余天数" min-width="110">
          <template #default="{ row }">
            <el-tag v-if="row.overdue" type="danger" size="small">已逾期{{ Math.abs(row.days_left) }}天</el-tag>
            <el-tag v-else type="warning" size="small">{{ row.days_left }}天</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 人事审批待办 -->
    <el-card v-if="pendingApps.length > 0" style="margin-bottom: 24px; border-left: 4px solid #f59e0b;">
      <template #header>
        <span style="font-weight: 600;"><el-icon style="color: #f59e0b; margin-right: 8px;"><Timer /></el-icon>人事审批待办</span>
      </template>
      <el-table :data="pendingApps" stripe>
        <el-table-column label="操作类型" width="100"><template #default="{ row }"><el-tag type="primary" size="small">{{ row.action_type }}</el-tag></template></el-table-column>
        <el-table-column prop="emp_name" label="员工姓名" width="90" />
        <el-table-column prop="dept" label="部门" width="110" />
        <el-table-column prop="role" label="角色" width="90" />
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column label="状态" width="80"><template #default="{ row }"><el-tag type="warning" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="详情" width="60" align="center">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="viewHrDetail(row.id)" title="详情"><el-icon><Document /></el-icon></el-button></template>
        </el-table-column>
        <el-table-column label="流程" width="60" align="center">
          <template #default="{ row }"><el-button size="small" @click="showHrWorkflow(row)" title="查看流程"><el-icon><Share /></el-icon></el-button></template>
        </el-table-column>
        <el-table-column label="打印" width="60" align="center">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="printHRApplication(row.id)" title="打印"><el-icon><Printer /></el-icon></el-button></template>
        </el-table-column>
        <el-table-column v-if="canApprove" label="操作" width="110" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="approveHrApplication(row.id)" title="通过"><el-icon><Check /></el-icon></el-button>
            <el-button size="small" @click="rejectHrApplication(row.id)" title="驳回"><el-icon><Close /></el-icon></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 员工列表 -->
    <el-card style="margin-bottom: 24px;">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span style="font-weight: 600;">员工列表
            <span style="font-size: 12px; color: #909399; font-weight: normal;">转正日期=入职+试用期自动计算 · 调岗自动清空团队身份 · 离职自动冻结账号</span>
          </span>
          <div>
            <template v-if="canCreateApp">
              <el-button size="small" @click="exportHrRoster" title="导出人事台账CSV"><el-icon><Download /></el-icon> 台账导出</el-button>
              <el-button type="primary" size="small" @click="openAppForm"><el-icon><Plus /></el-icon> 人事审批申请</el-button>
            </template>
            <el-button v-else-if="canCreateEmployee" type="primary" size="small" @click="openAppForm"><el-icon><Plus /></el-icon> 添加员工</el-button>
          </div>
        </div>
      </template>
      <el-table :data="employees" stripe>
        <el-table-column prop="emp_id" label="工号" width="90" />
        <el-table-column prop="name" label="姓名" width="90" />
        <el-table-column prop="dept" label="部门" width="110" />
        <el-table-column prop="role" label="角色" width="90" />
        <el-table-column label="用工类型" width="90"><template #default="{ row }">{{ row.employment_type || '正式' }}</template></el-table-column>
        <el-table-column prop="level" label="职级" width="70" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === '在职' ? 'success' : row.status === '试用期' ? 'warning' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="join_date" label="入职日期" width="105" />
        <el-table-column label="试用期" width="80"><template #default="{ row }">{{ row.probation_months || 3 }}个月</template></el-table-column>
        <el-table-column label="转正日期" width="105"><template #default="{ row }">{{ row.regular_date || '—' }}</template></el-table-column>
        <el-table-column label="档案" width="70" align="center">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="viewEmpProfile(row.emp_id)" title="员工档案"><el-icon><FolderOpened /></el-icon></el-button></template>
        </el-table-column>
        <template #empty><span style="color: #909399;">暂无员工</span></template>
      </el-table>
    </el-card>

    <!-- 人事审批记录 -->
    <el-card v-if="executedApps.length > 0 || rejectedApps.length > 0">
      <template #header><span style="font-weight: 600;">人事审批记录</span></template>
      <el-table :data="executedApps.concat(rejectedApps)" stripe>
        <el-table-column label="操作类型" width="100"><template #default="{ row }"><el-tag type="primary" size="small">{{ row.action_type }}</el-tag></template></el-table-column>
        <el-table-column prop="emp_name" label="员工" width="90" />
        <el-table-column prop="dept" label="部门" width="110" />
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }"><el-tag :type="row.status === '已执行' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="详情" width="60" align="center">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="viewHrDetail(row.id)" title="详情"><el-icon><Document /></el-icon></el-button></template>
        </el-table-column>
        <el-table-column label="流程" width="60" align="center">
          <template #default="{ row }"><el-button size="small" @click="showHrWorkflow(row)" title="查看流程"><el-icon><Share /></el-icon></el-button></template>
        </el-table-column>
        <el-table-column label="打印" width="60" align="center">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="printHRApplication(row.id)" title="打印"><el-icon><Printer /></el-icon></el-button></template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 人事审批申请表单 -->
    <el-dialog v-model="appForm.visible" title="人事审批申请" width="560px">
      <el-form :model="appForm.data" label-width="100px">
        <el-form-item label="操作类型" required>
          <el-select v-model="appForm.data.action_type" style="width: 100%;">
            <el-option label="入职登记" value="入职登记" />
            <el-option label="员工转正" value="员工转正" />
            <el-option label="岗位调动" value="岗位调动" />
            <el-option label="离职申请" value="离职申请" />
            <el-option label="薪资调整" value="薪资调整" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="工号"><el-input v-model="appForm.data.emp_id" :placeholder="empIdPlaceholder" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="姓名" required><el-input v-model="appForm.data.emp_name" placeholder="姓名" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="部门">
              <el-select v-model="appForm.data.dept" style="width: 100%;">
                <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色">
              <el-select v-model="appForm.data.role" style="width: 100%;">
                <el-option label="普通员工" value="普通员工" />
                <el-option label="部门经理" value="部门经理" />
                <el-option label="区域经理" value="区域经理" />
                <el-option label="人事专员" value="人事专员" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="职级">
              <el-select v-model="appForm.data.level" style="width: 100%;">
                <el-option v-for="l in ['P1','P2','P3','P4','P5','M1','M2','M3']" :key="l" :label="l" :value="l" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="学历">
              <el-select v-model="appForm.data.education" style="width: 100%;">
                <el-option v-for="e in ['大专','本科','硕士','博士']" :key="e" :label="e" :value="e" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="密码"><el-input v-model="appForm.data.password" type="password" show-password /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="入职日期"><el-date-picker v-model="appForm.data.join_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="试用期(月)">
              <el-select v-model="appForm.data.probation_months" style="width: 100%;">
                <el-option v-for="m in [1, 2, 3, 6]" :key="m" :label="m + ' 个月'" :value="m" />
              </el-select>
              <div style="font-size: 12px; color: #909399; margin-top: -12px; margin-bottom: 8px;">转正日期=入职+试用期自动计算</div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="用工类型">
              <el-select v-model="appForm.data.employment_type" style="width: 100%;">
                <el-option v-for="t in ['正式','试用','实习','外包','劳务']" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="appForm.data.remark" type="textarea" :rows="2" placeholder="备注说明..." />
        </el-form-item>
        <div style="padding: 12px; background: #eff6ff; border-radius: 8px; border: 1px solid #dbeafe;">
          <el-icon style="color: #2563eb;"><InfoFilled /></el-icon>
          <span style="font-size: 13px; color: #1e40af;"> 审批流程：行政部录入 → 行政部负责人审批 → 总经理审批 → 执行</span>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="appForm.visible = false">取消</el-button>
        <el-button type="primary" :loading="appForm.saving" @click="submitHrApplication">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 员工档案 -->
    <el-dialog v-model="profile.visible" :title="`员工档案 — ${profile.data.name || ''}（${profile.data.emp_id || ''}）`" width="680px">
      <div class="profile-grid">
        <div class="profile-cell"><div class="cell-label">部门/角色</div><strong>{{ profile.data.dept }} · {{ profile.data.role }}</strong></div>
        <div class="profile-cell"><div class="cell-label">用工类型</div><strong>{{ profile.data.employment_type || '正式' }}</strong></div>
        <div class="profile-cell"><div class="cell-label">状态</div><strong>{{ profile.data.status }}</strong></div>
        <div class="profile-cell"><div class="cell-label">入职/转正</div><strong>{{ profile.data.join_date }} → {{ profile.data.regular_date || '—' }}</strong></div>
      </div>
      <h4 style="margin: 12px 0 8px; font-size: 14px;">团队身份（在队{{ activeTeams.length }}个）</h4>
      <el-table v-if="activeTeams.length" :data="activeTeams" size="small" stripe>
        <el-table-column label="团队" min-width="140"><template #default="{ row }"><strong>{{ row.team_name || '已删除团队' }}</strong></template></el-table-column>
        <el-table-column prop="team_type" label="类型" width="80" />
        <el-table-column label="团队角色" width="100"><template #default="{ row }"><el-tag type="primary" size="small">{{ row.role_in_team }}</el-tag></template></el-table-column>
        <el-table-column label="入队时间" width="110"><template #default="{ row }">{{ String(row.joined_at || '').substring(0, 10) }}</template></el-table-column>
      </el-table>
      <p v-else style="color: #909399; font-size: 13px;">暂无在队团队</p>
      <el-collapse v-if="leftTeams.length" style="margin-top: 10px;">
        <el-collapse-item :title="`历史团队（${leftTeams.length}个）`">
          <div style="font-size: 12px; color: #909399;">
            {{ leftTeams.map(t => `${t.team_name || '已删除团队'}（${t.role_in_team}，${String(t.left_at).substring(0, 10)}离队）`).join('；') }}
          </div>
        </el-collapse-item>
      </el-collapse>
      <h4 style="margin: 16px 0 8px; font-size: 14px;">人事审批记录（近20条）</h4>
      <el-table v-if="(profile.data.applications || []).length" :data="profile.data.applications" size="small" stripe>
        <el-table-column label="类型" width="100"><template #default="{ row }"><el-tag type="primary" size="small">{{ row.action_type }}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === '已执行' ? 'success' : row.status === '已驳回' ? 'danger' : 'warning'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column label="时间" min-width="140"><template #default="{ row }">{{ String(row.created_at || '').substring(0, 16) }}</template></el-table-column>
      </el-table>
      <p v-else style="color: #909399; font-size: 13px;">暂无审批记录</p>
      <template #footer><el-button @click="profile.visible = false">关闭</el-button></template>
    </el-dialog>

    <!-- 审批流程 -->
    <el-dialog v-model="workflow.visible" :title="`审批流程 - ${workflow.data.action_type || ''}`" width="520px">
      <div class="info-item"><span class="info-label">申请人</span><span>{{ workflow.data.applicant }}</span></div>
      <div class="info-item"><span class="info-label">操作类型</span><span>{{ workflow.data.action_type }}</span></div>
      <div class="info-item"><span class="info-label">员工</span><span>{{ workflow.data.emp_name }} ({{ workflow.data.emp_id }})</span></div>
      <div class="info-item">
        <span class="info-label">状态</span>
        <el-tag :type="workflow.data.status === '已执行' ? 'success' : workflow.data.status === '已驳回' ? 'danger' : 'warning'" size="small">{{ workflow.data.status }}</el-tag>
      </div>
      <div style="margin-top: 16px;">
        <div v-for="(s, i) in (workflow.data.flow || [])" :key="i" class="flow-row" :style="i < (workflow.data.flow || []).length - 1 ? 'border-bottom: 1px solid #ebeef5;' : ''">
          <div class="flow-dot" :style="{ background: s.done ? '#10b981' : '#e5e7eb' }">
            <el-icon v-if="s.done"><Check /></el-icon>
            <el-icon v-else><Clock /></el-icon>
          </div>
          <div>
            <div style="font-weight: 600; font-size: 14px;">{{ s.step }}</div>
            <div style="font-size: 12px; color: #909399;">{{ s.user || '—' }} · {{ s.time || '—' }}</div>
            <div v-if="s.remark" style="font-size: 12px; color: #909399;">备注：{{ s.remark }}</div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" plain @click="printHrWorkflow"><el-icon><Printer /></el-icon> 打印</el-button>
        <el-button @click="workflow.visible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 人事审批详情 -->
    <el-dialog v-model="hrDetail.visible" title="人事审批详情" width="640px">
      <el-row :gutter="12" style="margin-bottom: 8px;">
        <el-col :span="12"><div class="info-item"><span class="info-label">操作类型</span><el-tag type="primary" size="small">{{ hrDetail.data.action_type }}</el-tag></div></el-col>
        <el-col :span="12"><div class="info-item"><span class="info-label">状态</span><el-tag :type="hrDetail.data.status === '已执行' ? 'success' : hrDetail.data.status === '已驳回' ? 'danger' : 'warning'" size="small">{{ hrDetail.data.status }}</el-tag></div></el-col>
        <el-col :span="12"><div class="info-item"><span class="info-label">员工姓名</span><span>{{ hrDetail.data.emp_name }}</span></div></el-col>
        <el-col :span="12"><div class="info-item"><span class="info-label">工号</span><span>{{ hrDetail.data.emp_id }}</span></div></el-col>
        <el-col :span="12"><div class="info-item"><span class="info-label">部门</span><span>{{ hrDetail.data.dept }}</span></div></el-col>
        <el-col :span="12"><div class="info-item"><span class="info-label">角色</span><span>{{ hrDetail.data.role }}</span></div></el-col>
        <el-col :span="12"><div class="info-item"><span class="info-label">申请人</span><span>{{ hrDetail.data.applicant }}</span></div></el-col>
        <el-col :span="12"><div class="info-item"><span class="info-label">申请日期</span><span>{{ String(hrDetail.data.created_at || '').substring(0, 10) }}</span></div></el-col>
      </el-row>
      <div v-if="hrDetail.data.remark" class="info-item" style="margin-bottom: 16px;"><span class="info-label">备注</span><span>{{ hrDetail.data.remark }}</span></div>
      <h4 style="margin: 16px 0 8px;">审批流程</h4>
      <div style="text-align: center; overflow-x: auto; padding: 8px 0;">
        <template v-if="hrDetailFlow.length">
          <template v-for="(f, i) in hrDetailFlow" :key="i">
            <span class="wf-step-sm" :class="f.done ? 'wf-done' : (i === 0 || hrDetailFlow.slice(0, i).every(s => s.done)) ? 'wf-current' : 'wf-pending'">
              <div class="wf-name">{{ f.step }}</div>
              <div style="font-size: 11px;">{{ f.user || '—' }}</div>
              <div class="wf-time">{{ f.time || '—' }}</div>
            </span>
            <span v-if="i < hrDetailFlow.length - 1" class="wf-arrow-sm">→</span>
          </template>
        </template>
        <span v-else style="color: #909399;">无流程数据</span>
      </div>
      <div style="margin-top: 20px; text-align: right;">
        <el-button size="small" @click="printHRApplication(hrDetail.data.id)"><el-icon><Printer /></el-icon> 打印</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { UserFilled, Clock, Bell, Calendar, Timer, Document, Share, Printer, Check, Close, Download, Plus, FolderOpened, InfoFilled } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const employees = ref([]);
const stats = ref({});
const applications = ref([]);
const reminders = ref([]);

const pendingApps = computed(() => applications.value.filter(a => a.status === '待审批'));
const executedApps = computed(() => applications.value.filter(a => a.status === '已执行'));
const rejectedApps = computed(() => applications.value.filter(a => a.status === '已驳回'));

const deptOptions = ['总经理办公室', '销售部', '市场部', '技术部', '财务部', '行政部'];

/* ===== 权限（与参考项目 rbac.js 一致） ===== */
// createHrApplication：超管/总经理，或行政部普通员工/部门经理
const canCreateApp = computed(() => {
  const u = auth.user || {};
  if (['超级管理员', '总经理'].includes(u.role)) return true;
  return u.dept === '行政部' && ['普通员工', '部门经理'].includes(u.role);
});
// approveHrApplication：超管/总经理/副总，或行政部部门经理
const canApprove = computed(() => {
  const u = auth.user || {};
  if (['超级管理员', '总经理', '副总'].includes(u.role)) return true;
  return u.role === '部门经理' && u.dept === '行政部';
});
// createEmployee：超管/总经理/人事专员；部门经理（市场部/技术部除外）；行政部普通员工
const canCreateEmployee = computed(() => {
  const u = auth.user || {};
  if (['超级管理员', '总经理', '人事专员'].includes(u.role)) return true;
  if (u.role === '部门经理' && !['市场部', '技术部'].includes(u.dept)) return true;
  return u.role === '普通员工' && u.dept === '行政部';
});

/* ===== 统计卡片（局部函数组件，还原 renderStatCard） ===== */
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
    const [empResp, statsResp, appResp, remResp] = await Promise.all([
      request.get('/hr/employees'),
      request.get('/hr/stats'),
      request.get('/hr/applications'),
      request.get('/hr/regular-reminders').catch(() => ({ code: 500 }))
    ]);
    if (empResp.code !== 200) { ElMessage.error(empResp.msg || '加载失败'); return; }
    employees.value = empResp.data || [];
    stats.value = statsResp.code === 200 ? (statsResp.data || {}) : {};
    applications.value = appResp.code === 200 ? (appResp.data || []) : [];
    reminders.value = remResp.code === 200 ? (remResp.data || []) : [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

/* ===== 人事审批申请 ===== */
const today = new Date().toISOString().slice(0, 10);
const appForm = reactive({
  visible: false,
  saving: false,
  data: {
    action_type: '入职登记', emp_id: '', emp_name: '', dept: '总经理办公室', role: '普通员工',
    level: 'P3', education: '本科', password: 'zm2026', join_date: today, remark: '',
    probation_months: 3, employment_type: '正式'
  }
});
// 入职登记填写新工号，其他操作输入已有工号（还原 toggleHrFields）
const empIdPlaceholder = computed(() => appForm.data.action_type === '入职登记' ? '如ZM030' : '输入员工工号');

function openAppForm() {
  appForm.data = {
    action_type: '入职登记', emp_id: '', emp_name: '', dept: '总经理办公室', role: '普通员工',
    level: 'P3', education: '本科', password: 'zm2026', join_date: today, remark: '',
    probation_months: 3, employment_type: '正式'
  };
  appForm.visible = true;
}

async function submitHrApplication() {
  if (!appForm.data.emp_name) { ElMessage.warning('请填写员工姓名'); return; }
  appForm.saving = true;
  try {
    const res = await request.post('/hr/applications', appForm.data);
    if (res.code === 200) {
      ElMessage.success(res.msg || '申请已提交，等待审批');
      appForm.visible = false;
      load();
    } else ElMessage.error(res.msg || '提交失败');
  } finally {
    appForm.saving = false;
  }
}

/* ===== 审批 / 驳回 ===== */
async function approveHrApplication(id) {
  const res = await request.post(`/hr/applications/${id}/approve`, { remark: '' });
  if (res.code === 200) {
    ElMessage.success(res.msg || '审批通过');
    load();
  } else ElMessage.error(res.msg || '审批失败');
}

async function rejectHrApplication(id) {
  try {
    await ElMessageBox.confirm('确定驳回此申请？', '确认驳回', { type: 'warning' });
  } catch { return; }
  const res = await request.post(`/hr/applications/${id}/reject`, { remark: '驳回' });
  if (res.code === 200) {
    ElMessage.success(res.msg || '申请已驳回');
    load();
  } else ElMessage.error(res.msg || '操作失败');
}

/* ===== 员工档案 ===== */
const profile = reactive({ visible: false, data: {} });
const activeTeams = computed(() => (profile.data.teams || []).filter(t => !t.left_at));
const leftTeams = computed(() => (profile.data.teams || []).filter(t => t.left_at));

async function viewEmpProfile(empId) {
  const res = await request.get('/hr/profile/' + encodeURIComponent(empId));
  if (res.code !== 200) { ElMessage.error(res.msg || '加载失败'); return; }
  profile.data = res.data || {};
  profile.visible = true;
}

/* ===== 流程查看 ===== */
const workflow = reactive({ visible: false, data: {} });
function showHrWorkflow(row) {
  workflow.data = row;
  workflow.visible = true;
}

/* ===== 详情 ===== */
const hrDetail = reactive({ visible: false, data: {} });
const hrDetailFlow = computed(() => hrDetail.data.flow || hrDetail.data.approval_flow || []);
function viewHrDetail(id) {
  const a = applications.value.find(x => x.id === id);
  if (!a) { ElMessage.error('记录不存在'); return; }
  hrDetail.data = a;
  hrDetail.visible = true;
}

/* ===== 台账导出（CSV BOM） ===== */
async function exportHrRoster() {
  try {
    const token = localStorage.getItem('zm_token') || '';
    const resp = await fetch('/api/hr/export', { headers: { Authorization: 'Bearer ' + token } });
    if (!resp.ok) { ElMessage.error('导出失败（' + resp.status + '）'); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hr_roster_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('人事台账已导出');
  } catch (e) {
    ElMessage.error('导出失败：' + e.message);
  }
}

/* ===== 打印（1:1 还原参考项目） ===== */
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function printHRApplication(id) {
  const a = applications.value.find(x => x.id === id);
  if (!a) { ElMessage.error('记录不存在'); return; }
  const flow = a.flow || a.approval_flow || [];
  const flowHTML = flow.map((f, i) => {
    const cls = f.done ? 'wf-done' : 'wf-pending';
    return `<span class="wf-step ${cls}"><div class="wf-name">${escHtml(f.step)}</div><div style="font-size:11px;">${escHtml(f.user || '—')}</div><div class="wf-time">${escHtml(f.time || '—')}</div></span>${i < flow.length - 1 ? '<span class="wf-arrow">→</span>' : ''}`;
  }).join('');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>人事审批单</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:750px;margin:0 auto;}h2{text-align:center;margin-bottom:24px;border-bottom:2px solid #2563eb;padding-bottom:12px;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px;}th{background:#f5f5f5;width:15%;}.wf-step{display:inline-block;text-align:center;padding:8px 12px;border:1px solid #ddd;border-radius:6px;margin:4px;font-size:12px;min-width:80px;}.wf-arrow{display:inline-block;color:#999;margin:0 4px;}.wf-done{background:#d1fae5;border-color:#10b981;}.wf-pending{background:#f9fafb;border-color:#d1d5db;}.wf-name{font-weight:bold;margin-bottom:4px;}.wf-time{color:#666;font-size:11px;}h4{font-size:16px;margin:20px 0 10px;}.footer{margin-top:40px;text-align:center;color:#999;font-size:12px;}</style></head><body><h2>人事审批单</h2><table><tr><th>操作类型</th><td>${escHtml(a.action_type)}</td><th>状态</th><td>${escHtml(a.status)}</td></tr><tr><th>员工姓名</th><td>${escHtml(a.emp_name)}</td><th>工号</th><td>${escHtml(a.emp_id)}</td></tr><tr><th>部门</th><td>${escHtml(a.dept)}</td><th>角色</th><td>${escHtml(a.role)}</td></tr><tr><th>申请人</th><td>${escHtml(a.applicant)}</td><th>申请日期</th><td>${escHtml((a.created_at || '').substring(0, 10))}</td></tr>${a.remark ? `<tr><th>备注</th><td colspan="3">${escHtml(a.remark)}</td></tr>` : ''}</table><h4>审批流程</h4><div style="text-align:center;">${flowHTML}</div><div class="footer">四川卓盟科技有限公司 · 打印时间：${new Date().toLocaleString('zh-CN')}</div></body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

function printHrWorkflow() {
  const a = workflow.data;
  if (!a || !a.id) return;
  const flow = a.flow || [];
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>人事审批 - ${escHtml(a.action_type)}</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:40px;color:#333;}h1{text-align:center;color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:10px;}table{width:100%;border-collapse:collapse;margin:20px 0;}td{padding:8px 12px;border:1px solid #ddd;}.label{background:#f5f5f5;font-weight:bold;width:120px;}.step{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #eee;}</style></head><body>
    <h1>卓盟智办公平台 - 人事审批单</h1>
    <table>
      <tr><td class="label">操作类型</td><td>${escHtml(a.action_type)}</td><td class="label">状态</td><td>${escHtml(a.status)}</td></tr>
      <tr><td class="label">员工姓名</td><td>${escHtml(a.emp_name)}</td><td class="label">工号</td><td>${escHtml(a.emp_id)}</td></tr>
      <tr><td class="label">部门</td><td>${escHtml(a.dept)}</td><td class="label">角色</td><td>${escHtml(a.role)}</td></tr>
      <tr><td class="label">申请人</td><td>${escHtml(a.applicant)}</td><td class="label">申请日期</td><td>${escHtml((a.created_at || '').substring(0, 10))}</td></tr>
    </table>
    <h3>审批流程</h3>
    ${flow.map(s => `<div class="step"><div style="width:28px;height:28px;border-radius:50%;background:${s.done ? '#10b981' : '#e5e7eb'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;">${s.done ? '✓' : '○'}</div><div><strong>${escHtml(s.step)}</strong> — ${escHtml(s.user || '待处理')} (${escHtml(s.time || '—')})</div></div>`).join('')}
    <p style="text-align:right;margin-top:40px;color:#999;">打印时间：${new Date().toLocaleString('zh-CN')}</p>
  </body></html>`);
  w.document.close();
  w.print();
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
.info-item {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  font-size: 14px;
  align-items: center;
}
.info-label {
  color: #909399;
  min-width: 64px;
}
.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.profile-cell {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 8px;
}
.cell-label {
  color: #909399;
  font-size: 11px;
  margin-bottom: 4px;
}
.flow-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.flow-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  flex-shrink: 0;
}
.wf-step-sm {
  display: inline-block;
  text-align: center;
  padding: 8px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  margin: 4px;
  font-size: 12px;
  min-width: 80px;
  vertical-align: middle;
}
.wf-step-sm.wf-done { background: #d1fae5; border-color: #10b981; }
.wf-step-sm.wf-current { background: #dbeafe; border-color: #2563eb; }
.wf-step-sm.wf-pending { background: #f9fafb; border-color: #d1d5db; }
.wf-step-sm .wf-name { font-weight: bold; margin-bottom: 4px; }
.wf-step-sm .wf-time { color: #909399; font-size: 11px; }
.wf-arrow-sm { display: inline-block; color: #c0c4cc; margin: 0 4px; }
</style>
