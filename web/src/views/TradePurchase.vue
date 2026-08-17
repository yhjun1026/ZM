<template>
  <div class="trade-purchase">
    <div class="page-header">
      <h2>采购管理</h2>
      <p>采购申请 / 订单 / 入库 / 退货 / 对账 / 统计</p>
    </div>

    <!-- 顶部 KPI -->
    <div class="kpi-grid">
      <div class="kpi-card" v-for="k in topKpis" :key="k.title">
        <div class="kpi-icon" :style="{ background: k.color + '20' }">
          <el-icon :style="{ color: k.color, fontSize: '18px' }"><component :is="k.icon" /></el-icon>
        </div>
        <div>
          <div class="kpi-title">{{ k.title }}</div>
          <div class="kpi-value">{{ k.value }}</div>
          <div class="kpi-sub">{{ k.sub }}</div>
        </div>
      </div>
    </div>

    <!-- Tab 栏 -->
    <div class="ca-tabs" style="margin-bottom: 16px;">
      <button v-for="t in tabs" :key="t.key" class="ca-tab" :class="{ active: tab === t.key }" @click="switchTab(t.key)">{{ t.label }}</button>
    </div>

    <div v-loading="loading">
      <!-- ============ 采购申请 ============ -->
      <template v-if="tab === 'requests'">
        <div class="bar-row">
          <span class="text-muted">采购申请仅登记业务台账，不触发财务记账；审批通过后可转采购订单</span>
          <el-button type="primary" @click="openReqForm"><el-icon><Plus /></el-icon> 新增采购申请</el-button>
        </div>
        <el-table :data="requests" stripe size="small">
          <el-table-column prop="req_no" label="申请编号" width="130" />
          <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
          <el-table-column label="金额" width="120">
            <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
          </el-table-column>
          <el-table-column label="申请人" width="110">
            <template #default="{ row }">
              {{ row.creator_name }}<br><span class="cell-sub">{{ row.creator_dept }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span>
              <br v-if="row.to_po_id"><span v-if="row.to_po_id" class="cell-sub">→ {{ row.to_po_id }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <template v-if="['待审批', '审批中'].includes(row.status)">
                <el-button size="small" type="primary" @click="doApprove(id => request.post(`/trade-purchase/requests/${id}/approve`), row.id, () => loadRequests())">审批</el-button>
                <el-button size="small" @click="doReject((id, remark) => request.post(`/trade-purchase/requests/${id}/reject`, { remark }), row.id, () => loadRequests())">驳回</el-button>
              </template>
              <el-button v-if="row.status === '已通过' && !row.to_po_id && isTrader" size="small" type="primary" @click="openToOrder(row.id)">转采购订单</el-button>
              <el-button size="small" @click="openReqDetail(row.id)">详情</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无采购申请</span></template>
        </el-table>
      </template>

      <!-- ============ 采购订单 ============ -->
      <template v-else-if="tab === 'orders'">
        <div class="bar-row">
          <span class="text-muted">采购订单生效后财务预生成"待确认应付"；入库后转正式应付并生成成本凭证</span>
          <el-button v-if="isTrader" type="primary" @click="openPoForm"><el-icon><Plus /></el-icon> 新增采购订单</el-button>
          <span v-else class="text-muted">普通员工请通过"采购申请"发起</span>
        </div>
        <el-table :data="orders" stripe size="small">
          <el-table-column prop="po_no" label="订单号" width="130" />
          <el-table-column prop="supplier_name" label="供应商" min-width="140" show-overflow-tooltip />
          <el-table-column label="价税合计" width="120">
            <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
          </el-table-column>
          <el-table-column label="付款状态" width="100">
            <template #default="{ row }"><span class="st-badge" :style="stStyle(row.pay_status)">{{ row.pay_status || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="财务状态" width="100">
            <template #default="{ row }"><span class="st-badge" :style="stStyle(row.fin_status)">{{ row.fin_status || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="单据状态" width="100">
            <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
          </el-table-column>
          <el-table-column prop="creator_name" label="经办人" width="90" />
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <template v-if="['待审批', '审批中'].includes(row.status)">
                <el-button size="small" type="primary" @click="doApprove(id => request.post(`/trade-purchase/${id}/approve`), row.id, () => loadOrders())">审批</el-button>
                <el-button size="small" @click="doReject((id, remark) => request.post(`/trade-purchase/${id}/reject`, { remark }), row.id, () => loadOrders())">驳回</el-button>
              </template>
              <el-button v-if="['已生效', '部分入库'].includes(row.status) && isTrader" size="small" type="primary" @click="openGrnForm(row.id)">入库</el-button>
              <el-button size="small" @click="openPoDetail(row.id)">详情</el-button>
              <el-button v-if="['待审批', '审批中', '已生效'].includes(row.status) && isTrader" size="small" @click="voidPo(row.id)">作废</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无采购订单</span></template>
        </el-table>
      </template>

      <!-- ============ 入库单 ============ -->
      <template v-else-if="tab === 'grns'">
        <div class="bar-row">
          <span class="text-muted">入库单生效后：应付账款转正式 + 自动生成采购成本凭证 + 反写订单入库状态</span>
          <el-button v-if="isTrader" type="primary" @click="openGrnForm()"><el-icon><Plus /></el-icon> 新增入库单</el-button>
        </div>
        <el-table :data="grns" stripe size="small">
          <el-table-column prop="grn_no" label="入库单号" width="140" />
          <el-table-column prop="po_no" label="关联订单" width="130" />
          <el-table-column prop="supplier_name" label="供应商" min-width="130" show-overflow-tooltip />
          <el-table-column label="价税合计" width="110">
            <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
          </el-table-column>
          <el-table-column prop="warehouse" label="仓库" width="90" />
          <el-table-column label="验收" width="110">
            <template #default="{ row }">
              {{ row.check_status }}<br><span class="cell-sub">{{ row.inspector || '' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <template v-if="['待审批', '审批中'].includes(row.status)">
                <el-button size="small" type="primary" @click="doApprove(id => request.post(`/trade-purchase/grn/${id}/approve`), row.id, () => loadGrns())">审批</el-button>
                <el-button size="small" @click="doReject((id, remark) => request.post(`/trade-purchase/grn/${id}/reject`, { remark }), row.id, () => loadGrns())">驳回</el-button>
              </template>
              <el-button size="small" @click="openGrnDetail(row.id)">详情</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无入库单</span></template>
        </el-table>
      </template>

      <!-- ============ 退货单 ============ -->
      <template v-else-if="tab === 'preturns'">
        <div class="bar-row">
          <span class="text-muted">退货单生效后：自动冲减应付账款 + 生成红字冲销凭证</span>
          <el-button v-if="isTrader" type="primary" @click="openPrtForm"><el-icon><RefreshLeft /></el-icon> 新增退货单</el-button>
        </div>
        <el-table :data="preturns" stripe size="small">
          <el-table-column prop="rt_no" label="退货单号" width="140" />
          <el-table-column prop="po_no" label="关联订单" width="130" />
          <el-table-column prop="grn_id" label="关联入库单" width="130" />
          <el-table-column prop="supplier_name" label="供应商" min-width="120" show-overflow-tooltip />
          <el-table-column label="退货金额" width="110">
            <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
          </el-table-column>
          <el-table-column label="原因" min-width="120">
            <template #default="{ row }">{{ (row.reason || '').slice(0, 20) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <template v-if="['待审批', '审批中'].includes(row.status)">
                <el-button size="small" type="primary" @click="doApprove(id => request.post(`/trade-purchase/preturn/${id}/approve`), row.id, () => loadPreturns())">审批</el-button>
                <el-button size="small" @click="doReject((id, remark) => request.post(`/trade-purchase/preturn/${id}/reject`, { remark }), row.id, () => loadPreturns())">驳回</el-button>
              </template>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无退货单</span></template>
        </el-table>
      </template>

      <!-- ============ 结算对账 ============ -->
      <template v-else-if="tab === 'reconcile'">
        <div class="kpi-grid" style="margin-bottom: 16px;">
          <div class="kpi-card" v-for="k in reconcileKpis" :key="k.title">
            <div class="kpi-icon" :style="{ background: k.color + '20' }">
              <el-icon :style="{ color: k.color, fontSize: '18px' }"><component :is="k.icon" /></el-icon>
            </div>
            <div>
              <div class="kpi-title">{{ k.title }}</div>
              <div class="kpi-value">{{ k.value }}</div>
              <div class="kpi-sub">{{ k.sub }}</div>
            </div>
          </div>
        </div>
        <el-table :data="reconcileRows" stripe size="small">
          <el-table-column prop="supplier_name" label="供应商" min-width="140" show-overflow-tooltip />
          <el-table-column prop="orders" label="订单数" width="80" />
          <el-table-column label="订单金额" width="120">
            <template #default="{ row }">¥{{ money(row.order_amount) }}</template>
          </el-table-column>
          <el-table-column label="入库确认额" width="120">
            <template #default="{ row }">¥{{ money(row.confirmed) }}</template>
          </el-table-column>
          <el-table-column label="退货冲减" width="110">
            <template #default="{ row }">¥{{ money(row.returned) }}</template>
          </el-table-column>
          <el-table-column label="应付合计" width="120">
            <template #default="{ row }">¥{{ money(row.payable) }}</template>
          </el-table-column>
          <el-table-column label="已付款" width="110">
            <template #default="{ row }">¥{{ money(row.paid) }}</template>
          </el-table-column>
          <el-table-column label="未付余额" width="120">
            <template #default="{ row }">
              <b :style="{ color: row.balance > 0 ? '#f59e0b' : 'var(--el-text-color-secondary)' }">¥{{ money(row.balance) }}</b>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无对账数据</span></template>
        </el-table>
      </template>

      <!-- ============ 统计趋势 ============ -->
      <template v-else-if="tab === 'trend'">
        <div class="kpi-grid" style="margin-bottom: 16px;">
          <div class="kpi-card" v-for="k in trendKpis" :key="k.title">
            <div class="kpi-icon" :style="{ background: k.color + '20' }">
              <el-icon :style="{ color: k.color, fontSize: '18px' }"><component :is="k.icon" /></el-icon>
            </div>
            <div>
              <div class="kpi-title">{{ k.title }}</div>
              <div class="kpi-value">{{ k.value }}</div>
              <div class="kpi-sub">{{ k.sub }}</div>
            </div>
          </div>
        </div>
        <div class="grid-2" style="margin-bottom: 16px;">
          <el-card shadow="never">
            <h4 class="chart-title">月度采购趋势</h4>
            <div ref="trendChartRef" style="height: 300px;"></div>
          </el-card>
          <el-card shadow="never">
            <h4 class="chart-title">供应商排名 TOP10</h4>
            <div ref="supChartRef" style="height: 300px;"></div>
          </el-card>
        </div>
        <div class="grid-2">
          <el-card shadow="never">
            <h4 class="chart-title">订单状态分布</h4>
            <div ref="statusChartRef" style="height: 260px;"></div>
          </el-card>
          <el-card shadow="never">
            <h4 class="chart-title">物料采购 TOP10</h4>
            <el-table :data="trendData.topProducts || []" stripe size="small" max-height="260">
              <el-table-column label="物料名称" min-width="140">
                <template #default="{ row, $index }">{{ $index + 1 }}. {{ row.name }}</template>
              </el-table-column>
              <el-table-column prop="qty" label="数量" width="90" />
              <el-table-column label="金额" width="120">
                <template #default="{ row }">¥{{ money(row.amount) }}</template>
              </el-table-column>
              <template #empty><span class="text-muted">暂无数据</span></template>
            </el-table>
          </el-card>
        </div>
      </template>
    </div>

    <!-- ============ 弹窗：新增采购申请 ============ -->
    <el-dialog v-model="dlg.req" title="新增采购申请" width="640px" destroy-on-close>
      <p class="text-muted" style="font-size: 12px; margin-top: 0;">采购申请仅登记业务台账，不触发财务记账</p>
      <el-form label-width="90px">
        <el-form-item label="申请标题" required>
          <el-input v-model="reqForm.title" placeholder="如：市场部Q3宣传物料采购" />
        </el-form-item>
        <el-form-item label="申请事由">
          <el-input v-model="reqForm.reason" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="采购明细">
          <div class="items-editor">
            <div v-for="(it, i) in reqForm.items" :key="i" class="item-row">
              <el-input v-model="it.name" placeholder="名称" style="flex: 2; min-width: 120px;" />
              <el-input-number v-model="it.qty" :min="0.01" :step="1" controls-position="right" placeholder="数量" style="flex: 1; min-width: 100px;" />
              <el-input-number v-model="it.price" :min="0" :step="0.01" controls-position="right" placeholder="单价" style="flex: 1; min-width: 110px;" />
              <el-select v-model="it.tax_rate" style="flex: 1; min-width: 80px;">
                <el-option v-for="t in [0, 6, 9, 13]" :key="t" :value="t" :label="t + '%'" />
              </el-select>
              <el-button @click="reqForm.items.splice(i, 1)" title="删除该行">×</el-button>
            </div>
            <el-button size="small" @click="reqForm.items.push({ name: '', qty: 1, price: 0, tax_rate: 13 })"><el-icon><Plus /></el-icon> 添加明细行</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.req = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReq">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：新增采购订单 ============ -->
    <el-dialog v-model="dlg.po" title="新增采购订单" width="640px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="供应商" required>
          <el-select v-model="poForm.supplier_id" style="width: 100%;">
            <el-option v-for="s in suppliers" :key="s.id" :value="s.id" :label="s.name + (['合作中', '已合作', '合格'].includes(s.status) ? '' : '（' + (s.status || '未知状态') + '）')" />
          </el-select>
        </el-form-item>
        <el-form-item label="结算方式">
          <div style="display: flex; gap: 12px; width: 100%;">
            <el-select v-model="poForm.settle_type" style="flex: 1;">
              <el-option v-for="o in ['月结', '款到发货', '货到付款', '预付款']" :key="o" :value="o" :label="o" />
            </el-select>
            <el-date-picker v-model="poForm.delivery_date" type="date" value-format="YYYY-MM-DD" placeholder="交货日期" style="flex: 1;" />
          </div>
        </el-form-item>
        <el-form-item label="采购明细" required>
          <div class="items-editor">
            <div v-for="(it, i) in poForm.items" :key="i" class="item-row">
              <el-input v-model="it.name" placeholder="名称" style="flex: 2; min-width: 120px;" />
              <el-input-number v-model="it.qty" :min="0.01" :step="1" controls-position="right" style="flex: 1; min-width: 100px;" />
              <el-input-number v-model="it.price" :min="0" :step="0.01" controls-position="right" style="flex: 1; min-width: 110px;" />
              <el-select v-model="it.tax_rate" style="flex: 1; min-width: 80px;">
                <el-option v-for="t in [0, 6, 9, 13]" :key="t" :value="t" :label="t + '%'" />
              </el-select>
              <el-button @click="poForm.items.splice(i, 1)" title="删除该行">×</el-button>
            </div>
            <el-button size="small" @click="poForm.items.push({ name: '', qty: 1, price: 0, tax_rate: 13 })"><el-icon><Plus /></el-icon> 添加明细行</el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="poForm.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.po = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitPo">提交订单</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：申请转采购订单 ============ -->
    <el-dialog v-model="dlg.toOrder" title="申请转采购订单" width="520px" destroy-on-close>
      <p class="text-muted" style="font-size: 12px; margin-top: 0;">申请编号：{{ toOrderForm.reqId }}，明细自动沿用申请内容</p>
      <el-form label-width="90px">
        <el-form-item label="供应商" required>
          <el-select v-model="toOrderForm.supplier_id" style="width: 100%;">
            <el-option v-for="s in suppliers" :key="s.id" :value="s.id" :label="s.name + (['合作中', '已合作', '合格'].includes(s.status) ? '' : '（' + (s.status || '未知状态') + '）')" />
          </el-select>
        </el-form-item>
        <el-form-item label="结算方式">
          <div style="display: flex; gap: 12px; width: 100%;">
            <el-select v-model="toOrderForm.settle_type" style="flex: 1;">
              <el-option v-for="o in ['月结', '款到发货', '货到付款', '预付款']" :key="o" :value="o" :label="o" />
            </el-select>
            <el-date-picker v-model="toOrderForm.delivery_date" type="date" value-format="YYYY-MM-DD" placeholder="交货日期" style="flex: 1;" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.toOrder = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitToOrder">生成订单</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：新增入库单 ============ -->
    <el-dialog v-model="dlg.grn" title="新增采购入库单" width="640px" destroy-on-close>
      <el-form label-width="110px">
        <el-form-item label="关联采购订单" required>
          <el-select v-model="grnForm.po_id" style="width: 100%;">
            <el-option v-for="p in effectiveOrders" :key="p.id" :value="p.id" :label="`${p.po_no} · ${p.supplier_name} · ¥${money(p.total_with_tax)}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="仓库 / 验收">
          <div style="display: flex; gap: 12px; width: 100%; flex-wrap: wrap;">
            <el-select v-model="grnForm.warehouse" style="flex: 1; min-width: 110px;">
              <el-option v-for="o in ['主仓库', '辅料仓', '设备仓']" :key="o" :value="o" :label="o" />
            </el-select>
            <el-select v-model="grnForm.check_status" style="flex: 1; min-width: 110px;">
              <el-option v-for="o in ['合格', '让步接收', '不合格待退']" :key="o" :value="o" :label="o" />
            </el-select>
            <el-input v-model="grnForm.inspector" placeholder="验收人（默认当前用户）" style="flex: 1; min-width: 130px;" />
          </div>
        </el-form-item>
        <el-form-item label="实际入库明细" required>
          <div class="items-editor">
            <div v-for="(it, i) in grnForm.items" :key="i" class="item-row">
              <el-input v-model="it.name" placeholder="名称" style="flex: 2; min-width: 120px;" />
              <el-input-number v-model="it.qty" :min="0.01" :step="1" controls-position="right" style="flex: 1; min-width: 100px;" />
              <el-input-number v-model="it.price" :min="0" :step="0.01" controls-position="right" style="flex: 1; min-width: 110px;" />
              <el-select v-model="it.tax_rate" style="flex: 1; min-width: 80px;">
                <el-option v-for="t in [0, 6, 9, 13]" :key="t" :value="t" :label="t + '%'" />
              </el-select>
              <el-button @click="grnForm.items.splice(i, 1)" title="删除该行">×</el-button>
            </div>
            <el-button size="small" @click="grnForm.items.push({ name: '', qty: 1, price: 0, tax_rate: 13 })"><el-icon><Plus /></el-icon> 添加明细行</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.grn = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitGrn">提交入库单</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：新增退货单 ============ -->
    <el-dialog v-model="dlg.prt" title="新增采购退货单" width="640px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="关联入库单" required>
          <el-select v-model="prtForm.grn_id" style="width: 100%;">
            <el-option v-for="g in effectiveGrns" :key="g.id" :value="g.id" :label="`${g.grn_no} · 订单${g.po_no} · ${g.supplier_name} · ¥${money(g.total_with_tax)}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="退货原因" required>
          <el-input v-model="prtForm.reason" placeholder="如：质量不合格/规格不符" />
        </el-form-item>
        <el-form-item label="退货明细" required>
          <div class="items-editor">
            <div v-for="(it, i) in prtForm.items" :key="i" class="item-row">
              <el-input v-model="it.name" placeholder="名称" style="flex: 2; min-width: 120px;" />
              <el-input-number v-model="it.qty" :min="0.01" :step="1" controls-position="right" style="flex: 1; min-width: 100px;" />
              <el-input-number v-model="it.price" :min="0" :step="0.01" controls-position="right" style="flex: 1; min-width: 110px;" />
              <el-select v-model="it.tax_rate" style="flex: 1; min-width: 80px;">
                <el-option v-for="t in [0, 6, 9, 13]" :key="t" :value="t" :label="t + '%'" />
              </el-select>
              <el-button @click="prtForm.items.splice(i, 1)" title="删除该行">×</el-button>
            </div>
            <el-button size="small" @click="prtForm.items.push({ name: '', qty: 1, price: 0, tax_rate: 13 })"><el-icon><Plus /></el-icon> 添加明细行</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.prt = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitPrt">提交退货单</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：申请详情 ============ -->
    <el-dialog v-model="dlg.reqDetail" :title="reqDetail ? `${reqDetail.req_no} · ${reqDetail.title}` : '申请详情'" width="720px" destroy-on-close>
      <template v-if="reqDetail">
        <p class="text-muted" style="font-size: 12px; margin-top: 0;">{{ reqDetail.creator_name }}（{{ reqDetail.creator_dept }}）· {{ reqDetail.created_at || '' }} · 金额 ¥{{ money(reqDetail.total_with_tax) }}</p>
        <p v-if="reqDetail.reason" style="font-size: 13px;">事由：{{ reqDetail.reason }}</p>
        <el-table v-if="(reqDetail.items || []).length" :data="reqDetail.items" stripe size="small" style="margin-top: 8px;">
          <el-table-column prop="name" label="物料/产品" min-width="140" />
          <el-table-column prop="qty" label="数量" width="80" />
          <el-table-column label="单价" width="100">
            <template #default="{ row }">{{ money(row.price) }}</template>
          </el-table-column>
          <el-table-column prop="tax_rate" label="税率%" width="80" />
          <el-table-column label="金额" width="110">
            <template #default="{ row }">{{ money((Number(row.qty) || 0) * (Number(row.price) || 0)) }}</template>
          </el-table-column>
        </el-table>
        <flow-view :flow="reqDetail.flow" />
      </template>
      <template #footer>
        <el-button @click="dlg.reqDetail = false">关闭</el-button>
        <el-button type="info" @click="printReq"><el-icon><Printer /></el-icon> 打印</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：订单详情 ============ -->
    <el-dialog v-model="dlg.poDetail" :title="poDetail ? `${poDetail.po_no} 采购订单` : '订单详情'" width="780px" destroy-on-close>
      <template v-if="poDetail">
        <p class="text-muted" style="font-size: 12px; margin-top: 0;">{{ poDetail.supplier_name }} · {{ poDetail.settle_type || '' }} · {{ poDetail.delivery_date || '' }} · 经办 {{ poDetail.creator_name }}（{{ poDetail.creator_dept }}）</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0;">
          <span class="st-badge" :style="stStyle(poDetail.status)">{{ poDetail.status || '—' }}</span>
          <span class="st-badge" :style="stStyle(poDetail.pay_status)">{{ poDetail.pay_status || '—' }}</span>
          <span class="st-badge" :style="stStyle(poDetail.fin_status)">{{ poDetail.fin_status || '—' }}</span>
        </div>
        <p style="font-size: 13px;">不含税 ¥{{ money(poDetail.amount) }} · 税额 ¥{{ money(poDetail.tax_amount) }} · <b>价税合计 ¥{{ money(poDetail.total_with_tax) }}</b></p>
        <el-table v-if="(poDetail.items || []).length" :data="poDetail.items" stripe size="small" style="margin-top: 8px;">
          <el-table-column prop="name" label="物料/产品" min-width="140" />
          <el-table-column prop="qty" label="数量" width="80" />
          <el-table-column label="单价" width="100">
            <template #default="{ row }">{{ money(row.price) }}</template>
          </el-table-column>
          <el-table-column prop="tax_rate" label="税率%" width="80" />
          <el-table-column label="金额" width="110">
            <template #default="{ row }">{{ money((Number(row.qty) || 0) * (Number(row.price) || 0)) }}</template>
          </el-table-column>
        </el-table>
        <flow-view :flow="poDetail.flow" />
        <template v-if="(poDetail.grns || []).length">
          <h4 style="margin-top: 12px;">入库单</h4>
          <el-table :data="poDetail.grns" stripe size="small">
            <el-table-column prop="grn_no" label="单号" width="140" />
            <el-table-column label="金额" width="120">
              <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
            </el-table-column>
            <el-table-column prop="warehouse" label="仓库" width="100" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
            </el-table-column>
          </el-table>
        </template>
        <template v-if="(poDetail.returns || []).length">
          <h4 style="margin-top: 12px;">退货单</h4>
          <el-table :data="poDetail.returns" stripe size="small">
            <el-table-column prop="rt_no" label="单号" width="140" />
            <el-table-column label="金额" width="120">
              <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
            </el-table-column>
          </el-table>
        </template>
        <template v-if="(poDetail.ap || []).length">
          <h4 style="margin-top: 12px;">应付账款</h4>
          <el-table :data="poDetail.ap" stripe size="small">
            <el-table-column prop="source_no" label="单号" width="140" />
            <el-table-column label="应付" width="110">
              <template #default="{ row }">¥{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="已付" width="110">
              <template #default="{ row }">¥{{ money(row.pay_amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
            </el-table-column>
          </el-table>
        </template>
        <template v-if="(poDetail.pays || []).length">
          <h4 style="margin-top: 12px;">付款记录</h4>
          <el-table :data="poDetail.pays" stripe size="small">
            <el-table-column prop="id" label="付款单号" width="130" />
            <el-table-column label="金额" width="110">
              <template #default="{ row }">¥{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="way" label="方式" width="100" />
            <el-table-column prop="voucher_no" label="凭证" width="120" />
            <el-table-column prop="operator" label="操作员" min-width="90" />
          </el-table>
        </template>
      </template>
      <template #footer>
        <el-button @click="dlg.poDetail = false">关闭</el-button>
        <el-button type="info" @click="printPo"><el-icon><Printer /></el-icon> 打印</el-button>
        <el-button v-if="poDetail && ['已生效', '部分入库'].includes(poDetail.status) && isFinance" type="primary" @click="openPayForm"><el-icon><CreditCard /></el-icon> 付款登记</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：入库单详情 ============ -->
    <el-dialog v-model="dlg.grnDetail" :title="grnDetail ? `${grnDetail.grn_no} 入库单` : '入库单详情'" width="720px" destroy-on-close>
      <template v-if="grnDetail">
        <p class="text-muted" style="font-size: 12px; margin-top: 0;">订单 {{ grnDetail.po_no }} · {{ grnDetail.supplier_name }} · {{ grnDetail.warehouse }} · 验收:{{ grnDetail.check_status }} · ¥{{ money(grnDetail.total_with_tax) }}</p>
        <el-table v-if="(grnDetail.items || []).length" :data="grnDetail.items" stripe size="small" style="margin-top: 8px;">
          <el-table-column prop="name" label="物料/产品" min-width="140" />
          <el-table-column prop="qty" label="数量" width="80" />
          <el-table-column label="单价" width="100">
            <template #default="{ row }">{{ money(row.price) }}</template>
          </el-table-column>
          <el-table-column prop="tax_rate" label="税率%" width="80" />
          <el-table-column label="金额" width="110">
            <template #default="{ row }">{{ money((Number(row.qty) || 0) * (Number(row.price) || 0)) }}</template>
          </el-table-column>
        </el-table>
        <flow-view :flow="grnDetail.flow" />
      </template>
      <template #footer>
        <el-button @click="dlg.grnDetail = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：付款登记 ============ -->
    <el-dialog v-model="dlg.pay" title="付款登记" width="480px" destroy-on-close>
      <p class="text-muted" style="font-size: 12px; margin-top: 0;">采购订单：{{ payForm.po_id }} · 应付余额 ¥{{ money(payForm.balance) }}</p>
      <el-form label-width="90px">
        <el-form-item label="付款金额" required>
          <el-input-number v-model="payForm.amount" :min="0.01" :max="payForm.balance" :step="0.01" controls-position="right" style="width: 100%;" :placeholder="'不超过 ' + payForm.balance" />
        </el-form-item>
        <el-form-item label="付款日期">
          <div style="display: flex; gap: 12px; width: 100%;">
            <el-date-picker v-model="payForm.pay_date" type="date" value-format="YYYY-MM-DD" style="flex: 1;" />
            <el-select v-model="payForm.way" style="flex: 1;">
              <el-option v-for="o in ['银行转账', '承兑汇票', '现金', '支票']" :key="o" :value="o" :label="o" />
            </el-select>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.pay = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitPay">确认付款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, h } from 'vue';
import * as echarts from 'echarts';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, Document, CircleCheck, Money, CreditCard, Calendar, Trophy, Van,
  RefreshLeft, Printer, Warning, Clock, ArrowRight, Bell
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

/* ---------- 通用工具 ---------- */
function money(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return '0.00';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const ST_COLORS = {
  '待审批': '#f59e0b', '审批中': '#2563eb', '已生效': '#10b981', '已通过': '#10b981',
  '已驳回': '#ef4444', '已作废': '#94a3b8', '部分入库': '#06b6e4', '全部入库': '#0d9488',
  '部分出库': '#06b6e4', '全部出库': '#0d9488', '已转单': '#8b5cf6',
  '待确认': '#f59e0b', '正式': '#2563eb', '部分核销': '#06b6e4', '已核销': '#10b981',
  '未付款': '#94a3b8', '部分付款': '#f59e0b', '已全额付款': '#10b981',
  '未回款': '#94a3b8', '部分回款': '#f59e0b', '已全额回款': '#10b981', '财务已入账': '#8b5cf6',
  '待复核': '#ef4444', '已复核': '#10b981', 'success': '#10b981', 'failed': '#ef4444'
};
function stStyle(s) {
  const c = ST_COLORS[s] || '#64748b';
  if (!s) return { color: 'var(--el-text-color-secondary)', background: 'transparent' };
  return { background: c + '18', color: c };
}
const isTrader = computed(() => {
  const u = auth.user;
  return !!u && ['超级管理员', '总经理', '副总', '销售总监', '部门经理'].includes(u.role);
});
const isFinance = computed(() => {
  const u = auth.user;
  if (!u) return false;
  if (['超级管理员', '总经理'].includes(u.role)) return true;
  return u.dept === '财务部';
});

/* 审批流程子组件 */
const FlowView = (props) => {
  const flow = Array.isArray(props.flow) ? props.flow : [];
  if (!flow.length) return null;
  let currentIdx = -1;
  for (let i = 0; i < flow.length; i++) { if (!flow[i].done) { currentIdx = i; break; } }
  const nodes = [];
  flow.forEach((s, i) => {
    const cls = s.done ? 'wf-done' : (i === currentIdx ? 'wf-current' : 'wf-pending');
    const opinion = s.opinion || s.comment || '';
    nodes.push(h('span', { class: 'wf-step ' + cls }, [
      h('span', { class: 'wf-icon' }, [
        s.done ? h(CircleCheck) : (i === currentIdx ? h(Clock) : h('span', { style: 'display:inline-block;width:16px;height:16px;border:2px solid #9ca3af;border-radius:50%;' }))
      ]),
      h('span', { class: 'wf-name' }, s.step || s.name || ''),
      h('span', { class: 'wf-user' }, s.user || s.approver || '待处理'),
      h('span', { class: 'wf-time' }, s.time || s.approved_at || s.time_str || '—'),
      opinion ? h('span', { style: 'font-size:11px;color:#ef4444;margin-top:2px;max-width:120px;overflow:hidden;text-overflow:ellipsis;' }, opinion.slice(0, 20)) : null
    ]));
    if (i < flow.length - 1) nodes.push(h('span', { class: 'wf-arrow' }, [h(ArrowRight)]));
  });
  const reminder = currentIdx >= 0
    ? h('div', { style: 'margin-top:8px;padding:8px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;font-size:13px;color:#92400e;display:flex;align-items:center;gap:6px;' }, [
        h(Bell), h('span', {}, ['当前待审节点：', h('b', {}, flow[currentIdx].step || flow[currentIdx].name || ''), '，审批人：' + (flow[currentIdx].user || flow[currentIdx].approver || '待分配')])
      ])
    : h('div', { style: 'margin-top:8px;padding:8px 12px;background:#d1fae5;border:1px solid #10b981;border-radius:8px;font-size:13px;color:#065f46;display:flex;align-items:center;gap:6px;' }, [
        h(CircleCheck), h('span', {}, '审批流程已完成')
      ]);
  return h('div', { style: 'margin-top:12px;' }, [
    h('b', { style: 'font-size:13px;' }, '审批流程示意图'),
    h('div', { style: 'display:flex;align-items:flex-start;flex-wrap:wrap;gap:0;padding:12px 0;overflow-x:auto;' }, nodes),
    reminder
  ]);
};
FlowView.props = { flow: { type: Array, default: () => [] } };

/* ---------- 状态 ---------- */
const tabs = [
  { key: 'requests', label: '采购申请' },
  { key: 'orders', label: '采购订单' },
  { key: 'grns', label: '入库单' },
  { key: 'preturns', label: '退货单' },
  { key: 'reconcile', label: '结算对账' },
  { key: 'trend', label: '统计趋势' }
];
const tab = ref('requests');
const loading = ref(false);
const submitting = ref(false);

const stats = ref({});
const requests = ref([]);
const orders = ref([]);
const suppliers = ref([]);
const grns = ref([]);
const preturns = ref([]);
const reconcileRows = ref([]);
const trendData = ref({});

const topKpis = computed(() => {
  const d = stats.value;
  return [
    { title: '订单总数', value: d.total ?? 0, sub: '含全部状态', icon: Document, color: '#2563eb' },
    { title: '生效订单', value: d.effective ?? 0, sub: '待审批 ' + (d.pending ?? 0) + ' 单', icon: CircleCheck, color: '#10b981' },
    { title: '采购总额', value: '¥' + money(d.totalAmount), sub: '价税合计', icon: Money, color: '#8b5cf6' },
    { title: '应付余额', value: '¥' + money(d.unpaid), sub: '已付 ¥' + money(d.paid), icon: CreditCard, color: '#f59e0b' }
  ];
});
const reconcileKpis = computed(() => {
  const sum = reconcileRows.value.reduce((s, x) => ({
    order_amount: s.order_amount + (Number(x.order_amount) || 0),
    payable: s.payable + (Number(x.payable) || 0),
    paid: s.paid + (Number(x.paid) || 0),
    balance: s.balance + (Number(x.balance) || 0)
  }), { order_amount: 0, payable: 0, paid: 0, balance: 0 });
  return [
    { title: '订单金额', value: '¥' + money(sum.order_amount), sub: reconcileRows.value.length + ' 家供应商', icon: Document, color: '#2563eb' },
    { title: '确认应付', value: '¥' + money(sum.payable), sub: '按入库确认', icon: CircleCheck, color: '#10b981' },
    { title: '已付款', value: '¥' + money(sum.paid), sub: '财务登记', icon: CreditCard, color: '#0d9488' },
    { title: '未付余额', value: '¥' + money(sum.balance), sub: '应付未付', icon: Warning, color: '#f59e0b' }
  ];
});
const trendKpis = computed(() => {
  const d = trendData.value;
  const s = d.summary || {};
  const totalCnt = (d.monthly || []).reduce((a, m) => a + m.count, 0);
  const totalAmt = (d.monthly || []).reduce((a, m) => a + m.amount, 0);
  const avgCnt = s.totalMonths > 0 ? Math.round(totalCnt / s.totalMonths * 10) / 10 : 0;
  const avgAmt = s.totalMonths > 0 ? Math.round(totalAmt / s.totalMonths * 100) / 100 : 0;
  return [
    { title: '月均订单', value: avgCnt, sub: '近' + (s.totalMonths || 0) + '个月', icon: Calendar, color: '#2563eb' },
    { title: '月均金额', value: '¥' + money(avgAmt), sub: '价税合计', icon: Money, color: '#10b981' },
    { title: '最大单笔', value: '¥' + money(s.maxAmount || 0), sub: '已生效订单', icon: Trophy, color: '#f59e0b' },
    { title: '活跃供应商', value: s.activeSuppliers || 0, sub: '有成交记录', icon: Van, color: '#8b5cf6' }
  ];
});
const effectiveOrders = computed(() => orders.value.filter(p => ['已生效', '部分入库'].includes(p.status)));
const effectiveGrns = ref([]);

/* ---------- 数据加载 ---------- */
async function loadStats() {
  const r = await request.get('/trade-purchase/stats');
  if (r.code === 200) stats.value = r.data || {};
  else ElMessage.error('加载失败: ' + (r.msg || ''));
}
async function loadRequests() {
  const r = await request.get('/trade-purchase/requests');
  if (r.code === 200) requests.value = r.data || [];
}
async function loadOrders() {
  const [list, sups] = await Promise.all([
    request.get('/trade-purchase'),
    request.get('/trade-purchase/suppliers-lite')
  ]);
  if (list.code === 200) orders.value = list.data || [];
  if (sups.code === 200) suppliers.value = sups.data || [];
}
async function loadGrns() {
  const r = await request.get('/trade-purchase/grns/list');
  if (r.code === 200) grns.value = r.data || [];
}
async function loadPreturns() {
  const r = await request.get('/trade-purchase/preturns/list');
  if (r.code === 200) preturns.value = r.data || [];
}
async function loadReconcile() {
  const r = await request.get('/trade-purchase/reconcile');
  if (r.code === 200) reconcileRows.value = r.data || [];
}
async function loadTrend() {
  const r = await request.get('/trade-purchase/stats/trend');
  if (r.code !== 200) { ElMessage.error('加载失败: ' + (r.msg || '')); return; }
  trendData.value = r.data || {};
  await nextTick();
  renderCharts();
}

async function loadTab() {
  loading.value = true;
  try {
    if (tab.value === 'requests') await loadRequests();
    else if (tab.value === 'orders') await loadOrders();
    else if (tab.value === 'grns') await loadGrns();
    else if (tab.value === 'preturns') await loadPreturns();
    else if (tab.value === 'reconcile') await loadReconcile();
    else if (tab.value === 'trend') await loadTrend();
  } finally {
    loading.value = false;
  }
}
function switchTab(t) {
  disposeCharts();
  tab.value = t;
  loadTab();
}

/* ---------- 审批 / 驳回 ---------- */
async function doApprove(fn, id, after) {
  try {
    await ElMessageBox.confirm('确认审批通过？', '审批', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const r = await fn(id);
  if (r.code === 200) { ElMessage.success(r.msg || '审批成功'); after && after(); }
  else ElMessage.error(r.msg || '审批失败');
}
async function doReject(fn, id, after) {
  let remark;
  try {
    const res = await ElMessageBox.prompt('请填写驳回意见（必填）：', '驳回', {
      confirmButtonText: '确认驳回', cancelButtonText: '取消',
      inputValidator: v => !!(v && v.trim()) || '驳回意见不能为空'
    });
    remark = res.value.trim();
  } catch { return; }
  const r = await fn(id, remark);
  if (r.code === 200) { ElMessage.success(r.msg || '已驳回'); after && after(); }
  else ElMessage.error(r.msg || '驳回失败');
}

/* ---------- 采购申请 ---------- */
const dlg = reactive({ req: false, po: false, toOrder: false, grn: false, prt: false, reqDetail: false, poDetail: false, grnDetail: false, pay: false });
const blankItem = () => ({ name: '', qty: 1, price: 0, tax_rate: 13 });
const reqForm = reactive({ title: '', reason: '', items: [blankItem()] });
function openReqForm() {
  Object.assign(reqForm, { title: '', reason: '', items: [blankItem()] });
  dlg.req = true;
}
function validItems(items) {
  return items.filter(it => it.name && it.name.trim() && Number(it.qty) > 0)
    .map(it => ({ name: it.name.trim(), qty: Number(it.qty), price: Number(it.price) || 0, tax_rate: Number(it.tax_rate) || 0 }));
}
async function submitReq() {
  const title = reqForm.title.trim();
  if (!title) { ElMessage.warning('请填写申请标题'); return; }
  const items = validItems(reqForm.items);
  if (!items.length) { ElMessage.warning('请至少填写一行有效明细（名称+数量）'); return; }
  submitting.value = true;
  const r = await request.post('/trade-purchase/requests', { title, reason: reqForm.reason.trim(), items });
  submitting.value = false;
  if (r.code === 200) { dlg.req = false; ElMessage.success(r.msg || '已提交'); tab.value = 'requests'; loadRequests(); }
  else ElMessage.error(r.msg || '提交失败');
}
const reqDetail = ref(null);
async function openReqDetail(id) {
  const r = await request.get('/trade-purchase/requests/' + id);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  const d = r.data;
  d.items = d.items || [];
  reqDetail.value = d;
  dlg.reqDetail = true;
}

/* ---------- 采购订单 ---------- */
const poForm = reactive({ supplier_id: '', settle_type: '月结', delivery_date: '', remark: '', items: [blankItem()] });
async function ensureSuppliers() {
  if (!suppliers.value.length) {
    const sups = await request.get('/trade-purchase/suppliers-lite');
    if (sups.code === 200) suppliers.value = sups.data || [];
  }
  if (!suppliers.value.length) { ElMessage.warning('供应商数据加载中，请稍后重试'); return false; }
  return true;
}
async function openPoForm() {
  if (!(await ensureSuppliers())) return;
  Object.assign(poForm, { supplier_id: suppliers.value[0]?.id || '', settle_type: '月结', delivery_date: '', remark: '', items: [blankItem()] });
  dlg.po = true;
}
function supName(id) {
  const s = suppliers.value.find(x => x.id === id);
  return s ? s.name : '';
}
async function submitPo() {
  const items = validItems(poForm.items);
  if (!items.length) { ElMessage.warning('请至少填写一行有效明细'); return; }
  submitting.value = true;
  const r = await request.post('/trade-purchase', {
    supplier_id: poForm.supplier_id, supplier_name: supName(poForm.supplier_id),
    items, settle_type: poForm.settle_type, delivery_date: poForm.delivery_date, remark: (poForm.remark || '').trim()
  });
  submitting.value = false;
  if (r.code === 200) { dlg.po = false; ElMessage.success(r.msg || '已提交'); tab.value = 'orders'; loadOrders(); }
  else ElMessage.error(r.msg || '提交失败');
}
const toOrderForm = reactive({ reqId: '', supplier_id: '', settle_type: '月结', delivery_date: '' });
async function openToOrder(reqId) {
  if (!(await ensureSuppliers())) return;
  Object.assign(toOrderForm, { reqId, supplier_id: suppliers.value[0]?.id || '', settle_type: '月结', delivery_date: '' });
  dlg.toOrder = true;
}
async function submitToOrder() {
  submitting.value = true;
  const r = await request.post(`/trade-purchase/requests/${toOrderForm.reqId}/to-order`, {
    supplier_id: toOrderForm.supplier_id, supplier_name: supName(toOrderForm.supplier_id),
    settle_type: toOrderForm.settle_type, delivery_date: toOrderForm.delivery_date
  });
  submitting.value = false;
  if (r.code === 200) { dlg.toOrder = false; ElMessage.success(r.msg || '已生成订单'); loadRequests(); }
  else ElMessage.error(r.msg || '操作失败');
}
async function voidPo(id) {
  try {
    await ElMessageBox.confirm('确认作废该采购订单？作废后财务预登记将同步冲销（已入库/已付款的订单禁止作废）', '作废订单', { confirmButtonText: '确认作废', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const r = await request.post(`/trade-purchase/${id}/void`);
  if (r.code === 200) { ElMessage.success(r.msg || '已作废'); loadOrders(); }
  else ElMessage.error(r.msg || '作废失败');
}
const poDetail = ref(null);
async function openPoDetail(id) {
  const r = await request.get('/trade-purchase/' + id);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  poDetail.value = r.data;
  dlg.poDetail = true;
}

/* ---------- 入库单 ---------- */
const grnForm = reactive({ po_id: '', warehouse: '主仓库', check_status: '合格', inspector: '', items: [blankItem()] });
async function openGrnForm(poId) {
  if (!orders.value.length) await loadOrders();
  if (poId) {
    Object.assign(grnForm, { po_id: poId, warehouse: '主仓库', check_status: '合格', inspector: '', items: [blankItem()] });
  } else {
    if (!effectiveOrders.value.length) { ElMessage.warning('暂无可入库的已生效订单'); return; }
    Object.assign(grnForm, { po_id: effectiveOrders.value[0].id, warehouse: '主仓库', check_status: '合格', inspector: '', items: [blankItem()] });
  }
  dlg.grn = true;
}
async function submitGrn() {
  const items = validItems(grnForm.items);
  if (!items.length) { ElMessage.warning('请至少填写一行有效明细'); return; }
  submitting.value = true;
  const r = await request.post('/trade-purchase/grn', {
    po_id: grnForm.po_id, items,
    warehouse: grnForm.warehouse, check_status: grnForm.check_status, inspector: (grnForm.inspector || '').trim()
  });
  submitting.value = false;
  if (r.code === 200) { dlg.grn = false; ElMessage.success(r.msg || '已提交'); tab.value = 'grns'; loadGrns(); }
  else ElMessage.error(r.msg || '提交失败');
}
const grnDetail = ref(null);
async function openGrnDetail(id) {
  if (!grns.value.length) await loadGrns();
  const g = grns.value.find(x => x.id === id);
  if (!g) { ElMessage.error('入库单不存在'); return; }
  grnDetail.value = g;
  dlg.grnDetail = true;
}

/* ---------- 退货单 ---------- */
const prtForm = reactive({ grn_id: '', reason: '', items: [blankItem()] });
async function openPrtForm() {
  const r = await request.get('/trade-purchase/grns/list');
  effectiveGrns.value = r.code === 200 ? (r.data || []).filter(g => g.status === '已生效') : [];
  if (!effectiveGrns.value.length) { ElMessage.warning('暂无可退货的已生效入库单'); return; }
  Object.assign(prtForm, { grn_id: effectiveGrns.value[0].id, reason: '', items: [blankItem()] });
  dlg.prt = true;
}
async function submitPrt() {
  const items = validItems(prtForm.items);
  const reason = prtForm.reason.trim();
  if (!reason) { ElMessage.warning('请填写退货原因'); return; }
  if (!items.length) { ElMessage.warning('请至少填写一行有效明细'); return; }
  const g = effectiveGrns.value.find(x => x.id === prtForm.grn_id);
  submitting.value = true;
  const r = await request.post('/trade-purchase/preturn', { po_id: g ? g.po_id : '', grn_id: prtForm.grn_id, items, reason });
  submitting.value = false;
  if (r.code === 200) { dlg.prt = false; ElMessage.success(r.msg || '已提交'); tab.value = 'preturns'; loadPreturns(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 付款登记（财务） ---------- */
const payForm = reactive({ po_id: '', balance: 0, amount: null, pay_date: new Date().toISOString().slice(0, 10), way: '银行转账' });
function openPayForm() {
  Object.assign(payForm, {
    po_id: poDetail.value.id,
    balance: parseFloat(poDetail.value.total_with_tax) || 0,
    amount: null, pay_date: new Date().toISOString().slice(0, 10), way: '银行转账'
  });
  dlg.pay = true;
}
async function submitPay() {
  const amt = parseFloat(payForm.amount);
  if (!(amt > 0)) { ElMessage.warning('请输入正确的付款金额'); return; }
  submitting.value = true;
  const r = await request.post('/trade-finance/pay', { po_id: payForm.po_id, amount: amt, pay_date: payForm.pay_date, way: payForm.way });
  submitting.value = false;
  if (r.code === 200) {
    dlg.pay = false; ElMessage.success(r.msg || '付款成功');
    loadStats(); loadOrders();
    if (dlg.poDetail && poDetail.value) openPoDetail(poDetail.value.id);
  } else ElMessage.error(r.msg || '付款失败');
}

/* ---------- 统计图表 ---------- */
const trendChartRef = ref(null);
const supChartRef = ref(null);
const statusChartRef = ref(null);
let chartInsts = [];
function disposeCharts() {
  chartInsts.forEach(c => c && c.dispose());
  chartInsts = [];
}
function renderCharts() {
  disposeCharts();
  const d = trendData.value;
  if (trendChartRef.value) {
    const ch = echarts.init(trendChartRef.value);
    ch.setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { fontSize: 12 } },
      grid: { left: 50, right: 60, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: (d.monthly || []).map(m => m.month) },
      yAxis: [
        { type: 'value', name: '订单数', min: 0, position: 'left' },
        { type: 'value', name: '金额(万元)', min: 0, position: 'right', splitLine: { show: false } }
      ],
      series: [
        { name: '订单数', type: 'bar', data: (d.monthly || []).map(m => m.count), itemStyle: { color: 'rgba(37,99,235,0.6)', borderColor: '#2563eb', borderWidth: 1, borderRadius: 4 }, yAxisIndex: 0 },
        { name: '金额(万元)', type: 'line', data: (d.monthly || []).map(m => Math.round(m.amount / 10000 * 100) / 100), itemStyle: { color: '#f59e0b' }, lineStyle: { color: '#f59e0b', width: 2 }, areaStyle: { color: 'rgba(245,158,11,0.1)' }, smooth: true, yAxisIndex: 1 }
      ]
    });
    chartInsts.push(ch);
  }
  if (supChartRef.value) {
    const tops = d.topSuppliers || [];
    const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#f97316'];
    const ch = echarts.init(supChartRef.value);
    ch.setOption({
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: ps => {
          const p = ps[0];
          const src = tops[p.dataIndex];
          return `${p.name}<br/>金额: ${p.value} 万元<br/>订单${src ? src.orders : 0}笔`;
        }
      },
      grid: { left: 90, right: 40, top: 20, bottom: 40 },
      xAxis: { type: 'value', name: '金额(万元)', min: 0 },
      yAxis: { type: 'category', inverse: true, data: tops.map(c => c.supplier_name.length > 8 ? c.supplier_name.slice(0, 8) + '…' : c.supplier_name) },
      series: [{
        name: '金额(万元)', type: 'bar',
        data: tops.map((c, i) => ({ value: Math.round(c.total_amount / 10000 * 100) / 100, itemStyle: { color: palette[i % palette.length], borderRadius: 6 } }))
      }]
    });
    chartInsts.push(ch);
  }
  if (statusChartRef.value) {
    const pcolors = { '待审批': '#f59e0b', '审批中': '#3b82f6', '已生效': '#10b981', '部分入库': '#06b6d4', '全部入库': '#8b5cf6', '已作废': '#ef4444' };
    const ch = echarts.init(statusChartRef.value);
    ch.setOption({
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 12 } },
      series: [{
        type: 'pie', radius: ['55%', '80%'], center: ['40%', '50%'],
        data: (d.statusDist || []).map(x => ({ name: x.status, value: x.count, itemStyle: { color: pcolors[x.status] || '#94a3b8' } })),
        label: { show: false }
      }]
    });
    chartInsts.push(ch);
  }
}
function onResize() { chartInsts.forEach(c => c && c.resize()); }

/* ---------- 打印 ---------- */
function printDoc(title, infoHtml, flow, itemsHtml) {
  const escH = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const flowHTML = (flow || []).map((s, i) => {
    const prevDone = i === 0 || flow.slice(0, i).every(x => x.done);
    const cls = s.done ? 'wf-done' : prevDone ? 'wf-current' : 'wf-pending';
    return '<span class="wf-step ' + cls + '"><div class="wf-name">' + escH(s.step || s.name || '') + '</div><div style="font-size:11px;">' + escH(s.user || s.approver || '—') + '</div><div class="wf-time">' + escH(s.time || s.approved_at || '—') + '</div></span>' + (i < flow.length - 1 ? '<span class="wf-arrow">→</span>' : '');
  }).join('');
  const w = window.open('', '_blank');
  w.document.write('<html><head><title>' + title + '</title><style>body{font-family:"Microsoft YaHei",sans-serif;padding:40px;max-width:750px;margin:0 auto;}h2{text-align:center;margin-bottom:24px;border-bottom:2px solid #2563eb;padding-bottom:12px;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px;}th{background:#f5f5f5;width:15%;}.wf-step{display:inline-block;text-align:center;padding:8px 12px;border:1px solid #ddd;border-radius:6px;margin:4px;font-size:12px;min-width:80px;}.wf-arrow{display:inline-block;color:#999;margin:0 4px;}.wf-done{background:#d1fae5;border-color:#10b981;}.wf-current{background:#fef3c7;border-color:#f59e0b;}.wf-pending{background:#f9fafb;border-color:#d1d5db;}.wf-name{font-weight:bold;margin-bottom:4px;}.wf-time{color:#666;font-size:11px;}h4{font-size:16px;margin:20px 0 10px;}.footer{margin-top:40px;text-align:center;color:#999;font-size:12px;}</style></head><body><h2>' + title + '</h2><table>' + infoHtml + '</table>' + (itemsHtml ? '<h4>明细</h4>' + itemsHtml : '') + '<h4>审批流程</h4><div style="text-align:center;">' + flowHTML + '</div><div class="footer">四川卓盟科技有限公司 · 打印时间：' + new Date().toLocaleString('zh-CN') + '</div></body></html>');
  w.document.close();
  setTimeout(() => { w.print(); }, 500);
}
function itemsPrintHtml(d, firstCol) {
  const escH = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = (d.items || []).map(it => '<tr><td>' + escH(it.name) + '</td><td>' + escH(it.qty) + '</td><td>¥' + money(it.price) + '</td><td>' + escH(it.tax_rate) + '%</td><td>¥' + money((Number(it.qty) || 0) * (Number(it.price) || 0)) + '</td></tr>').join('');
  return rows ? '<table><thead><tr><th>' + firstCol + '</th><th>数量</th><th>单价</th><th>税率</th><th>金额</th></tr></thead><tbody>' + rows + '</tbody></table>' : '';
}
function printPo() {
  const d = poDetail.value;
  if (!d) { ElMessage.error('数据已过期，请重新打开详情'); return; }
  const escH = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const info = '<tr><th>订单号</th><td>' + escH(d.po_no) + '</td><th>供应商</th><td>' + escH(d.supplier_name) + '</td></tr>' +
    '<tr><th>金额</th><td>¥' + money(d.total_with_tax) + '</td><th>状态</th><td>' + escH(d.status) + '</td></tr>' +
    '<tr><th>经办人</th><td>' + escH(d.creator_name) + '</td><th>部门</th><td>' + escH(d.creator_dept) + '</td></tr>' +
    '<tr><th>结算方式</th><td>' + escH(d.settle_type || '—') + '</td><th>交货日期</th><td>' + escH(d.delivery_date || '—') + '</td></tr>';
  printDoc('采购订单', info, d.flow, itemsPrintHtml(d, '物料'));
}
function printReq() {
  const d = reqDetail.value;
  if (!d) { ElMessage.error('数据已过期，请重新打开详情'); return; }
  const escH = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const info = '<tr><th>申请编号</th><td>' + escH(d.req_no) + '</td><th>标题</th><td>' + escH(d.title) + '</td></tr>' +
    '<tr><th>金额</th><td>¥' + money(d.total_with_tax) + '</td><th>状态</th><td>' + escH(d.status) + '</td></tr>' +
    '<tr><th>申请人</th><td>' + escH(d.creator_name) + '</td><th>部门</th><td>' + escH(d.creator_dept) + '</td></tr>';
  printDoc('采购申请单', info, d.flow, itemsPrintHtml(d, '物料'));
}

/* ---------- 生命周期 ---------- */
onMounted(async () => {
  loading.value = true;
  await Promise.all([loadStats(), loadRequests()]);
  loading.value = false;
  window.addEventListener('resize', onResize);
});
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  disposeCharts();
});
</script>

<style scoped>
.trade-purchase { padding: 20px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; }
.page-header p { margin: 4px 0 0; font-size: 13px; color: var(--el-text-color-secondary); }
.text-muted { color: var(--el-text-color-secondary); font-size: 13px; }
.cell-sub { font-size: 11px; color: var(--el-text-color-secondary); }
.bar-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: var(--el-text-color-secondary); }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: var(--el-text-color-secondary); }
.ca-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.ca-tab { padding: 8px 16px; border: 1px solid var(--el-border-color); background: var(--el-bg-color-page); border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--el-text-color-regular); transition: all .2s; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.ca-tab:hover { border-color: #2563eb; color: #2563eb; }
.ca-tab.active { background: #2563eb; color: #fff; border-color: #2563eb; }
.st-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.chart-title { margin: 0 0 8px; font-size: 14px; }
.items-editor { width: 100%; margin-top: 4px; }
.item-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
@media (max-width: 900px) {
  .grid-2 { grid-template-columns: 1fr; }
}
</style>

<style>
.wf-step { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 16px; border-radius: 10px; border: 2px solid; min-width: 100px; text-align: center; }
.wf-step .wf-icon { font-size: 20px; line-height: 1; }
.wf-step .wf-name { font-size: 13px; font-weight: 600; white-space: nowrap; }
.wf-step .wf-user { font-size: 11px; color: var(--el-text-color-secondary); white-space: nowrap; }
.wf-step .wf-time { font-size: 10px; color: var(--el-text-color-secondary); opacity: .8; }
.wf-done { background: #d1fae5; border-color: #10b981; }
.wf-done .wf-icon { color: #10b981; }
.wf-current { background: #fef3c7; border-color: #f59e0b; }
.wf-current .wf-icon { color: #f59e0b; }
.wf-pending { background: #f9fafb; border-color: #d1d5db; }
.wf-pending .wf-icon { color: #9ca3af; }
.wf-arrow { display: inline-flex; align-items: center; color: #999; margin: 24px 4px 0; }
</style>
