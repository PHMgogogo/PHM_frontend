# Knowledge Agent UX Design

- **Version**: v2（critic/defender gate accepted）
- **Date**: 2026-09-02
- **Requirements**: [requirements.md](requirements.md)
- **Implementation repository**: `PHM_frontend` only
- **Adversarial review**: 3 Critical / 6 High / 2 Medium，全部 accepted；见 `review/`

## 1. Design Summary

本设计把现有 `DocumentView` 从单一文档卡片页升级为“知识中心”壳层，内部按用户任务拆成：

1. **文档库**：管理摄入生命周期，诚实展示处理/索引/失败状态。
2. **检索验证**：直接调用三种低层检索接口，帮助用户确认资料是否可召回。
3. **知识库 Agent**：调用 RAG `POST SSE` 聊天接口，展示执行阶段、结构化 PHM 回答、证据、可信状态、本设备会话和可选反馈。

现有 OpenCode `ChatPanel`、`chatStore` 和飞机任务绑定保持不变。RAG 浏览器流量继续使用既有 `/document` 前缀，从而避开 PHM 主业务 `/api` 冲突。因当前 RAG 文档/会话/反馈写端点没有用户授权边界，v2 对所有 mutation fail closed，不能用前端按钮隐藏替代网关/服务端鉴权。

### 1.1 v2 review closure

| Review risk | v2 decision |
|---|---|
| 未授权知识写入 | upload/feedback/session-delete capability 缺省 false；生产仅在认证授权网关验收后开启 |
| DELETE 200 不能证明多索引清理 | 独立 delete capability 缺省 false；backlog 关闭前生产不得开启；UI 不作强一致承诺 |
| 缺失低层 score 被服务转成 0 | 主 `score=0` 显示“未确认（服务返回 0）”，不参与质量判断 |
| 全局 session 枚举 | 永不调用全局 list；只保存本设备收到的最多 20 个 session ID |
| processing 删除竞态 | processing/unknown 永不可删 |
| 迟到 SSE/RAF 串扰 | 单调 runId + 稳定 session/message ownership + first-terminal-wins |
| reasoning 泄露 | SSE 边界 `PublicKnowledgeMetadata` allowlist，原始 metadata 立即丢弃 |
| 网络输入/资源无界 | runtime normalizer + 明确 frame/buffer/stream/event/answer/source budgets |
| off-page processing 不收敛 | 独立 detail 对账 + 有界退避 |
| stage/route 误导 | Fast 不伪造 intent；done 是最终 route/source/trust 权威 |
| 流式测试/生产代理假设 | byte chunk 由 unit 验证；Playwright 只验应用事件；生产做无缓冲烟测 |

## 2. Baseline Findings

| Baseline location | Current behavior | Design consequence |
|---|---|---|
| `.gitignore` 最后的 `config` | `src/config/` 被整体忽略，`origin/dev` 缺 `endpoints.ts` | 先收窄 ignore 并跟踪端点文件 |
| `src/api/document.ts` | 状态写成 `processing/completed`，重复上传期待成功体 `duplicate` | 对齐 `processing/indexed/failed` 与 HTTP 409 |
| `src/views/DocumentView.vue` | 状态函数无条件返回“已完成/success” | 用穷尽状态映射替换 |
| `src/views/DocumentView.vue` | 不论是否有处理中项目，每 3 秒永久轮询 | 改为 processing 驱动的单飞轮询 |
| `vite.config.ts` | 没有 `/document` proxy | 增加环境化 RAG proxy 和 `/api` rewrite |
| `package.json` + root `tsconfig.json` | 基线曾暴露 33 条错误；依赖解析到 TypeScript 6.0.3 后，根级 `vue-tsc --noEmit` 会对 references 假绿，而 `-p tsconfig.app.json` 仍暴露真实错误 | 改为 `vue-tsc --build --force` 显式遍历 references，把真实错误转绿，不用 exclude 绕过 |
| `src/utils/useMarkdown.ts` | `markdown-it html:true` 结果直接供 `v-html` 使用 | 统一在缓存前做 DOMPurify 净化 |
| `src/api/document.ts` | 三种检索 API 已存在但 UI 无调用方 | 保留并补齐响应字段后供检索验证台使用 |
| `src/stores/chat.ts` | 只实现 OpenCode GET EventSource 协议 | 新建 RAG Agent store，不复用/污染 OpenCode store |

## 3. Key Decisions

### 3.1 Frontend-only integration

- 本期只调用 RAG 已发布 HTTP 契约，不增加后端字段或路由。
- MCP `rag_retrieve` 是 RAG 进程内工具，浏览器不可直接访问；检索验证台明确标为低层检索。
- Agent 的公开可信信息来自 SSE `status/node/done` 和 done metadata，不推断内部 planner 状态。

### 3.2 Keep `/document` as the RAG gateway

前端常量新增语义名 `API_PREFIX.RAG`，值仍为 `/document`；`DOCUMENT` 保留为兼容别名。开发代理：

```text
browser /document/chat/stream
  -> Vite proxy target ${VITE_RAG_PROXY_TARGET:-http://127.0.0.1:8000}
  -> rewrite /document to /api
  -> RAG /api/chat/stream
```

Vite 配置通过 `loadEnv(mode, process.cwd(), '')` 读取 target，rewrite 使用 `/^\/document(?=\/|$)/`，避免误改 `/documentary`。生产构建不包含 Vite proxy，因此 README 必须记录部署层同样的 `/document -> RAG /api` 映射，并要求 SSE 禁用 buffering/cache、保留 `text/event-stream`、配置足够 read timeout。前端不硬编码管理员密钥或生产地址。

### 3.3 Mutation capability policy

以下变量只有值严格等于字符串 `true` 时开启；所有环境缺省均为 `false`：

| Capability | Environment variable | Default | Additional gate |
|---|---|---|---|
| upload | `VITE_RAG_UPLOAD_ENABLED` | false | 生产同源网关 path+method 认证、角色授权、审计、大小/速率限制、CSRF/SameSite 验收 |
| feedback | `VITE_RAG_FEEDBACK_ENABLED` | false | 与 upload 相同；CORRECTION 会写 memory，必须视为知识 mutation |
| document delete | `VITE_RAG_DELETE_ENABLED` | false | `RAG-KA-BL-002` 或等价可验证清理契约关闭前生产不得开启 |
| remote session delete | `VITE_RAG_SESSION_DELETE_ENABLED` | false | `RAG-KA-BL-004` owner 契约关闭前生产不得开启 |

这些变量只是 UX capability，不是授权边界。关闭时不渲染可执行控件并显示只读说明；它们不能阻止用户手工构造 HTTP，所以生产代理必须执行真正的授权。

### 3.4 Separate RAG and OpenCode state

OpenCode 与 RAG 的协议和会话语义不同：

| Concern | OpenCode | RAG Agent |
|---|---|---|
| Stream | `GET EventSource /event` | `POST fetch /chat/stream` |
| Event shape | `message.part.*`, tools, questions | `session/status/intent/node/token/done/error` |
| Session owner | PHM Task + OpenCode session | RAG session memory |
| Evidence | Tool parts | `sources[]` + metadata |
| Feedback | 无 RAG trace 契约 | `message_id/trace_id` |

因此新建 `useKnowledgeAgentStore`，不向 `useChatStore` 添加条件分支。

### 3.5 Trustworthy presentation over internal reasoning

- 展示：模式、公开阶段、最终 done route、force_rag、动态结构化字段、来源、分数、耗时、confidence level、refused/degraded。
- 不展示：`reasoning`、`intent_reasoning` 的正文、未由 HTTP 返回的 diagnostics；这些字段在 SSE callback 边界立即丢弃，绝不先进入 Pinia。
- `null/undefined/NaN` 分数统一为“未提供/未评估”；只有有限数值才格式化。
- 低层 retrieval 主 `score=0` 是后端已丢失 availability 的歧义值，显示“未确认（服务返回 0）”；Agent source 的 nullable score 仍按字段 presence 处理。
- `refused=true` 或 `route=degraded` 使用独立警示，不与正常回答成功色混用。

## 4. Proposed Source Layout

```text
src/
  api/
    client.ts                       # 友好错误提取、路径拼接（保持既有调用兼容）
    document.ts                     # 文档 + 三类检索的真实 DTO
    knowledge-agent.ts              # chat/session/history/feedback DTO 与调用
  components/knowledge/
    DocumentLibrary.vue             # 文档生命周期 + 上传队列
    RetrievalWorkbench.vue          # 三类低层检索
    KnowledgeAgentPanel.vue         # Agent 页面编排
    AgentMessage.vue                # 可信状态 + 结构化回答 + 反馈
    SourceDrawer.vue                # 来源证据纯文本展示
    SessionDrawer.vue               # 本设备会话 ID / 移除 / 打开
  config/endpoints.ts               # 被 git 跟踪的服务前缀
  stores/
    knowledge.ts                    # 文档状态、上传队列、条件轮询
    knowledge-agent.ts              # Agent 消息、SSE run ownership、本地会话、反馈
  utils/
    sse.ts                          # 与 Vue 无关的增量 SSE parser
    knowledge-format.ts             # 状态/分数/阶段纯函数
    useMarkdown.ts                  # Markdown + KaTeX + DOMPurify
  views/DocumentView.vue            # 知识中心 tabs 壳层
tests/
  unit/
    sse.test.ts
    knowledge-format.test.ts
    api-error.test.ts
    markdown-security.test.ts
  e2e_ui/
    knowledge-documents.spec.ts
    knowledge-retrieval.spec.ts
    knowledge-agent.spec.ts
    knowledge-security.spec.ts
```

组件可在实现时合并，但不得把 RAG 协议重新塞入 OpenCode store/组件。

## 5. API Contracts

### 5.1 Common gateway

`knowledge-agent.ts` 使用一个只接受相对路径的 `ragUrl(path)`：

- 去除调用方路径的前导 `/` 后拼到 `API_PREFIX.RAG`。
- session/document path 参数先 `encodeURIComponent`。
- query 使用 `URLSearchParams`。
- 不接受绝对 URL，避免把服务端返回或用户输入变成请求目标。

### 5.2 Document contract

```ts
type DocumentStatus = 'processing' | 'indexed' | 'failed'

interface DocumentItem {
  id: string
  filename: string
  status: DocumentStatus
  chunks: number
  created_at: number
  size_bytes: number
  file_hash: string
}

interface DocumentUploadResponse {
  id: string
  filename: string
  status: 'processing'
  message: string
}
```

HTTP 409 不进入 `DocumentUploadResponse`，而由 `ApiError(status=409, data={detail})` 进入上传队列的 `duplicate` 终态。

文档列表请求保存 `response.total`。首版使用后端分页，页面统计分别写成“文档总数（server total）”与“当前页分块”，避免把局部分块求和当作全库值。搜索框明确为当前页筛选；这比在没有 server search 的情况下伪装全库搜索更诚实。

### 5.3 Retrieval contract

```ts
type RetrievalStrategy = 'hybrid' | 'dense' | 'sparse'

interface RetrievalResultItem {
  content: string
  source: string
  title: string
  score: number | null
  retrieval_score: number | null
  rerank_score: number | null
  rerank_applied: boolean
}
```

传输 DTO 先通过 `normalizeRetrievalResponse()`；`score` 在内部保留 `number | null`，并由端点专用 formatter 输出 `available | unavailable | ambiguous-zero`。严禁 `Number(raw) || 0` 或布尔 fallback。

端点映射：

| Strategy | Request path |
|---|---|
| `hybrid` | `POST /document/retrieval` |
| `dense` | `POST /document/retrieval/dense` |
| `sparse` | `POST /document/retrieval/sparse` |

主分数、检索分数和重排分数分别展示为有限小数，不擅自都转为百分比，因为 RRF 分数并非概率。

### 5.4 Chat and SSE contract

请求：

```ts
interface KnowledgeChatRequest {
  message: string
  session_id?: string
  stream: true
  include_sources: true
  mode: 'thinking' | 'fast'
}
```

已知事件：

```ts
type KnowledgeStreamEvent =
  | { type: 'session'; session_id: string }
  | { type: 'status'; message: string }
  | { type: 'intent'; intent: string; confidence?: number; route?: string; force_rag?: boolean }
  | { type: 'node'; name: string }
  | { type: 'token'; content: string }
  | { type: 'done'; full_response: string; sources?: SourceDocument[]; processing_time_ms?: number; metadata?: PublicKnowledgeMetadata }
  | { type: 'error'; message: string }
```

未知 `type` 被忽略以保持向前兼容；格式错误的单帧只记录类别/长度并跳过，不记录原始 frame，也不把后续有效帧丢弃。所有事件先经过 `normalizeKnowledgeStreamEvent()`。流正常 EOF 但没见到 `done` 时，run 进入 `interrupted`。

`done` 事件在一个同步提交中原子覆盖 `full_response/sources/PublicKnowledgeMetadata/processing_time`；Thinking 的 intent route 只是 provisional，不能覆盖最终 done route。Fast 的固定 intent 事件不创建“意图分析”阶段。

### 5.5 SSE parser algorithm

`src/utils/sse.ts` 是无 Vue 依赖的纯解析层：

1. `TextDecoder.decode(chunk, {stream:true})` 追加到字符串 buffer，并累计实际输入 budget。
2. 同时识别 `\n\n` 与 `\r\n\r\n` 帧边界。
3. 每帧收集所有 `data:` 行并以 `\n` 拼接；注释/空行忽略。
4. JSON 解析成功后回调；未知 event 留给 store 忽略。
5. EOF 调用 `decoder.decode()` flush，并处理最后一个无空行终止的完整 `data:` 帧。
6. AbortError 由调用层依据 abort origin 映射为 `cancelled` 或 connect timeout，不把用户取消当作服务故障。
7. 单 frame 和未分隔 pending buffer 均不超过 1 MiB；单 stream 总输入 16 MiB、事件 50,000、回答 200,000 UTF-16 code units；超过上限抛出无正文的 typed error。

### 5.6 Local session and history contract

- 新对话：清空当前消息及 session ID；首条请求不传 ID，以 SSE `session` 为准。
- 会话列表：绝不调用无 owner 范围的 `GET /document/sessions`；本地 `localStorage` 只保存 SSE `session` 事件得到的最多 20 个 `{id, seenAt}`，不保存标题、问题、回答、source、metadata、trace/message ID。
- `localStorage` 读写均是非关键 best-effort 边界；访问或写入失败不得从 SSE `done` 冒泡、不得把服务端已完成回答改成 error，也不得在内存列表中虚报登记。服务明确保存但设备登记失败时显示“服务已保存 · 本设备未登记”。
- 历史：只允许对本地 registry 内 ID 调用 `GET /document/chat/history/{id}?limit=50`。
- 默认移除：仅忘记本地 ID，不调用远端 DELETE；抽屉明确命名“本设备会话”。
- 远端删除：独立 capability，缺省关闭；只有已鉴权 owner 契约的部署才允许调用。
- 历史接口没有旧 metadata/sources/message_id/trace_id；加载后消息标记 `historical=true`，不提供引用和反馈按钮。
- 某个本地历史请求失败只影响该会话，不阻塞发起新对话；抽屉保持打开并展示错误，只有请求成功且 owner 仍为当前选择时才切换会话并关闭抽屉。

### 5.7 Feedback contract

只有 feedback capability 开启，且同时具备 `sessionId`、`metadata.message_id`、`metadata.trace_id` 的新回答可反馈。请求体包含原回答；`CORRECTION` 还必须包含非空 `corrected_answer`。状态只能从 `idle|failed` 进入 `submitting`；提交期间所有反馈入口禁用，成功后进入 `submitted`，响应 envelope 无效或请求失败则进入 `failed` 并保留纠正文案。因 correction 会写 RAG memory，feedback 与文档上传同样被视为 mutation。

### 5.8 Runtime normalization and public metadata

外部 JSON 先作为 `unknown` 进入纯 normalizer：documents、retrieval、history、SSE event、done sources/metadata 和 mutation response 均不直接 type assertion。顶层 envelope 必须严格具备后端 response model 的必填字段；HTML、`{}` 或字段类型错误的 2xx 作为 `ApiError(kind=invalid-response)`，保留当前可用状态而不是归一化为空成功。合法 envelope 内的单项可以有界跳过。未知文档状态映射为 `unknown`，不映射 indexed；数组和字符串均有数量/长度上限。`done` 必须包含非空 `full_response`，否则跳过该帧并在 EOF 进入 interrupted，保留已经接收的 token。

`normalizePublicMetadata(raw)` 仅复制：`route`、`prompt_profile`、`force_rag`、`message_id`、`trace_id`、有限 `confidence/intent_confidence`、`confidence_level`、`refused`、`source_count`、归一化 `structured_answer/section_labels`。`reasoning`、`intent_reasoning` 和所有未知字段在 callback 内立即丢弃，raw frame/metadata 不缓存、不持久化、不打印。

### 5.9 Abort contract

公共 `client.ts` 的 `get/post/put/del/upload` 增加向后兼容的可选 `RequestOptions` 并完整透传 signal；timeout 与 external abort 组合时必须在 finally 清理 timer 和 listener，并以不同 error kind 区分超时、取消和网络错误。Streaming fetch 复用同样语义，但 connect timeout 只覆盖响应头阶段，不限制完整生成耗时。

## 6. State Models

### 6.1 Document store

```ts
interface UploadQueueItem {
  localId: string
  file: File
  state: 'queued' | 'uploading' | 'processing' | 'indexed' | 'duplicate' | 'failed' | 'tracking_error' | 'invalid'
  documentId?: string
  message?: string
}
```

Store state：

- `documents`, `serverTotal`, `page`, `pageSize`, `loading`, `listError`
- `uploadQueue`
- 单一 `pollTimer` + `fetchInFlight`

列表请求捕获目标 page/request ID；相同目标单飞，不同目标先 abort 旧 controller 并使旧 request ID 失效。只有最新响应能原子提交 `documents/serverTotal/page/error/loading`。失败分页不改变当前页；响应 total 使目标页越界时自动请求有效末页。

轮询规则：单一 coordinator 每轮先单飞刷新可见列表，再对 queue 中所有 processing document ID 串行调用 detail endpoint，不依赖当前页。若用户分页请求正在进行，轮询必须加入该 `targetPage` 请求，不能按旧的已提交页取消或覆盖用户意图。成功周期约 3 秒；网络/列表失败且仍需跟踪时使用 3/6/12/24/30 秒有界退避。detail 变 indexed/failed 时推进 queue 并刷新列表；404/持续非法响应进入 `tracking_error`。只有无 `documentId` 的传输失败项可以直接重传；已登记 failed 必须经确认删除后重传，tracking_error 只能重新查询。dispose 先递增 generation，再 clear timer、abort in-flight；任何迟到 finally 都不得重新调度。

`canDeleteDocument(status, capability)` 只有在 delete capability 开启且 status 为 indexed/failed 时返回 true；processing/unknown 永远 false。

### 6.2 Agent store

```ts
type AgentRunState =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'completed'
  | 'interrupted'
  | 'cancelled'
  | 'error'

interface KnowledgeMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  runState?: AgentRunState
  statusText?: string
  stages?: AgentStage[]
  intent?: string
  sources?: SourceDocument[]
  processingTimeMs?: number
  metadata?: PublicKnowledgeMetadata
  historical?: boolean
  feedbackState?: 'idle' | 'submitting' | 'submitted' | 'failed'
}
```

每次只允许一个 active run。run 捕获单调 `runId`、稳定 `assistantMessageId` 和目标 `sessionId`；每个 event、RAF、timeout、catch、finally 写状态前同时验证三者。cancel/new/open/remove/dispose 先使 runId 失效，再 abort controller、取消 RAF/timer。终态采用 first-terminal-wins：`completed/error/cancelled/interrupted` 首次提交后，迟到 done/EOF/finally 全部 no-op。

### 6.3 Stage normalization

后端 status 文本直接作为短状态提示，但视觉时间线由稳定 node/intent 归一化：

| Event | UI stage |
|---|---|
| Thinking status analyzing | `intent` 意图分析（临时阶段） |
| `node=retrieve` or retrieval status | `retrieve` 知识检索 |
| `node=grade` | `grade` 证据评估 |
| `node=rewrite` | `rewrite` 查询优化 |
| `node=generate` / `fast_generate` | `generate` 生成回答 |

重复 node 不新增重复步骤。Fast 模式只显示 retrieve/generate，不创建 intent/grade/rewrite。Thinking intent route 标记为“初步路由”，只有 done metadata 生成最终路径和可信标签。

### 6.4 Token batching and scroll

token 先累计到非响应式字符串；同一动画帧最多把一次合并文本写入消息。组件记录用户是否位于底部阈值内，只有此前位于底部才跟随新内容。`done.full_response` 是最终事实来源，用它替换累积文本。

## 7. UI Design

### 7.1 Knowledge center shell

- 页面标题改为“知识中心”，副标题说明资料、检索与问答闭环。
- 桌面端使用 Element Plus tabs/segmented navigation；窄屏允许横向滚动，不压缩成不可读标签。
- tabs 只控制 `v-show`/等价可见性并保持组件挂载，不复用飞机工作区路由或任务 ID；切 tab 不取消 active run，只有 `DocumentView` 真正卸载才 dispose 全部网络所有者。

### 7.2 Document library

- 顶部：真实 server total、当前页分块、处理中/失败计数。
- 上传：capability 开启时显示拖放区 + 支持格式/50 MiB 提示和逐文件队列；关闭时显示只读部署说明，不渲染可执行控件。
- 列表：文件类型、名称、大小、分块、时间、真实状态；失败卡片附“删除后重新上传”的解释。
- 分页：后端 `skip/limit`；当前页搜索标签明确。
- 删除：默认不可用；processing/unknown 始终禁用。例外能力开启后，确认文案说明当前响应只能证明“服务接受请求”，不承诺所有索引已清理，成功后重新读取列表。

### 7.3 Retrieval workbench

- 查询框、策略 selector、top-k stepper、执行按钮。
- 策略旁给简短适用场景；顶部固定声明“不调用 LLM”。
- 结果卡片保留换行、正文折叠、来源/标题和各类分数。
- 空、错误、loading 分离；错误不清空上一次查询输入。
- “交给 Agent 分析”只复制最近一次成功响应的 `result.query` 并切换 tab，不把结果写入 Agent sources；输入框中尚未执行的草稿不得冒充已验证 query。
- 每次检索捕获 request ID、query、strategy、top-k 快照；新请求先使旧 owner 失效，只有最新请求且响应 query 与请求一致时才可写 result/error/loading。

### 7.4 Knowledge Agent

- Header：Thinking/Fast 模式、新对话、历史会话。
- Message：用户问题；Agent 流式正文或结构化诊断卡；公开阶段进度；done 后的最终 route/置信度/拒答/耗时。未 done 时仅显示 provisional 状态。
- 结构化字段位置映射：`summary/details/steps/notes/sources/gaps` 对应 `section_labels[0..5]`，缺标签使用领域中性的“摘要/详情/步骤/备注/来源/信息缺口”。
- Sources：右侧 drawer（窄屏底部 drawer），内容纯文本、可折叠，分数字段分别标注。
- Sessions：抽屉名为“本设备会话”，只显示 ID 和本地 seenAt；默认操作是“从本设备移除”。
- Feedback：capability 开启时提供赞、踩、标记、纠错；历史回答、缺 trace 或能力关闭时不显示可执行按钮，并解释限制。
- Run control：生成中显示取消；中断后显示“使用同一问题重试”。

## 8. Error and Degradation Matrix

| Component/failure | User-visible behavior | State preservation | Retry |
|---|---|---|---|
| endpoint config missing | build/typecheck fail closed | — | 修复跟踪文件，不运行时猜地址 |
| document list unavailable | 显示“知识库服务不可达” | 保留上次文档，标记为旧数据 | 手动刷新；有 processing 时延后重试 |
| one upload fails | 仅该队列项失败 | 后续队列继续 | 用户重试该 File；若 backend 已登记 failed，先确认删除 |
| upload tracking unavailable | 显示“跟踪异常”，不误导为重新上传 | 保留 document ID 与原文件 | 重新检查 detail/list；持续失败联系运维 |
| duplicate 409 | 标记“已存在”，展示 detail | 不插入伪文档 | 无需自动重试 |
| processing never completes | 持续显示处理中，不伪装成功 | detail 对账 + 有界退避 | 用户可刷新/联系运维；processing 不允许删除 |
| retrieval empty | “未找到匹配证据” | 保留 query/strategy/top-k | 调整查询或交给 Agent |
| low-level main score is `0` | “未确认（服务返回 0）” | 不参与质量判断 | 等待后端 availability 契约 |
| retrieval unavailable | 明确错误卡 | 保留上一次结果并标为旧结果 | 手动重试 |
| SSE HTTP failure before body | assistant error 状态 | 保留用户消息 | 同题重试 |
| malformed/unknown SSE frame | 跳过单帧；未知类型前向兼容 | 已接收 token 保留 | 若最终无 done，标 interrupted |
| stream EOF before done | “回答中断” | 保留部分正文，不赋正常可信标签 | 同题重试 |
| user abort | “已取消” | 保留部分正文 | 同题重试 |
| `route=degraded` | 降级警示，confidence 未知 | 回答可读但不当作正常证据回答 | 服务恢复后重试 |
| confidence unavailable | “未评估” | 不生成数值 | 无 |
| refused | 证据不足/冲突提示 | 保留信息缺口与来源 | 补充问题/资料后重试 |
| local session history unavailable | 仅该本设备会话显示错误 | 当前对话和本地 ID 不受影响 | 重试该会话 |
| mutation capability off | 页面只读/反馈不可用说明 | 读取和问答不受影响 | 部署完成真实授权后显式开启 |
| parser/resource limit | “响应超过安全限制”并终止 | 保留已安全接收的部分正文 | 缩小请求/服务修复后重试 |
| feedback failure | 按钮恢复并提示 | 纠正文案保留 | 重试 |
| mutation returns malformed 2xx | 按响应无效处理，不显示成功 | 保留卡片/反馈/纠正文案 | 服务修复后重试 |

该矩阵遵守核心语义：不可用、未知和 `None` 永远不转成 0 或成功。

## 9. Security Design

### 9.1 Untrusted Markdown and retrieved content

净化顺序固定为：用纯文本 token 保护公式 → `markdown-it html:false` render/highlight → 恢复 KaTeX → DOMPurify sanitize → 修补外链 rel → 写入有界 LRU cache。禁止在 sanitize 后再拼接任何来自模型/文档的 HTML。

最小安全断言：

- `<script>`、`onerror/onload/onclick` 不存在且不执行。
- `javascript:`/危险 data URL 被移除。
- iframe/object/embed/form/input/textarea/select 被移除。
- 代码高亮、复制按钮、表格、链接和 KaTeX 仍可见。
- 来源/检索正文永远用 Vue 文本插值，不走 Markdown。

### 9.2 STRIDE boundary

| STRIDE | Control |
|---|---|
| Spoofing | 浏览器 capability 不是安全边界；生产 mutation 依赖同源网关身份/角色验收，缺省只读 |
| Tampering | mutation 缺省关闭；所有 server DTO 经 runtime normalizer；未知状态显示未知而非成功 |
| Repudiation | 反馈使用后端 message/trace ID；前端不制造 trace |
| Information disclosure | 不调用全局 session list；仅存 ID/seenAt；reasoning 在 SSE 边界丢弃；日志不记录问题/来源/raw frame |
| DoS | 文件大小提示、串行上传、单 active stream/轮询、Abort 清理、SSE/回答/来源资源 budget |
| Elevation | 不提供密钥输入；生产代理按 path+method 强制授权，未验收不得开启 capability |

### 9.3 Upload validation

前端扩展名/大小检查只用于即时反馈，不能替代后端的路径净化、大小限制和重复检测。文件名只作为文本展示。

## 10. Performance Budgets

- token 响应式提交：每动画帧最多一次。
- Markdown cache：最多 64 条，LRU 淘汰。
- 文档 polling：约 3 秒，上一请求完成后才调度下一次；无 processing 时 0 次后台请求。
- 同时 active Agent stream：1。
- 默认历史消息：最多 50 条；本设备 session ID registry 最多 20 条。
- SSE：frame/pending buffer 1 MiB、总输入 16 MiB、事件 50,000、回答 200,000 UTF-16 code units。
- 来源最多 50 条、单片段最多 20,000 code units；正文初始折叠，用户按需展开。
- 本功能不承诺模型端延迟；UI 只展示后端实际 `processing_time_ms`。

## 11. Test Strategy and Red-Green Evidence

### 11.1 Unit tests (`tests/unit`)

| Test group | Required assertions | REQ |
|---|---|---|
| SSE parser | UTF-8 byte/字符分块、CRLF、多 data 行、未知事件、malformed 后继续、EOF tail、全部资源上限 | REQ-KA-022/024/042 |
| format semantics | 三文档状态+unknown；null/NaN 不为 0；主 0 为 ambiguous；阶段去重 | REQ-KA-007/017/027/042 |
| API errors | 409 detail、FastAPI detail、timeout/network 友好文案 | REQ-KA-010/018 |
| Markdown security | script/event/javascript URL 被移除；KaTeX/code 保留 | REQ-KA-033/034 |
| ownership/privacy | stale run no-op、first-terminal-wins、metadata allowlist、只存本地 session ID | REQ-KA-029/030/042/043 |
| polling/capability | off-page detail 对账、退避/单飞/dispose、轮询加入用户目标页；所有 mutation 缺省 false | REQ-KA-011/041/044 |
| strict envelopes | documents/retrieval/history/done/feedback/delete 的畸形 2xx 不得成为空成功 | REQ-KA-012/013/018/030/032/042 |

### 11.2 Playwright (`tests/e2e_ui`)

全部通过 `page.route('/document/**')` 提供确定性应用层响应，不依赖 RAG/Ollama/Milvus；它不被用来证明底层 TCP byte chunk：

1. 文档页真实呈现 processing/indexed/failed，processing 消失后停止轮询。
2. 多文件上传中一个 409、一个成功，后续文件仍执行。
3. 三策略请求路径与 top_k 正确，结果显示 raw/retrieval/rerank/time；空结果与错误可重试；交给 Agent 的是最近一次已验证响应 query，而非未执行草稿。
4. Thinking 流返回完整多事件 SSE，阶段、token、done、动态结构化标签和来源正确；任意 byte/UTF-8/CRLF chunk 已由 unit parser 测试负责。
5. `confidence=null` 显示未评估；`refused=true`/`route=degraded` 显示警示。
6. EOF-before-done 保留部分回答并可重试；取消不显示服务错误。
7. 本设备 session ID registry/历史/本地移除和新会话；断言不调用全局 list，历史消息不伪造来源/反馈。
8. 能力开启时反馈 payload 带 session/message/trace，纠错空文本不能提交；缺省能力下无写请求。
9. 恶意模型 Markdown 与来源内容不执行 `window.__xss`。
10. OpenCode 入口仍可进入，既有关键 DOM/交互不被知识中心改动破坏。
11. 缺省只读、processing 永不可删、删除 200 不出现强一致文案；early rag + done general_chat 以 done 为准。
12. 21 条以上数据分页、慢请求快速切页、失败回滚与末页删除夹紧；旧响应没有写权限。
13. 传输失败可重传、已登记 failed 只能确认删除后重传、tracking_error 只能重新检查。
14. 四类反馈、空纠正、失败后保留纠正、畸形 2xx 与 deferred 双击 single-flight。
15. token 后畸形/空 done 保留部分正文并进入 interrupted；列表、检索、历史畸形 2xx 显示可重试错误。
16. 768 px 下文档分页/队列、检索控件/结果、来源/历史抽屉与纠正对话框均不越界。

### 11.3 Quality commands

```bash
npm ci
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
```

红阶段先落测试并记录失败原因；实现后以相同命令转绿。若 Playwright 浏览器二进制缺失，只安装项目锁定版本所需 Chromium，不把下载产物提交仓库。

## 12. Rollout, Migration, and Rollback

### 12.1 Migration

- `API_PREFIX.DOCUMENT` 保留，因此现有 `document.ts` 调用不需要一次性迁移全部 import。
- 文档状态从错误的 `completed` 改为真实 `indexed/failed` 是契约修复；没有持久化前端数据迁移。
- RAG 会话独立，不迁移 OpenCode session/cookie。
- 生产部署必须新增或确认 `/document -> RAG /api` 反向代理；没有此映射时知识中心明确报服务不可达，PHM 其他功能仍工作。
- 生产 mutation capability 缺省关闭；只有网关身份认证、角色/owner 授权、审计、限流/大小和 CSRF/SameSite 清单通过后才可逐项开启。`VITE_RAG_DELETE_ENABLED` 在 `RAG-KA-BL-002` 完成前不得开启。
- 生产 SSE 代理必须关闭 response buffering/cache，保留 `text/event-stream`，配置足够 read timeout，并用 `curl -N` 或等价烟测证明 session/status 早于 done 到达。

### 12.2 Commit stages

1. `docs(knowledge): specify knowledge agent ux`
2. `test(knowledge): add failing knowledge center contracts`
3. `fix(build): restore tracked endpoint configuration`
4. `feat(knowledge): add document and retrieval workspace`
5. `feat(knowledge): add streaming knowledge agent`
6. `fix(security): sanitize shared markdown rendering`
7. `test(knowledge): complete playwright journeys`

每阶段尽量独立可构建；若真实 typecheck 暴露既有错误，只做行为保持的最小修复并放在单独 commit。

### 12.3 Rollback

- 前端功能可按上述 commit 逆序回滚；RAG 后端和数据无 schema 变化。
- 回滚知识 Agent/检索 tab 后，文档管理仍可通过兼容 `DOCUMENT=/document` 工作。
- 若 `/document` 代理部署失败，可回滚代理配置而不影响 PHM `/api`、`/instance`、`/task`、`/opencode`。
- 文档删除是真实破坏性操作且当前响应不能证明多索引一致性，故缺省关闭；代码回滚不能恢复已删除数据。

## 13. Invariant Impact

| Invariant | Impact |
|---|---|
| OpenCode task/session ownership | 无改动；RAG store 独立 |
| RAG unavailable is not score 0 | 前端显式 unknown/degraded/error |
| RAG hot path degrades without UI crash | 流错误/route degraded 有终态和重试 |
| shared_state ownership | 无后端改动，不读写 shared_state |
| tests only under `tests/` | 新测试全部进入 `tests/unit`、`tests/e2e_ui` |
| no secret in frontend | 不增加 admin key，proxy target 只来自部署环境 |
| untrusted output handling | 所有 `v-html` 统一净化，来源正文纯文本 |
| mutation authorization | capability 缺省 false；生产安全边界在网关/服务端 |
| async ownership | runId/sessionId/messageId 三重校验；first-terminal-wins |
| session privacy | 不枚举全局会话，只存本设备 ID/seenAt |

## 14. Known Limits

- HTTP 低层检索不返回 MCP/`RetrievalWorkflow` diagnostics；检索验证台不会展示 accept/weak/conflict/empty。
- 历史 API 不返回旧 sources/metadata/trace，跨刷新后只能恢复文本历史。
- 后端没有单文档重新索引 API；失败文档在安全删除能力未开启时只能由已授权运维处理，开启后可请求删除再上传。
- 后端没有文档 server-side 搜索条件；首版搜索明确限定当前页。
- Vite proxy 只服务开发环境；生产反向代理需由集成部署配置完成。
- `RAG-KA-BL-001`：RAG 文档/反馈 mutation 增加身份、角色/租户、审计契约。
- `RAG-KA-BL-002`：多索引可验证删除与摄入 cancel/tombstone；完成前生产删除保持关闭。
- `RAG-KA-BL-003`：低层 retrieval 主 score 可空或提供 availability/kind。
- `RAG-KA-BL-004`：session owner/租户范围及 history/delete 授权；完成前不支持跨设备全局历史。
