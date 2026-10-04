"""Reproducible competition PDF and editable Markdown, no provider calls."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/competition'
FONT = Path('C:/Windows/Fonts/simsun.ttc')
pdfmetrics.registerFont(TTFont('Song', str(FONT), subfontIndex=0))
TEAL = colors.HexColor('#17685b')
INK = colors.HexColor('#24332f')
MUTED = colors.HexColor('#66716b')
PAPER = colors.HexColor('#fbfaf6')
STYLE = ParagraphStyle('body', fontName='Song', fontSize=12.2, leading=22, textColor=INK, wordWrap='CJK')
SMALL = ParagraphStyle('small', parent=STYLE, fontSize=10, leading=16)
HEAD = ParagraphStyle('head', parent=SMALL, textColor=colors.white)
TITLE = ParagraphStyle('title', parent=STYLE, fontSize=26, leading=35, textColor=TEAL)

# Each section owns one page. Experiments retain original denominators and failures.
PAGES = [
('FileMind AI', 'Competition Delivery / v1.0.0-rc.1', [
 '从分散的个人文件到可核对、可恢复的知识工作区。FileMind 将人工审阅的整理 Agent、文档与图像知识提取、Adaptive RAG 和逐句事实门连接在一个可搬运的 Windows 应用中。',
 '本报告记录截至 2026-10-04 的代码、实验与交付边界。版本是候选包编号，当前结论为 NOT READY：新的真实模型抽验未通过，线上主 Demo 与完整 preflight 尚未完成。',
 '作者信息：仓库维护者 s0nggv0。正式队名、学校、成员姓名与分工未提供，提交前需要补齐。全文不把历史验收、脚本化模型响应或错误注入当作当前线上成功。'],
 [('材料', '范围'), ('技术报告', '24 页；保留可编辑 Markdown 和生成脚本'), ('比赛演示', '6:10 视频稿、12 页答辩提纲、36 项 Q&A'), ('真实模型预算', '最多 6 次；已用满；停止新增调用')],
 '仓库：github.com/s0nggv0/FileMind-AI；完整实验数据保存在 docs/evaluation。'),
('项目概览', '01 / Overview', [
 '用户上传 PDF、DOCX、TXT、Markdown 和图片，在 Workspace 中启动整理。系统读取资料并给出分类、摘要、标签及命名建议；用户在 Review 修改或拒绝后，Apply 才写入工作区。Library 显示实际索引状态，Search 提供 Find 与 Ask，引用能够回到原文或原图。',
 '项目将“检索到了资料”和“能够发布答案”分开。Ask 在证据检查、生成、引用有效性与 claim 支持检查后才发布；不足时明确拒答，网络或 schema 失败时报告 unavailable。冲突保留双方来源，歧义先提出选择。',
 'Phase 9 以交付和缺陷修复为范围：没有更换模型、数据库、Embedding、chunk 参数、Router 或视觉系统。改动针对 Phase 8 暴露的冲突状态、澄清流程、数字验证边界以及比赛模式诚实性。'],
 [('核心任务', '可审阅结果'), ('整理', '建议与执行分离、明确人工确认'), ('问答', '来源与状态同时呈现'), ('交付', '候选运行包、恢复与备份、材料可核对')], '最终标准由全部 release gates 决定，版本号本身不能证明验收通过。'),
('问题与用户需求', '02 / Problem', [
 '个人资料同时存在于文档、课堂板书、截图和临时笔记中。文件夹命名只能描述位置，不能告诉用户某个结论出现在哪里；图像中的文字和图示也难以直接搜索。用户需要保留原件并在回答时确认出处。',
 '第二个问题是自动化的控制权。模型可以提出整理方案，但错误命名、分类或清理会影响资料可发现性。项目因此把 Review 作为明确的执行边界；对于版本冲突，系统不根据文件新旧自行推定正确版本。',
 '第三个问题是本地产品的可靠性：身份依赖浏览器状态，原件在文件系统、知识在数据库，搬运与崩溃都可能破坏一致性。恢复密钥、校验备份、操作 journal 和专用 Demo 身份组成已实现的保护措施。它们各有边界，并非完整账号系统或加密云盘。'],
 [('需求', '验收关注'), ('找得到', '文档与图像来源、词法与语义'), ('信得过', '逐句引用、冲突、拒答、错误状态'), ('能控制', 'Review、Apply、清理确认'), ('能恢复', '备份校验、身份恢复、启动修复')], '目标用户场景是个人知识工作区；大型企业知识库性能与多人协同尚未验证。'),
('范围与验收契约', '03 / Requirements', [
 '本阶段的产品约束是保留已有架构，修复可复现缺陷并提供可审阅的交付材料。五份用户原有未提交文档必须保留，根 README 不被覆盖；比赛说明单独维护在 docs/competition/README.md。',
 '比赛模式必须要求真实 AI，并禁用开发错误注入、状态预览以及本地 Mock 替代路径。缺少 Kimi 或 Embedding 时保留真实故障，不将降级结果标作线上 AI。普通用户数据与专用 Demo Reset 隔离。',
 'Release gate 包含 build、TypeScript、lint、单元、浏览器、Demo、Recovery、Backup、Security 与 preflight。当前局部验收通过不能覆盖未完成的云端验收。每个失败或未执行项都保留证据类型和原因，Phase 8 盲测原始结果不回写。'],
 [('证据类型', '能够证明 / 不能证明'), ('本地脚本化响应', '状态管线与防护 / 真实语义准确率'), ('浏览器响应注入', '交互与布局 / 云端生成成功'), ('真实历史 receipt', '当时的验收 / 当前候选包复验'), ('无密钥新环境', '初始化与诚实失败 / READY')], 'Phase 9 不自动进入 Phase 10；后续线上验收需要新的用户授权预算。'),
('产品与核心流程', '04 / Product', [
 'Landing、Dashboard、Workspace、Library、Search、Graph、Cleanup 与 Settings 构成现有产品。Workspace 完成上传、进度与 Review；Library 展示资料和索引；Search 负责查询、回答及来源抽屉；Graph 展示已有概念关系，Cleanup 展示真实候选并要求确认。',
 '答案状态由服务端结构化数据产生。answered 显示通过门控的答案，no_answer 显示不足说明，needs_clarification 显示问题和选项，conflicting 展示不同来源和值，error 对应服务不可用。界面保留等待、取消、重试和来源查看。',
 '澄清时不先显示一个未经选择的 AI Answer。用户点击选项后，服务端从当前身份可访问的已存 Search Run 解析文档范围，再检索和生成；客户端无法提交任意文档 ID 来扩大权限。保存后的选择状态可重新加载。'],
 [('流程', '控制点'), ('Upload -> Agent -> Review', '建议可修改或拒绝'), ('Apply -> Index -> Ask', '索引状态与来源可检查'), ('Clarify -> Select -> Ask', '保存选项绑定到当前租户'), ('Conflict -> Sources', '并列展示，不自动定夺')], '五个状态是新运行时结果；旧保存结果通过可选字段兼容读取。'),
('系统总体架构', '05 / Architecture', [
 'Next.js、React 与 TypeScript 提供界面和服务路由。FileMind Agent 通过 Tool Registry 调用文档处理与组织工具；Document Pipeline 处理文本格式以及图像 OCR / Vision；知识层维护 chunks、Embedding、检索策略和引用。',
 'AI 层分别接入 Kimi 文本模型、Kimi Vision、Tesseract 本地 OCR 和 DashScope Embedding。PostgreSQL 持久化租户工作区与知识，PrivateFileStorage 保留原件，PortableVectorStore 使用本地持久化与扫描检索。安全边界贯穿人工确认、隔离、事实门和恢复。',
 '架构图描述已实现模块，不把预留 Provider 或未来可选后端画成在用能力。图中层间箭头是职责流向；实际操作仍需通过服务端鉴权、revision 与操作锁。'],
 [], '独立的一页 SVG / PNG 为同一架构，可用于 PPT 和提交材料。'),
('FileMind Agent', '06 / Agent Workflow', [
 'Agent 由规划、有限工具执行和 Review 构成。工具调用通过注册表和参数 schema 约束，执行具有进度、超时与恢复状态；方案校验失败会显示实际诊断，不能描述为成功的 LLM 规划。',
 'Review 是用户控制实际改动的边界。模型输出只形成建议；Apply 根据用户确认的结果更新 workspace，并与持久化 revision 校验结合。文件清理不在生成回答时自动发生，图谱与分类也不授予模型任意文件系统访问。',
 'Competition Mode 禁止执行已保存的实验 Mock run，也禁止 continueLocally 将 Mock 组织冒充真实 AI。网络故障时界面报告 Cloud AI provider unavailable；用户仍能查看此前保存和本地可用的真实资料。'],
 [('阶段', '结果与约束'), ('Plan', '结构化方案，schema 校验'), ('Execute tools', '有限注册工具、超时、操作记录'), ('Review', '修改或拒绝建议'), ('Apply', '确认后执行、revision 与持久化')], '工具执行与人审边界是控制风险的设计，不保证模型方案总是正确。'),
('Document Pipeline', '07 / Ingestion', [
 '文本格式通过现有 PDF.js、Mammoth 与文本处理路径提取内容。原始文件保留在私有存储；资料记录、解析结果与索引状态分开保存，以便缺失原件时仍能说明已提取知识的存在与边界。',
 'chunk-v1 的目标长度为 800 tokens，最大 1000，重叠 100。Embedding 使用 qwen3.7-text-embedding-flash / 1024 维。批处理、并发、缓存与重试由现有索引实现管理，Phase 9 没有用新盲测内容调这些参数。',
 '索引构建使用独立 build 与发布边界：未发布构建不供查询，真实资料变化后不能把旧 ready 版本当成新资料索引。原件缺失、提取失败与向量失败有各自状态，维护界面显示实际健康问题，不静默补造原文。'],
 [('数据', '角色'), ('Original', '私有文件与原图核对'), ('Extracted text', '解析知识与全文片段'), ('Chunks + vectors', '冻结参数的检索单元'), ('Index build', '准备与发布分开、版本核对')], '复杂扫描 PDF、手写识别及大规模容量仍是产品限制，不能仅凭简短 fixtures 宣称通用能力。'),
('RAG 与事实发布门', '08 / Grounded Answers', [
 'Ask 先获取当前租户证据，EvidenceSufficiencyEvaluator 判断是否具备回答基础。生成以有界证据为上下文，使用结构化句子与来源标识。引用门重新读取数据库与原件关系，防止过期 revision、跨租户来源或虚构位置进入答案。',
 'AnswerVerifier 提取 claims，检查每个 claim 的 citation、证据支持、数字一致性及冲突披露。发布后的文本才进入界面，不流式展示尚未通过验证的草稿；必要修正有界，失败结果不会记作正确答案。',
 'Phase 9 在多文档、非 Mock 回答前新增结构化上下文检查，识别来源差异和实体歧义。它增加一个真实模型调用，依赖 schema 兼容性。六次线上尝试均无有效结构化对象，随后采用扁平 wire schema，但这项兼容修复尚未做线上复验。'],
 [('顺序', '检查'), ('Retrieve / sufficiency', '当前证据与不足判断'), ('Context / Generate', '差异、歧义与结构化草稿'), ('Citation / Claim / Number', '来源、支持与数量'), ('Publish', '已核对答案或明确未发布状态')], '同一 Kimi 家族参与生成与自动判定可能产生相关误差，需要人工与独立评估补充。'),
('Multimodal Knowledge', '09 / Images', [
 '图片进入两个互补路径：Tesseract 从本地打包语言数据提取可见文字；Kimi Vision 给出图示理解。OCR 转录和 AI interpretation 在 schema 与界面中区分，图像 citation 回到原图以便核对。',
 'OCR 不需要在线下载语言数据，Worker、WASM 与 eng / chi_sim 随可搬运包携带。Vision 仍要求真实云凭据与已有验证 marker。若只有 OCR 成功，界面不能宣称理解了图形；若只有 Vision 成功，不能宣称得到准确转录。',
 'Phase 8 首次盲测包含 18 张图像、37 道图像相关题，首次 OCR 与 Vision 状态均 ready，图像 Hit@5 为 100%。这只描述该原创合成数据集。Phase 9 新环境真实本地 OCR 通过，未在六次预算之外增加 Vision 调用。'],
 [('路径', '证据边界'), ('OCR', '可见字符与 confidence'), ('Vision', '模型解释与图示理解'), ('原图', '人工核对来源'), ('Unavailable', '保留原件，不造图像知识')], '手写、密集图表、照片反光及解释可靠性仍需在真实用户资料上验证。'),
('Adaptive Retrieval', '10 / Deterministic Routing', [
 'Router 根据查询结构决定 VECTOR_ONLY、VECTOR_WITH_LEXICAL_BOOST 或 FILENAME_SEARCH。标识符、代码、文件名和关键词具有不同检索需求，使用确定性规则便于追踪，而不是让模型自由改写排名策略。',
 'Vector 与 lexical top K 均为 20，RRF K 为 60，候选最多 15、证据最多 7。自然语言查询优先保留向量排序；Phase 6 的实验发现始终混合与标题重排会损害部分自然语言题，因此 Phase 7 默认关闭 reranker。',
 'Phase 9 保持 chunker、Router、query analyzer、tokenization、ranking、vector store、engine 与 sufficiency 代码冻结。新的状态和选择流程作用在答案管线，不将盲测失败转化为新的排名参数。冻结快照记录具体文件 SHA-256。'],
 [('路径', '用途'), ('VECTOR_ONLY', '常规语义与跨语言查询'), ('VECTOR_WITH_LEXICAL_BOOST', '结构性标识符 / 代码等'), ('FILENAME_SEARCH', '明确文件名检索'), ('日志', '记录实际 route，不宣称策略万能')], '选择后证据限制在原保存选项内，但仍受现有 top K 覆盖限制。'),
('Phase 6 实验与选择', '11 / Experimental Development', [
 'Phase 6 使用 72 份资料、144 个问题，其中 120 题有来源、24 题无答案。实际查询 Embedding 与不同检索策略比较保留原始失败案例，图片与引用结果仅覆盖有限生成子集。',
 'Vector Hit@1 为 0.9417，Always Hybrid RRF 为 0.7333，加 reranker 为 0.7000。这说明某些词法匹配与标题权重干扰了语义排序，不能假设更多步骤总是更好。系统保留向量优先，并为明确结构性查询提供词法增益。',
 '该阶段无答案正确为 22/24，两个错误 none-20 与 none-23 未删除。它是开发数据，不可当独立验收；后续阶段单独保留两题拒答回归，而非修改原 Phase 6 成绩。'],
 [('策略', 'Hit@1 / Hit@5 / MRR'), ('Vector', '.9417 / .9917 / .9641'), ('Always Hybrid RRF', '.7333 / .9750 / .8181'), ('Hybrid + rerank', '.7000 / .9750 / .8001'), ('无答案', '22 / 24；两项失败保留')], '来源：docs/evaluation/rag-hard-results.json。不同阶段数据不可视为同一测试集上的进步曲线。'),
('Phase 7 独立 Holdout', '12 / Holdout', [
 'Phase 7 新建 50 份资料、100 个问题，不重复 Phase 6 内容，包含 92 道有来源题与 8 道无答案题。Adaptive 检索对 query 特征采取确定性路由，并与 Always Hybrid 比较。',
 'Adaptive Hit@1 / Hit@5 / MRR 为 .9674 / 1 / .9837，Always Hybrid 为 .9674 / 1 / .9819。数值差异较小，没有统计显著性或大规模真实资料证明；该结果支持保留简单可解释路径，不支持宣称普遍优于所有混合检索。',
 '每种策略的生成只覆盖 8 张图片与 8 道无答案题，不能推广到所有 100 题的生成质量。无答案 8/8，Phase 6 两题单独回归也保留。新内容降低开发记忆风险，但合成短文仍可能比真实复杂文件更容易。'],
 [('策略 / 项目', '结果'), ('Adaptive', '.9674 / 1 / .9837'), ('Always Hybrid', '.9674 / 1 / .9819'), ('无答案生成', '8 / 8'), ('生成范围', '每策略：8 图片 + 8 无答案')], '来源：rag-holdout-results.json 与 phase6-refusal-regression.json。'),
('Phase 8 首轮盲测', '13 / Immutable Run #1', [
 '在创建新语料前冻结 231 个生产与协议文件。Run #1 使用 90 份原创合成资料、180 题，包括 18 张图片、136 道可回答或冲突题、36 道无答案题及 8 道歧义题。第一次输入、逐题 ledger 与首次结果均保留，未择优重跑。',
 'Adaptive 检索 Hit@1 / Hit@5 / MRR 为 1 / 1 / 1，Recall@10 与 nDCG@10 均 1。检索排序高并不代表答案完美：gold 正确普通或冲突答案覆盖 114/136，误拒答 8/136，冲突正确仅 2/8，歧义澄清 0/8。',
 '发布后的 127 个答案含 378 claims，自动 faithfulness 与 completeness 为 378/378；169 个返回引用有效。它们是门控后的条件性指标，不能抵消 10 个 unavailable 或未发布问题。Unavailable 中 runtime 1、gold judge 9；judge 失败原因未完整保存。'],
 [('指标', '结果 / 分母'), ('No-answer accuracy', '36 / 36'), ('False refusal', '8 / 136 = 5.88%'), ('Answerable recall', '114 / 136 = 83.82%'), ('Conflict / ambiguity', '2 / 8；0 / 8'), ('Unavailable', '10 / 180')], '来源：rag-blind-run1-results.json、rag-blind-run1.jsonl 与 phase8-blind-analysis.json。'),
('Phase 9 专项修复', '14 / Targeted Regression', [
 'B129、B131、B132、B135 的文字、gold facts 和双方 citation 通过，但 runtime conflicts 数组为空，仍按冻结协议记为 Incorrect Answer。新上下文检查记录来源差异，发布验证器独立检查披露，最终 conflicting 状态来自结构化验证而非字符串关键词。',
 'B130 数字验证将日期后的英文单词首字母误认为单位；Latin 单位增加边界，保留中文单位邻接。B133 有相关检索却没有引用与 verifier attempts，确认发生生成拒答，但原 trace 无原始草稿，无法断言更细原因。已知差异允许一次有界重生成。',
 '本地新增 10 个冲突、10 个歧义及其选择后回答场景，并包含 stale / foreign ID、短但明确问题和数字负例。它们使用脚本化语义响应验证管线。六次真实请求均 HTTP 200 但 schema 无效；后续扁平 wire schema 未复验，不发布新的准确率。'],
 [('验收', '结果 / 解释'), ('冲突 10 / 歧义 10', '本地通过，非真实语义准确率'), ('浏览器选择 / citation', '390 / 1440 宽交互通过'), ('真实 Kimi', '6 次，无有效样本；预算停止'), ('False refusal', '局部缺陷改善；总率未重测')], '来源：phase9-targeted-regression.md、phase9-kimi-attempt1.json、phase9-kimi-samples.json。'),
('AI Safety 与攻击边界', '15 / Safety', [
 '资料内容按数据处理，不赋予其中指令系统权限。工具注册表限制执行能力，生成方案经过 schema 与 Review，原件与源文档始终由服务器依据当前身份解析。Prompt injection 与图像指令攻击属于合成评测范围，不能证明防御完备。',
 '引用验证重新读取当前数据库，检查文档、chunk、revision 与引用位置；逐句 claim 检查减少无来源断言，数字 guard 阻止未获支持的数量。若检查失败，答案不发布或经过唯一的有界修正。对 conflicting 内容必须保留双方来源和差异。',
 '模型判定本身有相关误差，特别是同一模型家族同时参与生成和验证。系统把结构化校验、租户来源核对与人工可查看原文结合，但并不能将自动 judge 变成客观真值。对于高风险内容仍需要人工阅读原件。'],
 [('威胁', '现有防护'), ('资料内恶意指令', '作为资料处理、工具与 schema 边界'), ('伪造来源', '数据库重读、revision、tenant'), ('未经支持断言', 'claim / numeric gate'), ('错误文件操作', 'Review 与确认、受限工具')], '安全设计减少风险；最终答案门不能替代独立人工质量评估。'),
('Frontend Polish 与无障碍', '16 / UI Acceptance', [
 '沿用暖色背景、teal 和现有 Geist 字体系统。Phase 9 移除产品中不合时宜的阶段文案，给澄清提供清晰选项，为冲突显示主题、值和点击来源；没有更换视觉风格或增加未实现产品功能。',
 'Competition 浏览器矩阵覆盖 8 个页面，在 390、1280、1440、1920 四种宽度检查横向溢出、开发文案和 About 信息。另两项测试覆盖 390 / 1440 的澄清、选择、冲突来源抽屉及保存回载。响应是明确注入的交互 fixtures，不作为真实生成证据。',
 '已有浏览器回归 17/17，新 Competition 测试 3/3，矩阵包含 32 个页面和视口组合。关键页面截图与本地 detector 一次检查通过。后续 UI freeze 只允许缺陷、文案、响应式及无障碍修正。'],
 [('范围', '验证'), ('Landing 至 Settings', '8 页面 x 4 宽度'), ('Search 新状态', '选择、来源、reload、两种宽度'), ('运行模式', 'Competition 隐藏开发控件'), ('About', 'Version / Commit / Build Date')], '屏幕阅读器的全面人工审核尚未完成；浏览器可见性检查不等同全部 WCAG 合规。'),
('数据、身份与备份', '17 / Persistence', [
 'PostgreSQL 存储工作区、文档、索引与运行记录。应用使用受限数据库角色和租户事务，RLS / FORCE RLS 与应用鉴权共同约束访问。私有文件系统保存原件，服务路由通过已授权记录寻找存储对象，而非接受任意路径。',
 '浏览器身份不是传统账号；Recovery Key 是持有人可以恢复访问的 bearer credential，需要妥善保管。备份导出结构化数据和原件，包含校验与身份关系验证。备份 ZIP 默认没有加密，分享前必须由用户检查敏感资料。',
 '专用 Demo 身份由服务端创建登记。Reset 校验专用 workspace、确认文本及操作状态，仅清理该范围。新环境中连续五次 reset 都保留普通 owner 与 Demo sibling，错误 workspace 与错误确认被拒绝。'],
 [('对象', '保护 / 限制'), ('身份', '签名会话；恢复密钥可恢复 owner'), ('数据库', '应用角色、租户事务与 RLS'), ('Backup', '校验与验证；默认不加密'), ('Demo Reset', '服务端登记与范围确认')], 'Recovery 是身份恢复，Backup 是资料可迁移性；两者不能混同，也不能公开真实密钥。'),
('可靠性与本地搬运', '18 / Reliability', [
 '操作 journal、原子写入、staging、租户 operation lease 与启动修复用于协调数据库和文件系统。备份、索引和资料修改有不同提交边界；进程中断后恢复根据 journal 而非扫描后随意删除文件。',
 '可搬运启动器使用包内 Node 与 PostgreSQL，首次运行生成随机的本地凭据及新数据库，绑定回环地址。它核对复制目录与已运行进程所属路径，避免误停另一目录实例；搬运前应完整停止。包不能混入已有 storage、数据库 data 或 .env.local。',
 '新无密钥 Competition 环境完成数据库初始化、真实本地 OCR、五次 Reset、Recovery 与 Backup 导出/完整性校验。该测试没有执行云端 AI，也没有把校验称为全量资料 import roundtrip；导入逻辑另有本地单元与历史搬运验证。'],
 [('检查', 'Phase 9 证据'), ('新数据库 / private data', '空库开始、未复制原件或身份'), ('Reset', '5 / 5，范围与 sibling 保留'), ('Recovery / Backup', '身份恢复、导出和 ZIP 校验'), ('OCR / Preflight', '本地 OCR 真运行；7 / 12 NOT READY')], '实际解压包的启动验收另有独立 receipt；无凭据环境不能证明所有现场条件。'),
('隐私、密钥与依赖', '19 / Security Audit', [
 'Git history scan 遍历所有本地 refs 的对象，按真实已配置密钥值与 credential patterns 检查 blob，只输出路径、对象与 fingerprint，不输出密钥。首轮 940 blobs / 1736 objects 零命中；新增交付提交后重新扫描。该工具不能理解所有语义私人内容。',
 '公开包使用允许列表，排除 .env.local、现有数据库、存储、recovery keys、日志与下载缓存。原件只来自原创 synthetic fixtures，交付材料不包含私人用户截图。保留原五份用户未提交文档，避免误推入比赛提交。',
 'npm audit 的 production 依赖为零 advisories。完整 audit 有 5 个 High，来自 ESLint 开发链到 braces 的同一安全问题，当前 registry braces 最新 3.0.3 尚无修复版。没有为了隐藏告警降级 Next ESLint 大版本，也未在冻结期广泛升级依赖。'],
 [('审计', '结果 / 边界'), ('Git known values + patterns', '零命中，非语义隐私保证'), ('Production audit', '0 vulnerabilities'), ('完整 audit', '5 High；同一开发链，0 Critical'), ('许可证', '599 包有记录；源代码 MIT')], '来源：phase9-secret-scan.json、phase9-dependency-licenses.json、phase9-dependency-audit.md。'),
('四项设计贡献', '20 / Contribution', [
 '第一，受人审控制的 FileMind Agent 把建议和执行分离，并将工具校验、revision 与恢复连接到具体文件组织流程。贡献是产品级控制流程，不声称发明了 Agent 或模型工具调用。',
 '第二，Multimodal Knowledge 同时保留 OCR 转录、Vision interpretation 与原图来源。第三，Adaptive Retrieval 根据开发与 holdout 的失败证据选择可解释路由，保留向量排序，并在明确结构性查询时增加词法路径。',
 '第四，逐句事实发布门结合真实来源校验、支持检查、数值 guard 与冲突披露。Phase 8 保留高检索与低冲突/澄清之间的差距，Phase 9 将它转化为明确状态修复和透明未完成验收。贡献是可核对的工程组合，不能用条件性 100% 取代整体正确率。'],
 [('贡献', '可展示证据'), ('人审 Agent', 'Review / Apply 与 journal'), ('多模态知识', 'OCR / interpretation / 原图'), ('Adaptive', '三阶段实验与 route ledger'), ('事实门', '拒绝报告、claim 和冲突来源')], '项目创新陈述限定在已实现组合与实验认识；没有未经核查的竞品领先结论。'),
('部署与比赛 Demo', '21 / Delivery', [
 '源码安装使用 npm ci、专用 PostgreSQL 配置、迁移和生产构建。可搬运包提供 Windows x64 运行时、独立启动/停止脚本与编译后的十二项 preflight。build metadata 将版本、提交与 UTC 日期注入 About，便于对照运行代码。',
 '主资料保持 Phase 8 原有 10 份 fixture 中的推荐 8 份；重复笔记是另 2 份可选资料。主线为上传、Agent、Review、Apply、Library、QKV Ask、引用、图片、Graph 与清理。原资料没有 BERT，追问必须如实不足；不能凭常识伪造引用。',
 'Plan A 是真实云端 Demo，当前还未取得新构建全程通过证据。Plan B 展示已保存资料、Find、原文、Local OCR、Graph、Backup 和 Recovery，同时清楚告知 Cloud AI provider unavailable。视频稿目标 6:10，实际录制待完成。'],
 [('材料', '状态'), ('主 fixture', '10 总数 / 8 推荐，未改原数据'), ('Preflight', '目标 12 / 12；当前新环境 7 / 12'), ('视频 / PPT', '6:10 脚本；12 页提纲'), ('备用计划', '流程具备；当前在线能力未验收')], '预存答案须说明历史生成时间，Mock 不可用作 Plan B 的真实 AI 演示。'),
('限制与后续验证', '22 / Limitations', [
 '最直接的交付限制是上下文结构化调用尚未得到有效线上对象。六次响应均 HTTP 200，但 schema 校验失败；扁平 wire 兼容调整在预算耗尽后只做本地检查。需要新授权后少量真实冲突与歧义验收，不能以本地 fixtures 报告模型正确率。',
 '评测主体为短原创合成数据，真实用户长文、多人权限、大规模向量扫描、复杂手写和密集图表尚未验证。生成与验证共享模型家族，自动 judge 会有相关误差；全局 false-refusal 改善没有新测量。',
 '正式视频、团队资料、公开仓库提交时可见性、当前完整在线 main Demo 与 backup queries，以及 12/12 preflight 仍是提交前事项。开发依赖 High 告警持续披露，备份无加密与恢复密钥风险需要用户保管意识。后续工作需阶段授权，本报告不启动 Phase 10。'],
 [('未完成 gate', '所需真实证据'), ('Context wire', '当前版本真实结构化样本'), ('Main Demo / backup Ask', '完整彩排与原始 receipt'), ('Preflight', '现场 12 / 12 READY'), ('提交内容', '正式视频、团队信息与链接')], '这些限制保留在 README、Q&A 和 submission checklist，避免材料之间互相矛盾。'),
('验收结果与索引', '23 / Acceptance Record', [
 '单元 106/106、已有浏览器 17/17、新 Competition 测试 3/3 均通过。生产 build、TypeScript 和 lint 通过；最终 receipt 绑定执行代码与构建 metadata。新环境 reset 5/5、Recovery、Backup integrity 和真实 local OCR 通过。',
 '新真实 Kimi 验收没有通过：六次预算用满、有效样本为零；扁平 wire 调整未线上复验。主 Demo 仅保留 Phase 8 历史通过，不计当前 candidate 通过。新无密钥 preflight 7/12，明确 NOT READY。综上尚未达到全部 Competition Release Candidate 标准。',
 '复核入口：phase9-targeted-regression.md 解释修复；kimi 两份 JSON 保留失败；clean-environment 与 portable-release 保存新环境证据；dependency、secret-scan、freeze 和 final-checks 保存交付边界。Git 保留分段提交与普通 push，不重写历史。'],
 [('检查组', '结论'), ('代码与本地交互', '通过，范围有明确标签'), ('资料恢复与无凭据运行', '通过，未声称在线就绪'), ('真实模型 / 完整 Demo', '未通过或未复验'), ('最终 Competition RC', 'NOT READY；Phase 9 停止于当前预算')], '报告数据只引用保存证据；未运行项不使用通过标记。'),
]
assert len(PAGES) == 24

def para(c, text, x, y, width, style=STYLE):
    p = Paragraph(escape(text), style)
    _, height = p.wrap(width, 1000)
    if y - height < 64:
        raise ValueError('Page overflow: ' + text[:70])
    p.drawOn(c, x, y-height)
    return y-height

OUT.mkdir(parents=True, exist_ok=True)
pdf = OUT / 'technical-report.pdf'
c = canvas.Canvas(str(pdf), pagesize=(595.28, 841.89), pageCompression=1)
c.setTitle('FileMind AI - Competition Technical Report v1.0.0-rc.1')
c.setAuthor('FileMind AI / repository maintainer s0nggv0')
markdown = ['# FileMind AI Competition Technical Report\n', '> 24 页；2026-10-04；v1.0.0-rc.1；NOT READY。\n']
for index, (title, eyebrow, body, rows, note) in enumerate(PAGES, 1):
    c.setFillColor(PAPER); c.rect(0, 0, 595.28, 841.89, fill=1, stroke=0)
    c.setFont('Helvetica', 9); c.setFillColor(MUTED); c.drawString(48, 794, 'FILEMIND AI / COMPETITION TECHNICAL REPORT')
    c.setStrokeColor(TEAL); c.line(48, 778, 547, 778)
    y = para(c, eyebrow, 48, 750, 499, SMALL) - 13
    y = para(c, title, 48, y, 499, TITLE) - 26
    markdown += [f'\n## 第 {index} 页：{title}\n', f'*{eyebrow}*\n']
    for text in body:
        y = para(c, text, 48, y, 499) - 17
        markdown.append(text+'\n')
    if index == 6:
        c.drawImage(str(OUT/'architecture.png'), 80, 78, width=435, height=335, preserveAspectRatio=True, anchor='c')
        markdown.append('![系统架构](architecture.png)\n')
    if rows:
        cells = [[Paragraph(escape(cell), HEAD if row_index == 0 else SMALL) for cell in row] for row_index,row in enumerate(rows)]
        table = Table(cells, colWidths=[160, 339], hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),TEAL),('TEXTCOLOR',(0,0),(-1,0),colors.white),('BACKGROUND',(0,1),(-1,-1),colors.HexColor('#f0f2eb')),('LINEBELOW',(0,0),(-1,0),1,TEAL),('LINEBELOW',(0,1),(-1,-1),.5,colors.HexColor('#d7ddd4')),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('VALIGN',(0,0),(-1,-1),'TOP')]))
        _, height = table.wrap(499, 1000)
        if y-height < 102: raise ValueError(f'Table overflow page {index}')
        table.drawOn(c,48,y-height); y-=height+18
        markdown += ['| '+ ' | '.join(row)+' |' for row in rows[:1]] + ['| --- | --- |'] + ['| '+' | '.join(row)+' |' for row in rows[1:]] + ['\n']
    if index != 6:
        y = para(c, note, 48, y, 499, SMALL)
    markdown.append('证据与边界：'+note+'\n')
    c.setFillColor(MUTED);c.setFont('Helvetica',8);c.drawString(48,36,'v1.0.0-rc.1 / NOT READY / 2026-10-04');c.drawRightString(547,36,f'{index:02d} / 24');c.showPage()
c.save()
(OUT/'technical-report.md').write_text('\n'.join(markdown),encoding='utf-8')
print(json.dumps({'pdf':str(pdf),'pages':24,'sections':len(PAGES)},ensure_ascii=False))
