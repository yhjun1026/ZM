<template>
  <div class="bid">
    <div class="page-header">
      <h2>招投标管理</h2>
      <p>投标立项 → 标书制作 → 章节编制 → 内部评审 → 文件递交 → 开标结果 → 中标联动商机赢单</p>
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

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <!-- ============ 项目台账 ============ -->
      <el-tab-pane label="项目台账" name="proj">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="filter.stage" placeholder="全部阶段" style="width:130px" clearable @change="loadBids">
              <el-option v-for="s in opts.stages" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select v-model="filter.result" placeholder="全部结果" style="width:130px" clearable @change="loadBids">
              <el-option v-for="s in opts.results" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="filter.keyword" placeholder="搜索投标编号/项目名称" style="width:230px" clearable @change="loadBids" />
          </div>
          <el-button type="primary" @click="openProj()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增投标立项
          </el-button>
        </div>

        <el-table :data="bids" stripe size="small" v-loading="loading.bid">
          <el-table-column prop="bid_no" label="投标编号" width="180" />
          <el-table-column prop="project_name" label="项目名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="tenderee" label="招标单位" width="150" show-overflow-tooltip />
          <el-table-column label="投标金额(万)" width="110" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <el-table-column prop="budget" label="招标预算" width="100" show-overflow-tooltip />
          <el-table-column label="投标截止" width="110">
            <template #default="{ row }">{{ row.deadline || '—' }}</template>
          </el-table-column>
          <el-table-column label="开标时间" width="110">
            <template #default="{ row }">{{ row.open_time || '—' }}</template>
          </el-table-column>
          <el-table-column label="阶段" width="100">
            <template #default="{ row }"><el-tag :type="stageType(row.stage)" size="small">{{ row.stage }}</el-tag></template>
          </el-table-column>
          <el-table-column label="结果" width="90">
            <template #default="{ row }"><el-tag :type="resultType(row.result)" size="small" effect="plain">{{ row.result }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="owner_name" label="负责人" width="90" />
          <el-table-column label="操作" width="300" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openStage(row)">推进</el-button>
              <el-button size="small" type="success" @click="openResult(row)">结果</el-button>
              <el-button size="small" @click="openProj(row)">编辑</el-button>
              <el-button size="small" type="info" @click="showBid(row)">详情</el-button>
              <el-button size="small" type="danger" @click="delBid(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无投标项目，点击右上角「新增投标立项」创建</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 标书文档 ============ -->
      <el-tab-pane label="标书文档" name="doc">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="curBidId" placeholder="选择投标项目" style="width:280px" clearable @change="loadDocs">
              <el-option v-for="b in bids" :key="b.id" :label="b.bid_no + ' · ' + b.project_name" :value="b.id" />
            </el-select>
            <el-select v-model="filter.docStatus" placeholder="全部状态" style="width:130px" clearable @change="loadDocs">
              <el-option v-for="s in opts.docStatus" :key="s" :label="s" :value="s" />
            </el-select>
          </div>
          <el-button type="primary" @click="openDoc()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增分册
          </el-button>
        </div>
        <el-table :data="docs" stripe size="small" v-loading="loading.doc">
          <el-table-column prop="doc_no" label="任务编号" width="180" />
          <el-table-column prop="project_name" label="投标项目" min-width="160" show-overflow-tooltip />
          <el-table-column prop="doc_type" label="分册类型" width="110" />
          <el-table-column prop="owner_name" label="负责人" width="90" />
          <el-table-column prop="due_date" label="完成截止" width="110" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="docStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="进度" width="150">
            <template #default="{ row }"><el-progress :percentage="row.progress || 0" :stroke-width="12" /></template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openDocProgress(row)">更新</el-button>
              <el-button size="small" type="danger" @click="delDoc(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无标书制作任务</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 章节编辑 ============ -->
      <el-tab-pane label="章节编辑" name="sec">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <el-select v-model="curBidId" placeholder="选择投标项目" style="width:280px" clearable @change="loadSections">
              <el-option v-for="b in bids" :key="b.id" :label="b.bid_no + ' · ' + b.project_name" :value="b.id" />
            </el-select>
            <el-select v-model="frameworkType" placeholder="标书类别" style="width:120px">
              <el-option v-for="t in opts.bidTypes" :key="t" :label="t + '类'" :value="t" />
            </el-select>
            <el-button @click="genFramework">
              <el-icon style="margin-right:4px"><MagicStick /></el-icon>生成标书框架
            </el-button>
          </div>
          <el-button type="primary" @click="openSection()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增章节
          </el-button>
        </div>
        <el-table :data="sections" stripe size="small" v-loading="loading.sec">
          <el-table-column prop="seq" label="序" width="55" />
          <el-table-column prop="section_no" label="章节号" width="90" />
          <el-table-column prop="title" label="章节标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="sec_type" label="类型" width="95" />
          <el-table-column label="正文(字)" width="90" align="right">
            <template #default="{ row }">{{ row.content_len || 0 }}</template>
          </el-table-column>
          <el-table-column label="引用知识" width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ kbTitle(row.ref_knowledge) || '—' }}</template>
          </el-table-column>
          <el-table-column prop="updated_by_name" label="最后编辑" width="90" />
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openSection(row)">编辑</el-button>
              <el-button size="small" type="success" @click="openKbApply(row)">引用知识库</el-button>
              <el-button size="small" type="danger" @click="delSection(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无章节，可先「生成标书框架」自动生成标准章节树</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 知识库 ============ -->
      <el-tab-pane label="知识库" name="kb">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="filter.kbCategory" placeholder="全部分类" style="width:120px" clearable @change="loadKnowledge">
              <el-option v-for="c in opts.kbCategories" :key="c" :label="c" :value="c" />
            </el-select>
            <el-input v-model="filter.kbKeyword" placeholder="搜索标题/内容/标签" style="width:230px" clearable @change="loadKnowledge" />
          </div>
          <div style="display:flex;gap:8px;">
            <el-button @click="seedKb">
              <el-icon style="margin-right:4px"><Refresh /></el-icon>一键补种内置条目
            </el-button>
            <el-button type="primary" @click="openKb()">
              <el-icon style="margin-right:4px"><Plus /></el-icon>新增条目
            </el-button>
          </div>
        </div>
        <el-table :data="knowledge" stripe size="small" v-loading="loading.kb">
          <el-table-column label="分类" width="80">
            <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.category }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="topic" label="主题" width="110" show-overflow-tooltip />
          <el-table-column prop="title" label="标题" min-width="240" show-overflow-tooltip />
          <el-table-column label="正文(字)" width="90" align="right">
            <template #default="{ row }">{{ row.content_len || 0 }}</template>
          </el-table-column>
          <el-table-column prop="tags" label="标签" width="160" show-overflow-tooltip />
          <el-table-column label="来源" width="80">
            <template #default="{ row }">{{ row.builtin ? '内置' : '自定义' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="info" @click="showKb(row)">查看</el-button>
              <el-button size="small" type="primary" @click="openKb(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="delKb(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无知识条目，可点击「一键补种内置条目」导入 47 条现行招标要点</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 评审 ============ -->
      <el-tab-pane label="标书评审" name="rev">
        <div class="tab-toolbar">
          <el-select v-model="curBidId" placeholder="选择投标项目" style="width:280px" clearable @change="loadReviews">
            <el-option v-for="b in bids" :key="b.id" :label="b.bid_no + ' · ' + b.project_name" :value="b.id" />
          </el-select>
          <el-button type="primary" @click="openReview">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增评审
          </el-button>
        </div>
        <el-table :data="reviews" stripe size="small" v-loading="loading.rev">
          <el-table-column prop="project_name" label="投标项目" min-width="180" show-overflow-tooltip />
          <el-table-column prop="reviewer_name" label="评审人" width="90" />
          <el-table-column prop="reviewer_role" label="角色" width="100" />
          <el-table-column label="评分" width="80" align="right">
            <template #default="{ row }"><b>{{ row.score === null ? '—' : row.score }}</b></template>
          </el-table-column>
          <el-table-column label="结论" width="110">
            <template #default="{ row }">
              <el-tag :type="conclusionType(row.conclusion)" size="small">{{ row.conclusion || '—' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="comment" label="评审意见" min-width="220" show-overflow-tooltip />
          <el-table-column prop="file_name" label="关联文件" width="140" show-overflow-tooltip />
          <el-table-column label="时间" width="140">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="danger" @click="delReview(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无评审记录</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 投标文件 ============ -->
      <el-tab-pane label="投标文件" name="file">
        <div class="tab-toolbar">
          <el-select v-model="curBidId" placeholder="选择投标项目" style="width:280px" clearable @change="loadFiles">
            <el-option v-for="b in bids" :key="b.id" :label="b.bid_no + ' · ' + b.project_name" :value="b.id" />
          </el-select>
          <span class="muted" style="font-size:12px;">选择项目后可拖拽上传标书文件（PDF/Word，≤20MB）</span>
        </div>
        <el-upload
          v-if="curBidId"
          drag
          :action="uploadAction"
          :headers="uploadHeaders"
          :data="uploadData"
          :show-file-list="true"
          style="margin-bottom:12px;"
          :on-success="onUploadOk"
          :on-error="onUploadFail">
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">将标书文件拖到此处，或<em>点击上传</em></div>
        </el-upload>
        <el-table :data="files" stripe size="small" v-loading="loading.file">
          <el-table-column prop="file_no" label="文件编号" width="180" />
          <el-table-column prop="project_name" label="投标项目" min-width="150" show-overflow-tooltip />
          <el-table-column prop="file_name" label="文件名" min-width="180" show-overflow-tooltip />
          <el-table-column prop="doc_type" label="类型" width="100" />
          <el-table-column label="版本" width="70">
            <template #default="{ row }">V{{ row.version || 1 }}</template>
          </el-table-column>
          <el-table-column label="大小" width="90">
            <template #default="{ row }">{{ sizeText(row.file_size) }}</template>
          </el-table-column>
          <el-table-column prop="uploaded_name" label="上传人" width="90" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="fileStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="上传时间" width="140">
            <template #default="{ row }">{{ (row.uploaded_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="info" :disabled="!row.file_path" @click="downloadFile(row)">下载</el-button>
              <el-button size="small" type="warning" @click="openReupload(row)">整改重传</el-button>
              <el-button size="small" type="danger" @click="delFile(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无投标文件</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 查看授权 ============ -->
      <el-tab-pane label="查看授权" name="grant">
        <div class="tab-toolbar">
          <el-select v-model="curBidId" placeholder="选择投标项目" style="width:280px" clearable @change="loadGrants">
            <el-option v-for="b in bids" :key="b.id" :label="b.bid_no + ' · ' + b.project_name" :value="b.id" />
          </el-select>
          <el-button type="primary" @click="openGrant">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增授权
          </el-button>
        </div>
        <el-table :data="grants" stripe size="small" v-loading="loading.grant">
          <el-table-column prop="project_name" label="投标项目" min-width="180" show-overflow-tooltip />
          <el-table-column prop="emp_name" label="被授权人" width="110" />
          <el-table-column prop="reason" label="授权事由" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? '已生效' : '已停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="授权时间" width="140">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" :type="row.active ? 'warning' : 'success'" @click="toggleGrant(row)">
                {{ row.active ? '停用' : '启用' }}
              </el-button>
              <el-button size="small" type="danger" @click="delGrant(row)">撤销</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无授权记录（白名单角色可直接查看，其余人员需在此授权）</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 投标项目 新增/编辑 -->
    <el-dialog v-model="projDlg.visible" :title="projDlg.id ? '编辑投标项目' : '新增投标立项'" width="640px">
      <el-form label-width="110px" size="small">
        <el-form-item label="项目名称" required>
          <el-input v-model="projDlg.form.project_name" placeholder="如：遂宁中心医院彩超采购项目" />
        </el-form-item>
        <el-form-item label="关联商机">
          <el-select v-model="projDlg.form.opp_id" filterable clearable placeholder="可选，投标项目来源于商机" style="width:100%">
            <el-option v-for="o in opps" :key="o.id" :label="o.opp_no + ' · ' + o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="招标单位">
          <el-input v-model="projDlg.form.tenderee" placeholder="招标人/采购人" />
        </el-form-item>
        <el-form-item label="招标编号">
          <el-input v-model="projDlg.form.tender_no" />
        </el-form-item>
        <el-form-item label="投标金额(万)" required>
          <el-input-number v-model="projDlg.form.amount" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="招标预算">
          <el-input v-model="projDlg.form.budget" placeholder="如：350万" />
        </el-form-item>
        <el-form-item label="投标截止">
          <el-date-picker v-model="projDlg.form.deadline" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="开标时间">
          <el-date-picker v-model="projDlg.form.open_time" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="保证金">
          <el-input v-model="projDlg.form.bond" placeholder="如：7万 / 保函" />
        </el-form-item>
        <el-form-item label="标书类别">
          <el-select v-model="projDlg.form.bid_type" style="width:100%">
            <el-option v-for="t in opts.bidTypes" :key="t" :label="t + '类'" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目负责人">
          <el-select v-model="projDlg.form.owner_id" filterable clearable placeholder="默认当前用户" style="width:100%">
            <el-option v-for="p in people" :key="p.id" :label="p.name + '（' + p.role + '）'" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="projDlg.form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="projDlg.saving" @click="submitProj">提交</el-button>
      </template>
    </el-dialog>

    <!-- 阶段推进 -->
    <el-dialog v-model="stageDlg.visible" title="阶段推进" width="440px">
      <p class="muted" style="margin-bottom:12px;">
        当前阶段：<el-tag size="small">{{ stageDlg.current }}</el-tag>
        <span v-if="nextStage"> → 下一阶段：<el-tag type="success" size="small">{{ nextStage }}</el-tag></span>
        <span v-else>（已到终点，请登记开标结果）</span>
      </p>
      <el-form-item label="目标阶段">
        <el-select v-model="stageDlg.stage" style="width:100%">
          <el-option v-for="s in stageOptions" :key="s" :label="s" :value="s" />
        </el-select>
      </el-form-item>
      <template #footer>
        <el-button @click="stageDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="stageDlg.saving" @click="submitStage">确认推进</el-button>
      </template>
    </el-dialog>

    <!-- 开标结果 -->
    <el-dialog v-model="resultDlg.visible" title="开标结果登记" width="440px">
      <el-form-item label="开标结果">
        <el-select v-model="resultDlg.result" style="width:100%">
          <el-option v-for="s in opts.results" :key="s" :label="s" :value="s" />
        </el-select>
      </el-form-item>
      <el-form-item label="开标日期">
        <el-date-picker v-model="resultDlg.bid_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="resultDlg.remark" type="textarea" :rows="2" placeholder="选填；登记「已中标」将联动商机推进至赢单" />
      </el-form-item>
      <template #footer>
        <el-button @click="resultDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="resultDlg.saving" @click="submitResult">确认登记</el-button>
      </template>
    </el-dialog>

    <!-- 标书分册 -->
    <el-dialog v-model="docDlg.visible" title="新增标书分册" width="480px">
      <el-form label-width="100px" size="small">
        <el-form-item label="投标项目" required>
          <el-select v-model="docDlg.form.bid_id" filterable style="width:100%">
            <el-option v-for="b in bids" :key="b.id" :label="b.bid_no + ' · ' + b.project_name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分册类型" required>
          <el-select v-model="docDlg.form.doc_type" style="width:100%">
            <el-option v-for="t in opts.docTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="编制负责人">
          <el-select v-model="docDlg.form.owner_id" filterable clearable placeholder="默认当前用户" style="width:100%">
            <el-option v-for="p in people" :key="p.id" :label="p.name + '（' + p.role + '）'" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="完成截止">
          <el-date-picker v-model="docDlg.form.due_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="docDlg.form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="docDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="docDlg.saving" @click="submitDoc">提交</el-button>
      </template>
    </el-dialog>

    <!-- 标书任务状态/进度 -->
    <el-dialog v-model="docProDlg.visible" title="更新标书任务" width="440px">
      <p class="muted" style="margin-bottom:12px;">任务：{{ docProDlg.doc_no }}（{{ docProDlg.doc_type }}）</p>
      <el-form-item label="任务状态">
        <el-select v-model="docProDlg.status" style="width:100%">
          <el-option v-for="s in opts.docStatus" :key="s" :label="s" :value="s" />
        </el-select>
      </el-form-item>
      <el-form-item label="完成进度">
        <el-slider v-model="docProDlg.progress" :min="0" :max="100" show-input />
      </el-form-item>
      <p class="muted" style="font-size:12px;">全部册定稿后，投标项目将自动推进至「已投标」</p>
      <template #footer>
        <el-button @click="docProDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="docProDlg.saving" @click="submitDocProgress">保存</el-button>
      </template>
    </el-dialog>

    <!-- 章节编辑 -->
    <el-dialog v-model="secDlg.visible" :title="secDlg.id ? '编辑章节' : '新增章节'" width="760px">
      <el-form label-width="90px" size="small">
        <el-form-item label="章节标题" required>
          <el-input v-model="secDlg.form.title" placeholder="如：售后服务方案（含质保承诺）" />
        </el-form-item>
        <div style="display:flex;gap:8px;">
          <el-form-item label="章节类型" style="flex:1;">
            <el-select v-model="secDlg.form.sec_type" style="width:100%">
              <el-option v-for="t in opts.secTypes" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
          <el-form-item label="章节号" style="flex:1;">
            <el-input v-model="secDlg.form.section_no" placeholder="如 6.1" />
          </el-form-item>
          <el-form-item label="排序" style="flex:1;">
            <el-input-number v-model="secDlg.form.seq" :min="1" style="width:100%" />
          </el-form-item>
        </div>
        <el-form-item label="章节正文">
          <el-input v-model="secDlg.form.content" type="textarea" :rows="12" placeholder="可直接编写，或用「引用知识库」一键预填现行招标要点" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="secDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="secDlg.saving" @click="submitSection">保存</el-button>
      </template>
    </el-dialog>

    <!-- 引用知识库 -->
    <el-dialog v-model="kbApplyDlg.visible" :title="'引用知识库 · ' + kbApplyDlg.secTitle" width="720px">
      <el-form-item label="知识条目">
        <el-select v-model="kbApplyDlg.knowledge_id" filterable placeholder="选择知识库条目" style="width:100%">
          <el-option v-for="k in knowledge" :key="k.id" :label="k.category + ' · ' + k.title" :value="k.id" />
        </el-select>
      </el-form-item>
      <div class="kb-preview" v-if="kbApplyPreview">{{ kbApplyPreview }}</div>
      <template #footer>
        <el-button @click="kbApplyDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="kbApplyDlg.saving" @click="submitKbApply">填充到章节</el-button>
      </template>
    </el-dialog>

    <!-- 知识库条目 -->
    <el-dialog v-model="kbDlg.visible" :title="kbDlg.id ? '编辑知识条目' : '新增知识条目'" width="720px">
      <el-form label-width="80px" size="small">
        <div style="display:flex;gap:8px;">
          <el-form-item label="分类" style="flex:1;">
            <el-select v-model="kbDlg.form.category" style="width:100%">
              <el-option v-for="c in opts.kbCategories" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
          <el-form-item label="主题" style="flex:1;">
            <el-input v-model="kbDlg.form.topic" placeholder="如：技术响应" />
          </el-form-item>
        </div>
        <el-form-item label="标题" required>
          <el-input v-model="kbDlg.form.title" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="kbDlg.form.tags" placeholder="逗号分隔，如：报价,含税" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="kbDlg.form.content" type="textarea" :rows="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="kbDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="kbDlg.saving" @click="submitKb">保存</el-button>
      </template>
    </el-dialog>

    <!-- 评审 -->
    <el-dialog v-model="revDlg.visible" title="新增标书评审" width="560px">
      <el-form label-width="90px" size="small">
        <el-form-item label="投标项目" required>
          <el-select v-model="revDlg.bid_id" filterable style="width:100%">
            <el-option v-for="b in bids" :key="b.id" :label="b.bid_no + ' · ' + b.project_name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联文件">
          <el-select v-model="revDlg.form.file_id" filterable clearable placeholder="可选" style="width:100%">
            <el-option v-for="f in files" :key="f.id" :label="f.file_name" :value="f.id" />
          </el-select>
        </el-form-item>
        <div style="display:flex;gap:8px;">
          <el-form-item label="评分" style="flex:1;">
            <el-input-number v-model="revDlg.form.score" :min="0" :max="100" style="width:100%" />
          </el-form-item>
          <el-form-item label="结论" style="flex:1;">
            <el-select v-model="revDlg.form.conclusion" style="width:100%">
              <el-option v-for="c in opts.conclusions" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="评审意见" required>
          <el-input v-model="revDlg.form.comment" type="textarea" :rows="4" placeholder="如：报价与分项表不一致，需复核" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="revDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="revDlg.saving" @click="submitReview">提交评审</el-button>
      </template>
    </el-dialog>

    <!-- 整改重传 -->
    <el-dialog v-model="reDlg.visible" title="标书整改重传" width="560px">
      <p class="muted" style="margin-bottom:12px;">当前：{{ reDlg.file_name }}（V{{ reDlg.version }}）→ 重传后版本 V{{ (reDlg.version || 1) + 1 }}</p>
      <el-form label-width="90px" size="small">
        <el-form-item label="文件名" required>
          <el-input v-model="reDlg.form.file_name" />
        </el-form-item>
        <el-form-item label="新附件">
          <el-upload :auto-upload="false" :limit="1" :on-change="(f) => (reDlg.file = f.raw)">
            <el-button size="small" type="primary">选择文件</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="正文/说明">
          <el-input v-model="reDlg.form.content" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="reDlg.saving" @click="submitReupload">提交重传</el-button>
      </template>
    </el-dialog>

    <!-- 查看授权 -->
    <el-dialog v-model="grantDlg.visible" title="新增查看授权" width="520px">
      <el-form label-width="100px" size="small">
        <el-form-item label="投标项目" required>
          <el-select v-model="grantDlg.bid_id" filterable style="width:100%">
            <el-option v-for="b in bids" :key="b.id" :label="b.bid_no + ' · ' + b.project_name" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="授权方式">
          <el-radio-group v-model="grantDlg.mode">
            <el-radio label="person">按人</el-radio>
            <el-radio label="role">按角色</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="被授权人" v-if="grantDlg.mode === 'person'">
          <el-select v-model="grantDlg.form.emp_id" filterable style="width:100%">
            <el-option v-for="p in people" :key="p.id" :label="p.name + '（' + p.role + '）'" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色" v-else>
          <el-select v-model="grantDlg.form.role" style="width:100%">
            <el-option v-for="r in roleList" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="授权事由">
          <el-input v-model="grantDlg.form.reason" type="textarea" :rows="2" placeholder="如：配合技术标编制" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="grantDlg.saving" @click="submitGrant">确认授权</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Trophy, Loading, CircleCheck, CircleClose, Document, Collection, Plus, MagicStick, Refresh, UploadFilled,
} from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('proj');
const stats = ref(null);
const bids = ref([]);
const docs = ref([]);
const sections = ref([]);
const knowledge = ref([]);
const reviews = ref([]);
const files = ref([]);
const grants = ref([]);
const people = ref([]);
const opps = ref([]);
const curBidId = ref(null);
const frameworkType = ref('货物');
const loading = reactive({ bid: false, doc: false, sec: false, kb: false, rev: false, file: false, grant: false });
const filter = reactive({ stage: '', result: '', keyword: '', docStatus: '', kbCategory: '', kbKeyword: '' });
const opts = reactive({
  stages: [], flowStages: [], results: [], docTypes: [], docStatus: [], secTypes: [],
  bidTypes: [], kbCategories: [], conclusions: [], canEdit: false,
});

const emptyProj = () => ({
  project_name: '', opp_id: null, tenderee: '', tender_no: '', amount: 0, budget: '',
  deadline: '', open_time: '', bond: '', bid_type: '货物', owner_id: null, remark: '',
});

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '投标总数', value: s.total, sub: `金额合计 ${s.amount} 万`, icon: Trophy, color: '#2563eb' },
    { title: '进行中', value: s.running, sub: '未开标的在途项目', icon: Loading, color: '#f59e0b' },
    { title: '已中标', value: s.won, sub: `中标金额 ${s.won_amount} 万`, icon: CircleCheck, color: '#10b981' },
    { title: '中标率', value: s.win_rate + '%', sub: `未中标/放弃 ${s.lost} 个`, icon: CircleClose, color: '#8b5cf6' },
    { title: '标书任务', value: s.doc_tasks, sub: `未定稿 ${s.doc_open} 个`, icon: Document, color: '#0891b2' },
    { title: '章节/知识', value: `${s.sections}/${s.knowledge}`, sub: `投标文件 ${s.files} 份`, icon: Collection, color: '#ea580c' },
  ];
});

const roleList = computed(() => [...new Set(people.value.map((p) => p.role).filter(Boolean))]);
const kbMap = computed(() => {
  const m = {};
  knowledge.value.forEach((k) => { m[k.id] = k.title; });
  return m;
});
const kbTitle = (id) => (id ? kbMap.value[id] || '—' : '');

function stageType(s) {
  const map = { 立项跟踪: 'info', 标书制作: 'primary', 已投标: 'warning', 待开标: 'warning', 已中标: 'success', 未中标: 'danger', 已放弃: 'info' };
  return map[s] || 'info';
}
function resultType(s) {
  const map = { 待开标: 'warning', 已中标: 'success', 未中标: 'danger', 已放弃: 'info' };
  return map[s] || 'info';
}
function docStatusType(s) {
  const map = { 待启动: 'info', 编写中: 'primary', 内部评审: 'warning', 已定稿: 'success' };
  return map[s] || 'info';
}
function conclusionType(s) {
  const map = { 通过: 'success', 修改后通过: 'warning', 不通过: 'danger', 待定: 'info' };
  return map[s] || 'info';
}
function fileStatusType(s) {
  const map = { 待审阅: 'warning', 已通过: 'success', 需整改: 'danger' };
  return map[s] || 'info';
}
function sizeText(n) {
  if (!n) return '—';
  return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

/* ---------------- 数据加载 ---------------- */
async function loadOptions() {
  const r = await request.get('/bid/options');
  if (r.code === 200) Object.assign(opts, {
    stages: r.data.stages || [],
    flowStages: r.data.flow_stages || [],
    results: r.data.results || [],
    docTypes: r.data.doc_types || [],
    docStatus: r.data.doc_status || [],
    secTypes: r.data.sec_types || [],
    bidTypes: r.data.bid_types || [],
    kbCategories: r.data.kb_categories || [],
    conclusions: r.data.review_conclusions || ['通过', '修改后通过', '不通过', '待定'],
    canEdit: !!r.data.can_edit,
  });
}
async function loadPeople() {
  const r = await request.get('/bid/people');
  if (r.code === 200) people.value = r.data || [];
}
async function loadOpps() {
  const r = await request.get('/opportunity');
  if (r.code === 200) opps.value = r.data || [];
}
async function loadStats() {
  const r = await request.get('/bid/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadBids() {
  loading.bid = true;
  try {
    const params = {};
    ['stage', 'result', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/bid', { params });
    bids.value = r.code === 200 ? r.data || [] : [];
    if (!curBidId.value && bids.value.length) { curBidId.value = bids.value[0].id; loadByTab(); }
  } finally { loading.bid = false; }
}
async function loadDocs() {
  loading.doc = true;
  try {
    const params = {};
    if (curBidId.value) params.bid_id = curBidId.value;
    if (filter.docStatus) params.status = filter.docStatus;
    const r = await request.get('/bid/docs', { params });
    docs.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.doc = false; }
}
async function loadSections() {
  loading.sec = true;
  try {
    if (!curBidId.value) { sections.value = []; return; }
    const r = await request.get('/bid/sections', { params: { bid_id: curBidId.value } });
    sections.value = r.code === 200 ? (r.data.sections || []) : [];
  } finally { loading.sec = false; }
}
async function loadKnowledge() {
  loading.kb = true;
  try {
    const params = {};
    if (filter.kbCategory) params.category = filter.kbCategory;
    if (filter.kbKeyword) params.q = filter.kbKeyword;
    const r = await request.get('/bid/knowledge', { params });
    knowledge.value = r.code === 200 ? (r.data.rows || []) : [];
  } finally { loading.kb = false; }
}
async function loadReviews() {
  loading.rev = true;
  try {
    const params = {};
    if (curBidId.value) params.bid_id = curBidId.value;
    const r = await request.get('/bid/reviews', { params });
    reviews.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.rev = false; }
}
async function loadFiles() {
  loading.file = true;
  try {
    const params = {};
    if (curBidId.value) params.bid_id = curBidId.value;
    const r = await request.get('/bid/files', { params });
    files.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.file = false; }
}
async function loadGrants() {
  loading.grant = true;
  try {
    const params = {};
    if (curBidId.value) params.bid_id = curBidId.value;
    const r = await request.get('/bid/grants', { params });
    grants.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.grant = false; }
}
function loadByTab() {
  if (tab.value === 'doc') loadDocs();
  else if (tab.value === 'sec') loadSections();
  else if (tab.value === 'kb') loadKnowledge();
  else if (tab.value === 'rev') loadReviews();
  else if (tab.value === 'file') loadFiles();
  else if (tab.value === 'grant') loadGrants();
}
function onTabChange() { loadByTab(); }

onMounted(async () => {
  await loadOptions();
  await loadPeople();
  await loadOpps();
  await loadStats();
  await loadBids();
  await loadKnowledge();
  loadByTab();
});

/* ---------------- 投标项目 ---------------- */
const projDlg = reactive({ visible: false, saving: false, id: null, form: emptyProj() });
function openProj(row) {
  projDlg.id = row ? row.id : null;
  projDlg.form = row
    ? {
      project_name: row.project_name, opp_id: row.opp_id || null, tenderee: row.tenderee, tender_no: row.tender_no,
      amount: row.amount, budget: row.budget, deadline: row.deadline, open_time: row.open_time, bond: row.bond,
      bid_type: row.bid_type || '货物', owner_id: row.owner_id || null, remark: row.remark,
    }
    : emptyProj();
  projDlg.visible = true;
}
async function submitProj() {
  if (!projDlg.form.project_name || !projDlg.form.amount) { ElMessage.warning('项目名称与投标金额必填'); return; }
  projDlg.saving = true;
  const r = projDlg.id
    ? await request.put(`/bid/${projDlg.id}`, projDlg.form)
    : await request.post('/bid', projDlg.form);
  projDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); projDlg.visible = false; loadBids(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}
async function delBid(row) {
  await ElMessageBox.confirm(`确认删除投标项目「${row.project_name || row.bid_no}」？章节/文件/评审/授权将一并清理`, '删除确认', { type: 'warning' })
    .then(async () => {
      const r = await request.delete(`/bid/${row.id}`);
      if (r.code === 200) { ElMessage.success('已删除'); curBidId.value = null; loadBids(); loadStats(); }
      else ElMessage.error(r.msg || '删除失败');
    })
    .catch(() => {});
}
function showBid(row) {
  const lines = [
    ['投标编号', row.bid_no], ['项目名称', row.project_name], ['招标单位', row.tenderee],
    ['招标编号', row.tender_no], ['关联商机', row.opp_name ? `${row.opp_no} ${row.opp_name}` : '—'],
    ['投标金额(万)', row.amount], ['招标预算', row.budget], ['保证金', row.bond],
    ['投标截止', row.deadline], ['开标时间', row.open_time],
    ['阶段', row.stage], ['开标结果', row.result], ['标书类别', row.bid_type], ['项目负责人', row.owner_name], ['备注', row.remark],
  ];
  ElMessageBox.alert(
    lines.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0"><span style="color:#909399">${k}</span><b>${v || '—'}</b></div>`).join(''),
    '投标项目详情', { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
  );
}

/* ---------------- 阶段推进 / 开标结果 ---------------- */
const stageDlg = reactive({ visible: false, saving: false, id: null, current: '', stage: '' });
const nextStage = computed(() => {
  const i = opts.flowStages.indexOf(stageDlg.current);
  return i >= 0 && i < opts.flowStages.length - 1 ? opts.flowStages[i + 1] : '';
});
const stageOptions = computed(() => {
  const i = opts.flowStages.indexOf(stageDlg.current);
  return i >= 0 ? opts.flowStages.slice(i + 1) : [];
});
function openStage(row) {
  stageDlg.id = row.id;
  stageDlg.current = row.stage;
  stageDlg.stage = nextStage.value || '';
  stageDlg.visible = true;
}
async function submitStage() {
  if (!stageDlg.stage) { ElMessage.warning('请选择目标阶段'); return; }
  stageDlg.saving = true;
  const r = await request.put(`/bid/${stageDlg.id}/stage`, { stage: stageDlg.stage });
  stageDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已推进'); stageDlg.visible = false; loadBids(); }
  else ElMessage.error(r.msg || '推进失败');
}

const resultDlg = reactive({ visible: false, saving: false, id: null, result: '已中标', bid_date: '', remark: '' });
function openResult(row) {
  resultDlg.id = row.id;
  resultDlg.result = row.result || '待开标';
  resultDlg.bid_date = row.open_time || row.bid_date || '';
  resultDlg.remark = '';
  resultDlg.visible = true;
}
async function submitResult() {
  resultDlg.saving = true;
  const r = await request.put(`/bid/${resultDlg.id}/result`, {
    result: resultDlg.result, bid_date: resultDlg.bid_date, remark: resultDlg.remark,
  });
  resultDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已登记'); resultDlg.visible = false; loadBids(); loadStats(); }
  else ElMessage.error(r.msg || '登记失败');
}

/* ---------------- 标书文档 ---------------- */
const docDlg = reactive({
  visible: false, saving: false,
  form: { bid_id: null, doc_type: '商务标', owner_id: null, due_date: '', remark: '' },
});
function openDoc() {
  docDlg.form = { bid_id: curBidId.value, doc_type: '商务标', owner_id: null, due_date: '', remark: '' };
  docDlg.visible = true;
}
async function submitDoc() {
  if (!docDlg.form.bid_id) { ElMessage.warning('请选择投标项目'); return; }
  docDlg.saving = true;
  const r = await request.post('/bid/docs', docDlg.form);
  docDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已创建'); docDlg.visible = false; loadDocs(); loadStats(); }
  else ElMessage.error(r.msg || '创建失败');
}
const docProDlg = reactive({ visible: false, saving: false, id: null, doc_no: '', doc_type: '', status: '编写中', progress: 0 });
function openDocProgress(row) {
  docProDlg.id = row.id;
  docProDlg.doc_no = row.doc_no;
  docProDlg.doc_type = row.doc_type;
  docProDlg.status = row.status;
  docProDlg.progress = row.progress || 0;
  docProDlg.visible = true;
}
async function submitDocProgress() {
  docProDlg.saving = true;
  const r = await request.put(`/bid/docs/${docProDlg.id}`, { status: docProDlg.status, progress: docProDlg.progress });
  docProDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已更新'); docProDlg.visible = false; loadDocs(); loadBids(); }
  else ElMessage.error(r.msg || '更新失败');
}
async function delDoc(row) {
  await ElMessageBox.confirm(`确认删除标书任务「${row.doc_no}」？`, '删除确认', { type: 'warning' })
    .then(async () => {
      const r = await request.delete(`/bid/docs/${row.id}`);
      if (r.code === 200) { ElMessage.success('已删除'); loadDocs(); }
      else ElMessage.error(r.msg || '删除失败');
    })
    .catch(() => {});
}

/* ---------------- 章节 ---------------- */
const secDlg = reactive({
  visible: false, saving: false, id: null,
  form: { bid_id: null, title: '', sec_type: '商务', section_no: '', seq: 1, content: '' },
});
function openSection(row) {
  secDlg.id = row ? row.id : null;
  secDlg.form = row
    ? { bid_id: row.bid_id, title: row.title, sec_type: row.sec_type, section_no: row.section_no || '', seq: row.seq, content: row.content || '' }
    : { bid_id: curBidId.value, title: '', sec_type: '商务', section_no: '', seq: sections.value.length + 1, content: '' };
  secDlg.visible = true;
}
async function submitSection() {
  if (!secDlg.form.bid_id) { ElMessage.warning('请先在上方选择投标项目'); return; }
  if (!secDlg.form.title) { ElMessage.warning('章节标题必填'); return; }
  secDlg.saving = true;
  const r = secDlg.id
    ? await request.put(`/bid/sections/${secDlg.id}`, secDlg.form)
    : await request.post('/bid/sections', secDlg.form);
  secDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已保存'); secDlg.visible = false; loadSections(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}
async function delSection(row) {
  await ElMessageBox.confirm(`确认删除章节「${row.title}」（含子章节）？`, '删除确认', { type: 'warning' })
    .then(async () => {
      const r = await request.delete(`/bid/sections/${row.id}`);
      if (r.code === 200) { ElMessage.success('已删除'); loadSections(); }
      else ElMessage.error(r.msg || '删除失败');
    })
    .catch(() => {});
}
async function genFramework() {
  if (!curBidId.value) { ElMessage.warning('请先选择投标项目'); return; }
  await ElMessageBox.confirm(`将按「${frameworkType.value}类」标准结构生成章节树，已有章节会被覆盖，是否继续？`, '生成标书框架', { type: 'warning' })
    .then(async () => {
      const r = await request.post(`/bid/${curBidId.value}/framework`, { bid_type: frameworkType.value });
      if (r.code === 200) { ElMessage.success(r.msg || '已生成'); loadSections(); loadBids(); }
      else ElMessage.error(r.msg || '生成失败');
    })
    .catch(() => {});
}

const kbApplyDlg = reactive({ visible: false, saving: false, id: null, secTitle: '', knowledge_id: null });
const kbApplyPreview = computed(() => {
  const k = knowledge.value.find((x) => x.id === kbApplyDlg.knowledge_id);
  return k ? k.content : '';
});
function openKbApply(row) {
  kbApplyDlg.id = row.id;
  kbApplyDlg.secTitle = row.title;
  kbApplyDlg.knowledge_id = null;
  kbApplyDlg.visible = true;
  if (!knowledge.value.length) loadKnowledge();
}
async function submitKbApply() {
  if (!kbApplyDlg.knowledge_id) { ElMessage.warning('请选择知识条目'); return; }
  kbApplyDlg.saving = true;
  const r = await request.post(`/bid/sections/${kbApplyDlg.id}/apply-kb`, { knowledge_id: kbApplyDlg.knowledge_id });
  kbApplyDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已填充'); kbApplyDlg.visible = false; loadSections(); }
  else ElMessage.error(r.msg || '填充失败');
}

/* ---------------- 知识库 ---------------- */
const kbDlg = reactive({
  visible: false, saving: false, id: null,
  form: { category: '货物', topic: '', title: '', tags: '', content: '' },
});
function openKb(row) {
  kbDlg.id = row ? row.id : null;
  kbDlg.form = row
    ? { category: row.category, topic: row.topic || '', title: row.title, tags: row.tags || '', content: row.content }
    : { category: filter.kbCategory || '货物', topic: '', title: '', tags: '', content: '' };
  kbDlg.visible = true;
}
async function submitKb() {
  if (!kbDlg.form.title || !kbDlg.form.content) { ElMessage.warning('标题与内容必填'); return; }
  kbDlg.saving = true;
  const r = kbDlg.id
    ? await request.put(`/bid/knowledge/${kbDlg.id}`, kbDlg.form)
    : await request.post('/bid/knowledge', kbDlg.form);
  kbDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已保存'); kbDlg.visible = false; loadKnowledge(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}
async function delKb(row) {
  await ElMessageBox.confirm(`确认删除知识条目「${row.title}」？`, '删除确认', { type: 'warning' })
    .then(async () => {
      const r = await request.delete(`/bid/knowledge/${row.id}`);
      if (r.code === 200) { ElMessage.success('已删除'); loadKnowledge(); loadStats(); }
      else ElMessage.error(r.msg || '删除失败');
    })
    .catch(() => {});
}
async function seedKb() {
  const r = await request.post('/bid/knowledge/seed');
  if (r.code === 200) { ElMessage.success(r.msg || '补种完成'); loadKnowledge(); loadStats(); }
  else ElMessage.error(r.msg || '补种失败');
}
function showKb(row) {
  ElMessageBox.alert(
    `<div style="max-height:420px;overflow:auto;white-space:pre-wrap;line-height:1.7">${row.content}</div>`,
    `${row.category} · ${row.title}`, { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
  );
}

/* ---------------- 评审 ---------------- */
const revDlg = reactive({
  visible: false, saving: false, bid_id: null,
  form: { file_id: null, score: 85, conclusion: '通过', comment: '' },
});
function openReview() {
  revDlg.bid_id = curBidId.value;
  revDlg.form = { file_id: null, score: 85, conclusion: '通过', comment: '' };
  revDlg.visible = true;
  if (!files.value.length) loadFiles();
}
async function submitReview() {
  if (!revDlg.bid_id) { ElMessage.warning('请选择投标项目'); return; }
  if (!revDlg.form.comment.trim()) { ElMessage.warning('评审意见必填'); return; }
  revDlg.saving = true;
  const r = await request.post(`/bid/${revDlg.bid_id}/review`, revDlg.form);
  revDlg.saving = false;
  if (r.code === 200) { ElMessage.success('评审已提交'); revDlg.visible = false; loadReviews(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function delReview(row) {
  await ElMessageBox.confirm('确认删除该评审记录？', '删除确认', { type: 'warning' })
    .then(async () => {
      const r = await request.delete(`/bid/reviews/${row.id}`);
      if (r.code === 200) { ElMessage.success('已删除'); loadReviews(); }
      else ElMessage.error(r.msg || '删除失败');
    })
    .catch(() => {});
}

/* ---------------- 投标文件 ---------------- */
const uploadAction = '/api/bid/files';
const uploadHeaders = { Authorization: 'Bearer ' + (localStorage.getItem('zm_token') || '') };
const uploadData = computed(() => ({ bid_id: curBidId.value, doc_type: '整体标书' }));
function onUploadOk(r) {
  if (r && r.code === 200) { ElMessage.success('标书文件已上传'); loadFiles(); loadStats(); }
  else ElMessage.error((r && r.msg) || '上传失败');
}
function onUploadFail() { ElMessage.error('上传失败，请检查文件大小（≤20MB）或登录状态'); }
function downloadFile(row) {
  if (!row.file_path) { ElMessage.warning('该文件为在线登记，无附件'); return; }
  // 开发环境（Vite 5173）未代理 /uploads，直接指向后端服务
  const base = location.port === '5173' ? 'http://localhost:8080' : '';
  window.open(base + row.file_path, '_blank');
}
const reDlg = reactive({
  visible: false, saving: false, id: null, file_name: '', version: 1, file: null,
  form: { file_name: '', content: '' },
});
function openReupload(row) {
  reDlg.id = row.id;
  reDlg.file_name = row.file_name;
  reDlg.version = row.version || 1;
  reDlg.file = null;
  reDlg.form = { file_name: row.file_name, content: '' };
  reDlg.visible = true;
}
async function submitReupload() {
  if (!reDlg.form.file_name) { ElMessage.warning('文件名必填'); return; }
  const fd = new FormData();
  fd.append('file_name', reDlg.form.file_name);
  fd.append('content', reDlg.form.content || '');
  if (reDlg.file) fd.append('file', reDlg.file);
  reDlg.saving = true;
  const r = await request.put(`/bid/files/${reDlg.id}`, fd);
  reDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已重传'); reDlg.visible = false; loadFiles(); }
  else ElMessage.error(r.msg || '重传失败');
}
async function delFile(row) {
  await ElMessageBox.confirm(`确认删除标书文件「${row.file_name}」？`, '删除确认', { type: 'warning' })
    .then(async () => {
      const r = await request.delete(`/bid/files/${row.id}`);
      if (r.code === 200) { ElMessage.success('已删除'); loadFiles(); loadStats(); }
      else ElMessage.error(r.msg || '删除失败');
    })
    .catch(() => {});
}

/* ---------------- 查看授权 ---------------- */
const grantDlg = reactive({
  visible: false, saving: false, bid_id: null, mode: 'person',
  form: { emp_id: null, role: '', reason: '' },
});
function openGrant() {
  grantDlg.bid_id = curBidId.value;
  grantDlg.mode = 'person';
  grantDlg.form = { emp_id: null, role: '', reason: '' };
  grantDlg.visible = true;
}
async function submitGrant() {
  if (!grantDlg.bid_id) { ElMessage.warning('请选择投标项目'); return; }
  if (grantDlg.mode === 'person' && !grantDlg.form.emp_id) { ElMessage.warning('请选择被授权人'); return; }
  if (grantDlg.mode === 'role' && !grantDlg.form.role) { ElMessage.warning('请选择角色'); return; }
  grantDlg.saving = true;
  const payload = grantDlg.mode === 'person'
    ? { emp_id: grantDlg.form.emp_id, reason: grantDlg.form.reason }
    : { role: grantDlg.form.role, reason: grantDlg.form.reason };
  const r = await request.post(`/bid/${grantDlg.bid_id}/grants`, payload);
  grantDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已授权'); grantDlg.visible = false; loadGrants(); }
  else ElMessage.error(r.msg || '授权失败');
}
async function toggleGrant(row) {
  const r = await request.put(`/bid/grants/${row.id}`, { active: row.active ? 0 : 1 });
  if (r.code === 200) { ElMessage.success(r.msg || '已更新'); loadGrants(); }
  else ElMessage.error(r.msg || '操作失败');
}
async function delGrant(row) {
  await ElMessageBox.confirm(`确认撤销「${row.emp_name}」的查看授权？`, '撤销确认', { type: 'warning' })
    .then(async () => {
      const r = await request.delete(`/bid/grants/${row.id}`);
      if (r.code === 200) { ElMessage.success('已撤销'); loadGrants(); }
      else ElMessage.error(r.msg || '撤销失败');
    })
    .catch(() => {});
}
</script>

<style scoped>
.bid { padding: 20px; }
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
.kb-preview { max-height: 240px; overflow: auto; white-space: pre-wrap; line-height: 1.7; font-size: 13px; color: #606266; background: var(--el-fill-color-light); border-radius: 8px; padding: 12px; }
</style>
