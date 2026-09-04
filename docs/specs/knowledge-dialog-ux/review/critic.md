# Critic 报告 — knowledge-dialog-ux

- **评审对象**: `docs/specs/knowledge-dialog-ux/design.md` v1、当前组件与测试
- **评审模式**: 轻量 critic（前端展示/滚动逻辑，附安全与可访问性复核）
- **评审日期**: 2026-09-04

## 摘要

- Critical: 1 条
- High: 4 条
- Medium: 1 条
- Low: 0 条
- 结论: **必须修订为 v2 后才能编码**。F-01 仍可复现本功能要消除的“用户阅读时被强制拉到底部”问题。

## Praise

- `praise (non-blocking)`：角色专属网格直接对应当前 `36px + 1fr` 同构布局的根因，用户气泡右对齐、内容收缩、头像换到右侧的方案完整且改动边界合理。
- `praise (non-blocking)`：明确保持 `KnowledgeMessage`、SSE terminal authority、来源、反馈、会话和 DOMPurify 契约不变，且继续保证“未评估不等于 0”，没有扩大后端 RAG 热路径或安全边界。
- `praise (non-blocking)`：纯滚动度量函数、两种 viewport 截图、完整 Playwright 连续两轮与可整体 revert 的计划具备较好的验证和回滚基础。

## Findings

### F-01 — 已排队的 rAF 会在用户向上滚动后仍强制拉回底部

- **Conventional Comment**: `issue (blocking, must-fix)`
- **id**: F-01
- **severity**: **Critical**。符合严重性表 §2(a)：方案下目标 BUG“用户主动向上阅读时被抢走位置”仍有确定可触发路径。
- **location**: `docs/specs/knowledge-dialog-ux/design.md:94-101`；当前调度位置 `src/components/knowledge/KnowledgeAgentPanel.vue:35-51`；涉及 REQ-KD-019、REQ-KD-021 与 §7.2 回归测试纪律。
- **symptom**: token 更新时 `stickToBottom` 为 true，watcher 排入 rAF；在该帧执行前用户滚动到距底部超过 72px，scroll handler 虽将状态改为 false，但已排队回调仍无条件写入 `scrollTop = scrollHeight`，用户会被拉回底部。
- **impact**: 高频流式输出期间，用户无法稳定查看前文，核心滚动体验目标未闭合。
- **root_cause**: 设计只在“调度前”检查粘滞状态，没有在回调执行前重新验证用户意图，也没有在用户离底时使待执行任务失效。
- **recommendation**: 修订 `design.md:94-101`，规定滚动调度持有递增 `scrollEpoch`；用户主动离底、打开其他会话或新建会话时必须递增 epoch 并取消 pending frame。修改 `KnowledgeAgentPanel.vue:35-51` 的回调，使其写 DOM 前再次验证 `stickToBottom`、epoch 和当前 feed 身份。
- **verification**: 增加可控 rAF/增量 SSE 用例：先触发 token 更新排队，再在 frame 执行前滚到顶部并触发 scroll，执行 frame 后断言 `scrollTop` 未改变且“回到最新回答”可见；随后点击按钮并验证底部距离 ≤2px。
- **status**: open

### F-02 — 自动增高输入框、隐藏标签页和异步内容改变尺寸时不会重新锚定

- **Conventional Comment**: `issue (blocking, must-fix)`
- **id**: F-02
- **severity**: **High**。符合 §2(a)：常见路径基本正确，但容器尺寸变化、隐藏/恢复和异步布局变化未闭合。
- **location**: `docs/specs/knowledge-dialog-ux/design.md:74-79,92-103,148-153`；`src/views/DocumentView.vue:76-87`；`src/utils/useMarkdown.ts:95-100,124-142`；涉及 REQ-KD-016、REQ-KD-018、REQ-KD-020。
- **symptom**: 用户位于底部时把输入框从 2 行扩展到 5 行，feed 的 `clientHeight` 变小，但消息 watcher 不触发，最新回答会移出可视区。Agent 标签页由 `v-show` 隐藏期间完成回答后再恢复，也没有可见性事件触发对齐。Markdown 图片加载或结构区尺寸变化同样可在 Vue 更新完成后再次改变 `scrollHeight`。
- **impact**: UI 显示仍处于自动跟随状态，实际却看不到最新回答，且返回按钮可能不出现；截图和真实交互结果不一致。
- **root_cause**: 滚动正确性依赖消息响应式字段，但设计明确禁止任何尺寸观察，没有覆盖非消息字段造成的布局变化。
- **recommendation**: 将 `design.md:148-153` 的绝对禁用改为允许一个受控、组件级 `ResizeObserver`：观察 feed viewport 与统一 `.message-list` 容器，回调只做 O(1) 度量并复用单帧调度。若不使用 observer，则至少 watch 输入框尺寸并由 `DocumentView.vue:83-87` 传入 active 状态，在标签页恢复时重新对齐。
- **verification**: Playwright 分别验证：长回答处于底部时输入 5 行文本后底部距离仍 ≤2px；流式回答期间切到其他标签再返回仍显示最新内容；延迟加载大图后仍保持底部或正确显示返回按钮。
- **status**: open

### F-03 — 测试计划没有验证“离底后继续收到 token 不得拉回”

- **Conventional Comment**: `issue (blocking, must-fix)`
- **id**: F-03
- **severity**: **High**。符合 §2 的“缺必要回归测试”：REQ-KD-019 和 Acceptance Criteria 4 没有对应可触发的增量更新测试。
- **location**: `docs/specs/knowledge-dialog-ux/design.md:155-165`；`docs/specs/knowledge-dialog-ux/tasks.md:16-19`；现有静态 SSE helper/test 位于 `tests/e2e_ui/knowledge-center.spec.ts:33-35,155-212`；涉及 §7.2。
- **symptom**: 计划中的行为测试只是“已完成的长回答 → 滚到顶部 → 点击按钮”。现有 `route.fulfill` 一次性返回完整 SSE，无法证明用户停留顶部期间后续 token、阶段和 done 更新不会改变位置。
- **impact**: 即使 F-01 的竞态仍存在，计划内测试也可能全部通过，从而错误宣称滚动契约完备。
- **root_cause**: 验收路径缺少真正跨多个 event-loop/frame 的流式响应。
- **recommendation**: 在 `tests/e2e_ui/knowledge-center.spec.ts` 增加可控 `ReadableStream` fetch mock，分三次释放 token/stage/done；记录用户离底后的 `scrollTop` 或首个可见消息锚点，在每次释放后断言位置未被拉回；点击返回按钮后释放下一片段并断言恢复跟随。
- **verification**: 该用例必须在未实现修复时稳定失败，修复后连续运行两轮通过，且两轮使用同一提交。
- **status**: open

### F-04 — 零 token 中断仍会显示“正在等待首个回答片段”

- **Conventional Comment**: `issue (blocking, must-fix)`
- **id**: F-04
- **severity**: **High**。符合 §2(a)：EOF/中断边界路径未闭合，页面同时呈现互相矛盾的终态和进行态。
- **location**: `src/components/knowledge/AgentMessage.vue:83-107`；`docs/specs/knowledge-dialog-ux/design.md:44-45,133-139`；现有中断测试 `tests/e2e_ui/knowledge-center.spec.ts:285-340`；涉及 REQ-KD-012。
- **symptom**: SSE 在首个 token 前 EOF 时消息进入 `interrupted`，告警显示“回答在完成前中断”，但占位条件只排除 `error` 和 `cancelled`，仍同时显示“正在等待首个回答片段…”。
- **impact**: 用户无法判断 Agent 已停止还是仍在运行，削弱新设计希望建立的状态层级和诚实呈现。
- **root_cause**: v1 要求“现有条件不变”，而当前占位条件本身没有限定为进行态；现有测试只覆盖“已有部分正文”的中断。
- **recommendation**: 修改 `AgentMessage.vue:105-107`，仅在 `connecting` 或 `running` 且正文为空时显示等待占位；`interrupted/cancelled/error` 只展示终态告警、已有部分正文和可用重试入口。把该规则补入 `design.md:44-45`。
- **verification**: 新增首片段前 EOF、首片段前取消、首片段前 error 三个断言，确保终态不包含“正在等待”，中断态重试按钮仍可用。
- **status**: open

### F-05 — 仅检查页面 scrollWidth 会被祖先的 `overflow:hidden` 掩盖

- **Conventional Comment**: `issue (blocking, must-fix)`
- **id**: F-05
- **severity**: **High**。符合 §2 的“缺必要回归测试”：响应式目标要求控件不被裁切，但当前验证策略可能假通过。
- **location**: `docs/specs/knowledge-dialog-ux/design.md:117-122,155-165`；`src/views/HomeView.vue:165-195`；`src/components/knowledge/KnowledgeAgentPanel.vue:227-251`；涉及 REQ-KD-017、REQ-KD-024。
- **symptom**: 根布局及内容区使用 `overflow:hidden`。在 768px 下，即使 toolbar、segmented control 或按钮越出面板并被裁掉，页面级 `scrollWidth` 仍可能等于 `clientWidth`。
- **impact**: Playwright 可以通过“无横向滚动”，但用户仍看不到或无法点击部分模式、会话、发送/取消控件。
- **root_cause**: 测试把“没有滚动条”误当成“所有子控件均完整落在可视区域”。
- **recommendation**: 在 `tests/e2e_ui/knowledge-center.spec.ts` 对 agent panel、toolbar 分组、segmented control、会话按钮、textarea 和发送/取消按钮读取 bounding box，逐一断言左右边界位于面板和 viewport 内，并断言可交互元素之间不重叠；保留页面 `scrollWidth` 作为补充断言。
- **verification**: 先临时制造 toolbar 固定宽度越界，证明几何断言失败而旧 scrollWidth 断言仍通过；恢复响应式实现后在 768×1024 下通过并保存截图复核。
- **status**: open

### F-06 — 对话流缺少完整的屏幕阅读器状态语义

- **Conventional Comment**: `suggestion (blocking)`
- **id**: F-06
- **severity**: **Medium**。符合 §2(a)：视觉结构定义充分，但异步状态的可访问性契约欠定义。
- **location**: `docs/specs/knowledge-dialog-ux/design.md:124-131`；`src/components/knowledge/KnowledgeAgentPanel.vue:130-156`；`src/components/knowledge/AgentMessage.vue:65-69`。
- **symptom**: 设计只给每条 `<article>` 增加 aria-label；新增消息、执行阶段、终态和取消结果不会被可靠播报。头像中的“你”也可能和“用户消息”标签重复朗读。
- **impact**: 键盘用户能操作“回到最新回答”，但屏幕阅读器用户无法及时知道回答是否开始、完成、中断或降级。
- **root_cause**: 可访问性设计聚焦静态标签，没有定义 chat log、busy 状态和终态公告策略。
- **recommendation**: 在 `KnowledgeAgentPanel.vue:130-156` 为消息区定义 `role="log"`、稳定 accessible name 和 `aria-busy`；使用独立、节流的 `role="status" aria-live="polite"` 只播报阶段/终态，避免逐 token 噪声。把 `AgentMessage.vue:66-69` 的装饰头像设为 `aria-hidden="true"`。
- **verification**: Playwright 断言消息区 role/name、运行期间 `aria-busy=true`、完成后为 false、状态 live region 文本正确且头像从可访问树隐藏；Tab 可聚焦并激活“回到最新回答”。
- **status**: open

## Invariant / Security Check

- 后端 RAG 热路径、`shared_state`、judge、检索与持久化均不涉及。
- v1 保持共享 DOMPurify renderer、feedback capability fail-closed、raw reasoning 不下发，未发现新增 XSS sink 或权限边界。
- `confidence: null/undefined` 继续显示“未评估”，没有将不可用误报为 0。

