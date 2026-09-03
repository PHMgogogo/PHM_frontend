# Critic Review — Knowledge Agent UX

- **Reviewer**: `knowledge_critic`（独立上下文）
- **Review mode**: Full + FMEA + STRIDE
- **Design reviewed**: `design.md` v1
- **Date**: 2026-09-02
- **Result**: 3 Critical / 6 High / 2 Medium

> 本报告按独立 critic 已完成的证据审查与严重性结论归档；主 Agent 仅将原始发现规范化为项目要求的 8 字段格式，没有降低严重性。

## Findings

### F-KA-001

- **Conventional Comment**: `issue (blocking, security)`
- **severity**: **Critical** — 未授权调用者可改变整个 RAG 的事实来源，影响所有后续用户；无需复杂前置条件，且错误知识很难从普通问答界面发现。
- **location**: `design.md:34-38, 309-315, 371-380`；RAG `api/routers/documents.py:338-417, 718-763`；安全不变量“知识写入必须有可验证授权边界”。
- **symptom**: v1 直接向普通浏览器提供上传和删除，但 RAG 路由没有身份或权限依赖；“生产代理权限由部署层控制”只是一句假设，设计没有 fail-closed 开关或部署验收条件。
- **impact**: 任意能访问前端/RAG 的用户都可上传恶意或错误资料进行知识投毒，也可删除他人资料，进而污染诊断结论或造成知识库不可用。
- **root_cause**: 把前端可见性和未定义的反向代理策略当成了授权控制；前端本身不是安全边界。
- **recommendation**: 生产构建默认关闭知识写操作；只有部署网关已完成身份认证、角色授权、审计和 CSRF/同源策略验收后，才允许用显式能力配置打开上传。删除使用更严格的独立能力开关。建立 RAG 后端鉴权 backlog，且 UI 明确只读原因。
- **verification**: 单元测试验证生产默认能力为只读；Playwright 验证未获能力时没有可执行上传/删除动作；部署文档给出认证网关验收清单，不能只描述 URL rewrite。
- **status**: `open`

### F-KA-002

- **Conventional Comment**: `issue (blocking, correctness)`
- **severity**: **Critical** — 删除可能只移除 registry 而保留向量/BM25/图索引，旧证据仍可参与故障判断；用户却收到确定成功信息，检测性低。
- **location**: `design.md:313-315, 460`；RAG `api/routers/documents.py:726-763`；不变量“删除成功不得与可检索证据残留并存”。
- **symptom**: RAG 捕获并仅记录 Milvus/BM25/其他索引清理失败，随后仍删除 registry 并返回 HTTP 200；v1 文案承诺“同步清理向量和关键词索引”以及“文档已删除”。
- **impact**: 页面不再显示文档，但检索/Agent 仍可能引用它；在维修诊断场景中会产生不可追踪的陈旧证据。
- **root_cause**: 前端把非事务性后端响应当成强一致删除确认，后端契约又没有返回各索引清理结果。
- **recommendation**: 在后端提供事务化/可验证清理契约之前，生产默认禁用删除；单独使用 `VITE_RAG_DELETE_ENABLED` 且只有部署验收后开启。开启后的 UI 只能表示“服务已接受删除”，不得宣称所有索引已清理。建立后端修复 backlog：任一关键索引清理失败必须返回失败并保留可重试状态。
- **verification**: Playwright 验证删除默认禁用及提示；契约测试模拟 200 时不出现“所有索引已清理”承诺；后端 backlog 关闭前能力门禁保持关闭。
- **status**: `open`

### F-KA-003

- **Conventional Comment**: `issue (blocking, trust semantics)`
- **severity**: **Critical** — 服务把“没有 score”序列化为 `0.0`，前端无法仅凭 DTO 区分真实零分和不可用；这直接违反“不可用不等于 0”的热路径不变量。
- **location**: `design.md:67-72, 151-175, 355, 467`；RAG `api/routers/retrieval.py:36-43, 58-90`；不变量“unavailable/None MUST NOT become score 0”。
- **symptom**: v1 只处理 `null/undefined/NaN`，但后端模型 `score: float = 0.0` 且多个分支用缺省 `0.0`；页面会把歧义零值显示成确定的相关性 0。
- **impact**: 用户可能错误淘汰可用证据或误读检索质量，且前端显示与事实可用性不一致。
- **root_cause**: 设计假设传输层保留“缺失”语义，但当前后端在序列化前已丢失该信息。
- **recommendation**: 前端把没有明确有效性佐证的主分数 `0` 标成“未确认（服务返回 0）”，不显示为确定零分；`retrieval_score/rerank_score` 仍按可空值处理。建立后端 backlog，将 score 改为可空或增加 `score_available/score_kind`。
- **verification**: 单元测试覆盖 missing、null、NaN、真实有限非零和歧义 0；Playwright 验证歧义 0 文案；任何分数格式化不得使用 `value || 0`。
- **status**: `open`

### F-KA-004

- **Conventional Comment**: `issue (blocking, privacy)`
- **severity**: **High** — 全局会话列表和已知 ID 的历史正文没有所有权校验，会暴露其他用户的故障描述、设备信息与回答。
- **location**: `design.md:217-224, 352, 392`；RAG `api/routers/sessions.py:76-97`、`api/routers/chat.py:933-962`；安全不变量“浏览器不得枚举不属于当前本地上下文的会话”。
- **symptom**: v1 调用 `GET /sessions` 列出所有活动会话，再加载任意历史；后端没有身份范围。
- **impact**: 多用户部署中可枚举标题、活跃时间、消息数并读取会话正文，也可能对他人会话执行删除。
- **root_cause**: 将后端全局管理接口误当成最终用户历史列表接口。
- **recommendation**: 前端不得调用全局会话列表。仅在本浏览器保存服务端返回的 session ID（最多 20 个，只保存 ID/本地显示时间，不保存正文或 metadata），并明确标注“本设备会话”；只加载这些已知 ID。删除默认改为“从本设备列表移除”，远端删除只有在已鉴权能力开启时可用。建立会话所有权后端 backlog。
- **verification**: API mock 断言页面从不请求 `/sessions` 列表；local registry 不含问题/回答/trace；未知 ID 不能从 UI 枚举；清除本地项不调用远端 DELETE。
- **status**: `open`

### F-KA-005

- **Conventional Comment**: `issue (blocking, race)`
- **severity**: **High** — 删除 processing 记录与后台 `_process_document` 并发，能在 registry 消失后继续写入索引，形成无 registry 的孤儿证据。
- **location**: `design.md:238-250, 309-315, 340-342`；RAG `api/routers/documents.py:403-410, 602-691, 718-763`；不变量“后台摄入完成前不得允许产生不可追踪删除”。
- **symptom**: v1 对所有状态提供删除；后台任务没有取消令牌，删除 processing 记录后仍可完成 Milvus/BM25 写入，再尝试更新已删除 registry。
- **impact**: 页面无法再定位或删除已索引内容，但它仍可能参与 Agent 答案。
- **root_cause**: UI 未根据异步摄入生命周期限制破坏性操作，后端也没有协调删除与任务状态。
- **recommendation**: 对 `processing` 文档始终禁用删除并解释需等待终态；只有 `indexed/failed` 且安全删除能力开启时才允许删除。建立后端可取消摄入/墓碑检查 backlog。
- **verification**: 格式化/权限纯函数测试覆盖 processing 永不可删；Playwright 确认按钮禁用且不会发 DELETE；队列轮询直至 indexed/failed 才改变动作可用性。
- **status**: `open`

### F-KA-006

- **Conventional Comment**: `issue (blocking, concurrency)`
- **severity**: **High** — 旧 SSE run、timeout 或 RAF 可在新会话/切换历史后继续写当前消息，造成跨会话答案串扰。
- **location**: `design.md:204-215, 252-299, 303-307`；PHM `src/api/client.ts:27-31, 63-126`；不变量“异步事件只能写入其所属 run/session”。
- **symptom**: v1 只有一个 `AbortController` 描述，没有 run identity/终态优先级；通用 client 声明 `signal` 却没有从公开方法传到 request，且 tab 切换保留 active run 与组件卸载清理的描述互相冲突。
- **impact**: 取消后仍可能出现 token，旧问题的 done 覆盖新问题，或切换历史后把答案写入错误会话。
- **root_cause**: 取消被当成 UI 状态而不是请求所有权协议；组件生命周期与 store 生命周期未明确分工。
- **recommendation**: 引入单调 `runId`，每个事件、RAF flush、timeout、catch/finally 都验证 runId；定义 `done/error/cancelled` 终态优先级。公开 client 方法完整透传 signal 并移除监听器。tab 采用保持挂载/`v-show`，只有离开 `DocumentView` 才统一 dispose；新建/打开/移除会话先 abort 并隔离旧 run。
- **verification**: fake stream 测试覆盖 cancel 后迟到 token/done、新 run 启动后旧 finally、切 tab不取消、离开页面取消；断言消息永不跨 session。
- **status**: `open`

### F-KA-007

- **Conventional Comment**: `issue (blocking, information disclosure)`
- **severity**: **High** — 如果先把完整 metadata 赋给响应式消息或日志，再在组件层隐藏字段，原始 reasoning 已进入内存/调试工具/持久化路径。
- **location**: `design.md:67-71, 200, 264-277, 357-380`；RAG `api/routers/chat.py:461-515`；不变量“reasoning/intent_reasoning 在信任边界立即丢弃”。
- **symptom**: `KnowledgeMetadata` 没有公开字段 allowlist，v1 只规定“不展示/持久化”；后端明确发送 `reasoning` 和 `intent_reasoning`。
- **impact**: 原始思维内容可能经 Pinia devtools、错误上报、快照或未来缓存泄露。
- **root_cause**: 安全控制放在渲染层，晚于不可信 DTO 进入应用状态的时点。
- **recommendation**: SSE 边界建立 `PublicKnowledgeMetadata` runtime normalizer，只复制允许字段；立即丢弃 reasoning/intent_reasoning 和未知字段，禁止记录原始 frame/metadata。
- **verification**: 单元测试传入带 secret sentinel 的 reasoning/未知字段，断言 store、序列化、本地存储和日志均不含 sentinel。
- **status**: `open`

### F-KA-008

- **Conventional Comment**: `issue (blocking, robustness)`
- **severity**: **High** — 网络响应是运行时不可信输入，仅有 TypeScript interface 不能防止异常形状、超大 frame 或无限无分隔 buffer 阻塞页面。
- **location**: `design.md:113-228, 376, 386-394`；不变量“外部 DTO 必须经运行时收敛且内存有界”。
- **symptom**: v1 声称运行时守卫，但 tasks 主要要求显式 TypeScript DTO；SSE 算法没有 frame/buffer 上限，错误策略可能保留或打印原始内容。
- **impact**: malformed DTO 可导致渲染崩溃；超大或无边界流可造成内存/CPU DoS；日志可能泄露问题和来源。
- **root_cause**: 把静态类型当作传输验证，没有明确 parser 资源预算。
- **recommendation**: 为 documents/retrieval/done/history 建立无副作用 normalizer；未知状态映射 unknown，不强转成功。限制单 frame、总 buffer、token/event 数和单次回答长度；超过上限安全终止并显示可重试错误，日志只记类别和长度。
- **verification**: 单元测试覆盖错误数组/字段类型、未知状态、超限 frame、无分隔流、malformed 后继续及日志无原文。
- **status**: `open`

### F-KA-009

- **Conventional Comment**: `issue (blocking, convergence)`
- **severity**: **High** — 只看当前分页列表决定轮询会让上传队列中的 processing 文档在翻页或短暂列表失败后永远停留。
- **location**: `design.md:232-250, 338-342, 390`；不变量“已接收的 processing 文档必须最终收敛到后端终态或显式错误”。
- **symptom**: v1 没有说明队列 documentId 不在当前页时如何刷新，且 list failure 后“延后重试”没有明确调度所有权。
- **impact**: 用户看到永久处理中，可能重复上传或误判系统失败；轮询也可能因错误退出后不再恢复。
- **root_cause**: 将分页列表同时用作展示状态和后台任务跟踪事实来源。
- **recommendation**: queue 中每个 processing documentId 都通过 detail endpoint 对账，即使不在当前页；列表错误时只要仍有 queue processing 就按有界退避重试。dispose 后不得自动重启。
- **verification**: fake timer 测试覆盖不在当前页、列表失败后恢复、detail 404/failed/indexed、dispose 后无新 timer、任意时刻单飞。
- **status**: `open`

### F-KA-010

- **Conventional Comment**: `suggestion (correctness)`
- **severity**: **Medium** — 阶段与 route 是解释性 UI，不会直接改变后端结果，但错误展示会降低用户对证据路径的判断质量。
- **location**: `design.md:281-299, 325-332`；RAG `api/routers/chat.py:1051-1099, 1122-1129, 1291-1337`。
- **symptom**: v1 把首个 request/status 固定归一为“意图分析”，但 Fast 模式不分类；Thinking 的早期 intent route 也可能在最终 `done` 中因 sentinel fallback 改为 `general_chat`。
- **impact**: Fast 被误显示为完成意图分析，或早期 route 与最终回答路径冲突，用户误以为回答经过知识检索。
- **root_cause**: 将中间事件当作最终事实，且阶段映射未按 mode 分支。
- **recommendation**: Fast 只显示“检索/生成”固定路径；Thinking 的 intent 仅标“初步路由”。`done.full_response/sources/metadata` 是最终权威并覆盖 route/trust/source；缺 done 时不得赋最终可信标签。
- **verification**: 单元/Playwright 覆盖 Fast 无 intent stage、Thinking early rag + done general_chat、EOF 前不展示完成可信状态。
- **status**: `open`

### F-KA-011

- **Conventional Comment**: `suggestion (testability, deployment)`
- **severity**: **Medium** — 不改变核心数据，但当前测试和代理说明无法证明真实网络分块与生产 SSE 可持续传输。
- **location**: `design.md:40-51, 407-432, 480`；PHM `vite.config.ts:1-60`。
- **symptom**: `page.route().fulfill()` 不能可靠控制底层 byte chunk；Vite config 没有规定 `loadEnv` 取值方式和精确 rewrite；生产说明没有 SSE buffering/cache/read-timeout 要求。
- **impact**: Playwright 可能“测过流式”但实际一次性返回；生产代理可能缓冲完整回答或超时断流。
- **root_cause**: 混淆浏览器路由 mock 的响应体语义与 TCP/ReadableStream 分块，并把开发 proxy 配置当成生产部署充分条件。
- **recommendation**: 任意 byte/CRLF 分块放在 Vitest 纯 parser；Playwright 只验证完整多事件用户流程，若要验证真实流使用确定性 test server/ReadableStream。Vite 使用 `loadEnv(mode, process.cwd(), '')`，rewrite 为 `/^\/document(?=\/|$)/`；生产文档要求关闭 buffering/cache、保留 SSE content type、配置足够 read timeout。
- **verification**: config 单元检查或构建烟测；Playwright 不声称 route fulfill 覆盖 byte 分块；部署文档含 Nginx/等价代理验收请求。
- **status**: `open`

## FMEA

评分采用 `S × O × D = RPN`；S/O/D 为 1—5，数值越高分别代表影响越严重、越易发生、越难检测。

| Failure mode | S | O | D | RPN | Severity | Existing control | Required action |
|---|---:|---:|---:|---:|---|---|---|
| 未授权上传/删除导致知识投毒 | 5 | 3 | 5 | 75 | Critical | 仅扩展名/大小校验 | 生产写能力 fail closed + 网关鉴权 + 后端 backlog |
| 删除返回成功但检索证据残留 | 5 | 3 | 4 | 60 | Critical | 后端仅写日志 | 默认禁用删除 + 事务清理契约 backlog |
| 缺失主分数被序列化/展示为 0 | 4 | 4 | 4 | 64 | Critical | 前端仅处理 null/NaN | 歧义零值“未确认” + 后端可用性字段 |
| 全局会话/历史泄露 | 4 | 3 | 4 | 48 | High | 无身份边界 | 仅本设备 session ID registry |
| processing 删除与摄入竞态 | 5 | 2 | 4 | 40 | High | 无任务取消 | processing 永不可删 |
| 旧 SSE run 写入新会话 | 4 | 3 | 3 | 36 | High | 单 AbortController 描述 | runId + signal 全链路 + 终态优先级 |
| reasoning 在渲染前已进入 store | 4 | 3 | 4 | 48 | High | 组件不展示 | 边界 allowlist 丢弃 |
| 超大/异常 SSE 导致页面资源耗尽 | 4 | 3 | 3 | 36 | High | 单 active stream | frame/buffer/event/answer 上限 |
| off-page processing 永不收敛 | 3 | 4 | 3 | 36 | High | 当前页条件轮询 | detail 对账 + 有界退避 |

## STRIDE

| Threat | Evidence | v1 gap | Required control |
|---|---|---|---|
| Spoofing | RAG 文档/会话端点无用户身份 | UI 面向普通用户但没有调用者范围 | 生产写能力默认关闭；认证网关与后端身份 backlog |
| Tampering | 任意调用者可上传/删除公共知识 | 前端开箱即暴露写控件 | 角色授权、审计、能力门禁；processing 不可删 |
| Repudiation | 删除 200 不说明哪些索引失败 | UI 宣称同步清理成功 | 可验证删除契约；在此之前禁用生产删除 |
| Information disclosure | 全局 sessions/history；metadata 含 reasoning | v1 枚举全部会话，仅在渲染层隐藏 reasoning | 本地 ID registry；metadata 边界 allowlist |
| Denial of service | SSE buffer 无界、上传/轮询持续请求 | 仅“单 active”不足 | parser 预算、串行队列、单飞和退避 |
| Elevation of privilege | 浏览器功能假设代理会控制权限 | 没有可验收的授权前置条件 | 前端不是安全边界；网关认证/授权验收后显式开启 |

## Gate Decision

`design.md` v1 **不得进入编码**。F-KA-001—009 必须在 v2 中给出可执行的修订或有证据的等价替代；F-KA-001/002/003 必须保持 fail-closed，不能用 UI 提示替代安全/可信边界。
