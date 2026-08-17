<template>
  <div class="trade-sales">
    <div class="page-header">
      <h2>销售订单管理</h2>
      <p>销售订单 / 出库 / 退换货 / 对账 / 统计</p>
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
      <!-- ============ 销售订单 ============ -->
      <template v-if="tab === 'orders'">
        <div class="bar-row">
          <span class="text-muted">销售订单生效后财务预登记"待确认应收"；出库后转正式应收并生成收入凭证</span>
          <el-button type="primary" @click="openSoForm"><el-icon><Plus /></el-icon> 新增销售订单</el-button>
        </div>
        <el-table :data="orders" stripe size="small">
          <el-table-column prop="so_no" label="订单号" width="130" />
          <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
          <el-table-column label="价税合计" width="120">
            <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
          </el-table-column>
          <el-table-column label="回款状态" width="100">
            <template #default="{ row }"><span class="st-badge" :style="stStyle(row.receive_status)">{{ row.receive_status || '—' }}</span></template>
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
                <el-button size="small" type="primary" @click="doApprove(id => request.post(`/trade-sales/${id}/approve`), row.id, () => loadOrders())">审批</el-button>
                <el-button size="small" @click="doReject((id, remark) => request.post(`/trade-sales/${id}/reject`, { remark }), row.id, () => loadOrders())">驳回</el-button>
              </template>
              <el-button v-if="['已生效', '部分出库'].includes(row.status)" size="small" type="primary" @click="openOutForm(row.id)">出库</el-button>
              <el-button size="small" @click="openSoDetail(row.id)">详情</el-button>
              <el-button v-if="['待审批', '审批中', '已生效'].includes(row.status)" size="small" @click="voidSo(row.id)">作废</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无销售订单</span></template>
        </el-table>
      </template>

      <!-- ============ 出库单 ============ -->
      <template v-else-if="tab === 'outs'">
        <div class="bar-row">
          <span class="text-muted">出库单生效后：应收转正式 + 自动生成收入凭证（含销项税）+ 反写订单出库状态</span>
          <el-button type="primary" @click="openOutForm()"><el-icon><Right /></el-icon> 新增出库单</el-button>
        </div>
        <el-table :data="outs" stripe size="small">
          <el-table-column prop="out_no" label="出库单号" width="140" />
          <el-table-column prop="so_no" label="关联订单" width="130" />
          <el-table-column prop="customer_name" label="客户" min-width="130" show-overflow-tooltip />
          <el-table-column label="价税合计" width="110">
            <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
          </el-table-column>
          <el-table-column prop="warehouse" label="仓库" width="90" />
          <el-table-column label="签收人" width="100">
            <template #default="{ row }">{{ row.receiver || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <template v-if="['待审批', '审批中'].includes(row.status)">
                <el-button size="small" type="primary" @click="doApprove(id => request.post(`/trade-sales/out/${id}/approve`), row.id, () => loadOuts())">审批</el-button>
                <el-button size="small" @click="doReject((id, remark) => request.post(`/trade-sales/out/${id}/reject`, { remark }), row.id, () => loadOuts())">驳回</el-button>
              </template>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无出库单</span></template>
        </el-table>
      </template>

      <!-- ============ 退换货 ============ -->
      <template v-else-if="tab === 'sreturns'">
        <div class="bar-row">
          <span class="text-muted">退货单生效后自动冲减应收并生成红字凭证；换货单仅换货不涉金额冲减</span>
          <el-button type="primary" @click="openSrtForm"><el-icon><RefreshLeft /></el-icon> 新增退换货单</el-button>
        </div>
        <el-table :data="sreturns" stripe size="small">
          <el-table-column prop="rt_no" label="单号" width="140" />
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <span class="st-badge" :style="stStyle(row.type === '换货' ? '已转单' : row.type)">{{ row.type || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="so_no" label="关联订单" width="130" />
          <el-table-column prop="customer_name" label="客户" min-width="120" show-overflow-tooltip />
          <el-table-column label="金额" width="110">
            <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
          </el-table-column>
          <el-table-column label="原因" min-width="120">
            <template #default="{ row }">{{ (row.reason || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <template v-if="['待审批', '审批中'].includes(row.status)">
                <el-button size="small" type="primary" @click="doApprove(id => request.post(`/trade-sales/sreturn/${id}/approve`), row.id, () => loadSreturns())">审批</el-button>
                <el-button size="small" @click="doReject((id, remark) => request.post(`/trade-sales/sreturn/${id}/reject`, { remark }), row.id, () => loadSreturns())">驳回</el-button>
              </template>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无退换货单</span></template>
        </el-table>
      </template>

      <!-- ============ 回款对账 ============ -->
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
          <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
          <el-table-column prop="orders" label="订单数" width="80" />
          <el-table-column label="订单金额" width="120">
            <template #default="{ row }">¥{{ money(row.order_amount) }}</template>
          </el-table-column>
          <el-table-column label="出库确认额" width="120">
            <template #default="{ row }">¥{{ money(row.confirmed) }}</template>
          </el-table-column>
          <el-table-column label="退货冲减" width="110">
            <template #default="{ row }">¥{{ money(row.returned) }}</template>
          </el-table-column>
          <el-table-column label="应收合计" width="120">
            <template #default="{ row }">¥{{ money(row.receivable) }}</template>
          </el-table-column>
          <el-table-column label="已回款" width="110">
            <template #default="{ row }">¥{{ money(row.received) }}</template>
          </el-table-column>
          <el-table-column label="未回余额" width="120">
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
            <h4 class="chart-title">月度销售趋势</h4>
            <div ref="trendChartRef" style="height: 300px;"></div>
          </el-card>
          <el-card shadow="never">
            <h4 class="chart-title">客户排名 TOP10</h4>
            <div ref="custChartRef" style="height: 300px;"></div>
          </el-card>
        </div>
        <div class="grid-2">
          <el-card shadow="never">
            <h4 class="chart-title">订单状态分布</h4>
            <div ref="statusChartRef" style="height: 260px;"></div>
          </el-card>
          <el-card shadow="never">
            <h4 class="chart-title">产品销售 TOP10</h4>
            <el-table :data="trendData.topProducts || []" stripe size="small" max-height="260">
              <el-table-column label="产品名称" min-width="140">
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

    <!-- ============ 弹窗：新增销售订单 ============ -->
    <el-dialog v-model="dlg.so" title="新增销售订单" width="640px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="客户" required>
          <el-select v-model="soForm.customer_id" style="width: 100%;">
            <el-option v-for="c in customers" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="交货 / 收款">
          <div style="display: flex; gap: 12px; width: 100%;">
            <el-date-picker v-model="soForm.delivery_date" type="date" value-format="YYYY-MM-DD" placeholder="交货日期" style="flex: 1;" />
            <el-select v-model="soForm.pay_cycle" placeholder="收款周期" style="flex: 1;">
              <el-option v-for="o in ['月结30天', '月结60天', '款到发货', '货到付款']" :key="o" :value="o" :label="o" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="销售明细" required>
          <div class="items-editor">
            <div v-for="(it, i) in soForm.items" :key="i" class="item-row">
              <el-input v-model="it.name" placeholder="名称" style="flex: 2; min-width: 120px;" />
              <el-input-number v-model="it.qty" :min="0.01" :step="1" controls-position="right" style="flex: 1; min-width: 100px;" />
              <el-input-number v-model="it.price" :min="0" :step="0.01" controls-position="right" style="flex: 1; min-width: 110px;" />
              <el-select v-model="it.tax_rate" style="flex: 1; min-width: 80px;">
                <el-option v-for="t in [0, 6, 9, 13]" :key="t" :value="t" :label="t + '%'" />
              </el-select>
              <el-button @click="soForm.items.splice(i, 1)" title="删除该行">×</el-button>
            </div>
            <el-button size="small" @click="soForm.items.push({ name: '', qty: 1, price: 0, tax_rate: 13 })"><el-icon><Plus /></el-icon> 添加明细行</el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="soForm.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.so = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitSo">提交订单</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：新增出库单 ============ -->
    <el-dialog v-model="dlg.out" title="新增销售出库单" width="640px" destroy-on-close>
      <el-form label-width="110px">
        <el-form-item label="关联销售订单" required>
          <el-select v-model="outForm.so_id" style="width: 100%;">
            <el-option v-for="s in effectiveOrders" :key="s.id" :value="s.id" :label="`${s.so_no} · ${s.customer_name} · ¥${money(s.total_with_tax)}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="仓库 / 签收">
          <div style="display: flex; gap: 12px; width: 100%; flex-wrap: wrap;">
            <el-select v-model="outForm.warehouse" style="flex: 1; min-width: 110px;">
              <el-option v-for="o in ['主仓库', '成品仓', '样品仓']" :key="o" :value="o" :label="o" />
            </el-select>
            <el-input v-model="outForm.receiver" placeholder="签收人" style="flex: 1; min-width: 130px;" />
          </div>
        </el-form-item>
        <el-form-item label="实际出库明细" required>
          <div class="items-editor">
            <div v-for="(it, i) in outForm.items" :key="i" class="item-row">
              <el-input v-model="it.name" placeholder="名称" style="flex: 2; min-width: 120px;" />
              <el-input-number v-model="it.qty" :min="0.01" :step="1" controls-position="right" style="flex: 1; min-width: 100px;" />
              <el-input-number v-model="it.price" :min="0" :step="0.01" controls-position="right" style="flex: 1; min-width: 110px;" />
              <el-select v-model="it.tax_rate" style="flex: 1; min-width: 80px;">
                <el-option v-for="t in [0, 6, 9, 13]" :key="t" :value="t" :label="t + '%'" />
              </el-select>
              <el-button @click="outForm.items.splice(i, 1)" title="删除该行">×</el-button>
            </div>
            <el-button size="small" @click="outForm.items.push({ name: '', qty: 1, price: 0, tax_rate: 13 })"><el-icon><Plus /></el-icon> 添加明细行</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.out = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitOut">提交出库单</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：新增退换货单 ============ -->
    <el-dialog v-model="dlg.srt" title="新增退换货单" width="640px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="关联出库单" required>
          <el-select v-model="srtForm.out_id" style="width: 100%;">
            <el-option v-for="o in effectiveOuts" :key="o.id" :value="o.id" :label="`${o.out_no} · 订单${o.so_no} · ${o.customer_name}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="srtForm.type" style="width: 100%;">
            <el-option value="退货" label="退货" />
            <el-option value="换货" label="换货" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input v-model="srtForm.reason" placeholder="如：质量问题/客户拒收" />
        </el-form-item>
        <el-form-item label="退换明细" required>
          <div class="items-editor">
            <div v-for="(it, i) in srtForm.items" :key="i" class="item-row">
              <el-input v-model="it.name" placeholder="名称" style="flex: 2; min-width: 120px;" />
              <el-input-number v-model="it.qty" :min="0.01" :step="1" controls-position="right" style="flex: 1; min-width: 100px;" />
              <el-input-number v-model="it.price" :min="0" :step="0.01" controls-position="right" style="flex: 1; min-width: 110px;" />
              <el-select v-model="it.tax_rate" style="flex: 1; min-width: 80px;">
                <el-option v-for="t in [0, 6, 9, 13]" :key="t" :value="t" :label="t + '%'" />
              </el-select>
              <el-button @click="srtForm.items.splice(i, 1)" title="删除该行">×</el-button>
            </div>
            <el-button size="small" @click="srtForm.items.push({ name: '', qty: 1, price: 0, tax_rate: 13 })"><el-icon><Plus /></el-icon> 添加明细行</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.srt = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitSrt">提交</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：订单详情 ============ -->
    <el-dialog v-model="dlg.soDetail" :title="soDetail ? `${soDetail.so_no} 销售订单` : '订单详情'" width="780px" destroy-on-close>
      <template v-if="soDetail">
        <p class="text-muted" style="font-size: 12px; margin-top: 0;">{{ soDetail.customer_name }} · {{ soDetail.pay_cycle || '' }} · {{ soDetail.delivery_date || '' }} · 经办 {{ soDetail.creator_name }}（{{ soDetail.creator_dept }}）</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0;">
          <span class="st-badge" :style="stStyle(soDetail.status)">{{ soDetail.status || '—' }}</span>
          <span class="st-badge" :style="stStyle(soDetail.receive_status)">{{ soDetail.receive_status || '—' }}</span>
          <span class="st-badge" :style="stStyle(soDetail.fin_status)">{{ soDetail.fin_status || '—' }}</span>
        </div>
        <p style="font-size: 13px;">不含税 ¥{{ money(soDetail.amount) }} · 税额 ¥{{ money(soDetail.tax_amount) }} · <b>价税合计 ¥{{ money(soDetail.total_with_tax) }}</b></p>
        <el-table v-if="(soDetail.items || []).length" :data="soDetail.items" stripe size="small" style="margin-top: 8px;">
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
        <flow-view :flow="soDetail.flow" />
        <template v-if="(soDetail.outs || []).length">
          <h4 style="margin-top: 12px;">出库单</h4>
          <el-table :data="soDetail.outs" stripe size="small">
            <el-table-column prop="out_no" label="单号" width="140" />
            <el-table-column label="金额" width="120">
              <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
            </el-table-column>
            <el-table-column prop="warehouse" label="仓库" width="100" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
            </el-table-column>
          </el-table>
        </template>
        <template v-if="(soDetail.returns || []).length">
          <h4 style="margin-top: 12px;">退换货</h4>
          <el-table :data="soDetail.returns" stripe size="small">
            <el-table-column prop="rt_no" label="单号" width="140" />
            <el-table-column prop="type" label="类型" width="80" />
            <el-table-column label="金额" width="120">
              <template #default="{ row }">¥{{ money(row.total_with_tax) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
            </el-table-column>
          </el-table>
        </template>
        <template v-if="(soDetail.ar || []).length">
          <h4 style="margin-top: 12px;">应收账款</h4>
          <el-table :data="soDetail.ar" stripe size="small">
            <el-table-column prop="source_no" label="单号" width="140" />
            <el-table-column label="应收" width="110">
              <template #default="{ row }">¥{{ money(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="已收" width="110">
              <template #default="{ row }">¥{{ money(row.received_amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><span class="st-badge" :style="stStyle(row.status)">{{ row.status || '—' }}</span></template>
            </el-table-column>
          </el-table>
        </template>
        <template v-if="(soDetail.receipts || []).length">
          <h4 style="margin-top: 12px;">回款记录</h4>
          <el-table :data="soDetail.receipts" stripe size="small">
            <el-table-column prop="id" label="回款单号" width="130" />
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
        <el-button @click="dlg.soDetail = false">关闭</el-button>
        <el-button type="info" @click="printSo"><el-icon><Printer /></el-icon> 打印</el-button>
        <el-button v-if="soDetail && ['已生效', '部分出库'].includes(soDetail.status) && isFinance" type="primary" @click="openRcvForm"><el-icon><Money /></el-icon> 回款登记</el-button>
      </template>
    </el-dialog>

    <!-- ============ 弹窗：回款登记 ============ -->
    <el-dialog v-model="dlg.rcv" title="回款登记" width="480px" destroy-on-close>
      <p class="text-muted" style="font-size: 12px; margin-top: 0;">销售订单：{{ rcvForm.so_id }} · 应收余额 ¥{{ money(rcvForm.balance) }}</p>
      <el-form label-width="90px">
        <el-form-item label="回款金额" required>
          <el-input-number v-model="rcvForm.amount" :min="0.01" :max="rcvForm.balance" :step="0.01" controls-position="right" style="width: 100%;" :placeholder="'不超过 ' + rcvForm.balance" />
        </el-form-item>
        <el-form-item label="回款日期">
          <div style="display: flex; gap: 12px; width: 100%;">
            <el-date-picker v-model="rcvForm.receipt_date" type="date" value-format="YYYY-MM-DD" style="flex: 1;" />
            <el-select v-model="rcvForm.way" style="flex: 1;">
              <el-option v-for="o in ['银行转账', '承兑汇票', '现金', '支付宝', '微信']" :key="o" :value="o" :label="o" />
            </el-select>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.rcv = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitRcv">确认回款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, h } from 'vue';
import * as echarts from 'echarts';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, Document, CircleCheck, Money, CreditCard, Calendar, Trophy, User,
  RefreshLeft, Printer, Warning, Clock, ArrowRight, Bell, Right
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
  '待复核': '#ef4444', '已复核': '#10b981',
  'success': '#10b981', 'failed': '#ef4444'
};
function stStyle(s) {
  const c = ST_COLORS[s] || '#64748b';
  if (!s) return { color: 'var(--el-text-color-secondary)', background: 'transparent' };
  return { background: c + '18', color: c };
}
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
  { key: 'orders', label: '销售订单' },
  { key: 'outs', label: '出库单' },
  { key: 'sreturns', label: '退换货' },
  { key: 'reconcile', label: '回款对账' },
  { key: 'trend', label: '统计趋势' }
];
const tab = ref('orders');
const loading = ref(false);
const submitting = ref(false);

const stats = ref({});
const orders = ref([]);
const customers = ref([]);
const outs = ref([]);
const sreturns = ref([]);
const reconcileRows = ref([]);
const trendData = ref({});

const topKpis = computed(() => {
  const d = stats.value;
  return [
    { title: '订单总数', value: d.total ?? 0, sub: '含全部状态', icon: Document, color: '#2563eb' },
    { title: '生效订单', value: d.effective ?? 0, sub: '待审批 ' + (d.pending ?? 0) + ' 单', icon: CircleCheck, color: '#10b981' },
    { title: '销售总额', value: '¥' + money(d.totalAmount), sub: '价税合计', icon: Money, color: '#8b5cf6' },
    { title: '应收余额', value: '¥' + money(d.unreceived), sub: '已回 ¥' + money(d.received), icon: CreditCard, color: '#f59e0b' }
  ];
});
const reconcileKpis = computed(() => {
  const sum = reconcileRows.value.reduce((s, x) => ({
    order_amount: s.order_amount + (Number(x.order_amount) || 0),
    receivable: s.receivable + (Number(x.receivable) || 0),
    received: s.received + (Number(x.received) || 0),
    balance: s.balance + (Number(x.balance) || 0)
  }), { order_amount: 0, receivable: 0, received: 0, balance: 0 });
  return [
    { title: '订单金额', value: '¥' + money(sum.order_amount), sub: reconcileRows.value.length + ' 家客户', icon: Document, color: '#2563eb' },
    { title: '确认应收', value: '¥' + money(sum.receivable), sub: '按出库确认', icon: CircleCheck, color: '#10b981' },
    { title: '已回款', value: '¥' + money(sum.received), sub: '财务登记', icon: CreditCard, color: '#0d9488' },
    { title: '未回余额', value: '¥' + money(sum.balance), sub: '应收未收', icon: Warning, color: '#f59e0b' }
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
    { title: '活跃客户', value: s.activeCustomers || 0, sub: '有成交记录', icon: User, color: '#8b5cf6' }
  ];
});
const effectiveOrders = computed(() => orders.value.filter(s => ['已生效', '部分出库'].includes(s.status)));
const effectiveOuts = ref([]);

/* ---------- 数据加载 ---------- */
async function loadStats() {
  const r = await request.get('/trade-sales/stats');
  if (r.code === 200) stats.value = r.data || {};
  else ElMessage.error('加载失败: ' + (r.msg || ''));
}
async function loadOrders() {
  const [list, custs] = await Promise.all([
    request.get('/trade-sales'),
    request.get('/trade-sales/customers-lite')
  ]);
  if (list.code === 200) orders.value = list.data || [];
  if (custs.code === 200) customers.value = custs.data || [];
}
async function loadOuts() {
  const r = await request.get('/trade-sales/outs/list');
  if (r.code === 200) outs.value = r.data || [];
}
async function loadSreturns() {
  const r = await request.get('/trade-sales/sreturns/list');
  if (r.code === 200) sreturns.value = r.data || [];
}
async function loadReconcile() {
  const r = await request.get('/trade-sales/reconcile');
  if (r.code === 200) reconcileRows.value = r.data || [];
}
async function loadTrend() {
  const r = await request.get('/trade-sales/stats/trend');
  if (r.code !== 200) { ElMessage.error('加载失败: ' + (r.msg || '')); return; }
  trendData.value = r.data || {};
  await nextTick();
  renderCharts();
}

async function loadTab() {
  loading.value = true;
  try {
    if (tab.value === 'orders') await loadOrders();
    else if (tab.value === 'outs') await loadOuts();
    else if (tab.value === 'sreturns') await loadSreturns();
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

/* ---------- 销售订单 ---------- */
const dlg = reactive({ so: false, out: false, srt: false, soDetail: false, rcv: false });
const blankItem = () => ({ name: '', qty: 1, price: 0, tax_rate: 13 });
function validItems(items) {
  return items.filter(it => it.name && it.name.trim() && Number(it.qty) > 0)
    .map(it => ({ name: it.name.trim(), qty: Number(it.qty), price: Number(it.price) || 0, tax_rate: Number(it.tax_rate) || 0 }));
}

const soForm = reactive({ customer_id: '', delivery_date: '', pay_cycle: '月结30天', remark: '', items: [blankItem()] });
async function ensureCustomers() {
  if (!customers.value.length) {
    const custs = await request.get('/trade-sales/customers-lite');
    if (custs.code === 200) customers.value = custs.data || [];
  }
  if (!customers.value.length) { ElMessage.warning('客户数据加载中，请稍后重试'); return false; }
  return true;
}
async function openSoForm() {
  if (!(await ensureCustomers())) return;
  Object.assign(soForm, { customer_id: customers.value[0]?.id || '', delivery_date: '', pay_cycle: '月结30天', remark: '', items: [blankItem()] });
  dlg.so = true;
}
function custName(id) {
  const c = customers.value.find(x => x.id === id);
  return c ? c.name : '';
}
async function submitSo() {
  const items = validItems(soForm.items);
  if (!items.length) { ElMessage.warning('请至少填写一行有效明细'); return; }
  submitting.value = true;
  const r = await request.post('/trade-sales', {
    customer_id: soForm.customer_id, customer_name: custName(soForm.customer_id),
    items, delivery_date: soForm.delivery_date, pay_cycle: soForm.pay_cycle, remark: (soForm.remark || '').trim()
  });
  submitting.value = false;
  if (r.code === 200) { dlg.so = false; ElMessage.success(r.msg || '已提交'); loadOrders(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function voidSo(id) {
  try {
    await ElMessageBox.confirm('确认作废该销售订单？（已出库/已回款的订单禁止作废，请走退换货流程）', '作废订单', { confirmButtonText: '确认作废', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const r = await request.post(`/trade-sales/${id}/void`);
  if (r.code === 200) { ElMessage.success(r.msg || '已作废'); loadOrders(); }
  else ElMessage.error(r.msg || '作废失败');
}
const soDetail = ref(null);
async function openSoDetail(id) {
  const r = await request.get('/trade-sales/' + id);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  soDetail.value = r.data;
  dlg.soDetail = true;
}

/* ---------- 出库单 ---------- */
const outForm = reactive({ so_id: '', warehouse: '主仓库', receiver: '', items: [blankItem()] });
async function openOutForm(soId) {
  if (!orders.value.length) await loadOrders();
  if (soId) {
    Object.assign(outForm, { so_id: soId, warehouse: '主仓库', receiver: '', items: [blankItem()] });
  } else {
    if (!effectiveOrders.value.length) { ElMessage.warning('暂无可出库的已生效订单'); return; }
    Object.assign(outForm, { so_id: effectiveOrders.value[0].id, warehouse: '主仓库', receiver: '', items: [blankItem()] });
  }
  dlg.out = true;
}
async function submitOut() {
  const items = validItems(outForm.items);
  if (!items.length) { ElMessage.warning('请至少填写一行有效明细'); return; }
  submitting.value = true;
  const r = await request.post('/trade-sales/out', {
    so_id: outForm.so_id, items,
    warehouse: outForm.warehouse, receiver: (outForm.receiver || '').trim()
  });
  submitting.value = false;
  if (r.code === 200) { dlg.out = false; ElMessage.success(r.msg || '已提交'); tab.value = 'outs'; loadOuts(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 退换货 ---------- */
const srtForm = reactive({ out_id: '', type: '退货', reason: '', items: [blankItem()] });
async function openSrtForm() {
  const r = await request.get('/trade-sales/outs/list');
  effectiveOuts.value = r.code === 200 ? (r.data || []).filter(o => o.status === '已生效') : [];
  if (!effectiveOuts.value.length) { ElMessage.warning('暂无可退换的已生效出库单'); return; }
  Object.assign(srtForm, { out_id: effectiveOuts.value[0].id, type: '退货', reason: '', items: [blankItem()] });
  dlg.srt = true;
}
async function submitSrt() {
  const items = validItems(srtForm.items);
  const reason = srtForm.reason.trim();
  if (!reason) { ElMessage.warning('请填写退换原因'); return; }
  if (!items.length) { ElMessage.warning('请至少填写一行有效明细'); return; }
  const o = effectiveOuts.value.find(x => x.id === srtForm.out_id);
  submitting.value = true;
  const r = await request.post('/trade-sales/sreturn', { so_id: o ? o.so_id : '', out_id: srtForm.out_id, type: srtForm.type, items, reason });
  submitting.value = false;
  if (r.code === 200) { dlg.srt = false; ElMessage.success(r.msg || '已提交'); tab.value = 'sreturns'; loadSreturns(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 回款登记（财务） ---------- */
const rcvForm = reactive({ so_id: '', balance: 0, amount: null, receipt_date: new Date().toISOString().slice(0, 10), way: '银行转账' });
function openRcvForm() {
  Object.assign(rcvForm, {
    so_id: soDetail.value.id,
    balance: parseFloat(soDetail.value.total_with_tax) || 0,
    amount: null, receipt_date: new Date().toISOString().slice(0, 10), way: '银行转账'
  });
  dlg.rcv = true;
}
async function submitRcv() {
  const amt = parseFloat(rcvForm.amount);
  if (!(amt > 0)) { ElMessage.warning('请输入正确的回款金额'); return; }
  submitting.value = true;
  const r = await request.post('/trade-finance/receipt', { so_id: rcvForm.so_id, amount: amt, receipt_date: rcvForm.receipt_date, way: rcvForm.way });
  submitting.value = false;
  if (r.code === 200) {
    dlg.rcv = false; ElMessage.success(r.msg || '回款成功');
    loadStats(); loadOrders();
    if (dlg.soDetail && soDetail.value) openSoDetail(soDetail.value.id);
  } else ElMessage.error(r.msg || '回款失败');
}

/* ---------- 统计图表 ---------- */
const trendChartRef = ref(null);
const custChartRef = ref(null);
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
  if (custChartRef.value) {
    const tops = d.topCustomers || [];
    const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#f97316'];
    const ch = echarts.init(custChartRef.value);
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
      yAxis: { type: 'category', inverse: true, data: tops.map(c => c.customer_name.length > 8 ? c.customer_name.slice(0, 8) + '…' : c.customer_name) },
      series: [{
        name: '金额(万元)', type: 'bar',
        data: tops.map((c, i) => ({ value: Math.round(c.total_amount / 10000 * 100) / 100, itemStyle: { color: palette[i % palette.length], borderRadius: 6 } }))
      }]
    });
    chartInsts.push(ch);
  }
  if (statusChartRef.value) {
    const scolors = { '待审批': '#f59e0b', '审批中': '#3b82f6', '已生效': '#10b981', '部分出库': '#06b6d4', '全部出库': '#8b5cf6', '已作废': '#ef4444' };
    const ch = echarts.init(statusChartRef.value);
    ch.setOption({
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 12 } },
      series: [{
        type: 'pie', radius: ['55%', '80%'], center: ['40%', '50%'],
        data: (d.statusDist || []).map(x => ({ name: x.status, value: x.count, itemStyle: { color: scolors[x.status] || '#94a3b8' } })),
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
function printSo() {
  const d = soDetail.value;
  if (!d) { ElMessage.error('数据已过期，请重新打开详情'); return; }
  const escH = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const info = '<tr><th>订单号</th><td>' + escH(d.so_no) + '</td><th>客户</th><td>' + escH(d.customer_name) + '</td></tr>' +
    '<tr><th>金额</th><td>¥' + money(d.total_with_tax) + '</td><th>状态</th><td>' + escH(d.status) + '</td></tr>' +
    '<tr><th>经办人</th><td>' + escH(d.creator_name) + '</td><th>部门</th><td>' + escH(d.creator_dept) + '</td></tr>' +
    '<tr><th>交货日期</th><td>' + escH(d.delivery_date || '—') + '</td><th>收款周期</th><td>' + escH(d.pay_cycle || '—') + '</td></tr>';
  const rows = (d.items || []).map(it => '<tr><td>' + escH(it.name) + '</td><td>' + escH(it.qty) + '</td><td>¥' + money(it.price) + '</td><td>' + escH(it.tax_rate) + '%</td><td>¥' + money((Number(it.qty) || 0) * (Number(it.price) || 0)) + '</td></tr>').join('');
  const itemsHtml = rows ? '<table><thead><tr><th>产品</th><th>数量</th><th>单价</th><th>税率</th><th>金额</th></tr></thead><tbody>' + rows + '</tbody></table>' : '';
  printDoc('销售订单', info, d.flow, itemsHtml);
}

/* ---------- 生命周期 ---------- */
onMounted(async () => {
  loading.value = true;
  await Promise.all([loadStats(), loadOrders()]);
  loading.value = false;
  window.addEventListener('resize', onResize);
});
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  disposeCharts();
});
</script>

<style scoped>
.trade-sales { padding: 20px; }
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
