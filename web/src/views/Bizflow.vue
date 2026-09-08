<template>
  <div class="bizflow">
    <div class="page-header">
      <h2>业财一体化</h2>
      <p>采购入库 → 库存台账（加权平均成本）→ 销售出库 → 应收/应付 → 回款/付款 → 自动生成记账凭证（借贷平衡校验）</p>
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
      <!-- ============ 库存台账 ============ -->
      <el-tab-pane label="库存台账" name="stock">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="filter.warehouse" placeholder="全部仓库" style="width:140px" clearable @change="loadStock">
              <el-option v-for="w in warehouses" :key="w" :label="w" :value="w" />
            </el-select>
            <el-input v-model="filter.q" placeholder="搜索物料/型号" style="width:200px" clearable @change="loadStock" />
            <el-checkbox v-model="filter.low" @change="loadStock" style="line-height:32px;">仅看低库存</el-checkbox>
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="openTransfer"><el-icon style="margin-right:4px"><Refresh /></el-icon>仓库调拨</el-button>
            <el-button @click="openAdjust"><el-icon style="margin-right:4px"><Edit /></el-icon>盘点调整</el-button>
            <el-button type="primary" @click="openMove"><el-icon style="margin-right:4px"><Plus /></el-icon>出入库登记</el-button>
          </div>
        </div>
        <el-table :data="stockRows" stripe size="small" v-loading="loading">
          <el-table-column prop="item_name" label="物料名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="model" label="型号" width="120" show-overflow-tooltip />
          <el-table-column prop="warehouse" label="仓库" width="110" />
          <el-table-column prop="unit" label="单位" width="60" />
          <el-table-column label="库存数量" width="100" align="right">
            <template #default="{ row }"><b>{{ row.qty }}</b></template>
          </el-table-column>
          <el-table-column label="均价(万)" width="100" align="right">
            <template #default="{ row }">{{ row.avg_cost }}</template>
          </el-table-column>
          <el-table-column label="库存金额(万)" width="120" align="right">
            <template #default="{ row }">{{ row.amount }}</template>
          </el-table-column>
          <el-table-column label="预警线" width="90" align="right">
            <template #default="{ row }">{{ row.warn_line }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.is_low ? 'danger' : 'success'" size="small">{{ row.is_low ? '低库存' : '正常' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openWarn(row)">预警线</el-button>
              <el-button size="small" type="primary" @click="openMove(row)">出入库</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无库存数据，点击右上角「出入库登记」录入</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 出入库流水 ============ -->
      <el-tab-pane label="出入库流水" name="movements">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="movFilter.move_type" placeholder="全部类型" style="width:130px" clearable @change="loadMovements">
              <el-option v-for="t in meta.move_types" :key="t" :label="t" :value="t" />
            </el-select>
            <el-input v-model="movFilter.month" placeholder="期间 YYYY-MM" style="width:150px" clearable @change="loadMovements" />
            <el-input v-model="movFilter.item" placeholder="物料名称" style="width:180px" clearable @change="loadMovements" />
          </div>
          <span class="muted">流水与库存同步更新（同一事务）</span>
        </div>
        <el-table :data="movRows" stripe size="small" v-loading="loading">
          <el-table-column prop="move_no" label="流水号" width="150" />
          <el-table-column label="类型" width="110">
            <template #default="{ row }"><el-tag :type="moveType(row.move_type)" size="small">{{ row.move_type }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="item_name" label="物料" min-width="150" show-overflow-tooltip />
          <el-table-column prop="warehouse" label="仓库" width="110" />
          <el-table-column label="数量" width="90" align="right">
            <template #default="{ row }"><b :style="{ color: row.qty < 0 ? '#f56c6c' : '#67c23a' }">{{ row.qty > 0 ? '+' : '' }}{{ row.qty }}</b></template>
          </el-table-column>
          <el-table-column label="单价(万)" width="100" align="right">
            <template #default="{ row }">{{ row.unit_cost }}</template>
          </el-table-column>
          <el-table-column label="金额(万)" width="100" align="right">
            <template #default="{ row }">{{ row.amount }}</template>
          </el-table-column>
          <el-table-column prop="biz_date" label="业务日期" width="110" />
          <el-table-column prop="operator_name" label="操作人" width="90" />
          <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
          <template #empty><span class="muted">暂无出入库流水</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 库存调整 ============ -->
      <el-tab-pane label="库存调整" name="adjust">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="adjFilter.status" placeholder="全部状态" style="width:130px" clearable @change="loadAdjusts">
              <el-option v-for="s in meta.adj_status" :key="s" :label="s" :value="s" />
            </el-select>
          </div>
          <el-button type="primary" @click="openAdjust"><el-icon style="margin-right:4px"><Plus /></el-icon>发起盘点调整</el-button>
        </div>
        <el-table :data="adjRows" stripe size="small" v-loading="loading">
          <el-table-column prop="adj_no" label="调整单号" width="180" />
          <el-table-column prop="item_name" label="物料" min-width="140" show-overflow-tooltip />
          <el-table-column prop="warehouse" label="仓库" width="110" />
          <el-table-column label="账面/盘点" width="140" align="right">
            <template #default="{ row }">{{ row.old_qty }} → {{ row.new_qty }}</template>
          </el-table-column>
          <el-table-column label="差异" width="90" align="right">
            <template #default="{ row }">
              <b :style="{ color: row.diff < 0 ? '#f56c6c' : '#67c23a' }">{{ row.diff }}</b>
            </template>
          </el-table-column>
          <el-table-column label="金额(万)" width="100" align="right">
            <template #default="{ row }">{{ row.amount }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" width="120" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="adjType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="success" :disabled="row.status !== '审批中'" @click="reviewAdj(row, 'approve')">通过</el-button>
              <el-button size="small" type="danger" :disabled="row.status !== '审批中'" @click="reviewAdj(row, 'reject')">驳回</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无库存调整单</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 记账凭证 ============ -->
      <el-tab-pane label="记账凭证" name="vouchers">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="vzFilter.period" placeholder="期间 YYYY-MM" style="width:140px" clearable @change="loadVouchers" />
            <el-select v-model="vzFilter.status" placeholder="全部状态" style="width:120px" clearable @change="loadVouchers">
              <el-option v-for="s in meta.voucher_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="vzFilter.q" placeholder="凭证号/摘要/单号" style="width:200px" clearable @change="loadVouchers" />
          </div>
          <el-button type="primary" @click="openVoucherCreate"><el-icon style="margin-right:4px"><Plus /></el-icon>手工制单</el-button>
        </div>
        <el-table :data="vzRows" stripe size="small" v-loading="loading">
          <el-table-column prop="voucher_no" label="凭证号" width="160" />
          <el-table-column prop="period" label="期间" width="90" />
          <el-table-column prop="biz_date" label="业务日期" width="110" />
          <el-table-column prop="source_type" label="来源类型" width="110" />
          <el-table-column prop="source_no" label="源单单号" width="150" show-overflow-tooltip />
          <el-table-column prop="summary" label="摘要" min-width="200" show-overflow-tooltip />
          <el-table-column label="借方(万)" width="100" align="right">
            <template #default="{ row }">{{ row.debit_total }}</template>
          </el-table-column>
          <el-table-column label="贷方(万)" width="100" align="right">
            <template #default="{ row }">{{ row.credit_total }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.status === '已审核' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openVoucher(row)">分录</el-button>
              <el-button size="small" type="success" :disabled="row.status === '已审核'" @click="verifyVoucher(row)">审核</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无凭证，业务单据（出入库/退货/折旧/付款）会自动生成</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 低库存预警 ============ -->
      <el-tab-pane label="低库存预警" name="low">
        <div class="tab-toolbar">
          <span class="muted">低于预警线的物料自动列出补货建议（补至 2 倍预警线，金额按加权平均成本估算）</span>
          <el-button type="primary" :disabled="!lowSelection.length" @click="submitToPr">
            一键转采购申请（{{ lowSelection.length }}）
          </el-button>
        </div>
        <el-table :data="lowRows" stripe size="small" v-loading="loading" @selection-change="(v) => (lowSelection = v)">
          <el-table-column type="selection" width="46" />
          <el-table-column prop="item_name" label="物料名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="model" label="型号" width="120" />
          <el-table-column prop="warehouse" label="仓库" width="110" />
          <el-table-column label="当前库存" width="100" align="right">
            <template #default="{ row }"><b style="color:#f56c6c">{{ row.qty }}</b></template>
          </el-table-column>
          <el-table-column label="预警线" width="90" align="right">
            <template #default="{ row }">{{ row.warn_line }}</template>
          </el-table-column>
          <el-table-column label="建议补货" width="100" align="right">
            <template #default="{ row }">{{ row.suggest_qty }}</template>
          </el-table-column>
          <el-table-column label="预估金额(万)" width="120" align="right">
            <template #default="{ row }">{{ row.suggest_amount }}</template>
          </el-table-column>
          <template #empty><span class="muted">当前无低库存物料</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 固定资产折旧 ============ -->
      <el-tab-pane label="固定资产折旧" name="assets">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="depPeriod" placeholder="计提期间 YYYY-MM" style="width:160px" />
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="loadDepRecords">折旧明细</el-button>
            <el-button type="warning" @click="runDep">月度折旧计提</el-button>
            <el-button type="primary" @click="openAsset"><el-icon style="margin-right:4px"><Plus /></el-icon>资产登记</el-button>
          </div>
        </div>
        <el-table :data="assetRows" stripe size="small" v-loading="loading">
          <el-table-column prop="asset_no" label="资产编号" width="150" />
          <el-table-column prop="name" label="资产名称" min-width="140" show-overflow-tooltip />
          <el-table-column prop="category" label="类别" width="100" />
          <el-table-column prop="dept_name" label="部门" width="100" />
          <el-table-column prop="custodian_name" label="保管人" width="90" />
          <el-table-column label="原值(万)" width="100" align="right">
            <template #default="{ row }">{{ row.purchase_wan }}</template>
          </el-table-column>
          <el-table-column label="年限" width="70" align="right">
            <template #default="{ row }">{{ row.dep_life_years }}年</template>
          </el-table-column>
          <el-table-column label="月折旧(万)" width="110" align="right">
            <template #default="{ row }">{{ row.monthly_dep_wan }}</template>
          </el-table-column>
          <el-table-column label="累计折旧(万)" width="120" align="right">
            <template #default="{ row }">{{ row.acc_dep_wan }}</template>
          </el-table-column>
          <el-table-column label="净值(万)" width="100" align="right">
            <template #default="{ row }"><b>{{ row.net_wan }}</b></template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.dep_status === '已提完' ? 'info' : 'success'" size="small">{{ row.dep_status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openDepParam(row)">折旧参数</el-button>
              <el-button size="small" type="success" :disabled="row.status !== '审批中'" @click="reviewAsset(row)">审批</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无固定资产，点击右上角「资产登记」录入</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 单据流 ============ -->
      <el-tab-pane label="单据流追踪" name="flow">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="flowMonth" placeholder="期间 YYYY-MM" style="width:150px" @change="loadFlow" />
            <el-input v-model="traceNo" placeholder="输入业务单号追踪全链路（如 RC2026... / AP2026...）" style="width:320px" clearable @keyup.enter="loadTrace" />
            <el-button @click="loadTrace">追踪</el-button>
          </div>
        </div>
        <el-table :data="flowChain" stripe size="small" v-loading="loading" style="margin-bottom:18px;">
          <el-table-column prop="step" label="业务环节" min-width="200" />
          <el-table-column label="单据数" width="100" align="right">
            <template #default="{ row }">{{ row.count }}</template>
          </el-table-column>
          <el-table-column label="金额(万)" width="120" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <template #empty><span class="muted">暂无业务数据</span></template>
        </el-table>
        <div class="muted" style="margin-bottom:8px;">单据流时间线<el-divider direction="vertical" />{{ traceNo || '请输入单号' }}</div>
        <el-table :data="traceRows" stripe size="small">
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column prop="node" label="节点" width="120" />
          <el-table-column prop="title" label="事项" min-width="240" show-overflow-tooltip />
          <el-table-column label="金额(万)" width="110" align="right">
            <template #default="{ row }">{{ row.amount }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column prop="extra" label="说明" width="180" show-overflow-tooltip />
          <template #empty><span class="muted">输入单号后展示该单据从入库/发货到付款/回款的全链路</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 出入库登记 -->
    <el-dialog v-model="moveDlg.visible" title="出入库登记" width="520px">
      <el-form label-width="100px" size="small">
        <el-form-item label="移动类型" required>
          <el-select v-model="moveDlg.form.move_type" style="width:100%">
            <el-option v-for="t in meta.manual_move_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="物料名称" required>
          <el-input v-model="moveDlg.form.item_name" placeholder="如：彩色多普勒超声仪" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="moveDlg.form.model" placeholder="选填" />
        </el-form-item>
        <el-form-item label="仓库">
          <el-input v-model="moveDlg.form.warehouse" placeholder="默认 总部仓库" />
        </el-form-item>
        <el-form-item label="数量" required>
          <el-input-number v-model="moveDlg.form.qty" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="单价(万)">
          <el-input-number v-model="moveDlg.form.unit_cost" :min="0" :precision="4" style="width:100%" />
        </el-form-item>
        <el-form-item label="业务日期">
          <el-date-picker v-model="moveDlg.form.biz_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="moveDlg.form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="moveDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="moveDlg.saving" @click="submitMove">提交</el-button>
      </template>
    </el-dialog>

    <!-- 仓库调拨 -->
    <el-dialog v-model="transferDlg.visible" title="仓库调拨" width="480px">
      <el-form label-width="100px" size="small">
        <el-form-item label="物料名称" required>
          <el-input v-model="transferDlg.form.item_name" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="transferDlg.form.model" />
        </el-form-item>
        <el-form-item label="调出仓库" required>
          <el-input v-model="transferDlg.form.from_warehouse" placeholder="如：总部仓库" />
        </el-form-item>
        <el-form-item label="调入仓库" required>
          <el-input v-model="transferDlg.form.to_warehouse" placeholder="如：成都分仓" />
        </el-form-item>
        <el-form-item label="数量" required>
          <el-input-number v-model="transferDlg.form.qty" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="transferDlg.form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="transferDlg.saving" @click="submitTransfer">确认调拨</el-button>
      </template>
    </el-dialog>

    <!-- 预警线 -->
    <el-dialog v-model="warnDlg.visible" title="设置库存预警线" width="400px">
      <p class="muted" style="margin-top:0;">{{ warnDlg.name }}（{{ warnDlg.warehouse }}）当前库存 {{ warnDlg.qty }}</p>
      <el-form label-width="90px" size="small">
        <el-form-item label="预警线" required>
          <el-input-number v-model="warnDlg.value" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="warnDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="warnDlg.saving" @click="submitWarn">保存</el-button>
      </template>
    </el-dialog>

    <!-- 盘点调整 -->
    <el-dialog v-model="adjustDlg.visible" title="库存盘点调整" width="480px">
      <el-form label-width="100px" size="small">
        <el-form-item label="库存项" required>
          <el-select v-model="adjustDlg.form.stock_id" filterable placeholder="选择库存项" style="width:100%">
            <el-option v-for="s in stockRows" :key="s.id" :label="`${s.item_name}（${s.warehouse}）现存 ${s.qty}`" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="盘点数量" required>
          <el-input-number v-model="adjustDlg.form.new_qty" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="adjustDlg.form.reason" placeholder="如：月度盘点" />
        </el-form-item>
      </el-form>
      <p class="muted" style="margin:0;">提交后进入审批，通过后自动同步库存并生成盘盈/盘亏凭证</p>
      <template #footer>
        <el-button @click="adjustDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="adjustDlg.saving" @click="submitAdjust">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 凭证分录 -->
    <el-dialog v-model="vzDlg.visible" :title="'凭证分录 · ' + vzDlg.voucher_no" width="640px">
      <div class="muted" style="margin-bottom:8px;">
        {{ vzDlg.summary }}
        <el-tag size="small" :type="vzDlg.balanced ? 'success' : 'danger'" style="margin-left:8px;">
          {{ vzDlg.balanced ? '借贷平衡' : '借贷不平衡' }}
        </el-tag>
      </div>
      <el-table :data="vzDlg.entries" stripe size="small">
        <el-table-column prop="seq" label="行" width="50" />
        <el-table-column label="方向" width="70">
          <template #default="{ row }"><el-tag :type="row.direction === '借' ? 'primary' : 'warning'" size="small">{{ row.direction }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="account_code" label="科目编码" width="100" />
        <el-table-column prop="account_name" label="科目名称" min-width="140" />
        <el-table-column label="金额(万)" width="110" align="right">
          <template #default="{ row }">{{ row.amount }}</template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="140" show-overflow-tooltip />
        <template #empty><span class="muted">无分录</span></template>
      </el-table>
    </el-dialog>

    <!-- 手工制单 -->
    <el-dialog v-model="vzNewDlg.visible" title="手工制单" width="620px">
      <el-form label-width="90px" size="small">
        <el-form-item label="业务类型" required>
          <el-input v-model="vzNewDlg.form.source_type" placeholder="如：其他支出" />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="vzNewDlg.form.summary" />
        </el-form-item>
      </el-form>
      <el-table :data="vzNewDlg.entries" size="small" border>
        <el-table-column label="方向" width="110">
          <template #default="{ row }">
            <el-select v-model="row.direction" size="small">
              <el-option label="借" value="借" />
              <el-option label="贷" value="贷" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="科目编码" width="110">
          <template #default="{ row }"><el-input v-model="row.account_code" size="small" placeholder="如 1002" /></template>
        </el-table-column>
        <el-table-column label="科目名称" min-width="130">
          <template #default="{ row }"><el-input v-model="row.account_name" size="small" /></template>
        </el-table-column>
        <el-table-column label="金额(万)" width="120">
          <template #default="{ row }"><el-input-number v-model="row.amount" :min="0" :precision="4" size="small" style="width:100%" /></template>
        </el-table-column>
        <el-table-column label="操作" width="70">
          <template #default="{ $index }">
            <el-button size="small" type="danger" @click="vzNewDlg.entries.splice($index, 1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button size="small" style="margin-top:8px;" @click="vzNewDlg.entries.push({ direction: '贷', account_code: '', account_name: '', amount: 0 })">增加分录</el-button>
      <p class="muted" style="margin:8px 0 0;">借方合计 {{ debitSum }} 万 / 贷方合计 {{ creditSum }} 万（必须相等才能保存）</p>
      <template #footer>
        <el-button @click="vzNewDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="vzNewDlg.saving" @click="submitVoucher">保存凭证</el-button>
      </template>
    </el-dialog>

    <!-- 资产登记 -->
    <el-dialog v-model="assetDlg.visible" title="固定资产登记" width="520px">
      <el-form label-width="100px" size="small">
        <el-form-item label="资产名称" required>
          <el-input v-model="assetDlg.form.name" />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="assetDlg.form.category" style="width:100%">
            <el-option v-for="c in meta.asset_categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="品牌/型号">
          <el-input v-model="assetDlg.form.brand" placeholder="品牌" style="width:49%" />
          <el-input v-model="assetDlg.form.model" placeholder="型号" style="width:49%;margin-left:2%" />
        </el-form-item>
        <el-form-item label="保管人">
          <el-input v-model="assetDlg.form.custodian_name" />
        </el-form-item>
        <el-form-item label="存放位置">
          <el-input v-model="assetDlg.form.location" />
        </el-form-item>
        <el-form-item label="采购日期">
          <el-date-picker v-model="assetDlg.form.purchase_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="原值(元)" required>
          <el-input-number v-model="assetDlg.form.purchase_price" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assetDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="assetDlg.saving" @click="submitAsset">提交</el-button>
      </template>
    </el-dialog>

    <!-- 折旧参数 -->
    <el-dialog v-model="depDlg.visible" :title="'折旧参数 · ' + depDlg.name" width="440px">
      <el-form label-width="110px" size="small">
        <el-form-item label="折旧年限(年)">
          <el-input-number v-model="depDlg.form.dep_life_years" :min="1" :max="50" style="width:100%" />
        </el-form-item>
        <el-form-item label="残值率">
          <el-input-number v-model="depDlg.form.dep_salvage_rate" :min="0" :max="0.95" :step="0.01" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="起提月份">
          <el-input v-model="depDlg.form.dep_start" placeholder="YYYY-MM" />
        </el-form-item>
      </el-form>
      <p class="muted" style="margin:0;">月折旧 = 原值 ×（1 - 残值率）/ 年限 / 12，同一资产同一期间只计提一次</p>
      <template #footer>
        <el-button @click="depDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="depDlg.saving" @click="submitDepParam">保存</el-button>
      </template>
    </el-dialog>

    <!-- 折旧明细 -->
    <el-dialog v-model="depRecDlg.visible" title="折旧计提明细" width="720px">
      <el-table :data="depRecRows" stripe size="small" max-height="420">
        <el-table-column prop="period" label="期间" width="100" />
        <el-table-column prop="asset_no" label="资产编号" width="150" />
        <el-table-column prop="asset_name" label="资产名称" min-width="140" show-overflow-tooltip />
        <el-table-column label="本月折旧(万)" width="120" align="right">
          <template #default="{ row }">{{ row.dep_amount }}</template>
        </el-table-column>
        <el-table-column label="累计折旧(万)" width="120" align="right">
          <template #default="{ row }">{{ row.acc_dep }}</template>
        </el-table-column>
        <el-table-column label="净值(万)" width="110" align="right">
          <template #default="{ row }">{{ row.net_value }}</template>
        </el-table-column>
        <el-table-column prop="voucher_no" label="凭证号" width="150" />
        <template #empty><span class="muted">暂无折旧记录</span></template>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Box, Coin, Warning, Document, TrendCharts, Plus, Refresh, Edit } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('stock');
const meta = ref({ move_types: [], manual_move_types: [], voucher_status: [], adj_status: [], asset_categories: [] });
const stats = ref(null);
const loading = ref(false);

const stockRows = ref([]);
const warehouses = ref([]);
const movRows = ref([]);
const adjRows = ref([]);
const vzRows = ref([]);
const lowRows = ref([]);
const lowSelection = ref([]);
const assetRows = ref([]);
const depRecRows = ref([]);
const flowChain = ref([]);
const traceRows = ref([]);
const traceNo = ref('');
const depPeriod = ref(new Date().toISOString().slice(0, 7));
const flowMonth = ref(new Date().toISOString().slice(0, 7));

const filter = reactive({ warehouse: '', q: '', low: false });
const movFilter = reactive({ move_type: '', month: '', item: '' });
const adjFilter = reactive({ status: '' });
const vzFilter = reactive({ period: '', status: '', q: '' });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '库存金额', value: s.stock_amount + ' 万', sub: `${s.stock_items} 种 / ${s.stock_qty} 件`, icon: Box, color: '#2563eb' },
    { title: '低库存预警', value: s.low_count, sub: `占用金额 ${s.low_amount} 万`, icon: Warning, color: '#f59e0b' },
    { title: '待审凭证', value: s.vouchers_pending, sub: `本月发生额 ${s.vouchers_month_amount} 万`, icon: Document, color: '#8b5cf6' },
    { title: '应收余额', value: s.ar_balance + ' 万', sub: '未结清应收', icon: TrendCharts, color: '#10b981' },
    { title: '应付余额', value: s.ap_balance + ' 万', sub: '未支付应付', icon: Coin, color: '#ef4444' },
    { title: '资产净值', value: (s.assets_original_wan - s.dep_acc_wan).toFixed(2) + ' 万', sub: `${s.assets} 项，已提折旧 ${s.dep_acc_wan} 万`, icon: Box, color: '#0ea5e9' },
  ];
});
const debitSum = computed(() => vzNewDlg.entries.filter((e) => e.direction === '借').reduce((s, e) => s + (Number(e.amount) || 0), 0).toFixed(2));
const creditSum = computed(() => vzNewDlg.entries.filter((e) => e.direction === '贷').reduce((s, e) => s + (Number(e.amount) || 0), 0).toFixed(2));

function moveType(t) {
  if (['采购入库', '调拨入库', '销售退货', '期初入库'].includes(t)) return 'success';
  if (['销售出库', '调拨出库', '采购退货'].includes(t)) return 'danger';
  return 'info';
}
function adjType(s) {
  return s === '已生效' ? 'success' : (s === '驳回' ? 'danger' : 'warning');
}

async function loadMeta() {
  const r = await request.get('/bizflow/meta');
  if (r.code === 200) meta.value = r.data || meta.value;
}
async function loadStats() {
  const r = await request.get('/bizflow/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadStock() {
  loading.value = true;
  try {
    const params = {};
    if (filter.warehouse) params.warehouse = filter.warehouse;
    if (filter.q) params.q = filter.q;
    if (filter.low) params.low = '1';
    const r = await request.get('/bizflow/stock', { params });
    if (r.code === 200) {
      stockRows.value = (r.data && r.data.rows) || [];
      warehouses.value = (r.data && r.data.warehouses) || [];
    }
  } finally {
    loading.value = false;
  }
}
async function loadMovements() {
  loading.value = true;
  try {
    const params = {};
    ['move_type', 'month', 'item'].forEach((k) => { if (movFilter[k]) params[k] = movFilter[k]; });
    const r = await request.get('/bizflow/movements', { params });
    if (r.code === 200) movRows.value = r.data || [];
  } finally {
    loading.value = false;
  }
}
async function loadAdjusts() {
  loading.value = true;
  try {
    const r = await request.get('/bizflow/adjustments', { params: adjFilter.status ? { status: adjFilter.status } : {} });
    if (r.code === 200) adjRows.value = r.data || [];
  } finally {
    loading.value = false;
  }
}
async function loadVouchers() {
  loading.value = true;
  try {
    const params = {};
    ['period', 'status', 'q'].forEach((k) => { if (vzFilter[k]) params[k] = vzFilter[k]; });
    const r = await request.get('/bizflow/vouchers', { params });
    if (r.code === 200) vzRows.value = (r.data && r.data.rows) || [];
  } finally {
    loading.value = false;
  }
}
async function loadLow() {
  loading.value = true;
  try {
    const r = await request.get('/bizflow/low-stock');
    if (r.code === 200) lowRows.value = r.data && r.data.low ? r.data.low : [];
  } finally {
    loading.value = false;
  }
}
async function loadAssets() {
  loading.value = true;
  try {
    const r = await request.get('/bizflow/assets');
    if (r.code === 200) assetRows.value = (r.data && r.data.rows) || [];
  } finally {
    loading.value = false;
  }
}
async function loadDepRecords() {
  const r = await request.get('/bizflow/dep/records', { params: depPeriod.value ? { period: depPeriod.value } : {} });
  if (r.code === 200) { depRecRows.value = r.data || []; depRecDlg.visible = true; }
}
async function loadFlow() {
  loading.value = true;
  try {
    const r = await request.get('/bizflow/flow', { params: { month: flowMonth.value } });
    if (r.code === 200) flowChain.value = (r.data && r.data.chain) || [];
  } finally {
    loading.value = false;
  }
}
async function loadTrace() {
  if (!traceNo.value.trim()) { traceRows.value = []; return; }
  const r = await request.get('/bizflow/trace', { params: { no: traceNo.value.trim() } });
  if (r.code === 200) traceRows.value = (r.data && r.data.timeline) || [];
}

function onTabChange(name) {
  if (name === 'stock') loadStock();
  else if (name === 'movements') loadMovements();
  else if (name === 'adjust') loadAdjusts();
  else if (name === 'vouchers') loadVouchers();
  else if (name === 'low') loadLow();
  else if (name === 'assets') { loadAssets(); }
  else if (name === 'flow') loadFlow();
}
onMounted(async () => {
  await loadMeta();
  await loadStats();
  await loadStock();
});

/* ---------- 出入库 ---------- */
const moveDlg = reactive({
  visible: false, saving: false,
  form: { move_type: '采购入库', item_name: '', model: '', warehouse: '总部仓库', qty: 0, unit_cost: 0, biz_date: '', remark: '' },
});
function openMove(row) {
  Object.assign(moveDlg.form, {
    move_type: '采购入库',
    item_name: row && row.item_name ? row.item_name : '',
    model: row && row.model ? row.model : '',
    warehouse: row && row.warehouse ? row.warehouse : '总部仓库',
    qty: 0,
    unit_cost: row && row.avg_cost ? row.avg_cost : 0,
    biz_date: new Date().toISOString().slice(0, 10),
    remark: '',
  });
  moveDlg.visible = true;
}
async function submitMove() {
  if (!moveDlg.form.item_name || !moveDlg.form.qty) { ElMessage.warning('物料名称与数量必填'); return; }
  moveDlg.saving = true;
  const r = await request.post('/bizflow/movements', moveDlg.form);
  moveDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已登记');
    moveDlg.visible = false;
    loadStock(); loadStats(); loadMovements(); loadVouchers();
  } else ElMessage.error(r.msg || '登记失败');
}

/* ---------- 调拨 ---------- */
const transferDlg = reactive({
  visible: false, saving: false,
  form: { item_name: '', model: '', from_warehouse: '总部仓库', to_warehouse: '', qty: 0, remark: '' },
});
function openTransfer() {
  Object.assign(transferDlg.form, { item_name: '', model: '', from_warehouse: '总部仓库', to_warehouse: '', qty: 0, remark: '' });
  transferDlg.visible = true;
}
async function submitTransfer() {
  const f = transferDlg.form;
  if (!f.item_name || !f.from_warehouse || !f.to_warehouse || !f.qty) { ElMessage.warning('物料、调出/调入仓库、数量必填'); return; }
  transferDlg.saving = true;
  const r = await request.post('/bizflow/transfer', f);
  transferDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已调拨');
    transferDlg.visible = false;
    loadStock(); loadMovements();
  } else ElMessage.error(r.msg || '调拨失败');
}

/* ---------- 预警线 ---------- */
const warnDlg = reactive({ visible: false, saving: false, id: null, name: '', warehouse: '', qty: 0, value: 5 });
function openWarn(row) {
  warnDlg.id = row.id;
  warnDlg.name = row.item_name;
  warnDlg.warehouse = row.warehouse;
  warnDlg.qty = row.qty;
  warnDlg.value = row.warn_line;
  warnDlg.visible = true;
}
async function submitWarn() {
  warnDlg.saving = true;
  const r = await request.put(`/bizflow/stock/${warnDlg.id}/warn`, { warn_line: warnDlg.value });
  warnDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已更新'); warnDlg.visible = false; loadStock(); loadLow(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------- 盘点调整 ---------- */
const adjustDlg = reactive({ visible: false, saving: false, form: { stock_id: null, new_qty: 0, reason: '月度盘点' } });
function openAdjust() {
  Object.assign(adjustDlg.form, { stock_id: null, new_qty: 0, reason: '月度盘点' });
  adjustDlg.visible = true;
}
async function submitAdjust() {
  if (!adjustDlg.form.stock_id) { ElMessage.warning('请选择库存项'); return; }
  adjustDlg.saving = true;
  const r = await request.post('/bizflow/adjustments', adjustDlg.form);
  adjustDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); adjustDlg.visible = false; loadAdjusts(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function reviewAdj(row, action) {
  await ElMessageBox.confirm(`确认${action === 'approve' ? '通过' : '驳回'}调整单 ${row.adj_no}？通过后自动同步库存并生成凭证`, '库存调整审批', { type: 'warning' });
  const r = await request.post(`/bizflow/adjustments/${row.id}/approve`, { action });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadAdjusts(); loadStock(); loadVouchers(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}

/* ---------- 凭证 ---------- */
const vzDlg = reactive({ visible: false, voucher_no: '', summary: '', balanced: true, entries: [] });
async function openVoucher(row) {
  const r = await request.get(`/bizflow/vouchers/${row.id}`);
  if (r.code === 200) {
    vzDlg.voucher_no = r.data.voucher_no;
    vzDlg.summary = r.data.summary;
    vzDlg.balanced = r.data.balanced;
    vzDlg.entries = r.data.entries || [];
    vzDlg.visible = true;
  } else ElMessage.error(r.msg || '查询失败');
}
async function verifyVoucher(row) {
  const r = await request.post(`/bizflow/vouchers/${row.id}/verify`);
  if (r.code === 200) { ElMessage.success(r.msg || '已审核'); loadVouchers(); loadStats(); }
  else ElMessage.error(r.msg || '审核失败');
}
const vzNewDlg = reactive({
  visible: false, saving: false,
  form: { source_type: '', summary: '' },
  entries: [
    { direction: '借', account_code: '', account_name: '', amount: 0 },
    { direction: '贷', account_code: '', account_name: '', amount: 0 },
  ],
});
function openVoucherCreate() {
  vzNewDlg.form.source_type = '';
  vzNewDlg.form.summary = '';
  vzNewDlg.entries = [
    { direction: '借', account_code: '', account_name: '', amount: 0 },
    { direction: '贷', account_code: '', account_name: '', amount: 0 },
  ];
  vzNewDlg.visible = true;
}
async function submitVoucher() {
  if (!vzNewDlg.form.source_type) { ElMessage.warning('业务类型必填'); return; }
  if (debitSum.value !== creditSum.value) { ElMessage.warning('借贷不平衡，无法保存'); return; }
  vzNewDlg.saving = true;
  const r = await request.post('/bizflow/vouchers', { ...vzNewDlg.form, entries: vzNewDlg.entries });
  vzNewDlg.saving = false;
  if (r.code === 200) { ElMessage.success('凭证已生成'); vzNewDlg.visible = false; loadVouchers(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------- 低库存转采购申请 ---------- */
async function submitToPr() {
  const items = lowSelection.value.map((x) => ({ stock_id: x.id, qty: x.suggest_qty, amount: x.suggest_amount }));
  if (!items.length) return;
  await ElMessageBox.confirm(`将为 ${items.length} 项低库存物料生成补货采购申请并进入采购审批`, '一键补货', { type: 'warning' });
  const r = await request.post('/bizflow/low-stock/to-pr', { items });
  if (r.code === 200) { ElMessage.success(r.msg || '已生成'); loadLow(); }
  else ElMessage.error(r.msg || '生成失败');
}

/* ---------- 资产与折旧 ---------- */
const assetDlg = reactive({
  visible: false, saving: false,
  form: { name: '', category: '电子设备', brand: '', model: '', custodian_name: '', location: '', purchase_date: '', purchase_price: 0 },
});
function openAsset() {
  Object.assign(assetDlg.form, { name: '', category: '电子设备', brand: '', model: '', custodian_name: '', location: '', purchase_date: new Date().toISOString().slice(0, 10), purchase_price: 0 });
  assetDlg.visible = true;
}
async function submitAsset() {
  if (!assetDlg.form.name || !assetDlg.form.purchase_price) { ElMessage.warning('资产名称与原值必填'); return; }
  assetDlg.saving = true;
  const r = await request.post('/bizflow/assets', assetDlg.form);
  assetDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); assetDlg.visible = false; loadAssets(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function reviewAsset(row) {
  await ElMessageBox.confirm(`确认通过资产登记 ${row.asset_no}？`, '资产登记审批', { type: 'warning' });
  const r = await request.post(`/bizflow/assets/${row.id}/approve`, { action: 'approve' });
  if (r.code === 200) { ElMessage.success(r.msg || '已通过'); loadAssets(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
const depDlg = reactive({ visible: false, saving: false, id: null, name: '', form: { dep_life_years: 5, dep_salvage_rate: 0.05, dep_start: '' } });
function openDepParam(row) {
  depDlg.id = row.id;
  depDlg.name = row.name;
  depDlg.form.dep_life_years = row.dep_life_years;
  depDlg.form.dep_salvage_rate = row.dep_salvage_rate;
  depDlg.form.dep_start = row.dep_start;
  depDlg.visible = true;
}
async function submitDepParam() {
  depDlg.saving = true;
  const r = await request.put(`/bizflow/assets/${depDlg.id}/dep`, depDlg.form);
  depDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已保存'); depDlg.visible = false; loadAssets(); }
  else ElMessage.error(r.msg || '保存失败');
}
async function runDep() {
  await ElMessageBox.confirm(`确认计提 ${depPeriod.value} 月度折旧？同一资产同一期间不会重复计提`, '折旧计提', { type: 'warning' });
  const r = await request.post('/bizflow/dep/run', { period: depPeriod.value });
  if (r.code === 200) { ElMessage.success(r.msg || '计提完成'); loadAssets(); loadVouchers(); loadStats(); }
  else ElMessage.error(r.msg || '计提失败');
}
const depRecDlg = reactive({ visible: false });
</script>

<style scoped>
.bizflow { padding: 20px; }
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
