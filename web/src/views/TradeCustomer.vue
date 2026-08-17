<template>
  <div class="trade-customer">
    <div class="page-header">
      <h2>客户管理</h2>
      <p>客户台账 · 准入审批 · SABC分级 · 风险预警</p>
    </div>

    <!-- KPI 卡片 -->
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

    <el-tabs v-model="tab" @tab-change="loadTab">
      <el-tab-pane label="客户台账" name="ledger" />
      <el-tab-pane label="审批中心" name="applies" />
      <el-tab-pane label="风险预警" name="alerts" />
    </el-tabs>

    <div v-loading="tabLoading">
      <!-- 客户台账 -->
      <template v-if="tab === 'ledger'">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="filter.keyword" placeholder="搜索名称/联系人/电话/信用代码" style="width:220px;" clearable @change="loadTab" />
            <el-select v-model="filter.status" placeholder="全部状态" style="width:120px;" @change="loadTab">
              <el-option label="全部状态" value="" />
              <el-option v-for="s in ['意向', '合作中', '已停用', '已注销']" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select v-model="filter.level" placeholder="全部等级" style="width:120px;" @change="loadTab">
              <el-option label="全部等级" value="" />
              <el-option v-for="s in ['S', 'A', 'B', 'C']" :key="s" :label="s + '级'" :value="s" />
            </el-select>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-button type="primary" @click="openApplyForm('cust_new')"><el-icon><Plus /></el-icon> 新增建档申请</el-button>
            <el-button v-if="isBizCenter" @click="onImportLegacy"><el-icon><Download /></el-icon> 存量一键备案</el-button>
            <el-button @click="onExportCsv"><el-icon><Document /></el-icon> 导出CSV</el-button>
          </div>
        </div>
        <el-table :data="custRows" stripe size="small">
          <el-table-column prop="id" label="编号" width="130" show-overflow-tooltip />
          <el-table-column label="客户名称" min-width="170">
            <template #default="{ row }">
              <b>{{ row.name }}</b>
              <div v-if="row.credit_code" class="muted" style="font-size:11px;">{{ row.credit_code }}</div>
            </template>
          </el-table-column>
          <el-table-column label="联系人" width="110">
            <template #default="{ row }">
              {{ row.contact || '—' }}
              <div class="muted" style="font-size:11px;">{{ row.phone || '' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="行业/来源" width="130">
            <template #default="{ row }">{{ row.industry || '—' }} / {{ row.source || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="ptType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="等级" width="70"><template #default="{ row }"><b :style="{ color: levelColor(row.level) }">{{ row.level || '—' }}</b></template></el-table-column>
          <el-table-column label="销售订单" width="120">
            <template #default="{ row }">
              ¥{{ money(row.so_amount) }}
              <div class="muted" style="font-size:11px;">{{ row.so_count || 0 }} 单</div>
            </template>
          </el-table-column>
          <el-table-column label="最近跟进" width="100"><template #default="{ row }">{{ (row.last_follow_at || '').slice(0, 10) || '—' }}</template></el-table-column>
          <el-table-column label="归属" width="110">
            <template #default="{ row }">
              {{ row.owner_name || '—' }}
              <div class="muted" style="font-size:11px;">{{ row.owner_dept || '' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="250" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row.id)">详情</el-button>
              <el-button size="small" type="primary" @click="openFollowup(row.id)">跟进</el-button>
              <template v-if="!['已停用', '已注销'].includes(row.status)">
                <el-button size="small" @click="openApplyForm('cust_change', row.id, row.name)">变更</el-button>
                <el-button size="small" @click="openApplyForm('cust_level', row.id, row.name)">评级</el-button>
                <el-button size="small" @click="openApplyForm('cust_disable', row.id, row.name)">停用</el-button>
              </template>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无客户，点击"新增建档申请"或从销售订单自动捕捉建档</span></template>
        </el-table>
        <p class="muted" style="margin-top:8px;font-size:12px;"><el-icon><MagicStick /></el-icon> 与销售管理互通: 创建销售订单时未建档客户自动捕捉建档，订单生效后AI按净合作额自动建议S/A/B/C等级</p>
      </template>

      <!-- 审批中心 -->
      <template v-else-if="tab === 'applies'">
        <p class="muted" style="margin-bottom:12px;">新增（大额≥50万或S/A级加管理层终审）/ 变更 / 评级（管理层终审）/ 停用注销（财务账款核对），审批通过自动生效并归档</p>
        <el-table :data="applyRows" stripe size="small">
          <el-table-column prop="id" label="工单号" width="150" show-overflow-tooltip />
          <el-table-column label="业务" width="100"><template #default="{ row }">{{ PT_BIZ[row.biz_type] || row.biz_type }}</template></el-table-column>
          <el-table-column label="对象" min-width="140" show-overflow-tooltip><template #default="{ row }">{{ row.target_name || '—' }}</template></el-table-column>
          <el-table-column label="申请人" width="110">
            <template #default="{ row }">
              {{ row.applicant_name }}
              <div class="muted" style="font-size:11px;">{{ row.applicant_dept || '' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="当前步骤" width="120">
            <template #default="{ row }">
              <b v-if="row.status === '审批中'" style="color:#2563eb;">{{ currentStep(row) }}</b>
              <span v-else>{{ currentStep(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="ptType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="190" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === '审批中'">
                <el-button size="small" type="primary" @click="onApprove(row)">审批</el-button>
                <el-button size="small" @click="onReject(row)">驳回</el-button>
              </template>
              <el-button size="small" @click="openApplyDetail(row)">详情</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无审批工单</span></template>
        </el-table>
      </template>

      <!-- 风险预警 -->
      <template v-else-if="tab === 'alerts'">
        <el-table :data="alertRows" stripe size="small">
          <el-table-column label="预警类型" width="110">
            <template #default="{ row }"><b :style="{ color: alertColor(row.alert_type) }">{{ row.alert_type }}</b></template>
          </el-table-column>
          <el-table-column label="级别" width="80">
            <template #default="{ row }"><el-tag :type="row.level === '高' ? 'danger' : 'warning'" size="small">{{ row.level }}</el-tag></template>
          </el-table-column>
          <el-table-column label="预警对象" min-width="140">
            <template #default="{ row }">
              {{ row.target_name }}
              <div class="muted" style="font-size:11px;">{{ row.target_id }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="msg" label="预警内容" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="ptType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="时间" width="140"><template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template></el-table-column>
          <template #empty><span class="muted">暂无风险预警，AI扫描正常</span></template>
        </el-table>
        <p class="muted" style="margin-top:8px;font-size:12px;"><el-icon><MagicStick /></el-icon> AI自动扫描: 资质到期(≤30天) / 跟进超期(≥30天) / 年审到期 / 评级过低，每次进入页面自动重扫</p>
      </template>
    </div>

    <!-- 审批申请表单 -->
    <el-dialog v-model="applyDlg.visible" :title="(PT_BIZ[applyDlg.bizType] || '') + '申请'" width="640px">
      <div v-if="applyDlg.bizType === 'cust_new'">
        <el-row :gutter="14">
          <el-col :span="12"><el-form-item label="客户名称" required><el-input v-model="applyDlg.form.name" placeholder="AI将自动查重" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="统一社会信用代码"><el-input v-model="applyDlg.form.credit_code" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系人"><el-input v-model="applyDlg.form.contact" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="联系电话"><el-input v-model="applyDlg.form.phone" placeholder="11位手机号" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="邮箱"><el-input v-model="applyDlg.form.email" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="行业"><el-input v-model="applyDlg.form.industry" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="客户来源">
            <el-select v-model="applyDlg.form.source" style="width:100%;">
              <el-option v-for="s in ['陌拜', '转介绍', '展会', '官网', '招标', '其他']" :key="s" :label="s" :value="s" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="预计合作额(元)"><el-input-number v-model="applyDlg.form.expected_amount" :min="0" style="width:100%;" placeholder="≥50万自动加管理层终审" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="资质到期日"><el-date-picker v-model="applyDlg.form.license_expiry" type="date" value-format="YYYY-MM-DD" style="width:100%;" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="地址"><el-input v-model="applyDlg.form.address" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="applyDlg.form.remark" /></el-form-item>
      </div>
      <div v-else-if="applyDlg.bizType === 'cust_change'">
        <p class="muted" style="margin-bottom:10px;">变更对象: <b>{{ applyDlg.targetName }}</b>（仅需填写要变更的项，空白项保持不变）</p>
        <el-row :gutter="14">
          <el-col :span="12"><el-form-item label="新联系人"><el-input v-model="applyDlg.form.contact" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="新联系电话"><el-input v-model="applyDlg.form.phone" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="新地址"><el-input v-model="applyDlg.form.address" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="新开户行"><el-input v-model="applyDlg.form.bank" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="新银行账号"><el-input v-model="applyDlg.form.account" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="资质到期日"><el-date-picker v-model="applyDlg.form.license_expiry" type="date" value-format="YYYY-MM-DD" style="width:100%;" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="变更原因说明" required><el-input v-model="applyDlg.reason" /></el-form-item>
      </div>
      <div v-else-if="applyDlg.bizType === 'cust_level'">
        <p class="muted" style="margin-bottom:10px;">评级对象: <b>{{ applyDlg.targetName }}</b>（等级调整须管理层终审）</p>
        <el-form-item label="目标等级" required>
          <el-select v-model="applyDlg.form.level" style="width:100%;">
            <el-option label="S级（战略客户）" value="S" />
            <el-option label="A级（重点客户）" value="A" />
            <el-option label="B级（普通客户）" value="B" />
            <el-option label="C级（一般客户）" value="C" />
          </el-select>
        </el-form-item>
        <el-form-item label="评级理由" required><el-input v-model="applyDlg.reason" /></el-form-item>
      </div>
      <div v-else-if="applyDlg.bizType === 'cust_disable'">
        <p class="muted" style="margin-bottom:10px;">处理对象: <b>{{ applyDlg.targetName }}</b>（流程含财务账款核对节点）</p>
        <el-form-item label="处理方式" required>
          <el-select v-model="applyDlg.form.disable_type" style="width:100%;">
            <el-option label="停用（可恢复）" value="停用" />
            <el-option label="注销（不可恢复）" value="注销" />
          </el-select>
        </el-form-item>
        <el-form-item label="停用/注销原因" required><el-input v-model="applyDlg.reason" /></el-form-item>
      </div>
      <template #footer>
        <el-button @click="applyDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="applyDlg.saving" @click="submitApply">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 工单详情 -->
    <el-dialog v-model="applyDetail.visible" :title="(applyDetail.data.id || '') + ' · ' + (PT_BIZ[applyDetail.data.biz_type] || applyDetail.data.biz_type || '')" width="680px">
      <template v-if="applyDetail.data.id">
        <div style="margin:4px 0 12px;">
          <b>申请对象:</b> {{ applyDetail.data.target_name || '—' }} &nbsp;
          <b>申请人:</b> {{ applyDetail.data.applicant_name }}（{{ applyDetail.data.applicant_dept || '' }}） &nbsp;
          <b>状态:</b> <el-tag :type="ptType(applyDetail.data.status)" size="small">{{ applyDetail.data.status }}</el-tag>
        </div>
        <div v-if="applyDetail.data.reason" style="margin-bottom:8px;"><b>申请说明:</b> {{ applyDetail.data.reason }}</div>
        <el-table :data="formRows" stripe size="small" border>
          <el-table-column prop="label" label="表单项" width="160" />
          <el-table-column prop="value" label="内容" />
          <template #empty><span class="muted">无表单数据</span></template>
        </el-table>
        <flow-steps :steps="applyDetail.data.steps || []" />
        <div style="text-align:right;margin-top:16px;">
          <template v-if="applyDetail.data.status === '审批中'">
            <el-button type="primary" @click="applyDetail.visible = false; onApprove(applyDetail.data)">审批通过</el-button>
            <el-button @click="applyDetail.visible = false; onReject(applyDetail.data)">驳回</el-button>
          </template>
          <el-button @click="applyDetail.visible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 客户360°详情 -->
    <el-dialog v-model="detailDlg.visible" :title="(detail.data.name || '') + ' 客户360°详情'" width="780px" top="5vh">
      <div v-loading="detailDlg.loading">
        <template v-if="detail.data.id">
          <div class="info-grid">
            <div v-for="it in detailInfo" :key="it[0]"><span class="muted">{{ it[0] }}:</span> <b>{{ it[1] }}</b></div>
          </div>
          <div class="ai-panel">
            <b><el-icon><MagicStick /></el-icon> AI评级引擎</b>（抓取销售管理订单）:
            净合作额 <b style="color:#8b5cf6;">¥{{ money(detail.ai ? detail.ai.so_amount : 0) }}</b> ·
            订单 <b>{{ detail.ai ? detail.ai.so_count : 0 }}</b> 单 ·
            建议等级 <b style="color:#ef4444;">{{ detail.ai ? detail.ai.suggest_level : '—' }}</b>（S≥100万 / A≥30万 / B≥5万 / C其他）
          </div>
          <b style="font-size:13px;">关联销售订单（自动捕捉，最近20单）</b>
          <el-table :data="detail.orders" stripe size="small" style="margin:6px 0 12px;">
            <el-table-column prop="so_no" label="订单号" width="150" show-overflow-tooltip />
            <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ money(row.total_with_tax) }}</template></el-table-column>
            <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="stType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
            <el-table-column label="回款" width="100"><template #default="{ row }"><el-tag :type="stType(row.receive_status)" size="small">{{ row.receive_status }}</el-tag></template></el-table-column>
            <el-table-column label="时间" width="100"><template #default="{ row }">{{ (row.created_at || '').slice(0, 10) }}</template></el-table-column>
            <template #empty><span class="muted">暂无订单</span></template>
          </el-table>
          <b style="font-size:13px;">跟进记录</b>
          <el-table :data="detail.followups" stripe size="small" style="margin:6px 0 12px;">
            <el-table-column label="时间" width="130"><template #default="{ row }">{{ (row.follow_time || '').slice(0, 16) }}</template></el-table-column>
            <el-table-column prop="method" label="方式" width="70" />
            <el-table-column label="内容" min-width="180" show-overflow-tooltip><template #default="{ row }">{{ (row.content || '').slice(0, 40) }}</template></el-table-column>
            <el-table-column label="下次计划" width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ row.next_plan ? (row.next_plan + ' ' + (row.next_time || '')).slice(0, 30) : '—' }}</template>
            </el-table-column>
            <el-table-column prop="creator_name" label="记录人" width="80" />
            <template #empty><span class="muted">暂无跟进，超30天未跟进将触发AI预警</span></template>
          </el-table>
          <b style="font-size:13px;">审批历史</b>
          <div v-if="detail.applies.length">
            <div v-for="a in detail.applies" :key="a.id" style="padding:8px 0;border-bottom:1px dashed var(--el-border-color-light);">
              <b>{{ PT_BIZ[a.biz_type] || a.biz_type }}</b>
              <el-tag :type="ptType(a.status)" size="small" style="margin-left:6px;">{{ a.status }}</el-tag>
              <span class="muted" style="font-size:12px;margin-left:6px;">{{ a.id }} · {{ (a.created_at || '').slice(0, 16) }}</span>
              <flow-steps :steps="a.steps || []" />
            </div>
          </div>
          <p v-else class="muted">暂无审批记录</p>
          <div style="text-align:right;margin-top:16px;">
            <el-button type="primary" @click="detailDlg.visible = false; openFollowup(detail.data.id)">新增跟进</el-button>
            <el-button @click="detailDlg.visible = false; onRecalc(detail.data.id)">AI重算评级</el-button>
            <el-button @click="detailDlg.visible = false">关闭</el-button>
          </div>
        </template>
      </div>
    </el-dialog>

    <!-- 跟进记录表单 -->
    <el-dialog v-model="followDlg.visible" title="新增跟进记录" width="560px">
      <el-row :gutter="14">
        <el-col :span="12"><el-form-item label="跟进时间">
          <el-date-picker v-model="followDlg.form.follow_time" type="datetime" value-format="YYYY-MM-DDTHH:mm" style="width:100%;" />
        </el-form-item></el-col>
        <el-col :span="12"><el-form-item label="跟进方式">
          <el-select v-model="followDlg.form.method" style="width:100%;">
            <el-option v-for="m in ['电话', '拜访', '微信', '邮件', '会议', '其他']" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item></el-col>
        <el-col :span="12"><el-form-item label="对接人"><el-input v-model="followDlg.form.contact_person" placeholder="默认为客户联系人" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="下次跟进时间"><el-date-picker v-model="followDlg.form.next_time" type="date" value-format="YYYY-MM-DD" style="width:100%;" /></el-form-item></el-col>
      </el-row>
      <el-form-item label="跟进内容" required><el-input v-model="followDlg.form.content" type="textarea" :rows="2" placeholder="沟通要点、客户反馈等" /></el-form-item>
      <el-form-item label="下次跟进计划"><el-input v-model="followDlg.form.next_plan" /></el-form-item>
      <template #footer>
        <el-button @click="followDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="followDlg.saving" @click="submitFollowup">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue';
import { ElMessage, ElMessageBox, ElIcon } from 'element-plus';
import { Plus, Download, Document, MagicStick, User, Connection, Money, Star, Bell, Clock, CircleCheckFilled, Remove } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

/* ---------------- 常量与工具 ---------------- */
const PT_BIZ = {
  cust_new: '新增建档', cust_change: '信息变更', cust_level: '等级评定', cust_disable: '停用注销',
  supp_new: '准入备案', supp_change: '信息变更', supp_review: '年审评定', supp_rating: '评级调整', supp_disable: '停用淘汰'
};
const PT_FORM_LABEL = {
  name: '名称', credit_code: '统一社会信用代码', address: '地址', contact: '联系人', phone: '联系电话',
  email: '邮箱', industry: '行业', source: '客户来源', expected_amount: '预计合作额(元)', license_expiry: '资质到期日',
  bank: '开户行', account: '银行账号', level: '目标等级', disable_type: '处理方式', legal_person: '法定代表人',
  category: '供应品类', coop_type: '合作类型', rating: '评级', next_review_date: '下次年审日', remark: '备注'
};
function money(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return '0.00';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ptType(s) {
  const map = {
    '意向': 'primary', '合作中': 'success', '已停用': 'info', '已注销': 'info',
    '备选': 'primary', '待整改': 'warning', '已淘汰': 'danger',
    '审批中': 'primary', '已通过': 'success', '已驳回': 'danger',
    '待归档': 'warning', '已归档': 'success', '借阅中': 'primary', '待处理': 'danger', '已处理': 'info'
  };
  return map[s] || 'info';
}
function stType(s) {
  const map = {
    '待审批': 'warning', '审批中': 'primary', '已生效': 'success', '已通过': 'success', '已驳回': 'danger', '已作废': 'info',
    '部分出库': 'primary', '全部出库': 'success', '已转单': 'primary',
    '未回款': 'info', '部分回款': 'warning', '已全额回款': 'success', '财务已入账': 'primary'
  };
  return map[s] || 'info';
}
function levelColor(l) { return ({ S: '#ef4444', A: '#2563eb', B: '#06b6d4', C: '#94a3b8' })[l] || '#94a3b8'; }
function alertColor(t) { return ({ '资质到期': '#f59e0b', '跟进超期': '#ef4444', '年审到期': '#2563eb', '评级过低': '#ef4444', '资质补录': '#f59e0b' })[t] || '#64748b'; }
const isBizCenter = computed(() => {
  const u = auth.user;
  if (!u) return false;
  return u.role === '超级管理员' || u.role === '销售总监' || (u.role === '部门经理' && u.dept === '市场部');
});
function currentStep(a) {
  const s = (a.steps || []).find(x => !x.done);
  return s ? s.step : '已完成';
}

/* 审批流程步骤（局部组件，还原 _trFlowHtml） */
const FlowSteps = {
  props: { steps: { type: Array, default: () => [] } },
  setup(props) {
    return () => {
      if (!props.steps.length) return null;
      const cur = props.steps.findIndex(s => !s.done);
      const els = [];
      props.steps.forEach((s, i) => {
        const done = !!s.done;
        const isCur = i === cur;
        const color = done ? '#10b981' : isCur ? '#f59e0b' : '#94a3b8';
        const opinion = s.opinion || s.comment || '';
        const children = [
          h('div', { style: { display: 'flex', justifyContent: 'center' } }, [
            h(ElIcon, { color, size: 14 }, () => h(done ? CircleCheckFilled : isCur ? Clock : Remove))
          ]),
          h('div', { style: { fontWeight: 'bold' } }, s.step || s.name || ''),
          h('div', { style: { fontSize: '11px' } }, s.user || s.approver || '待处理'),
          h('div', { style: { fontSize: '11px', color: '#909399' } }, s.time || s.approved_at || s.time_str || '—')
        ];
        if (opinion) children.push(h('div', { style: { fontSize: '11px', color: '#ef4444', marginTop: '2px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' } }, opinion.slice(0, 20)));
        els.push(h('span', {
          style: {
            display: 'inline-block', textAlign: 'center', padding: '6px 10px', border: `1px solid ${color}`,
            borderRadius: '6px', margin: '4px 0', fontSize: '12px', minWidth: '86px',
            background: done ? '#d1fae5' : isCur ? '#fef3c7' : '#f9fafb'
          }
        }, children));
        if (i < props.steps.length - 1) els.push(h('span', { style: { color: '#c0c4cc', margin: '0 6px', alignSelf: 'center' } }, '→'));
      });
      const reminder = cur >= 0
        ? h('div', { style: { marginTop: '8px', padding: '8px 12px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', fontSize: '13px', color: '#92400e' } }, [
            '当前待审节点：', h('b', props.steps[cur].step || props.steps[cur].name || ''), '，审批人：' + (props.steps[cur].user || props.steps[cur].approver || '待分配')
          ])
        : h('div', { style: { marginTop: '8px', padding: '8px 12px', background: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', fontSize: '13px', color: '#065f46' } }, '审批流程已完成');
      return h('div', { style: { marginTop: '12px' } }, [
        h('b', { style: { fontSize: '13px' } }, '审批流程示意图'),
        h('div', { style: { display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', padding: '12px 0', overflowX: 'auto' } }, els),
        reminder
      ]);
    };
  }
};

/* ---------------- 统计与页签 ---------------- */
const stats = ref(null);
const tab = ref('ledger');
const tabLoading = ref(false);
const filter = reactive({ keyword: '', status: '', level: '' });
const custRows = ref([]);
const applyRows = ref([]);
const alertRows = ref([]);

const kpis = computed(() => {
  if (!stats.value) return [];
  const s = stats.value;
  const L = s.levels || {};
  return [
    { title: '客户总数', value: s.total, sub: '本月新增 ' + s.month_new, icon: User, color: '#2563eb' },
    { title: '合作中客户', value: s.cooperating, sub: '意向 ' + s.intending + ' / 停注销 ' + s.disabled, icon: Connection, color: '#10b981' },
    { title: '累计销售订单额', value: '¥' + money(s.so_amount), sub: '与销售管理自动互通', icon: Money, color: '#8b5cf6' },
    { title: '分级分布', value: `S:${L.S} A:${L.A} B:${L.B} C:${L.C}`, sub: 'AI按净合作额自动建议', icon: Star, color: '#f59e0b' },
    { title: '待处理预警', value: s.alerts, sub: '审批中工单 ' + s.pending, icon: Bell, color: '#ef4444' }
  ];
});

async function loadStats() {
  const r = await request.get('/trade-customer/stats');
  if (r.code === 200) stats.value = r.data;
  else ElMessage.error('加载失败: ' + (r.msg || ''));
}
async function loadTab() {
  tabLoading.value = true;
  try {
    if (tab.value === 'ledger') {
      const params = {};
      if (filter.keyword) params.keyword = filter.keyword;
      if (filter.status) params.status = filter.status;
      if (filter.level) params.level = filter.level;
      const r = await request.get('/trade-customer', { params });
      custRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'applies') {
      const r = await request.get('/trade-customer/applies');
      applyRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'alerts') {
      const r = await request.get('/trade-customer/alerts');
      alertRows.value = r.code === 200 ? (r.data.rows || []) : [];
    }
  } finally {
    tabLoading.value = false;
  }
}
onMounted(async () => { await loadStats(); await loadTab(); });

/* ---------------- 审批 / 驳回 / 工单详情 ---------------- */
async function onApprove(row) {
  try { await ElMessageBox.confirm('确认审批通过当前节点？生效后系统将自动归档并执行业务联动', '提示', { type: 'warning' }); } catch { return; }
  const r = await request.post(`/trade-customer/applies/${row.id}/approve`, {});
  if (r.code === 200) { ElMessage.success(r.msg || '审批成功'); loadTab(); }
  else ElMessage.error(r.msg || '审批失败');
}
async function onReject(row) {
  let remark;
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回意见（必填）：', '驳回', { inputValidator: v => !!(v && v.trim()) || '驳回意见必填' });
    remark = value;
  } catch { return; }
  const r = await request.post(`/trade-customer/applies/${row.id}/reject`, { remark: remark.trim() });
  if (r.code === 200) { ElMessage.success(r.msg || '已驳回'); loadTab(); }
  else ElMessage.error(r.msg || '驳回失败');
}
const applyDetail = reactive({ visible: false, data: {} });
const formRows = computed(() =>
  Object.entries(applyDetail.data.form_data || {}).map(([k, v]) => ({ label: PT_FORM_LABEL[k] || k, value: String(v) }))
);
function openApplyDetail(row) {
  applyDetail.data = row;
  applyDetail.visible = true;
}

/* ---------------- 审批申请表单 ---------------- */
const applyDlg = reactive({ visible: false, saving: false, bizType: '', targetId: '', targetName: '', reason: '', form: {} });
function openApplyForm(bizType, targetId = '', targetName = '') {
  applyDlg.bizType = bizType;
  applyDlg.targetId = targetId;
  applyDlg.targetName = targetName;
  applyDlg.reason = '';
  applyDlg.form = bizType === 'cust_new'
    ? { name: '', credit_code: '', contact: '', phone: '', email: '', industry: '', source: '陌拜', expected_amount: 0, license_expiry: '', address: '', remark: '' }
    : bizType === 'cust_change'
      ? { contact: '', phone: '', address: '', bank: '', account: '', license_expiry: '' }
      : bizType === 'cust_level'
        ? { level: 'S' }
        : { disable_type: '停用' };
  applyDlg.visible = true;
}
async function submitApply() {
  const f = applyDlg.form;
  const payload = { biz_type: applyDlg.bizType, target_id: applyDlg.targetId, form: {}, reason: '' };
  if (applyDlg.bizType === 'cust_new') {
    if (!f.name) { ElMessage.warning('客户名称不能为空'); return; }
    payload.form = { ...f, expected_amount: parseFloat(f.expected_amount) || 0 };
  } else if (applyDlg.bizType === 'cust_change') {
    if (!applyDlg.reason.trim()) { ElMessage.warning('变更原因必填'); return; }
    payload.form = { contact: f.contact, phone: f.phone, address: f.address, bank: f.bank, account: f.account, license_expiry: f.license_expiry };
    payload.reason = applyDlg.reason.trim();
  } else if (applyDlg.bizType === 'cust_level') {
    if (!applyDlg.reason.trim()) { ElMessage.warning('评级理由必填'); return; }
    payload.form = { level: f.level };
    payload.reason = applyDlg.reason.trim();
  } else if (applyDlg.bizType === 'cust_disable') {
    if (!applyDlg.reason.trim()) { ElMessage.warning('原因必填'); return; }
    payload.form = { disable_type: f.disable_type };
    payload.reason = applyDlg.reason.trim();
  }
  applyDlg.saving = true;
  const r = await request.post('/trade-customer/applies', payload);
  applyDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已提交');
    applyDlg.visible = false;
    tab.value = 'applies';
    loadTab();
  } else ElMessage.error(r.msg || '提交失败');
}

/* ---------------- 客户详情 ---------------- */
const detailDlg = reactive({ visible: false, loading: false });
const detail = reactive({ data: {}, followups: [], applies: [], orders: [], ai: null });
const detailInfo = computed(() => {
  const x = detail.data;
  const ai = detail.ai;
  return [
    ['客户编号', x.id], ['状态', x.status], ['当前等级', x.level], ['AI建议等级', ai ? ai.suggest_level : '—'],
    ['统一社会信用代码', x.credit_code || '—'], ['联系人', x.contact || '—'], ['电话', x.phone || '—'], ['邮箱', x.email || '—'],
    ['行业', x.industry || '—'], ['来源', x.source || '—'], ['预计合作额', '¥' + money(x.expected_amount)], ['资质到期', x.license_expiry || '—'],
    ['地址', x.address || '—'], ['归属人', (x.owner_name || '—') + '（' + (x.owner_dept || '') + '）'],
    ['建档时间', (x.created_at || '').slice(0, 10)], ['最近跟进', (x.last_follow_at || '').slice(0, 16) || '—']
  ];
});
async function openDetail(id) {
  detailDlg.visible = true;
  detailDlg.loading = true;
  detail.data = {};
  const r = await request.get('/trade-customer/' + id);
  detailDlg.loading = false;
  if (r.code !== 200) { detailDlg.visible = false; ElMessage.error(r.msg || '加载失败'); return; }
  detail.data = r.data.customer || {};
  detail.followups = r.data.followups || [];
  detail.applies = r.data.applies || [];
  detail.orders = r.data.orders || [];
  detail.ai = r.data.ai || null;
}
async function onRecalc(id) {
  const r = await request.post(`/trade-customer/${id}/recalc`);
  if (r.code === 200) { ElMessage.success(r.msg || '已重算'); loadTab(); }
  else ElMessage.error(r.msg || '重算失败');
}

/* ---------------- 跟进记录 ---------------- */
const followDlg = reactive({ visible: false, saving: false, id: '', form: {} });
function openFollowup(id) {
  followDlg.id = id;
  followDlg.form = { follow_time: new Date().toISOString().slice(0, 16), method: '电话', contact_person: '', next_time: '', content: '', next_plan: '' };
  followDlg.visible = true;
}
async function submitFollowup() {
  if (!followDlg.form.content) { ElMessage.warning('跟进内容不能为空'); return; }
  followDlg.saving = true;
  const r = await request.post(`/trade-customer/${followDlg.id}/followups`, { ...followDlg.form });
  followDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); followDlg.visible = false; loadTab(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------------- 存量导入 / 导出 ---------------- */
async function onImportLegacy() {
  try { await ElMessageBox.confirm('将扫描销售/采购历史订单中的往来单位，一键备案到客户/供应商台账（已存在的自动跳过），确认执行？', '提示', { type: 'warning' }); } catch { return; }
  const r = await request.post('/trade-customer/import-legacy');
  if (r.code === 200) { ElMessage.success(r.msg || '导入完成'); loadTab(); loadStats(); }
  else ElMessage.error(r.msg || '导入失败');
}
async function onExportCsv() {
  const token = localStorage.getItem('zm_token');
  const resp = await fetch('/api/trade-customer/export', { headers: { Authorization: 'Bearer ' + token } });
  if (!resp.ok) { ElMessage.error('导出失败'); return; }
  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '客户台账_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<style scoped>
.trade-customer { padding: 20px; }
.muted { color: #909399; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin: 12px 0; font-size: 13px; }
.ai-panel { background: var(--el-fill-color-light); border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
.el-form-item { margin-bottom: 12px; }
</style>
