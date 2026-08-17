<template>
  <div class="reports-page">
    <div v-if="loading" class="loading"><el-icon class="is-loading"><Loading /></el-icon> 加载中...</div>
    <template v-else>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;">工作汇报 <span style="font-size:12px;color:var(--text-muted);font-weight:normal;">员工填报自查 → 部门初审(通过/驳回/暂存) → 副总复核 → 总经理终审 → 归档锁定</span></h3>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" @click="exportCSV"><el-icon><Download /></el-icon> 导出CSV</button>
          <button class="btn btn-primary btn-sm" @click="openForm"><el-icon><Plus /></el-icon> 提交汇报</button>
        </div>
      </div>

      <!-- KPI 统计卡片 -->
      <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px;margin-bottom:20px;">
        <div v-for="k in kpis" :key="k.label" class="stat-card-enhanced" style="position:relative;padding:20px;background:var(--bg-card);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);transition:var(--transition);overflow:hidden;">
          <div :style="`position:absolute;top:0;left:0;right:0;height:3px;background:${k.color};border-radius:var(--radius-lg) var(--radius-lg) 0 0;`"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <p class="text-muted" style="font-size:12px;margin:0 0 6px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">{{ k.label }}</p>
              <p :style="`font-size:26px;font-weight:700;margin:0;color:${k.color};`">{{ k.value }}</p>
            </div>
            <div :style="`width:48px;height:48px;border-radius:14px;background:${k.color}15;display:flex;align-items:center;justify-content:center;flex-shrink:0;`">
              <el-icon :size="22" :color="k.color"><component :is="k.icon" /></el-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 栏 -->
      <div style="display:flex;gap:6px;margin-bottom:16px;">
        <button v-for="t in tabs" :key="t.k" class="btn btn-sm" :class="tab === t.k ? 'btn-primary' : 'btn-secondary'" @click="switchTab(t.k)">
          <el-icon><component :is="t.icon" /></el-icon> {{ t.t }}
        </button>
      </div>

      <!-- 汇报列表 -->
      <div v-if="tab === 'list'" class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <select v-model="filterType" class="form-control" style="width:auto;padding:6px 12px;">
              <option value="全部">全部类型</option>
              <option v-for="t in reportTypes" :key="t" :value="t">{{ t }}</option>
            </select>
            <select v-model="filterStatus" class="form-control" style="width:auto;padding:6px 12px;">
              <option v-for="s in ['全部', '待初审', '审批中', '暂存', '已驳回', '已归档']" :key="s" :value="s">{{ s }}</option>
            </select>
            <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
              <input type="checkbox" v-model="overdueOnly"> 仅看逾期
            </label>
          </div>
        </div>
        <div class="card-body">
          <table class="table">
            <thead><tr><th>日期/期间</th><th>姓名</th><th>部门</th><th>类型</th><th>摘要</th><th>状态</th><th>流程/版本</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-if="!filteredRows.length"><td colspan="8" class="text-center text-muted">暂无记录</td></tr>
              <tr v-else v-for="r in filteredRows" :key="r.id" :style="r.is_overdue ? 'background:#fef2f2;' : ''">
                <td>
                  {{ r.month || r.date || '' }}
                  <template v-if="r.report_no"><br><span style="font-size:11px;color:#10b981;">{{ r.report_no }}</span></template>
                </td>
                <td>{{ r.user_name }}</td><td>{{ r.dept }}</td>
                <td><span class="tag" :class="typeTagClass(r.type)">{{ r.type }}</span></td>
                <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" :title="r.content || ''">{{ (r.summary || r.content || '').substring(0, 40) }}</td>
                <td>
                  <span class="tag" :style="`background:${statusColor(r.status)}15;color:${statusColor(r.status)};`">{{ r.status }}</span>
                  <template v-if="r.is_overdue"><br><span style="font-size:11px;color:#ef4444;">逾期</span></template>
                </td>
                <td>
                  <button class="btn btn-sm btn-secondary" title="查看流程" @click="openWorkflow(r)"><el-icon><Share /></el-icon></button>
                  <span :style="`font-size:11px;color:${statusColor(r.status)};margin-left:4px;`">{{ currentStep(r) ? currentStep(r).step : '已归档' }}{{ r.version > 1 ? ' · V' + r.version : '' }}</span>
                </td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-sm" title="详情" @click="openView(r.id)"><el-icon><View /></el-icon></button>
                  <button class="btn btn-sm btn-info" title="打印" @click="printReport(r.id)"><el-icon><Printer /></el-icon></button>
                  <template v-if="canApprove(r)">
                    <button class="btn btn-sm btn-primary" title="通过" @click="approve(r.id)"><el-icon><Check /></el-icon></button>
                    <button v-if="currentStep(r) && currentStep(r).step.includes('部门负责人')" class="btn btn-sm btn-secondary" title="暂存" @click="hold(r.id)"><el-icon><VideoPause /></el-icon></button>
                    <button class="btn btn-sm btn-secondary" title="驳回" @click="openReject(r.id)"><el-icon><Close /></el-icon></button>
                  </template>
                  <button v-if="canResubmit(r)" class="btn btn-sm btn-warning" title="整改重提" @click="openResubmit(r.id)"><el-icon><Refresh /></el-icon></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 统计分析 -->
      <div v-else-if="tab === 'stats'" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="card">
          <div class="card-header"><h3><el-icon><Clock /></el-icon> 各类型提交与截止规范</h3></div>
          <div class="card-body">
            <table class="table">
              <thead><tr><th>类型</th><th>截止时间</th><th>提交数</th></tr></thead>
              <tbody>
                <tr v-for="t in (stats.types || [])" :key="t.type"><td>{{ t.type }}</td><td>{{ t.deadline }}</td><td>{{ t.count }}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3><el-icon><User /></el-icon> 部门汇总复盘</h3></div>
          <div class="card-body">
            <template v-if="Object.keys(stats.byDept || {}).length">
              <div v-for="[d, n] in deptEntries" :key="d" style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>{{ d }}</span><span>{{ n }} 份</span></div>
                <div style="height:8px;background:var(--bg-secondary);border-radius:4px;overflow:hidden;"><div :style="`height:100%;width:${Math.min(100, n * 10)}%;background:#2563eb;`"></div></div>
              </div>
            </template>
            <p v-else class="text-muted">暂无数据</p>
            <div style="margin-top:12px;font-size:13px;color:var(--text-muted);">汇报人数：{{ stats.reporters || 0 }} 人 · 累计 {{ stats.total || 0 }} 份 · 逾期 {{ stats.overdue || 0 }} 份 · 归档 {{ stats.archived || 0 }} 份</div>
          </div>
        </div>
      </div>

      <!-- 汇报模板 -->
      <div v-else-if="tab === 'templates'" class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <h3><el-icon><CopyDocument /></el-icon> 汇报模板库（模板自定义）</h3>
          <button v-if="canManageTpl" class="btn btn-primary btn-sm" @click="openTplForm(0)"><el-icon><Plus /></el-icon> 新建模板</button>
        </div>
        <div class="card-body">
          <template v-if="templates.length">
            <div v-for="t in templates" :key="t.id" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--border-color,#e5e7eb);border-radius:8px;margin-bottom:8px;">
              <div>
                <strong>{{ t.name }}</strong>
                <span class="tag tag-blue">{{ t.type }}</span>
                <span class="tag" :class="t.status === '启用' ? 'tag-green' : 'tag-gray'">{{ t.status }}</span>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">{{ (t.description || '').substring(0, 80) }}</div>
              </div>
              <div v-if="canManageTpl" style="white-space:nowrap;">
                <button class="btn btn-sm btn-secondary" @click="openTplForm(t.id)"><el-icon><Edit /></el-icon></button>
                <button class="btn btn-sm btn-secondary" @click="deleteTemplate(t.id)"><el-icon><Delete /></el-icon></button>
              </div>
            </div>
          </template>
          <p v-else class="text-muted">暂无模板，可由管理层创建各类型汇报模板供员工填报引用</p>
        </div>
      </div>
    </template>

    <!-- 提交汇报弹窗 -->
    <el-dialog v-model="form.visible" title="提交工作汇报" width="680px">
      <div style="margin-bottom:12px;padding:10px;background:#dbeafe;border-radius:8px;font-size:13px;color:#1e40af;">
        <el-icon><InfoFilled /></el-icon> 闭环流程：填报自查 → 部门负责人初审（通过/驳回/暂存）→ 副总复核 → 总经理终审 → 归档（生成唯一归档编号，内容锁定）
      </div>
      <div class="form-group">
        <label>汇报类型 <span class="required">*</span></label>
        <select v-model="form.type" class="form-control" @change="onTypeChange">
          <option v-for="t in reportTypes" :key="t" :value="t">{{ t }}（截止：{{ REPORT_META[t].deadline }}）</option>
        </select>
      </div>
      <div class="form-group">
        <label>引用模板（选填）</label>
        <select v-model="form.templateId" class="form-control" @change="applyTemplate">
          <option value="">不使用模板</option>
          <option v-for="t in enabledTemplates" :key="t.id" :value="t.id">{{ t.name }}（{{ t.type }}）</option>
        </select>
      </div>
      <div class="form-group">
        <template v-if="form.type === '日报'">
          <label>汇报日期 <span class="required">*</span></label>
          <input type="date" v-model="form.date" class="form-control">
        </template>
        <template v-else-if="form.type === '周报'">
          <label>本周任一日期 <span class="required">*</span></label>
          <input type="date" v-model="form.date" class="form-control">
        </template>
        <template v-else-if="form.type === '月报'">
          <label>汇报月份 <span class="required">*</span></label>
          <input type="month" v-model="form.month" class="form-control">
        </template>
        <template v-else-if="form.type === '季度总结'">
          <label>汇报季度 <span class="required">*</span></label>
          <select v-model="form.period" class="form-control">
            <option v-for="q in [1, 2, 3, 4]" :key="q" :value="`${curYear}Q${q}`">{{ curYear }}年第{{ q }}季度</option>
          </select>
        </template>
        <template v-else-if="form.type === '半年总结'">
          <label>汇报半年度 <span class="required">*</span></label>
          <select v-model="form.period" class="form-control">
            <option :value="`${curYear}上半年`">{{ curYear }}年上半年</option>
            <option :value="`${curYear}下半年`">{{ curYear }}年下半年</option>
          </select>
        </template>
        <template v-else>
          <label>汇报年度 <span class="required">*</span></label>
          <input type="number" v-model="form.period" class="form-control" min="2020" max="2100">
        </template>
      </div>
      <div class="form-group">
        <label>{{ formMeta.labels.content }} <span class="required">*</span></label>
        <textarea v-model="form.content" class="form-control" rows="6" placeholder="请输入工作内容..."></textarea>
      </div>
      <div class="form-group" v-if="showHighlights">
        <label>{{ formMeta.labels.highlights || '主要成果与亮点' }}<span v-if="formMeta.required.includes('highlights')" class="required"> *</span></label>
        <textarea v-model="form.highlights" class="form-control" rows="2" placeholder="本周期内的关键成果、数据亮点..."></textarea>
      </div>
      <div class="form-group" v-if="showProblems">
        <label>问题与困难（选填）</label>
        <textarea v-model="form.problems" class="form-control" rows="2" placeholder="工作中遇到的问题、需要的支持与资源..."></textarea>
      </div>
      <div class="form-group">
        <label>{{ formMeta.labels.plan || '工作计划' }}<span v-if="formMeta.required.includes('plan')" class="required"> *</span></label>
        <textarea v-model="form.plan" class="form-control" rows="3" placeholder="请输入工作计划..."></textarea>
      </div>
      <template v-if="isLongTerm">
        <div class="form-group">
          <label>{{ formMeta.labels.summary }} <span class="required">*</span></label>
          <textarea v-model="form.summary" class="form-control" rows="4" placeholder="请输入总结与复盘..."></textarea>
        </div>
        <div class="form-group">
          <label>{{ formMeta.labels.next_plan }} <span class="required">*</span></label>
          <textarea v-model="form.next_plan" class="form-control" rows="3" placeholder="请输入下一周期工作计划..."></textarea>
        </div>
      </template>
      <div class="form-group" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="reportSelfCheck" v-model="form.self_check">
        <label for="reportSelfCheck" style="margin:0;">已按填报规范完成自查确认 <span class="required">*</span></label>
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="form.visible = false">取消</button>
        <button class="btn btn-primary" @click="submitReport">提交</button>
      </template>
    </el-dialog>

    <!-- 汇报详情弹窗 -->
    <el-dialog v-model="detail.visible" width="720px">
      <template #header>
        <span style="font-weight:600;">{{ detail.data ? detail.data.type : '' }}详情 <span v-if="detail.data && detail.data.report_no" class="tag tag-green">{{ detail.data.report_no }}</span></span>
      </template>
      <template v-if="detail.data">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div class="info-item"><span class="info-label">类型/期间</span><span class="info-value">{{ detail.data.type }} · {{ detail.data.month || detail.data.date || '' }}</span></div>
          <div class="info-item"><span class="info-label">状态</span><span class="info-value"><span class="tag" :style="`background:${statusColor(detail.data.status)}15;color:${statusColor(detail.data.status)};`">{{ detail.data.status }}</span> <span v-if="detail.data.is_overdue" style="color:#ef4444;font-size:12px;">（逾期）</span></span></div>
          <div class="info-item"><span class="info-label">姓名/部门</span><span class="info-value">{{ detail.data.user_name }} / {{ detail.data.dept }}</span></div>
          <div class="info-item"><span class="info-label">版本/驳回</span><span class="info-value">V{{ detail.data.version || 1 }} · 被驳回{{ detail.data.reject_count || 0 }}次</span></div>
        </div>
        <div v-if="detail.data.reject_reason" style="margin-bottom:12px;padding:10px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;color:#b91c1c;font-size:13px;"><strong>最近驳回原因：</strong>{{ detail.data.reject_reason }}</div>
        <div style="margin-top:8px;"><strong>{{ detailMeta.labels.content }}：</strong><div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:8px;white-space:pre-wrap;">{{ detail.data.content }}</div></div>
        <div v-if="detail.data.highlights" style="margin-top:12px;"><strong>{{ detailMeta.labels.highlights || '主要成果与亮点' }}：</strong><div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:8px;white-space:pre-wrap;">{{ detail.data.highlights }}</div></div>
        <div v-if="detail.data.problems" style="margin-top:12px;"><strong>问题与困难：</strong><div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:8px;white-space:pre-wrap;">{{ detail.data.problems }}</div></div>
        <div v-if="detail.data.plan" style="margin-top:12px;"><strong>{{ detailMeta.labels.plan || '工作计划' }}：</strong><div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:8px;white-space:pre-wrap;">{{ detail.data.plan }}</div></div>
        <div v-if="detail.data.summary" style="margin-top:12px;"><strong>{{ detailMeta.labels.summary || '总结' }}：</strong><div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:8px;white-space:pre-wrap;">{{ detail.data.summary }}</div></div>
        <div v-if="detail.data.next_plan" style="margin-top:12px;"><strong>{{ detailMeta.labels.next_plan || '下期计划' }}：</strong><div style="margin-top:8px;padding:12px;background:var(--bg-secondary);border-radius:8px;white-space:pre-wrap;">{{ detail.data.next_plan }}</div></div>
        <div v-if="(detail.data.approval_flow || []).length" style="margin-top:16px;">
          <strong>闭环审批流程：</strong>
          <WorkflowSteps :flow="detail.data.approval_flow" />
        </div>
        <div v-if="(detail.data.versions || []).length > 1" style="margin-top:16px;">
          <strong>版本留存（{{ detail.data.versions.length }}个版本）：</strong>
          <div style="margin-top:8px;border-left:2px solid #e5e7eb;padding-left:12px;">
            <div v-for="v in detail.data.versions" :key="v.version" style="margin-bottom:6px;font-size:12px;"><span class="tag tag-blue">V{{ v.version }}</span> {{ v.action }} · {{ v.operator || '' }} · {{ v.created_at || '' }}</div>
          </div>
        </div>
        <div style="margin-top:16px;">
          <strong>评论互动（{{ (detail.data.comments || []).length }}）：</strong>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <input v-model="commentInput" class="form-control" placeholder="发表评论..." style="flex:1;">
            <button class="btn btn-primary btn-sm" @click="addComment"><el-icon><ChatDotRound /></el-icon> 评论</button>
          </div>
          <template v-if="(detail.data.comments || []).length">
            <div v-for="(cm, i) in detail.data.comments" :key="i" style="margin-top:8px;padding:8px 12px;background:var(--bg-secondary);border-radius:8px;font-size:13px;">
              <strong>{{ cm.user_name }}</strong> <span style="color:var(--text-muted);font-size:11px;">{{ cm.created_at }}</span>
              <div style="margin-top:4px;">{{ cm.content }}</div>
            </div>
          </template>
          <div v-else style="margin-top:8px;color:var(--text-muted);font-size:13px;">暂无评论</div>
        </div>
      </template>
      <template #footer>
        <button v-if="detail.data && isOwner(detail.data) && detail.data.status === '已驳回'" class="btn btn-warning" @click="detail.visible = false; openResubmit(detail.data.id)"><el-icon><Refresh /></el-icon> 整改重提</button>
        <button class="btn btn-info" @click="printReport(detail.data.id)"><el-icon><Printer /></el-icon> 打印</button>
        <button class="btn btn-secondary" @click="detail.visible = false">关闭</button>
      </template>
    </el-dialog>

    <!-- 审批流程弹窗 -->
    <el-dialog v-model="wf.visible" :title="wf.row ? `工作汇报审批流程 — ${wf.row.type} · ${wf.row.user_name}` : '审批流程'" width="680px">
      <template v-if="wf.row">
        <div style="margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
          <strong>日期：</strong>{{ wf.row.type === '月报' ? (wf.row.month || wf.row.date) : wf.row.date }}&emsp;
          <strong>部门：</strong>{{ wf.row.dept }}&emsp;
          <strong>状态：</strong>{{ wf.row.status }}
        </div>
        <WorkflowSteps :flow="wf.row.approval_flow || []" />
      </template>
      <template #footer>
        <button class="btn btn-secondary" @click="wf.visible = false">关闭</button>
        <button class="btn btn-info" @click="printReport(wf.row.id)"><el-icon><Printer /></el-icon> 打印</button>
      </template>
    </el-dialog>

    <!-- 驳回弹窗 -->
    <el-dialog v-model="reject.visible" title="驳回汇报" width="480px">
      <div class="form-group">
        <label>驳回意见 <span class="required">*</span>（汇报人须按意见整改后重提）</label>
        <textarea v-model="reject.remark" class="form-control" rows="4" placeholder="请填写具体驳回意见..."></textarea>
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="reject.visible = false">取消</button>
        <button class="btn btn-primary" @click="submitReject">确认驳回</button>
      </template>
    </el-dialog>

    <!-- 整改重提弹窗 -->
    <el-dialog v-model="rs.visible" width="680px">
      <template #header><span style="font-weight:600;"><el-icon><Refresh /></el-icon> 整改重提（V{{ rs.version }}）</span></template>
      <div v-if="rs.rejectReason" style="margin-bottom:12px;padding:10px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;color:#b91c1c;font-size:13px;"><strong>驳回原因（请按意见整改）：</strong>{{ rs.rejectReason }}</div>
      <div class="form-group">
        <label>{{ rsMeta.labels.content }} <span class="required">*</span></label>
        <textarea v-model="rs.form.content" class="form-control" rows="6"></textarea>
      </div>
      <div class="form-group">
        <label>{{ rsMeta.labels.plan || '工作计划' }}</label>
        <textarea v-model="rs.form.plan" class="form-control" rows="3"></textarea>
      </div>
      <div class="form-group" v-if="rs.showHighlights">
        <label>{{ rsMeta.labels.highlights || '主要成果与亮点' }}</label>
        <textarea v-model="rs.form.highlights" class="form-control" rows="2"></textarea>
      </div>
      <div class="form-group" v-if="rs.showProblems">
        <label>问题与困难（选填）</label>
        <textarea v-model="rs.form.problems" class="form-control" rows="2"></textarea>
      </div>
      <template v-if="rs.longTerm">
        <div class="form-group">
          <label>{{ rsMeta.labels.summary }} <span class="required">*</span></label>
          <textarea v-model="rs.form.summary" class="form-control" rows="4"></textarea>
        </div>
        <div class="form-group">
          <label>{{ rsMeta.labels.next_plan }} <span class="required">*</span></label>
          <textarea v-model="rs.form.next_plan" class="form-control" rows="3"></textarea>
        </div>
      </template>
      <template #footer>
        <button class="btn btn-secondary" @click="rs.visible = false">取消</button>
        <button class="btn btn-warning" @click="submitResubmit"><el-icon><Refresh /></el-icon> 整改后重新提交</button>
      </template>
    </el-dialog>

    <!-- 模板编辑弹窗 -->
    <el-dialog v-model="tplForm.visible" :title="(tplForm.id ? '编辑' : '新建') + '汇报模板'" width="600px">
      <div class="form-group"><label>模板名称 <span class="required">*</span></label><input v-model="tplForm.name" class="form-control"></div>
      <div class="form-group"><label>适用类型 <span class="required">*</span></label>
        <select v-model="tplForm.type" class="form-control">
          <option v-for="x in reportTypes" :key="x" :value="x">{{ x }}</option>
        </select>
      </div>
      <div class="form-group"><label>说明</label><input v-model="tplForm.description" class="form-control"></div>
      <div class="form-group"><label>内容模板（员工引用时自动填入）</label><textarea v-model="tplForm.content_template" class="form-control" rows="6" placeholder="一、本周完成事项&#10;二、数据指标&#10;三、下周计划"></textarea></div>
      <div class="form-group"><label>状态</label>
        <select v-model="tplForm.status" class="form-control">
          <option value="启用">启用</option>
          <option value="停用">停用</option>
        </select>
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="tplForm.visible = false">取消</button>
        <button class="btn btn-primary" @click="saveTemplate">保存</button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue';
import { ElMessage, ElMessageBox, ElIcon } from 'element-plus';
import {
  Download, Plus, Document, Clock, Box, Warning, RefreshLeft, Tickets, DataAnalysis,
  CopyDocument, View, Printer, Check, Close, Refresh, Share, VideoPause,
  InfoFilled, User, Edit, Delete, ChatDotRound, Loading, CircleCheck, ArrowRight
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

/* ===== 汇报类型元数据 ===== */
const REPORT_META = {
  '日报': { labels: { content: '今日工作内容', plan: '明日工作计划' }, required: ['content', 'plan'], deadline: '当日 24:00' },
  '周报': { labels: { content: '本周工作内容', highlights: '主要成果与亮点', plan: '下周工作计划' }, required: ['content', 'highlights', 'plan'], deadline: '本周五 18:00' },
  '月报': { labels: { content: '本月主要工作', summary: '本月工作总结', next_plan: '下月工作计划' }, required: ['content', 'summary', 'next_plan'], deadline: '当月最后一日 20:00' },
  '季度总结': { labels: { content: '本季度主要工作', summary: '季度总结与复盘', next_plan: '下季度工作计划' }, required: ['content', 'summary', 'next_plan'], deadline: '季度结束后3个工作日内' },
  '半年总结': { labels: { content: '本半年度主要工作', summary: '半年总结与复盘', next_plan: '下阶段工作计划' }, required: ['content', 'summary', 'next_plan'], deadline: '7月3日 / 次年1月5日 18:00' },
  '年度总结': { labels: { content: '本年度主要工作', summary: '年度总结与复盘', next_plan: '明年工作计划' }, required: ['content', 'summary', 'next_plan'], deadline: '次年1月5日 18:00前归档' }
};
const reportTypes = Object.keys(REPORT_META);
const LONG_TERM_TYPES = ['月报', '季度总结', '半年总结', '年度总结'];

/* ===== 工作流步骤子组件（渲染函数方式） ===== */
const WorkflowSteps = (props) => {
  const flow = props.flow || [];
  if (!flow.length) return null;
  const nodes = [];
  flow.forEach((f, i) => {
    const isDone = f.done;
    const isCurrent = !f.done && (i === 0 || flow.slice(0, i).every(s => s.done));
    const cls = isDone ? 'wf-done' : isCurrent ? 'wf-current' : 'wf-pending';
    const icon = isDone
      ? h(ElIcon, null, { default: () => h(CircleCheck) })
      : isCurrent
        ? h(ElIcon, { class: 'is-loading' }, { default: () => h(Loading) })
        : h('span', { class: 'wf-hollow' });
    nodes.push(h('div', { class: `wf-step ${cls}` }, [
      h('div', { class: 'wf-icon' }, [icon]),
      h('div', { class: 'wf-info' }, [
        h('div', { class: 'wf-name' }, f.step),
        h('div', { class: 'wf-user' }, f.user || (isDone ? '已完成' : '待处理')),
        f.time && f.time !== '—' ? h('div', { class: 'wf-time' }, f.time) : null
      ])
    ]));
    if (i < flow.length - 1) nodes.push(h('div', { class: 'wf-arrow' }, [h(ElIcon, null, { default: () => h(ArrowRight) })]));
  });
  return h('div', { class: 'wf-container' }, [h('div', { class: 'wf-track' }, nodes)]);
};
WorkflowSteps.props = ['flow'];

/* ===== 数据加载 ===== */
const loading = ref(true);
const rows = ref([]);
const stats = ref({});
const tab = ref('list');
const tabs = [
  { k: 'list', t: '汇报列表', icon: Tickets },
  { k: 'stats', t: '统计分析', icon: DataAnalysis },
  { k: 'templates', t: '汇报模板', icon: CopyDocument }
];

const kpis = computed(() => [
  { label: '累计提交', value: stats.value.total || rows.value.length, icon: Document, color: '#2563eb' },
  { label: '待初审/审批中', value: stats.value.pending || 0, icon: Clock, color: '#f59e0b' },
  { label: '已归档', value: stats.value.archived || 0, icon: Box, color: '#10b981' },
  { label: '逾期提交', value: stats.value.overdue || 0, icon: Warning, color: '#ef4444' },
  { label: '被驳回', value: stats.value.rejected || 0, icon: RefreshLeft, color: '#8b5cf6' }
]);

async function load() {
  loading.value = true;
  const [listResp, statsResp] = await Promise.all([
    request.get('/reports'),
    request.get('/reports/stats').catch(() => ({ code: 500 }))
  ]);
  loading.value = false;
  if (listResp.code !== 200) { ElMessage.error(listResp.msg || '加载失败'); return; }
  rows.value = listResp.data || [];
  stats.value = statsResp.code === 200 ? (statsResp.data || {}) : {};
  if (tab.value === 'templates') loadTemplates();
}
function switchTab(t) {
  tab.value = t;
  if (t === 'templates') loadTemplates();
}
onMounted(load);

/* ===== 列表筛选 ===== */
const filterType = ref('全部');
const filterStatus = ref('全部');
const overdueOnly = ref(false);
const filteredRows = computed(() => {
  let filtered = rows.value;
  if (filterType.value !== '全部') filtered = filtered.filter(r => r.type === filterType.value);
  if (filterStatus.value !== '全部') filtered = filtered.filter(r => r.status === filterStatus.value);
  if (overdueOnly.value) filtered = filtered.filter(r => r.is_overdue);
  return filtered;
});

function statusColor(s) {
  if (s === '已归档' || s === '已完成') return '#10b981';
  if (s === '已驳回') return '#ef4444';
  if (s === '暂存') return '#6b7280';
  return '#f59e0b';
}
function typeTagClass(t) {
  return t === '日报' ? 'tag-blue' : t === '周报' ? 'tag-green' : 'tag-purple';
}
function currentStep(r) {
  return (r.approval_flow || []).find(f => !f.done);
}
function canApprove(r) {
  const u = auth.user || {};
  const cur = currentStep(r);
  if (!cur) return false;
  return (cur.step.includes('部门负责人') && (u.role === '部门经理' || u.role === '超级管理员')) ||
    (cur.step.includes('副总') && ['副总', '总经理', '超级管理员'].includes(u.role)) ||
    (cur.step.includes('总经理') && (u.role === '总经理' || u.role === '超级管理员'));
}
function isOwner(r) {
  const u = auth.user || {};
  return String(r.user_id) === String(u.id);
}
function canResubmit(r) {
  return isOwner(r) && r.status === '已驳回';
}

/* ===== 统计分析 ===== */
const deptEntries = computed(() => Object.entries(stats.value.byDept || {}).sort((a, b) => b[1] - a[1]));

/* ===== 提交汇报 ===== */
const curYear = new Date().getFullYear();
const form = reactive({
  visible: false, type: '日报', templateId: '',
  date: '', month: '', period: '',
  content: '', plan: '', highlights: '', problems: '', summary: '', next_plan: '',
  self_check: false
});
const formTemplates = ref([]);
const enabledTemplates = computed(() => formTemplates.value.filter(t => t.status === '启用'));
const formMeta = computed(() => REPORT_META[form.type] || REPORT_META['日报']);
const isLongTerm = computed(() => LONG_TERM_TYPES.includes(form.type));
const showHighlights = computed(() => form.type === '周报' || isLongTerm.value);
const showProblems = computed(() => form.type !== '日报');

async function openForm() {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  form.type = '日报';
  form.templateId = '';
  form.date = today;
  form.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  form.period = `${curYear}Q1`;
  form.content = '';
  form.plan = '';
  form.highlights = '';
  form.problems = '';
  form.summary = '';
  form.next_plan = '';
  form.self_check = false;
  form.visible = true;
  const tplResp = await request.get('/reports/templates').catch(() => ({ code: 500 }));
  formTemplates.value = tplResp.code === 200 ? (tplResp.data || []) : [];
}
function onTypeChange() {
  if (form.type === '季度总结') form.period = `${curYear}Q1`;
  else if (form.type === '半年总结') form.period = `${curYear}上半年`;
  else if (form.type === '年度总结') form.period = String(curYear);
}
function applyTemplate() {
  const t = formTemplates.value.find(x => String(x.id) === String(form.templateId));
  if (t && t.content_template && !form.content) {
    form.content = t.content_template;
    ElMessage.success('模板内容已填入');
  }
}
async function submitReport() {
  const meta = formMeta.value;
  const payload = {
    type: form.type,
    date: ['日报', '周报'].includes(form.type) ? form.date : new Date().toISOString().slice(0, 10),
    month: form.type === '月报' ? form.month : '',
    period: ['季度总结', '半年总结', '年度总结'].includes(form.type) ? String(form.period) : '',
    content: form.content,
    plan: form.plan,
    highlights: showHighlights.value ? form.highlights : '',
    problems: showProblems.value ? form.problems : '',
    summary: isLongTerm.value ? form.summary : '',
    next_plan: isLongTerm.value ? form.next_plan : '',
    self_check: form.self_check ? '1' : ''
  };
  if (!payload.self_check) { ElMessage.warning('请先完成填报自查确认'); return; }
  if (!payload.content) { ElMessage.warning(meta.labels.content + '不能为空'); return; }
  for (const f of meta.required) {
    if (!payload[f]) { ElMessage.warning((meta.labels[f] || f) + '为必填项'); return; }
  }
  if (!payload.month && !payload.period && !payload.date) { ElMessage.warning('请选择汇报期间'); return; }
  const resp = await request.post('/reports', payload);
  if (resp.code === 200) {
    ElMessage.success(resp.msg || '汇报已提交');
    form.visible = false;
    load();
  } else ElMessage.error(resp.msg || '提交失败');
}

/* ===== 详情 / 评论 ===== */
const detail = reactive({ visible: false, data: null });
const commentInput = ref('');
const detailMeta = computed(() => (detail.data && REPORT_META[detail.data.type]) || REPORT_META['日报']);
async function openView(id) {
  const resp = await request.get(`/reports/${id}`).catch(() => ({ code: 500 }));
  if (resp.code !== 200) { ElMessage.error(resp.msg || '加载详情失败'); return; }
  detail.data = resp.data;
  commentInput.value = '';
  detail.visible = true;
}
async function addComment() {
  if (!commentInput.value.trim()) { ElMessage.warning('请输入评论内容'); return; }
  const resp = await request.post(`/reports/${detail.data.id}/comments`, { content: commentInput.value.trim() });
  if (resp.code === 200) { ElMessage.success('评论已发布'); openView(detail.data.id); }
  else ElMessage.error(resp.msg || '评论失败');
}

/* ===== 流程弹窗 ===== */
const wf = reactive({ visible: false, row: null });
function openWorkflow(r) {
  wf.row = r;
  wf.visible = true;
}

/* ===== 审批操作 ===== */
async function approve(id) {
  try { await ElMessageBox.confirm('确认审阅通过？通过后将流转至下一环节，终审完成后自动归档锁定。', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.post(`/reports/${id}/approve`, { action: 'pass', remark: '' });
  if (resp.code === 200) { ElMessage.success(resp.msg || '审阅通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function hold(id) {
  try { await ElMessageBox.confirm('确认暂存该汇报？暂存后流程暂停，不进入下一环节，可再次操作。', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.post(`/reports/${id}/approve`, { action: 'hold', remark: '' });
  if (resp.code === 200) { ElMessage.success(resp.msg || '已暂存'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
const reject = reactive({ visible: false, id: 0, remark: '' });
function openReject(id) {
  reject.id = id;
  reject.remark = '';
  reject.visible = true;
}
async function submitReject() {
  const remark = reject.remark.trim();
  if (!remark) { ElMessage.warning('驳回必须填写意见'); return; }
  const resp = await request.post(`/reports/${reject.id}/reject`, { remark });
  if (resp.code === 200) { ElMessage.success(resp.msg || '已驳回'); reject.visible = false; load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

/* ===== 整改重提 ===== */
const rs = reactive({
  visible: false, id: 0, version: 1, rejectReason: '',
  showHighlights: false, showProblems: false, longTerm: false,
  form: { content: '', plan: '', highlights: '', problems: '', summary: '', next_plan: '' }
});
const rsMeta = ref(REPORT_META['日报']);
async function openResubmit(id) {
  const resp = await request.get(`/reports/${id}`).catch(() => ({ code: 500 }));
  if (resp.code !== 200) { ElMessage.error(resp.msg || '加载详情失败'); return; }
  const r = resp.data;
  rsMeta.value = REPORT_META[r.type] || REPORT_META['日报'];
  rs.id = id;
  rs.version = (r.version || 1) + 1;
  rs.rejectReason = r.reject_reason || '';
  rs.showHighlights = r.highlights !== undefined && r.type !== '日报';
  rs.showProblems = r.type !== '日报';
  rs.longTerm = LONG_TERM_TYPES.includes(r.type);
  rs.form = {
    content: r.content || '', plan: r.plan || '',
    highlights: r.highlights || '', problems: r.problems || '',
    summary: r.summary || '', next_plan: r.next_plan || ''
  };
  rs.visible = true;
}
async function submitResubmit() {
  const data = { ...rs.form };
  if (!data.content) { ElMessage.warning('汇报内容不能为空'); return; }
  const resp = await request.post(`/reports/${rs.id}/resubmit`, data);
  if (resp.code === 200) { ElMessage.success(resp.msg || '整改重提成功'); rs.visible = false; load(); }
  else ElMessage.error(resp.msg || '重提失败');
}

/* ===== 模板管理 ===== */
const templates = ref([]);
const canManageTpl = computed(() => ['超级管理员', '总经理', '副总', '部门经理'].includes((auth.user || {}).role));
async function loadTemplates() {
  const resp = await request.get('/reports/templates').catch(() => ({ code: 500 }));
  templates.value = resp.code === 200 ? (resp.data || []) : [];
}
const tplForm = reactive({ visible: false, id: 0, name: '', type: '日报', description: '', content_template: '', status: '启用' });
function openTplForm(id) {
  const t = id ? templates.value.find(x => x.id === id) : null;
  tplForm.id = t ? t.id : 0;
  tplForm.name = t ? t.name : '';
  tplForm.type = t ? t.type : '日报';
  tplForm.description = t ? t.description : '';
  tplForm.content_template = t ? t.content_template : '';
  tplForm.status = t ? t.status : '启用';
  tplForm.visible = true;
}
async function saveTemplate() {
  const data = {
    name: tplForm.name.trim(),
    type: tplForm.type,
    description: tplForm.description.trim(),
    content_template: tplForm.content_template,
    status: tplForm.status
  };
  if (!data.name) { ElMessage.warning('模板名称不能为空'); return; }
  const resp = tplForm.id
    ? await request.put(`/reports/templates/${tplForm.id}`, data)
    : await request.post('/reports/templates', data);
  if (resp.code === 200) { ElMessage.success('模板已保存'); tplForm.visible = false; loadTemplates(); }
  else ElMessage.error(resp.msg || '保存失败');
}
async function deleteTemplate(id) {
  try { await ElMessageBox.confirm('确认删除该模板？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.delete(`/reports/templates/${id}`);
  if (resp.code === 200) { ElMessage.success('模板已删除'); loadTemplates(); }
  else ElMessage.error(resp.msg || '删除失败');
}

/* ===== 导出CSV ===== */
function exportCSV() {
  if (!rows.value.length) { ElMessage.warning('暂无数据可导出'); return; }
  const head = ['归档编号', '类型', '日期/期间', '姓名', '部门', '状态', '版本', '逾期', '驳回次数', '提交时间', '内容摘要'];
  const csv = [head.join(',')].concat(rows.value.map(r => [
    r.report_no || '', r.type, r.month || r.date || '', r.user_name, r.dept, r.status,
    r.version || 1, r.is_overdue ? '是' : '否', r.reject_count || 0, r.created_at || '',
    '"' + String(r.content || r.summary || '').replace(/"/g, '""').substring(0, 100) + '"'
  ].join(','))).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `工作汇报台账_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  ElMessage.success('CSV已导出');
}

/* ===== 打印汇报 ===== */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function printReport(id) {
  const r = rows.value.find(x => x.id === id) || (detail.data && detail.data.id === id ? detail.data : null);
  if (!r) return;
  const flow = r.approval_flow || [];
  const isMonthly = r.type === '月报';
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>${escapeHtml(r.type)} - ${escapeHtml(r.user_name)}</title><style>
    body{font-family:'Microsoft YaHei',sans-serif;padding:40px;color:#333;}
    h1{text-align:center;color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:10px;}
    table{width:100%;border-collapse:collapse;margin:20px 0;}
    td{padding:8px 12px;border:1px solid #ddd;}
    .label{background:#f5f5f9;font-weight:bold;width:120px;}
    .content{padding:12px;background:#f9f9f9;border-radius:4px;margin:10px 0;white-space:pre-wrap;}
    .flow-section{margin:20px 0;}
    .flow-step{display:flex;align-items:center;margin-bottom:10px;}
    .flow-step .icon{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:10px;font-size:12px;}
    .flow-step.done .icon{background:#10b981;color:#fff;}
    .flow-step.pending .icon{background:#f5f5f5;color:#999;}
    .flow-arrow{text-align:center;color:#999;margin:2px 0 2px 12px;}
    </style></head><body>
    <h1>卓盟智办公平台 - 工作汇报</h1>
    <table>
      <tr><td class="label">类型</td><td>${escapeHtml(r.type)}</td><td class="label">${isMonthly ? '月份' : '日期'}</td><td>${escapeHtml(isMonthly ? (r.month || r.date) : r.date)}</td></tr>
      <tr><td class="label">姓名</td><td>${escapeHtml(r.user_name)}</td><td class="label">部门</td><td>${escapeHtml(r.dept)}</td></tr>
      <tr><td class="label">状态</td><td colspan="3">${escapeHtml(r.status)}</td></tr>
    </table>
    <h3>${isMonthly ? '本月主要工作' : '工作内容'}</h3><div class="content">${escapeHtml(r.content)}</div>
    ${isMonthly && r.summary ? `<h3>本月工作总结</h3><div class="content">${escapeHtml(r.summary)}</div>` : ''}
    ${r.plan ? `<h3>${isMonthly ? '需改进事项' : '工作计划'}</h3><div class="content">${escapeHtml(r.plan)}</div>` : ''}
    ${isMonthly && r.next_plan ? `<h3>下月工作计划</h3><div class="content">${escapeHtml(r.next_plan)}</div>` : ''}
    ${flow && flow.length ? `
    <div class="flow-section">
      <h3 style="border-bottom:2px solid #2563eb;padding-bottom:6px;">逐级审阅流程</h3>
      ${flow.map(f => `
        <div class="flow-step ${f.done ? 'done' : 'pending'}">
          <div class="icon">${f.done ? '✓' : '○'}</div>
          <div><strong>${escapeHtml(f.step)}</strong> ${escapeHtml(f.user || '')} ${f.time && f.time !== '—' ? '· ' + escapeHtml(f.time) : ''}</div>
        </div>
      `).join('<div class="flow-arrow">↓</div>')}
    </div>` : ''}
    <p style="text-align:right;margin-top:40px;color:#999;">打印时间：${new Date().toLocaleString('zh-CN')}</p>
  </body></html>`);
  w.document.close();
  w.print();
}
</script>

<style scoped>
.reports-page {
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
.stat-card-enhanced { cursor: default; }
.stat-card-enhanced:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }

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
.form-group label .required, .required { color: var(--danger); }
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

/* ===== 信息项 ===== */
.info-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 16px; background: var(--bg-hover);
  border-radius: var(--radius-sm);
}
.info-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.info-value { font-size: 14px; color: var(--text-primary); font-weight: 600; }

/* ===== 工作流图 ===== */
.wf-container {
  overflow-x: auto;
  padding: 16px 8px;
  background: var(--bg-secondary);
  border-radius: 10px;
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px;
}
.wf-track {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: max-content;
}
.wf-step {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  border-radius: 10px;
  border: 2px solid;
  min-width: 100px;
  text-align: center;
  transition: var(--transition);
}
.wf-step .wf-icon { font-size: 20px; line-height: 1; }
.wf-step .wf-name { font-size: 13px; font-weight: 600; white-space: nowrap; }
.wf-step .wf-user { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.wf-step .wf-time { font-size: 10px; color: var(--text-muted); opacity: 0.8; }
.wf-done { background: var(--success-light); border-color: var(--success); }
.wf-done .wf-icon { color: var(--success); }
.wf-current { background: var(--warning-light); border-color: var(--warning); animation: wfPulse 2s ease-in-out infinite; }
.wf-current .wf-icon { color: var(--warning); }
.wf-pending { background: var(--bg-card); border-color: #e5e7eb; opacity: 0.65; }
.wf-pending .wf-icon { color: #9ca3af; }
.wf-arrow { flex-shrink: 0; color: #9ca3af; font-size: 14px; padding: 0 2px; }
.wf-hollow {
  display: inline-block;
  width: 16px; height: 16px;
  border: 2px solid #9ca3af;
  border-radius: 50%;
  vertical-align: middle;
}
@keyframes wfPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
}

/* ===== 工具 ===== */
.text-muted { color: var(--text-muted); }
.text-center { text-align: center; }
.loading {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 40px;
  color: var(--text-muted); font-size: 14px;
}
</style>
