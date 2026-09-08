const router = require('express').Router();

// 参考项目全量路由（51 个模块组，挂载在前，与参考后端路径完全一致）
router.use('/', require('./ref'));

// 挂在 /api 根下的端点
router.use('/', require('./auth.routes'));
// 对齐参考项目 /api/auth/* 路径（权限/RBAC/区域等端点）
router.use('/auth', require('./auth.routes'));
router.use('/', require('./stats.routes'));
router.use('/', require('./system.routes'));

// 按资源挂载的端点
router.use('/users', require('./user.routes'));
router.use('/departments', require('./department.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/contracts', require('./contract.routes'));
router.use('/projects', require('./project.routes'));
router.use('/leave', require('./leave.routes'));
router.use('/expense', require('./expense.routes'));
router.use('/purchases', require('./purchase.routes'));
router.use('/businessTrips', require('./trip.routes'));
router.use('/checkin', require('./checkin.routes'));
router.use('/reports', require('./report.routes'));
router.use('/permission', require('./permission.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/sales', require('./sales.routes'));
router.use('/suppliers', require('./supplier.routes'));
router.use('/documents', require('./document.routes'));
router.use('/logistics', require('./logistics.routes'));
router.use('/contract-analytics', require('./contractAnalytics.routes'));
router.use('/contract-risk', require('./contractRisk.routes'));
router.use('/contract-template', require('./contractTemplate.routes'));
router.use('/partner-credit', require('./partnerCredit.routes'));
router.use('/announcement', require('./announcement.routes'));
router.use('/att-archive', require('./attArchive.routes'));
router.use('/trade-customer', require('./tradeCustomer.routes'));
router.use('/trade-supplier', require('./tradeSupplier.routes'));
router.use('/trade-archive', require('./tradeArchive.routes'));
router.use('/trade-finance', require('./tradeFinance.routes'));
router.use('/settings', require('./settings.routes'));

// ===== 009 迁移引入的新模块（对齐参考项目业务逻辑） =====
router.use('/opportunity', require('./opportunity.routes'));   // 商机管理（参考 crm.js /opps）
router.use('/dealer', require('./dealer.routes'));             // 经销商管理（参考 dms.js）
router.use('/bid', require('./bid.routes'));                   // 招投标管理（参考 bid.js + bidgen.js）
router.use('/supply', require('./supply.routes'));             // 渠道履约（参考 dms.js supply 段）
router.use('/payroll', require('./payroll.routes'));           // 薪酬管理（参考 payroll.js + finpay.js）
router.use('/kpi', require('./kpi.routes'));                   // 绩效管理（参考 performance.js）
router.use('/qual', require('./qual.routes'));                 // 资质合规（参考 qual.js）
router.use('/training', require('./training.routes'));         // 员工培训（参考 training.js）
router.use('/market', require('./market.routes'));             // 市场活动（参考 market.js）
router.use('/aftersale', require('./aftersale.routes'));       // 售后服务（参考 crm.js service 段）
router.use('/collab', require('./collab.routes'));             // 协同办公（会议/日程/任务/待办）
router.use('/seal', require('./seal.routes'));                 // 印章管理（参考 office.js seal 段）
router.use('/directory', require('./directory.routes'));       // 内部通讯录（参考 hr.js directory 段）
router.use('/doclib', require('./doclib.routes'));             // 制度中心 + 知识库（参考 office.js）
router.use('/official-tpl', require('./officialTpl.routes'));  // 公文模板库（参考第71轮）
router.use('/archive', require('./archive.routes'));           // 资料档案（参考 archive.js）
router.use('/bizflow', require('./bizflow.routes'));           // 业财一体化（库存/出入库/凭证）
router.use('/accounting', require('./accounting.routes'));     // 业财路径别名（参考 accounting.js）
router.use('/invoicing', require('./invoicing.routes'));       // 进销项发票（参考 invoicing.js）
router.use('/', require('./invoicingAlias.routes'));          // /stock-warn + /fixed-assets 路径别名
router.use('/message', require('./message.routes'));           // 消息中心（参考 message.js）
router.use('/search', require('./search.routes'));             // 全局搜索（参考 search.js）
router.use('/coord', require('./coord.routes'));               // 业务协调中心（参考第70轮）
router.use('/org', require('./org.routes'));                   // 组织架构树/部门设置（参考 auth.js org 段）
router.use('/hr-ext', require('./hrExt.routes'));              // 人事扩展（入职/转正/调岗/离职/招聘）
router.use('/orgchange', require('./orgchange.routes'));       // 组织变更审批（参考 orgchange.js）
router.use('/ops', require('./ops.routes'));                   // 经营驾驶舱（参考 ops.js）
router.use('/qywx', require('./qywx.routes'));                 // 企业微信（参考 qywx.js）
router.use('/audit', require('./audit.routes'));               // 审计日志（参考 audit.js）
router.use('/approvals', require('./approval.routes'));       // 审批中心（参考 approvals.js 49 端点）
router.use('/work-reports', require('./workReport.routes'));   // 工作报告（参考 daily.js work-reports 22 端点）
router.use('/supplies-app', require('./supplyApp.routes'));    // 用品申领（参考 daily.js supplies 6 端点）
router.use('/vehicles-app', require('./vehicleApp.routes'));   // 车辆申请（参考 daily.js vehicles 2 端点）
router.use('/assets-ledger', require('./asset.routes'));       // 资产台账（参考 daily.js assets 3 端点）
router.use('/petty-funds', require('./pettyFund.routes'));     // 备用金（参考 daily.js petty-funds 7 端点）
router.use('/dsvc', require('./datasvc.routes'));              // 数据服务（参考 datasvc.js 8 端点）
router.use('/budgets', require('./budget.routes'));            // 预算管理（参考 budget.js 6 端点）
router.use('/payout', require('./payout.routes'));             // 支付/分成（参考 payout.js 4 端点）

// ===== 第二轮补缺：对齐参考项目根路径的端点 =====
router.use('/', require('./contractArchive.routes'));          // 合同档案（参考 office.js contract-archives 4 端点）
router.use('/', require('./payment.routes'));                  // 回款应收（参考 finance.js payments 4 端点）
router.use('/', require('./meetingNote.routes'));              // 会议纪要（参考 collab.js meeting-notes 2 端点）

// ===== 第三轮补缺：参考项目零散端点（44 个 MISS 收口） =====
router.use('/', require('./round3.routes'));

module.exports = router;
