# Knowledge Dialog UX Design

- **Version**: v2（critic/defender gate accepted）
- **Date**: 2026-09-04
- **Requirements**: [requirements.md](requirements.md)
- **Implementation repository**: `PHM_frontend` only

## 1. Design Summary

本设计把知识库 Agent 对话区从“同构卡片列表”调整为有明确角色方向的工作台：用户消息采用右对齐、内容收缩的轻量气泡；Agent 消息保留左侧宽卡片，承载 Markdown、诊断结构、可信状态和操作。工具栏按“回答模式/会话”分组，输入区改为 2—5 行自适应。消息流增加不抢阅读位置的 stick-to-bottom 状态机和显式“回到最新回答”入口。

所有变化位于展示层。Pinia store、SSE normalizer、运行归属、Markdown sanitizer、来源和反馈契约均保持不变。

## 2. Current Evidence and Root Cause

### 2.1 User bubble

`AgentMessage.vue` 当前统一使用 `36px + 1fr` 左起网格；用户态只增加 `margin-left: min(18%, 160px)`，因此头像仍在左，气泡仍占满剩余列。根因是角色差异仅由边距、颜色和圆角表达，没有角色专属布局约束。

### 2.2 Information hierarchy

执行阶段、可信标签和底部操作都使用相近的小标签/横向行，缺少“过程”和“最终状态”的分区标题。用户消息也复用 Agent 的标题—时间结构，产生重复“你/用户”。

### 2.3 Scrolling

当前 watcher 只观察 `id/content.length/runState`，随后立即设置 `scrollTop`。来源、阶段、可信元数据或组件过渡造成的二次布局不一定被纳入；`scroll-behavior: smooth` 还会使截图或快速 token 更新时短暂落后。页面没有在用户主动离开底部后提供返回入口。

## 3. Component Design

### 3.1 `AgentMessage.vue`

保留一个语义化 `<article>`，通过 role class 分配网格位置：

```text
assistant: [avatar] [wide answer card................]
user:      [................compact bubble] [avatar]
```

- `.assistant`：`36px minmax(0, 1fr)`；body 最大 1040px，靠左。
- `.user`：`minmax(0, 1fr) 36px`；avatar 固定第二列；body 第一列 `justify-self: end`、`width: fit-content`。
- 桌面用户 body：`max-width: min(72%, 760px)`。
- 701—900px 用户 body：`max-width: 88%`。
- 不大于 700px：保留右对齐与头像顺序，body 最大宽度使用可用第一列的 94%，不退回左侧同构布局。
- 用户标题只保留语义化 `aria-label`；可见 meta 仅显示 `<time datetime>`，紧邻气泡。
- Agent 的标题、阶段、告警、Markdown、结构化结果、可信状态、来源与反馈条件不变。
- 头像是装饰视觉线索，统一设置 `aria-hidden="true"`，避免与 article label 重复朗读。
- 空正文等待占位只在 `connecting`/`running` 显示；`error`/`interrupted`/`cancelled` 只显示终止态告警、已有正文与可用重试。

Agent 内容层级：

1. heading：身份与时间；
2. execution：低对比背景的执行过程；
3. answer：安全 Markdown；
4. structured：可选展开区；
5. trust：带“回答状态”标签的最终元数据；
6. actions：来源、反馈或重试。

### 3.2 `KnowledgeAgentPanel.vue`

面板网格调整为：

```text
toolbar
message-stage (relative)
  ├─ scrollable feed
  └─ return-to-latest button (absolute, conditional)
composer
```

toolbar 内部划分：

- `agent-identity`：图标、标题、面向用户的能力说明；
- `mode-control`：标签、Thinking/Fast segmented、模式说明；
- `conversation-actions`：本设备会话、新对话。

composer：

- `el-input` 使用 `autosize={ minRows: 2, maxRows: 5 }`；
- 保留 4000 字符上限与 running guard；统一 `handleComposerKeydown(event)` 仅在非组合态普通 Enter 提交，`event.isComposing` 或 `keyCode === 229` 时直接返回，Shift+Enter 保留换行；
- 会话 ID 与模式提示进入统一 context row；
- running 时发送按钮替换为取消按钮，行为不变。
- 接收 `active` prop；Agent tab 从隐藏恢复时重置当前滚动代际并在 DOM 可见后锚定新上下文。

## 4. Scroll State Contract

### 4.1 Pure metrics

新增 `src/utils/chat-scroll.ts`：

- `bottomDistance(metrics)`：返回 `max(0, scrollHeight - scrollTop - clientHeight)`；处理浏览器 overscroll。
- `isNearBottom(metrics, threshold = 72)`：距离小于等于阈值视为粘滞。

模块无 DOM 全局引用，便于单元测试。

### 4.2 Runtime state

- `stickToBottom`: 用户是否仍选择跟随最新内容。
- `bottomDistancePx`: 最近一次 O(1) 度量得到的底部距离。
- `showScrollToLatest`: `!stickToBottom` 且底部距离超过 72px。
- `scrollEpoch`: 用户意图或消息上下文的递增代际。
- `pendingFrame`: 最多一个待执行 rAF；新调度先取消旧 frame。
- `observedFeed`: 调度时捕获的 feed 元素身份。
- watcher 只读取 `messages.length` 与最后一条消息的 `content.length/stages.length/sources.length/runState/metadata.route/confidence`，避免按消息总数扫描。
- watcher 使用 `flush: 'post'`；`nextTick()` 后调度单个 frame。frame 写 DOM 前必须再次验证 `stickToBottom`、epoch 与 feed 身份。
- 用户离底时立即递增 epoch、取消 pending frame，再更新返回按钮；因此先前排队任务不能抢回位置。
- 点击“回到最新回答”将 sticky 设为 true、递增 epoch，并在下一 frame 使用即时滚动锚底。为避免 smooth 中间 scroll event 反转 sticky，本功能不使用程序化 smooth。
- 打开会话、新建对话、tab 恢复和卸载均统一调用滚动上下文重置：取消 frame、递增 epoch；前三者在新 DOM 可见后锚底。

### 4.3 Controlled resize observation

- 允许一个组件级原生 `ResizeObserver`，只观察 feed viewport 和统一 `.message-list` 容器两个固定目标。
- observer 回调不遍历消息子节点，只复用 O(1) 距离计算与单 frame 调度。
- sticky 为 true 时尺寸变化重新锚底；sticky 为 false 时只刷新距离与返回按钮，不写 scrollTop。
- `active` 从 false 变 true 时显式重置并锚底，避免依赖隐藏元素 observer 的浏览器差异。
- 卸载时 `disconnect()`，同时取消 frame；不得使用固定延时。

`prefers-reduced-motion` 下 CSS 取消状态点 pulse 和按钮 transition；程序化滚动本身使用即时行为。

## 5. State and API Compatibility

| Contract | Decision |
|---|---|
| `KnowledgeMessage` | 不变 |
| `store.send/retryMessage/cancelActive` | 不变 |
| SSE event parsing and terminal authority | 不变 |
| Source/feedback capability gates | 不变 |
| Local session registry | 不变 |
| Markdown rendering and DOMPurify | 不变 |
| OpenCode components/store | 不触碰 |

## 6. Responsive Rules

- `> 900px`：toolbar 单行，用户气泡最大 72%/760px。
- `701—900px`：toolbar identity 与 controls 分行，controls 内部保持分组；用户气泡最大 88%。
- `<= 700px`：controls 各自换行，按钮允许均分；消息 avatar 30px，气泡仍保持角色方向。
- 验收基准使用 1440×1000 和 768×1024。小于 768px 的全局侧栏响应式不属于本功能。
- 768px 自动验收不能只检查 document 宽度；panel、toolbar、message stage/feed、composer 还必须满足内部 `scrollWidth <= clientWidth + 1`，关键控件 bounding box 位于 panel 与 viewport 内且互不重叠。

## 7. Accessibility

- `<article>` 增加由角色派生的 `aria-label`。
- 时间使用 `<time :datetime>`，视觉上靠近对应消息。
- “回到最新回答”使用原生 button/Element Plus button，可 Tab 聚焦，具备明确 accessible name。
- 执行过程保留 `aria-label="执行阶段"`。
- feed 使用 `role="log"`、稳定 accessible name 与 `aria-busy`；不把逐 token 消息正文设为 live region。
- 增加视觉隐藏的 `role="status" aria-live="polite" aria-atomic="true"`，只播报高层阶段和 completed/interrupted/cancelled/error/degraded 终态。
- 消息头像设置 `aria-hidden="true"`。
- 角色区分不只依赖颜色；方向、头像位置和轮廓同时提供线索。
- reduced-motion 用户不执行非必要动画。

## 8. Failure and Degradation

- rAF 不可用不作为生产假设；浏览器目标均支持。组件卸载时取消回调。
- 若 feed ref 尚未挂载，滚动函数安全返回，不抛异常。
- error/interrupted/cancelled 继续使用现有安全降级与 retry prompt；空正文终止态不显示进行中占位。
- 来源/反馈 capability 继续 fail closed；本设计不修改开关。
- `None`/未评估置信度仍由现有 formatter 显示为“未评估”，绝不变为 0。

## 9. Security and Privacy Impact

- 不新增网络请求、持久化字段、HTML sink 或第三方依赖。
- 用户与 Agent 正文继续进入共享 DOMPurify renderer。
- 不展示 reasoning、trace payload 或全局 session 列表。
- STRIDE 六类没有新增信任边界；重点回归 DOM 中不出现 raw reasoning/XSS sentinel。

## 10. Performance Budget

- 每次消息更新最多读取一次 `scrollHeight/scrollTop/clientHeight` 并写一次 `scrollTop`。
- 同一 frame 内取消旧任务后只保留一个 rAF，避免 token 事件形成回调队列。
- 一个 `ResizeObserver` 只观察两个固定目标并复用帧级合并；禁止 `MutationObserver` 与子节点扫描。
- watcher 只观察最后一条消息，避免随会话长度增长的 O(n) `.map().join()`。
- CSS 不使用昂贵滤镜；阴影保持现有量级。

## 11. Test Matrix and Red-Green Evidence Plan

| Layer | Red contract | Green verification |
|---|---|---|
| Unit | 72px 边界与 overscroll 尚无纯函数 | `tests/unit/chat-scroll.test.ts`，覆盖 71/72/73px 与负值钳制 |
| Playwright geometry | 当前用户头像位于 body 左侧且短消息 body 过宽 | 新增知识对话布局用例，断言 avatar/body x 关系及宽度比 |
| Playwright increment | 一次性 SSE 无法触发 pending-frame 竞态 | 页面侧受控 `ReadableStream` 分批释放 token/stage/done；离底后 scrollTop/可见锚点不变，点击返回后恢复跟随 |
| Playwright sizing | autosize、tab 恢复与异步内容高度未覆盖 | 5 行输入、切换 tab 后返回、延迟图片/结构增高均重新度量且遵守 sticky |
| Playwright terminal | 零 token interrupted 同时显示等待占位 | EOF/cancel/error 不显示“正在等待”，保留告警和可用重试 |
| Playwright IME | 当前中文候选 Enter 可误发送 | `isComposing=true`/229 不请求，普通 Enter 请求，Shift+Enter 换行 |
| Playwright responsive | 页面 scrollWidth 可掩盖内部裁切 | 768px 内部 scrollWidth、关键控件 bounding box 与不重叠断言 |
| Playwright accessibility | 当前无 log/busy/status 语义 | role/name、busy 切换、polite status 与装饰头像断言 |
| Visual | 当前截图作为 before | 1440/768 after 截图人工复核 |
| Regression | 现有 7 条知识中心用例 | 全量 Playwright 连续两次通过 |
| Static/build | — | `npm run typecheck`, `npm run build` |

纯前端展示改动不触及后端进程内 E2E；该层标记 N/A，既有前端 mock API Playwright 覆盖端到端契约。

## 12. Rollback

改动限定为独立 spec、一个纯工具、`DocumentView.vue`、两个知识对话 Vue 组件与 `tests/`。若视觉或滚动回归，可整体 revert 本功能提交；无需数据迁移、环境变量回退或后端协同。

## 13. Invariant Impact

- 热路径：仅浏览器消息滚动与呈现，不改变 RAG 生成/检索热路径。
- `shared_state`：不涉及。
- 安全基线：保留 Markdown sanitizer 和 capability fail-closed。
- 持久化：不新增。
- 测试密封性：Playwright 继续 route mock，不依赖 Ollama/Milvus。

## 14. Adversarial Review Resolution

- F-01 Critical：接受；以 epoch + cancel + callback recheck 和增量流竞态测试闭合。
- F-02 High：接受；以受控 ResizeObserver、active prop 和尺寸变化测试闭合。
- F-03 High：接受；新增受控 `ReadableStream` 永久测试，不再以一次性 SSE 代替增量行为。
- F-04 High：接受；正向限定等待占位的运行态，并覆盖零 token 三种终止路径。
- F-05 High：接受；以组件内部宽度、bounding box 与重叠断言替代单一页面宽度判断。
- F-06 Medium：接受；增加 log/busy/polite status/装饰头像语义。
- D-01 High：接受；增加中文 IME composition guard 与回归测试。
