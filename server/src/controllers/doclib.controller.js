/**
 * 制度与知识库控制器
 * 迁移自参考项目 routes/company.js（制度中心）+ routes/office.js（知识库文档中心 doc_items 段）+ kb_seed.js
 *
 * 对齐参考项目业务逻辑：
 *  - 制度（sys_docs）：分类八类（组织人事/销售管理/经销商管理/财务管理/合同法务/质量合规/行政后勤/信息安全），
 *    状态 现行有效/修订中/已废止/草稿；修订版本号递增（V1.0 → V1.1，对齐 company.js 修订规则）；
 *    废止仅「现行有效」制度可发起；未生效（草稿）制度仅拟稿人/管理层可见
 *  - 知识库（doc_items）：分类/目录/标签/关键词全文检索；列表仅返回「启用」；
 *    涉密文档（秘密/涉密）仅上传者本人与管理层可见可下载；下载计数累计留痕
 *  - 新建/更新知识库文档自动生成版本记录（doc_versions），对齐参考「初始版本/内容更新」
 *  - 制度修订沿用 version 字段递增（V1.0 → V1.1）并写审计，与参考 company.js 一致
 *  - 内置知识库种子幂等补种（按 title 去重，对齐 kb_seed.js）
 *
 * 与参考项目的差异（受当前项目库表约束）：
 *  1) 009 迁移的 sys_docs 无 approval_id / issuer_id / revoked_at 列，故制度的「发布/废止审批」无法落审批单，
 *     本模块改为：发布/修订/废止由管理层（对齐 requirePerm('doc',1)）直接执行并写审计，状态即时生效；
 *     拟稿人用 sys_docs.issuer（姓名）记录，草稿可见性按 issuer 比对当前用户名判定；
 *  2) 版本历史表 doc_versions 仅用于知识库 doc_items（与参考项目一致）：
 *     sys_docs 与 doc_items 主键独立、区间重叠，若共用 doc_id 会串版本，故制度的版本只记 version 字段；
 *  3) 无附件上传目录约定，故不实现 PDF/Word 附件（参考项目 office.js 的 file_b64 逻辑未迁移）。
 *
 * 数据表：sys_docs / doc_items / doc_versions（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const auditLog = require('../utils/audit');

/** 制度分类（对齐参考 company.js 制度中心分类） */
const SYS_CATEGORIES = ['组织人事', '销售管理', '经销商管理', '财务管理', '合同法务', '质量合规', '行政后勤', '信息安全'];
/** 制度状态 */
const SYS_STATUS = ['现行有效', '修订中', '已废止', '草稿'];
/** 知识库分类（对齐 kb_seed.js 实际分类） */
const KB_CATEGORIES = ['法律法规', '质量合规', '产品资料', '制度SOP', '培训材料', '业务模板', '招投标', '售后服务', '财务税务'];
/** 知识库密级 */
const SECRET_LEVELS = ['内部', '秘密', '涉密'];
/** 知识库状态 */
const DOC_STATUS = ['启用', '停用', '归档'];
/** 管理层：制度发布/修订/废止，涉密文档兜底可见（对齐参考 GM/VP/ADM） */
const MANAGE_ROLES = ['总经理', '副总', '超级管理员', '行政人事部负责人'];

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const todayStr = () => localNow().slice(0, 10);

/** 当前登录用户对应的 employee 记录（users.emp_id 为工号，与 employees.emp_no 同值） */
function empOf(req) {
  try {
    const u = db.prepare('SELECT emp_id, name FROM users WHERE id = ?').get(req.userId);
    if (!u) return null;
    return db.prepare('SELECT * FROM employees WHERE emp_no = ? OR name = ?').get(u.emp_id || '', u.name) || null;
  } catch (e) {
    return null;
  }
}
const isManager = (req) => MANAGE_ROLES.includes(req.user && req.user.role);
const empIdOf = (req) => {
  const e = empOf(req);
  return e ? e.id : (empId(req) || null);
};

/** 版本号递增：V1.0 → V1.1（对齐 company.js 修订规则，仅递增次版本号） */
function nextVersion(v) {
  const mv = String(v || 'V1.0').replace('V', '').split('.').map(Number);
  return `V${mv[0] || 1}.${(mv[1] || 0) + 1}`;
}

/* ==================== 内置知识库种子（对齐 kb_seed.js KB_SEED，34 篇） ==================== */
/* 幂等补种：按 title 去重；仅写入标题/分类/目录/标签/关键词/正文，不覆盖用户自建内容 */
const KB_SEED = [
  {
    title: '《医疗器械监督管理条例》要点解读（国务院令第739号）', category: '法律法规', folder: '法律法规/医疗器械',
    tags: '条例,监管,法规,739号令', keywords: '监管条例 注册 备案 经营 使用',
    content: `现行《医疗器械监督管理条例》（2021年6月1日施行）核心要点：
1) 分类管理：按风险程度分一类（备案）、二类（注册）、三类（注册）；
2) 经营环节：经营二、三类须备案/许可，建立进货查验记录与销售记录制度；
3) 使用环节：医疗机构须建立使用质量管理制度，查验合格证明；
4) 网络销售：网络销售主体须为持证经营企业，平台须备案并履行审查义务；
5) 法律责任：违法生产经营按货值金额倍数处罚，严重者吊销证照并追究刑事责任。
学习提示：销售人员在日常业务中务必核验产品注册证/备案凭证，杜绝无证或过期产品流通。`
  },
  {
    title: '《医疗器械经营监督管理办法》经营许可与备案要点', category: '法律法规', folder: '法律法规/医疗器械',
    tags: '经营许可,备案,办法,市场监管', keywords: '经营许可 备案凭证 库房 质量负责人',
    content: `《医疗器械经营监督管理办法》对经营企业的基本要求：
1) 经营第三类医疗器械实行许可管理（经营许可证），第二类实行备案管理（经营备案凭证）；
2) 企业须具备与经营规模、经营范围相适应的经营场所与库房（含冷藏冷冻专项要求）；
3) 须配备与经营类别相适应的质量负责人与质量管理人员，且不得兼职违规；
4) 建立并执行进货查验、销售记录、出库复核、运输与售后服务等质量管理制度；
5) 许可/备案事项发生变更须及时办理变更，证照有效期届满前按规定延续。
实操要点：公司资质由市场部统一归口登记，到期前 90 天启动续证审批，严禁无证或超范围经营。`
  },
  {
    title: '《医疗器械经营质量管理规范》（GSP）现场检查要点', category: '法律法规', folder: '法律法规/医疗器械',
    tags: 'GSP,现场检查,质量管理,规范', keywords: 'GSP 检查 记录 追溯 冷链',
    content: `医疗器械经营质量管理规范核心检查项：
1) 职责与制度：质量管理机构或人员履职，质量管理制度齐全并有效执行；
2) 人员与培训：岗位人员具备相应专业知识，建立培训档案并定期考核；
3) 设施设备：库房分区（待验/合格/不合格/退货）、温湿度监控、避光通风防鼠防虫；
4) 采购与验收：首营企业/首营品种审核，索取并查验注册证/备案凭证、合格证明、随货同行单；
5) 储存与养护：按说明书要求储存，冷链产品全程温度记录可追溯；
6) 销售与售后：销售记录完整（品名/规格/批号/数量/购货单位），安装维修与不良事件报告制度。
应对建议：每季度对照本要点自查一次，缺陷项登记整改台账并留存整改证据。`
  },
  {
    title: '医疗器械唯一标识（UDI）实施要求与业务影响', category: '法律法规', folder: '法律法规/医疗器械',
    tags: 'UDI,追溯,唯一标识,编码', keywords: 'UDI DI PI 追溯 扫码',
    content: `UDI（Unique Device Identification）由产品标识（DI）与生产标识（PI，含批号/序列号/有效期）组成。
要求：注册人/备案人负责创建并上传 UDI 数据至国家数据库；经营企业须在进货验收时核对 UDI，
并在销售/使用环节记录，实现来源可查、去向可追、责任可究。
业务影响：
1) 采购入库环节须扫码或录入 UDI，与随货同行单、注册证信息核对一致；
2) 销售出库单与随货同行单须体现 UDI，医院端扫码入库；
3) 退货、召回时可依 UDI 快速定位批次与流向；
4) 投标文件中须说明 UDI 执行方案与数据对接能力。`
  },
  {
    title: '《反不正当竞争法》与医药器械行业合规销售红线', category: '法律法规', folder: '法律法规/合规',
    tags: '合规,反不正当竞争,商业贿赂,红线', keywords: '商业贿赂 回扣 合规 学术推广',
    content: `销售活动严禁行为（红线）：
1) 以任何名义给予医疗机构工作人员及其亲属财物或其他利益（回扣、提成、旅游、礼品卡等）；
2) 假借学术会议、咨询费、讲课费、赞助科研等名义变相输送利益；
3) 通过第三方（经销商/配送商/会务公司）间接实施商业贿赂；
4) 编造、传播竞争对手虚假信息，侵犯商业秘密。
合规做法：所有费用支出须有真实业务背景、合同、发票与成果证明；学术会议须留存议程、签到、讲稿；
市场费用走「市场费用审批」六级链并上传凭证，接受内审与飞检。违规一经查实按公司制度严肃处理并报监管。`
  },
  {
    title: '《数据安全法》《个人信息保护法》客户信息与患者数据处理规范', category: '法律法规', folder: '法律法规/合规',
    tags: '数据安全,个人信息,隐私,合规', keywords: '个人信息 数据 脱敏 授权',
    content: `业务中接触的客户联系人信息、医院科室信息、临床使用数据等处理要求：
1) 最小必要：仅收集业务必需信息，不得超范围收集；
2) 授权同意：收集个人信息须告知目的、方式、范围并取得同意；
3) 分级管理：客户资料分密级管理，越权访问留痕，导出/打印走「打印下载审批」；
4) 禁止外发：不得通过个人微信/私人邮箱外发客户名单，须使用公司系统或经审批渠道；
5) 患者数据：严禁索取、存储可识别患者身份的诊疗信息；临床演示影像须脱敏后方可用于宣传。
违规处理：数据外泄按重大违规处理，情节严重依法追责。`
  },
  {
    title: '首营企业 / 首营品种审核操作规程', category: '质量合规', folder: '质量合规/首营审核',
    tags: '首营,审核,资质,索证', keywords: '首营企业 首营品种 索证 审核表',
    content: `适用范围：首次从某供货单位采购，或首次采购某医疗器械品种。
审核资料清单：
1) 供货方：营业执照、医疗器械生产/经营许可证或备案凭证、销售人员授权书与身份证复印件；
2) 产品：注册证/备案凭证及其附件（型号规格表）、产品技术要求、说明书与标签样稿、合格证明；
3) 进口产品另须：进口注册证、报关单、检验检疫证明、中文说明书与标签。
流程：采购部收集资料 → 质量部(QA)审核并签署意见 → 质量负责人批准 → 建立首营档案 → 方可采购。
系统操作：供应商/厂家资料在「客户与供应链」中提交「供应商资料审批/厂家资料审批」，通过后生成正式编号生效。`
  },
  {
    title: '冷链（冷藏冷冻）医疗器械储运管理规程', category: '质量合规', folder: '质量合规/冷链',
    tags: '冷链,温湿度,储运,验证', keywords: '冷藏 冷冻 温度记录 冷链箱 验证',
    content: `适用：体外诊断试剂、部分植入材料等需 2~8℃ 或 -20℃ 储运的产品。
要求：
1) 设施：冷库/冷藏柜/冷藏车/保温箱，配备自动温湿度监测与超限报警；
2) 记录：温度自动记录至少每 5~30 分钟一次，数据保存至产品有效期后不少于 2 年；
3) 验证：新建设施或停用超过规定时限须做使用前验证与定期验证，出具验证报告；
4) 运输：装箱前预冷，开箱时限符合要求，随箱放置温度记录仪并留存导出数据；
5) 应急：断电/超温应急预案，超温产品须经质量部评估后方可放行，评估不合格按不合格品处理。`
  },
  {
    title: '医疗器械不良事件监测与报告制度', category: '质量合规', folder: '质量合规/不良事件',
    tags: '不良事件,监测,报告,MDR', keywords: '不良事件 严重伤害 报告 召回',
    content: `定义：获准上市的医疗器械在正常使用情况下发生的、导致或可能导致人体伤害的各种有害事件。
报告要求：
1) 导致死亡或严重伤害的，应在发现后 20 个工作日内报告；
2) 一般的医疗器械不良事件，应在发现后 30 个工作日内报告；
3) 群体不良事件须立即报告并暂停销售使用该批次产品。
公司职责：售后/销售接到医院反馈后 24 小时内报质量部，质量部核实后向监管平台报告并同步注册人/厂家；
对存在缺陷的产品配合召回，建立召回记录；所有报告与处置结果存档备查。`
  },
  {
    title: '不合格品控制与产品召回管理规程', category: '质量合规', folder: '质量合规/不合格品',
    tags: '不合格品,召回,处置,隔离', keywords: '不合格 隔离 召回 销毁 记录',
    content: `不合格品范围：验收不合格、储存养护中发现质量异常、超温超时、过期、被监管通报或召回的产品。
控制要求：
1) 立即移入不合格品区（红色标识）并物理隔离，挂「暂停销售」标记；
2) 质量部在 2 个工作日内出具处理意见（退货/返厂/销毁），销毁须有见证与记录；
3) 已销售的同批次产品须启动追溯与召回，通知购货单位停止使用并限期退回；
4) 建立《不合格品记录》《召回记录》，保存至有效期后不少于 2 年。
系统操作：在「库存与物流」提交库存调整审批，注明不合格原因与处置方式，严禁私自报废或转卖。`
  },
  {
    title: '公司资质证照台账与到期预警管理办法', category: '质量合规', folder: '质量合规/证照',
    tags: '证照,资质,到期,预警', keywords: '许可证 备案凭证 到期 续证 预警',
    content: `台账范围：营业执照、医疗器械经营许可证/备案凭证、产品注册证/备案凭证、厂家授权书、ISO 体系证书等。
管理要求：
1) 市场部为资质归口部门，原件由行政人事部统一保管，扫描件入系统「资质合规」模块；
2) 系统按预警天数自动提醒，到期前 90 天启动续证（走「资质续证审批」：市场部负责人→销售总监→质量负责人→副总→总经理）；
3) 严禁使用过期证照参与投标或供货；投标前须由商务部核验「资质在有效期内」；
4) 证照信息变更（名称/地址/经营范围/法人）须同步更新系统并办理变更登记。`
  },
  {
    title: '彩超产品销售话术手册V2.0', category: '产品资料', folder: '产品资料/彩超',
    tags: '彩超,话术,销售', keywords: 'UM-70 卖点 临床应用 参数',
    content: `UM-70 彩超：高清成像、AI辅助诊断、支持5G远程会诊。核心卖点：1) 造影增强成像 2) 弹性成像 3) 智能测量。
标准话术结构：开场（科室痛点）→ 价值点（图像质量/效率/科研）→ 证据（三甲医院装机案例、论文、参数对比）→ 异议处理 → 推进（演示/试用/立项）。
常见异议：①"已有进口品牌"——强调性价比与本地化 4 小时响应；②"预算不足"——提供分期/租赁/以旧换新方案；
③"担心售后"——出具维保承诺与备件库证明；④"需要招标参数"——提供参数响应表与偏离说明。`
  },
  {
    title: '监护仪产品线与竞品对比速查', category: '产品资料', folder: '产品资料/监护',
    tags: '监护仪,竞品,对比,参数', keywords: '监护仪 参数 对比 迈瑞 理邦',
    content: `公司代理监护仪系列：基础型（六参数）、中端（含 EtCO2/有创血压）、高端（模块化+中央站）。
对比维度：屏幕尺寸与分辨率、参数模块、报警功能、数据存储与联网、电池续航、探头/附件通用性、保修年限、响应速度。
销售建议：① 先问清科室（急诊/ICU/手术室/普通病房）与床位数；② 中央站与联网能力往往是中标关键；
③ 强调附件通用性与耗材成本；④ 提供试用装机与培训，形成使用习惯后再议采购。`
  },
  {
    title: '高值耗材（介入/骨科）产品知识要点', category: '产品资料', folder: '产品资料/耗材',
    tags: '高值耗材,介入,骨科,知识', keywords: '支架 导管 骨科 耗材 规格',
    content: `介入类：冠脉支架（药物洗脱/可吸收）、球囊扩张导管、导丝、指引导管、血管封堵器；
骨科类：创伤（接骨板/髓内钉/螺钉）、脊柱（椎弓根钉/融合器）、关节（髋/膝关节假体）。
关键知识：① 规格型号与适应症匹配（直径/长度/角度）；② 灭菌方式与有效期；③ UDI 与追溯要求；
④ 耗材带量采购（集采）中选情况与价格；⑤ 跟台服务与器械清点流程。
销售要点：高值耗材强调「规格齐全+备货响应+跟台服务」，须提前与手术室/器械科确认备货清单。`
  },
  {
    title: '体外诊断（IVD）试剂与仪器配套销售要点', category: '产品资料', folder: '产品资料/IVD',
    tags: 'IVD,试剂,仪器,检验科', keywords: 'IVD 试剂 装机 冷链 定标',
    content: `IVD 业务模式：仪器装机（投放/租赁/销售）+ 试剂持续消耗，核心是装机后试剂上量。
要点：① 检验科关注精密度、线性范围、定标与质控便利性、试剂开瓶稳定性、LIS 对接；
② 设备科关注采购预算、保修、耗材成本与维修响应；③ 院方关注收费目录与医保编码是否可收费。
冷链：试剂多为 2~8℃ 运输，须提供温度记录与验证报告；近效期试剂须提前 3 个月预警调换。
销售节奏：装机→试运行→室间质评→正式采购→试剂年度框架，注意与检验科保持月度回访。`
  },
  {
    title: '经销商准入管理办法', category: '制度SOP', folder: '制度SOP/经销商管理',
    tags: '准入,经销商,评审', keywords: '证照核验 质量体系 资金实力',
    content: `经销商准入评审流程：资质收集→证照核验→质量体系审查→资金实力评估→渠道能力评估→合规审查→准入评定。
必备资料：营业执照、医疗器械经营许可/备案凭证、法人及联系人身份证明、授权区域与渠道说明、近一年财务报表或银行资信、过往合规记录。
评审标准：A 类（证照齐全、有三甲医院覆盖、无不良记录）可授予独家/优先渠道；
B 类限区域非独家；C 类仅单次项目合作。准入通过后签署《经销商合作协议》与《廉洁合作协议》，生成 Dxxx 编号启用。
年度复评：每 12 个月复评一次，连续两次未达销售目标或有合规问题者降级或终止合作。`
  },
  {
    title: '销售业务费用报销与备用金管理细则', category: '制度SOP', folder: '制度SOP/财务',
    tags: '报销,备用金,差旅,费用', keywords: '报销 差旅费 备用金 核销 发票',
    content: `报销标准：住宿按城市分级（一线 400 元/天、二线 300 元/天、其他 220 元/天）；
市内交通凭票实报实销；招待费须注明客户单位、人数、事由，人均不得超过 150 元。
审批链：≤500 元 所属部门负责人→财务负责人→副总；＞500 元 追加总经理终审。
时限：费用发生后 30 日内提交，跨年费用原则上不予报销。
备用金：单次借支 ≤2 万元，严格 5 级审批（区域负责人→销售总监→财务负责人→副总→总经理）；
用后 15 日内上传凭证核销，未用完部分退回财务，逾期未核销从工资扣回并暂停下次借支。`
  },
  {
    title: '客户拜访与商机跟进作业规范', category: '制度SOP', folder: '制度SOP/销售',
    tags: '拜访,商机,CRM,跟进', keywords: '拜访记录 商机阶段 跟进 周报',
    content: `拜访要求：每人每周有效拜访不少于 8 家次，拜访后 24 小时内在系统录入拜访记录（对象/内容/需求/下一步）。
商机阶段：线索→初步接触→需求确认→价格审批→终端报备→项目立项→投标管理→合同评审→回款跟踪→关闭。
转化规则：价格审批或特价审批通过后，商机自动推进至「投标管理」，概率上调至 70%。
跟进节奏：A 类商机（3 个月内可能落地）每周跟进；B 类（半年）每两周；C 类（一年以上）每月。
禁止：严禁虚报拜访、伪造签到；严禁未经审批口头承诺价格、账期与商务条款，所有承诺须经报价/特价/合同评审审批。`
  },
  {
    title: '印章使用与证照外借管理规定', category: '制度SOP', folder: '制度SOP/行政',
    tags: '印章,证照,用印,外借', keywords: '公章 合同章 用印审批 外借',
    content: `用印范围：合同、授权书、投标文件、资质证明、银行与税务文件、对外公文等。
流程：经办人在系统提交「用印审批」（注明文件名称、份数、用途、相对方），经审批通过后方可到行政人事部用印，
用印时须登记《印章使用登记簿》并由用印人签字，文件扫描件回传系统归档。
禁止：① 空白纸张、空白合同用印；② 未经审批私自拍照外传印章；③ 印章带离公司（确需外带须总经理批准并双人同行）。
证照外借：营业执照、许可证等原件外借须总经理审批，限当日归还，借出期间由借用人承担责任。`
  },
  {
    title: '售后服务与设备报修响应SOP', category: '制度SOP', folder: '制度SOP/售后',
    tags: '售后,报修,响应,维保', keywords: '报修 响应时限 维保 巡检 备件',
    content: `响应时限分级：A 级（设备停机影响临床）2 小时内响应、24 小时内到场；
B 级（功能异常但可用）4 小时响应、48 小时到场；C 级（一般咨询/保养）1 个工作日响应。
流程：医院报修 → 客服登记工单 → 工程师远程诊断 → 派工 → 现场处理 → 填写服务报告 → 客户签字确认 → 回访。
维保：保修期内免费（人为损坏除外），保修期外按维保合同或按次收费；每年提供 2 次预防性巡检（PM）。
备件：常用备件常备库存，缺件时向厂家申请并告知客户到货时间，超期须升级至售后经理与销售总监。`
  },
  {
    title: 'Q3产品培训课件：超声基础', category: '培训材料', folder: '培训材料/产品培训',
    tags: '培训,超声,基础', keywords: '超声成像原理 探头 应用',
    content: `超声成像基础：声学特性、成像模式（B/M/D/彩色多普勒）、探头选型与维护。
探头类型：凸阵（腹部/妇产）、线阵（浅表/血管/肌骨）、相控阵（心脏）、腔内（经阴道/经直肠）。
基本操作：增益/深度/焦点/动态范围调节；伪像识别（混响、声影、增强、镜面）。
维护：探头禁摔禁高温浸泡，使用后用软布清洁并归位；每季度检查线缆与声透镜。`
  },
  {
    title: '新员工入职必修：医疗器械行业与合规基础', category: '培训材料', folder: '培训材料/新员工',
    tags: '新员工,入职,合规,培训', keywords: '入职 合规 行业 基础知识',
    content: `课程目标：30 天内掌握行业基础、公司制度与岗位红线，通过考核后方可独立开展业务。
模块一 行业基础：医疗器械分类、注册与备案、UDI、集采与医院采购流程；
模块二 公司制度：人事、考勤、报销、用印、印章、保密与廉洁；
模块三 合规红线：反商业贿赂、数据与个人信息保护、广告与宣传合规；
模块四 系统操作：审批发起、客户与商机录入、合同与回款、知识库与资质查询。
考核：闭卷考试 80 分及格 + 系统实操演练；未通过者延长试用期一个月并补考。`
  },
  {
    title: '销售进阶：医院采购决策链与科室开发', category: '培训材料', folder: '培训材料/销售技能',
    tags: '销售,决策链,科室,开发', keywords: '决策链 科室主任 设备科 院长 招标',
    content: `医院设备采购典型决策链：使用科室（临床需求/参数）→ 设备科（技术评审/商务）→ 财务/审计（预算与付款）
→ 分管院长/院长办公会（立项与审批）→ 政府采购或招标代理（采购执行）。
开发路径：① 科室主任与骨干（需求发起者，决定参数与品牌倾向）；
② 设备科长/采购（流程把关，关注资质与售后）；③ 分管院长（预算与决策）。
方法：学术先行（科室会、专家共识、试用）→ 参数共建（注意合规，不得指向唯一品牌）→ 立项支持（预算与论证材料）→ 投标响应。
风险提示：严禁以任何形式向决策人输送利益；所有投入须走市场费用审批并留存证据。`
  },
  {
    title: '投标文件模板-医院集采', category: '业务模板', folder: '业务模板/招投标',
    tags: '投标,模板,集采', keywords: '标书 商务 技术 报价',
    content: `医院集采投标文件标准模板：商务部分（资质/业绩）、技术部分（参数响应）、报价部分（分项报价表）、服务承诺。
商务部分：投标函、法定代表人授权书、营业执照与经营/生产许可证、产品注册证与授权书、财务报表、业绩证明（合同关键页）。
技术部分：技术参数响应表（逐条响应，★实质性条款必须正偏离或无偏离）、偏离表、技术方案、实施方案与售后方案。
报价部分：开标一览表、分项报价表（含设备、附件、安装、培训、维保）、质保期与备件价格。
装订与签署：按招标文件要求份数与顺序装订，逐页小签或骑缝章，电子版按要求加密。`
  },
  {
    title: '医院设备科室会宣讲PPT模板与话术', category: '业务模板', folder: '业务模板/市场推广',
    tags: '科室会,PPT,宣讲,学术', keywords: '科室会 学术推广 课件 话术',
    content: `标准结构（15~20 页）：疾病背景与临床痛点 → 技术原理 → 产品核心功能 → 临床证据（文献/案例）→
与现有方案对比（图像质量/效率/成本）→ 科室收益（科研/诊疗量/效率）→ 服务保障 → 下一步（试用/演示）。
宣讲要点：前 3 分钟讲清"对科室有什么好处"，多用对比图与数据，避免堆砌参数。
合规提示：内容须真实、可溯源，不得夸大疗效；涉及病例须脱敏并取得授权；不得在会议中承诺或给付利益。`
  },
  {
    title: '客户询价单与报价单标准模板', category: '业务模板', folder: '业务模板/销售',
    tags: '询价,报价,模板,商务', keywords: '询价单 报价单 有效期 账期',
    content: `询价单要素：客户名称与科室、设备或耗材名称、型号规格、数量、配置要求、交货期、安装与培训要求、质保期、预算区间。
报价单要素：报价单号、有效期（默认 30 天）、分项价格（主机/选配/附件/耗材）、
交货期与交付方式、付款条件（预付款/验收款/质保金）、质保与维保条款、培训条款、报价人与审批人。
规则：所有对客报价须经「报价审批」（按金额分档）或「特价审批」（按折扣分档），审批通过后方可发出；
报价单一经发出不得口头变更，变更须重新审批并出具新版本。`
  },
  {
    title: '设备安装验收单与培训记录模板', category: '业务模板', folder: '业务模板/交付',
    tags: '安装,验收,培训,交付', keywords: '安装验收 培训记录 签字 归档',
    content: `安装验收单要素：合同号、设备名称型号序列号、安装地点与科室、到货日期、安装调试完成日期、
外观与配件清点、性能测试结果（附测试报告）、验收结论、双方签字盖章。
培训记录要素：培训日期与时长、培训对象（科室/姓名/职务）、培训内容（操作/日常维护/报警处理/质控）、
考核结果、培训师与科室负责人签字。
归档：验收单与培训记录扫描件在交付后 5 个工作日内上传系统对应客户档案，作为回款与维保起算依据。`
  },
  {
    title: '政府采购与医院招标常见废标红线自查清单', category: '招投标', folder: '招投标/风险',
    tags: '废标,红线,自查,合规', keywords: '废标 资格性 符合性 保证金 串标',
    content: `资格性审查（不合格直接废标）：营业执照与许可缺失/过期、未在规定平台登记、财务或纳税社保材料缺失、
无产品注册证或授权、联合体未按要求组成、被列入失信名单。
符合性审查：投标文件未按要求签署盖章、投标有效期不足、报价超预算、关键技术参数负偏离、
未提交投标保证金或保函、投标报价出现重大漏项或不一致。
其他红线：串通投标（与其他投标人协商报价、同一 IP/MAC 上传、文件异常一致）、借用资质、弄虚作假。
自查动作：投标前 1 个工作日按本清单逐项打钩，形成《投标自查表》随投标文件归档。`
  },
  {
    title: '技术参数响应与偏离表编制要点', category: '招投标', folder: '招投标/编制',
    tags: '参数响应,偏离表,技术,编制', keywords: '参数响应 偏离 星号条款 证明',
    content: `编制步骤：① 逐条摘录招标文件技术条款并编号；② 标注★（实质性）条款与一般条款；
③ 对照产品注册证附件与技术白皮书填写实际值；④ 响应结论填"无偏离/正偏离/负偏离"；
⑤ 每条响应附证明材料页码（注册证附件、检测报告、白皮书）。
要求：★条款必须无偏离或正偏离，任何负偏离即废标；一般条款负偏离累计超过规定数量也可能被扣分或废标。
禁忌：不得复制招标文件原文而无实际数据；不得填写"完全响应"却无证明；不得虚假响应（属弄虚作假）。`
  },
  {
    title: '投标报价策略与成本测算方法', category: '招投标', folder: '招投标/报价',
    tags: '报价,成本,测算,策略', keywords: '报价策略 成本 毛利 评分',
    content: `成本构成：采购成本（含税）+ 运输保险 + 安装调试 + 培训 + 备件与质保期内预计维修 + 资金占用 + 税费 + 招投标费用。
评分法下的报价策略：① 最低价法——贴近成本，重点控制履约风险；
② 综合评分法（价格分占比通常 30%~60%）——测算价格分曲线，找到"得分/毛利"最优点，而非盲目低价；
③ 有多轮报价时，首轮保留空间，末轮按竞争态势决策。
红线：不得低于成本报价（可能被认定为不正当竞争），不得与其他投标人协商报价（串标）。`
  },
  {
    title: '医疗设备预防性维护（PM）年度计划模板', category: '售后服务', folder: '售后服务/维保',
    tags: 'PM,预防性维护,巡检,计划', keywords: 'PM 巡检 保养 年度计划',
    content: `年度 PM 计划要素：设备清单（名称/型号/序列号/科室/安装日期/保修状态）、巡检频次（A 类设备每季 1 次、B 类每半年 1 次）、
每次巡检项目清单、责任人、计划月份、客户配合事项。
巡检项目：外观与线缆检查、风扇与散热清洁、按键与旋钮功能、图像/参数校准、安全（漏电/接地）检测、
软件版本与数据备份、易损件寿命评估、操作规范复核。
交付：巡检后 3 个工作日内出具《巡检报告》交设备科，异常项纳入维修工单并跟踪闭环；年度汇总形成《设备健康报告》。`
  },
  {
    title: '客户投诉处理与升级机制', category: '售后服务', folder: '售后服务/投诉',
    tags: '投诉,升级,处理,回访', keywords: '投诉 升级 响应 闭环',
    content: `受理：任何渠道（电话/微信/现场）收到的投诉统一登记工单，30 分钟内响应并告知客户受理编号。
分级：一般投诉（服务态度/时效）由客服 24 小时内处理；
严重投诉（设备停机超 48 小时、重复故障、涉及质量安全）升级至售后经理，4 小时内给出方案；
重大投诉（涉及监管部门、媒体或群体事件）立即上报总经理，成立专项小组。
闭环：处理完成后 3 个工作日内回访确认满意度，形成《投诉处理报告》；
按月分析投诉类型与根因，输出改进措施并纳入考核。`
  },
  {
    title: '销售回款与应收账款管理要点', category: '财务税务', folder: '财务税务/回款',
    tags: '回款,应收,账期,催收', keywords: '应收 回款 账期 对账 催收',
    content: `账期政策：经销渠道原则上现款现货或 ≤30 天；医院终端按合同约定（常见 30/60/90 天，含质保金 5%~10%）。
过程管理：① 发货后 5 个工作日内开票并送达，取得签收回执；
② 到期前 7 天提醒客户；③ 逾期 7 天由销售催办，30 天升级区域负责人与销售总监，60 天列入重点清收并暂停新订单；
④ 每季度与客户对账一次，形成对账单双方盖章。
系统操作：回款登记须提交「回款审批」，审批通过后方正式入账并生成凭证；严禁业务员代收现金或私人账户收款。`
  },
  {
    title: '发票开具与红冲（销售退回）操作规范', category: '财务税务', folder: '财务税务/发票',
    tags: '发票,开票,红冲,退货', keywords: '开票 专票 普票 红冲 退货',
    content: `开票申请：销售在「发票管理」提交开票申请（选择应收单、填写开票信息与金额），
走「开票申请审批」（销售线→销售总监→财务负责人，财务发起→副总，>50 万加副总终审）通过后财务开具。
金额不得超出应收未开票余额；已回款部分退款须走线下流程，不得红冲已回款金额。
红冲：销售退货须提交「销售退货审批」（销售总监→财务→副总），通过后系统自动库存回补、冲收入与成本凭证、应收红减。
税率与资料：一般纳税人开具 13% 专票须客户提供完整开票信息；专票丢失须按规定办理《丢失发票已报税证明单》。`
  },
];

/* ==================== 0. 元数据 / 统计 ==================== */

/** 枚举：制度分类/状态、知识库分类/密级/状态，供前端下拉（避免硬编码） */
async function meta(req, res) {
  return res.json(ok({
    sys_categories: SYS_CATEGORIES,
    sys_status: SYS_STATUS,
    kb_categories: KB_CATEGORIES,
    secret_levels: SECRET_LEVELS,
    doc_status: DOC_STATUS,
    can_manage: isManager(req),
    seed_total: KB_SEED.length,
  }));
}

/** 统计：制度数/现行有效/分类分布；知识库条目数/下载量/分类分布 */
async function stats(req, res) {
  const docTotal = db.prepare('SELECT COUNT(*) c FROM sys_docs').get().c;
  const docValid = db.prepare("SELECT COUNT(*) c FROM sys_docs WHERE status='现行有效'").get().c;
  const docRevoked = db.prepare("SELECT COUNT(*) c FROM sys_docs WHERE status='已废止'").get().c;
  const docDraft = db.prepare("SELECT COUNT(*) c FROM sys_docs WHERE status='草稿'").get().c;
  const docByCategory = SYS_CATEGORIES.map((c) => ({
    category: c,
    count: db.prepare('SELECT COUNT(*) c FROM sys_docs WHERE category = ?').get(c).c,
  }));

  const itemTotal = db.prepare("SELECT COUNT(*) c FROM doc_items WHERE status='启用'").get().c;
  const itemAll = db.prepare('SELECT COUNT(*) c FROM doc_items').get().c;
  const downloads = db.prepare('SELECT COALESCE(SUM(download_count),0) s FROM doc_items').get().s;
  const versions = db.prepare('SELECT COUNT(*) c FROM doc_versions').get().c;
  const itemByCategory = db.prepare(
    "SELECT category, COUNT(*) c FROM doc_items WHERE status='启用' GROUP BY category ORDER BY c DESC").all()
    .map((r) => ({ category: r.category, count: r.c }));

  return res.json(ok({
    doc_total: docTotal, doc_valid: docValid, doc_revoked: docRevoked, doc_draft: docDraft,
    doc_by_category: docByCategory,
    item_total: itemTotal, item_all: itemAll, downloads, versions,
    item_by_category: itemByCategory,
  }));
}

/* ==================== 1. 制度中心（sys_docs） ==================== */

/** 制度列表：分类/状态/关键字筛选；未生效（草稿）仅拟稿人/管理层可见（对齐 company.js） */
async function listDocs(req, res) {
  const { category, status, q } = req.query;
  let sql = 'SELECT * FROM sys_docs WHERE 1 = 1';
  const p = [];
  if (!isManager(req)) {
    sql += " AND (status IN ('现行有效','已废止') OR issuer = ?)";
    p.push((req.user && req.user.name) || '');
  }
  if (category) { sql += ' AND category = ?'; p.push(category); }
  if (status) { sql += ' AND status = ?'; p.push(status); }
  if (q) { sql += ' AND (title LIKE ? OR doc_no LIKE ? OR content LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 制度详情（版本沿革见 version 字段与审计日志） */
async function docDetail(req, res) {
  const d = db.prepare('SELECT * FROM sys_docs WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('制度不存在'));
  if (d.status === '草稿' && !isManager(req) && d.issuer !== (req.user && req.user.name)) {
    return res.json(forbidden('该制度尚未发布生效，仅拟稿人/管理层可查看'));
  }
  return res.json(ok(d));
}

/** 发布制度：编号唯一；默认「现行有效」并写发布日期与初始版本 V1.0；传 action=草稿 则存草稿 */
async function createDoc(req, res) {
  if (!isManager(req)) return res.json(forbidden('制度发布仅行政人事部/管理层操作'));
  const b = req.body || {};
  const { title, category, content, version, issuer_dept, action } = b;
  if (!title || !category) return res.json(bad('制度标题与分类必填'));
  if (!SYS_CATEGORIES.includes(category)) return res.json(bad(`制度分类须为：${SYS_CATEGORIES.join('/')}`));

  let docNo = (b.doc_no || '').trim();
  if (!docNo) {
    const n = db.prepare('SELECT COUNT(*) c FROM sys_docs').get().c + 1;
    docNo = 'ZD' + new Date().getFullYear() + String(n).padStart(3, '0');
  }
  if (db.prepare('SELECT id FROM sys_docs WHERE doc_no = ?').get(docNo)) return res.json(bad('制度编号已存在'));

  const isDraft = action === '草稿';
  const ver = version || 'V1.0';
  const emp = empOf(req);
  const info = db.prepare(`INSERT INTO sys_docs
      (doc_no,title,category,version,issuer_dept,issuer,issue_date,status,content)
      VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(docNo, title, category, ver,
      issuer_dept || (emp && emp.title) || (req.user && req.user.dept) || '行政人事部',
      (req.user && req.user.name) || '', isDraft ? '' : todayStr(),
      isDraft ? '草稿' : '现行有效', content || '');
  auditLog('DOCLIB_DOC_PUBLISH', req.userId, `制度#${info.lastInsertRowid}`,
    `${isDraft ? '拟稿' : '发布'}制度 ${docNo} ${title}（${category} ${ver}）`);
  return res.json(ok({ id: info.lastInsertRowid, doc_no: docNo, version: ver },
    isDraft ? '制度草稿已保存' : '制度已发布'));
}

/** 修订制度：内容更新 + 版本号递增（V1.0→V1.1）+ 版本留痕；已废止不可修订 */
async function updateDoc(req, res) {
  if (!isManager(req)) return res.json(forbidden('制度修订仅行政人事部/管理层操作'));
  const d = db.prepare('SELECT * FROM sys_docs WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('制度不存在'));
  if (d.status === '已废止') return res.json(bad('已废止制度不可修订，请发布新制度'));
  const b = req.body || {};
  const newVer = nextVersion(d.version);
  const content = b.content !== undefined ? b.content : d.content;
  db.prepare('UPDATE sys_docs SET title=?, category=?, content=?, version=?, status=? WHERE id=?')
    .run(b.title || d.title, SYS_CATEGORIES.includes(b.category) ? b.category : d.category,
      content, newVer, b.status === '草稿' ? '草稿' : '现行有效', d.id);
  auditLog('DOCLIB_DOC_REVISE', req.userId, `制度#${d.id}`,
    `修订制度 ${d.doc_no} ${d.version}→${newVer}${b.change_note ? `（${b.change_note}）` : ''}`);
  return res.json(ok({ version: newVer }, `制度已修订至 ${newVer}`));
}

/** 废止制度：仅「现行有效」可废止（对齐 company.js /docs/:id/revoke） */
async function revokeDoc(req, res) {
  if (!isManager(req)) return res.json(forbidden('制度废止仅行政人事部/管理层操作'));
  const d = db.prepare('SELECT * FROM sys_docs WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('制度不存在'));
  if (d.status !== '现行有效') return res.json(bad('仅现行有效制度可废止'));
  db.prepare("UPDATE sys_docs SET status='已废止' WHERE id=?").run(d.id);
  auditLog('DOCLIB_DOC_REVOKE', req.userId, `制度#${d.id}`, `废止制度 ${d.doc_no} ${d.title}`);
  return res.json(ok(null, '制度已废止'));
}

/** 查阅制度：返回正文并留痕（对齐 company.js 下载留痕，便于学习情况统计） */
async function readDoc(req, res) {
  const d = db.prepare('SELECT * FROM sys_docs WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('制度不存在'));
  if (d.status === '草稿' && !isManager(req) && d.issuer !== (req.user && req.user.name)) {
    return res.json(forbidden('该制度尚未发布生效，仅拟稿人/管理层可查阅'));
  }
  auditLog('DOCLIB_DOC_READ', req.userId, `制度#${d.id}`, `查阅制度 ${d.doc_no} ${d.title}（${d.version}）`);
  return res.json(ok(d));
}

/* ==================== 2. 知识库（doc_items） ==================== */

/** 知识库列表：仅「启用」；分类/目录/关键字检索；涉密仅上传者本人与管理层可见（对齐 office.js） */
async function listItems(req, res) {
  const { category, folder, q, secret } = req.query;
  let sql = "SELECT * FROM doc_items WHERE status='启用'";
  const p = [];
  if (category) { sql += ' AND category = ?'; p.push(category); }
  if (folder) { sql += ' AND folder LIKE ?'; p.push(`%${folder}%`); }
  if (q) {
    sql += ' AND (title LIKE ? OR tags LIKE ? OR keywords LIKE ? OR content LIKE ?)';
    p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (secret !== 'all') { sql += " AND (secret_level='内部' OR uploader_id = ?)"; p.push(empIdOf(req)); }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 知识库详情：含版本历史；涉密校验（对齐 office.js 403 口径） */
async function itemDetail(req, res) {
  const d = db.prepare('SELECT * FROM doc_items WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('文档不存在'));
  if (d.secret_level !== '内部' && d.uploader_id !== empIdOf(req) && !isManager(req)) {
    return res.json(forbidden('涉密文档无查看权限'));
  }
  const versions = db.prepare('SELECT * FROM doc_versions WHERE doc_id = ? ORDER BY id DESC').all(d.id);
  return res.json(ok({ ...d, versions }));
}

/** 上传文档：标题与分类必填；自动生成 V1.0 初始版本 */
async function createItem(req, res) {
  const b = req.body || {};
  const { title, category, folder, tags, keywords, content, secret_level } = b;
  if (!title || !category) return res.json(bad('标题与分类必填'));
  if (!KB_CATEGORIES.includes(category)) return res.json(bad(`知识库分类须为：${KB_CATEGORIES.join('/')}`));
  const emp = empOf(req);
  const info = db.prepare(`INSERT INTO doc_items
      (title,category,folder,version,tags,keywords,content,secret_level,uploader_id,uploader_name,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,'启用')`)
    .run(title, category, folder || '通用', 'V1.0', tags || '', keywords || '', content || '',
      SECRET_LEVELS.includes(secret_level) ? secret_level : '内部',
      emp ? emp.id : empIdOf(req), (req.user && req.user.name) || '');
  db.prepare('INSERT INTO doc_versions(doc_id,version,change_note,content,created_by) VALUES(?,?,?,?,?)')
    .run(info.lastInsertRowid, 'V1.0', '初始版本', content || '', empIdOf(req));
  auditLog('DOCLIB_ITEM_CREATE', req.userId, `知识库#${info.lastInsertRowid}`, `上传文档 [${category}] ${title} V1.0`);
  return res.json(ok({ id: info.lastInsertRowid }, '文档已上传'));
}

/** 更新文档：内容更新并自动递增版本（V1.0 → V1.1），对齐 office.js 版本规则 */
async function updateItem(req, res) {
  const d = db.prepare('SELECT * FROM doc_items WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('文档不存在'));
  if (d.secret_level !== '内部' && d.uploader_id !== empIdOf(req) && !isManager(req)) {
    return res.json(forbidden('涉密文档无修改权限'));
  }
  const b = req.body || {};
  const newVer = nextVersion(d.version);
  const content = b.content !== undefined ? b.content : d.content;
  db.prepare('UPDATE doc_items SET title=?, content=?, tags=?, keywords=?, category=?, version=?, status=?, updated_at=? WHERE id=?')
    .run(b.title || d.title, content,
      b.tags !== undefined ? b.tags : d.tags,
      b.keywords !== undefined ? b.keywords : d.keywords,
      KB_CATEGORIES.includes(b.category) ? b.category : d.category,
      newVer, DOC_STATUS.includes(b.status) ? b.status : d.status, localNow(), d.id);
  db.prepare('INSERT INTO doc_versions(doc_id,version,change_note,content,created_by) VALUES(?,?,?,?,?)')
    .run(d.id, newVer, b.change_note || '内容更新', content, empIdOf(req));
  auditLog('DOCLIB_ITEM_UPDATE', req.userId, `知识库#${d.id}`, `更新文档 ${d.title} ${d.version}→${newVer}`);
  return res.json(ok({ version: newVer }, `文档已更新至 ${newVer}`));
}

/** 下载文档：计数 +1 并留痕；涉密仅上传者/管理层可下载（对齐 office.js） */
async function downloadItem(req, res) {
  const d = db.prepare('SELECT * FROM doc_items WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('文档不存在'));
  if (d.secret_level !== '内部' && d.uploader_id !== empIdOf(req) && !isManager(req)) {
    return res.json(forbidden('涉密文档无下载权限'));
  }
  db.prepare('UPDATE doc_items SET download_count = download_count + 1 WHERE id = ?').run(d.id);
  auditLog('DOCLIB_ITEM_DOWNLOAD', req.userId, `知识库#${d.id}`, `下载文档 ${d.title} (${d.version})`);
  return res.json(ok({ download_count: (d.download_count || 0) + 1, content: d.content }));
}

/* ==================== 3. 内置知识库补种（对齐 kb_seed.js） ==================== */

/** 幂等补种：按 title 去重，已存在不覆盖；返回新增条数与库内总数 */
async function seed(req, res) {
  const has = db.prepare('SELECT id FROM doc_items WHERE title = ?');
  const ins = db.prepare(`INSERT INTO doc_items(title,category,folder,version,tags,keywords,content,secret_level,uploader_id,uploader_name,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,'启用')`);
  const insV = db.prepare('INSERT INTO doc_versions(doc_id,version,change_note,content,created_by) VALUES(?,?,?,?,?)');
  const uid = empIdOf(req);
  const uname = (req.user && req.user.name) || '系统内置';
  let made = 0;
  db.transaction(() => {
    for (const d of KB_SEED) {
      if (has.get(d.title)) continue;
      const info = ins.run(d.title, d.category, d.folder || '通用', 'V1.0', d.tags || '', d.keywords || '',
        d.content, '内部', uid, uname);
      insV.run(info.lastInsertRowid, 'V1.0', '内置知识库初始版本', d.content, uid);
      made++;
    }
  })();
  const total = db.prepare('SELECT COUNT(*) c FROM doc_items').get().c;
  auditLog('DOCLIB_SEED', req.userId, '知识库补种', `新增 ${made} 篇（内置共 ${KB_SEED.length} 篇，库内合计 ${total} 篇）`);
  return res.json(ok({ added: made, total, builtin: KB_SEED.length },
    `内置知识库补种完成：新增 ${made} 篇，库内合计 ${total} 篇`));
}

module.exports = {
  meta, stats,
  listDocs, docDetail, createDoc, updateDoc, revokeDoc, readDoc,
  listItems, itemDetail, createItem, updateItem, downloadItem,
  seed, KB_SEED, SYS_CATEGORIES, KB_CATEGORIES,
};
