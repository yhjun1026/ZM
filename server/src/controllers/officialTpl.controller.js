/**
 * 公文书写规范及模板库控制器（迁移自参考项目 routes/office.js /doc-templates 段 + official_tpl_seed.js 第71轮）
 *
 * 对齐参考项目业务逻辑：
 *  - 覆盖 法定公文 15 种（依《党政机关公文处理工作条例》中办发〔2012〕14号 第八条）
 *    + 企业常用文书 15 种，共 30 种；每种七要素：适用范围 / 格式要素 / 结构要素 / 书写规范 / 模板正文 / 常见错误 / 法规依据
 *  - 查阅与「调用」（复制正文）对全员开放；「套用模板生成草稿」需公文起草权限（对齐 requirePerm('official',1)）
 *  - 套用生成 official_docs 草稿：编号 = 收文SW / 发文FW / 内部请示QS + 年月 + 3 位序号，
 *    来文单位固定「四川卓盟科技有限公司」，category 取文种，密级默认「内部」，状态「草稿」（须会签→签发后生效）
 *  - 套用/调用均累加 use_count（使用次数统计）
 *  - 自定义模板按 kind+title 判重；内置模板（builtin=1）禁改禁删
 *  - 内置 30 种幂等补种：按 kind+title 判重（对齐 official_tpl_seed.js）
 *
 * 与参考项目的差异（受当前项目库表约束）：
 *  1) 参考项目模板正文（template）为完整范文（种子文件 839 行），本模块内置 文种/分类/标题/适用范围/结构要素/法规依据，
 *     模板正文按「结构要素」生成标准骨架（占位符待拟稿人填写），不整体搬运范文；
 *  2) 公文签发/废止审批在参考项目由审批引擎驱动，当前项目无联动回调，故本模块只生成「草稿」，后续流转交由公文管理处理。
 *
 * 数据表：official_tpl / official_docs（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const auditLog = require('../utils/audit');

/** 模板分类（对齐 official_tpl_seed.js CAT_LAW / CAT_BIZ） */
const CATS = ['法定公文', '企业常用文书'];
/** 公文类型 → 编号前缀（对齐 office.js seq） */
const DOC_TYPES = { 收文: 'SW', 发文: 'FW', 内部请示: 'QS' };
const SECRET_LEVELS = ['内部', '秘密', '机密'];
/** 公文起草权限（对齐参考 requirePerm('official',1)：总经理/副总/行政人事/法务） */
const DRAFT_ROLES = ['总经理', '副总', '超级管理员', '行政人事部负责人', '法务专员', '部门经理'];

/* ==================== 内置公文规范与模板（30 种，对齐 official_tpl_seed.js GW_TPLS） ==================== */
/* 字段：kind 文种 / cat 分类 / title 标题 / scope 适用范围 / structure 结构要素 / basis 法规依据 */
const GW_TPLS = [
  { kind: '决议', cat: '法定公文', title: '决议（会议讨论通过的重大决策事项）', scope: '适用于会议讨论通过的重大决策事项、重大事项安排，须经会议法定人数表决通过后形成。常见于股东会、董事会、总经理办公会、职工代表大会。', structure: '① 会议依据与通过情况 ② 决议事项（分项列明） ③ 执行要求 ④ 生效说明', basis: '《党政机关公文处理工作条例》（中办发〔2012〕14号）第八条第（一）项' },
  { kind: '决定', cat: '法定公文', title: '决定（重要事项安排与奖惩、变更撤销）', scope: '适用于对重要事项作出安排，奖惩有关单位和人员，变更或者撤销下级机关不适当的决定事项。如人事任免决定、表彰决定、处分决定、机构调整决定。', structure: '① 决定缘由 ② 决定内容（分项列明） ③ 执行要求', basis: '《党政机关公文处理工作条例》第八条第（二）项' },
  { kind: '命令（令）', cat: '法定公文', title: '命令（令）（公布规章、重大强制措施、嘉奖）', scope: '适用于公布行政法规和规章、宣布施行重大强制性措施、批准授予和晋升衔级、嘉奖有关单位和人员。企业场景：发布基本规章制度、任免主要负责人、嘉奖重大贡献者。', structure: '① 令号 ② 发布依据与事项 ③ 施行日期 ④ 签署人署名与日期', basis: '《党政机关公文处理工作条例》第八条第（三）项' },
  { kind: '公报', cat: '法定公文', title: '公报（公开发布重大事项与决定）', scope: '适用于公开发布重要决定或者重大事项。企业场景：年度经营公报、ESG 公报、重大事项结果公报。', structure: '① 标题 ② 导语 ③ 主体（以数据事实为主） ④ 结尾', basis: '《党政机关公文处理工作条例》第八条第（四）项' },
  { kind: '公告', cat: '法定公文', title: '公告（向国内外宣布重要事项）', scope: '适用于向公司内外宣布重要事项或者法定事项。企业场景：更名公告、迁址公告、印章作废公告、证照遗失公告、股权变更公告。', structure: '① 标题 ② 公告缘由与依据 ③ 公告事项（分项） ④ 公告期限与异议受理 ⑤ 落款', basis: '《党政机关公文处理工作条例》第八条第（五）项' },
  { kind: '通告', cat: '法定公文', title: '通告（一定范围内周知或遵守的事项）', scope: '适用于在一定范围内公布应当遵守或者周知的事项。企业场景：办公区管理通告、消防安全通告、系统停机维护通告、节假日放假通告。', structure: '① 通告缘由 ② 通告事项（分条列项） ③ 执行时间与责任部门 ④ 落款', basis: '《党政机关公文处理工作条例》第八条第（六）项' },
  { kind: '意见', cat: '法定公文', title: '意见（对重要问题提出见解和处理办法）', scope: '适用于对重要问题提出见解和处理办法，可上行、下行或平行。企业场景：关于加强应收账款管理的意见、关于优化审批流程的意见。', structure: '① 行文目的与依据 ② 总体要求 ③ 具体意见（分项可操作） ④ 组织保障与落实要求', basis: '《党政机关公文处理工作条例》第八条第（七）项' },
  { kind: '通知', cat: '法定公文', title: '通知（发布要求、批转公文、任免人员）', scope: '适用于发布、传达要求下级执行和有关单位周知或执行的事项，批转转发公文，任免和聘用干部。是使用频率最高的文种。', structure: '① 通知缘由 ② 通知事项（时间/地点/人员/要求） ③ 执行要求与联系人 ④ 落款', basis: '《党政机关公文处理工作条例》第八条第（八）项' },
  { kind: '通报', cat: '法定公文', title: '通报（表彰先进、批评错误、传达情况）', scope: '适用于表彰先进、批评错误、传达重要精神或者情况。企业场景：表彰通报、处罚通报、质量事故通报、安全检查情况通报。', structure: '① 通报缘由 ② 事实经过 ③ 分析评价 ④ 处理或表彰决定 ⑤ 号召或要求', basis: '《党政机关公文处理工作条例》第八条第（九）项' },
  { kind: '报告', cat: '法定公文', title: '报告（向上级汇报工作、反映情况、答复询问）', scope: '适用于向上级汇报工作、反映情况，答复上级询问，属上行文。企业场景：年度工作报告、项目进展报告、专项调查报告、述职报告。', structure: '① 报告缘由 ② 基本情况与主要做法 ③ 存在的主要问题 ④ 下一步打算 ⑤ 结语（特此报告）', basis: '《党政机关公文处理工作条例》第八条第（十）项' },
  { kind: '请示', cat: '法定公文', title: '请示（向上级请求指示、批准）', scope: '适用于向上级请求指示、批准，属上行文，须一文一事。企业场景：预算外支出请示、人员招聘请示、采购超权限请示、合同签署请示。', structure: '① 请示缘由 ② 请示事项（唯一明确） ③ 解决方案与可行性分析 ④ 结语（妥否，请批示） ⑤ 联系人', basis: '《党政机关公文处理工作条例》第八条第（十一）项、第十五条' },
  { kind: '批复', cat: '法定公文', title: '批复（答复下级请示事项）', scope: '适用于答复下级请示事项，属下行文、被动行文。企业场景：对部门请示的批准/不予批准答复、预算批复、项目立项批复。', structure: '① 批复引语 ② 批复意见（同意/原则同意/不同意） ③ 执行要求 ④ 结语（此复）', basis: '《党政机关公文处理工作条例》第八条第（十二）项' },
  { kind: '议案', cat: '法定公文', title: '议案（提请审议事项）', scope: '适用于按法定程序向董事会、股东会或职工代表大会提请审议的事项，如年度预算议案、利润分配议案、重大投资议案。', structure: '① 案由 ② 提案人 ③ 案据（必要性与可行性） ④ 方案（条款化） ⑤ 审议请求', basis: '《党政机关公文处理工作条例》第八条第（十三）项' },
  { kind: '函', cat: '法定公文', title: '函（不相隶属机关之间商洽、询问、答复）', scope: '适用于不相隶属机关之间商洽工作、询问和答复问题、请求批准和答复审批事项。企业场景：商洽函、询价函、催款函、回复函、邀请函。', structure: '① 标题 ② 主送机关（一个） ③ 正文（缘由→事项→希望） ④ 结语 ⑤ 落款', basis: '《党政机关公文处理工作条例》第八条第（十四）项' },
  { kind: '纪要', cat: '法定公文', title: '纪要（记载会议主要情况和议定事项）', scope: '适用于记载会议主要情况和议定事项。企业场景：总经理办公会纪要、专题协调会纪要、项目评审会纪要、招投标评审纪要。', structure: '① 会议基本情况 ② 议题与讨论情况 ③ 议定事项（责任与期限） ④ 分送范围', basis: '《党政机关公文处理工作条例》第八条第（十五）项' },
  { kind: '会议纪要', cat: '企业常用文书', title: '会议纪要（企业内部执行版）', scope: '公司内部日常会议（周例会、月度经营分析会、项目推进会）形成的执行性纪要，侧重任务分派与跟踪闭环。', structure: '① 会议基本信息 ② 上次行动项完成情况 ③ 本次议题与结论 ④ 行动项清单（任务/责任人/时限） ⑤ 下次会议时间', basis: 'GB/T 9704-2012；公司《会议管理办法》' },
  { kind: '工作计划', cat: '企业常用文书', title: '工作计划（年度/季度/月度/周计划）', scope: '对未来一定时期的工作目标、任务、措施、进度作出预先安排。企业场景：年度经营计划、部门月度计划、销售周计划。', structure: '① 上期完成情况 ② 本期目标（量化） ③ 重点任务与措施 ④ 进度安排 ⑤ 风险与应对 ⑥ 资源需求', basis: '公司《全面预算管理办法》《绩效管理办法》' },
  { kind: '工作总结', cat: '企业常用文书', title: '工作总结（年度/季度/专项总结）', scope: '对一定时期工作进行回顾、分析、评价，提炼经验教训。企业场景：年度工作总结、季度述职、项目结项总结。', structure: '① 概述 ② 主要工作与成绩（数据化） ③ 存在不足与原因 ④ 经验体会 ⑤ 改进措施与计划', basis: '公司《绩效管理办法》' },
  { kind: '简报', cat: '企业常用文书', title: '简报（工作动态快速通报）', scope: '简明扼要反映工作动态、经验做法、问题建议，供领导及时掌握情况。企业场景：经营周简报、项目简报、市场动态简报。', structure: '① 报头 ② 本期要目 ③ 主体（动态/数据/问题/建议） ④ 报尾', basis: '公司《信息报送与宣传管理办法》' },
  { kind: '讲话稿', cat: '企业常用文书', title: '讲话稿（会议致辞与发言）', scope: '领导在会议、活动、仪式上的发言稿。企业场景：年度会议讲话、动员会讲话、培训开班讲话、客户答谢会致辞。', structure: '① 称谓 ② 开场 ③ 主体（2—3 部分，各设小标题） ④ 结尾（号召/祝愿）', basis: '公司《会议管理办法》' },
  { kind: '规章制度', cat: '企业常用文书', title: '规章制度（办法 / 规定 / 制度）', scope: '规范公司内部管理事项、具有长期约束力的规范性文件，如《考勤与请休假管理办法》《费用报销管理制度》。', structure: '① 总则 ② 职责分工 ③ 管理内容与流程 ④ 监督与考核 ⑤ 奖惩 ⑥ 附则', basis: '《中华人民共和国公司法》；公司《章程》《制度管理办法》' },
  { kind: '实施细则', cat: '企业常用文书', title: '实施细则（配套操作细则）', scope: '为贯彻实施某一制度而制定的具体、可操作的规定，如《差旅费管理办法实施细则》。', structure: '① 制定依据与目的 ② 具体标准（表格化） ③ 操作流程与时限 ④ 表单与附件 ⑤ 附则', basis: '公司《制度管理办法》' },
  { kind: '工作方案', cat: '企业常用文书', title: '工作方案（实施方案 / 专项方案）', scope: '为完成某项重要任务或活动制定的具体实施安排。企业场景：展会参展方案、系统上线方案、投标工作方案、安全检查方案。', structure: '① 背景与目标 ② 组织机构与职责 ③ 实施内容与步骤 ④ 进度安排 ⑤ 资源与预算 ⑥ 风险与应急预案 ⑦ 效果评估', basis: '公司《全面预算管理办法》' },
  { kind: '签报', cat: '企业常用文书', title: '签报（内部请示报批单）', scope: '公司内部向领导请示、报告并请其签署意见的简便文书，流转快于正式公文。企业场景：费用签报、用印签报、合同会签单。', structure: '① 报批事项 ② 申报部门与经办人 ③ 事项内容（含金额与依据） ④ 会签意见 ⑤ 领导批示 ⑥ 办理结果', basis: '公司《授权审批权限表》《费用报销与备用金管理办法》' },
  { kind: '工作联系单', cat: '企业常用文书', title: '工作联系单（跨部门协同）', scope: '公司内部部门之间商洽、告知、请求配合的简便文书。企业场景：技术支援联系单、发货协调单、资料提供联系单。', structure: '① 编号与发起/接收部门 ② 联系事项 ③ 需配合事项及要求 ④ 接收部门反馈 ⑤ 双方签字', basis: '公司《部门协同与沟通管理办法》' },
  { kind: '授权委托书', cat: '企业常用文书', title: '授权委托书（法人授权 / 个人授权）', scope: '授权他人代为办理特定事务的法律文书。企业场景：投标授权、合同签署授权、银行事务授权、诉讼代理授权。', structure: '① 标题 ② 委托人与受托人信息 ③ 授权事项与权限范围 ④ 授权期限 ⑤ 转授权约定 ⑥ 责任承担 ⑦ 签章与日期', basis: '《中华人民共和国民法典》第一百六十一条至第一百七十五条' },
  { kind: '介绍信', cat: '企业常用文书', title: '介绍信（对外联系与身份介绍）', scope: '介绍本单位人员到外单位联系工作、接洽业务、参加会议、查阅资料的专用书信。', structure: '① 编号 ② 被介绍人姓名与职务 ③ 接洽单位与事由 ④ 有效期 ⑤ 盖章与日期', basis: '公司《印章管理办法》《介绍信与证照使用管理规定》' },
  { kind: '证明信', cat: '企业常用文书', title: '证明信（身份、经历、收入等证明）', scope: '以单位名义证明某人身份、经历、职务、收入、在职状态等事项的书信。企业场景：在职证明、收入证明、离职证明。', structure: '① 标题 ② 被证明人信息 ③ 证明内容 ④ 用途与限制 ⑤ 出具单位与日期', basis: '《中华人民共和国劳动合同法实施条例》第二十四条' },
  { kind: '商务函', cat: '企业常用文书', title: '商务函（询价函 / 报价函 / 催款函）', scope: '对外商务往来中用于询价、报价、洽商、催款、索赔的函件。企业场景：向供应商询价、向客户报价、应收账款催收函。', structure: '① 标题 ② 收件单位 ③ 事实陈述（合同/金额/期限） ④ 具体要求 ⑤ 后果告知 ⑥ 落款', basis: '《中华人民共和国民法典》第五百七十七条、第一百九十五条' },
  { kind: '声明与启事', cat: '企业常用文书', title: '声明 / 启事（公开表明立场或告知事项）', scope: '就特定事项公开表明立场、澄清事实、告知公众的文书。企业场景：印章遗失声明、证照作废声明、侵权维权声明、招聘启事。', structure: '① 标题 ② 事实陈述 ③ 声明内容（立场与效力） ④ 告知事项与联系方式 ⑤ 落款', basis: '《中华人民共和国民法典》第一千零二十四条；《中华人民共和国公司法》' },
];

/** 由结构要素生成模板正文骨架（占位符待拟稿人填写） */
function buildTemplate(t) {
  return `四川卓盟科技有限公司
${t.kind}

卓盟〔2026〕【编号】号

【主送单位/接收对象】：

一、行文缘由
（说明目的、依据与背景：根据……，为……，现就【事项】${t.kind}，内容如下。）

二、具体内容
（按结构要素填写：${t.structure}）

三、执行要求
（明确责任部门/责任人、完成时限、报告要求与联系人。）

特此${['请示'].includes(t.kind) ? '请示，请批示' : ['报告'].includes(t.kind) ? '报告' : '函告'}。

　　　　　　　　　　　　　　四川卓盟科技有限公司
　　　　　　　　　　　　　　2026年【月】月【日】日`;
}

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};

/** 当前登录用户对应的 employee 记录 */
function empOf(req) {
  try {
    const u = db.prepare('SELECT emp_id, name FROM users WHERE id = ?').get(req.userId);
    if (!u) return null;
    return db.prepare('SELECT * FROM employees WHERE emp_no = ? OR name = ?').get(u.emp_id || '', u.name) || null;
  } catch (e) {
    return null;
  }
}
const canDraft = (req) => DRAFT_ROLES.includes(req.user && req.user.role);

/** 公文编号：前缀 + 年月 + 3 位序号（对齐 office.js seq） */
function seqDocNo(prefix) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const cnt = db.prepare('SELECT COUNT(*) c FROM official_docs WHERE doc_no LIKE ?').get(prefix + ym + '%').c;
  return `${prefix}${ym}${String(cnt + 1).padStart(3, '0')}`;
}

/* ==================== 0. 元数据 / 统计 ==================== */

/** 枚举：分类、文种（分分组）、公文类型、密级 */
async function meta(req, res) {
  const kinds = { 法定公文: [], 企业常用文书: [] };
  GW_TPLS.forEach((t) => { if (kinds[t.cat]) kinds[t.cat].push(t.kind); });
  return res.json(ok({
    cats: CATS,
    kinds,
    kind_list: GW_TPLS.map((t) => t.kind),
    doc_types: Object.keys(DOC_TYPES),
    secret_levels: SECRET_LEVELS,
    can_draft: canDraft(req),
    builtin_total: GW_TPLS.length,
  }));
}

/** 统计：模板总数 / 分类分布 / 使用次数合计 / 使用排行（对齐 use_count 统计） */
async function stats(req, res) {
  const total = db.prepare('SELECT COUNT(*) c FROM official_tpl').get().c;
  const builtin = db.prepare('SELECT COUNT(*) c FROM official_tpl WHERE builtin = 1').get().c;
  const custom = db.prepare('SELECT COUNT(*) c FROM official_tpl WHERE builtin = 0').get().c;
  const useSum = db.prepare('SELECT COALESCE(SUM(use_count),0) s FROM official_tpl').get().s;
  const byCat = CATS.map((c) => ({
    cat: c,
    count: db.prepare('SELECT COUNT(*) c FROM official_tpl WHERE cat = ?').get(c).c,
    use_count: db.prepare('SELECT COALESCE(SUM(use_count),0) s FROM official_tpl WHERE cat = ?').get(c).s,
  }));
  const top = db.prepare('SELECT id,tpl_no,kind,cat,title,use_count FROM official_tpl ORDER BY use_count DESC, id LIMIT 8').all();
  const drafts = db.prepare("SELECT COUNT(*) c FROM official_docs WHERE status='草稿'").get().c;
  return res.json(ok({
    total, builtin, custom, use_count: useSum, by_cat: byCat, top, drafts,
  }));
}

/* ==================== 1. 模板查阅 ==================== */

/** 模板列表：分类/文种/关键字筛选（查阅对全员开放，对齐 office.js GET /doc-templates） */
async function list(req, res) {
  const { cat, kind, q } = req.query;
  let sql = `SELECT id,tpl_no,kind,cat,title,scope,builtin,use_count,created_by_name,created_at
    FROM official_tpl WHERE 1 = 1`;
  const p = [];
  if (cat) { sql += ' AND cat = ?'; p.push(cat); }
  if (kind) { sql += ' AND kind = ?'; p.push(kind); }
  if (q) { sql += ' AND (title LIKE ? OR kind LIKE ? OR scope LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY cat DESC, id';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 模板详情：七要素（适用范围/格式要素/结构要素/书写规范/模板正文/常见错误/法规依据） */
async function detail(req, res) {
  const t = db.prepare('SELECT * FROM official_tpl WHERE id = ?').get(req.params.id);
  if (!t) return res.json(notfound('模板不存在'));
  return res.json(ok(t));
}

/* ==================== 2. 套用 / 调用 ==================== */

/** 套用模板生成公文草稿（需起草权限；草稿须经会签→签发后才生效） */
async function useTpl(req, res) {
  if (!canDraft(req)) return res.json(forbidden('套用模板起草公文需公文起草权限（行政人事/法务/管理层）'));
  const t = db.prepare('SELECT * FROM official_tpl WHERE id = ?').get(req.params.id);
  if (!t) return res.json(notfound('模板不存在'));
  const b = req.body || {};
  const docType = Object.keys(DOC_TYPES).includes(b.doc_type) ? b.doc_type : '发文';
  const no = seqDocNo(DOC_TYPES[docType]);
  const emp = empOf(req);
  const info = db.prepare(`INSERT INTO official_docs
      (doc_no,doc_type,title,category,from_org,to_org,urgent,secret_level,summary,content,issuer_id,issuer_name,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'草稿')`)
    .run(no, docType, b.title || t.title, t.kind, '四川卓盟科技有限公司', b.to_org || '',
      '普通', SECRET_LEVELS.includes(b.secret_level) ? b.secret_level : '内部',
      `套用《${t.title}》模板生成`, t.template || '', emp ? emp.id : (empId(req) || null),
      (req.user && req.user.name) || '');
  db.prepare('UPDATE official_tpl SET use_count = use_count + 1 WHERE id = ?').run(t.id);
  auditLog('OFFICIAL_TPL_USE', req.userId, `公文模板#${t.id}`, `套用模板 ${t.kind}｜生成草稿 ${no}（模板：${t.title}）`);
  return res.json(ok({ id: info.lastInsertRowid, doc_no: no, status: '草稿', kind: t.kind, template: t.template },
    `已生成草稿 ${no}`));
}

/** 调用留痕：复制/下载模板正文（无起草权限亦可调用，对齐 office.js /copy） */
async function copyTpl(req, res) {
  const t = db.prepare('SELECT id,kind,title,template,structure,norms,tips FROM official_tpl WHERE id = ?').get(req.params.id);
  if (!t) return res.json(notfound('模板不存在'));
  db.prepare('UPDATE official_tpl SET use_count = use_count + 1 WHERE id = ?').run(t.id);
  auditLog('OFFICIAL_TPL_COPY', req.userId, `公文模板#${t.id}`, `调用模板 ${t.kind}｜${t.title}`);
  return res.json(ok(t, '模板已调用'));
}

/* ==================== 3. 自定义模板维护 ==================== */

/** 新增自定义模板：kind+title 判重；编号 GW-X## */
async function create(req, res) {
  if (!canDraft(req)) return res.json(forbidden('自定义公文模板需公文起草权限'));
  const b = req.body || {};
  if (!b.kind || !b.title) return res.json(bad('文种与标题必填'));
  if (db.prepare('SELECT id FROM official_tpl WHERE kind = ? AND title = ?').get(b.kind, b.title)) {
    return res.json(bad('同名文种模板已存在'));
  }
  const n = db.prepare("SELECT COUNT(*) c FROM official_tpl WHERE tpl_no LIKE 'GW-X%'").get().c + 1;
  const tplNo = 'GW-X' + String(n).padStart(2, '0');
  const emp = empOf(req);
  const info = db.prepare(`INSERT INTO official_tpl
      (tpl_no,kind,cat,title,scope,fmt,structure,norms,template,tips,basis,builtin,created_by,created_by_name,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`)
    .run(tplNo, b.kind, CATS.includes(b.cat) ? b.cat : '企业常用文书', b.title,
      b.scope || '', b.fmt || '', b.structure || '', b.norms || '', b.template || '',
      b.tips || '', b.basis || '', emp ? emp.id : (empId(req) || 0),
      (req.user && req.user.name) || '', localNow());
  auditLog('OFFICIAL_TPL_CREATE', req.userId, `公文模板#${info.lastInsertRowid}`, `新增模板 ${b.kind}｜${b.title}`);
  return res.json(ok({ id: info.lastInsertRowid, tpl_no: tplNo }, '模板已新增'));
}

/** 修改自定义模板：内置模板禁改 */
async function update(req, res) {
  if (!canDraft(req)) return res.json(forbidden('修改公文模板需公文起草权限'));
  const t = db.prepare('SELECT * FROM official_tpl WHERE id = ?').get(req.params.id);
  if (!t) return res.json(notfound('模板不存在'));
  if (t.builtin) return res.json(bad('内置规范模板不可修改，请新建自定义模板'));
  const b = req.body || {};
  db.prepare(`UPDATE official_tpl SET kind=?,cat=?,title=?,scope=?,fmt=?,structure=?,norms=?,template=?,tips=?,basis=? WHERE id=?`)
    .run(b.kind || t.kind, CATS.includes(b.cat) ? b.cat : t.cat, b.title || t.title,
      b.scope !== undefined ? b.scope : t.scope, b.fmt !== undefined ? b.fmt : t.fmt,
      b.structure !== undefined ? b.structure : t.structure, b.norms !== undefined ? b.norms : t.norms,
      b.template !== undefined ? b.template : t.template, b.tips !== undefined ? b.tips : t.tips,
      b.basis !== undefined ? b.basis : t.basis, t.id);
  auditLog('OFFICIAL_TPL_UPDATE', req.userId, `公文模板#${t.id}`, `修改模板 ${t.kind}｜${t.title}`);
  return res.json(ok(null, '模板已更新'));
}

/** 删除自定义模板：内置模板禁删 */
async function remove(req, res) {
  if (!canDraft(req)) return res.json(forbidden('删除公文模板需公文起草权限'));
  const t = db.prepare('SELECT * FROM official_tpl WHERE id = ?').get(req.params.id);
  if (!t) return res.json(notfound('模板不存在'));
  if (t.builtin) return res.json(bad('内置规范模板不可删除'));
  db.prepare('DELETE FROM official_tpl WHERE id = ?').run(t.id);
  auditLog('OFFICIAL_TPL_DELETE', req.userId, `公文模板#${t.id}`, `删除模板 ${t.kind}｜${t.title}`);
  return res.json(ok(null, '模板已删除'));
}

/* ==================== 4. 内置规范与模板补种（对齐 official_tpl_seed.js） ==================== */

/** 幂等补种：按 kind+title 判重，已存在不覆盖；内置模板 builtin=1 */
async function seed(req, res) {
  const has = db.prepare('SELECT id FROM official_tpl WHERE kind = ? AND title = ?');
  const ins = db.prepare(`INSERT INTO official_tpl
      (tpl_no,kind,cat,title,scope,fmt,structure,norms,template,tips,basis,builtin,created_by,created_by_name,created_at)
      VALUES(?,?,?,?,?,'依 GB/T 9704-2012 版式要素',?,?,?,?,?,1,0,?,?)`);
  let made = 0;
  let skip = 0;
  db.transaction(() => {
    GW_TPLS.forEach((t, i) => {
      if (has.get(t.kind, t.title)) { skip++; return; }
      ins.run('GW-' + String(i + 1).padStart(2, '0'), t.kind, t.cat, t.title,
        t.scope || '', t.structure || '', '一文一事、用语准确简洁庄重、数字与金额须核对、涉密按密级标注',
        buildTemplate(t), '常见错误：文种混用、要素缺失、用语口语化、事实与数据未核对、越权签发',
        t.basis || '', (req.user && req.user.name) || '系统内置', localNow());
      made++;
    });
  })();
  const total = db.prepare('SELECT COUNT(*) c FROM official_tpl').get().c;
  auditLog('OFFICIAL_TPL_SEED', req.userId, '公文模板库补种', `新增 ${made} 种 / 已存在 ${skip} 种（内置共 ${GW_TPLS.length} 种）`);
  return res.json(ok({ made, skip, total, builtin: GW_TPLS.length },
    `内置公文模板补种完成：新增 ${made} 种，库内合计 ${total} 种`));
}

module.exports = {
  meta, stats, list, detail, useTpl, copyTpl, create, update, remove, seed,
  GW_TPLS, CATS, DOC_TYPES,
};
