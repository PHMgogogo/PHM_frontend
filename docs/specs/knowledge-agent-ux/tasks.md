# Knowledge Agent UX Tasks

**Feature**: `knowledge-agent-ux`  
**Branch**: `feat/knowledge-agent-ux`  
**Design**: [design.md](design.md) v2

## 0. Branch and Spec Gate

- [x] **T-001** 从 `origin/dev@91b7b03` 创建 `feat/knowledge-agent-ux`，确认工作树没有继承其他分支改动。[REQ-KA-001]
- [x] **T-002** 完成 `requirements.md`，以 EARS 语法定义表面需求、本质需求、范围与验收标准。[REQ-KA-001—REQ-KA-045]
- [x] **T-003** 完成 `design.md` v2，覆盖架构、API/状态契约、降级矩阵、安全、性能、测试和回滚。[REQ-KA-001—REQ-KA-045]
- [x] **T-004** 完成可追溯 `tasks.md`，所有实现任务回指 REQ。[REQ-KA-039—REQ-KA-045]
- [x] **T-005** 并行启动独立 critic/defender 设计评审，归档 `review/critic.md`、`review/defender.md`、`review/tracking.md`。[REQ-KA-033—REQ-KA-045]
- [x] **T-006** 修订 design v2，编码前接受并给出全部 3 Critical/6 High/2 Medium 的可执行前端缓解；后端 backlog 不替代 fail-closed。[REQ-KA-033—REQ-KA-045]

## 1. Red Test Infrastructure

- [x] **T-101** 增加锁定版本的 Vitest/jsdom 测试配置和 `test:unit` 脚本，测试只放 `tests/unit/`。[REQ-KA-039]
- [x] **T-102** 增加 Playwright 配置、确定性 route mock helpers 和 `test:e2e` 脚本，测试只放 `tests/e2e_ui/`。[REQ-KA-040]
- [x] **T-103** 先编写并运行失败的 SSE parser 测试：UTF-8 byte chunk、CRLF、多 data 行、malformed、unknown、EOF tail、frame/buffer/stream/event 上限。[REQ-KA-022, REQ-KA-024, REQ-KA-039, REQ-KA-042]
- [x] **T-104** 先编写并运行失败的状态/分数/API 错误测试：三状态+unknown、409 detail、`None`/NaN 不为 0、低层主 0 为 ambiguous。[REQ-KA-007, REQ-KA-010, REQ-KA-017, REQ-KA-027, REQ-KA-039, REQ-KA-042]
- [x] **T-105** 先编写并运行失败的 Markdown 安全测试：脚本/事件/危险 URL 被移除，代码与 KaTeX 保留。[REQ-KA-033, REQ-KA-034, REQ-KA-039]
- [ ] **T-106** 先编写 Playwright 失败用例，覆盖文档、检索、流式 Agent、会话、反馈与 XSS 用户流程。[REQ-KA-040]
- [ ] **T-108** 先编写失败的 capability、runtime normalizer、本地 session registry、run ownership/迟到事件和 off-page poll 测试。[REQ-KA-041—REQ-KA-044]
- [x] **T-107** 把红阶段命令、退出码和失败原因记录到本文件“Verification Evidence”。[REQ-KA-039, REQ-KA-040]

## 2. Build Baseline

- [ ] **T-201** 收窄 `.gitignore` 的 `config` 规则，恢复并跟踪 `src/config/endpoints.ts`。[REQ-KA-001]
- [ ] **T-202** 在端点配置中增加 `RAG=/document` 并保留 `DOCUMENT` 兼容别名，禁止 RAG 使用 PHM `/api`。[REQ-KA-002, REQ-KA-004]
- [ ] **T-203** 为 Vite 增加 `/document -> ${VITE_RAG_PROXY_TARGET:-http://127.0.0.1:8000}/api` 开发代理。[REQ-KA-002, REQ-KA-003]
- [ ] **T-204** 验证 typecheck/build:check 持续覆盖 root references，修复真实检查暴露的最小既有错误且不改变业务行为；不得用 exclude 绕过。[REQ-KA-038]
- [ ] **T-205** 更新 README 的真实服务边界、严格布尔 capability、生产 `/document` reverse proxy、安全授权清单和 SSE 无缓冲烟测要求。[REQ-KA-002, REQ-KA-003, REQ-KA-041, REQ-KA-045]

## 3. Shared Contracts and Utilities

- [ ] **T-301** 修正文档 DTO 为 `processing/indexed/failed`，补齐真实上传/分页响应与 409 错误语义。[REQ-KA-007, REQ-KA-010, REQ-KA-014]
- [ ] **T-302** 补齐检索结果 `retrieval_score/rerank_score/rerank_applied` 和策略路由类型。[REQ-KA-015—REQ-KA-018]
- [ ] **T-303** 新增知识 Agent、来源、metadata、结构化回答、会话、历史、反馈的显式 TypeScript DTO。[REQ-KA-020—REQ-KA-032]
- [ ] **T-304** 改进公共 ApiError 文案提取，安全消费 FastAPI `detail`，保留 status/data 供 409 分支判断。[REQ-KA-010, REQ-KA-018]
- [ ] **T-305** 实现无 Vue 依赖的增量 SSE parser 和 unknown/malformed 前向兼容策略。[REQ-KA-022, REQ-KA-024]
- [ ] **T-306** 实现文档状态、Agent 阶段、有限分数和可信状态的纯格式化函数，保证 unavailable/None 不为 0。[REQ-KA-007, REQ-KA-017, REQ-KA-027, REQ-KA-028]
- [ ] **T-307** 实现 documents/retrieval/history/SSE/public metadata 运行时 normalizer，在边界丢弃 reasoning/未知字段并执行资源上限。[REQ-KA-029, REQ-KA-042]
- [ ] **T-308** 实现严格布尔 mutation capability；upload/feedback/delete/session-delete 全部缺省 false，删除独立门禁。[REQ-KA-008, REQ-KA-013, REQ-KA-032, REQ-KA-041]
- [ ] **T-309** 扩展通用 client 可选 RequestOptions，透传 signal、清理 listener，并区分 timeout/cancel/network。[REQ-KA-006, REQ-KA-043]

## 4. Document Library

- [ ] **T-401** 重构 knowledge store，保存 server total、分页、错误、逐文件上传队列和真实文档状态。[REQ-KA-007—REQ-KA-010, REQ-KA-014]
- [ ] **T-402** 实现串行多文件上传；前端校验 7 种扩展和 50 MiB；单文件失败后继续。[REQ-KA-008, REQ-KA-009]
- [ ] **T-403** 实现 HTTP 409 `duplicate` 队列终态和后端 detail 提示。[REQ-KA-010]
- [ ] **T-404** 用单一 coordinator 实现列表单飞、off-page detail 对账、3/6/12/24/30 秒退避、tracking_error 和 generation-safe dispose。[REQ-KA-006, REQ-KA-011, REQ-KA-044]
- [ ] **T-405** 新建 DocumentLibrary UI：真实状态、队列、server total/当前页分块、当前页搜索和分页。[REQ-KA-005, REQ-KA-007—REQ-KA-014]
- [ ] **T-406** 为 failed/processing 提供诚实恢复说明；processing/unknown 永不可删，删除缺省关闭且开启后不承诺多索引强一致。[REQ-KA-012, REQ-KA-013, REQ-KA-041]

## 5. Retrieval Workbench

- [ ] **T-501** 新建 RetrievalWorkbench 查询表单，校验 query 与 top_k 1—50，提供三策略说明。[REQ-KA-015, REQ-KA-016]
- [ ] **T-502** 展示证据片段、来源/标题、三类分数、重排标记、总数和耗时；缺值显示“未提供”，低层主 0 显示 ambiguous-zero。[REQ-KA-017]
- [ ] **T-503** 分离 loading/empty/error/ready 状态，错误保留 query/strategy/top-k 和旧结果提示。[REQ-KA-018]
- [ ] **T-504** 实现“交给 Agent 分析”：只传递查询并切 tab，不注入低层结果为 Agent sources。[REQ-KA-019]

## 6. Knowledge Agent

- [ ] **T-601** 新建独立 `useKnowledgeAgentStore`，不修改 OpenCode store 的协议和会话所有权。[REQ-KA-004, REQ-KA-020]
- [ ] **T-602** 实现 Thinking/Fast、POST SSE、服务端 session ID 接管、单 active run 与 runId/sessionId/messageId 所有权。[REQ-KA-021—REQ-KA-023, REQ-KA-043]
- [ ] **T-603** 实现 mode-aware status/node 阶段归一、去重；Fast 不伪造 intent，Thinking route 为 provisional。[REQ-KA-023, REQ-KA-027]
- [ ] **T-604** 实现 token RAF 合并、done 原子最终替换、first-terminal-wins、跟随底部滚动与 generation-safe 清理。[REQ-KA-006, REQ-KA-024, REQ-KA-037, REQ-KA-043]
- [ ] **T-605** 实现 cancel/error/EOF-before-done 终态：保留部分回答、标记中断并提供同题重试。[REQ-KA-024, REQ-KA-028]
- [ ] **T-606** 新建 KnowledgeAgentPanel/AgentMessage，展示动态 6 槽结构化内容、route/force_rag/耗时/可信状态。[REQ-KA-025, REQ-KA-027—REQ-KA-029]
- [ ] **T-607** 新建 SourceDrawer，以纯文本展示来源、标题、片段和可用分数/重排信息。[REQ-KA-026, REQ-KA-034]
- [ ] **T-608** 新建“本设备会话”抽屉：20 项 ID/seenAt LRU、只读历史、本地移除，绝不调用全局 list；远端删除缺省关闭。[REQ-KA-030, REQ-KA-031, REQ-KA-041]
- [ ] **T-609** 在 feedback capability 开启时实现点赞、点踩、标记和纠错；只对带 message/trace ID 的新回答启用，成功后防重。[REQ-KA-031, REQ-KA-032, REQ-KA-041]
- [ ] **T-610** 在 DocumentView 中用保持挂载的三个 panels 组装 tabs，切 tab 保留 active run，页面卸载统一 dispose。[REQ-KA-005, REQ-KA-006, REQ-KA-036, REQ-KA-043]

## 7. Output Security

- [ ] **T-701** 增加 DOMPurify，把 Markdown → KaTeX → sanitize 顺序固化在共享 renderer 的缓存前。[REQ-KA-033]
- [ ] **T-702** 禁止活动标签、事件属性和危险 URL，修补外链 `rel="noopener noreferrer"`，保留代码/表格/KaTeX。[REQ-KA-033, REQ-KA-034]
- [ ] **T-703** 审计所有知识中心 `v-html`、日志和存储路径，确认来源正文纯文本、reasoning/secret 不展示不持久化。[REQ-KA-026, REQ-KA-029, REQ-KA-035]

## 8. Green Verification and Delivery

- [ ] **T-801** 运行 `npm ci` 并确认 lockfile 可重现。[REQ-KA-038]
- [ ] **T-802** 运行 `npm run typecheck`，真实 app project 通过。[REQ-KA-038]
- [ ] **T-803** 运行 `npm run test:unit`，所有单元/契约/安全回归通过。[REQ-KA-039]
- [ ] **T-804** 运行 `npm run build`，生产 bundle 成功并审查新增 chunk 体积。[REQ-KA-037, REQ-KA-038]
- [ ] **T-805** 运行 `npm run test:e2e`，确定性 Playwright 用户流程通过。[REQ-KA-040]
- [ ] **T-806** 对照 tracking 矩阵填写 Critical/High 的修复 commit、验证测试和永久回归测试后关闭 findings。[REQ-KA-039, REQ-KA-040]
- [ ] **T-807** 更新 README/规格任务状态与 Verification Evidence，确认没有修改 RAG 后端或 OpenCode 协议。[REQ-KA-003, REQ-KA-004]

## 9. Requirements Traceability

| Requirement range | Primary tasks |
|---|---|
| REQ-KA-001—004 | T-001, T-201—205, T-601 |
| REQ-KA-005—006 | T-404, T-405, T-604, T-610 |
| REQ-KA-007—014 | T-104, T-301, T-401—406 |
| REQ-KA-015—019 | T-302, T-501—504 |
| REQ-KA-020—024 | T-103, T-305, T-601—605 |
| REQ-KA-025—029 | T-306, T-606—607, T-703 |
| REQ-KA-030—032 | T-303, T-608—609 |
| REQ-KA-033—035 | T-105, T-701—703 |
| REQ-KA-036—037 | T-604, T-610, T-804 |
| REQ-KA-038—040 | T-101—108, T-204, T-801—806 |
| REQ-KA-041—045 | T-103—108, T-205, T-307—309, T-404/406, T-602—610, T-805—806 |

## 10. Verification Evidence

### Red phase

- `npm run test:unit` → exit 1（2026-09-02）。7 个新契约 suite 因实现模块尚不存在而失败；共享 Markdown 两条安全断言在现有 `html:true`/无 sanitize 实现上失败。完整输出：`/tmp/phm-knowledge-red-unit.log`。
- `npm run test:e2e` 首次 → exit 1（缺锁定 Chromium）；随后用项目版本安装 Chromium 并以相同命令复跑 → exit 1（2026-09-02）。浏览器与 Vite server 已真实启动，页面因基线缺 `src/config/endpoints.ts` 无法加载，知识中心用例在 beforeEach 超时，形成实现前功能型红证据。完整输出：`/tmp/phm-knowledge-red-e2e-functional.log`。

### Green phase

Pending implementation.
