<template>
  <div class="ct-page">
    <div class="ct-header">
      <h2><el-icon><Document /></el-icon> 合同模板库</h2>
      <div style="display:flex;gap:8px;">
        <el-button v-if="canManage" type="primary" size="small" @click="showTemplateForm()">
          <el-icon><Plus /></el-icon> 新增模板
        </el-button>
        <el-button v-if="canApprove" type="warning" size="small" @click="switchTab('approvals')">
          <el-icon><Stamp /></el-icon> 审批管理({{ pendingApprovals.length }})
        </el-button>
      </div>
    </div>

    <div class="ct-tabs">
      <el-button size="small" :type="tab === 'matrix' ? 'primary' : 'default'" :plain="tab !== 'matrix'"
        class="ct-tab-btn" @click="switchTab('matrix')">
        <el-icon><Grid /></el-icon> 模板矩阵
      </el-button>
      <el-button v-if="canApprove" size="small" :type="tab === 'approvals' ? 'primary' : 'default'" :plain="tab !== 'approvals'"
        class="ct-tab-btn" @click="switchTab('approvals')">
        <el-icon><Stamp /></el-icon> 审批管理
        <span v-if="pendingApprovals.length > 0" class="ct-badge" style="background:#fee2e2;color:#dc2626;margin-left:4px;">{{ pendingApprovals.length }}</span>
      </el-button>
    </div>

    <!-- ===== 审批管理标签页 ===== -->
    <template v-if="tab === 'approvals' && canApprove">
      <div v-if="pendingApprovals.length === 0" class="ct-empty-card">
        <el-icon style="font-size:32px;color:#22c55e;"><CircleCheck /></el-icon>
        <p class="ct-muted">暂无待审批的模板修改申请</p>
      </div>
      <div v-for="a in pendingApprovals" :key="a.id" class="ct-approval-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
          <div>
            <h4 style="margin:0 0 4px;">
              <span class="ct-tag" :style="{ background: changeTypeColor[a.change_type] || '#6b7280' }">{{ changeTypeLabel[a.change_type] || a.change_type }}</span>
              {{ a.template_name }}
            </h4>
            <div class="ct-muted" style="font-size:12px;">
              申请人: {{ a.applicant_name }} · {{ a.applicant_dept }} · {{ a.created_at }}
            </div>
            <div v-if="a.reason" class="ct-muted" style="font-size:12px;margin-top:4px;">
              <el-icon><ChatDotRound /></el-icon> {{ a.reason }}
            </div>
          </div>
          <div style="display:flex;gap:4px;align-items:center;">
            <template v-if="isMyTurn(a)">
              <el-button size="small" type="success" @click="approveTemplate(a)"><el-icon><Check /></el-icon> 通过</el-button>
              <el-button size="small" type="danger" @click="rejectTemplate(a)"><el-icon><Close /></el-icon> 驳回</el-button>
            </template>
            <el-tag v-else type="warning" size="small">等待审批中</el-tag>
            <el-button size="small" @click="viewApprovalDetail(a)"><el-icon><View /></el-icon></el-button>
          </div>
        </div>
        <div class="wf-container">
          <div v-for="(s, i) in (a.steps || [])" :key="i" class="wf-node" :class="s.done ? 'wf-done' : 'wf-todo'">
            <div class="wf-node-icon">
              <el-icon v-if="s.done"><Check /></el-icon>
              <el-icon v-else><Clock /></el-icon>
            </div>
            <div class="wf-node-body">
              <div class="wf-node-title">{{ s.step }}</div>
              <div class="wf-node-meta">{{ s.user || '—' }} · {{ s.time || '—' }}</div>
              <div v-if="s.opinion" class="wf-node-opinion">{{ s.opinion }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== 模板矩阵 ===== -->
    <template v-else>
      <div class="ct-kpi-grid">
        <div class="ct-kpi-card">
          <div class="ct-kpi-icon" style="background:#2563eb;"><el-icon><Files /></el-icon></div>
          <div class="ct-kpi-body">
            <div class="ct-kpi-value">{{ stats.total || 0 }}</div>
            <div class="ct-kpi-label">模板总数</div>
          </div>
        </div>
        <div class="ct-kpi-card">
          <div class="ct-kpi-icon" style="background:#22c55e;"><el-icon><CircleCheck /></el-icon></div>
          <div class="ct-kpi-body">
            <div class="ct-kpi-value">{{ stats.enabled || 0 }}</div>
            <div class="ct-kpi-label">已启用</div>
          </div>
        </div>
        <div class="ct-kpi-card">
          <div class="ct-kpi-icon" style="background:#9ca3af;"><el-icon><VideoPause /></el-icon></div>
          <div class="ct-kpi-body">
            <div class="ct-kpi-value">{{ stats.disabled || 0 }}</div>
            <div class="ct-kpi-label">已禁用</div>
          </div>
        </div>
        <div class="ct-kpi-card">
          <div class="ct-kpi-icon" style="background:#8b5cf6;"><el-icon><Folder /></el-icon></div>
          <div class="ct-kpi-body">
            <div class="ct-kpi-value">{{ Object.keys(stats.byCategory || {}).length }}</div>
            <div class="ct-kpi-label">模板分类</div>
          </div>
        </div>
        <div v-if="pendingApprovals.length > 0" class="ct-kpi-card">
          <div class="ct-kpi-icon" style="background:#f59e0b;"><el-icon><Clock /></el-icon></div>
          <div class="ct-kpi-body">
            <div class="ct-kpi-value">{{ pendingApprovals.length }}</div>
            <div class="ct-kpi-label">待审批</div>
          </div>
        </div>
      </div>

      <div class="ct-filter-bar">
        <el-input v-model="filters.keyword" placeholder="搜索模板名称..." class="ct-search" clearable
          @keyup.enter="filterTemplates" />
        <el-select v-model="filters.category" placeholder="全部分类" style="width:160px;" @change="filterTemplates">
          <el-option label="全部分类" value="" />
          <el-option v-for="cat in categories" :key="cat" :label="cat" :value="cat" />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" style="width:130px;" @change="filterTemplates">
          <el-option label="全部状态" value="" />
          <el-option label="启用" value="启用" />
          <el-option label="禁用" value="禁用" />
        </el-select>
        <el-button size="default" @click="filterTemplates"><el-icon><Search /></el-icon> 筛选</el-button>
      </div>

      <div v-loading="loading" class="ct-matrix">
        <div v-if="templates.length === 0" class="ct-empty">
          <el-icon style="font-size:48px;"><Box /></el-icon>
          <p>{{ filtered ? '未找到匹配的模板' : '暂无合同模板' }}</p>
          <el-button v-if="canManage && !filtered" type="primary" size="small" @click="showTemplateForm()">
            <el-icon><Plus /></el-icon> 创建第一个模板
          </el-button>
        </div>
        <div v-for="cat in matrixKeys" :key="cat" class="ct-matrix-row">
          <div class="ct-matrix-cat-header">
            <el-icon><FolderOpened /></el-icon>
            <span class="ct-matrix-cat-name">{{ cat }}</span>
            <span class="ct-matrix-cat-count">{{ matrix[cat].length }}个模板</span>
          </div>
          <div class="ct-matrix-cards">
            <div v-for="t in matrix[cat]" :key="t.id" class="ct-card" :class="{ 'ct-card-disabled': t.status === '禁用' }">
              <div class="ct-card-header">
                <div class="ct-card-title">
                  <el-icon class="ct-file-icon"><Document /></el-icon>
                  <span>{{ t.name }}</span>
                </div>
                <div style="display:flex;gap:4px;">
                  <span class="ct-badge" :class="t.status === '启用' ? 'ct-badge-on' : 'ct-badge-off'">{{ t.status }}</span>
                  <span v-if="pendingTemplateIds.has(t.id)" class="ct-badge" style="background:#fef3c7;color:#92400e;">审批中</span>
                </div>
              </div>
              <div class="ct-card-meta">
                <span><el-icon><OfficeBuilding /></el-icon> {{ deptLabels(t) }}</span>
                <span><el-icon><Share /></el-icon> v{{ t.version || 1 }}</span>
              </div>
              <div v-if="t.content" class="ct-card-desc">{{ contentPreview(t.content) }}</div>
              <div class="ct-card-footer">
                <span class="ct-creator"><el-icon><User /></el-icon> {{ t.creator || '未知' }} · {{ t.updated_at || t.created_at || '' }}</span>
                <div class="ct-card-actions">
                  <el-button size="small" text title="详情" @click="viewTemplateDetail(t)"><el-icon><View /></el-icon></el-button>
                  <el-button v-if="t.status === '启用'" size="small" text type="primary" title="调用模板创建实例" @click="showCloneTemplateForm(t)"><el-icon><CopyDocument /></el-icon></el-button>
                  <el-button size="small" text title="修改痕迹" @click="showTemplateTrace(t)"><el-icon><Clock /></el-icon></el-button>
                  <el-button v-if="hasFile(t)" size="small" text title="下载文件" @click="downloadTemplateFile(t)"><el-icon><Download /></el-icon></el-button>
                  <el-button v-if="canManage && !pendingTemplateIds.has(t.id)" size="small" text title="修改（需审批）" @click="showTemplateForm(t)"><el-icon><Edit /></el-icon></el-button>
                  <el-button v-if="canManage && !pendingTemplateIds.has(t.id)" size="small" text :title="(t.status === '启用' ? '禁用' : '启用') + '（需审批）'" @click="toggleTemplateStatus(t)">
                    <el-icon><VideoPause v-if="t.status === '启用'" /><VideoPlay v-else /></el-icon>
                  </el-button>
                  <el-button v-if="canManage && hasFile(t) && !pendingTemplateIds.has(t.id)" size="small" text title="上传文件" @click="showUploadForm(t)"><el-icon><Upload /></el-icon></el-button>
                  <el-button v-if="canDelete && t.status === '禁用' && !pendingTemplateIds.has(t.id)" size="small" text type="danger" title="删除（需审批）" @click="deleteTemplate(t)"><el-icon><Delete /></el-icon></el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== 新增/编辑模板对话框 ===== -->
    <el-dialog v-model="formDlg.visible" :title="formDlg.isEdit ? '编辑模板' : '新增模板'" width="600px">
      <el-form label-position="top">
        <el-form-item label="模板名称" required>
          <el-input v-model="formDlg.form.name" placeholder="例：标准采购合同模板" />
        </el-form-item>
        <el-form-item label="合同类型">
          <el-input v-model="formDlg.form.category" placeholder="例：采购合同、销售合同、服务合同" />
        </el-form-item>
        <el-form-item label="适用部门">
          <div class="ct-checkbox-group">
            <label v-for="d in deptList" :key="d" class="ct-checkbox">
              <input type="checkbox" :value="d" v-model="formDlg.form.applicable_dept" /> {{ d }}
            </label>
          </div>
          <small class="ct-muted">不选则适用于所有部门</small>
        </el-form-item>
        <el-form-item label="模板内容">
          <el-input v-model="formDlg.form.content" type="textarea" :rows="5" placeholder="模板内容描述或合同条款摘要..." />
        </el-form-item>
        <el-form-item v-if="formDlg.isEdit" label="变更说明">
          <el-input v-model="formDlg.form.change_desc" placeholder="说明本次修改内容（将作为审批申请说明）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="formDlg.saving" @click="saveTemplate">
          <el-icon><Promotion /></el-icon> {{ formDlg.isEdit ? '提交修改审批' : '提交创建审批' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 模板详情对话框 ===== -->
    <el-dialog v-model="detailDlg.visible" width="700px">
      <template #header>
        <span><el-icon><Document /></el-icon> 模板详情</span>
      </template>
      <div v-if="detailDlg.data" style="max-height:65vh;overflow-y:auto;">
        <table class="ct-detail-table">
          <tbody>
            <tr><td class="ct-dt-label">模板名称</td><td>{{ detailDlg.data.name }}</td></tr>
            <tr><td class="ct-dt-label">合同类型</td><td>{{ detailDlg.data.category || '未分类' }}</td></tr>
            <tr><td class="ct-dt-label">适用部门</td><td>{{ deptLabels(detailDlg.data) }}</td></tr>
            <tr><td class="ct-dt-label">状态</td><td>
              <span class="ct-badge" :class="detailDlg.data.status === '启用' ? 'ct-badge-on' : 'ct-badge-off'">{{ detailDlg.data.status }}</span>
            </td></tr>
            <tr><td class="ct-dt-label">当前版本</td><td>v{{ detailDlg.data.version || 1 }}（共{{ detailDlg.data.version_count || 0 }}个历史版本）</td></tr>
            <tr><td class="ct-dt-label">创建人</td><td>{{ detailDlg.data.creator || '' }} ({{ detailDlg.data.creator_id || '' }})</td></tr>
            <tr><td class="ct-dt-label">创建时间</td><td>{{ detailDlg.data.created_at || '' }}</td></tr>
            <tr><td class="ct-dt-label">更新时间</td><td>{{ detailDlg.data.updated_at || '' }}</td></tr>
            <tr><td class="ct-dt-label">模板文件</td><td>
              <template v-if="hasFile(detailDlg.data)">
                <el-icon><Document /></el-icon> {{ detailDlg.data.file_type || '' }}
                <el-button size="small" @click="downloadTemplateFile(detailDlg.data)"><el-icon><Download /></el-icon> 下载</el-button>
              </template>
              <span v-else class="ct-muted">未上传文件</span>
            </td></tr>
            <tr><td class="ct-dt-label">模板内容</td><td><div class="ct-content-box">{{ detailDlg.data.content || '（无）' }}</div></td></tr>
          </tbody>
        </table>

        <div class="ct-version-section">
          <h4><el-icon><Clock /></el-icon> 版本历史</h4>
          <div v-loading="detailDlg.versionsLoading">
            <p v-if="!detailDlg.versionsLoading && detailDlg.versions.length === 0" class="ct-muted">暂无版本历史</p>
            <div v-for="v in detailDlg.versions" :key="v.id" class="ct-version-item">
              <div class="ct-ver-header">
                <span class="ct-ver-num">v{{ v.version_num }}</span>
                <span class="ct-ver-desc">{{ v.change_desc || '' }}</span>
                <el-button v-if="canManage" size="small" @click="restoreTemplateVersion(v)">
                  <el-icon><RefreshLeft /></el-icon> 恢复
                </el-button>
              </div>
              <div class="ct-ver-meta">
                <span><el-icon><User /></el-icon> {{ v.operator || '' }}</span>
                <span><el-icon><Clock /></el-icon> {{ v.created_at || '' }}</span>
                <span><el-icon><PriceTag /></el-icon> {{ v.category || '未分类' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button v-if="canManage && detailDlg.data" @click="detailDlg.visible = false; showTemplateForm(detailDlg.data)">
          <el-icon><Edit /></el-icon> 编辑
        </el-button>
        <el-button @click="detailDlg.visible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- ===== 上传文件对话框 ===== -->
    <el-dialog v-model="uploadDlg.visible" width="480px">
      <template #header>
        <span><el-icon><Upload /></el-icon> 上传模板文件</span>
      </template>
      <el-form label-position="top">
        <el-form-item label="选择文件（PDF/Word，最大20MB）">
          <el-upload v-model:file-list="uploadDlg.fileList" :auto-upload="false" :limit="1"
            accept=".pdf,.doc,.docx" drag style="width:100%;">
            <el-icon style="font-size:32px;color:#c0c4cc;"><UploadFilled /></el-icon>
            <div class="el-upload__text">拖拽文件到此处，或 <em>点击选择文件</em></div>
          </el-upload>
        </el-form-item>
      </el-form>
      <div class="ct-upload-hint">
        <el-icon><InfoFilled /></el-icon> 仅支持 .pdf / .doc / .docx 格式文件
      </div>
      <template #footer>
        <el-button @click="uploadDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="uploadDlg.uploading" @click="uploadTemplateFile">
          <el-icon><Upload /></el-icon> 上传
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 调用模板创建实例对话框 ===== -->
    <el-dialog v-model="cloneDlg.visible" width="700px">
      <template #header>
        <span><el-icon><CopyDocument /></el-icon> 调用模板 — 创建合同实例</span>
      </template>
      <div v-if="cloneDlg.tpl" style="max-height:60vh;overflow-y:auto;">
        <div style="margin-bottom:12px;padding:10px;background:#dbeafe;border-radius:8px;font-size:13px;color:#1e40af;">
          <el-icon><InfoFilled /></el-icon> 源模板：<strong>{{ cloneDlg.tpl.name }}</strong>（{{ cloneDlg.tpl.category }}）
          <br />调用后可在模板内容基础上进行修改，所有修改将自动保留版本痕迹。
        </div>
        <el-form label-position="top">
          <el-form-item label="实例名称" required>
            <el-input v-model="cloneDlg.form.name" />
          </el-form-item>
          <el-form-item label="合同内容（可修改）">
            <el-input v-model="cloneDlg.form.content" type="textarea" :rows="14"
              style="font-family:monospace;font-size:13px;" />
          </el-form-item>
          <el-form-item label="备注（选填）">
            <el-input v-model="cloneDlg.form.remark" placeholder="如：用于XX项目采购" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="cloneDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="cloneDlg.saving" @click="cloneTemplate">
          <el-icon><Check /></el-icon> 创建实例
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 修改痕迹对话框 ===== -->
    <el-dialog v-model="traceDlg.visible" width="750px">
      <template #header>
        <span><el-icon><Search /></el-icon> 修改痕迹 — {{ traceDlg.template?.name || '' }}</span>
      </template>
      <div v-loading="traceDlg.loading" style="max-height:65vh;overflow-y:auto;">
        <template v-if="!traceDlg.loading && traceDlg.template">
          <div v-if="traceDlg.template.is_cloned" style="margin-bottom:12px;padding:8px;background:#fef3c7;border-radius:8px;font-size:13px;">
            <el-icon><CopyDocument /></el-icon> 此实例由模板调用创建，源模板：{{ traceDlg.sourceTemplate?.name || '' }}
          </div>

          <div v-if="traceDlg.diff" style="margin-bottom:16px;">
            <h4 style="margin-bottom:8px;"><el-icon><Files /></el-icon> 与源模板对比</h4>
            <div style="padding:10px;background:#f0f9ff;border-radius:8px;margin-bottom:8px;">
              <strong>源模板：</strong>{{ traceDlg.diff.source_name }}
              <br /><strong>内容是否修改：</strong>
              <span v-if="traceDlg.diff.content_changed" style="color:#dc2626;">是</span>
              <span v-else style="color:#16a34a;">否</span>
              <br /><strong>源内容字数：</strong>{{ traceDlg.diff.source_content_length }} → <strong>当前字数：</strong>{{ traceDlg.diff.current_content_length }}
            </div>
            <div v-if="traceDlg.diff.field_changes && traceDlg.diff.field_changes.length" style="margin-top:8px;">
              <strong>字段变更：</strong>
              <el-tag v-for="(c, i) in traceDlg.diff.field_changes" :key="i" size="small" style="margin:2px;"
                :type="c.change === '新增' ? 'success' : c.change === '删除' ? 'danger' : 'primary'">
                {{ c.label }}（{{ c.change }}）
              </el-tag>
            </div>
            <div v-else style="margin-top:8px;color:#9ca3af;">字段无变更</div>
            <div v-if="traceDlg.diff.content_changes && traceDlg.diff.content_changes.length" style="margin-top:12px;">
              <strong>内容差异（共{{ traceDlg.diff.content_changes.length }}处{{ traceDlg.diff.content_changes.length > 50 ? '，仅显示前50处' : '' }}）：</strong>
              <div style="max-height:200px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;margin-top:6px;">
                <div v-for="(c, i) in traceDlg.diff.content_changes" :key="i"
                  style="padding:4px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;">
                  <span style="color:#9ca3af;">第{{ c.line }}行：</span>
                  <div style="margin-left:12px;"><span style="color:#dc2626;">- {{ c.source }}</span></div>
                  <div style="margin-left:12px;"><span style="color:#16a34a;">+ {{ c.current }}</span></div>
                </div>
              </div>
            </div>
            <div v-else style="margin-top:8px;color:#9ca3af;">内容无差异</div>
          </div>
          <div v-else style="margin-bottom:16px;color:#9ca3af;">该模板为原始模板，非调用创建的实例。</div>

          <div v-if="traceDlg.versions.length">
            <h4 style="margin-bottom:8px;"><el-icon><Clock /></el-icon> 版本历史（{{ traceDlg.versions.length }}个版本）</h4>
            <div style="max-height:200px;overflow-y:auto;">
              <div v-for="v in traceDlg.versions" :key="v.id"
                style="padding:8px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;">
                <div style="display:flex;justify-content:space-between;">
                  <strong>v{{ v.version_num }}</strong>
                  <span style="font-size:12px;color:#9ca3af;">{{ v.created_at || '' }}</span>
                </div>
                <div style="font-size:13px;margin-top:4px;">
                  <span style="color:#9ca3af;">操作人：</span>{{ v.operator || '' }}
                  <span style="color:#9ca3af;margin-left:8px;">说明：</span>{{ v.change_desc || '' }}
                </div>
              </div>
            </div>
          </div>
          <div v-else style="color:#9ca3af;">暂无版本历史</div>
        </template>
      </div>
      <template #footer>
        <el-button @click="traceDlg.visible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- ===== 审批详情对话框 ===== -->
    <el-dialog v-model="approvalDlg.visible" width="700px">
      <template #header>
        <span><el-icon><Stamp /></el-icon> 审批详情</span>
      </template>
      <div v-loading="approvalDlg.loading" style="max-height:60vh;overflow-y:auto;">
        <template v-if="!approvalDlg.loading && approvalDlg.data">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
            <span class="ct-tag" style="background:#6366f1;">{{ changeTypeLabel[approvalDlg.data.change_type] || approvalDlg.data.change_type }}</span>
            <strong>{{ approvalDlg.data.template_name }}</strong>
            <el-tag size="small" :type="approvalDlg.data.status === '审批中' ? 'warning' : approvalDlg.data.status === '已通过' ? 'success' : 'danger'">
              {{ approvalDlg.data.status }}
            </el-tag>
          </div>
          <div class="ct-muted" style="font-size:12px;margin-bottom:12px;">
            申请人: {{ approvalDlg.data.applicant_name }} · {{ approvalDlg.data.applicant_dept }} · {{ approvalDlg.data.created_at }}
          </div>
          <el-alert v-if="approvalDlg.data.reason" type="info" :closable="false" style="margin-bottom:12px;">
            <el-icon><ChatDotRound /></el-icon> {{ approvalDlg.data.reason }}
          </el-alert>

          <h4><el-icon><Edit /></el-icon> 变更内容</h4>
          <!-- 新建 -->
          <template v-if="approvalDlg.data.change_type === 'create'">
            <div class="ct-ap-field"><label>模板名称</label><div>{{ approvalChangeData.name || '' }}</div></div>
            <div class="ct-ap-field"><label>合同类型</label><div>{{ approvalChangeData.category || '' }}</div></div>
            <div class="ct-ap-field"><label>适用部门</label><div>{{ approvalChangeData.applicable_dept || '全部' }}</div></div>
            <div class="ct-ap-field"><label>模板内容</label>
              <pre style="white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:4px;max-height:200px;overflow-y:auto;">{{ approvalChangeData.content || '' }}</pre>
            </div>
          </template>
          <!-- 修改 -->
          <template v-else-if="approvalDlg.data.change_type === 'modify'">
            <template v-if="modifyDiffs.length">
              <div v-for="d in modifyDiffs" :key="d.label" class="ct-ap-field">
                <label>{{ d.label }}</label>
                <div style="display:flex;gap:8px;">
                  <div style="flex:1;"><small class="ct-muted">修改前</small>
                    <div style="background:#fee2e2;padding:4px 8px;border-radius:4px;font-size:12px;">{{ String(d.oldVal).substring(0, 200) }}</div>
                  </div>
                  <div style="flex:1;"><small class="ct-muted">修改后</small>
                    <div style="background:#d1fae5;padding:4px 8px;border-radius:4px;font-size:12px;">{{ String(d.newVal).substring(0, 200) }}</div>
                  </div>
                </div>
              </div>
            </template>
            <p v-else class="ct-muted">无变更内容</p>
          </template>
          <!-- 状态切换 -->
          <div v-else-if="approvalDlg.data.change_type === 'status_toggle'" class="ct-ap-field">
            <label>状态变更</label>
            <div>
              {{ approvalDlg.data.snapshot_data?.status || '启用' }} →
              <el-tag size="small" :type="approvalChangeData.new_status === '启用' ? 'success' : 'danger'">{{ approvalChangeData.new_status || '' }}</el-tag>
            </div>
          </div>
          <!-- 删除 -->
          <div v-else-if="approvalDlg.data.change_type === 'delete'" class="ct-ap-field">
            <label>删除模板</label>
            <div style="color:#dc2626;">确认删除模板「{{ approvalDlg.data.template_name }}」？此操作不可逆（物理数据保留）</div>
          </div>

          <h4 style="margin-top:16px;"><el-icon><Share /></el-icon> 审批流程</h4>
          <div class="wf-container">
            <div v-for="(s, i) in (approvalDlg.data.steps || [])" :key="i" class="wf-node" :class="s.done ? 'wf-done' : 'wf-todo'">
              <div class="wf-node-icon">
                <el-icon v-if="s.done"><Check /></el-icon>
                <el-icon v-else><Clock /></el-icon>
              </div>
              <div class="wf-node-body">
                <div class="wf-node-title">{{ s.step }}</div>
                <div class="wf-node-meta">{{ s.user || '—' }} · {{ s.time || '—' }}</div>
                <div v-if="s.opinion" class="wf-node-opinion">{{ s.opinion }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="approvalDlg.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Document, Plus, Stamp, Grid, CircleCheck, Files, VideoPause, VideoPlay, Folder,
  Clock, Search, Box, FolderOpened, OfficeBuilding, Share, User, View, CopyDocument,
  Download, Edit, Upload, UploadFilled, Delete, Promotion, RefreshLeft, PriceTag,
  InfoFilled, Check, Close, ChatDotRound
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();

// ===== 权限 =====
const isAdminDept = computed(() => auth.user && auth.user.dept === '行政部');
const isGM = computed(() => auth.user && (auth.user.role === '总经理' || auth.user.role === '超级管理员'));
const isDeptLeader = computed(() => auth.user && auth.user.role === '部门经理' && auth.user.dept === '行政部');
const canManage = computed(() => isAdminDept.value || isGM.value);
const canDelete = computed(() => isAdminDept.value || isGM.value);
const canApprove = computed(() => isDeptLeader.value || isGM.value);

const changeTypeLabel = { create: '新建模板', modify: '修改模板', delete: '删除模板', status_toggle: '状态切换' };
const changeTypeColor = { create: '#2563eb', modify: '#f59e0b', delete: '#ef4444', status_toggle: '#8b5cf6' };

const deptList = ['总经理办公室', '销售部', '技术部', '财务部', '行政部', '市场部'];

// ===== 页面状态 =====
const loading = ref(false);
const tab = ref('matrix');
const stats = ref({});
const templates = ref([]);
const categories = ref([]);
const pendingApprovals = ref([]);
const filters = reactive({ keyword: '', category: '', status: '' });
const filtered = ref(false);

const pendingTemplateIds = computed(() =>
  new Set(pendingApprovals.value.filter(a => a.template_id).map(a => a.template_id))
);

// 矩阵分组：按分类组织模板
const matrix = computed(() => {
  const m = {};
  templates.value.forEach(t => {
    const cat = t.category || '未分类';
    if (!m[cat]) m[cat] = [];
    m[cat].push(t);
  });
  // 确保所有已知分类都有分组（仅初始加载、未筛选时）
  if (!filtered.value) {
    categories.value.forEach(cat => { if (!m[cat]) m[cat] = []; });
  }
  return m;
});
const matrixKeys = computed(() => Object.keys(matrix.value));

function deptLabels(t) {
  return (t.applicable_dept || []).length ? t.applicable_dept.join(', ') : '全部部门';
}
function hasFile(t) {
  return t && t.template_file && t.template_file !== '';
}
function contentPreview(content) {
  return content.length > 80 ? content.substring(0, 80) + '...' : content;
}

// ===== 数据加载 =====
async function loadAll() {
  loading.value = true;
  try {
    const [listResp, catResp, approvalResp] = await Promise.all([
      request.get('/contract-template/'),
      request.get('/contract-template/categories'),
      request.get('/contract-template/approvals/list', { params: { status: '审批中' } })
    ]);
    if (listResp.code !== 200) {
      ElMessage.error('加载失败: ' + (listResp.msg || ''));
      return;
    }
    stats.value = listResp.data.stats || {};
    templates.value = listResp.data.templates || [];
    categories.value = catResp.data || [];
    pendingApprovals.value = (approvalResp.data && approvalResp.data.approvals) || [];
    filtered.value = false;
  } catch (e) {
    console.error('[ContractTemplate]', e);
    ElMessage.error('加载合同模板库失败: ' + (e.message || ''));
  } finally {
    loading.value = false;
  }
}

function switchTab(t) {
  tab.value = t;
  loadAll();
}

async function filterTemplates() {
  const params = {};
  if (filters.keyword) params.keyword = filters.keyword;
  if (filters.category) params.category = filters.category;
  if (filters.status) params.status = filters.status;
  const resp = await request.get('/contract-template/', { params });
  if (resp.code !== 200) { ElMessage.error('筛选失败'); return; }
  templates.value = resp.data.templates || [];
  filtered.value = true;
}

// ===== 新增/编辑模板 =====
const formDlg = reactive({
  visible: false, saving: false, isEdit: false, id: '',
  form: { name: '', category: '', content: '', applicable_dept: [], change_desc: '' }
});

function showTemplateForm(t) {
  formDlg.isEdit = !!t;
  formDlg.id = t ? t.id : '';
  formDlg.form = {
    name: t ? t.name : '',
    category: t ? (t.category || '') : '',
    content: t ? (t.content || '') : '',
    applicable_dept: t ? [...(t.applicable_dept || [])] : [],
    change_desc: ''
  };
  formDlg.visible = true;
}

async function saveTemplate() {
  const name = (formDlg.form.name || '').trim();
  if (!name) { ElMessage.error('模板名称不能为空'); return; }
  formDlg.saving = true;
  try {
    if (formDlg.isEdit) {
      const resp = await request.put('/contract-template/' + formDlg.id, {
        name,
        category: (formDlg.form.category || '').trim(),
        content: (formDlg.form.content || '').trim(),
        applicable_dept: formDlg.form.applicable_dept,
        change_desc: (formDlg.form.change_desc || '').trim()
      });
      if (resp.code === 200) {
        ElMessage.success('修改申请已提交，待行政部负责人及总经理审批后生效');
        formDlg.visible = false;
        loadAll();
      } else {
        ElMessage.error('提交失败: ' + resp.msg);
      }
    } else {
      const resp = await request.post('/contract-template/', {
        name,
        category: (formDlg.form.category || '').trim(),
        content: (formDlg.form.content || '').trim(),
        applicable_dept: formDlg.form.applicable_dept,
        fields: [],
        reason: (formDlg.form.change_desc || '').trim() || '新增合同模板'
      });
      if (resp.code === 200) {
        ElMessage.success('创建申请已提交，待行政部负责人及总经理审批后入库');
        formDlg.visible = false;
        loadAll();
      } else {
        ElMessage.error('提交失败: ' + resp.msg);
      }
    }
  } finally {
    formDlg.saving = false;
  }
}

// ===== 模板详情 & 版本历史 =====
const detailDlg = reactive({ visible: false, data: null, versions: [], versionsLoading: false });

async function viewTemplateDetail(t) {
  const resp = await request.get('/contract-template/' + t.id);
  if (resp.code !== 200) { ElMessage.error('获取详情失败'); return; }
  detailDlg.data = resp.data;
  detailDlg.versions = [];
  detailDlg.visible = true;
  loadTemplateVersions(t.id);
}

async function loadTemplateVersions(id) {
  detailDlg.versionsLoading = true;
  try {
    const resp = await request.get('/contract-template/' + id + '/versions');
    if (resp.code !== 200) { ElMessage.error('加载版本历史失败'); return; }
    detailDlg.versions = resp.data.versions || [];
  } finally {
    detailDlg.versionsLoading = false;
  }
}

async function restoreTemplateVersion(v) {
  try {
    await ElMessageBox.confirm(
      '确定要恢复到版本v' + v.version_num + '吗？\n\n恢复操作将保存当前版本并创建新版本。',
      '恢复版本', { type: 'warning' }
    );
  } catch { return; }
  const resp = await request.post('/contract-template/' + detailDlg.data.id + '/restore-version', {
    version_id: v.id,
    change_desc: '从v' + v.version_num + '恢复'
  });
  if (resp.code === 200) {
    ElMessage.success('已恢复到v' + v.version_num + '，当前版本v' + resp.data.version);
    detailDlg.visible = false;
    loadAll();
  } else {
    ElMessage.error('恢复失败: ' + resp.msg);
  }
}

// ===== 状态切换 / 删除 =====
async function toggleTemplateStatus(t) {
  const resp = await request.put('/contract-template/' + t.id + '/status');
  if (resp.code === 200) {
    ElMessage.success('状态切换申请已提交，待审批后生效');
    loadAll();
  } else {
    ElMessage.error('操作失败: ' + resp.msg);
  }
}

async function deleteTemplate(t) {
  try {
    await ElMessageBox.confirm(
      '确定要删除模板「' + t.name + '」吗？\n\n注意：删除申请需经审批通过后执行，物理数据将保留。',
      '删除模板', { type: 'warning' }
    );
  } catch { return; }
  try {
    await ElMessageBox.prompt('请输入删除原因:', '删除原因', { inputPlaceholder: '选填' });
  } catch { /* 原逻辑允许取消原因仍继续，此处取消即中止 */ return; }
  const resp = await request.delete('/contract-template/' + t.id);
  if (resp.code === 200) {
    ElMessage.success('删除申请已提交，待审批后执行');
    loadAll();
  } else {
    ElMessage.error('提交失败: ' + resp.msg);
  }
}

// ===== 文件下载 / 上传 =====
async function downloadTemplateFile(t) {
  try {
    const token = localStorage.getItem('zm_token');
    const resp = await fetch('/api/contract-template/' + t.id + '/download', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      ElMessage.error('下载失败: ' + (errData.msg || resp.statusText));
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_' + t.id;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ElMessage.success('文件下载成功');
  } catch (e) {
    ElMessage.error('下载失败: ' + e.message);
  }
}

const uploadDlg = reactive({ visible: false, uploading: false, id: '', fileList: [] });

function showUploadForm(t) {
  uploadDlg.id = t.id;
  uploadDlg.fileList = [];
  uploadDlg.visible = true;
}

async function uploadTemplateFile() {
  const file = uploadDlg.fileList[0];
  if (!file || !file.raw) { ElMessage.error('请选择文件'); return; }
  const formData = new FormData();
  formData.append('file', file.raw);
  uploadDlg.uploading = true;
  try {
    const resp = await request.post('/contract-template/' + uploadDlg.id + '/upload', formData);
    if (resp.code === 200) {
      ElMessage.success('文件上传成功: ' + (resp.data.file_name || ''));
      uploadDlg.visible = false;
      loadAll();
    } else {
      ElMessage.error('上传失败: ' + resp.msg);
    }
  } finally {
    uploadDlg.uploading = false;
  }
}

// ===== 调用模板（克隆）创建实例 =====
const cloneDlg = reactive({ visible: false, saving: false, id: '', tpl: null, form: { name: '', content: '', remark: '' } });

async function showCloneTemplateForm(t) {
  const resp = await request.get('/contract-template/' + t.id);
  if (resp.code !== 200) { ElMessage.error('获取模板详情失败'); return; }
  const tpl = resp.data;
  cloneDlg.id = t.id;
  cloneDlg.tpl = tpl;
  cloneDlg.form = {
    name: tpl.name + '（' + (auth.user?.name || '') + '调用）',
    content: tpl.content || '',
    remark: ''
  };
  cloneDlg.visible = true;
}

async function cloneTemplate() {
  const name = (cloneDlg.form.name || '').trim();
  if (!name) { ElMessage.warning('实例名称不能为空'); return; }
  cloneDlg.saving = true;
  try {
    const resp = await request.post('/contract-template/' + cloneDlg.id + '/clone', {
      name, content: cloneDlg.form.content, remark: (cloneDlg.form.remark || '').trim()
    });
    if (resp.code === 200) {
      ElMessage.success('实例创建成功，可继续修改，所有修改自动保留痕迹');
      cloneDlg.visible = false;
      loadAll();
    } else {
      ElMessage.error('创建失败: ' + resp.msg);
    }
  } finally {
    cloneDlg.saving = false;
  }
}

// ===== 修改痕迹 =====
const traceDlg = reactive({ visible: false, loading: false, template: null, sourceTemplate: null, diff: null, versions: [] });

async function showTemplateTrace(t) {
  traceDlg.visible = true;
  traceDlg.loading = true;
  traceDlg.template = null;
  try {
    const resp = await request.get('/contract-template/' + t.id + '/trace');
    if (resp.code !== 200) { ElMessage.error('获取修改痕迹失败: ' + resp.msg); traceDlg.visible = false; return; }
    traceDlg.template = resp.data.template;
    traceDlg.sourceTemplate = resp.data.source_template;
    traceDlg.diff = resp.data.diff;
    traceDlg.versions = resp.data.versions || [];
  } finally {
    traceDlg.loading = false;
  }
}

// ===== 审批管理 =====
function matchTemplateApprovalRoleFront(role) {
  const u = auth.user || {};
  if (u.role === '超级管理员') return true;
  switch (role) {
    case 'deptLeader': return u.role === '部门经理' && u.dept === '行政部';
    case 'gm': return u.role === '总经理';
    case 'system': return true;
    default: return false;
  }
}

function isMyTurn(a) {
  const steps = a.steps || [];
  const currentStep = steps.find(s => !s.done);
  return currentStep && (currentStep.role === 'system' || matchTemplateApprovalRoleFront(currentStep.role));
}

async function approveTemplate(a) {
  let opinion = '同意';
  try {
    const { value } = await ElMessageBox.prompt('审批意见（选填）:', '审批通过', { inputPlaceholder: '同意' });
    opinion = value || '同意';
  } catch { return; }
  const resp = await request.post('/contract-template/approvals/' + a.id + '/approve', { opinion });
  if (resp.code === 200) {
    ElMessage.success(resp.msg || '审批通过');
    loadAll();
  } else {
    ElMessage.error(resp.msg || '操作失败');
  }
}

async function rejectTemplate(a) {
  let remark = '';
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回原因:', '驳回', { inputPlaceholder: '驳回原因' });
    remark = value;
  } catch { return; }
  if (!remark || !remark.trim()) { ElMessage.error('驳回必须填写原因'); return; }
  const resp = await request.post('/contract-template/approvals/' + a.id + '/reject', { remark: remark.trim() });
  if (resp.code === 200) {
    ElMessage.success(resp.msg || '已驳回');
    loadAll();
  } else {
    ElMessage.error(resp.msg || '操作失败');
  }
}

const approvalDlg = reactive({ visible: false, loading: false, data: null });

const approvalChangeData = computed(() => approvalDlg.data?.change_data || {});

const modifyDiffs = computed(() => {
  const a = approvalDlg.data;
  if (!a || a.change_type !== 'modify') return [];
  const cd = a.change_data || {};
  const sd = a.snapshot_data || {};
  const fields = [
    ['name', '模板名称'], ['category', '合同类型'], ['content', '模板内容'], ['applicable_dept', '适用部门']
  ];
  return fields
    .filter(([k]) => cd[k] !== undefined && (sd[k] || '') !== (cd[k] || ''))
    .map(([k, label]) => ({ label, oldVal: sd[k] || '', newVal: cd[k] || '' }));
});

async function viewApprovalDetail(a) {
  approvalDlg.visible = true;
  approvalDlg.loading = true;
  approvalDlg.data = null;
  try {
    const resp = await request.get('/contract-template/approvals/' + a.id);
    if (resp.code !== 200) { ElMessage.error(resp.msg || '加载失败'); approvalDlg.visible = false; return; }
    approvalDlg.data = resp.data;
  } finally {
    approvalDlg.loading = false;
  }
}

onMounted(loadAll);
</script>

<style scoped>
.ct-page { padding: 0; }
.ct-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.ct-header h2 { font-size: 20px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px; }
.ct-muted { color: #9ca3af; }
.ct-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 11px; }

.ct-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
.ct-tab-btn { border-radius: 0; }

.ct-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 24px; }
.ct-kpi-card { display: flex; align-items: center; gap: 12px; padding: 18px; border-radius: 10px; background: #fff; border: 1px solid #e5e7eb; transition: box-shadow .2s; }
.ct-kpi-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.08); }
.ct-kpi-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff; flex-shrink: 0; }
.ct-kpi-body { flex: 1; }
.ct-kpi-value { font-size: 24px; font-weight: 700; line-height: 1; color: #111827; }
.ct-kpi-label { font-size: 12px; color: #6b7280; margin-top: 4px; }

.ct-filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
.ct-search { width: 220px; max-width: 100%; }

.ct-matrix { display: flex; flex-direction: column; gap: 24px; min-height: 120px; }
.ct-matrix-row { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
.ct-matrix-cat-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #f0f4ff; font-size: 14px; font-weight: 600; color: #1e3a5f; border-bottom: 1px solid #e5e7eb; }
.ct-matrix-cat-name { flex: 1; }
.ct-matrix-cat-count { font-size: 12px; color: #6b7280; font-weight: 400; }
.ct-matrix-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; padding: 16px; }

.ct-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; transition: box-shadow .2s, transform .2s; display: flex; flex-direction: column; gap: 10px; }
.ct-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.1); transform: translateY(-2px); }
.ct-card-disabled { opacity: 0.65; }
.ct-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.ct-card-title { font-size: 15px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; word-break: break-word; }
.ct-file-icon { color: #2563eb; font-size: 16px; }
.ct-card-meta { display: flex; gap: 14px; font-size: 12px; color: #6b7280; flex-wrap: wrap; }
.ct-card-meta span { display: inline-flex; align-items: center; gap: 4px; }
.ct-card-desc { font-size: 13px; color: #4b5563; line-height: 1.5; padding: 8px 10px; background: #f9fafb; border-radius: 6px; }
.ct-card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 8px; border-top: 1px solid #f0f0f0; flex-wrap: wrap; gap: 6px; }
.ct-creator { font-size: 11px; color: #9ca3af; display: inline-flex; align-items: center; gap: 4px; }
.ct-card-actions { display: flex; gap: 0; flex-wrap: wrap; }
.ct-card-actions .el-button { margin-left: 0; padding: 4px 6px; }

.ct-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.ct-badge-on { background: #dcfce7; color: #16a34a; }
.ct-badge-off { background: #f3f4f6; color: #6b7280; }

.ct-empty { text-align: center; padding: 60px 20px; color: #9ca3af; }
.ct-empty p { margin: 12px 0 16px; }
.ct-empty-card { text-align: center; padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }

.ct-checkbox-group { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.ct-checkbox { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; cursor: pointer; padding: 4px 10px; border: 1px solid #e5e7eb; border-radius: 6px; transition: all .2s; }
.ct-checkbox:hover { border-color: #2563eb; color: #2563eb; }
.ct-checkbox input { margin: 0; }

.ct-upload-hint { padding: 10px 12px; background: #f0f7ff; border-radius: 6px; font-size: 12px; color: #2563eb; display: flex; align-items: center; gap: 6px; margin-top: 10px; }

.ct-detail-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.ct-detail-table td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; font-size: 13px; vertical-align: top; }
.ct-dt-label { width: 110px; color: #6b7280; font-weight: 600; white-space: nowrap; }
.ct-content-box { max-height: 120px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; background: #f9fafb; padding: 8px 10px; border-radius: 6px; }

.ct-version-section { margin-top: 16px; }
.ct-version-section h4 { font-size: 15px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.ct-version-item { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; }
.ct-ver-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
.ct-ver-num { display: inline-block; padding: 2px 10px; background: #2563eb; color: #fff; border-radius: 12px; font-size: 11px; font-weight: 700; }
.ct-ver-desc { flex: 1; font-size: 13px; color: #111827; }
.ct-ver-meta { display: flex; gap: 14px; font-size: 12px; color: #9ca3af; }
.ct-ver-meta span { display: inline-flex; align-items: center; gap: 4px; }

.ct-approval-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
.ct-ap-field { margin-bottom: 12px; }
.ct-ap-field label { display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 4px; }

.wf-container { overflow-x: auto; padding: 12px 8px; background: #f9fafb; border-radius: 10px; margin-top: 12px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
.wf-node { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border-radius: 8px; border: 1px solid #e5e7eb; background: #f9fafb; }
.wf-node.wf-done { background: #dcfce7; border-color: #86efac; }
.wf-node-icon { font-size: 14px; margin-top: 2px; }
.wf-done .wf-node-icon { color: #16a34a; }
.wf-todo .wf-node-icon { color: #f59e0b; }
.wf-node-title { font-size: 13px; font-weight: 600; }
.wf-node-meta { font-size: 12px; color: #6b7280; }
.wf-node-opinion { font-size: 12px; color: #374151; margin-top: 2px; }

@media (max-width: 768px) {
  .ct-kpi-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .ct-kpi-grid { grid-template-columns: 1fr; }
}
</style>
