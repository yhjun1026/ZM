<template>
  <div class="hr-ext">
    <div class="page-header">
      <h2>人事业务</h2>
      <p>入职建档 → 转正评估 → 调岗异动 → 离职交接 → 人事合同；招聘：需求（编制校验）→ 候选人（阶段流转）→ Offer（录用审批自动建档待入职）</p>
    </div>

    <div class="kpi-grid" v-if="dash">
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
      <!-- ============ 入职建档 ============ -->
      <el-tab-pane label="入职建档" name="onboards">
        <div class="tab-toolbar">
          <el-input v-model="kw" placeholder="搜索姓名/单号/部门" style="width:220px" clearable @change="load('onboards')" />
          <el-button type="primary" @click="onbDlg.visible = true">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增入职登记
          </el-button>
        </div>
        <el-table :data="rows.onboards" stripe size="small" v-loading="loading">
          <el-table-column prop="onb_no" label="单号" width="150" />
          <el-table-column prop="name" label="姓名" width="90" />
          <el-table-column prop="title" label="拟任职位" min-width="120" show-overflow-tooltip />
          <el-table-column prop="role" label="角色" width="110" />
          <el-table-column prop="dept_name" label="部门" width="120" show-overflow-tooltip />
          <el-table-column prop="hire_date" label="拟入职" width="110" />
          <el-table-column label="薪资(元)" width="100" align="right">
            <template #default="{ row }">{{ row.salary || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '待审批'" size="small" type="success" @click="approve('/hr-ext/onboards', row)">审批</el-button>
              <el-button v-if="row.status === '待入职'" size="small" type="primary" @click="activate(row)">办理入职</el-button>
              <el-button v-if="row.status === '通过'" size="small" disabled>已建档</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无入职登记，点击右上角「新增入职登记」</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 转正评估 ============ -->
      <el-tab-pane label="转正评估" name="evaluations">
        <div class="tab-toolbar">
          <div class="muted">试用期转正 / 半年度绩效 / 年度绩效 / 专项评价，评分 0-100，审批通过后留档</div>
          <el-button type="primary" @click="evaDlg.visible = true">
            <el-icon style="margin-right:4px"><Plus /></el-icon>发起评价
          </el-button>
        </div>
        <el-table :data="rows.evaluations" stripe size="small" v-loading="loading">
          <el-table-column prop="eva_no" label="单号" width="150" />
          <el-table-column prop="emp_name" label="被评价人" width="100" />
          <el-table-column prop="eval_type" label="类型" width="110" />
          <el-table-column label="评分" width="90" align="right">
            <template #default="{ row }"><b :class="row.score >= 80 ? 'good' : (row.score >= 60 ? 'warn' : 'bad')">{{ row.score }}</b></template>
          </el-table-column>
          <el-table-column prop="comment" label="评价意见" min-width="200" show-overflow-tooltip />
          <el-table-column prop="suggestion" label="改进建议" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '待审批'" size="small" type="success" @click="approve('/hr-ext/evaluations', row)">审批</el-button>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无评价记录</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 调岗异动 ============ -->
      <el-tab-pane label="调岗异动" name="transfers">
        <div class="tab-toolbar">
          <div class="muted">岗位调动 / 晋升 / 降职 / 调岗 / 调薪 / 综合调整，审批通过后写回员工档案</div>
          <el-button type="primary" @click="openTransfer">
            <el-icon style="margin-right:4px"><Plus /></el-icon>发起异动
          </el-button>
        </div>
        <el-table :data="rows.transfers" stripe size="small" v-loading="loading">
          <el-table-column prop="tf_no" label="单号" width="150" />
          <el-table-column prop="emp_name" label="员工" width="90" />
          <el-table-column prop="tf_type" label="类型" width="100" />
          <el-table-column prop="src_dept" label="原部门/职位" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.src_dept }} · {{ row.src_title || '-' }}</template>
          </el-table-column>
          <el-table-column label="新部门/职位" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.dst_dept || '—' }} · {{ row.dst_title || '-' }}</template>
          </el-table-column>
          <el-table-column label="薪资(元)" width="140">
            <template #default="{ row }">{{ row.old_salary || 0 }} → {{ row.new_salary || 0 }}</template>
          </el-table-column>
          <el-table-column prop="effective_date" label="生效日" width="110" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '待审批'" size="small" type="success" @click="approve('/hr-ext/transfers', row)">审批</el-button>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无异动记录</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 离职 ============ -->
      <el-tab-pane label="离职" name="resignations">
        <div class="tab-toolbar">
          <div class="muted">本人自助提交或行政人事代填 → 审批通过「待离职」→ 办理停用账号</div>
          <el-button type="primary" @click="openResign">
            <el-icon style="margin-right:4px"><Plus /></el-icon>提交离职申请
          </el-button>
        </div>
        <el-table :data="rows.resignations" stripe size="small" v-loading="loading">
          <el-table-column prop="rs_no" label="单号" width="150" />
          <el-table-column prop="emp_name" label="员工" width="90" />
          <el-table-column prop="emp_dept" label="部门" width="120" show-overflow-tooltip />
          <el-table-column prop="resign_type" label="类型" width="130" />
          <el-table-column prop="last_work_date" label="最后工作日" width="110" />
          <el-table-column label="交接项" width="80" align="right">
            <template #default="{ row }">{{ (row.handover || []).length }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="statusType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '待审批'" size="small" type="success" @click="approve('/hr-ext/resignations', row)">审批</el-button>
              <el-button v-if="['待审批','待离职'].includes(row.status)" size="small" @click="openHandover(row)">交接清单</el-button>
              <el-button v-if="row.status === '待离职'" size="small" type="danger" @click="finishResign(row)">办理离职</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无离职申请</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 人事合同 ============ -->
      <el-tab-pane label="人事合同" name="contracts">
        <div class="tab-toolbar">
          <div class="muted">新签 / 续签 / 变更：草稿 → 审批中 → 已通过 → 已归档</div>
          <el-button type="primary" @click="openContract">
            <el-icon style="margin-right:4px"><Plus /></el-icon>起草合同
          </el-button>
        </div>
        <el-table :data="rows.contracts" stripe size="small" v-loading="loading">
          <el-table-column prop="hc_no" label="合同编号" width="150" />
          <el-table-column prop="emp_name" label="员工" width="90" />
          <el-table-column prop="dept_name" label="部门" width="120" show-overflow-tooltip />
          <el-table-column prop="contract_type" label="类型" width="80" />
          <el-table-column label="合同期限" width="180">
            <template #default="{ row }">{{ row.start_date }} ~ {{ row.end_date }}</template>
          </el-table-column>
          <el-table-column label="试用期" width="80" align="right">
            <template #default="{ row }">{{ row.probation_months }} 月</template>
          </el-table-column>
          <el-table-column label="月薪(元)" width="100" align="right">
            <template #default="{ row }">{{ row.salary_base || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="contractType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '审批中'" size="small" type="success" @click="approve('/hr-ext/contracts', row)">审批</el-button>
              <el-button v-if="row.status === '已通过'" size="small" @click="archiveContract(row)">归档</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无人事合同</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 招聘 ============ -->
      <el-tab-pane label="招聘管理" name="recruit">
        <el-tabs v-model="recruitTab" type="card" @tab-change="onRecruitTabChange">
          <el-tab-pane label="招聘需求" name="reqs">
            <div class="tab-toolbar">
              <div class="muted">需求提交时校验部门编制：在职 + 在途招聘 + 本次需求 ≤ 部门编制</div>
              <el-button type="primary" size="small" @click="openReq">
                <el-icon style="margin-right:4px"><Plus /></el-icon>新增需求
              </el-button>
            </div>
            <el-table :data="rows.reqs" stripe size="small" v-loading="loading">
              <el-table-column prop="req_no" label="单号" width="150" />
              <el-table-column prop="title" label="岗位" min-width="140" show-overflow-tooltip />
              <el-table-column prop="dept_name" label="用人部门" width="120" />
              <el-table-column label="人数" width="80" align="right"><template #default="{ row }">{{ row.headcount }}</template></el-table-column>
              <el-table-column prop="req_type" label="类型" width="80" />
              <el-table-column prop="salary_range" label="薪资范围" width="120" />
              <el-table-column prop="need_date" label="到岗日期" width="110" />
              <el-table-column label="候选人" width="80" align="right"><template #default="{ row }">{{ row.cand_count }}</template></el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{ row }"><el-tag size="small" :type="reqType(row.status)">{{ row.status }}</el-tag></template>
              </el-table-column>
              <el-table-column label="操作" width="170" fixed="right">
                <template #default="{ row }">
                  <el-button v-if="row.status === '待审批'" size="small" type="success" @click="approve('/hr-ext/recruit/reqs', row)">审批</el-button>
                  <el-button v-if="['待审批','招聘中'].includes(row.status)" size="small" @click="closeReq(row)">关闭</el-button>
                </template>
              </el-table-column>
              <template #empty><span class="muted">暂无招聘需求</span></template>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="候选人" name="candidates">
            <div class="tab-toolbar">
              <div class="muted">阶段流转：初筛 → 面试 → 复试 → 待录用（录用须走 Offer 审批，终态不可再改）</div>
              <el-button type="primary" size="small" @click="openCandidate">
                <el-icon style="margin-right:4px"><Plus /></el-icon>录入候选人
              </el-button>
            </div>
            <el-table :data="rows.candidates" stripe size="small" v-loading="loading">
              <el-table-column prop="cand_no" label="编号" width="150" />
              <el-table-column prop="name" label="姓名" width="90" />
              <el-table-column prop="req_title" label="应聘岗位" min-width="140" show-overflow-tooltip />
              <el-table-column prop="phone" label="电话" width="120" />
              <el-table-column prop="source" label="来源" width="100" />
              <el-table-column label="评分" width="80" align="right"><template #default="{ row }">{{ row.score ?? '—' }}</template></el-table-column>
              <el-table-column label="阶段" width="100">
                <template #default="{ row }"><el-tag size="small" :type="stageType(row.stage)">{{ row.stage }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="evaluation" label="面试评价" min-width="160" show-overflow-tooltip />
              <el-table-column label="操作" width="170" fixed="right">
                <template #default="{ row }">
                  <el-button v-if="!['已录用','淘汰','放弃'].includes(row.stage)" size="small" @click="openStage(row)">流转</el-button>
                  <el-button v-if="['复试','待录用'].includes(row.stage)" size="small" type="primary" @click="openOffer(row)">发 Offer</el-button>
                </template>
              </el-table-column>
              <template #empty><span class="muted">暂无候选人</span></template>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="Offer" name="offers">
            <div class="tab-toolbar">
              <div class="muted">录用审批通过后：候选人置「已录用」并自动建档入职登记单（待入职）</div>
              <span />
            </div>
            <el-table :data="rows.offers" stripe size="small" v-loading="loading">
              <el-table-column prop="offer_no" label="单号" width="150" />
              <el-table-column prop="cand_name" label="候选人" width="90" />
              <el-table-column prop="title" label="录用岗位" min-width="140" show-overflow-tooltip />
              <el-table-column prop="role" label="角色" width="110" />
              <el-table-column prop="dept_name" label="部门" width="120" show-overflow-tooltip />
              <el-table-column label="薪资(元)" width="100" align="right"><template #default="{ row }">{{ row.salary_base || '—' }}</template></el-table-column>
              <el-table-column prop="hire_date" label="拟入职" width="110" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }"><el-tag size="small" :type="offerType(row.status)">{{ row.status }}</el-tag></template>
              </el-table-column>
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row }">
                  <el-button v-if="row.status === '待审批'" size="small" type="success" @click="approve('/hr-ext/recruit/offers', row)">审批</el-button>
                  <span v-else class="muted">—</span>
                </template>
              </el-table-column>
              <template #empty><span class="muted">暂无 Offer 记录</span></template>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </el-tab-pane>

      <!-- ============ 员工权限 ============ -->
      <el-tab-pane label="员工权限" name="perms">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="permEmpId" filterable clearable placeholder="选择员工" style="width:220px" @change="loadPerms">
              <el-option v-for="e in staff" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
            </el-select>
          </div>
          <div class="muted">员工级模块权限覆盖（一次变更一个字段），由行政人事线归口维护</div>
        </div>
        <el-table :data="permRows" stripe size="small" v-loading="permLoading">
          <el-table-column prop="module" label="模块" min-width="160" />
          <el-table-column label="查看" width="110">
            <template #default="{ row }">
              <el-switch :model-value="!!row.can_view" @change="(v) => setPerm(row, 'can_view', v)" />
            </template>
          </el-table-column>
          <el-table-column label="编辑" width="110">
            <template #default="{ row }">
              <el-switch :model-value="!!row.can_edit" @change="(v) => setPerm(row, 'can_edit', v)" />
            </template>
          </el-table-column>
          <el-table-column label="审批" width="110">
            <template #default="{ row }">
              <el-switch :model-value="!!row.can_approve" @change="(v) => setPerm(row, 'can_approve', v)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="danger" @click="clearPerm(row)">恢复默认</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">请选择员工查看其权限覆盖；无覆盖表示沿用角色默认权限</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 入职登记 -->
    <el-dialog v-model="onbDlg.visible" title="新增入职登记" width="560px">
      <el-form label-width="100px" size="small">
        <el-form-item label="姓名" required><el-input v-model="onbDlg.form.name" /></el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="onbDlg.form.role" filterable style="width:100%">
            <el-option v-for="r in meta.roles" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="拟任职位"><el-input v-model="onbDlg.form.title" /></el-form-item>
        <el-form-item label="所属部门">
          <el-select v-model="onbDlg.form.org_id" filterable clearable style="width:100%">
            <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="onbDlg.form.gender" clearable style="width:100%">
            <el-option v-for="g in meta.genders" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号"><el-input v-model="onbDlg.form.phone" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="onbDlg.form.email" /></el-form-item>
        <el-form-item label="区域"><el-input v-model="onbDlg.form.region" /></el-form-item>
        <el-form-item label="拟入职日"><el-input v-model="onbDlg.form.hire_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="拟定薪资(元)"><el-input-number v-model="onbDlg.form.salary" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="onbDlg.form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="onbDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="onbDlg.saving" @click="submitOnboard">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 发起评价 -->
    <el-dialog v-model="evaDlg.visible" title="发起员工评价" width="520px">
      <el-form label-width="100px" size="small">
        <el-form-item label="被评价员工" required>
          <el-select v-model="evaDlg.form.emp_id" filterable style="width:100%">
            <el-option v-for="e in staff" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="评价类型" required>
          <el-select v-model="evaDlg.form.eval_type" style="width:100%">
            <el-option v-for="t in meta.eval_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="评分(0-100)" required>
          <el-input-number v-model="evaDlg.form.score" :min="0" :max="100" style="width:100%" />
        </el-form-item>
        <el-form-item label="评价意见"><el-input v-model="evaDlg.form.comment" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="改进建议"><el-input v-model="evaDlg.form.suggestion" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="evaDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="evaDlg.saving" @click="submitEvaluation">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 发起异动 -->
    <el-dialog v-model="tfDlg.visible" title="发起员工异动" width="600px">
      <el-form label-width="110px" size="small">
        <el-form-item label="员工" required>
          <el-select v-model="tfDlg.form.emp_id" filterable style="width:100%">
            <el-option v-for="e in staff" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="异动类型" required>
          <el-select v-model="tfDlg.form.tf_type" style="width:100%">
            <el-option v-for="t in meta.tf_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标部门">
          <el-select v-model="tfDlg.form.dst_org_id" filterable clearable style="width:100%">
            <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="新职位"><el-input v-model="tfDlg.form.dst_title" /></el-form-item>
        <el-form-item label="新角色">
          <el-select v-model="tfDlg.form.dst_role" filterable clearable style="width:100%">
            <el-option v-for="r in meta.roles" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="新区域"><el-input v-model="tfDlg.form.dst_region" /></el-form-item>
        <el-form-item label="新薪资(元)"><el-input-number v-model="tfDlg.form.new_salary" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="生效日期"><el-input v-model="tfDlg.form.effective_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="异动原因"><el-input v-model="tfDlg.form.reason" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tfDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="tfDlg.saving" @click="submitTransfer">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 离职申请 -->
    <el-dialog v-model="rsDlg.visible" title="提交离职申请" width="560px">
      <el-form label-width="110px" size="small">
        <el-form-item label="员工（代填）">
          <el-select v-model="rsDlg.form.emp_id" filterable clearable placeholder="留空=本人" style="width:100%">
            <el-option v-for="e in staff" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="离职类型" required>
          <el-select v-model="rsDlg.form.resign_type" style="width:100%">
            <el-option v-for="t in meta.rs_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="最后工作日" required><el-input v-model="rsDlg.form.last_work_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="离职原因"><el-input v-model="rsDlg.form.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rsDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="rsDlg.saving" @click="submitResign">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 离职交接清单 -->
    <el-dialog v-model="hoDlg.visible" :title="`离职交接清单 · ${hoDlg.name}`" width="640px">
      <div class="section-title">工作交接</div>
      <div v-for="(it, i) in hoDlg.handover" :key="i" class="ho-row">
        <el-input v-model="it.item" placeholder="交接事项" style="flex:2" />
        <el-input v-model="it.to" placeholder="接收人" style="flex:1" />
        <el-input v-model="it.note" placeholder="备注" style="flex:1" />
        <el-button size="small" type="danger" @click="hoDlg.handover.splice(i, 1)">删除</el-button>
      </div>
      <el-button size="small" @click="hoDlg.handover.push({ item: '', to: '', note: '' })">+ 添加交接项</el-button>
      <div class="section-title">资产核验</div>
      <div v-for="(it, i) in hoDlg.assets" :key="i" class="ho-row">
        <el-input v-model="it.asset" placeholder="资产名称" style="flex:2" />
        <el-input v-model="it.status" placeholder="状态（已归还/待扣款…）" style="flex:1" />
        <el-button size="small" type="danger" @click="hoDlg.assets.splice(i, 1)">删除</el-button>
      </div>
      <el-button size="small" @click="hoDlg.assets.push({ asset: '', status: '' })">+ 添加资产项</el-button>
      <template #footer>
        <el-button @click="hoDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="hoDlg.saving" @click="submitHandover">保存清单</el-button>
      </template>
    </el-dialog>

    <!-- 人事合同 -->
    <el-dialog v-model="ctDlg.visible" title="起草人事合同" width="600px">
      <el-form label-width="110px" size="small">
        <el-form-item label="员工" required>
          <el-select v-model="ctDlg.form.emp_id" filterable style="width:100%">
            <el-option v-for="e in staff" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="合同类型">
          <el-select v-model="ctDlg.form.contract_type" style="width:100%">
            <el-option v-for="t in meta.contract_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="起始日期" required><el-input v-model="ctDlg.form.start_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="终止日期" required><el-input v-model="ctDlg.form.end_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="试用期(月)"><el-input-number v-model="ctDlg.form.probation_months" :min="0" :max="12" style="width:100%" /></el-form-item>
        <el-form-item label="月基本工资"><el-input-number v-model="ctDlg.form.salary_base" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="其它薪酬"><el-input v-model="ctDlg.form.salary_other" /></el-form-item>
        <el-form-item label="工作地点"><el-input v-model="ctDlg.form.workplace" /></el-form-item>
        <el-form-item label="岗位"><el-input v-model="ctDlg.form.title" /></el-form-item>
        <el-form-item label="主要条款"><el-input v-model="ctDlg.form.content" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ctDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="ctDlg.saving" @click="submitContract">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 招聘需求 -->
    <el-dialog v-model="reqDlg.visible" title="新增招聘需求" width="600px">
      <el-form label-width="110px" size="small">
        <el-form-item label="招聘岗位" required><el-input v-model="reqDlg.form.title" /></el-form-item>
        <el-form-item label="用人部门" required>
          <el-select v-model="reqDlg.form.dept_id" filterable style="width:100%">
            <el-option v-for="o in orgs" :key="o.id" :label="`${o.name}（编制 ${o.headcount}）`" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="需求人数" required><el-input-number v-model="reqDlg.form.headcount" :min="1" style="width:100%" /></el-form-item>
        <el-form-item label="需求类型">
          <el-select v-model="reqDlg.form.req_type" style="width:100%">
            <el-option v-for="t in meta.req_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="薪资范围"><el-input v-model="reqDlg.form.salary_range" placeholder="如 8000-12000" /></el-form-item>
        <el-form-item label="到岗日期"><el-input v-model="reqDlg.form.need_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="岗位职责"><el-input v-model="reqDlg.form.job_duty" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="任职要求"><el-input v-model="reqDlg.form.requirement" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reqDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="reqDlg.saving" @click="submitReq">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 候选人 -->
    <el-dialog v-model="candDlg.visible" title="录入候选人" width="560px">
      <el-form label-width="110px" size="small">
        <el-form-item label="关联需求" required>
          <el-select v-model="candDlg.form.req_id" filterable style="width:100%">
            <el-option v-for="r in rows.reqs.filter((x) => ['待审批', '招聘中'].includes(x.status))" :key="r.id" :label="r.title" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="姓名" required><el-input v-model="candDlg.form.name" /></el-form-item>
        <el-form-item label="性别">
          <el-select v-model="candDlg.form.gender" clearable style="width:100%">
            <el-option v-for="g in meta.genders" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号"><el-input v-model="candDlg.form.phone" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="candDlg.form.email" /></el-form-item>
        <el-form-item label="来源">
          <el-select v-model="candDlg.form.source" style="width:100%">
            <el-option v-for="s in meta.sources" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="简历摘要"><el-input v-model="candDlg.form.resume_note" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="candDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="candDlg.saving" @click="submitCandidate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 阶段流转 -->
    <el-dialog v-model="stageDlg.visible" :title="`候选人流转 · ${stageDlg.name}`" width="440px">
      <p class="muted" style="margin-bottom:12px;">当前阶段：<el-tag size="small">{{ stageDlg.current }}</el-tag></p>
      <el-form label-width="90px" size="small">
        <el-form-item label="目标阶段">
          <el-select v-model="stageDlg.stage" style="width:100%">
            <el-option v-for="s in stageOptions" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="评分"><el-input-number v-model="stageDlg.score" :min="0" :max="100" style="width:100%" /></el-form-item>
        <el-form-item label="面试评价"><el-input v-model="stageDlg.evaluation" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stageDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="stageDlg.saving" @click="submitStage">确认流转</el-button>
      </template>
    </el-dialog>

    <!-- Offer -->
    <el-dialog v-model="offerDlg.visible" :title="`发起录用 · ${offerDlg.name}`" width="600px">
      <el-form label-width="110px" size="small">
        <el-form-item label="录用岗位" required><el-input v-model="offerDlg.form.title" /></el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="offerDlg.form.role" filterable style="width:100%">
            <el-option v-for="r in meta.roles" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="offerDlg.form.dept_id" filterable clearable style="width:100%">
            <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="区域"><el-input v-model="offerDlg.form.region" /></el-form-item>
        <el-form-item label="拟入职日"><el-input v-model="offerDlg.form.hire_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="月薪(元)"><el-input-number v-model="offerDlg.form.salary_base" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="试用期(月)"><el-input-number v-model="offerDlg.form.probation_months" :min="0" :max="12" style="width:100%" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="offerDlg.form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="offerDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="offerDlg.saving" @click="submitOffer">提交录用审批</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { UserFilled, Refresh, Postcard, Tickets, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('onboards');
const recruitTab = ref('reqs');
const loading = ref(false);
const kw = ref('');
const dash = ref(null);
const meta = ref({
  eval_types: [], tf_types: [], rs_types: [], recruit_stages: [], contract_types: [],
  req_types: [], genders: [], sources: [], roles: [], is_hr: false,
});
const staff = ref([]);
const orgs = ref([]);
const rows = reactive({ onboards: [], evaluations: [], transfers: [], resignations: [], contracts: [], reqs: [], candidates: [], offers: [] });

const kpis = computed(() => {
  const c = dash.value && dash.value.cards;
  if (!c) return [];
  return [
    { title: '在职员工', value: c.total, sub: `部门 ${c.dept_count} 个`, icon: UserFilled, color: '#2563eb' },
    { title: '本月入职/离职', value: `${c.this_month_join}/${c.this_month_leave}`, sub: '入职 / 离职', icon: Refresh, color: '#10b981' },
    { title: '在招需求', value: c.recruiting, sub: `待入职 ${c.pending_join} 人`, icon: Postcard, color: '#f59e0b' },
    { title: '待办审批', value: c.transfer_pending + c.offer_pending + c.resigning, sub: `异动${c.transfer_pending}/Offer${c.offer_pending}/离职${c.resigning}`, icon: Tickets, color: '#8b5cf6' },
  ];
});

function statusType(s) {
  const m = { 待审批: 'warning', 待入职: 'primary', 通过: 'success', 已生效: 'success', 已通过: 'success', 驳回: 'danger', 待离职: 'warning', 已离职: 'info' };
  return m[s] || 'info';
}
function contractType(s) {
  const m = { 草稿: 'info', 审批中: 'warning', 已通过: 'success', 已归档: 'info', 已驳回: 'danger' };
  return m[s] || 'info';
}
function reqType(s) {
  const m = { 待审批: 'warning', 招聘中: 'primary', 已关闭: 'info', 驳回: 'danger' };
  return m[s] || 'info';
}
function stageType(s) {
  const m = { 初筛: 'info', 面试: 'primary', 复试: 'primary', 待录用: 'warning', 已录用: 'success', 淘汰: 'danger', 放弃: 'info' };
  return m[s] || 'info';
}
function offerType(s) {
  const m = { 待审批: 'warning', 已通过: 'success', 已入职: 'info', 驳回: 'danger' };
  return m[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/hr-ext/meta');
  if (r.code === 200) meta.value = r.data || meta.value;
  const s = await request.get('/hr-ext/staff');
  if (s.code === 200) staff.value = s.data || [];
  const o = await request.get('/hr-ext/orgs');
  if (o.code === 200) orgs.value = o.data || [];
}
async function loadDash() {
  const r = await request.get('/hr-ext/dashboard', { silent: true });
  if (r.code === 200) dash.value = r.data;
}
async function load(key) {
  loading.value = true;
  try {
    const params = kw.value ? { keyword: kw.value } : {};
    const r = await request.get(`/hr-ext/${key}`, { params });
    rows[key] = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
const TAB_KEY = { onboards: 'onboards', evaluations: 'evaluations', transfers: 'transfers', resignations: 'resignations', contracts: 'contracts' };
const RECRUIT_KEY = { reqs: 'recruit/reqs', candidates: 'recruit/candidates', offers: 'recruit/offers' };
function onTabChange(name) {
  if (TAB_KEY[name]) load(TAB_KEY[name]);
  if (name === 'recruit') load(RECRUIT_KEY[recruitTab.value]);
  if (name === 'perms') loadPerms();
}
function onRecruitTabChange(name) { load(RECRUIT_KEY[name]); }
onMounted(async () => { await loadMeta(); await loadDash(); await load('onboards'); });

/* ---------- 通用审批 ---------- */
async function approve(path, row) {
  try { await ElMessageBox.confirm(`确认审批「${row.onb_no || row.eva_no || row.tf_no || row.rs_no || row.hc_no || row.req_no || row.offer_no}」为通过？`, '审批', { type: 'warning' }); }
  catch (e) { return; }
  const r = await request.post(`${path}/${row.id}/approve`, { result: '通过', comment: '' });
  if (r.code === 200) {
    ElMessage.success(r.msg || '已审批');
    if (TAB_KEY[tab.value]) load(TAB_KEY[tab.value]);
    if (tab.value === 'recruit') load(RECRUIT_KEY[recruitTab.value]);
    loadDash();
  } else ElMessage.error(r.msg || '审批失败');
}

/* ---------- 入职 ---------- */
const onbDlg = reactive({
  visible: false, saving: false,
  form: { name: '', role: '', title: '', org_id: null, gender: '', phone: '', email: '', region: '', hire_date: '', salary: 0, remark: '' },
});
async function submitOnboard() {
  if (!onbDlg.form.name || !onbDlg.form.role) { ElMessage.warning('姓名与角色必填'); return; }
  onbDlg.saving = true;
  const r = await request.post('/hr-ext/onboards', onbDlg.form);
  onbDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); onbDlg.visible = false; load('onboards'); loadDash(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function activate(row) {
  try { await ElMessageBox.confirm(`确认办理「${row.name}」入职？将生成工号并写入花名册。`, '办理入职', { type: 'warning' }); }
  catch (e) { return; }
  const r = await request.post(`/hr-ext/onboards/${row.id}/activate`);
  if (r.code === 200) { ElMessage.success(r.msg || '已办理入职'); load('onboards'); loadDash(); loadMeta(); }
  else ElMessage.error(r.msg || '办理失败');
}

/* ---------- 评价 ---------- */
const evaDlg = reactive({ visible: false, saving: false, form: { emp_id: null, eval_type: '试用期转正', score: 85, comment: '', suggestion: '' } });
async function submitEvaluation() {
  if (!evaDlg.form.emp_id || !evaDlg.form.eval_type) { ElMessage.warning('员工与评价类型必填'); return; }
  evaDlg.saving = true;
  const r = await request.post('/hr-ext/evaluations', evaDlg.form);
  evaDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); evaDlg.visible = false; load('evaluations'); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 异动 ---------- */
const tfDlg = reactive({
  visible: false, saving: false,
  form: { emp_id: null, tf_type: '调岗', dst_org_id: null, dst_title: '', dst_role: '', dst_region: '', new_salary: 0, effective_date: '', reason: '' },
});
function openTransfer() {
  Object.assign(tfDlg.form, { emp_id: null, tf_type: '调岗', dst_org_id: null, dst_title: '', dst_role: '', dst_region: '', new_salary: 0, effective_date: '', reason: '' });
  tfDlg.visible = true;
}
async function submitTransfer() {
  if (!tfDlg.form.emp_id || !tfDlg.form.tf_type) { ElMessage.warning('员工与异动类型必填'); return; }
  tfDlg.saving = true;
  const r = await request.post('/hr-ext/transfers', tfDlg.form);
  tfDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); tfDlg.visible = false; load('transfers'); loadDash(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 离职 ---------- */
const rsDlg = reactive({ visible: false, saving: false, form: { emp_id: null, resign_type: '主动辞职', last_work_date: '', reason: '' } });
function openResign() {
  Object.assign(rsDlg.form, { emp_id: null, resign_type: '主动辞职', last_work_date: '', reason: '' });
  rsDlg.visible = true;
}
async function submitResign() {
  if (!rsDlg.form.resign_type || !rsDlg.form.last_work_date) { ElMessage.warning('离职类型与最后工作日必填'); return; }
  rsDlg.saving = true;
  const r = await request.post('/hr-ext/resignations', rsDlg.form);
  rsDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); rsDlg.visible = false; load('resignations'); loadDash(); }
  else ElMessage.error(r.msg || '提交失败');
}
const hoDlg = reactive({ visible: false, saving: false, id: null, name: '', handover: [], assets: [] });
function openHandover(row) {
  hoDlg.id = row.id; hoDlg.name = row.emp_name || '';
  hoDlg.handover = JSON.parse(JSON.stringify(row.handover || []));
  hoDlg.assets = JSON.parse(JSON.stringify(row.assets || []));
  hoDlg.visible = true;
}
async function submitHandover() {
  hoDlg.saving = true;
  const r = await request.put(`/hr-ext/resignations/${hoDlg.id}/handover`, { handover: hoDlg.handover, assets: hoDlg.assets });
  hoDlg.saving = false;
  if (r.code === 200) { ElMessage.success('交接清单已保存'); hoDlg.visible = false; load('resignations'); }
  else ElMessage.error(r.msg || '保存失败');
}
async function finishResign(row) {
  try { await ElMessageBox.confirm(`确认办理「${row.emp_name}」离职？办理后系统账号将停用。`, '办理离职', { type: 'warning' }); }
  catch (e) { return; }
  const r = await request.post(`/hr-ext/resignations/${row.id}/finish`);
  if (r.code === 200) { ElMessage.success(r.msg || '已办理'); load('resignations'); loadDash(); }
  else ElMessage.error(r.msg || '办理失败');
}

/* ---------- 人事合同 ---------- */
const ctDlg = reactive({
  visible: false, saving: false,
  form: { emp_id: null, contract_type: '新签', start_date: '', end_date: '', probation_months: 3, salary_base: 0, salary_other: '', workplace: '', title: '', content: '' },
});
function openContract() {
  Object.assign(ctDlg.form, { emp_id: null, contract_type: '新签', start_date: '', end_date: '', probation_months: 3, salary_base: 0, salary_other: '', workplace: '', title: '', content: '' });
  ctDlg.visible = true;
}
async function submitContract() {
  if (!ctDlg.form.emp_id || !ctDlg.form.start_date || !ctDlg.form.end_date) { ElMessage.warning('员工与合同起止日期必填'); return; }
  ctDlg.saving = true;
  const r = await request.post('/hr-ext/contracts', ctDlg.form);
  ctDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); ctDlg.visible = false; load('contracts'); }
  else ElMessage.error(r.msg || '提交失败');
}
async function archiveContract(row) {
  const r = await request.post(`/hr-ext/contracts/${row.id}/archive`);
  if (r.code === 200) { ElMessage.success(r.msg || '已归档'); load('contracts'); }
  else ElMessage.error(r.msg || '归档失败');
}

/* ---------- 招聘需求 ---------- */
const reqDlg = reactive({
  visible: false, saving: false,
  form: { title: '', dept_id: null, headcount: 1, req_type: '新增', salary_range: '', need_date: '', job_duty: '', requirement: '' },
});
function openReq() {
  Object.assign(reqDlg.form, { title: '', dept_id: null, headcount: 1, req_type: '新增', salary_range: '', need_date: '', job_duty: '', requirement: '' });
  reqDlg.visible = true;
}
async function submitReq() {
  if (!reqDlg.form.title || !reqDlg.form.dept_id) { ElMessage.warning('岗位与用人部门必填'); return; }
  reqDlg.saving = true;
  const r = await request.post('/hr-ext/recruit/reqs', reqDlg.form);
  reqDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); reqDlg.visible = false; load('recruit/reqs'); loadDash(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function closeReq(row) {
  const r = await request.post(`/hr-ext/recruit/reqs/${row.id}/close`);
  if (r.code === 200) { ElMessage.success(r.msg || '已关闭'); load('recruit/reqs'); loadDash(); }
  else ElMessage.error(r.msg || '关闭失败');
}

/* ---------- 候选人 ---------- */
const candDlg = reactive({
  visible: false, saving: false,
  form: { req_id: null, name: '', gender: '', phone: '', email: '', source: '招聘网站', resume_note: '' },
});
function openCandidate() {
  Object.assign(candDlg.form, { req_id: null, name: '', gender: '', phone: '', email: '', source: '招聘网站', resume_note: '' });
  candDlg.visible = true;
}
async function submitCandidate() {
  if (!candDlg.form.name || !candDlg.form.req_id) { ElMessage.warning('姓名与关联需求必填'); return; }
  candDlg.saving = true;
  const r = await request.post('/hr-ext/recruit/candidates', candDlg.form);
  candDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已录入'); candDlg.visible = false; load('recruit/candidates'); load('recruit/reqs'); }
  else ElMessage.error(r.msg || '提交失败');
}
const stageDlg = reactive({ visible: false, saving: false, id: null, name: '', current: '', stage: '', score: null, evaluation: '' });
const stageOptions = computed(() => (meta.value.recruit_stages || []).filter((s) => !['已录用', '淘汰', '放弃'].includes(s)));
function openStage(row) {
  stageDlg.id = row.id; stageDlg.name = row.name; stageDlg.current = row.stage;
  stageDlg.stage = ''; stageDlg.score = row.score; stageDlg.evaluation = row.evaluation || '';
  stageDlg.visible = true;
}
async function submitStage() {
  if (!stageDlg.stage) { ElMessage.warning('请选择目标阶段'); return; }
  stageDlg.saving = true;
  const r = await request.put(`/hr-ext/recruit/candidates/${stageDlg.id}/stage`, {
    stage: stageDlg.stage, score: stageDlg.score, evaluation: stageDlg.evaluation,
  });
  stageDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已流转'); stageDlg.visible = false; load('recruit/candidates'); }
  else ElMessage.error(r.msg || '流转失败');
}

/* ---------- Offer ---------- */
const offerDlg = reactive({
  visible: false, saving: false, candId: null, name: '',
  form: { title: '', role: '', dept_id: null, region: '', hire_date: '', salary_base: 0, probation_months: 3, remark: '' },
});
function openOffer(row) {
  offerDlg.candId = row.id; offerDlg.name = row.name;
  Object.assign(offerDlg.form, { title: row.req_title || '', role: '', dept_id: null, region: '', hire_date: '', salary_base: 0, probation_months: 3, remark: '' });
  offerDlg.visible = true;
}
async function submitOffer() {
  if (!offerDlg.form.title || !offerDlg.form.role) { ElMessage.warning('录用岗位与角色必填'); return; }
  offerDlg.saving = true;
  const r = await request.post('/hr-ext/recruit/offers', { cand_id: offerDlg.candId, ...offerDlg.form });
  offerDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交录用审批'); offerDlg.visible = false; load('recruit/offers'); load('recruit/candidates'); loadDash(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 员工权限 ---------- */
const permEmpId = ref(null);
const permRows = ref([]);
const permLoading = ref(false);
async function loadPerms() {
  if (!permEmpId.value) { permRows.value = []; return; }
  permLoading.value = true;
  try {
    const r = await request.get('/hr-ext/permissions', { params: { emp_id: permEmpId.value } });
    permRows.value = r.code === 200 ? (r.data.rows || []) : [];
  } finally { permLoading.value = false; }
}
async function setPerm(row, field, val) {
  const r = await request.put(`/hr-ext/permissions/${permEmpId.value}/${row.module}`, { [field]: val });
  if (r.code === 200) { ElMessage.success('权限已更新'); loadPerms(); }
  else ElMessage.error(r.msg || '更新失败');
}
async function clearPerm(row) {
  const r = await request.delete(`/hr-ext/permissions/${permEmpId.value}/${row.module}`);
  if (r.code === 200) { ElMessage.success(r.msg || '已恢复默认'); loadPerms(); }
  else ElMessage.error(r.msg || '操作失败');
}
</script>

<style scoped>
.hr-ext { padding: 20px; }
.muted { color: #909399; }
.good { color: #10b981; }
.warn { color: #f59e0b; }
.bad { color: #ef4444; }
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
.section-title { margin: 12px 0 8px; font-size: 13px; font-weight: 600; }
.ho-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.el-form-item { margin-bottom: 12px; }
</style>
