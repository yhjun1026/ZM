<template>
  <div class="payroll">
    <div class="page-header">
      <h2>薪酬管理</h2>
      <p>薪酬方案制定 → 员工建档 → 月度核算（应发/扣款/个税/实发）→ 发布 → 员工查工资条；财务部另有「财务序列薪酬考核」</p>
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

    <el-tabs v-model="tab" class="pay-tabs">
      <!-- ============ 核算批次 ============ -->
      <el-tab-pane label="月度核算" name="records">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-date-picker v-model="calcPeriod" type="month" value-format="YYYY-MM" placeholder="核算月份" style="width:150px" />
            <el-checkbox v-model="forceCalc" style="line-height:32px;">覆盖草稿重算</el-checkbox>
            <el-input v-model="filter.period" placeholder="期间筛选 如 2026-09" style="width:160px" clearable @change="loadRecords" />
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="loadRecords"><el-icon style="margin-right:4px"><Refresh /></el-icon>刷新</el-button>
            <el-button type="primary" :loading="calculating" @click="submitCalc">
              <el-icon style="margin-right:4px"><Coin /></el-icon>生成核算
            </el-button>
          </div>
        </div>
        <el-table :data="records" stripe size="small" v-loading="loading">
          <el-table-column prop="period" label="核算期间" width="110" />
          <el-table-column label="人数" width="80" align="right"><template #default="{ row }">{{ row.emps }}</template></el-table-column>
          <el-table-column label="应发合计(元)" width="130" align="right"><template #default="{ row }"><b>{{ money(row.total_gross) }}</b></template></el-table-column>
          <el-table-column label="提成合计(元)" width="120" align="right"><template #default="{ row }">{{ money(row.total_commission) }}</template></el-table-column>
          <el-table-column label="实发合计(元)" width="130" align="right"><template #default="{ row }"><b>{{ money(row.total_net) }}</b></template></el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.status === '已发布' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="operator_name" label="核算人" width="100" />
          <el-table-column label="发布时间" width="150"><template #default="{ row }">{{ (row.published_at || '—').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row)">明细</el-button>
              <el-button size="small" type="success" :disabled="row.status === '已发布'" @click="publish(row)">发布</el-button>
              <el-button size="small" type="danger" :disabled="row.status === '已发布'" @click="removeRecord(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无核算批次，选择月份后点击「生成核算」</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 工资明细 ============ -->
      <el-tab-pane label="工资明细" name="payslips">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="psFilter.period" placeholder="期间 如 2026-09" style="width:140px" clearable @change="loadPayslips" />
            <el-select v-model="psFilter.dept" placeholder="全部部门" style="width:140px" clearable @change="loadPayslips">
              <el-option v-for="d in options.depts" :key="d" :label="d" :value="d" />
            </el-select>
            <el-input v-model="psFilter.q" placeholder="工号/姓名" style="width:160px" clearable @change="loadPayslips" />
          </div>
          <el-button @click="loadPayslips"><el-icon style="margin-right:4px"><Refresh /></el-icon>刷新</el-button>
        </div>
        <el-table :data="payslips" stripe size="small" v-loading="loading" max-height="520">
          <el-table-column prop="period" label="期间" width="100" />
          <el-table-column prop="emp_no" label="工号" width="100" />
          <el-table-column prop="emp_name" label="姓名" width="100" />
          <el-table-column prop="dept_name" label="部门" width="110" show-overflow-tooltip />
          <el-table-column label="序列" width="90"><template #default="{ row }"><el-tag size="small" :type="row.seq_type === '销售序列' ? 'warning' : 'info'">{{ row.seq_type }}</el-tag></template></el-table-column>
          <el-table-column label="基本+岗位" width="110" align="right"><template #default="{ row }">{{ money((row.base_salary || 0) + (row.post_salary || 0)) }}</template></el-table-column>
          <el-table-column label="绩效工资" width="100" align="right"><template #default="{ row }">{{ money(row.perf_salary) }}</template></el-table-column>
          <el-table-column label="提成" width="100" align="right"><template #default="{ row }">{{ money(row.commission_amount) }}</template></el-table-column>
          <el-table-column label="应发" width="110" align="right"><template #default="{ row }"><b>{{ money(row.gross_amount) }}</b></template></el-table-column>
          <el-table-column label="社保" width="90" align="right"><template #default="{ row }">{{ money(row.social_amount) }}</template></el-table-column>
          <el-table-column label="扣款" width="90" align="right"><template #default="{ row }">{{ money(row.deduction) }}</template></el-table-column>
          <el-table-column label="个税" width="90" align="right"><template #default="{ row }">{{ money(row.tax_amount) }}</template></el-table-column>
          <el-table-column label="实发" width="110" align="right"><template #default="{ row }"><b class="net">{{ money(row.net_amount) }}</b></template></el-table-column>
          <template #empty><span class="muted">暂无已发布工资条，发布核算批次后可在此查询</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 薪酬档案 ============ -->
      <el-tab-pane label="薪酬档案" name="profiles">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="pfFilter.q" placeholder="工号/姓名" style="width:150px" clearable @change="loadProfiles" />
            <el-select v-model="pfFilter.seq_type" placeholder="全部序列" style="width:130px" clearable @change="loadProfiles">
              <el-option v-for="s in options.seq_types" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select v-model="pfFilter.dept" placeholder="全部部门" style="width:140px" clearable @change="loadProfiles">
              <el-option v-for="d in options.depts" :key="d" :label="d" :value="d" />
            </el-select>
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="initProfiles"><el-icon style="margin-right:4px"><Plus /></el-icon>一键建档</el-button>
            <el-button @click="applyScheme"><el-icon style="margin-right:4px"><Refresh /></el-icon>应用方案</el-button>
          </div>
        </div>
        <el-table :data="profiles" stripe size="small" v-loading="loading" max-height="520">
          <el-table-column prop="emp_no" label="工号" width="100" />
          <el-table-column prop="emp_name" label="姓名" width="100" />
          <el-table-column prop="dept_name" label="部门" width="110" show-overflow-tooltip />
          <el-table-column prop="role" label="岗位" width="120" show-overflow-tooltip />
          <el-table-column label="序列" width="90"><template #default="{ row }"><el-tag size="small" :type="row.seq_type === '销售序列' ? 'warning' : 'info'">{{ row.seq_type }}</el-tag></template></el-table-column>
          <el-table-column label="基本工资" width="100" align="right"><template #default="{ row }">{{ money(row.base_salary) }}</template></el-table-column>
          <el-table-column label="岗位工资" width="100" align="right"><template #default="{ row }">{{ money(row.post_salary) }}</template></el-table-column>
          <el-table-column label="绩效基数" width="100" align="right"><template #default="{ row }">{{ money(row.perf_base) }}</template></el-table-column>
          <el-table-column label="提成率" width="90" align="right"><template #default="{ row }">{{ ((row.commission_rate || 0) * 100).toFixed(1) }}%</template></el-table-column>
          <el-table-column label="回款目标(万)" width="110" align="right"><template #default="{ row }">{{ row.commission_target }}</template></el-table-column>
          <el-table-column label="社保" width="90" align="right"><template #default="{ row }">{{ money(row.social_amount) }}</template></el-table-column>
          <el-table-column prop="effective_month" label="生效月" width="100" />
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openProfile(row)">编辑</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无薪酬档案，点击「一键建档」按方案生成</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 组成方案 ============ -->
      <el-tab-pane label="组成方案" name="scheme">
        <div class="scheme-tip">
          <div><b>应发</b> = 基本工资 + 岗位工资 + 绩效基数×绩效系数 + 业绩提成 + 补贴</div>
          <div><b>提成</b>（销售序列）= 当月回款到账×提成率 + 超出目标部分×提成率×(1+{{ '加成系数' }})</div>
          <div><b>实发</b> = 应发 − 社保代扣 − 请假扣款（事假全扣/病假半扣，日薪=(基本+岗位)/21.75）− 个税（起征5000，7级累进）</div>
          <div class="muted">绩效系数取最近一次「通过」的员工评价分/100；最近更新：{{ scheme.updated_by_name || '—' }} {{ (scheme.updated_at || '').slice(0, 16) }}</div>
        </div>
        <div class="tab-toolbar">
          <span class="muted">按岗位调整金额后保存，再点「应用方案」同步到在职档案</span>
          <el-button type="primary" :loading="savingScheme" @click="saveScheme">
            <el-icon style="margin-right:4px"><Document /></el-icon>保存方案
          </el-button>
        </div>
        <el-table :data="schemeRows" stripe size="small" v-loading="loading" max-height="480">
          <el-table-column prop="role" label="岗位" width="130" />
          <el-table-column label="序列" width="130">
            <template #default="{ row }">
              <el-select v-model="row.seq_type" size="small" style="width:110px">
                <el-option v-for="s in options.seq_types" :key="s" :label="s" :value="s" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="基本工资" width="130"><template #default="{ row }"><el-input-number v-model="row.base_salary" :min="0" :step="100" size="small" controls-position="right" style="width:120px" /></template></el-table-column>
          <el-table-column label="岗位工资" width="130"><template #default="{ row }"><el-input-number v-model="row.post_salary" :min="0" :step="100" size="small" controls-position="right" style="width:120px" /></template></el-table-column>
          <el-table-column label="绩效基数" width="130"><template #default="{ row }"><el-input-number v-model="row.perf_base" :min="0" :step="100" size="small" controls-position="right" style="width:120px" /></template></el-table-column>
          <el-table-column label="提成率(0~1)" width="140"><template #default="{ row }"><el-input-number v-model="row.commission_rate" :min="0" :max="1" :step="0.005" :precision="3" size="small" controls-position="right" style="width:130px" /></template></el-table-column>
          <el-table-column label="回款目标(万)" width="140"><template #default="{ row }"><el-input-number v-model="row.commission_target" :min="0" :step="10" size="small" controls-position="right" style="width:130px" /></template></el-table-column>
          <el-table-column label="社保代扣" width="130"><template #default="{ row }"><el-input-number v-model="row.social_amount" :min="0" :step="100" size="small" controls-position="right" style="width:120px" /></template></el-table-column>
          <template #empty><span class="muted">暂无薪酬组成方案</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 财务序列薪酬考核 ============ -->
      <el-tab-pane label="财务考核" name="fin">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-date-picker v-model="finPeriod" type="month" value-format="YYYY-MM" placeholder="考核月份" style="width:150px" @change="loadFin" />
            <el-button @click="finSchemeDlg.visible = true">组成方案</el-button>
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="loadFin"><el-icon style="margin-right:4px"><Refresh /></el-icon>刷新</el-button>
            <el-button type="primary" :loading="finCalcing" @click="finCalc">
              <el-icon style="margin-right:4px"><Coin /></el-icon>生成核算
            </el-button>
            <el-button type="success" @click="finPublish">发布</el-button>
          </div>
        </div>
        <el-table :data="finRows" stripe size="small" v-loading="loading" max-height="460">
          <el-table-column prop="emp_name" label="姓名" width="100" />
          <el-table-column prop="dept" label="部门" width="110" />
          <el-table-column label="岗位" width="110"><template #default="{ row }">{{ row.level === 'FIN' ? '财务负责人' : '财务专员' }}</template></el-table-column>
          <el-table-column label="考核分" width="90" align="right"><template #default="{ row }"><b>{{ row.score }}</b></template></el-table-column>
          <el-table-column label="评级" width="100"><template #default="{ row }"><el-tag size="small" :type="gradeType(row.grade)">{{ row.grade }}</el-tag></template></el-table-column>
          <el-table-column label="系数" width="80" align="right"><template #default="{ row }">{{ row.coef }}</template></el-table-column>
          <el-table-column label="绩效工资" width="100" align="right"><template #default="{ row }">{{ money(row.perf_salary) }}</template></el-table-column>
          <el-table-column label="补贴合计" width="100" align="right"><template #default="{ row }">{{ money(row.allowance) }}</template></el-table-column>
          <el-table-column label="应发" width="110" align="right"><template #default="{ row }"><b>{{ money(row.gross_pay) }}</b></template></el-table-column>
          <el-table-column label="社保+公积金" width="120" align="right"><template #default="{ row }">{{ money((row.social_ins || 0) + (row.housing_fund || 0)) }}</template></el-table-column>
          <el-table-column label="个税" width="90" align="right"><template #default="{ row }">{{ money(row.tax) }}</template></el-table-column>
          <el-table-column label="实发" width="110" align="right"><template #default="{ row }"><b class="net">{{ money(row.net_pay) }}</b></template></el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag size="small" :type="row.status === '已发布' ? 'success' : 'info'">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" :disabled="row.status === '已发布'" @click="openAssess(row)">评分</el-button>
              <el-button size="small" type="danger" :disabled="row.status === '已发布'" @click="removeFin(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无财务序列核算记录，选择月份后点击「生成核算」</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 批次明细 -->
    <el-dialog v-model="detailDlg.visible" :title="'核算明细 · ' + detailDlg.period" width="900px">
      <el-table :data="detailDlg.items" stripe size="small" max-height="440">
        <el-table-column prop="emp_no" label="工号" width="90" />
        <el-table-column prop="emp_name" label="姓名" width="90" />
        <el-table-column prop="dept_name" label="部门" width="110" show-overflow-tooltip />
        <el-table-column label="回款(万)" width="90" align="right"><template #default="{ row }">{{ row.collection_amount }}</template></el-table-column>
        <el-table-column label="提成" width="90" align="right"><template #default="{ row }">{{ money(row.commission_amount) }}</template></el-table-column>
        <el-table-column label="绩效系数" width="90" align="right"><template #default="{ row }">{{ row.perf_coef }}</template></el-table-column>
        <el-table-column label="应发" width="100" align="right"><template #default="{ row }">{{ money(row.gross_amount) }}</template></el-table-column>
        <el-table-column label="个税" width="90" align="right"><template #default="{ row }">{{ money(row.tax_amount) }}</template></el-table-column>
        <el-table-column label="实发" width="100" align="right"><template #default="{ row }"><b>{{ money(row.net_amount) }}</b></template></el-table-column>
        <el-table-column label="核算说明" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ (row.items && row.items.coef_src) || '—' }}</template>
        </el-table-column>
        <template #empty><span class="muted">该批次暂无明细</span></template>
      </el-table>
      <template #footer><el-button @click="detailDlg.visible = false">关闭</el-button></template>
    </el-dialog>

    <!-- 薪酬档案编辑 -->
    <el-dialog v-model="profileDlg.visible" :title="'薪酬档案 · ' + profileDlg.form.emp_name" width="560px">
      <el-form label-width="130px" size="small">
        <el-form-item label="薪酬序列">
          <el-select v-model="profileDlg.form.seq_type" style="width:100%">
            <el-option v-for="s in options.seq_types" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="基本工资(元)"><el-input-number v-model="profileDlg.form.base_salary" :min="0" :step="100" style="width:100%" /></el-form-item>
        <el-form-item label="岗位工资(元)"><el-input-number v-model="profileDlg.form.post_salary" :min="0" :step="100" style="width:100%" /></el-form-item>
        <el-form-item label="绩效基数(元)"><el-input-number v-model="profileDlg.form.perf_base" :min="0" :step="100" style="width:100%" /></el-form-item>
        <el-form-item label="提成率(0~1)"><el-input-number v-model="profileDlg.form.commission_rate" :min="0" :max="1" :step="0.005" :precision="3" style="width:100%" /></el-form-item>
        <el-form-item label="回款目标(万元)"><el-input-number v-model="profileDlg.form.commission_target" :min="0" :step="5" style="width:100%" /></el-form-item>
        <el-form-item label="超额加成系数"><el-input-number v-model="profileDlg.form.commission_bonus" :min="0" :max="2" :step="0.1" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item label="固定补贴(元)"><el-input-number v-model="profileDlg.form.allowance" :min="0" :step="100" style="width:100%" /></el-form-item>
        <el-form-item label="社保代扣(元)"><el-input-number v-model="profileDlg.form.social_amount" :min="0" :step="100" style="width:100%" /></el-form-item>
        <el-form-item label="生效月份"><el-input v-model="profileDlg.form.effective_month" placeholder="YYYY-MM" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="profileDlg.form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="profileDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="profileDlg.saving" @click="submitProfile">保存</el-button>
      </template>
    </el-dialog>

    <!-- 财务考核评分 -->
    <el-dialog v-model="assessDlg.visible" :title="'考核评分 · ' + assessDlg.name" width="480px">
      <p class="muted" style="margin-top:0;">五项指标 0~100 分，综合分 = 五项均值，按方案分档换算绩效系数</p>
      <el-form label-width="160px" size="small">
        <el-form-item v-for="k in finKpi" :key="k.key" :label="k.label">
          <el-input-number v-model="assessDlg.dims[k.key]" :min="0" :max="100" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assessDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="assessDlg.saving" @click="submitAssess">提交评分</el-button>
      </template>
    </el-dialog>

    <!-- 财务序列组成方案 -->
    <el-dialog v-model="finSchemeDlg.visible" title="财务序列薪酬组成方案" width="720px">
      <div class="scheme-tip">
        <div><b>{{ finScheme.formula || '应发 = 基本工资+岗位工资+绩效工资+交通补贴+餐补+工龄津贴+职称津贴' }}</b></div>
        <div class="muted">绩效工资 = 绩效基数 × 考核系数；工龄津贴 = 工龄月数 × 单价；实发 = 应发 − 社保 − 公积金 − 个税</div>
      </div>
      <el-form label-width="120px" size="small" style="margin-top:10px;">
        <el-form-item label="方案名称"><el-input v-model="finSchemeEdit.scheme_name" /></el-form-item>
        <el-form-item label="工龄津贴单价"><el-input-number v-model="finSchemeEdit.seniority_per_month" :min="0" :max="1000" /></el-form-item>
      </el-form>
      <el-table :data="finRoles" stripe size="small">
        <el-table-column prop="label" label="岗位" width="110" />
        <el-table-column label="基本工资" width="110"><template #default="{ row }"><el-input-number v-model="row.base" :min="0" :step="100" size="small" controls-position="right" style="width:100px" /></template></el-table-column>
        <el-table-column label="岗位工资" width="110"><template #default="{ row }"><el-input-number v-model="row.post" :min="0" :step="100" size="small" controls-position="right" style="width:100px" /></template></el-table-column>
        <el-table-column label="绩效基数" width="110"><template #default="{ row }"><el-input-number v-model="row.perf" :min="0" :step="100" size="small" controls-position="right" style="width:100px" /></template></el-table-column>
        <el-table-column label="交通/餐补" width="120"><template #default="{ row }">{{ row.traffic }} / {{ row.meal }}</template></el-table-column>
        <el-table-column label="职称津贴" width="110"><template #default="{ row }"><el-input-number v-model="row.title_allow" :min="0" :step="100" size="small" controls-position="right" style="width:100px" /></template></el-table-column>
        <el-table-column label="社保/公积金" width="130"><template #default="{ row }">{{ row.social }} / {{ row.housing }}</template></el-table-column>
        <template #empty><span class="muted">暂无方案</span></template>
      </el-table>
      <template #footer>
        <el-button @click="finSchemeDlg.visible = false">关闭</el-button>
        <el-button type="primary" :loading="finSchemeDlg.saving" @click="saveFinScheme">保存方案</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Wallet, Money, User, TrendCharts, Coin, Plus, Refresh, Document } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('records');
const loading = ref(false);
const stats = ref(null);
const options = ref({ employees: [], depts: [], periods: [], seq_types: [], record_status: [], rules: {} });

const records = ref([]);
const payslips = ref([]);
const profiles = ref([]);
const schemeRows = ref([]);
const scheme = ref({});
const finRows = ref([]);
const finScheme = ref({});
const finRoles = ref([]);
const finKpi = ref([]);

const filter = reactive({ period: '' });
const psFilter = reactive({ period: '', dept: '', q: '' });
const pfFilter = reactive({ q: '', seq_type: '', dept: '' });
const calcPeriod = ref(new Date().toISOString().slice(0, 7));
const forceCalc = ref(false);
const calculating = ref(false);
const savingScheme = ref(false);
const finPeriod = ref(new Date().toISOString().slice(0, 7));
const finCalcing = ref(false);

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '建档人数', value: s.profiles, sub: `在职 ${s.employees} 人`, icon: User, color: '#2563eb' },
    { title: '最新期间', value: s.latest_period || '—', sub: `核算 ${s.latest_emps} 人`, icon: Wallet, color: '#f59e0b' },
    { title: '应发合计(元)', value: money(s.latest_gross), sub: `提成 ${money(s.latest_commission)}`, icon: Money, color: '#10b981' },
    { title: '实发合计(元)', value: money(s.latest_net), sub: `已发布 ${s.published} 个批次`, icon: TrendCharts, color: '#8b5cf6' },
  ];
});

function money(v) {
  return Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function gradeType(g) {
  if (!g) return 'info';
  if (g.indexOf('S') === 0) return 'success';
  if (g.indexOf('A') === 0) return 'success';
  if (g.indexOf('B') === 0) return 'primary';
  if (g.indexOf('C') === 0) return 'warning';
  return 'danger';
}

async function loadOptions() {
  const r = await request.get('/payroll/options');
  if (r.code === 200) options.value = r.data || options.value;
}
async function loadStats() {
  const r = await request.get('/payroll/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadRecords() {
  loading.value = true;
  try {
    const params = {};
    if (filter.period) params.period = filter.period;
    const r = await request.get('/payroll/records', { params });
    records.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadPayslips() {
  loading.value = true;
  try {
    const params = {};
    ['period', 'dept', 'q'].forEach((k) => { if (psFilter[k]) params[k] = psFilter[k]; });
    const r = await request.get('/payroll/payslips', { params });
    payslips.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadProfiles() {
  loading.value = true;
  try {
    const params = {};
    ['q', 'seq_type', 'dept'].forEach((k) => { if (pfFilter[k]) params[k] = pfFilter[k]; });
    const r = await request.get('/payroll/profiles', { params });
    profiles.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadScheme() {
  const r = await request.get('/payroll/scheme');
  if (r.code === 200) {
    scheme.value = r.data || {};
    schemeRows.value = (r.data && r.data.roles ? r.data.roles : []).map((x) => ({ ...x }));
  }
}
async function loadFin() {
  loading.value = true;
  try {
    const r = await request.get('/payroll/fin/records', { params: { period: finPeriod.value } });
    finRows.value = (r.code === 200 && r.data ? r.data.rows : []) || [];
  } finally { loading.value = false; }
}
async function loadFinScheme() {
  const r = await request.get('/payroll/fin/scheme');
  if (r.code === 200) {
    finScheme.value = r.data || {};
    finRoles.value = ((r.data && r.data.roles) || []).map((x) => ({ ...x }));
    finKpi.value = (r.data && r.data.kpi) || [];
    finSchemeEdit.scheme_name = r.data.scheme_name || '';
    finSchemeEdit.seniority_per_month = r.data.seniority_per_month || 0;
  }
}

onMounted(async () => {
  await loadOptions();
  await loadStats();
  await loadRecords();
  await loadPayslips();
  await loadProfiles();
  await loadScheme();
  await loadFinScheme();
  await loadFin();
});

/* ---------- 核算 ---------- */
async function submitCalc() {
  if (!calcPeriod.value) { ElMessage.warning('请选择核算月份'); return; }
  calculating.value = true;
  const r = await request.post('/payroll/calc', { period: calcPeriod.value, force: forceCalc.value });
  calculating.value = false;
  if (r.code === 200) { ElMessage.success(r.msg || '核算完成'); loadRecords(); loadStats(); }
  else ElMessage.error(r.msg || '核算失败');
}
const detailDlg = reactive({ visible: false, period: '', items: [] });
async function openDetail(row) {
  detailDlg.period = row.period;
  detailDlg.visible = true;
  const r = await request.get(`/payroll/records/${row.id}`);
  detailDlg.items = (r.code === 200 && r.data ? r.data.items : []) || [];
}
async function publish(row) {
  await ElMessageBox.confirm(`确认发布 ${row.period} 工资单？发布后员工可查看，且不可再重算。`, '发布确认', { type: 'warning' });
  const r = await request.post(`/payroll/records/${row.id}/publish`);
  if (r.code === 200) { ElMessage.success(r.msg || '已发布'); loadRecords(); loadPayslips(); loadStats(); }
  else ElMessage.error(r.msg || '发布失败');
}
async function removeRecord(row) {
  await ElMessageBox.confirm(`确认删除 ${row.period} 草稿批次？`, '删除确认', { type: 'warning' });
  const r = await request.delete(`/payroll/records/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); loadRecords(); }
  else ElMessage.error(r.msg || '删除失败');
}

/* ---------- 档案 ---------- */
async function initProfiles() {
  const r = await request.post('/payroll/profiles/init');
  if (r.code === 200) { ElMessage.success(r.msg || '建档完成'); loadProfiles(); loadStats(); }
  else ElMessage.error(r.msg || '建档失败');
}
async function applyScheme() {
  await ElMessageBox.confirm('将按当前组成方案覆盖全体在职员工的基本/岗位/绩效基数/提成/社保，个人补贴与备注保留。确认应用？', '应用方案', { type: 'warning' });
  const r = await request.post('/payroll/scheme/apply');
  if (r.code === 200) { ElMessage.success(r.msg || '已应用'); loadProfiles(); }
  else ElMessage.error(r.msg || '应用失败');
}
const profileDlg = reactive({ visible: false, saving: false, form: {} });
function openProfile(row) {
  profileDlg.form = {
    emp_id: row.emp_id, emp_name: row.emp_name, seq_type: row.seq_type,
    base_salary: row.base_salary, post_salary: row.post_salary, perf_base: row.perf_base,
    commission_rate: row.commission_rate, commission_target: row.commission_target,
    commission_bonus: row.commission_bonus || 0.5, allowance: row.allowance,
    social_amount: row.social_amount, effective_month: row.effective_month, remark: row.remark || '',
  };
  profileDlg.visible = true;
}
async function submitProfile() {
  profileDlg.saving = true;
  const r = await request.put(`/payroll/profiles/${profileDlg.form.emp_id}`, profileDlg.form);
  profileDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已保存'); profileDlg.visible = false; loadProfiles(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------- 方案 ---------- */
async function saveScheme() {
  savingScheme.value = true;
  const r = await request.put('/payroll/scheme', { rows: schemeRows.value });
  savingScheme.value = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); loadScheme(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------- 财务考核 ---------- */
async function finCalc() {
  if (!finPeriod.value) { ElMessage.warning('请选择考核月份'); return; }
  finCalcing.value = true;
  const r = await request.post('/payroll/fin/calc', { period: finPeriod.value });
  finCalcing.value = false;
  if (r.code === 200) { ElMessage.success(r.msg || '核算完成'); loadFin(); }
  else ElMessage.error(r.msg || '核算失败');
}
async function finPublish() {
  const r = await request.post('/payroll/fin/publish', { period: finPeriod.value });
  if (r.code === 200) { ElMessage.success(r.msg || '已发布'); loadFin(); }
  else ElMessage.error(r.msg || '发布失败');
}
async function removeFin(row) {
  await ElMessageBox.confirm(`确认删除 ${row.emp_name} ${row.period} 草稿记录？`, '删除确认', { type: 'warning' });
  const r = await request.delete(`/payroll/fin/records/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); loadFin(); }
  else ElMessage.error(r.msg || '删除失败');
}
const assessDlg = reactive({ visible: false, saving: false, id: null, name: '', dims: {} });
function openAssess(row) {
  assessDlg.id = row.id;
  assessDlg.name = row.emp_name;
  assessDlg.dims = {};
  finKpi.value.forEach((k) => { assessDlg.dims[k.key] = (row.dims && row.dims[k.key]) || 0; });
  assessDlg.visible = true;
}
async function submitAssess() {
  assessDlg.saving = true;
  const payload = {};
  Object.keys(assessDlg.dims).forEach((k) => { payload[k] = assessDlg.dims[k]; });
  const r = await request.put(`/payroll/fin/records/${assessDlg.id}/assess`, payload);
  assessDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '评分已保存'); assessDlg.visible = false; loadFin(); }
  else ElMessage.error(r.msg || '评分失败');
}
const finSchemeDlg = reactive({ visible: false, saving: false });
const finSchemeEdit = reactive({ scheme_name: '', seniority_per_month: 0 });
async function saveFinScheme() {
  const roles = {};
  finRoles.value.forEach((x) => { roles[x.role] = x; });
  finSchemeDlg.saving = true;
  const r = await request.put('/payroll/fin/scheme', {
    scheme_name: finSchemeEdit.scheme_name,
    seniority_per_month: finSchemeEdit.seniority_per_month,
    roles,
  });
  finSchemeDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); finSchemeDlg.visible = false; loadFinScheme(); loadFin(); }
  else ElMessage.error(r.msg || '保存失败');
}
</script>

<style scoped>
.payroll { padding: 20px; }
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
.scheme-tip { background: var(--el-fill-color-light); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; line-height: 1.9; }
.net { color: #10b981; }
.el-form-item { margin-bottom: 12px; }
</style>
