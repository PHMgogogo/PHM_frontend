# Knowledge Agent UX Requirements

- **Feature**: `knowledge-agent-ux`
- **Status**: Confirmed
- **Target repository**: `PHM_frontend`
- **Target branch**: `feat/knowledge-agent-ux`
- **Baseline**: `origin/dev@91b7b03f6b72fc64fcc4595dc4c96b42bb0698bb`

## 1. Context

PHM 前端当前把知识库能力收敛为文档上传、列表与删除，但 RAG 服务已经提供完整的文档生命周期、三类低层检索、Thinking/Fast Agent、SSE 执行进度、结构化 PHM 诊断、依据来源、置信度/拒答、会话与反馈接口。

本功能的表面需求是补齐页面和交互；本质需求是让用户能够完成“摄入资料 → 验证资料可检索 → 基于证据提问 → 判断回答可信度 → 反馈纠错”的闭环，同时不破坏现有 OpenCode 会话工作流。

## 2. Scope

### 2.1 In Scope

- 从 `origin/dev` 独立分支开发，并先修复阻塞知识库功能验证的构建基线。
- 将现有“知识库管理”升级为包含文档库、检索验证和知识库 Agent 的“知识中心”。
- 通过既有 `/document` 前端网关访问 RAG HTTP `/api` 路由；生产写能力必须 fail closed。
- 复用 RAG 已有接口，不修改 RAG 后端契约。
- 增加前端单元/契约测试和 Playwright 用户流程测试。
- 修复共享 Markdown 渲染链中的不安全 HTML 输出。

### 2.2 Out of Scope

- 不替换飞机工作区现有 OpenCode 对话、任务、工具调用或交互式提问协议。
- 不把进程内 MCP 暴露为浏览器接口，不展示 HTTP 契约没有提供的 planner/corrective diagnostics。
- 不展示或持久化 `metadata.reasoning` 原始模型思维文本。
- 不增加管理员密钥输入、熔断器重置、降级模式切换、评测管理等管理面功能。
- 不修改 RAG 的文档、检索、聊天、会话或反馈后端。
- 不把全局 `/documents/reindex` 误包装为单文档“重试索引”；该接口只扫描 RAG 仓库的 `md/` 目录，本期不向普通用户暴露。

## 3. Functional Requirements

### 3.1 Baseline and Service Boundary

#### REQ-KA-001 — Tracked endpoint configuration

**WHEN** 前端从干净克隆安装并构建，**THE SYSTEM SHALL** 从版本控制中获得 `src/config/endpoints.ts`，且 `.gitignore` 不得排除该文件。

#### REQ-KA-002 — Isolated RAG gateway

**WHEN** 前端访问文档、检索、聊天、会话或反馈能力，**THE SYSTEM SHALL** 统一通过前端路径 `/document` 转发到 RAG 服务的 `/api`，不得复用 PHM 主业务 `/api` 前缀。

#### REQ-KA-003 — Environment-configurable development target

**WHERE** Vite 开发服务器运行，**THE SYSTEM SHALL** 允许用 `VITE_RAG_PROXY_TARGET` 配置 RAG 地址，并在未设置时默认使用 `http://127.0.0.1:8000`；生产环境仍由部署层反向代理负责 `/document`。

#### REQ-KA-004 — Preserve OpenCode workflow

**WHEN** 知识中心功能上线，**THE SYSTEM SHALL** 保持飞机工作区 OpenCode 会话的 API、SSE、任务绑定和页面入口不变。

### 3.2 Knowledge Center Information Architecture

#### REQ-KA-005 — Three-task knowledge center

**WHEN** 用户进入原“知识库管理”入口，**THE SYSTEM SHALL** 展示“文档库”“检索验证”“知识库 Agent”三个清晰分区，并保留同一 PHM 视觉语言和响应式布局。

#### REQ-KA-006 — Independent task state

**WHEN** 用户在三个分区之间切换，**THE SYSTEM SHALL** 保持分区挂载并保留当前文档筛选、检索查询与未结束的 Agent 会话状态；**WHEN** 用户真正离开知识中心，**THE SYSTEM SHALL** 取消仍在进行的网络流、请求和轮询。

### 3.3 Document Lifecycle

#### REQ-KA-007 — Backend-aligned document states

**WHEN** 文档列表返回 `processing`、`indexed` 或 `failed`，**THE SYSTEM SHALL** 分别展示“处理中”“已索引”“处理失败”，不得把未知、失败或不可用状态显示成成功。

#### REQ-KA-008 — Supported upload contract

**WHERE** 部署已显式启用并在网关强制鉴权/授权的上传能力，**WHEN** 用户选择文件，**THE SYSTEM SHALL** 在浏览器侧接受 `.md`、`.txt`、`.pdf`、`.docx`、`.pptx`、`.html`、`.htm`，并在发送前提示不支持的扩展名和超过 50 MiB 的文件；后端校验仍是最终事实来源。能力未启用时页面必须保持只读且不渲染可执行上传控件。

#### REQ-KA-009 — Multi-file upload queue

**WHEN** 用户一次选择或拖入多个文件，**THE SYSTEM SHALL** 按文件展示等待、上传、后台处理、完成或失败状态，单个文件失败不得阻断后续文件。

#### REQ-KA-010 — Duplicate response handling

**WHEN** RAG 以 HTTP 409 和 `detail` 拒绝同名或同内容文件，**THE SYSTEM SHALL** 把该文件标记为“已存在”并展示可理解的提示，不得按通用服务器错误处理，也不得期待成功体中的 `status=duplicate`。

#### REQ-KA-011 — Conditional polling

**WHEN** 至少一个文档处于 `processing`，**THE SYSTEM SHALL** 以约 3 秒周期刷新文档状态；**WHEN** 不再存在处理中文档或页面离开，**THE SYSTEM SHALL** 停止轮询，且同一时刻最多一个具有写状态权限的列表请求在途。**WHEN** 用户在列表请求期间切换分页，**THE SYSTEM SHALL** 取消或废弃旧请求，并只把最新目标页的响应与页码原子提交；目标页失败时保留原页码和原页数据。

#### REQ-KA-012 — Document failure recovery affordance

**WHEN** 上传传输失败且尚无服务端 `document_id`，**THE SYSTEM SHALL** 允许重传原文件。**WHEN** 已登记文档的后台处理进入 `failed`，**THE SYSTEM SHALL** 说明其未进入可检索状态；只有安全删除能力已显式启用时才允许用户确认“删除后重传”，不得提供后端并不存在的原地重试承诺。**WHEN** 状态跟踪进入 `tracking_error`，**THE SYSTEM SHALL** 只允许重新查询服务端状态，不得重新 POST 原文件。

#### REQ-KA-013 — Destructive document action

**WHERE** 独立的安全删除能力已显式启用，**WHEN** `indexed` 或 `failed` 文档被用户确认删除，**THE SYSTEM SHALL** 调用删除接口并在响应后重新读取列表；只有重新读取成功时才可表述“登记列表已刷新”，刷新失败时必须说明当前仍是旧数据。删除末页最后一项后页码必须收敛到仍有效的末页。页面不得承诺当前后端 200 无法证明的多索引强一致清理；`processing`、未知状态、用户取消确认或能力关闭时绝不能发送 DELETE。

#### REQ-KA-014 — Honest collection statistics

**WHEN** 文档列表加载完成，**THE SYSTEM SHALL** 区分后端报告的文档总数与当前已加载文档/分块数，不得把分页子集伪装成全库统计。

### 3.4 Retrieval Verification

#### REQ-KA-015 — Retrieval strategy selection

**WHEN** 用户执行检索验证，**THE SYSTEM SHALL** 支持混合检索、纯向量检索和纯关键词检索，并说明它们是“不调用 LLM 的低层检索”，不等同于 Agent 的完整共享工作流。

#### REQ-KA-016 — Retrieval input validation

**WHEN** 用户提交检索，**THE SYSTEM SHALL** 要求非空查询，并把 `top_k` 限制在 1 至 50，默认值为 5。

#### REQ-KA-017 — Retrieval evidence details

**WHEN** 检索成功，**THE SYSTEM SHALL** 展示内容片段、来源、标题、主分数、可用时的 `retrieval_score`、`rerank_score`、`rerank_applied`、总结果数和检索耗时；缺失分数必须显示“未提供”，低层主 `score=0` 必须显示“未确认（服务返回 0）”而不是确定零分。

#### REQ-KA-018 — Retrieval terminal states

**WHEN** 检索返回空结果、网络错误或服务错误，**THE SYSTEM SHALL** 分别展示空证据提示和可重试错误状态，并保留用户查询与策略选择。**WHEN** 多次检索请求重叠，**THE SYSTEM SHALL** 仅允许最新请求更新结果、错误和 loading，且响应 query 必须与该请求快照一致。

#### REQ-KA-019 — Continue from retrieval to Agent

**WHEN** 用户认为检索查询有效，**THE SYSTEM SHALL** 提供“交给 Agent 分析”操作，把查询带到知识库 Agent 输入区，但不得把低层检索结果伪装成 Agent 已采纳的最终证据。

### 3.5 Knowledge Agent

#### REQ-KA-020 — Separate RAG Agent

**WHEN** 用户进入知识库 Agent，**THE SYSTEM SHALL** 提供独立于 OpenCode 的 RAG 会话界面；只有最终 `done.metadata.route=rag|fast` 且存在相应来源时才声明回答使用了知识库证据，`general_chat/degraded/未完成` 不得伪装为证据回答。

#### REQ-KA-021 — Thinking and Fast modes

**WHEN** 用户发送问题，**THE SYSTEM SHALL** 允许选择 `thinking` 或 `fast` 模式，并用面向用户的说明表达完整分析与较低延迟之间的取舍。

#### REQ-KA-022 — POST SSE streaming

**WHEN** 用户发送问题，**THE SYSTEM SHALL** 使用 `POST /document/chat/stream` 解析 `session/status/intent/node/token/done/error` 事件；解析器必须正确处理任意网络分块、CRLF、未知事件和流末尾残留数据。

#### REQ-KA-023 — Explicit run state

**WHEN** Agent 正在执行，**THE SYSTEM SHALL** 展示当前状态和已到达的可验证阶段（意图分析、检索、相关性评估、查询优化、生成），防止重复发送，并允许用户取消当前请求；Fast 模式不得伪造意图分析、相关性评估或查询优化阶段。

#### REQ-KA-024 — Interrupted stream recovery

**IF** 流在 `done` 前报错、被取消或意外结束，**THE SYSTEM SHALL** 保留已经收到的部分回答并标记为“已中断/已取消”，提供重试入口，不得把部分内容静默当作完整回答。

#### REQ-KA-025 — Domain-structured answer

**WHEN** `metadata.structured_answer` 和 `metadata.section_labels` 可用，**THE SYSTEM SHALL** 用后端提供的动态标签展示结构化 PHM 内容；不得在前端硬编码只适用于单一 profile 的标题。

#### REQ-KA-026 — Evidence sources

**WHEN** Agent 返回来源，**THE SYSTEM SHALL** 展示来源文件、标题、证据片段以及可用分数/重排信息；来源正文必须按纯文本处理，不能直接作为 HTML 注入。

#### REQ-KA-027 — Trust state semantics

**WHEN** Agent 最终 `done` 返回 `route`、`confidence`、`confidence_level`、`refused` 或 `force_rag`，**THE SYSTEM SHALL** 以该事件原子覆盖临时路径并展示回答路径、置信度等级、自动知识库路由和证据不足/冲突拒答状态；`confidence=null/undefined` 必须显示“未评估”，绝不能显示 0 分。没有 `done` 时不得赋最终可信标签。

#### REQ-KA-028 — Degraded response semantics

**IF** `metadata.route=degraded` 或 SSE 返回错误，**THE SYSTEM SHALL** 以明确的降级/不可用状态呈现，并保留可重试路径；不得把降级回答标记为正常高可信回答。

#### REQ-KA-029 — No raw chain-of-thought

**WHEN** 响应 metadata 包含 `reasoning` 或 `intent_reasoning`，**THE SYSTEM SHALL NOT** 向普通用户展示或持久化原始思维文本；页面只展示公开的状态、节点、路由、证据和结论。

#### REQ-KA-030 — Session lifecycle

**WHEN** 用户使用知识库 Agent，**THE SYSTEM SHALL** 支持新建会话，并采用服务端 `session` 事件返回的 ID；历史抽屉只能列出本浏览器曾收到的最多 20 个 session ID，并明确标注“本设备会话”。系统不得调用无 owner 范围的全局 `/sessions` 列表；默认移除只清理本地 ID，不调用远端删除。**IF** 历史加载失败或响应无效，**THE SYSTEM SHALL** 保持抽屉及错误可见并允许重试，成功后才切换会话和关闭抽屉。**IF** 浏览器存储被策略或配额阻止，**THE SYSTEM SHALL** 保持已完成回答的成功状态，不得虚报本设备登记成功。

#### REQ-KA-031 — Historical metadata limitation

**WHEN** 加载 `/chat/history/{session_id}` 的历史消息，**THE SYSTEM SHALL** 只恢复接口实际提供的角色、正文和时间；因为接口不返回旧来源/trace/metadata，页面不得伪造旧引用，也不得为缺少 `message_id/trace_id` 的历史回答启用反馈。

#### REQ-KA-032 — Feedback loop

**WHERE** 部署已显式启用并在网关授权反馈写能力，**WHEN** 新生成的回答携带 `message_id` 和 `trace_id`，**THE SYSTEM SHALL** 支持点赞、点踩、标记和填写纠正内容；同一回答在提交中和成功后均不得重复发送。**IF** 反馈响应无效或失败，**THE SYSTEM SHALL** 恢复可重试状态并保留尚未成功的纠正文案；能力关闭时只说明反馈不可用，不得发送写请求。

### 3.6 Security, Accessibility, and UX

#### REQ-KA-033 — Sanitized rich text

**WHEN** 任意 OpenCode 或 RAG 文本被渲染为 Markdown/KaTeX/高亮 HTML，**THE SYSTEM SHALL** 在写入 `v-html` 前统一净化，移除脚本、事件属性、危险 URL、iframe/object/embed/form 等活动内容，同时保留必要的 Markdown、代码和 KaTeX 展示。

#### REQ-KA-034 — Safe links and source content

**WHEN** 回答包含链接，**THE SYSTEM SHALL** 只保留安全协议，并为新窗口链接设置 `rel="noopener noreferrer"`；检索结果和来源片段默认用文本插值展示。

#### REQ-KA-035 — No frontend admin secret

**WHEN** 知识中心调用 RAG，**THE SYSTEM SHALL NOT** 在源码、浏览器存储、URL 或日志中放置 `ADMIN_API_KEY` 或其他密钥；浏览器 capability 只控制 UX，不能被描述成安全边界，真正的写权限必须由同源网关/RAG 服务端执行。

#### REQ-KA-036 — Responsive and keyboard-usable controls

**WHEN** 用户使用常见桌面宽度、窄屏或键盘操作，**THE SYSTEM SHALL** 保证分区、消息、来源抽屉、表单和确认操作可阅读可操作，并为关键按钮提供可辨识文本或辅助标签。

#### REQ-KA-037 — Stable rendering under streaming

**WHEN** token 高频到达，**THE SYSTEM SHALL** 合并同一动画帧内的文本更新，限制 Markdown 缓存并仅在用户靠近底部时自动跟随，避免逐 token 全量重渲染和强制抢滚动位置。

### 3.7 Verification

#### REQ-KA-038 — Real typecheck and build gate

**WHEN** 执行项目质量门禁，**THE SYSTEM SHALL** 以显式 build mode 遍历 `tsconfig.json` 引用的 app/node projects 并完成 Vite 生产构建；不得使用根级 `--noEmit` 的假绿结果，也不得通过缩小 include/exclude 绕过源码错误。

#### REQ-KA-039 — Unit and contract tests

**WHEN** 本功能提交，**THE SYSTEM SHALL** 在 `tests/unit/` 固化 SSE 分块解析、状态/置信度语义、API 错误解析和 Markdown XSS 净化测试。

#### REQ-KA-040 — Playwright user journeys

**WHEN** 本功能提交，**THE SYSTEM SHALL** 在 `tests/e2e_ui/` 以确定性网络 mock 覆盖文档状态/分页/重复上传/失败恢复/删除、三类检索及并发归属、Agent 流式阶段/来源/拒答、会话/四类反馈和 XSS 不执行等关键流程，并覆盖 768 px 下文档库、检索台与对话抽屉的关键几何边界。

### 3.8 Review-driven Trust Boundaries

#### REQ-KA-041 — Fail-closed mutation capabilities

**WHEN** 任一构建环境没有将对应变量严格设置为字符串 `true`，**THE SYSTEM SHALL** 关闭上传、删除、远端会话删除和反馈写能力；其中删除和远端会话删除使用独立开关。生产部署只有通过 path+method 身份认证、角色授权、审计、限流/大小与 CSRF/SameSite 清单后才可启用对应能力。

#### REQ-KA-042 — Runtime normalization and resource bounds

**WHEN** 前端消费文档、检索、历史或 SSE 网络数据，**THE SYSTEM SHALL** 先经过运行时 normalizer；列表、检索、历史和 mutation 的顶层 envelope 缺少后端必填字段时必须作为 `invalid-response` 失败，不能降级为空成功。未知状态不得映射成功，`reasoning/intent_reasoning` 与未知 metadata 字段必须在 SSE 边界立即丢弃；`done.full_response` 必须是非空字符串，非法终帧不得覆盖已接收 token 或提交完成态。SSE frame/pending buffer、总输入、事件数、累计回答和来源数量/长度必须有显式上限，超限以可重试错误安全终止且不得记录原文。

#### REQ-KA-043 — Run ownership and first-terminal-wins

**WHEN** Agent run 被取消、替换、切换会话或页面离开，**THE SYSTEM SHALL** 先使单调 run ID 失效，再中止请求和 RAF/timer；所有异步回调必须同时验证 run ID、session ID 和 assistant message ID。`completed/error/cancelled/interrupted` 首个终态提交后不得被迟到事件或 finally 覆盖。

#### REQ-KA-044 — Off-page processing convergence

**WHEN** 上传队列持有 `processing` document ID，即使该文档不在当前分页或列表请求暂时失败，**THE SYSTEM SHALL** 通过 detail 接口独立对账并以 3/6/12/24/30 秒有界退避继续；404/持续异常进入 `tracking_error`，不得伪装为 indexed/failed。

#### REQ-KA-045 — Honest streaming verification and deployment

**WHEN** 验证 SSE，**THE SYSTEM SHALL** 用单元测试覆盖任意 UTF-8 byte/CRLF/EOF 分块，用 Playwright route mock 覆盖应用层多事件流程但不声称证明 TCP 分块；生产代理必须禁用响应缓冲与缓存、保留 `text/event-stream`、提供足够 read timeout，并通过无缓冲烟测证明早期事件先于 `done` 到达。

## 4. Acceptance Criteria

- 干净克隆可安装依赖，真实 typecheck、单元测试、生产构建均通过。
- Playwright 在不依赖真实 RAG、Ollama 或 Milvus 的情况下通过。
- 在已授权能力开启时，用户能从知识中心完成文档摄入和反馈；未开启时仍可完成文档状态确认、低层检索验证、流式知识问答与引用检查，页面诚实保持只读。
- `null` 置信度、失败文档、空检索、降级回答和中断流均不会被伪装为成功或 0 分。
- 现有 OpenCode 对话入口和协议保持不变。
- 恶意 Markdown/来源内容不能执行脚本、事件处理器或危险链接。
- 页面不调用全局 session list，不持久化会话正文/metadata/reasoning；取消或重试不会发生跨 run 串扰。
