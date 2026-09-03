# Defender 报告 — Knowledge Agent UX

- **评审对象**: `docs/specs/knowledge-agent-ux/review/critic.md`
- **评审日期**: 2026-09-02
- **设计基线**: `design.md` v1
- **裁决结果**: 11 项事实均成立；3 Critical、6 High、2 Medium 全部 `accepted`

## 裁决表

| 发现 ID | 严重性 | 决策 | 理由（file:line 证据 / 可触发边界） | design.md v2 修订条目 |
|---|---|---|---|---|
| F-KA-001 | Critical | `accepted` | RAG 上传/删除路由没有认证依赖，分别见 RAG `api/routers/documents.py:338-417,718-763`；v1 `design.md:371-380` 仅假设部署代理控制权限，普通浏览器确实可触发知识写入。 | v2 §3 Capability Policy、§9 Security、§12 Deployment Gate；新增 `RAG-KA-BL-001` |
| F-KA-002 | Critical | `accepted` | RAG 在 Milvus/BM25 清理异常后仍继续删除 registry 并返回 200，见 RAG `api/routers/documents.py:726-763`；v1 `design.md:315` 的强一致文案不成立。 | v2 §7 Document UI、§8 Degradation、§12 Deployment Gate；新增 `RAG-KA-BL-002` |
| F-KA-003 | Critical | `accepted` | 低层检索模型和构造器会把缺失主分数变成 `0.0`，见 RAG `api/routers/retrieval.py:36-43,58-90`；前端无法恢复已丢失的可用性位。 | v2 §5 Retrieval Contract、§6 Score Semantics；新增 `RAG-KA-BL-003` |
| F-KA-004 | High | `accepted` | `GET /sessions` 无 owner 过滤且 history 只凭 ID，见 RAG `api/routers/sessions.py:76-97`、`api/routers/chat.py:933-962`；v1 `design.md:217-224` 会枚举全局会话。 | v2 §5 Local Session Registry、§9 Privacy；新增 `RAG-KA-BL-004` |
| F-KA-005 | High | `accepted` | 上传在 registry 登记后启动无取消令牌的后台任务，任务可在 DELETE 后继续写索引，见 RAG `api/routers/documents.py:391-410,602-688,718-763`。 | v2 §6 Document State、§7 Destructive Actions；并入 `RAG-KA-BL-002` |
| F-KA-006 | High | `accepted` | v1 `design.md:281` 只有 controller，没有 run identity；PHM `src/api/client.ts:27-31,63-126` 声明 signal 却未透传，迟到事件和 tab 生命周期冲突均可达。 | v2 §5 Abort Contract、§6 Run Ownership、§7 Shell Lifecycle |
| F-KA-007 | High | `accepted` | 后端 metadata 明确包含 `intent_reasoning`、`reasoning`，见 RAG `api/routers/chat.py:492-514`；v1 `design.md:264-277` 允许完整 metadata 先进入 Pinia。 | v2 §5 Public Metadata Normalizer、§9 Information Disclosure |
| F-KA-008 | High | `accepted` | v1 `design.md:193-215,376` 只有静态 union 和未量化的“运行时守卫”，没有 frame/buffer/event/answer 预算；异常网络输入可触发。 | v2 §5 Runtime Normalization、§10 Resource Budgets |
| F-KA-009 | High | `accepted` | v1 `design.md:244-250` 同时用分页列表承担展示和后台跟踪，未定义 off-page documentId 对账及失败后的调度所有权。 | v2 §6 Poll Coordinator、§8 Tracking Degradation |
| F-KA-010 | Medium | `accepted` | Fast 后端固定走检索但仍发合成 intent，Thinking 的早期 route 可被 done fallback 改写，见 RAG `api/routers/chat.py:1051-1099,1122-1129,1291-1337`。 | v2 §6 Stage Semantics、§7 Trust Presentation |
| F-KA-011 | Medium | `accepted` | `page.route().fulfill()` 不能证明 TCP/ReadableStream 分块；v1 `design.md:409-414` 的测试声明过强，生产代理也缺 SSE 传输验收。 | v2 §3 Proxy Contract、§11 Test Strategy、§12 Deployment Gate |

## 逐条论证

### F-KA-001 — 未授权知识写入

- **步骤 1 核验**: 事实成立。RAG `api/routers/documents.py:338-417` 的上传和 `:718-763` 的删除没有 `Depends(require_admin)` 或用户/角色依赖；相对地，管理端点显式使用权限依赖，说明不能把“路由存在”解释成隐含授权。v1 `design.md:371-380` 只写“不实现身份系统”和“生产代理权限由部署层控制”，没有可验证前置条件。
- **步骤 2 触发**: 可触发。任何能访问同源 `/document` 的浏览器均可直接构造 POST upload 或 DELETE；隐藏按钮不能阻止手工 HTTP 请求。
- **步骤 3 成本**: 后端完整鉴权成本高，但前端能力门禁、代理部署门禁和只读降级成本低；Critical 影响要求接受。
- **步骤 4 范围**: 前端不能成为授权边界，但“本前端默认不得扩大未授权写入口”属于本设计范围；服务端身份/角色/审计属于后端 backlog。
- **步骤 5 替代**: v2 采用双层 fail-closed，而不是仅靠 UI 提示：
  1. `VITE_RAG_UPLOAD_ENABLED` 与 `VITE_RAG_DELETE_ENABLED` 均仅在值严格等于字符串 `true` 时开启，所有环境缺省均为 `false`；删除开关独立且更严格。
  2. 关闭时 UI 保持文档只读并解释原因，不渲染可执行上传/删除控件。
  3. 生产部署必须在同源网关按 path + method 强制认证、角色授权、审计、请求大小/速率限制及 cookie 场景的 CSRF/SameSite 策略；未通过清单不得把构建开关设为 true。前端开关明确标注为 UX capability，不声称是安全边界。
  4. 建立 `RAG-KA-BL-001`：RAG 文档写端点增加服务端身份、角色、owner/租户与审计契约。
- **决策**: `accepted`。
- **design.md v2 修订**: 新增 Capability Policy 与 Production Security Gate；单元测试锁定缺省只读，Playwright 断言关闭能力时无可执行写动作，并在部署文档记录网关验收证据。

### F-KA-002 — 删除 200 与索引残留

- **步骤 1 核验**: 事实成立。RAG `api/routers/documents.py:726-753` 对 Milvus/BM25 清理失败只记录日志，`:755-763` 仍删除 registry 并返回成功；因此 v1 `design.md:315` 的“同步清理向量和关键词索引”不是可由响应证明的事实。
- **步骤 2 触发**: 可触发。Milvus、BM25、Graph/RAPTOR/visual 任一清理异常即可出现列表项消失但证据仍可检索；浏览器只看到 HTTP 200，无法检测。
- **步骤 3 成本**: 事务化后端修复成本高；默认禁用删除和收敛文案成本低。Critical 发现必须接受。
- **步骤 4 范围**: 后端事务契约不在 frontend-only 实现范围，但删除能力暴露方式、文案和部署门禁在范围内。
- **步骤 5 替代**: 在 `RAG-KA-BL-002` 关闭前，`VITE_RAG_DELETE_ENABLED` 缺省 false，生产部署不得开启。即使经例外验收开启，UI 只写“服务已接受删除请求/登记列表已刷新”，不声称所有索引已清理；成功后重新读取列表而非乐观宣告强一致。`RAG-KA-BL-002` 要求关键索引任一清理失败返回非 2xx、保留可重试状态，并为摄入任务增加 tombstone/cancel 协调。
- **决策**: `accepted`。
- **design.md v2 修订**: 删除 UI、降级矩阵、REQ-KA-013 文案和部署门禁全部改为上述弱契约；契约测试模拟 200，断言页面不存在“索引均已清理”承诺。

### F-KA-003 — 歧义零分

- **步骤 1 核验**: 事实成立。RAG `api/routers/retrieval.py:36-43` 将低层主 `score` 声明为默认 `0.0`，`:58-90` 在缺失字段时也主动取 `0.0`；v1 `design.md:71,160` 的 nullable DTO 无法改变线上 JSON 已经丢失的信息。
- **步骤 2 触发**: 可触发。任一结果对象缺少原始 score 时，服务返回 0；前端若按普通有限数格式化就会把不可用显示为确定零分。
- **步骤 3 成本**: 后端增加可用性位成本中等且超出本期；前端把零标成歧义状态成本低。Critical 影响要求接受。
- **步骤 4 范围**: 恢复真实 score 不在前端能力内，但不得把歧义值包装成确定事实属于本设计范围。
- **步骤 5 替代**: v2 对低层 retrieval 主 score 使用端点特定语义：missing/null/非有限值为“未提供”；严格等于 0 为“未确认（服务返回 0）”，不得着成功/失败色或参与质量判断；有限非零值才显示原始数值。可空的 `retrieval_score`/`rerank_score` 只在字段为有限数时显示，其中显式有限 0 保留为 0。Agent source 的可空 score 仍按实际 presence 处理，不把 null 转 0。建立 `RAG-KA-BL-003`，要求后端将主 score 改为可空或增加 `score_available`、`score_kind`。
- **决策**: `accepted`。
- **design.md v2 修订**: 增加 `ambiguous-zero` 格式状态和说明；单元/Playwright 覆盖 missing、null、NaN、歧义 0、有限非零，禁止 `value || 0`。

### F-KA-004 — 全局会话枚举

- **步骤 1 核验**: 事实成立。RAG `api/routers/sessions.py:76-97` 返回全局 session 列表，无 owner 参数或权限依赖；RAG `api/routers/chat.py:933-962` 只凭 session ID 返回正文。v1 `design.md:220-224` 会直接调用这组接口。
- **步骤 2 触发**: 可触发。第二名用户打开历史抽屉即可看到第一名用户的标题、时间和计数，并可继续读取/删除已枚举 ID。
- **步骤 3 成本**: 完整多用户所有权需后端改造；前端停止全局枚举并维护本地 ID registry 成本中等。High 且修复成本可控，必须接受。
- **步骤 4 范围**: 防止本 UI 主动枚举他人会话在范围内；真正的服务端访问控制在 backlog。
- **步骤 5 替代**: v2 从不请求 `GET /document/sessions`。只保存本浏览器从 SSE `session` 事件获得的最多 20 个 ID，以及本地显示时间；不保存问题、回答、title、source、metadata、trace/message ID。抽屉标为“本设备会话”，只为 registry 内 ID请求 history。默认“移除”只删除本地 registry 项，不调用远端 DELETE；远端会话删除使用独立 `VITE_RAG_SESSION_DELETE_ENABLED`，缺省 false，且只能在已鉴权部署验收后开启。建立 `RAG-KA-BL-004`：会话 owner/租户过滤及按 owner 授权 history/delete。
- **决策**: `accepted`。
- **design.md v2 修订**: 替换 v1 §5.6 和 §7.4 的全局会话列表/删除契约；增加本地 registry 数据最小化、20 项 LRU、清除入口和 API mock“绝不调用 `/sessions` list”断言。

### F-KA-005 — processing 删除竞态

- **步骤 1 核验**: 事实成立。RAG `api/routers/documents.py:391-410` 登记 processing 后启动后台任务，`:602-688` 可继续解析并写入多类索引，`:718-763` 的 DELETE 没有与任务协调。
- **步骤 2 触发**: 可触发。用户在处理期间删除，DELETE 先完成清理/registry 删除，后台任务随后重新写入索引并对已不存在的 registry 执行 update，形成不可追踪证据。
- **步骤 3 成本**: 前端禁用 processing 删除成本低；High 影响要求接受。
- **步骤 4 范围**: UI 状态门禁在本期；后台取消/墓碑属于 `RAG-KA-BL-002`。
- **步骤 5 替代**: 无需接受竞态。`canDeleteDocument(status, capability)` 仅在 capability 开启且 status 为 `indexed` 或 `failed` 时为 true；`processing` 与 `unknown` 永远 false。长期 processing 显示“等待服务进入终态；当前不能安全删除”，提供刷新/运维指引，不再承诺用户直接删除。
- **决策**: `accepted`。
- **design.md v2 修订**: 修正 v1 `design.md:342` 的“可删除”恢复路径；纯函数和 Playwright 断言 processing 永不发 DELETE，终态到达后才重新计算动作能力。

### F-KA-006 — SSE/run 所有权与取消

- **步骤 1 核验**: 事实成立。v1 `design.md:281` 只描述一个 AbortController，没有识别迟到事件所属 run；PHM `src/api/client.ts:27-31` 有 RequestOptions，但 `:63-126` 的 request/get/post/upload 没有把 options/signal 传入。v1 同时要求 tab 保留状态和“组件卸载清理”，所有权不明确。
- **步骤 2 触发**: 可触发。abort 后旧 reader 的 catch/finally、已排队 RAF 或 timeout 仍可运行；用户立即重试、打开历史或切换会话后，它们会写入共享的“最后一条消息”。
- **步骤 3 成本**: run identity、信号透传和壳层生命周期调整为中等成本；High 影响必须接受。
- **步骤 4 范围**: 完全属于前端状态与客户端实现范围。
- **步骤 5 替代**: v2 定义请求所有权协议：
  - 单调 `runId` 和稳定 `assistantMessageId/sessionId` 由每个闭包捕获；event、RAF、timeout、catch、finally 在写状态前同时校验 runId 和目标消息。
  - cancel/new/open/remove/dispose 先使 runId 失效，再 abort controller 并取消 RAF/timer；迟到事件全部 no-op。
  - 终态采用 first-terminal-wins：`completed/error/cancelled/interrupted` 一旦提交不可被 EOF/finally 覆盖；error 后 EOF 不改成 interrupted，cancel 后 done 不改成 completed。
  - 公共 client 的 get/post/put/del/upload 增加向后兼容的可选 RequestOptions，完整透传 signal；组合 timeout/external signal 时清理 listener，并把 timeout 与用户取消映射成不同 error kind。
  - tab 内容保持挂载（`v-show` 或等价方式），切 tab 不 dispose；只有 `DocumentView` 真正离开时统一取消 Agent、文档、检索和轮询网络活动。
- **决策**: `accepted`。
- **design.md v2 修订**: 新增 Run Ownership 状态机和 Abort Contract；fake stream 测试覆盖 cancel 后 token/done、旧 finally、新 run、历史切换、tab 切换和页面离开。

### F-KA-007 — reasoning 边界丢弃

- **步骤 1 核验**: 事实成立。RAG `api/routers/chat.py:492-514` 的 done metadata 包含 `intent_reasoning` 和 `reasoning`；v1 `design.md:264-277` 的 `metadata?: KnowledgeMetadata` 没有排除字段，组件“不显示”发生得太晚。
- **步骤 2 触发**: 可触发。正常 Thinking/Fast done 即可让完整 metadata 进入 Pinia，随后被 devtools、错误快照或未来 persistence 观察。
- **步骤 3 成本**: 边界 allowlist normalizer 成本低；High 影响必须接受。
- **步骤 4 范围**: 完全属于前端 DTO 信任边界。
- **步骤 5 替代**: v2 的 `normalizePublicMetadata(raw)` 只复制 route、prompt_profile、force_rag、message_id、trace_id、有限 confidence/intent_confidence、confidence_level、refused、source_count、经过归一化的 structured_answer 和 section_labels。`reasoning`、`intent_reasoning` 与全部未知字段在 SSE callback 内立即丢弃；raw frame/raw metadata 不赋响应式状态、不缓存、不持久化、不打印。
- **决策**: `accepted`。
- **design.md v2 修订**: 状态字段改为 `PublicKnowledgeMetadata`；带 secret sentinel 的单元测试断言 store、序列化、本地 registry 和日志 mock 均不含该值。

### F-KA-008 — 运行时收敛与资源预算

- **步骤 1 核验**: 事实成立。TypeScript interface 在运行时被擦除；v1 `design.md:193-215` 直接 JSON parse/callback，`:386-394` 只限制 RAF/cache/并发，没有 SSE frame、buffer、事件或回答上限。
- **步骤 2 触发**: 可触发。错误字段类型会使组件假设崩溃；没有分隔符或超大 data frame 会让 buffer 持续增长；记录 raw frame 还可能泄露正文。
- **步骤 3 成本**: 手写无副作用 normalizer 和有界 parser 为中等成本；High 影响要求接受。
- **步骤 4 范围**: 网络 DTO 消费和浏览器资源保护均在本期。
- **步骤 5 替代**: v2 明确：
  - documents、retrieval、session history、SSE event、done metadata/sources 均先进入纯 normalizer；未知 document status 映射 `unknown`，绝不映射 indexed/success；非有限分数映射 unavailable。
  - parser 常量固定并导出测试：单个 frame 与无分隔 pending buffer各不超过 1 MiB；单 stream 总输入不超过 16 MiB；事件不超过 50,000；累计回答不超过 200,000 UTF-16 code units；来源最多 50 条且单片段最多 20,000 code units。
  - 超限时先使 run 失效并 abort，保留已安全接收的部分正文，终态为 error，用户文案为“响应超过安全限制，可重试”；日志只记 error kind、长度和 event type，不含 raw frame、问题、回答或来源。
  - malformed 单帧仍可跳过并继续，但也计入总输入/事件预算。
- **决策**: `accepted`。
- **design.md v2 修订**: 增加 Runtime Normalization 与 Resource Budgets；单元测试覆盖错误数组/类型、unknown、各上限边界、无分隔流、malformed 后继续和日志无原文。

### F-KA-009 — off-page processing 收敛

- **步骤 1 核验**: 事实成立。v1 `design.md:244-250` 的 polling 只描述列表成功/队列变化，上传响应已经有 documentId，却没有用 detail endpoint 追踪；分页或失败会让队列失去事实来源。
- **步骤 2 触发**: 可触发。用户翻页、page size 变化或列表短暂 500 后，刚上传 ID 不在当前 page；queue 仍是 processing，但没有明确请求能把它推进到 indexed/failed。
- **步骤 3 成本**: detail 对账和单一 coordinator 为中等成本；High 且可控，必须接受。
- **步骤 4 范围**: 完全属于文档 store/polling。
- **步骤 5 替代**: v2 使用独立事实来源：上传成功后 queue 保存 documentId；单一 poll coordinator 每轮先单飞刷新可见列表，再对 queue 中 processing IDs 串行调用 `GET /documents/{id}`，不依赖当前页。成功重置为约 3 秒；网络/列表失败时，只要仍有 queue processing 就按 3/6/12/24/30 秒有界退避继续。detail 变 indexed/failed 时更新 queue 并刷新列表；404/持续无效响应进入显式 `tracking_error`，不伪装 failed/indexed。dispose 先递增 coordinator generation、清 timer 和 abort in-flight，任何 finally 都不得重新调度。
- **决策**: `accepted`。
- **design.md v2 修订**: UploadQueue 增加 `tracking_error`；fake timer 测试覆盖 off-page、失败恢复、detail 404/failed/indexed、单飞和 dispose 后零 timer。

### F-KA-010 — 阶段与最终 route

- **步骤 1 核验**: 事实成立。Fast 分支明确“no classification”但会发固定 intent，见 RAG `api/routers/chat.py:1051-1064`；Thinking 可先发 rag route，再由 fallback 的 done 改为 general_chat，见 `:1122-1129,1291-1337`。
- **步骤 2 触发**: 两条路径均为正常分支，不是不可达异常。
- **步骤 3 成本**: mode-aware 映射与 done 覆盖成本低，Medium 影响值得接受。
- **步骤 4 范围**: 属于本期可信状态展示。
- **步骤 5 替代**: Fast 不创建“意图分析”阶段，只展示固定的“知识检索/生成”；Thinking intent 标记为“初步路由”。只有 done 的 `full_response/sources/PublicKnowledgeMetadata` 是最终事实并原子覆盖 route、trust、source；done 前只显示 provisional，不赋完成/可信标签。EOF/error/cancelled 无 done 时保持未完成且不推断最终 route。
- **决策**: `accepted`。
- **design.md v2 修订**: 修改阶段表和 done merge 规则；测试 early rag + done general_chat、Fast 无 intent stage、EOF 前无最终可信标签。

### F-KA-011 — 流式测试与代理部署

- **步骤 1 核验**: 事实成立。v1 `design.md:409-414` 同时声明所有 E2E 使用 `page.route` 且能控制网络 chunk；该 mock 能提供响应体但不能可靠证明底层 byte 分块。v1 `design.md:40-51,480` 也只描述 URL rewrite。
- **步骤 2 触发**: 测试假阳性和生产代理 buffering/timeout 都是常见可达配置。
- **步骤 3 成本**: 重分测试责任、精确读取 env/rewrite 和补部署文档成本低，Medium 影响接受。
- **步骤 4 范围**: 前端测试与集成部署说明在本期范围。
- **步骤 5 替代**: 任意 byte、CRLF、EOF tail、跨 chunk UTF-8 全由 Vitest 直接喂纯 parser 验证；Playwright 的 `page.route` 只验证完整多事件 POST SSE 到 UI 的流程，不再声称覆盖 byte chunk。若必须浏览器级真实分块，另用确定性 test HTTP server 或 init-script `ReadableStream`。Vite 配置接收 mode 并用 `loadEnv(mode, process.cwd(), '')`，rewrite 使用 `/^\/document(?=\/|$)/`。生产文档要求禁用 response buffering/cache、保留 `text/event-stream`、设置不低于部署响应预算的 read timeout，并用 `curl -N`/等价烟测证明首个 session/status 在 done 前到达。
- **决策**: `accepted`。
- **design.md v2 修订**: 修正 §11.2 测试声明，扩充 Vite/生产代理契约及验收清单。

## Backend Backlog

这些条目是本次评审产生的稳定内部 issue ID。前端 v2 的 fail-closed 缓解必须先落地；backlog 未关闭前不得把其对应的生产能力默认打开。

| Issue ID | 来源 finding | 后端工作 | 前端临时边界 |
|---|---|---|---|
| `RAG-KA-BL-001` | F-KA-001 | 文档写端点增加身份、角色/租户、审计、CSRF/同源契约 | 上传/删除 capability 缺省 false；生产网关 path+method 授权 |
| `RAG-KA-BL-002` | F-KA-002/F-KA-005 | 多索引可验证/事务化删除；失败保留可重试状态；摄入 cancel/tombstone | 删除缺省关闭；processing/unknown 永不可删；不作强一致文案 |
| `RAG-KA-BL-003` | F-KA-003 | retrieval 主 score 可空或提供 `score_available/score_kind` | 低层主 score 0 标为歧义，不作为确定 0 |
| `RAG-KA-BL-004` | F-KA-004 | session owner/租户范围；history/delete 授权 | 不调用全局 list；只列本浏览器已知 ID；远端删除缺省关闭 |

## 范围外问题清单

本报告没有使用 `acknowledged-out-of-scope` 逃避任何 finding；11 项均接受并要求 v2 给出前端可执行修订。上表 backend backlog 是完整根治的一部分，不替代本期 fail-closed 门禁。

## 诚实承认的有限边界

- 浏览器 capability 开关只能控制产品 UI，不能提供授权；真正安全边界必须位于同源网关和 RAG 服务端。
- 当前 DELETE 200 无法证明多索引完全清理，因此生产删除在 `RAG-KA-BL-002` 或等价可验证契约完成前保持关闭。
- 当前低层 retrieval JSON 已丢失主 score 0 的可用性语义；前端只能诚实标成歧义，不能猜测真实值。
- 本地 session registry 减少 UI 主动枚举，但不能修复已知 session ID 可直接读历史的服务端缺陷；跨设备历史需要后端 owner 契约。
- Playwright route mock 验证应用层 SSE 事件处理，不证明 TCP 分块；字节级正确性由纯 parser 测试承担。
- 本期仍不展示 HTTP 未提供的 RetrievalWorkflow diagnostics，也不修改 RAG 后端契约。
