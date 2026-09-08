<template>
  <div class="invoicing">
    <div class="page-header">
      <h2>进销项发票</h2>
      <p>进项登记 → 认证勾选（勾稽应付）｜开票申请 → 审批 → 登记发票号（回写应收）｜采购/销售退货红字冲销 → 应付应收账龄分析</p>
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

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <!-- ============ 进项发票 ============ -->
      <el-tab-pane label="进项发票" name="pi">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="piFilter.status" placeholder="全部状态" style="width:110px" clearable @change="loadPi">
              <el-option label="登记" value="登记" />
              <el-option label="作废" value="作废" />
            </el-select>
            <el-select v-model="piFilter.deduct_status" placeholder="全部认证" style="width:120px" clearable @change="loadPi">
              <el-option v-for="s in meta.deduct_states" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="piFilter.q" placeholder="发票号/供应商/单号" style="width:210px" clearable @change="loadPi" />
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="openApUninv"><el-icon style="margin-right:4px"><Warning /></el-icon>未收票应付</el-button>
            <el-button type="primary" @click="openPi"><el-icon style="margin-right:4px"><Plus /></el-icon>进项登记</el-button>
          </div>
        </div>
        <el-table :data="piRows" stripe size="small" v-loading="loading">
          <el-table-column prop="pi_no" label="登记单号" width="180" />
          <el-table-column prop="invoice_no" label="发票号码" width="140" />
          <el-table-column prop="inv_type" label="类型" width="90" />
          <el-table-column prop="supplier_name" label="供应商" min-width="140" show-overflow-tooltip />
          <el-table-column prop="ap_no" label="勾稽应付" width="150" />
          <el-table-column label="价税合计(万)" width="120" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <el-table-column label="税额(万)" width="100" align="right">
            <template #default="{ row }">{{ row.tax_amount }}</template>
          </el-table-column>
          <el-table-column label="不含税(万)" width="110" align="right">
            <template #default="{ row }">{{ row.pre_amount }}</template>
          </el-table-column>
          <el-table-column prop="invoice_date" label="开票日期" width="110" />
          <el-table-column label="认证状态" width="100">
            <template #default="{ row }"><el-tag :type="deductType(row.deduct_status)" size="small">{{ row.deduct_status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }"><el-tag :type="row.status === '登记' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" :disabled="row.status !== '登记' || row.deduct_status === '已抵扣'" @click="deductPi(row)">
                {{ row.deduct_status === '未认证' ? '认证' : '勾选抵扣' }}
              </el-button>
              <el-button size="small" type="danger" :disabled="row.status !== '登记'" @click="voidPi(row)">作废</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无进项发票，点击右上角「进项登记」录入</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 销项发票 ============ -->
      <el-tab-pane label="销项发票" name="si">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="siFilter.status" placeholder="全部状态" style="width:120px" clearable @change="loadSi">
              <el-option v-for="s in siStatuses" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="siFilter.q" placeholder="发票号/客户/单号" style="width:210px" clearable @change="loadSi" />
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="openArUninv"><el-icon style="margin-right:4px"><Document /></el-icon>未开票应收</el-button>
            <el-button @click="openSiDirect">直接登记</el-button>
            <el-button type="primary" @click="openSiApply"><el-icon style="margin-right:4px"><Plus /></el-icon>开票申请</el-button>
          </div>
        </div>
        <el-table :data="siRows" stripe size="small" v-loading="loading">
          <el-table-column prop="sin_no" label="登记单号" width="180" />
          <el-table-column prop="invoice_no" label="发票号码" width="140" />
          <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
          <el-table-column prop="ar_no" label="应收单号" width="150" />
          <el-table-column label="金额(万)" width="110" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <el-table-column label="税额(万)" width="100" align="right">
            <template #default="{ row }">{{ row.tax_amount }}</template>
          </el-table-column>
          <el-table-column prop="invoice_date" label="开票日期" width="110" />
          <el-table-column prop="source" label="来源" width="100" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="siType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="250" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="success" v-if="row.status === '审批中'" @click="reviewSi(row)">审批</el-button>
              <el-button size="small" type="primary" v-if="row.status === '待开票'" @click="openRegister(row)">登记票号</el-button>
              <el-button size="small" type="warning" v-if="row.status === '已开票'" @click="redSi(row)">红冲</el-button>
              <el-button size="small" type="danger" v-if="['待开票', '已开票'].includes(row.status)" @click="voidSi(row)">作废</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无销项发票，点击右上角「开票申请」或「直接登记」</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 采购退货 ============ -->
      <el-tab-pane label="采购退货" name="prt">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="calcId" placeholder="入库单ID（试算可退上限）" style="width:200px" clearable />
            <el-button @click="runCalc">试算</el-button>
            <span v-if="calc" class="muted">
              可退 {{ calc.returnable_qty }} {{ (calc.rc && calc.rc.unit) || '件' }} / {{ calc.returnable_amount }} 万，应付未付 {{ calc.unpaid }} 万
            </span>
          </div>
          <el-button type="primary" @click="openPrt"><el-icon style="margin-right:4px"><Plus /></el-icon>发起采购退货</el-button>
        </div>
        <el-table :data="prtRows" stripe size="small" v-loading="loading">
          <el-table-column prop="rt_no" label="退货单号" width="180" />
          <el-table-column prop="rc_no" label="原入库单" width="170" />
          <el-table-column prop="item_name" label="物料" min-width="140" show-overflow-tooltip />
          <el-table-column prop="warehouse" label="仓库" width="110" />
          <el-table-column label="退货数量" width="100" align="right">
            <template #default="{ row }">{{ row.qty }}{{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="红冲金额(万)" width="120" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" width="100" />
          <el-table-column prop="return_date" label="退货日期" width="110" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="retType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="success" :disabled="row.status !== '待审批'" @click="reviewPrt(row, 'approve')">通过</el-button>
              <el-button size="small" type="danger" :disabled="row.status !== '待审批'" @click="reviewPrt(row, 'reject')">驳回</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无采购退货单</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 销售退货 ============ -->
      <el-tab-pane label="销售退货" name="srt">
        <div class="tab-toolbar">
          <span class="muted">审批通过后：库存按成本回补 + 红字冲应收/收入 + 冲回成本</span>
          <el-button type="primary" @click="openSrt"><el-icon style="margin-right:4px"><Plus /></el-icon>发起销售退货</el-button>
        </div>
        <el-table :data="srtRows" stripe size="small" v-loading="loading">
          <el-table-column prop="rt_no" label="退货单号" width="180" />
          <el-table-column prop="ar_no" label="原应收单" width="170" />
          <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
          <el-table-column prop="item_name" label="商品" min-width="130" show-overflow-tooltip />
          <el-table-column label="退货数量" width="100" align="right">
            <template #default="{ row }">{{ row.qty }}{{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="红冲应收(万)" width="120" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" width="100" />
          <el-table-column prop="return_date" label="退货日期" width="110" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="retType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="success" :disabled="row.status !== '待审批'" @click="reviewSrt(row, 'approve')">通过</el-button>
              <el-button size="small" type="danger" :disabled="row.status !== '待审批'" @click="reviewSrt(row, 'reject')">驳回</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无销售退货单</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 应付账款 ============ -->
      <el-tab-pane label="应付账款" name="ap">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="apFilter.status" placeholder="全部状态" style="width:120px" clearable @change="loadAp">
              <el-option v-for="s in meta.ap_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="apFilter.q" placeholder="应付单号/供应商" style="width:200px" clearable @change="loadAp" />
          </div>
          <span class="muted">付款后自动生成凭证（借 应付账款 / 贷 银行存款）</span>
        </div>
        <el-table :data="apRows" stripe size="small" v-loading="loading">
          <el-table-column prop="ap_no" label="应付单号" width="170" />
          <el-table-column prop="supplier_name" label="供应商" min-width="140" show-overflow-tooltip />
          <el-table-column prop="source_no" label="源单单号" width="160" />
          <el-table-column label="应付总额(万)" width="120" align="right">
            <template #default="{ row }">{{ row.total_amount }}</template>
          </el-table-column>
          <el-table-column label="已付(万)" width="100" align="right">
            <template #default="{ row }">{{ row.paid_amount }}</template>
          </el-table-column>
          <el-table-column label="未付(万)" width="110" align="right">
            <template #default="{ row }"><b style="color:#f56c6c">{{ row.unpaid }}</b></template>
          </el-table-column>
          <el-table-column label="已收票(万)" width="120" align="right">
            <template #default="{ row }">{{ row.inv_amount }}</template>
          </el-table-column>
          <el-table-column label="收票状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.inv_status === '已收票' ? 'success' : (row.inv_status === '部分收票' ? 'warning' : 'info')" size="small">{{ row.inv_status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="due_date" label="到期日" width="110" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="row.status === '已支付' ? 'success' : (row.status === '部分支付' ? 'warning' : 'danger')" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" :disabled="row.status === '已支付'" @click="openPay(row)">付款</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无应付账款</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 应收账款 ============ -->
      <el-tab-pane label="应收账款" name="ar">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="arFilter.status" placeholder="全部状态" style="width:120px" clearable @change="loadAr">
              <el-option v-for="s in meta.ar_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="arFilter.q" placeholder="应收单号/客户/合同号" style="width:220px" clearable @change="loadAr" />
          </div>
          <span class="muted">开票额含待开票占用，红字冲销后自动回退额度</span>
        </div>
        <el-table :data="arRows" stripe size="small" v-loading="loading">
          <el-table-column prop="ar_no" label="应收单号" width="170" />
          <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
          <el-table-column prop="contract_no" label="合同号" width="150" />
          <el-table-column label="应收总额(万)" width="120" align="right">
            <template #default="{ row }">{{ row.total_amount }}</template>
          </el-table-column>
          <el-table-column label="已回款(万)" width="120" align="right">
            <template #default="{ row }">{{ row.received_amount }}</template>
          </el-table-column>
          <el-table-column label="未回款(万)" width="120" align="right">
            <template #default="{ row }"><b style="color:#f56c6c">{{ row.outstanding }}</b></template>
          </el-table-column>
          <el-table-column label="已开票(万)" width="120" align="right">
            <template #default="{ row }">{{ row.invoiced_amount }}</template>
          </el-table-column>
          <el-table-column label="开票状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.invoice_status === '已开票' ? 'success' : (row.invoice_status === '部分开票' ? 'warning' : 'info')" size="small">{{ row.invoice_status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="账龄" width="110">
            <template #default="{ row }">
              <el-tag :type="agingType(row.aging_bucket)" size="small">{{ row.aging_bucket }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="due_date" label="到期日" width="110" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="row.status === '已结清' ? 'success' : (row.status === '逾期' ? 'danger' : 'warning')" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <template #empty><span class="muted">暂无应收账款</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 税务与账龄 ============ -->
      <el-tab-pane label="税务账龄" name="tax">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-radio-group v-model="agingSide" @change="loadAging">
              <el-radio-button label="ar">应收账龄</el-radio-button>
              <el-radio-button label="ap">应付账龄</el-radio-button>
            </el-radio-group>
            <el-input v-model="taxYear" placeholder="年度 YYYY" style="width:130px" @change="loadTax" />
            <el-button @click="loadTax">刷新税务台账</el-button>
          </div>
        </div>
        <el-table :data="agingBuckets" stripe size="small" style="margin-bottom:18px;" v-loading="loading">
          <el-table-column prop="bucket" label="账龄分档" min-width="140" />
          <el-table-column label="单据数" width="100" align="right">
            <template #default="{ row }">{{ row.count }}</template>
          </el-table-column>
          <el-table-column label="余额(万)" width="130" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <template #empty><span class="muted">暂无账龄数据</span></template>
        </el-table>

        <div class="muted" style="margin-bottom:8px;">税务汇总台账（{{ taxYear }} 年，万元）</div>
        <el-table :data="taxMonths" stripe size="small" border style="margin-bottom:18px;">
          <el-table-column prop="month" label="月份" width="110" />
          <el-table-column label="进项张数" width="100" align="right">
            <template #default="{ row }">{{ row.in.count }}</template>
          </el-table-column>
          <el-table-column label="进项金额" width="110" align="right">
            <template #default="{ row }">{{ row.in.amount }}</template>
          </el-table-column>
          <el-table-column label="进项税额" width="110" align="right">
            <template #default="{ row }">{{ row.in.tax }}</template>
          </el-table-column>
          <el-table-column label="销项张数" width="100" align="right">
            <template #default="{ row }">{{ row.out.count }}</template>
          </el-table-column>
          <el-table-column label="销项金额" width="110" align="right">
            <template #default="{ row }">{{ row.out.amount }}</template>
          </el-table-column>
          <el-table-column label="销项税额" width="110" align="right">
            <template #default="{ row }">{{ row.out.tax }}</template>
          </el-table-column>
          <template #empty><span class="muted">暂无税务数据</span></template>
        </el-table>

        <el-table :data="diffRows" stripe size="small">
          <el-table-column prop="no" label="单号" width="180" />
          <el-table-column prop="name" label="往来单位" min-width="160" show-overflow-tooltip />
          <el-table-column label="单据金额(万)" width="120" align="right">
            <template #default="{ row }">{{ row.total_amount }}</template>
          </el-table-column>
          <el-table-column label="已开票/收票(万)" width="140" align="right">
            <template #default="{ row }">{{ row.inv_amount }}</template>
          </el-table-column>
          <el-table-column label="差额(万)" width="110" align="right">
            <template #default="{ row }"><b style="color:#f56c6c">{{ row.diff }}</b></template>
          </el-table-column>
          <template #empty><span class="muted">无收入-开票 / 应付-收票差异</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 进项登记 -->
    <el-dialog v-model="piDlg.visible" title="进项发票登记" width="520px">
      <el-form label-width="110px" size="small">
        <el-form-item label="发票号码" required>
          <el-input v-model="piDlg.form.invoice_no" />
        </el-form-item>
        <el-form-item label="发票类型">
          <el-select v-model="piDlg.form.inv_type" style="width:100%">
            <el-option v-for="t in meta.inv_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="勾稽应付单">
          <el-select v-model="piDlg.form.ap_id" filterable clearable placeholder="选择应付单（自动带出供应商）" style="width:100%">
            <el-option v-for="a in apOptions" :key="a.id" :label="`${a.ap_no} ${a.supplier_name} 未付${a.unpaid}万`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="价税合计(万)" required>
          <el-input-number v-model="piDlg.form.amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="进项税额(万)">
          <el-input-number v-model="piDlg.form.tax_amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="开票日期">
          <el-date-picker v-model="piDlg.form.invoice_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="piDlg.form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="piDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="piDlg.saving" @click="submitPi">提交</el-button>
      </template>
    </el-dialog>

    <!-- 未收票应付 -->
    <el-dialog v-model="apUninvDlg.visible" title="未收票应付预警" width="760px">
      <p class="muted" style="margin-top:0;">入库满 {{ meta.uninvoiced_days }} 天仍未收齐发票的应付单</p>
      <el-table :data="apUninvOverdue" stripe size="small" max-height="320">
        <el-table-column prop="ap_no" label="应付单号" width="170" />
        <el-table-column prop="supplier_name" label="供应商" min-width="140" show-overflow-tooltip />
        <el-table-column prop="receipt_date" label="入库日期" width="110" />
        <el-table-column label="应付金额(万)" width="120" align="right">
          <template #default="{ row }">{{ row.total_amount }}</template>
        </el-table-column>
        <el-table-column label="已收票(万)" width="120" align="right">
          <template #default="{ row }">{{ row.inv_amount }}</template>
        </el-table-column>
        <el-table-column prop="inv_status" label="收票状态" width="100" />
        <template #empty><span class="muted">无逾期未收票应付</span></template>
      </el-table>
    </el-dialog>

    <!-- 开票申请 -->
    <el-dialog v-model="siApplyDlg.visible" title="开票申请" width="520px">
      <el-form label-width="110px" size="small">
        <el-form-item label="应收单" required>
          <el-select v-model="siApplyDlg.form.ar_id" filterable placeholder="选择应收单" style="width:100%" @change="onArPick">
            <el-option v-for="a in arUninvRows" :key="a.id" :label="`${a.ar_no} ${a.customer_name} 可开${(a.total_amount - a.invoiced_amount).toFixed(2)}万`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="发票类型">
          <el-select v-model="siApplyDlg.form.inv_type" style="width:100%">
            <el-option v-for="t in meta.inv_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="开票金额(万)" required>
          <el-input-number v-model="siApplyDlg.form.amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="销项税额(万)">
          <el-input-number v-model="siApplyDlg.form.tax_amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
      </el-form>
      <p class="muted" style="margin:0;">提交后进入开票申请审批，通过后转为待开票并占用应收额度</p>
      <template #footer>
        <el-button @click="siApplyDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="siApplyDlg.saving" @click="submitSiApply">提交</el-button>
      </template>
    </el-dialog>

    <!-- 销项直接登记 -->
    <el-dialog v-model="siDlg.visible" title="销项发票登记（财务）" width="520px">
      <el-form label-width="110px" size="small">
        <el-form-item label="应收单" required>
          <el-select v-model="siDlg.form.ar_id" filterable placeholder="选择应收单" style="width:100%">
            <el-option v-for="a in arUninvRows" :key="a.id" :label="`${a.ar_no} ${a.customer_name} 可开${(a.total_amount - a.invoiced_amount).toFixed(2)}万`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="发票号码" required>
          <el-input v-model="siDlg.form.invoice_no" />
        </el-form-item>
        <el-form-item label="发票类型">
          <el-select v-model="siDlg.form.inv_type" style="width:100%">
            <el-option v-for="t in meta.inv_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="开票金额(万)" required>
          <el-input-number v-model="siDlg.form.amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="销项税额(万)">
          <el-input-number v-model="siDlg.form.tax_amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="开票日期">
          <el-date-picker v-model="siDlg.form.invoice_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="siDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="siDlg.saving" @click="submitSi">提交</el-button>
      </template>
    </el-dialog>

    <!-- 补录发票号 -->
    <el-dialog v-model="regDlg.visible" title="登记发票号" width="440px">
      <el-form label-width="100px" size="small">
        <el-form-item label="发票号码" required>
          <el-input v-model="regDlg.invoice_no" />
        </el-form-item>
        <el-form-item label="开票日期">
          <el-date-picker v-model="regDlg.invoice_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="regDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="regDlg.saving" @click="submitRegister">确认</el-button>
      </template>
    </el-dialog>

    <!-- 未开票应收 -->
    <el-dialog v-model="arUninvDlg.visible" title="未开票应收" width="720px">
      <el-table :data="arUninvRows" stripe size="small" max-height="360">
        <el-table-column prop="ar_no" label="应收单号" width="170" />
        <el-table-column prop="customer_name" label="客户" min-width="150" show-overflow-tooltip />
        <el-table-column label="应收总额(万)" width="120" align="right">
          <template #default="{ row }">{{ row.total_amount }}</template>
        </el-table-column>
        <el-table-column label="已开票(万)" width="120" align="right">
          <template #default="{ row }">{{ row.invoiced_amount }}</template>
        </el-table-column>
        <el-table-column label="可开票(万)" width="120" align="right">
          <template #default="{ row }"><b>{{ (row.total_amount - row.invoiced_amount).toFixed(2) }}</b></template>
        </el-table-column>
        <template #empty><span class="muted">无未开票应收</span></template>
      </el-table>
    </el-dialog>

    <!-- 采购退货 -->
    <el-dialog v-model="prtDlg.visible" title="发起采购退货" width="520px">
      <el-form label-width="120px" size="small">
        <el-form-item label="入库单ID" required>
          <el-input v-model.number="prtDlg.form.rc_id" placeholder="先用上方「试算」确认可退上限" />
        </el-form-item>
        <el-form-item label="退货数量" required>
          <el-input-number v-model="prtDlg.form.qty" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="红冲金额(万)" required>
          <el-input-number v-model="prtDlg.form.amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="退货仓库">
          <el-input v-model="prtDlg.form.warehouse" placeholder="默认入库仓库" />
        </el-form-item>
        <el-form-item label="原因">
          <el-select v-model="prtDlg.form.reason" style="width:100%">
            <el-option v-for="r in meta.ret_reasons" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="退货日期">
          <el-date-picker v-model="prtDlg.form.return_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="prtDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="prtDlg.saving" @click="submitPrt">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 销售退货 -->
    <el-dialog v-model="srtDlg.visible" title="发起销售退货" width="520px">
      <el-form label-width="120px" size="small">
        <el-form-item label="应收单" required>
          <el-select v-model="srtDlg.form.ar_id" filterable placeholder="选择应收单" style="width:100%">
            <el-option v-for="a in arReturnable" :key="a.id" :label="`${a.ar_no} ${a.customer_name} 未回款${a.outstanding}万`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="退货商品" required>
          <el-input v-model="srtDlg.form.item_name" />
        </el-form-item>
        <el-form-item label="型号/仓库">
          <el-input v-model="srtDlg.form.model" placeholder="型号" style="width:49%" />
          <el-input v-model="srtDlg.form.warehouse" placeholder="仓库" style="width:49%;margin-left:2%" />
        </el-form-item>
        <el-form-item label="退货数量" required>
          <el-input-number v-model="srtDlg.form.qty" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="红冲应收(万)" required>
          <el-input-number v-model="srtDlg.form.amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="原因">
          <el-select v-model="srtDlg.form.reason" style="width:100%">
            <el-option v-for="r in meta.sale_ret_reasons" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="退货日期">
          <el-date-picker v-model="srtDlg.form.return_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="srtDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="srtDlg.saving" @click="submitSrt">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 应付付款 -->
    <el-dialog v-model="payDlg.visible" :title="'应付付款 · ' + payDlg.ap_no" width="460px">
      <p class="muted" style="margin-top:0;">应付 {{ payDlg.total_amount }} 万，已付 {{ payDlg.paid_amount }} 万，未付 {{ payDlg.unpaid }} 万</p>
      <el-form label-width="110px" size="small">
        <el-form-item label="付款金额(万)" required>
          <el-input-number v-model="payDlg.amount" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="付款方式">
          <el-select v-model="payDlg.method" style="width:100%">
            <el-option v-for="m in meta.pay_methods" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="付款日期">
          <el-date-picker v-model="payDlg.pay_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="payDlg.saving" @click="submitPay">确认付款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Ticket, Document, Coin, Warning, TrendCharts, Money, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('pi');
const loading = ref(false);
const meta = ref({
  inv_types: [], deduct_states: [], ret_reasons: [], sale_ret_reasons: [],
  pay_methods: [], ap_status: [], ar_status: [], aging_buckets: [], uninvoiced_days: 30,
});
const stats = ref(null);
const siStatuses = ['审批中', '待开票', '已开票', '作废', '红冲'];

const piRows = ref([]);
const siRows = ref([]);
const prtRows = ref([]);
const srtRows = ref([]);
const apRows = ref([]);
const arRows = ref([]);
const apOptions = ref([]);
const arUninvRows = ref([]);
const arReturnable = ref([]);
const apUninvOverdue = ref([]);
const agingBuckets = ref([]);
const taxMonths = ref([]);
const diffRows = ref([]);
const calc = ref(null);
const calcId = ref('');
const agingSide = ref('ar');
const taxYear = ref(String(new Date().getFullYear()));

const piFilter = reactive({ status: '', deduct_status: '', q: '' });
const siFilter = reactive({ status: '', q: '' });
const apFilter = reactive({ status: '', q: '' });
const arFilter = reactive({ status: '', q: '' });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '进项发票', value: s.purchase.count, sub: `金额 ${s.purchase.amount} 万 / 税额 ${s.purchase.tax} 万`, icon: Ticket, color: '#2563eb' },
    { title: '销项发票', value: s.sale.count, sub: `金额 ${s.sale.amount} 万 / 税额 ${s.sale.tax} 万`, icon: Document, color: '#10b981' },
    { title: '待开票', value: s.sale.pending_count, sub: `金额 ${s.sale.pending_amount} 万`, icon: Warning, color: '#f59e0b' },
    { title: '未收票应付', value: s.ap_uninvoiced + ' 万', sub: `应付余额 ${s.ap_balance} 万`, icon: Coin, color: '#ef4444' },
    { title: '未开票应收', value: s.ar_uninvoiced + ' 万', sub: `应收余额 ${s.ar_balance} 万`, icon: Money, color: '#8b5cf6' },
    { title: '逾期应收', value: s.ar_overdue + ' 万', sub: `退货待审 ${s.purchase_returns_pending + s.sale_returns_pending} 单`, icon: TrendCharts, color: '#f59e0b' },
  ];
});

function deductType(s) {
  return s === '已抵扣' ? 'success' : (s === '已认证' ? 'primary' : 'info');
}
function siType(s) {
  const map = { 审批中: 'warning', 待开票: 'primary', 已开票: 'success', 作废: 'info', 红冲: 'danger' };
  return map[s] || 'info';
}
function retType(s) {
  return s === '已生效' ? 'success' : (s === '驳回' ? 'danger' : 'warning');
}
function agingType(b) {
  if (b === '未到期' || b === '-') return 'success';
  if (b === '0-30天') return 'info';
  if (b === '31-60天') return 'warning';
  return 'danger';
}

async function loadMeta() {
  const r = await request.get('/invoicing/meta');
  if (r.code === 200) meta.value = r.data || meta.value;
}
async function loadStats() {
  const r = await request.get('/invoicing/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadPi() {
  loading.value = true;
  try {
    const params = {};
    ['status', 'deduct_status', 'q'].forEach((k) => { if (piFilter[k]) params[k] = piFilter[k]; });
    const r = await request.get('/invoicing/purchase-invoices', { params });
    if (r.code === 200) piRows.value = r.data || [];
  } finally { loading.value = false; }
}
async function loadSi() {
  loading.value = true;
  try {
    const params = {};
    ['status', 'q'].forEach((k) => { if (siFilter[k]) params[k] = siFilter[k]; });
    const r = await request.get('/invoicing/sale-invoices', { params });
    if (r.code === 200) siRows.value = r.data || [];
  } finally { loading.value = false; }
}
async function loadPrt() {
  const r = await request.get('/invoicing/purchase-returns');
  if (r.code === 200) prtRows.value = r.data || [];
}
async function loadSrt() {
  const r = await request.get('/invoicing/sale-returns');
  if (r.code === 200) srtRows.value = r.data || [];
}
async function loadAp() {
  loading.value = true;
  try {
    const params = {};
    ['status', 'q'].forEach((k) => { if (apFilter[k]) params[k] = apFilter[k]; });
    const r = await request.get('/invoicing/ap-ledgers', { params });
    if (r.code === 200) {
      apRows.value = r.data || [];
      apOptions.value = (r.data || []).filter((x) => Number(x.unpaid) > 0);
    }
  } finally { loading.value = false; }
}
async function loadAr() {
  loading.value = true;
  try {
    const params = {};
    ['status', 'q'].forEach((k) => { if (arFilter[k]) params[k] = arFilter[k]; });
    const r = await request.get('/invoicing/ar-ledgers', { params });
    if (r.code === 200) arRows.value = r.data || [];
  } finally { loading.value = false; }
}
async function loadAging() {
  loading.value = true;
  try {
    const r = await request.get('/invoicing/aging', { params: { side: agingSide.value } });
    if (r.code === 200) agingBuckets.value = (r.data && r.data.buckets) || [];
  } finally { loading.value = false; }
}
async function loadTax() {
  const r = await request.get('/invoicing/tax-summary', { params: { year: taxYear.value } });
  if (r.code === 200) {
    taxMonths.value = (r.data && r.data.byMonth) || [];
    const ar = (r.data && r.data.diffAr) || [];
    const ap = (r.data && r.data.diffAp) || [];
    diffRows.value = [
      ...ar.map((x) => ({ no: x.ar_no, name: x.customer_name, total_amount: x.total_amount, inv_amount: x.invoiced_amount, diff: x.diff })),
      ...ap.map((x) => ({ no: x.ap_no, name: x.supplier_name, total_amount: x.total_amount, inv_amount: x.inv_amount, diff: x.diff })),
    ];
  }
}
async function loadArUninv() {
  const r = await request.get('/invoicing/ar-uninvoiced');
  if (r.code === 200) arUninvRows.value = r.data || [];
}
async function loadArReturnable() {
  const r = await request.get('/invoicing/ar-returnable');
  if (r.code === 200) arReturnable.value = r.data || [];
}

function onTabChange(name) {
  if (name === 'pi') loadPi();
  else if (name === 'si') loadSi();
  else if (name === 'prt') loadPrt();
  else if (name === 'srt') { loadSrt(); loadArReturnable(); }
  else if (name === 'ap') loadAp();
  else if (name === 'ar') loadAr();
  else if (name === 'tax') { loadAging(); loadTax(); }
}
onMounted(async () => {
  await loadMeta();
  await loadStats();
  await loadPi();
  await loadAp();
  await loadArUninv();
});

/* ---------- 进项 ---------- */
const piDlg = reactive({
  visible: false, saving: false,
  form: { invoice_no: '', inv_type: '专票', ap_id: null, amount: 0, tax_amount: 0, invoice_date: new Date().toISOString().slice(0, 10), remark: '' },
});
function openPi() {
  Object.assign(piDlg.form, { invoice_no: '', inv_type: '专票', ap_id: null, amount: 0, tax_amount: 0, invoice_date: new Date().toISOString().slice(0, 10), remark: '' });
  piDlg.visible = true;
}
async function submitPi() {
  if (!piDlg.form.invoice_no || !piDlg.form.amount) { ElMessage.warning('发票号码与金额必填'); return; }
  piDlg.saving = true;
  const r = await request.post('/invoicing/purchase-invoices', piDlg.form);
  piDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已登记'); piDlg.visible = false; loadPi(); loadAp(); loadStats(); }
  else ElMessage.error(r.msg || '登记失败');
}
async function deductPi(row) {
  const target = row.deduct_status === '未认证' ? '已认证' : '已抵扣';
  const r = await request.post(`/invoicing/purchase-invoices/${row.id}/deduct`, { deduct_status: target });
  if (r.code === 200) { ElMessage.success(r.msg || '已更新'); loadPi(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
async function voidPi(row) {
  await ElMessageBox.confirm(`确认作废进项发票 ${row.invoice_no}？作废留痕不删除`, '进项作废', { type: 'warning' });
  const r = await request.post(`/invoicing/purchase-invoices/${row.id}/void`);
  if (r.code === 200) { ElMessage.success('已作废'); loadPi(); loadAp(); loadStats(); }
  else ElMessage.error(r.msg || '作废失败');
}
const apUninvDlg = reactive({ visible: false });
async function openApUninv() {
  const r = await request.get('/invoicing/ap-uninvoiced');
  if (r.code === 200) apUninvOverdue.value = (r.data && r.data.overdue) || [];
  apUninvDlg.visible = true;
}

/* ---------- 销项 ---------- */
const siApplyDlg = reactive({ visible: false, saving: false, form: { ar_id: null, inv_type: '专票', amount: 0, tax_amount: 0 } });
async function openSiApply() {
  await loadArUninv();
  Object.assign(siApplyDlg.form, { ar_id: null, inv_type: '专票', amount: 0, tax_amount: 0 });
  siApplyDlg.visible = true;
}
function onArPick(id) {
  const a = arUninvRows.value.find((x) => x.id === id);
  if (a) siApplyDlg.form.amount = Number(((Number(a.total_amount) || 0) - (Number(a.invoiced_amount) || 0)).toFixed(4));
}
async function submitSiApply() {
  if (!siApplyDlg.form.ar_id || !siApplyDlg.form.amount) { ElMessage.warning('应收单与开票金额必填'); return; }
  siApplyDlg.saving = true;
  const r = await request.post('/invoicing/sale-invoices/apply', siApplyDlg.form);
  siApplyDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); siApplyDlg.visible = false; loadSi(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}
const siDlg = reactive({
  visible: false, saving: false,
  form: { ar_id: null, invoice_no: '', inv_type: '专票', amount: 0, tax_amount: 0, invoice_date: new Date().toISOString().slice(0, 10) },
});
async function openSiDirect() {
  await loadArUninv();
  Object.assign(siDlg.form, { ar_id: null, invoice_no: '', inv_type: '专票', amount: 0, tax_amount: 0, invoice_date: new Date().toISOString().slice(0, 10) });
  siDlg.visible = true;
}
async function submitSi() {
  if (!siDlg.form.ar_id || !siDlg.form.invoice_no || !siDlg.form.amount) { ElMessage.warning('应收单、发票号码、金额必填'); return; }
  siDlg.saving = true;
  const r = await request.post('/invoicing/sale-invoices', siDlg.form);
  siDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已登记'); siDlg.visible = false; loadSi(); loadStats(); }
  else ElMessage.error(r.msg || '登记失败');
}
async function reviewSi(row) {
  await ElMessageBox.confirm(`确认批准开票申请 ${row.sin_no}（${row.amount} 万）？`, '开票申请审批', { type: 'warning' });
  const r = await request.post(`/invoicing/sale-invoices/${row.id}/approve`, { action: 'approve' });
  if (r.code === 200) { ElMessage.success(r.msg || '已批准'); loadSi(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
const regDlg = reactive({ visible: false, saving: false, id: null, invoice_no: '', invoice_date: new Date().toISOString().slice(0, 10) });
function openRegister(row) {
  regDlg.id = row.id;
  regDlg.invoice_no = '';
  regDlg.invoice_date = new Date().toISOString().slice(0, 10);
  regDlg.visible = true;
}
async function submitRegister() {
  if (!regDlg.invoice_no) { ElMessage.warning('发票号码必填'); return; }
  regDlg.saving = true;
  const r = await request.post(`/invoicing/sale-invoices/${regDlg.id}/register`, { invoice_no: regDlg.invoice_no, invoice_date: regDlg.invoice_date });
  regDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已开票'); regDlg.visible = false; loadSi(); loadStats(); }
  else ElMessage.error(r.msg || '登记失败');
}
async function voidSi(row) {
  await ElMessageBox.confirm(`确认作废销项发票 ${row.sin_no}？`, '销项作废', { type: 'warning' });
  const r = await request.post(`/invoicing/sale-invoices/${row.id}/void`);
  if (r.code === 200) { ElMessage.success('已作废'); loadSi(); loadStats(); }
  else ElMessage.error(r.msg || '作废失败');
}
async function redSi(row) {
  await ElMessageBox.confirm(`确认红冲发票 ${row.invoice_no || row.sin_no}（${row.amount} 万）？将生成红字记录冲回开票额度`, '红字冲销', { type: 'warning' });
  const r = await request.post(`/invoicing/sale-invoices/${row.id}/red`);
  if (r.code === 200) { ElMessage.success(r.msg || '已红冲'); loadSi(); loadStats(); }
  else ElMessage.error(r.msg || '红冲失败');
}
const arUninvDlg = reactive({ visible: false });
async function openArUninv() {
  await loadArUninv();
  arUninvDlg.visible = true;
}

/* ---------- 采购退货 ---------- */
async function runCalc() {
  if (!calcId.value) { ElMessage.warning('请输入入库单ID'); return; }
  const r = await request.get('/invoicing/purchase-returns/calc', { params: { rc_id: calcId.value } });
  if (r.code === 200) { calc.value = r.data; ElMessage.success('试算完成'); }
  else { calc.value = null; ElMessage.error(r.msg || '试算失败'); }
}
const prtDlg = reactive({
  visible: false, saving: false,
  form: { rc_id: null, qty: 0, amount: 0, warehouse: '', reason: '质量问题', return_date: new Date().toISOString().slice(0, 10) },
});
function openPrt() {
  Object.assign(prtDlg.form, { rc_id: calcId.value ? Number(calcId.value) : null, qty: 0, amount: 0, warehouse: '', reason: '质量问题', return_date: new Date().toISOString().slice(0, 10) });
  prtDlg.visible = true;
}
async function submitPrt() {
  if (!prtDlg.form.rc_id || !prtDlg.form.qty || !prtDlg.form.amount) { ElMessage.warning('入库单、退货数量、红冲金额必填'); return; }
  prtDlg.saving = true;
  const r = await request.post('/invoicing/purchase-returns', prtDlg.form);
  prtDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); prtDlg.visible = false; loadPrt(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function reviewPrt(row, action) {
  await ElMessageBox.confirm(`确认${action === 'approve' ? '通过' : '驳回'}采购退货 ${row.rt_no}？通过后库存扣减、应付红冲并生成凭证`, '采购退货审批', { type: 'warning' });
  const r = await request.post(`/invoicing/purchase-returns/${row.id}/approve`, { action });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadPrt(); loadAp(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}

/* ---------- 销售退货 ---------- */
const srtDlg = reactive({
  visible: false, saving: false,
  form: { ar_id: null, item_name: '', model: '', warehouse: '总部仓库', qty: 0, amount: 0, reason: '质量问题', return_date: new Date().toISOString().slice(0, 10) },
});
async function openSrt() {
  await loadArReturnable();
  Object.assign(srtDlg.form, { ar_id: null, item_name: '', model: '', warehouse: '总部仓库', qty: 0, amount: 0, reason: '质量问题', return_date: new Date().toISOString().slice(0, 10) });
  srtDlg.visible = true;
}
async function submitSrt() {
  if (!srtDlg.form.ar_id || !srtDlg.form.item_name || !srtDlg.form.qty || !srtDlg.form.amount) { ElMessage.warning('应收单、商品、数量、红冲金额必填'); return; }
  srtDlg.saving = true;
  const r = await request.post('/invoicing/sale-returns', srtDlg.form);
  srtDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); srtDlg.visible = false; loadSrt(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function reviewSrt(row, action) {
  await ElMessageBox.confirm(`确认${action === 'approve' ? '通过' : '驳回'}销售退货 ${row.rt_no}？通过后库存回补、应收红冲并生成凭证`, '销售退货审批', { type: 'warning' });
  const r = await request.post(`/invoicing/sale-returns/${row.id}/approve`, { action });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadSrt(); loadAr(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}

/* ---------- 应付付款 ---------- */
const payDlg = reactive({
  visible: false, saving: false, id: null, ap_no: '', total_amount: 0, paid_amount: 0, unpaid: 0,
  amount: 0, method: '银行转账', pay_date: new Date().toISOString().slice(0, 10),
});
function openPay(row) {
  payDlg.id = row.id;
  payDlg.ap_no = row.ap_no;
  payDlg.total_amount = row.total_amount;
  payDlg.paid_amount = row.paid_amount;
  payDlg.unpaid = row.unpaid;
  payDlg.amount = row.unpaid;
  payDlg.method = '银行转账';
  payDlg.pay_date = new Date().toISOString().slice(0, 10);
  payDlg.visible = true;
}
async function submitPay() {
  if (!payDlg.amount) { ElMessage.warning('付款金额必填'); return; }
  payDlg.saving = true;
  const r = await request.post(`/invoicing/ap-ledgers/${payDlg.id}/pay`, { amount: payDlg.amount, method: payDlg.method, pay_date: payDlg.pay_date });
  payDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已付款'); payDlg.visible = false; loadAp(); loadStats(); }
  else ElMessage.error(r.msg || '付款失败');
}
</script>

<style scoped>
.invoicing { padding: 20px; }
.muted { color: #909399; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.el-form-item { margin-bottom: 12px; }
</style>
