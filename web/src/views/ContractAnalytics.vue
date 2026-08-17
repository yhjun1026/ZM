<template>
  <div class="contract-analytics">
    <!-- 加载中 -->
    <div v-if="pageLoading" class="ca-loading">
      <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载合同分析数据...
    </div>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="ca-error">
      <el-icon :size="40" color="#ef4444" style="margin-bottom: 12px;"><WarningFilled /></el-icon>
      <h3 style="color: #475569;">合同分析数据加载失败</h3>
      <p style="color: #909399;">{{ loadError }}</p>
      <el-button type="primary" style="margin-top: 24px;" @click="loadOverview">
        <el-icon><Refresh /></el-icon> 重试
      </el-button>
    </div>

    <template v-else>
      <!-- 头部 + Tabs -->
      <div class="ca-header">
        <div>
          <h2 style="font-size: 20px; font-weight: 700; margin: 0;">合同分析仪表板</h2>
          <p style="margin: 4px 0 0; color: #909399; font-size: 13px;">
            合同全生命周期数据看板 · {{ today }}
          </p>
        </div>
        <div class="ca-tabs">
          <button class="ca-tab" :class="{ active: activeTab === 'overview' }" @click="switchTab('overview')">
            <el-icon><Odometer /></el-icon> 总览
          </button>
          <button class="ca-tab" :class="{ active: activeTab === 'expiring' }" @click="switchTab('expiring')">
            <el-icon><Clock /></el-icon> 到期预警
            <span v-if="expiringCount > 0" class="ca-badge ca-badge-danger">{{ expiringCount }}</span>
          </button>
          <button class="ca-tab" :class="{ active: activeTab === 'pending' }" @click="switchTab('pending')">
            <el-icon><Bell /></el-icon> 待审批
            <span v-if="pendingCount > 0" class="ca-badge ca-badge-warn">{{ pendingCount }}</span>
          </button>
          <button class="ca-tab" :class="{ active: activeTab === 'templates' }" @click="switchTab('templates')">
            <el-icon><Document /></el-icon> 模板管理
          </button>
          <button class="ca-tab" :class="{ active: activeTab === 'reports' }" @click="switchTab('reports')">
            <el-icon><DataAnalysis /></el-icon> 统计报表
          </button>
        </div>
      </div>

      <!-- ===== 总览 ===== -->
      <template v-show="activeTab === 'overview'">
        <!-- KPI卡片区域 -->
        <div class="ca-kpi-grid">
          <div class="ca-kpi-card" style="--accent: #2563eb;">
            <div class="kpi-icon"><el-icon :size="20"><Tickets /></el-icon></div>
            <div class="kpi-body">
              <div class="kpi-label">合同总数</div>
              <div class="kpi-value">{{ totalContracts }}<span class="kpi-unit">份</span></div>
              <div class="kpi-trend"><el-icon><Folder /></el-icon> 草稿{{ draftCount }} · 审批中{{ pendingCount }}</div>
            </div>
          </div>
          <div class="ca-kpi-card" style="--accent: #10b981;">
            <div class="kpi-icon"><el-icon :size="20"><Money /></el-icon></div>
            <div class="kpi-body">
              <div class="kpi-label">合同总金额</div>
              <div class="kpi-value">{{ fmtAmt(totalAmount) }}</div>
              <div class="kpi-trend"><el-icon><Coin /></el-icon> 均价{{ fmtAmt(avgAmount) }}</div>
            </div>
          </div>
          <div class="ca-kpi-card" style="--accent: #f59e0b;">
            <div class="kpi-icon"><el-icon :size="20"><Bell /></el-icon></div>
            <div class="kpi-body">
              <div class="kpi-label">即将到期(30天)</div>
              <div class="kpi-value">{{ expiringCount }}<span class="kpi-unit">份</span></div>
              <div class="kpi-trend">
                <el-icon :color="expiringCount > 0 ? '#ef4444' : undefined"><WarningFilled /></el-icon>
                {{ expiringCount > 0 ? '需关注续签' : '暂无到期' }}
              </div>
            </div>
          </div>
          <div class="ca-kpi-card" style="--accent: #ef4444;">
            <div class="kpi-icon"><el-icon :size="20"><CircleClose /></el-icon></div>
            <div class="kpi-body">
              <div class="kpi-label">已过期合同</div>
              <div class="kpi-value">{{ expiredCount }}<span class="kpi-unit">份</span></div>
              <div class="kpi-trend"><el-icon><Warning /></el-icon> {{ expiredCount > 0 ? '需及时处理' : '暂无过期' }}</div>
            </div>
          </div>
          <div class="ca-kpi-card" style="--accent: #8b5cf6;">
            <div class="kpi-icon"><el-icon :size="20"><Lock /></el-icon></div>
            <div class="kpi-body">
              <div class="kpi-label">审计日志</div>
              <div class="kpi-value">{{ auditCount }}<span class="kpi-unit">条</span></div>
              <div class="kpi-trend"><el-icon><Clock /></el-icon> 操作记录追溯</div>
            </div>
          </div>
          <div class="ca-kpi-card" style="--accent: #06b6d4;">
            <div class="kpi-icon"><el-icon :size="20"><Document /></el-icon></div>
            <div class="kpi-body">
              <div class="kpi-label">合同模板</div>
              <div class="kpi-value">{{ templateCount }}<span class="kpi-unit">个</span></div>
              <div class="kpi-trend"><el-icon><CopyDocument /></el-icon> 已启用模板</div>
            </div>
          </div>
        </div>

        <!-- 图表区域 -->
        <div class="ca-charts-grid">
          <div class="ca-chart-card">
            <div class="chart-card-header"><h3>合同状态分布</h3></div>
            <div class="chart-container" ref="statusChartRef"></div>
          </div>
          <div class="ca-chart-card">
            <div class="chart-card-header"><h3>合同类型分布</h3></div>
            <div class="chart-container" ref="typeChartRef"></div>
          </div>
          <div class="ca-chart-card ca-chart-wide">
            <div class="chart-card-header"><h3>月度合同趋势(近12个月)</h3></div>
            <div class="chart-container" ref="trendChartRef"></div>
          </div>
        </div>

        <!-- 部门统计表 -->
        <div class="ca-section">
          <div class="ca-section-header">
            <h3><el-icon><OfficeBuilding /></el-icon> 部门合同统计</h3>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>部门</th>
                  <th>合同总数</th>
                  <th>已生效</th>
                  <th>审批中</th>
                  <th>草稿</th>
                  <th>已归档</th>
                  <th>生效中金额</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in departmentStats" :key="d.department">
                  <td><strong>{{ d.department }}</strong></td>
                  <td>{{ d.total }}</td>
                  <td><span style="color: #10b981; font-weight: 600;">{{ d.effective }}</span></td>
                  <td><span style="color: #f59e0b; font-weight: 600;">{{ d.pending }}</span></td>
                  <td>{{ d.draft }}</td>
                  <td>{{ d.archived }}</td>
                  <td style="font-weight: 600; color: #2563eb;">{{ fmtAmt(d.totalAmount) }}</td>
                </tr>
                <tr v-if="departmentStats.length === 0">
                  <td colspan="7" style="text-align: center; color: #909399;">暂无数据</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ===== 到期预警 ===== -->
      <div v-show="activeTab === 'expiring'" class="ca-section">
        <div class="ca-section-header">
          <h3><el-icon color="#f59e0b"><Clock /></el-icon> 即将到期合同预警</h3>
          <div class="ca-filter">
            <button v-for="d in [30, 60, 90]" :key="d"
              class="btn btn-sm" :class="expiringDays === d ? 'btn-primary' : 'btn-outline'"
              @click="loadExpiringContracts(d)">{{ d }}天内</button>
          </div>
        </div>
        <div v-if="expiringLoading" class="ca-loading">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载到期预警...
        </div>
        <template v-else-if="expiringData">
          <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
            <div class="ca-stat-pill" style="background: rgba(239,68,68,0.1); color: #ef4444;">
              <span style="font-size: 20px; font-weight: 700;">{{ expiringData.urgencyStats.critical }}</span><span>7天内到期</span>
            </div>
            <div class="ca-stat-pill" style="background: rgba(249,115,22,0.1); color: #f97316;">
              <span style="font-size: 20px; font-weight: 700;">{{ expiringData.urgencyStats.high }}</span><span>8-30天到期</span>
            </div>
            <div class="ca-stat-pill" style="background: rgba(245,158,11,0.1); color: #f59e0b;">
              <span style="font-size: 20px; font-weight: 700;">{{ expiringData.urgencyStats.medium }}</span><span>31-60天到期</span>
            </div>
            <div class="ca-stat-pill" style="background: rgba(16,185,129,0.1); color: #10b981;">
              <span style="font-size: 20px; font-weight: 700;">{{ expiringData.urgencyStats.low }}</span><span>61-90天到期</span>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>紧急程度</th>
                  <th>剩余天数</th>
                  <th>合同编号</th>
                  <th>合同名称</th>
                  <th>合同类型</th>
                  <th>合作方</th>
                  <th>金额</th>
                  <th>到期日期</th>
                  <th>经办人</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ct in expiringData.contracts" :key="ct.id || ct.contract_no"
                  :style="{ borderLeft: '3px solid ' + (urgencyColor[ct.urgency] || '#94a3b8') }">
                  <td><span class="ca-urgency-tag" :style="{ background: urgencyColor[ct.urgency] || '#94a3b8' }">{{ ct.urgency }}</span></td>
                  <td :style="{ fontWeight: 700, color: urgencyColor[ct.urgency] || 'inherit' }">{{ ct.remainingDays }}天</td>
                  <td>{{ ct.contract_no || '—' }}</td>
                  <td>{{ ct.contract_name || '—' }}</td>
                  <td>{{ ct.contract_type || '—' }}</td>
                  <td>{{ ct.partner_company || '—' }}</td>
                  <td>{{ fmtAmt(ct.amount) }}</td>
                  <td>{{ ct.end_date || '—' }}</td>
                  <td>{{ ct.handler || '—' }}</td>
                </tr>
                <tr v-if="!expiringData.contracts || expiringData.contracts.length === 0">
                  <td colspan="9" style="text-align: center; color: #909399; padding: 30px;">
                    <el-icon :size="32" color="#10b981" style="display: block; margin: 0 auto 8px;"><CircleCheck /></el-icon>
                    {{ expiringDays }}天内无到期合同
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p v-else-if="expiringError" style="color: #909399;">加载失败: {{ expiringError }}</p>
      </div>

      <!-- ===== 待审批 ===== -->
      <div v-show="activeTab === 'pending'" class="ca-section">
        <div class="ca-section-header">
          <h3><el-icon color="#f59e0b"><Bell /></el-icon> 待审批合同流程</h3>
        </div>
        <div v-if="pendingLoading" class="ca-loading">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载待审批合同...
        </div>
        <template v-else-if="pendingData">
          <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
            <div v-for="(count, type) in pendingData.typeStats" :key="type" class="ca-stat-pill"
              :style="{ background: (flowTypeColor[type] || '#94a3b8') + '15', color: flowTypeColor[type] || '#64748b' }">
              <span style="font-size: 20px; font-weight: 700;">{{ count }}</span><span>{{ type }}</span>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>流程类型</th>
                  <th>合同编号</th>
                  <th>合同名称</th>
                  <th>合作方</th>
                  <th>金额</th>
                  <th>当前审批节点</th>
                  <th>发起人</th>
                  <th>发起时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(f, i) in pendingData.pendingFlows" :key="f.id || i">
                  <td><span class="ca-flow-tag" :style="{ background: flowTypeColor[f.flowTypeName] || '#94a3b8' }">{{ f.flowTypeName }}</span></td>
                  <td>{{ f.contractNo || '—' }}</td>
                  <td>{{ f.contractName || '—' }}</td>
                  <td>{{ f.partnerCompany || '—' }}</td>
                  <td>{{ fmtAmt(f.amount) }}</td>
                  <td>
                    <span style="color: #f59e0b; font-weight: 600;">
                      <el-icon><Pointer /></el-icon> {{ f.currentApprover || f.currentNode || '—' }}
                    </span>
                  </td>
                  <td>{{ f.startedBy || '—' }}</td>
                  <td>{{ f.startedAt || '—' }}</td>
                  <td>
                    <button class="btn btn-sm btn-outline" @click="goContract">
                      <el-icon><ArrowRight /></el-icon> 去处理
                    </button>
                  </td>
                </tr>
                <tr v-if="!pendingData.pendingFlows || pendingData.pendingFlows.length === 0">
                  <td colspan="9" style="text-align: center; color: #909399; padding: 30px;">
                    <el-icon :size="32" color="#10b981" style="display: block; margin: 0 auto 8px;"><CircleCheck /></el-icon>
                    暂无待审批合同
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p v-else-if="pendingError" style="color: #909399;">加载失败: {{ pendingError }}</p>
      </div>

      <!-- ===== 模板管理 ===== -->
      <div v-show="activeTab === 'templates'" class="ca-section">
        <div class="ca-section-header">
          <h3><el-icon><Document /></el-icon> 合同模板管理</h3>
          <button class="btn btn-primary btn-sm" @click="showTemplateModal()">
            <el-icon><Plus /></el-icon> 新建模板
          </button>
        </div>
        <div v-if="templatesLoading" class="ca-loading">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载合同模板...
        </div>
        <template v-else-if="templatesData">
          <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
            <div v-for="(count, cat) in templatesData.categoryStats" :key="cat" class="ca-stat-pill"
              style="background: rgba(6,182,212,0.1); color: #06b6d4;">
              <span style="font-size: 20px; font-weight: 700;">{{ count }}</span><span>{{ cat }}</span>
            </div>
          </div>
          <div class="ca-template-grid">
            <div v-for="t in templatesData.templates" :key="t.id"
              class="ca-template-card" :class="{ 'ca-template-disabled': t.status !== '启用' }">
              <div class="ca-template-header">
                <div class="ca-template-icon"><el-icon :size="14"><Document /></el-icon></div>
                <div>
                  <h4 style="margin: 0; font-size: 14px; font-weight: 600;">{{ t.name }}</h4>
                  <span style="font-size: 12px; color: #909399;">{{ t.category || '未分类' }}</span>
                </div>
                <span class="ca-template-status" :class="t.status === '启用' ? 'status-active' : 'status-inactive'">{{ t.status }}</span>
              </div>
              <div class="ca-template-body">
                <p style="margin: 0; font-size: 12px; color: #909399;">创建人: {{ t.creator || '—' }} · {{ t.created_at || '' }}</p>
                <p style="margin: 4px 0 0; font-size: 12px; color: #909399;">字段数: {{ (t.fields || []).length }}个</p>
              </div>
              <div class="ca-template-actions">
                <button class="btn btn-sm btn-outline" @click="showTemplateModal(t.id)">
                  <el-icon><Edit /></el-icon> 编辑
                </button>
                <button class="btn btn-sm btn-outline" @click="toggleTemplateStatus(t)">
                  <el-icon><VideoPause v-if="t.status === '启用'" /><VideoPlay v-else /></el-icon>
                  {{ t.status === '启用' ? '禁用' : '启用' }}
                </button>
                <button v-if="t.status !== '启用'" class="btn btn-sm btn-danger" @click="deleteTemplate(t)">
                  <el-icon><Delete /></el-icon> 删除
                </button>
              </div>
            </div>
            <div v-if="!templatesData.templates || templatesData.templates.length === 0"
              style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #909399;">
              <el-icon :size="48" style="display: block; margin: 0 auto 12px;"><Box /></el-icon>
              暂无合同模板，点击右上角"新建模板"创建
            </div>
          </div>
        </template>
        <p v-else-if="templatesError" style="color: #909399;">加载失败: {{ templatesError }}</p>
      </div>

      <!-- ===== 统计报表 ===== -->
      <div v-show="activeTab === 'reports'" class="ca-section">
        <div class="ca-section-header">
          <h3><el-icon><DataAnalysis /></el-icon> 增强统计报表</h3>
          <div class="ca-filter">
            <button class="btn btn-sm btn-outline" @click="exportReportCSV('monthly')"><el-icon><Download /></el-icon> 月度签约</button>
            <button class="btn btn-sm btn-outline" @click="exportReportCSV('department')"><el-icon><Download /></el-icon> 部门统计</button>
            <button class="btn btn-sm btn-outline" @click="exportReportCSV('expiry')"><el-icon><Download /></el-icon> 到期统计</button>
            <button class="btn btn-sm btn-outline" @click="exportReportCSV('partner')"><el-icon><Download /></el-icon> 合作方排名</button>
          </div>
        </div>
        <div v-if="reportsLoading" class="ca-loading">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载统计报表数据...
        </div>
        <template v-else-if="reportsData">
          <!-- 报表KPI -->
          <div class="ca-report-kpi-grid">
            <div class="ca-report-kpi" style="--accent: #2563eb;">
              <div class="rpt-icon"><el-icon :size="20"><Calendar /></el-icon></div>
              <div class="rpt-body">
                <div class="rpt-label">月均签约</div>
                <div class="rpt-value">{{ reportsData.monthly.summary?.avgMonthly || 0 }}<span class="rpt-unit">份/月</span></div>
                <div class="rpt-sub">累计{{ reportsData.monthly.summary?.totalSigned || 0 }}份 · {{ fmtAmtRpt(reportsData.monthly.summary?.totalAmount || 0) }}</div>
              </div>
            </div>
            <div class="ca-report-kpi" style="--accent: #10b981;">
              <div class="rpt-icon"><el-icon :size="20"><OfficeBuilding /></el-icon></div>
              <div class="rpt-body">
                <div class="rpt-label">签约部门</div>
                <div class="rpt-value">{{ reportsData.dept.summary?.totalDepartments || 0 }}<span class="rpt-unit">个</span></div>
                <div class="rpt-sub">签约{{ reportsData.dept.summary?.totalSigned || 0 }}份 · {{ fmtAmtRpt(reportsData.dept.summary?.totalAmount || 0) }}</div>
              </div>
            </div>
            <div class="ca-report-kpi" style="--accent: #f59e0b;">
              <div class="rpt-icon"><el-icon :size="20"><Clock /></el-icon></div>
              <div class="rpt-body">
                <div class="rpt-label">即将到期(6月)</div>
                <div class="rpt-value">{{ reportsData.expiry.summary?.totalExpiring || 0 }}<span class="rpt-unit">份</span></div>
                <div class="rpt-sub" :style="{ color: (reportsData.expiry.summary?.expiredCount || 0) > 0 ? '#ef4444' : undefined }">
                  已过期{{ reportsData.expiry.summary?.expiredCount || 0 }}份
                </div>
              </div>
            </div>
            <div class="ca-report-kpi" style="--accent: #8b5cf6;">
              <div class="rpt-icon"><el-icon :size="20"><Connection /></el-icon></div>
              <div class="rpt-body">
                <div class="rpt-label">合作方总数</div>
                <div class="rpt-value">{{ reportsData.partner.summary?.totalPartners || 0 }}<span class="rpt-unit">家</span></div>
                <div class="rpt-sub">TOP1: {{ reportsData.partner.summary?.topPartner || '—' }}</div>
              </div>
            </div>
          </div>

          <!-- 月度签约统计图表 -->
          <div class="ca-report-section">
            <div class="ca-report-title">
              <h3><el-icon color="#2563eb"><TrendCharts /></el-icon> 月度签约金额统计</h3>
              <span class="ca-report-desc">近12个月每月签约合同数量与金额趋势</span>
            </div>
            <div class="ca-chart-container" ref="rptMonthlyChartRef"></div>
          </div>

          <!-- 部门签约统计图表 -->
          <div class="ca-report-section">
            <div class="ca-report-title">
              <h3><el-icon color="#10b981"><OfficeBuilding /></el-icon> 部门签约统计</h3>
              <span class="ca-report-desc">各部门合同签约数量与金额对比</span>
            </div>
            <div class="ca-chart-container" ref="rptDeptChartRef"></div>
          </div>

          <!-- 到期统计图表 -->
          <div class="ca-report-section">
            <div class="ca-report-title">
              <h3><el-icon color="#f59e0b"><Clock /></el-icon> 到期合同统计</h3>
              <span class="ca-report-desc">未来6个月即将到期合同数量与金额分布</span>
            </div>
            <div class="ca-chart-container" ref="rptExpiryChartRef"></div>
          </div>

          <!-- 合作方排名图表 -->
          <div class="ca-report-section">
            <div class="ca-report-title">
              <h3><el-icon color="#8b5cf6"><Trophy /></el-icon> 合作方排名TOP10</h3>
              <span class="ca-report-desc">按合同金额排名的前10位合作方</span>
            </div>
            <div class="ca-chart-container" style="height: 400px;" ref="rptPartnerChartRef"></div>
          </div>
        </template>
        <div v-else-if="reportsError" style="text-align: center; padding: 30px;">
          <el-icon :size="32" color="#ef4444"><WarningFilled /></el-icon>
          <p style="color: #909399; margin-top: 12px;">统计报表加载失败: {{ reportsError }}</p>
        </div>
      </div>
    </template>

    <!-- 模板新建/编辑弹窗 -->
    <el-dialog v-model="templateDialogVisible" :title="editingTemplate ? '编辑合同模板' : '新建合同模板'" width="600px">
      <el-form label-width="80px">
        <el-form-item required>
          <template #label>模板名称</template>
          <el-input v-model="templateForm.name" placeholder="请输入模板名称" maxlength="50" />
        </el-form-item>
        <el-form-item>
          <template #label>模板分类</template>
          <el-select v-model="templateForm.category" placeholder="请选择分类" style="width: 100%;">
            <el-option label="服务合同" value="服务合同" />
            <el-option label="销售合同" value="销售合同" />
            <el-option label="采购合同" value="采购合同" />
            <el-option label="保密合同" value="保密合同" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <template #label>模板内容</template>
          <el-input v-model="templateForm.content" type="textarea" :rows="8" placeholder="请输入合同模板内容...支持纯文本" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate"><el-icon><Check /></el-icon> 保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Loading, Refresh, WarningFilled, Warning, Odometer, Clock, Bell, Document,
  DataAnalysis, Tickets, Money, Coin, Folder, CircleClose, Lock, CopyDocument,
  OfficeBuilding, CircleCheck, Pointer, ArrowRight, Plus, Edit, Delete,
  VideoPause, VideoPlay, Box, Download, Calendar, Connection, TrendCharts,
  Trophy, Check
} from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import request from '../api/request';

const router = useRouter();

// ===== 状态颜色映射 =====
const statusColors = {
  '草稿': '#94a3b8', '审批中': '#f59e0b', '已生效': '#10b981',
  '已盖章': '#06b6d4', '已归档': '#6366f1', '变更中': '#8b5cf6',
  '已终止': '#ef4444', '终止中': '#f97316', '已作废': '#dc2626'
};
const getStatusColor = (s) => statusColors[s] || '#94a3b8';
const urgencyColor = { '紧急': '#ef4444', '高': '#f97316', '中': '#f59e0b', '低': '#10b981' };
const flowTypeColor = {
  '合同新签': '#10b981', '合同变更': '#8b5cf6', '合同终止': '#ef4444', '合同借阅': '#06b6d4'
};

// 金额格式化
const fmtAmt = (n) => {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
  return '¥' + (n || 0).toLocaleString();
};
const fmtAmtRpt = (n) => {
  if (!n) return '¥0';
  if (n >= 100000000) return '¥' + (n / 100000000).toFixed(2) + '亿';
  if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
  return '¥' + n.toLocaleString();
};

const today = new Date().toLocaleDateString('zh-CN');
const activeTab = ref('overview');
const pageLoading = ref(true);
const loadError = ref('');

// KPI数据
const totalContracts = ref(0);
const totalAmount = ref(0);
const avgAmount = ref(0);
const pendingCount = ref(0);
const draftCount = ref(0);
const expiringCount = ref(0);
const expiredCount = ref(0);
const templateCount = ref(0);
const auditCount = ref(0);
const departmentStats = ref([]);

// 各Tab数据（懒加载缓存）
const expiringDays = ref(30);
const expiringData = ref(null);
const expiringLoading = ref(false);
const expiringError = ref('');

const pendingData = ref(null);
const pendingLoading = ref(false);
const pendingError = ref('');

const templatesData = ref(null);
const templatesLoading = ref(false);
const templatesError = ref('');

const reportsData = ref(null);
const reportsLoading = ref(false);
const reportsError = ref('');

// 图表ref
const statusChartRef = ref(null);
const typeChartRef = ref(null);
const trendChartRef = ref(null);
const rptMonthlyChartRef = ref(null);
const rptDeptChartRef = ref(null);
const rptExpiryChartRef = ref(null);
const rptPartnerChartRef = ref(null);

let chartInstances = [];

function makeChart(el) {
  const chart = echarts.init(el);
  chartInstances.push(chart);
  return chart;
}

// ===== 加载总览数据 =====
async function loadOverview() {
  pageLoading.value = true;
  loadError.value = '';
  try {
    const [overviewResp, deptResp, trendResp] = await Promise.all([
      request.get('/contract-analytics/overview'),
      request.get('/contract-analytics/department-stats'),
      request.get('/contract-analytics/monthly-trend')
    ]);

    const ov = (overviewResp && overviewResp.data) || {};
    const dept = (deptResp && deptResp.data) || {};
    const trend = (trendResp && trendResp.data) || {};

    totalContracts.value = ov.total || 0;
    totalAmount.value = (ov.amount && ov.amount.total) || 0;
    avgAmount.value = (ov.amount && ov.amount.average) || 0;
    pendingCount.value = ov.pendingApproval || 0;
    draftCount.value = ov.draft || 0;
    expiringCount.value = ov.expiringWithin30Days || 0;
    expiredCount.value = ov.expiredCount || 0;
    templateCount.value = ov.templateCount || 0;
    auditCount.value = ov.auditLogCount || 0;
    departmentStats.value = dept.departmentStats || [];

    pageLoading.value = false;
    await nextTick();
    renderOverviewCharts(ov, trend);
  } catch (e) {
    console.error('[contractAnalytics] render error:', e);
    loadError.value = e.message || '未知错误';
    pageLoading.value = false;
  }
}

function renderOverviewCharts(ov, trend) {
  // 状态分布(环形图)
  const statusData = ov.statusDistribution || [];
  if (statusData.length > 0 && statusChartRef.value) {
    makeChart(statusChartRef.value).setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', right: 0, top: 'middle', itemGap: 12, textStyle: { fontSize: 12 } },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['38%', '50%'],
        data: statusData.map(s => ({
          name: s.status,
          value: s.count,
          itemStyle: { color: getStatusColor(s.status), borderColor: '#fff', borderWidth: 2 }
        })),
        label: { show: false }
      }]
    });
  }

  // 类型分布(柱状图)
  const typeData = ov.typeDistribution || [];
  if (typeData.length > 0 && typeChartRef.value) {
    const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#f97316', '#6366f1'];
    makeChart(typeChartRef.value).setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 16, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: typeData.map(t => t.type) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [{
        name: '合同数量',
        type: 'bar',
        data: typeData.map((t, i) => ({ value: t.count, itemStyle: { color: palette[i % palette.length] } })),
        barMaxWidth: 40,
        itemStyle: { borderRadius: [6, 6, 0, 0] }
      }]
    });
  }

  // 月度趋势(折线图)
  const trendData = trend.trends || [];
  if (trendData.length > 0 && trendChartRef.value) {
    makeChart(trendChartRef.value).setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 40, right: 16, top: 36, bottom: 30 },
      xAxis: { type: 'category', data: trendData.map(t => t.month) },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: '新建合同', type: 'line', data: trendData.map(t => t.newContracts),
          smooth: 0.3, symbolSize: 8,
          lineStyle: { color: '#2563eb' }, itemStyle: { color: '#2563eb' },
          areaStyle: { color: 'rgba(37,99,235,0.08)' }
        },
        {
          name: '生效合同', type: 'line', data: trendData.map(t => t.effective),
          smooth: 0.3, symbolSize: 8,
          lineStyle: { color: '#10b981' }, itemStyle: { color: '#10b981' },
          areaStyle: { color: 'rgba(16,185,129,0.08)' }
        },
        {
          name: '归档合同', type: 'line', data: trendData.map(t => t.archived),
          smooth: 0.3, symbolSize: 8,
          lineStyle: { color: '#8b5cf6' }, itemStyle: { color: '#8b5cf6' },
          areaStyle: { color: 'rgba(139,92,246,0.08)' }
        }
      ]
    });
  }
}

// ===== Tab切换 =====
function switchTab(cat) {
  activeTab.value = cat;
  if (cat === 'expiring' && !expiringData.value) loadExpiringContracts(30);
  if (cat === 'pending' && !pendingData.value) loadPendingApprovals();
  if (cat === 'templates' && !templatesData.value) loadTemplates();
  if (cat === 'reports' && !reportsData.value) loadStatReports();
}

// ===== 加载到期预警合同 =====
async function loadExpiringContracts(days) {
  expiringDays.value = days;
  expiringLoading.value = true;
  expiringError.value = '';
  const resp = await request.get('/contract-analytics/expiring?days=' + days);
  expiringLoading.value = false;
  if (resp.code !== 200) {
    expiringError.value = resp.msg || '';
    return;
  }
  expiringData.value = resp.data;
}

// ===== 加载待审批合同 =====
async function loadPendingApprovals() {
  pendingLoading.value = true;
  pendingError.value = '';
  const resp = await request.get('/contract-analytics/pending-approvals');
  pendingLoading.value = false;
  if (resp.code !== 200) {
    pendingError.value = resp.msg || '';
    return;
  }
  pendingData.value = resp.data;
}

function goContract() {
  router.push('/contract');
}

// ===== 加载合同模板列表 =====
async function loadTemplates() {
  templatesLoading.value = true;
  templatesError.value = '';
  const resp = await request.get('/contract-analytics/templates');
  templatesLoading.value = false;
  if (resp.code !== 200) {
    templatesError.value = resp.msg || '';
    return;
  }
  templatesData.value = resp.data;
}

// ===== 模板弹窗 =====
const templateDialogVisible = ref(false);
const editingTemplate = ref(null);
const templateForm = ref({ name: '', category: '', content: '' });

function showTemplateModal(templateId) {
  let tpl = null;
  if (templateId && templatesData.value) {
    tpl = (templatesData.value.templates || []).find(t => t.id === templateId) || null;
  }
  editingTemplate.value = tpl;
  templateForm.value = {
    name: tpl ? tpl.name : '',
    category: tpl ? (tpl.category || '') : '',
    content: tpl ? (tpl.content || '') : ''
  };
  templateDialogVisible.value = true;
}

async function saveTemplate() {
  const name = (templateForm.value.name || '').trim();
  if (!name) { ElMessage.error('请输入模板名称'); return; }
  const data = { name, category: templateForm.value.category, content: templateForm.value.content };

  const id = editingTemplate.value ? editingTemplate.value.id : null;
  const resp = id
    ? await request.put('/contract-analytics/templates/' + id, data)
    : await request.post('/contract-analytics/templates', data);
  if (resp.code === 200) {
    ElMessage.success(id ? '模板更新成功' : '模板创建成功');
    templateDialogVisible.value = false;
    loadTemplates();
  } else {
    ElMessage.error(resp.msg || (id ? '更新失败' : '创建失败'));
  }
}

async function toggleTemplateStatus(t) {
  const newStatus = t.status === '启用' ? '禁用' : '启用';
  const resp = await request.put('/contract-analytics/templates/' + t.id, { status: newStatus });
  if (resp.code === 200) {
    ElMessage.success('模板已' + newStatus);
    loadTemplates();
  } else {
    ElMessage.error(resp.msg || '操作失败');
  }
}

async function deleteTemplate(t) {
  try {
    await ElMessageBox.confirm('确认删除该合同模板？此操作不可撤销。', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete('/contract-analytics/templates/' + t.id);
  if (resp.code === 200) {
    ElMessage.success('模板已删除');
    loadTemplates();
  } else {
    ElMessage.error(resp.msg || '删除失败');
  }
}

// ===== 统计报表 =====
async function loadStatReports() {
  reportsLoading.value = true;
  reportsError.value = '';
  try {
    const [monthlyResp, deptResp, expiryResp, partnerResp] = await Promise.all([
      request.get('/contract-analytics/monthly-signing-stat?months=12'),
      request.get('/contract-analytics/department-signing-stat'),
      request.get('/contract-analytics/expiry-stat?months=6'),
      request.get('/contract-analytics/partner-ranking?sortBy=amount&limit=10')
    ]);

    if (monthlyResp.code !== 200 || deptResp.code !== 200 || expiryResp.code !== 200 || partnerResp.code !== 200) {
      reportsLoading.value = false;
      reportsError.value = '部分报表数据加载失败，请刷新重试';
      return;
    }

    reportsData.value = {
      monthly: monthlyResp.data || {},
      dept: deptResp.data || {},
      expiry: expiryResp.data || {},
      partner: partnerResp.data || {}
    };
    reportsLoading.value = false;
    await nextTick();
    renderReportCharts();
  } catch (e) {
    console.error('[loadStatReports] error:', e);
    reportsLoading.value = false;
    reportsError.value = e.message || '';
  }
}

function renderReportCharts() {
  const monthly = reportsData.value.monthly.monthlyStats || [];
  const dept = reportsData.value.dept.departmentStats || [];
  const expiry = reportsData.value.expiry.expiryStats || [];
  const partners = reportsData.value.partner.partners || [];

  const dualAxisGrid = { left: 50, right: 60, top: 40, bottom: 30 };

  // 1. 月度签约统计 (双Y轴: 数量柱状图 + 金额折线图)
  if (monthly.length > 0 && rptMonthlyChartRef.value) {
    makeChart(rptMonthlyChartRef.value).setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: dualAxisGrid,
      xAxis: { type: 'category', data: monthly.map(m => m.month) },
      yAxis: [
        { type: 'value', name: '签约数量(份)', minInterval: 1, position: 'left' },
        { type: 'value', name: '金额(万元)', position: 'right', splitLine: { show: false } }
      ],
      series: [
        {
          name: '签约数量', type: 'bar', data: monthly.map(m => m.signedCount),
          itemStyle: { color: 'rgba(37,99,235,0.7)', borderColor: '#2563eb', borderWidth: 1 }
        },
        {
          name: '签约金额(万元)', type: 'line', yAxisIndex: 1,
          data: monthly.map(m => Math.round((m.totalAmount || 0) / 10000 * 10) / 10),
          smooth: 0.3, symbolSize: 8,
          lineStyle: { color: '#ef4444' }, itemStyle: { color: '#ef4444' },
          areaStyle: { color: 'rgba(239,68,68,0.1)' }
        }
      ]
    });
  }

  // 2. 部门签约统计 (水平柱状图: 数量 + 金额折线)
  if (dept.length > 0 && rptDeptChartRef.value) {
    makeChart(rptDeptChartRef.value).setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 90, right: 60, top: 40, bottom: 30 },
      xAxis: [
        { type: 'value', name: '签约数量(份)', minInterval: 1 },
        { type: 'value', name: '金额(万元)', position: 'top', splitLine: { show: false } }
      ],
      yAxis: { type: 'category', data: dept.map(d => d.department) },
      series: [
        {
          name: '签约数量', type: 'bar', data: dept.map(d => d.signedCount),
          itemStyle: { color: 'rgba(16,185,129,0.7)', borderColor: '#10b981', borderWidth: 1 }
        },
        {
          name: '签约金额(万元)', type: 'line', xAxisIndex: 1,
          data: dept.map(d => Math.round((d.totalAmount || 0) / 10000 * 10) / 10),
          smooth: 0.3, symbolSize: 9,
          lineStyle: { color: '#f59e0b' }, itemStyle: { color: '#f59e0b' }
        }
      ]
    });
  }

  // 3. 到期统计 (柱状图: 数量 + 金额折线)
  if (expiry.length > 0 && rptExpiryChartRef.value) {
    makeChart(rptExpiryChartRef.value).setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: dualAxisGrid,
      xAxis: { type: 'category', data: expiry.map(e => e.month) },
      yAxis: [
        { type: 'value', name: '到期数量(份)', minInterval: 1, position: 'left' },
        { type: 'value', name: '金额(万元)', position: 'right', splitLine: { show: false } }
      ],
      series: [
        {
          name: '到期数量', type: 'bar', data: expiry.map(e => e.expiringCount),
          itemStyle: { color: 'rgba(245,158,11,0.7)', borderColor: '#f59e0b', borderWidth: 1 }
        },
        {
          name: '到期金额(万元)', type: 'line', yAxisIndex: 1,
          data: expiry.map(e => Math.round((e.totalAmount || 0) / 10000 * 10) / 10),
          smooth: 0.3, symbolSize: 8,
          lineStyle: { color: '#ef4444' }, itemStyle: { color: '#ef4444' },
          areaStyle: { color: 'rgba(239,68,68,0.1)' }
        }
      ]
    });
  }

  // 4. 合作方排名 (水平柱状图)
  if (partners.length > 0 && rptPartnerChartRef.value) {
    const partnerNames = partners.map(p => p.partnerName.length > 12 ? p.partnerName.substring(0, 10) + '..' : p.partnerName);
    makeChart(rptPartnerChartRef.value).setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 110, right: 60, top: 40, bottom: 30 },
      xAxis: [
        { type: 'value', name: '合同数量(份)', minInterval: 1 },
        { type: 'value', name: '金额(万元)', position: 'top', splitLine: { show: false } }
      ],
      yAxis: { type: 'category', data: partnerNames, inverse: true },
      series: [
        {
          name: '合同数量', type: 'bar', data: partners.map(p => p.contractCount),
          itemStyle: { color: 'rgba(139,92,246,0.7)', borderColor: '#8b5cf6', borderWidth: 1 }
        },
        {
          name: '签约金额(万元)', type: 'line', xAxisIndex: 1,
          data: partners.map(p => Math.round((p.totalAmount || 0) / 10000 * 10) / 10),
          smooth: 0.3, symbolSize: 9,
          lineStyle: { color: '#ef4444' }, itemStyle: { color: '#ef4444' }
        }
      ]
    });
  }
}

// ===== 导出CSV =====
function exportReportCSV(type) {
  if (!reportsData.value) { ElMessage.warning('请先加载报表数据'); return; }
  const BOM = '﻿';
  let csv = '';
  let filename = '';
  const raw = (n) => n || 0;

  if (type === 'monthly') {
    filename = '月度签约统计_' + new Date().toISOString().slice(0, 10) + '.csv';
    csv = '月份,签约数量,签约总金额(元),平均金额(元)\n';
    (reportsData.value.monthly.monthlyStats || []).forEach(m => {
      csv += `${m.month},${m.signedCount},${raw(m.totalAmount)},${raw(m.avgAmount)}\n`;
    });
    const s = reportsData.value.monthly.summary || {};
    csv += `\n汇总,签约总数=${s.totalSigned || 0},签约总金额=${raw(s.totalAmount)},月均=${s.avgMonthly || 0}\n`;
  } else if (type === 'department') {
    filename = '部门签约统计_' + new Date().toISOString().slice(0, 10) + '.csv';
    csv = '部门,合同总数,已签约,审批中,草稿,已终止,签约总金额(元),平均金额(元),最大金额(元)\n';
    (reportsData.value.dept.departmentStats || []).forEach(d => {
      csv += `${d.department},${d.totalContracts},${d.signedCount},${d.pendingCount},${d.draftCount},${d.terminatedCount},${raw(d.totalAmount)},${raw(d.avgAmount)},${raw(d.maxAmount)}\n`;
    });
  } else if (type === 'expiry') {
    filename = '到期合同统计_' + new Date().toISOString().slice(0, 10) + '.csv';
    csv = '月份,到期数量,到期总金额(元),平均金额(元)\n';
    (reportsData.value.expiry.expiryStats || []).forEach(e => {
      csv += `${e.month},${e.expiringCount},${raw(e.totalAmount)},${raw(e.avgAmount)}\n`;
    });
    const s = reportsData.value.expiry.summary || {};
    csv += `\n汇总,即将到期=${s.totalExpiring || 0},到期总金额=${raw(s.totalAmount)},已过期=${s.expiredCount || 0},已过期金额=${raw(s.expiredAmount)}\n`;
  } else if (type === 'partner') {
    filename = '合作方排名_' + new Date().toISOString().slice(0, 10) + '.csv';
    csv = '排名,合作方,合同数量,已签约,审批中,已终止,签约总金额(元),最大金额(元),平均金额(元),首次合作,最近合作\n';
    (reportsData.value.partner.partners || []).forEach((p, i) => {
      csv += `${i + 1},${p.partnerName},${p.contractCount},${p.signedCount},${p.pendingCount},${p.terminatedCount},${raw(p.totalAmount)},${raw(p.maxAmount)},${raw(p.avgAmount)},${p.firstCooperation || ''},${p.lastCooperation || ''}\n`;
    });
  }

  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  ElMessage.success('CSV导出成功: ' + filename);
}

// ===== 生命周期 =====
const resizeHandler = () => chartInstances.forEach(c => c.resize());

onMounted(() => {
  loadOverview();
  window.addEventListener('resize', resizeHandler);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeHandler);
  chartInstances.forEach(c => c.dispose());
  chartInstances = [];
});
</script>

<style scoped>
.contract-analytics { padding: 20px; }

.ca-loading { padding: 30px; text-align: center; color: #909399; }
.ca-error { padding: 40px; text-align: center; }

.ca-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
.ca-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.ca-tab {
  padding: 8px 16px; border: 1px solid #e5e7eb; background: #f8fafc;
  border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; color: #475569;
  transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
}
.ca-tab:hover { border-color: #2563eb; color: #2563eb; }
.ca-tab.active { background: #2563eb; color: #fff; border-color: #2563eb; }
.ca-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font-size: 11px; font-weight: 700; margin-left: 4px; }
.ca-badge-danger { background: #ef4444; color: #fff; }
.ca-badge-warn { background: #f59e0b; color: #fff; }

.ca-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.ca-kpi-card {
  background: #fff; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 16px;
  border: 1px solid #e5e7eb; position: relative; overflow: hidden; transition: all 0.2s;
}
.ca-kpi-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.06); transform: translateY(-2px); }
.ca-kpi-card .kpi-icon {
  width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
  color: #fff; background: var(--accent); flex-shrink: 0;
}
.ca-kpi-card .kpi-body { flex: 1; min-width: 0; }
.ca-kpi-card .kpi-label { font-size: 13px; color: #909399; margin-bottom: 4px; }
.ca-kpi-card .kpi-value { font-size: 24px; font-weight: 700; color: #1f2937; }
.ca-kpi-card .kpi-unit { font-size: 14px; font-weight: 500; color: #909399; margin-left: 4px; }
.ca-kpi-card .kpi-trend { font-size: 12px; color: #909399; margin-top: 4px; display: flex; align-items: center; gap: 4px; }

.ca-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.ca-chart-wide { grid-column: 1 / -1; }
.ca-chart-card { background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #e5e7eb; }
.ca-chart-card .chart-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.ca-chart-card .chart-card-header h3 { font-size: 14px; font-weight: 600; margin: 0; }
.ca-chart-card .chart-container { height: 260px; position: relative; }

.ca-section { background: #fff; border-radius: 12px; padding: 16px; border: 1px solid #e5e7eb; margin-bottom: 20px; }
.ca-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.ca-section-header h3 { font-size: 15px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px; }
.ca-filter { display: flex; gap: 6px; flex-wrap: wrap; }

.ca-stat-pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 500; }
.ca-stat-pill > span:last-child { opacity: 0.8; }

.ca-urgency-tag { display: inline-block; padding: 2px 10px; border-radius: 4px; color: #fff; font-size: 11px; font-weight: 600; }
.ca-flow-tag { display: inline-block; padding: 2px 10px; border-radius: 4px; color: #fff; font-size: 11px; font-weight: 600; }

.ca-template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.ca-template-card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; transition: all 0.2s; }
.ca-template-card:hover { border-color: #2563eb; box-shadow: 0 2px 12px rgba(0,0,0,0.05); }
.ca-template-disabled { opacity: 0.6; }
.ca-template-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ca-template-icon {
  width: 36px; height: 36px; border-radius: 8px; background: #2563eb; color: #fff;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ca-template-header > div:nth-child(2) { flex: 1; min-width: 0; }
.ca-template-status { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.status-active { background: rgba(16,185,129,0.15); color: #10b981; }
.status-inactive { background: rgba(148,163,184,0.15); color: #94a3b8; }
.ca-template-body { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px dashed #e5e7eb; }
.ca-template-actions { display: flex; gap: 6px; flex-wrap: wrap; }

.ca-report-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
.ca-report-kpi { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 12px; background: #fff; border: 1px solid #e5e7eb; transition: box-shadow .2s, transform .2s; }
.ca-report-kpi:hover { box-shadow: 0 4px 16px rgba(0,0,0,.08); transform: translateY(-2px); }
.rpt-icon { width: 46px; height: 46px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; background: var(--accent, #2563eb); }
.rpt-body { flex: 1; min-width: 0; }
.rpt-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.rpt-value { font-size: 26px; font-weight: 700; line-height: 1; color: #1f2937; }
.rpt-unit { font-size: 12px; font-weight: 400; color: #909399; margin-left: 4px; }
.rpt-sub { font-size: 11px; color: #909399; margin-top: 6px; }

.ca-report-section { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.ca-report-title { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.ca-report-title h3 { font-size: 16px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 6px; }
.ca-report-desc { font-size: 12px; color: #909399; }
.ca-chart-container { position: relative; height: 300px; width: 100%; }

/* 按钮 */
.btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 8px 16px; border-radius: 8px;
  font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
  background: none;
}
.btn-sm { padding: 5px 12px; font-size: 12px; border-radius: 6px; }
.btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
.btn-primary:hover { background: #1d4ed8; }
.btn-outline { background: #fff; color: #475569; border-color: #e5e7eb; }
.btn-outline:hover { border-color: #2563eb; color: #2563eb; }
.btn-danger { background: #ef4444; color: #fff; border-color: #ef4444; }
.btn-danger:hover { background: #dc2626; }

/* 数据表 */
.table-wrap { overflow-x: auto; }
table.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
table.data-table th {
  text-align: left; padding: 10px 12px; background: #f1f5f9; color: #475569;
  font-weight: 600; border-bottom: 1px solid #e5e7eb; white-space: nowrap;
}
table.data-table td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #1f2937; }
table.data-table tr:nth-child(even) td { background: #f8fafc; }
table.data-table tr:hover td { background: #eff6ff; }
table.data-table tr:last-child td { border-bottom: none; }

@media (max-width: 768px) {
  .ca-charts-grid { grid-template-columns: 1fr; }
  .ca-kpi-grid { grid-template-columns: 1fr 1fr; }
  .ca-template-grid { grid-template-columns: 1fr; }
  .ca-report-kpi-grid { grid-template-columns: 1fr 1fr; }
  .ca-chart-container { height: 260px; }
}
@media (max-width: 480px) {
  .ca-kpi-grid { grid-template-columns: 1fr; }
  .ca-tabs { flex-direction: column; width: 100%; }
  .ca-tab { width: 100%; justify-content: center; }
  .ca-report-kpi-grid { grid-template-columns: 1fr; }
  .ca-chart-container { height: 240px; }
}
</style>
