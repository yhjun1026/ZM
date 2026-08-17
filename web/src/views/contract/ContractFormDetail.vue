<template>
  <div v-loading="loading">
    <div style="margin-bottom:16px;">
      <el-button link type="primary" @click="$emit('back')"><el-icon><ArrowLeft /></el-icon> 返回列表</el-button>
    </div>

    <el-alert v-if="isLocked" type="info" :closable="false" style="margin-bottom:16px;">
      <template #title>
        <el-icon style="vertical-align:-2px;"><Lock /></el-icon> 此合同已{{ status }}，全部字段已锁定。如需调整，请通过
        <el-button link type="primary" style="font-weight:600;" @click="$emit('goto', 'changes')">合同变更流程</el-button>发起申请。
      </template>
    </el-alert>
    <el-alert v-else-if="!isDraft" type="warning" :closable="false" style="margin-bottom:16px;"
              :title="`合同处于「${status}」状态，基础字段已锁定，不可直接修改。`" />

    <!-- 权限信息横幅 -->
    <div style="background:linear-gradient(135deg,#f0f4ff,#e0e7ff);border:1px solid #c7d2fe;border-radius:8px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;">
        <el-icon style="color:#4f46e5;"><UserFilled /></el-icon>
        <span style="font-size:13px;color:#4f46e5;font-weight:600;">合同角色：</span>
        <span style="font-size:13px;padding:2px 10px;background:#4f46e5;color:#fff;border-radius:12px;">{{ contractRole || '未分配' }}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;color:#6b7280;">表单权限：</span>
        <span :style="`font-size:13px;padding:2px 10px;background:${formPerm === 'locked' ? '#dc2626' : (formPerm === 'full_edit' || formPerm === 'edit_and_resubmit') ? '#16a34a' : '#f59e0b'};color:#fff;border-radius:12px;`">{{ permLabel }}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;color:#6b7280;">数据范围：</span>
        <span style="font-size:13px;color:#374151;">{{ scopeLabel || '—' }}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;color:#6b7280;">下载：</span>
        <span :style="`font-size:13px;color:${canDownload ? '#16a34a' : '#dc2626'};`">
          <el-icon style="vertical-align:-2px;"><component :is="canDownload ? Check : Close" /></el-icon>
          {{ canDownload ? '允许' : '仅预览' }}
        </span>
      </div>
    </div>

    <!-- 主信息表单 -->
    <div class="cf-form-grid">
      <div class="cf-field">
        <label>合同编号</label>
        <el-input :model-value="data.contract_no || ''" disabled />
        <span class="cf-hint">{{ isNew ? '草稿不生成编号，发起审批后自动生成' : '审批后自动生成' }}</span>
      </div>
      <div class="cf-field">
        <label>合同类型 <span style="color:#ef4444;">*</span></label>
        <el-select v-model="form.contract_type" :disabled="readonly" placeholder="请选择">
          <el-option v-for="t in contractTypes" :key="t" :label="t" :value="t" />
        </el-select>
      </div>
      <div class="cf-field span2">
        <label>合同名称 <span style="color:#ef4444;">*</span></label>
        <el-input v-model="form.contract_name" :disabled="readonly" placeholder="请输入合同名称" />
      </div>
      <div class="cf-field">
        <label>合作方单位 <span style="color:#ef4444;">*</span></label>
        <el-input v-model="form.partner_company" :disabled="readonly" placeholder="请输入合作方单位" />
      </div>
      <div class="cf-field">
        <label>统一社会信用代码</label>
        <el-input v-model="form.social_credit_code" :disabled="readonly" />
      </div>
      <div class="cf-field">
        <label>联系人</label>
        <el-input v-model="form.contact_person" :disabled="readonly" />
      </div>
      <div class="cf-field">
        <label>联系电话</label>
        <el-input v-model="form.contact_phone" :disabled="readonly" />
      </div>
      <div class="cf-field span2">
        <label>合同签订地点</label>
        <el-input v-model="form.sign_location" :disabled="readonly" />
      </div>
      <div class="cf-field">
        <label>合同金额 <span style="color:#ef4444;">*</span></label>
        <el-input v-model="form.amount" type="number" :disabled="readonly" placeholder="0.00" />
      </div>
      <div class="cf-field">
        <label>币种</label>
        <el-select v-model="form.currency" :disabled="readonly">
          <el-option label="人民币 (CNY)" value="人民币" />
          <el-option label="美元 (USD)" value="美元" />
          <el-option label="欧元 (EUR)" value="欧元" />
          <el-option label="港币 (HKD)" value="港币" />
        </el-select>
      </div>
      <div class="cf-field">
        <label>税率</label>
        <el-input v-model="form.tax_rate" :disabled="readonly" placeholder="如: 13%" />
      </div>
      <div class="cf-field">
        <label>含税/不含税</label>
        <el-select v-model="form.tax_inclusive" :disabled="readonly">
          <el-option label="含税" value="含税" />
          <el-option label="不含税" value="不含税" />
        </el-select>
      </div>
      <div class="cf-field span2">
        <label>付款方式</label>
        <el-input v-model="form.payment_method" :disabled="readonly" placeholder="如: 分期付款、一次性付款" />
      </div>
      <div class="cf-field span2">
        <label>付款节点</label>
        <el-input v-model="form.payment_milestones" type="textarea" :rows="3" :disabled="readonly" placeholder="如: 签约付30%，交付付50%，验收付20%" />
      </div>
      <div class="cf-field">
        <label>合同起始日期</label>
        <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" :disabled="readonly" style="width:100%;" />
      </div>
      <div class="cf-field">
        <label>合同到期日期</label>
        <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" :disabled="readonly" style="width:100%;" />
      </div>
      <div class="cf-field">
        <label>履行期限</label>
        <el-input :model-value="duration" disabled />
        <span class="cf-hint">自动计算（到期日-起始日）</span>
      </div>
      <div class="cf-field">
        <label>预算归属部门</label>
        <el-input v-model="form.budget_department" :disabled="readonly" />
      </div>
      <div class="cf-field">
        <label>经办人</label>
        <el-input v-model="form.handler" :disabled="readonly" />
      </div>
      <div class="cf-field">
        <label>经办人ID</label>
        <el-input v-model="form.handler_id" disabled />
      </div>
      <div class="cf-field span2">
        <label>外部备注</label>
        <el-input v-model="form.external_remark" type="textarea" :rows="2" :disabled="readonly" placeholder="对合作方可见的备注信息" />
      </div>
      <div class="cf-field span2">
        <label>内部风险备注</label>
        <el-input v-model="form.internal_risk_remark" type="textarea" :rows="3" :disabled="readonly" placeholder="内部风险提示，不对合作方公开" />
      </div>
    </div>

    <!-- 状态信息 -->
    <div style="margin-top:24px;padding:16px;border-radius:12px;background:#fff;border:1px solid #e5e7eb;">
      <h4 style="margin:0 0 12px;"><el-icon style="vertical-align:-2px;"><InfoFilled /></el-icon> 合同状态信息（系统字段）</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;font-size:13px;">
        <div><span style="color:#909399;">合同状态：</span><strong :style="`color:${statusStrongColor}`">{{ status }}</strong></div>
        <div><span style="color:#909399;">当前审批节点：</span>{{ data.current_approval_node || '—' }}</div>
        <div><span style="color:#909399;">审批流程实例ID：</span><span style="font-family:monospace;">{{ data.approval_flow_id || '—' }}</span></div>
        <div><span style="color:#909399;">创建人：</span>{{ data.created_by || '—' }}</div>
        <div><span style="color:#909399;">创建时间：</span>{{ data.created_at || '—' }}</div>
        <div><span style="color:#909399;">更新人：</span>{{ data.updated_by || '—' }}</div>
        <div><span style="color:#909399;">更新时间：</span>{{ data.updated_at || '—' }}</div>
      </div>
      <!-- 审批流程进度 -->
      <div v-if="hasFlow" style="margin-top:16px;">
        <h5 style="margin:0 0 8px;"><el-icon style="vertical-align:-2px;"><Share /></el-icon> 审批流程进度</h5>
        <div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
          <FlowProgress :flow="data.flow" />
        </div>
      </div>
      <!-- 驳回附件批注 -->
      <div v-if="(data.rejectAttachments || []).length" style="margin-top:12px;">
        <h5 style="margin:0 0 8px;color:#ef4444;"><el-icon style="vertical-align:-2px;"><ChatLineSquare /></el-icon> 驳回附件批注</h5>
        <div v-for="(a, i) in data.rejectAttachments" :key="i"
             style="display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid #fca5a5;border-radius:6px;margin-bottom:4px;background:#fef2f2;">
          <el-icon style="color:#ef4444;"><Document /></el-icon>
          <span style="flex:1;font-size:12px;">{{ a.file_name }}</span>
          <a :href="a.file_path" target="_blank" style="font-size:12px;color:#409eff;">预览</a>
          <span style="font-size:11px;color:#909399;">{{ a.uploader }} {{ a.uploaded_at }}</span>
        </div>
      </div>
      <!-- 抄送记录 -->
      <div v-if="(data.ccRecords || []).length" style="margin-top:12px;">
        <h5 style="margin:0 0 8px;color:#3b82f6;"><el-icon style="vertical-align:-2px;"><Promotion /></el-icon> 审批完成抄送</h5>
        <div v-for="(cc, i) in data.ccRecords" :key="i"
             style="display:flex;align-items:center;gap:8px;padding:4px 12px;font-size:12px;color:#909399;">
          <el-icon><component :is="cc.is_read ? Message : Message" /></el-icon>
          <span>抄送: {{ cc.cc_target_name }}（{{ cc.cc_target }}）</span>
          <span style="font-size:11px;">{{ cc.sent_at }}</span>
        </div>
      </div>
    </div>

    <!-- 附件组区域 -->
    <div style="margin-top:24px;">
      <h4><el-icon style="vertical-align:-2px;"><Paperclip /></el-icon> 附件组</h4>
      <div v-if="canEdit" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
        <div v-for="cat in ['合同草案', '相关资质', '报价资料']" :key="cat" class="upload-card" @click="triggerUpload('attachment', cat)">
          <el-icon style="font-size:24px;color:#409eff;"><UploadFilled /></el-icon>
          <p style="margin:8px 0 0;font-size:13px;">{{ cat }}</p>
          <p style="margin:0;font-size:11px;color:#909399;">点击上传（支持PDF预览）</p>
        </div>
      </div>
      <div v-if="attGroup.length" style="margin-bottom:16px;">
        <h5>已上传附件</h5>
        <div v-for="a in attGroup" :key="a.att_id"
             style="display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
          <el-icon style="color:#ef4444;font-size:20px;"><Document /></el-icon>
          <div style="flex:1;">
            <div style="font-size:13px;">{{ a.name }} <span style="font-size:11px;color:#909399;">({{ a.category }})</span></div>
            <div style="font-size:11px;color:#909399;">上传人: {{ a.uploader }} | 时间: {{ a.uploaded_at }} | {{ (a.size / 1024).toFixed(1) }}KB</div>
          </div>
          <a :href="a.path" target="_blank" style="color:#409eff;font-size:13px;"><el-icon style="vertical-align:-2px;"><View /></el-icon> 预览</a>
          <el-button v-if="canEdit" link type="danger" @click="deleteAttachment(a.att_id)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </div>
    </div>

    <!-- 合同定稿PDF -->
    <div style="margin-top:24px;">
      <h4><el-icon style="vertical-align:-2px;color:#d97706;"><StampIcon /></el-icon> 合同定稿PDF</h4>
      <div v-if="data.final_pdf" style="display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;">
        <el-icon style="color:#ef4444;font-size:20px;"><Document /></el-icon>
        <div style="flex:1;font-size:13px;">合同定稿（审批盖章后上传）</div>
        <a :href="data.final_pdf" target="_blank" style="color:#409eff;font-size:13px;"><el-icon style="vertical-align:-2px;"><View /></el-icon> 预览</a>
        <a v-if="canDownload" :href="data.final_pdf" download style="color:#7c3aed;font-size:13px;"><el-icon style="vertical-align:-2px;"><Download /></el-icon> 下载</a>
      </div>
      <div v-else style="color:#909399;font-size:13px;">
        暂无定稿PDF
        <template v-if="isSealRole && !isNew && (status === '已生效' || status === '执行中')">
          — <el-button link type="primary" @click="triggerUpload('final')"><el-icon><Upload /></el-icon> 上传盖章扫描件</el-button>
        </template>
        <template v-else-if="canCreate && !isNew && !isSealRole && status === '已生效'">
          — <el-button link type="primary" @click="triggerUpload('final')">上传定稿</el-button>
        </template>
      </div>
    </div>

    <!-- 签字盖章版PDF -->
    <div style="margin-top:24px;">
      <h4><el-icon style="vertical-align:-2px;color:#dc2626;"><Document /></el-icon> 签字盖章版PDF</h4>
      <div v-if="data.signed_pdf" style="display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fef2f2;">
        <el-icon style="color:#dc2626;font-size:20px;"><Document /></el-icon>
        <div style="flex:1;font-size:13px;">签字盖章版PDF · {{ data.signed_pdf_by || '' }} · {{ data.signed_pdf_at || '' }}</div>
        <a :href="data.signed_pdf" target="_blank" style="color:#dc2626;font-size:13px;"><el-icon style="vertical-align:-2px;"><View /></el-icon> 预览</a>
        <el-button link style="color:#6366f1;" @click="openSignedHistory"><el-icon><Clock /></el-icon> 版本历史</el-button>
        <el-button v-if="(isSealRole || canCreate) && !isNew" link style="color:#d97706;" @click="triggerUpload('signed')"><el-icon><Upload /></el-icon> 重新上传</el-button>
      </div>
      <div v-else style="color:#909399;font-size:13px;">
        暂无签字盖章版PDF
        <template v-if="(isSealRole || canCreate) && !isNew && ['已生效', '执行中', '已归档'].includes(status)">
          — <el-button link style="color:#dc2626;" @click="triggerUpload('signed')"><el-icon><Upload /></el-icon> 上传签字盖章版</el-button>
        </template>
      </div>
    </div>

    <!-- 用印登记区域（印章管理员专属） -->
    <div v-if="isSealRole && !isNew && (status === '已生效' || status === '执行中')"
         style="margin-top:24px;padding:16px;border:2px solid #d97706;border-radius:12px;background:#fffbeb;">
      <h4 style="margin:0 0 12px;color:#d97706;"><el-icon style="vertical-align:-2px;"><StampIcon /></el-icon> 用印登记</h4>
      <div style="font-size:13px;color:#92400e;margin-bottom:12px;">
        <el-icon style="vertical-align:-2px;"><InfoFilled /></el-icon> 印章管理员可在此上传用印扫描件，记录用印信息。用印前请确认所有审批步骤已通过。
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <el-button color="#d97706" style="color:#fff;" @click="triggerUpload('final')"><el-icon><Upload /></el-icon> 上传用印扫描件</el-button>
        <el-button color="#f59e0b" style="color:#fff;" @click="sealContract"><el-icon><StampIcon /></el-icon> 用印登记</el-button>
        <el-button color="#7c3aed" style="color:#fff;" @click="esignDlg.visible = true"><el-icon><EditPen /></el-icon> 电子签章</el-button>
      </div>
    </div>
    <div v-if="isSealRole && !isNew && (status === '草稿' || status === '审批中')"
         style="margin-top:24px;padding:12px;border:1px dashed #d97706;border-radius:8px;background:#fffbeb;font-size:13px;color:#92400e;">
      <el-icon style="vertical-align:-2px;"><Clock /></el-icon> 用印登记需等待合同审批全部通过后方可操作。
    </div>

    <!-- 附件操作日志 -->
    <div v-if="attLogs.length" style="margin-top:24px;">
      <h4><el-icon style="vertical-align:-2px;"><Clock /></el-icon> 附件操作日志</h4>
      <div style="max-height:200px;overflow-y:auto;">
        <div v-for="(a, i) in attLogs" :key="i"
             :style="`display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;${a.is_deleted ? 'opacity:.5;text-decoration:line-through;' : ''}`">
          <el-icon :style="`color:${a.is_deleted ? '#ef4444' : '#10b981'};`"><component :is="a.is_deleted ? Close : Check" /></el-icon>
          <span style="flex:1;">{{ a.file_name }} ({{ a.file_category }})</span>
          <span style="color:#909399;">{{ a.uploader }} · {{ a.uploaded_at }}{{ a.is_deleted ? ` · 已删除(${a.deleted_by} ${a.deleted_at})` : '' }}</span>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div style="margin-top:24px;display:flex;gap:8px;flex-wrap:wrap;">
      <el-button v-if="isNew" type="primary" @click="saveDraft()"><el-icon><DocumentChecked /></el-icon> 保存草稿</el-button>
      <el-button v-if="canEdit && !isNew" type="primary" @click="saveDraft(data.id)"><el-icon><DocumentChecked /></el-icon> 保存修改</el-button>
      <el-button v-if="canEdit && !isNew" color="#10b981" style="color:#fff;" @click="submitForm"><el-icon><Promotion /></el-icon> 提交审批</el-button>
      <el-button v-if="status === '审批中'" color="#10b981" style="color:#fff;" @click="approveStep"><el-icon><Check /></el-icon> 审批通过</el-button>
      <el-button v-if="status === '审批中'" color="#ef4444" style="color:#fff;" @click="rejectDlg.visible = true"><el-icon><Close /></el-icon> 驳回</el-button>
      <el-button v-if="canArchivePerm && status === '已生效'" color="#6366f1" style="color:#fff;" @click="archiveForm"><el-icon><Box /></el-icon> 归档</el-button>
      <el-button v-if="canArchivePerm && (status === '已生效' || status === '已归档')" color="#9ca3af" style="color:#fff;" @click="voidForm"><el-icon><CircleClose /></el-icon> 作废</el-button>
      <el-button v-if="!isNew && canDownload && data.final_pdf" color="#7c3aed" style="color:#fff;" @click="downloadOriginal"><el-icon><Download /></el-icon> 下载原件</el-button>
      <el-button v-if="!isNew && canPrint" color="#6b7280" style="color:#fff;" @click="printDetail"><el-icon><Printer /></el-icon> 打印</el-button>
    </div>

    <!-- 隐藏文件上传 -->
    <input ref="fileInput" type="file" style="display:none;" @change="onFilePicked" />

    <!-- 电子签章对话框 -->
    <el-dialog v-model="esignDlg.visible" title="电子签章" width="480px">
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#6b21f8;">
        <el-icon style="vertical-align:-2px;"><InfoFilled /></el-icon> 电子签章为预览功能(Stub模式)。实际接入第三方签章服务商后，将自动跳转至签署页面。
      </div>
      <el-form label-width="110px">
        <el-form-item label="签署人姓名" required><el-input v-model="esignDlg.name" placeholder="请输入签署人姓名" /></el-form-item>
        <el-form-item label="签署人手机号" required><el-input v-model="esignDlg.phone" placeholder="请输入手机号" maxlength="11" /></el-form-item>
        <el-form-item label="签署人证件号"><el-input v-model="esignDlg.idNo" placeholder="身份证号（选填）" /></el-form-item>
        <el-form-item label="签章位置">
          <el-select v-model="esignDlg.position" style="width:100%;">
            <el-option label="落款处" value="落款处" />
            <el-option label="骑缝章" value="骑缝章" />
            <el-option label="指定页签章" value="指定页签章" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="esignDlg.visible = false">取消</el-button>
        <el-button color="#7c3aed" style="color:#fff;" :loading="esignDlg.saving" @click="submitEsign"><el-icon><Promotion /></el-icon> 发起签章</el-button>
      </template>
    </el-dialog>

    <!-- 驳回对话框（支持附件批注） -->
    <el-dialog v-model="rejectDlg.visible" title="驳回合同" width="520px">
      <el-form label-width="90px">
        <el-form-item label="驳回原因" required>
          <el-input v-model="rejectDlg.comment" type="textarea" :rows="3" placeholder="请输入驳回原因（必填）" />
        </el-form-item>
        <el-form-item label="附件批注">
          <el-upload multiple :auto-upload="false" :limit="5" :on-change="onRejectFile" :on-remove="onRejectFileRemove" :file-list="rejectDlg.fileList">
            <el-button><el-icon><Paperclip /></el-icon> 选择附件（可选）</el-button>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDlg.visible = false">取消</el-button>
        <el-button type="danger" :loading="rejectDlg.saving" @click="doReject">确认驳回</el-button>
      </template>
    </el-dialog>

    <!-- 签字盖章版PDF版本历史 -->
    <el-dialog v-model="historyDlg.visible" title="签字盖章版PDF版本历史" width="640px">
      <p style="font-size:13px;color:#909399;">当前版本: {{ historyDlg.current ? (historyDlg.uploaded_by || '') + ' · ' + (historyDlg.uploaded_at || '') : '无' }}</p>
      <el-table v-if="historyDlg.history.length" :data="historyDlg.history" size="small" style="margin-top:12px;">
        <el-table-column label="文件名" min-width="200">
          <template #default="{ row }"><el-icon style="color:#dc2626;vertical-align:-2px;"><Document /></el-icon> {{ row.file_name }}</template>
        </el-table-column>
        <el-table-column prop="uploader" label="上传人" width="100" />
        <el-table-column prop="uploaded_at" label="上传时间" width="160" />
        <el-table-column label="操作" width="80">
          <template #default="{ row }"><a :href="row.file_path" target="_blank" style="color:#409eff;"><el-icon style="vertical-align:-2px;"><View /></el-icon> 预览</a></template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无版本历史" :image-size="60" />
      <template #footer><el-button @click="historyDlg.visible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowLeft, Lock, UserFilled, Check, Close, InfoFilled, Share, ChatLineSquare, Promotion,
  Paperclip, UploadFilled, Upload, Document, View, Delete, Download, Clock, EditPen,
  DocumentChecked, Box, CircleClose, Printer, Message,
} from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import FlowProgress from './FlowProgress.vue';
import { canCreateContractForm, canPrintUser, printContractFormDetail } from './utils';

// element-plus 无 stamp 图标，用 Postcard 近似
import { Postcard as StampIcon } from '@element-plus/icons-vue';

const props = defineProps({ id: { type: [String, Number], required: true } });
const emit = defineEmits(['back', 'goto', 'open']);

const auth = useAuthStore();
const u = computed(() => auth.user || {});

const loading = ref(false);
const data = ref({});
const form = reactive({
  contract_type: '', contract_name: '', partner_company: '', social_credit_code: '',
  contact_person: '', contact_phone: '', sign_location: '', amount: '', currency: '人民币',
  tax_rate: '', tax_inclusive: '含税', payment_method: '', payment_milestones: '',
  start_date: '', end_date: '', budget_department: '', handler: '', handler_id: '',
  external_remark: '', internal_risk_remark: '',
});

const contractTypes = ['销售合同', '采购合同', '服务合同', '框架协议', '保密协议', '其他协议'];

const isNew = computed(() => !props.id || props.id === 'new');
const status = computed(() => data.value.contract_status || '草稿');
const isDraft = computed(() => status.value === '草稿');
const isLocked = computed(() => status.value === '已归档' || status.value === '已作废');

const perms = computed(() => data.value._permissions || {});
const contractRole = computed(() => perms.value.contractRole || u.value.contract_role || '');
const formPerm = computed(() => perms.value.formPermission || (isLocked.value ? 'locked' : (isDraft.value ? 'full_edit' : 'view_only')));
const canEdit = computed(() => formPerm.value === 'full_edit' || formPerm.value === 'edit_and_resubmit');
const canEditArchive = computed(() => formPerm.value === 'archive_edit');
const readonly = computed(() => !(canEdit.value || canEditArchive.value));
const canDownload = computed(() => perms.value.canDownload || false);
const canArchivePerm = computed(() => perms.value.canArchive || false);
const dataScope = computed(() => perms.value.dataScope || '');
const isSealRole = computed(() => contractRole.value === '印章管理员');
const canCreate = computed(() => canCreateContractForm(u.value));
const canPrint = computed(() => canPrintUser(u.value));

const permLabelMap = {
  full_edit: '完全编辑', edit_and_resubmit: '驳回重编辑', view_only: '只读',
  view_and_comment: '只读+审核意见', view_and_upload_legal_opinion: '只读+法务意见',
  view_and_fill_finance_opinion: '只读+财务意见', view_and_final_opinion: '只读+终审意见',
  view_and_upload_seal_scan: '只读+用印扫描', archive_edit: '归档编辑', locked: '已锁定',
};
const permLabel = computed(() => permLabelMap[formPerm.value] || formPerm.value);
const scopeLabelMap = { self: '仅本人', dept: '本部门', all: '全部', authorized: '授权范围' };
const scopeLabel = computed(() => scopeLabelMap[dataScope.value] || dataScope.value);

const statusStrongColor = computed(() => ({ '草稿': '#f59e0b', '审批中': '#3b82f6', '已生效': '#10b981', '已归档': '#6366f1' }[status.value] || '#9ca3af'));

const attGroup = computed(() => data.value.attachment_group || []);
const attLogs = computed(() => data.value.attachment_logs || []);
const hasFlow = computed(() => {
  const f = data.value.flow;
  return f && (f.steps || (Array.isArray(f) && f.length));
});

// 履行期限自动计算
const duration = computed(() => {
  const s = form.start_date, e = form.end_date;
  if (!s || !e) return '';
  const sd = new Date(s), ed = new Date(e);
  if (isNaN(sd) || isNaN(ed)) return '日期异常';
  const days = Math.round((ed - sd) / 86400000);
  if (days < 0) return '结束日期早于开始';
  if (days < 30) return days + '天';
  const months = Math.floor(days / 30), remDays = days % 30;
  return months + '个月' + (remDays > 0 ? remDays + '天' : '');
});

async function load() {
  if (isNew.value) {
    data.value = {};
    Object.assign(form, {
      contract_type: '', contract_name: '', partner_company: '', social_credit_code: '',
      contact_person: '', contact_phone: '', sign_location: '', amount: '', currency: '人民币',
      tax_rate: '', tax_inclusive: '含税', payment_method: '', payment_milestones: '',
      start_date: '', end_date: '', budget_department: u.value.dept || '', handler: u.value.name || '',
      handler_id: u.value.id || '', external_remark: '', internal_risk_remark: '',
    });
    return;
  }
  loading.value = true;
  try {
    const r = await request.get('/contract-form/detail/' + props.id);
    if (r.code !== 200) { ElMessage.error('加载失败: ' + (r.msg || '')); emit('back'); return; }
    const d = r.data || {};
    if (d.approval_flow_id) {
      try {
        const fr = await request.get('/flow-contract-new/detail/' + props.id);
        if (fr.code === 200 && fr.data && fr.data.flow) {
          d.flow = fr.data.flow;
          d.rejectAttachments = fr.data.rejectAttachments || [];
          d.ccRecords = fr.data.ccRecords || [];
        }
      } catch (e) { /* ignore */ }
    }
    data.value = d;
    Object.keys(form).forEach((k) => { form[k] = d[k] ?? form[k] ?? ''; });
    if (form.amount === null || form.amount === undefined) form.amount = '';
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ===== 保存草稿 / 修改 =====
async function saveDraft(id) {
  const payload = { ...form, amount: parseFloat(form.amount) || 0 };
  if (!payload.contract_name) { ElMessage.error('合同名称为必填项'); return; }
  if (!payload.partner_company) { ElMessage.error('合作方单位为必填项'); return; }
  try {
    const r = id
      ? await request.put('/contract-form/draft/' + id, payload)
      : await request.post('/contract-form/draft', payload);
    if (r.code === 200) {
      ElMessage.success(id ? '草稿修改已保存' : '草稿创建成功');
      if (!id && r.data?.id) {
        // 新建后切换到该合同详情
        emit('open', r.data.id);
      } else {
        load();
      }
    } else {
      ElMessage.error(r.msg || '保存失败');
    }
  } catch (e) { ElMessage.error('保存异常: ' + e.message); }
}

// ===== 提交审批 =====
async function submitForm() {
  try {
    await ElMessageBox.confirm('提交后将生成合同编号并锁定基础字段，确定提交审批？', '提示', { type: 'warning' });
  } catch { return; }
  try {
    const r = await request.post(`/contract-form/${data.value.id}/submit`);
    if (r.code === 200) { ElMessage.success('已提交审批，合同编号: ' + (r.data?.contract_no || '')); load(); }
    else ElMessage.error(r.msg || '提交失败');
  } catch (e) { ElMessage.error('异常: ' + e.message); }
}

// ===== 审批通过（新流程引擎优先，404 回退旧API） =====
async function approveStep() {
  let comment;
  try {
    const { value } = await ElMessageBox.prompt('请输入审批意见（可选）：', '审批通过', { inputValue: '审批通过' });
    comment = value || '审批通过';
  } catch { return; }
  try {
    const r = await request.post(`/flow-contract-new/${data.value.id}/approve`, { comment });
    if (r.code === 200) { ElMessage.success(r.msg || '审批通过'); load(); return; }
    if (r.code === 404) {
      const r2 = await request.post(`/contract-form/${data.value.id}/approve`, { comment });
      if (r2.code === 200) { ElMessage.success(r2.msg || '审批通过'); load(); }
      else ElMessage.error(r2.msg || '审批失败');
    } else {
      ElMessage.error(r.msg || '审批失败');
    }
  } catch (e) { ElMessage.error('异常: ' + e.message); }
}

// ===== 驳回（支持附件批注） =====
const rejectDlg = reactive({ visible: false, saving: false, comment: '', files: [], fileList: [] });
function onRejectFile(file, fileList) { rejectDlg.files = fileList.map(f => f.raw).filter(Boolean); }
function onRejectFileRemove(file, fileList) { rejectDlg.files = fileList.map(f => f.raw).filter(Boolean); }

async function doReject() {
  const comment = (rejectDlg.comment || '').trim();
  if (!comment) { ElMessage.error('驳回必须填写审核意见'); return; }
  rejectDlg.saving = true;
  try {
    let r;
    if (rejectDlg.files.length > 0) {
      const fd = new FormData();
      fd.append('comment', comment);
      rejectDlg.files.forEach(f => fd.append('attachments', f));
      r = await request.post(`/flow-contract-new/${data.value.id}/reject`, fd);
    } else {
      r = await request.post(`/contract-form/${data.value.id}/reject`, { comment });
    }
    if (r.code === 200) {
      ElMessage.success('已驳回，合同退回经办人草稿状态');
      rejectDlg.visible = false; rejectDlg.comment = ''; rejectDlg.files = []; rejectDlg.fileList = [];
      load();
      return;
    }
    // 回退旧API
    const r2 = await request.post(`/contract-form/${data.value.id}/reject`, { comment });
    if (r2.code === 200) {
      ElMessage.success('已驳回，合同退回草稿状态');
      rejectDlg.visible = false; rejectDlg.comment = ''; rejectDlg.files = []; rejectDlg.fileList = [];
      load();
    } else {
      ElMessage.error(r2.msg || r.msg || '驳回失败');
    }
  } catch (e) { ElMessage.error('异常: ' + e.message); } finally { rejectDlg.saving = false; }
}

// ===== 归档 =====
async function archiveForm() {
  try {
    await ElMessageBox.confirm('归档后全部字段将锁定，仅可通过合同变更流程调整。确定归档？', '提示', { type: 'warning' });
  } catch { return; }
  let remark = '';
  try {
    const { value } = await ElMessageBox.prompt('请输入归档备注（可选）：', '归档备注');
    remark = value || '';
  } catch { /* 用户取消输入仍继续归档 */ }
  try {
    const r = await request.post(`/contract-permissions/archive/${data.value.id}`, { remark });
    if (r.code === 200) { ElMessage.success('合同已归档'); load(); return; }
    ElMessage.error(r.msg || '归档失败');
  } catch (e) {
    try {
      const r2 = await request.post(`/contract-form/${data.value.id}/archive`);
      if (r2.code === 200) { ElMessage.success('合同已归档'); load(); }
      else ElMessage.error(r2.msg || '归档失败');
    } catch (e2) { ElMessage.error('异常: ' + e2.message); }
  }
}

// ===== 作废 =====
async function voidForm() {
  let reason;
  try {
    const { value } = await ElMessageBox.prompt('请输入作废原因：', '作废合同', { inputPlaceholder: '作废原因' });
    reason = value || '';
  } catch { return; }
  try {
    const r = await request.post(`/contract-form/${data.value.id}/void`, { reason });
    if (r.code === 200) { ElMessage.success('合同已作废'); load(); }
    else ElMessage.error(r.msg || '作废失败');
  } catch (e) { ElMessage.error('异常: ' + e.message); }
}

// ===== 用印登记 =====
async function sealContract() {
  let sealNo = '', remark = '';
  try {
    const { value } = await ElMessageBox.prompt('请输入用印编号（可选）：', '用印登记');
    sealNo = value || '';
    const res2 = await ElMessageBox.prompt('请输入用印备注（可选）：', '用印登记');
    remark = res2.value || '';
    await ElMessageBox.confirm('确认进行用印登记？此操作将记录审计日志。', '提示', { type: 'warning' });
  } catch { return; }
  try {
    const r = await request.post(`/contract-permissions/seal/${data.value.id}`, { sealNo, remark });
    if (r.code === 200) { ElMessage.success('用印登记成功'); load(); }
    else ElMessage.error(r.msg || '用印登记失败');
  } catch (e) { ElMessage.error('异常: ' + e.message); }
}

// ===== 电子签章 =====
const esignDlg = reactive({ visible: false, saving: false, name: '', phone: '', idNo: '', position: '落款处' });
async function submitEsign() {
  const name = esignDlg.name.trim(), phone = esignDlg.phone.trim();
  if (!name) { ElMessage.warning('请输入签署人姓名'); return; }
  if (!phone || !/^\d{11}$/.test(phone)) { ElMessage.warning('请输入正确的手机号'); return; }
  esignDlg.saving = true;
  try {
    const r = await request.post(`/contract-permissions/esign/${data.value.id}`, {
      signerName: name, signerPhone: phone, signerIdNo: esignDlg.idNo.trim(), signPosition: esignDlg.position,
    });
    if (r.code === 200) {
      esignDlg.visible = false;
      ElMessage.success('电子签章请求已创建(Stub模式) 请求号: ' + (r.data?.requestId || ''));
      load();
    } else {
      ElMessage.error(r.msg || '电子签章失败');
    }
  } catch (e) { ElMessage.error('异常: ' + e.message); } finally { esignDlg.saving = false; }
}

// ===== 文件上传（附件组 / 定稿PDF / 签字盖章版PDF） =====
const fileInput = ref(null);
const uploadCtx = reactive({ kind: '', category: '' });

function triggerUpload(kind, category) {
  if (isNew.value || !data.value.id) { ElMessage.warning('请先保存草稿再上传附件'); return; }
  uploadCtx.kind = kind;
  uploadCtx.category = category || '';
  const input = fileInput.value;
  if (!input) return;
  input.accept = kind === 'attachment' ? '.pdf,.jpg,.png,.doc,.docx' : '.pdf';
  input.value = '';
  input.click();
}

async function onFilePicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const id = data.value.id;
  const fd = new FormData();
  try {
    let r;
    if (uploadCtx.kind === 'attachment') {
      fd.append('file', file);
      fd.append('category', uploadCtx.category);
      r = await request.post(`/contract-form/${id}/attachment`, fd);
    } else if (uploadCtx.kind === 'final') {
      fd.append('file', file);
      r = await request.post(`/contract-form/${id}/final-pdf`, fd);
    } else if (uploadCtx.kind === 'signed') {
      fd.append('file', file);
      r = await request.post(`/contract-form/${id}/signed-pdf`, fd);
    }
    if (r && r.code === 200) {
      ElMessage.success(uploadCtx.kind === 'attachment' ? '附件上传成功' : uploadCtx.kind === 'final' ? '定稿PDF上传成功' : '签字盖章版PDF上传成功');
      load();
    } else {
      ElMessage.error((r && r.msg) || '上传失败');
    }
  } catch (err) { ElMessage.error('上传异常: ' + err.message); }
}

// ===== 删除附件 =====
async function deleteAttachment(attId) {
  try {
    await ElMessageBox.confirm('删除后保留审计记录。确认删除此附件？', '提示', { type: 'warning' });
  } catch { return; }
  try {
    const r = await request.delete(`/contract-form/${data.value.id}/attachment/${attId}`);
    if (r.code === 200) { ElMessage.success('附件已删除（审计记录保留）'); load(); }
    else ElMessage.error(r.msg || '删除失败');
  } catch (e) { ElMessage.error('异常: ' + e.message); }
}

// ===== 签字盖章版历史 =====
const historyDlg = reactive({ visible: false, current: false, uploaded_by: '', uploaded_at: '', history: [] });
async function openSignedHistory() {
  try {
    const r = await request.get(`/contract-form/${data.value.id}/signed-pdf`);
    if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
    const d = r.data || {};
    historyDlg.current = !!d.current;
    historyDlg.uploaded_by = d.uploaded_by || '';
    historyDlg.uploaded_at = d.uploaded_at || '';
    historyDlg.history = d.history || [];
    historyDlg.visible = true;
  } catch (e) { ElMessage.error('异常: ' + e.message); }
}

// ===== 下载 / 打印 =====
function downloadOriginal() {
  if (data.value.final_pdf) window.open(data.value.final_pdf, '_blank');
}
function printDetail() {
  printContractFormDetail(data.value.id, u.value.name);
}
</script>

<style scoped>
.cf-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cf-field { display: flex; flex-direction: column; gap: 4px; }
.cf-field.span2 { grid-column: 1 / -1; }
.cf-field label { font-size: 13px; font-weight: 500; color: #606266; }
.cf-hint { font-size: 11px; color: #909399; }
.upload-card {
  border: 2px dashed #dcdfe6; border-radius: 12px; padding: 16px; text-align: center; cursor: pointer;
  transition: border-color .2s;
}
.upload-card:hover { border-color: #409eff; }
@media (max-width: 768px) {
  .cf-form-grid { grid-template-columns: 1fr; }
}
</style>
