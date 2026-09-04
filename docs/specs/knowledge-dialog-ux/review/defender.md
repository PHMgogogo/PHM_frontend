# Defender 报告 — knowledge-dialog-ux

- **评审对象**: `docs/specs/knowledge-dialog-ux/review/critic.md`
- **评审日期**: 2026-09-04
- **裁决依据**: `docs/specs/prompts/defender.md` 五步决策树

## 裁决表

| 发现 ID | 严重性 | 决策 | 理由（file:line 证据 / 不可达证明 / 替代方案） | design.md 修订条目 |
|---|---|---|---|---|
| F-01 | Critical | accepted | 当前 watcher 只在调度前检查 sticky，`nextTick` 后直接写 scrollTop，用户可在 pending frame 执行前离底；必须用 epoch、取消 pending frame 和回调前复核闭环 | v2 §4.2、§11 |
| F-02 | High | accepted | autosize、`v-show` 和 Markdown 图片均可在消息字段之外改变 feed/content 尺寸；v1 明确禁用尺寸观察，无法保持真实底部状态 | v2 §3.2、§4.3、§10、§11 |
| F-03 | High | accepted | 当前 Playwright SSE helper 一次性交付完整 body，不能触发“排队后离底”竞态，也不能证明离底后增量 token 不抢位置 | v2 §11 |
| F-04 | High | accepted | 空正文 interrupted 会同时命中终态告警和等待占位；现有中断测试仅覆盖已有部分正文 | v2 §3.1、§8、§11 |
| F-05 | High | accepted | 根布局 `overflow:hidden` 可掩盖子控件裁切，页面 scrollWidth 不能单独证明 toolbar/composer 完整可用 | v2 §6、§11 |
| F-06 | Medium | accepted | 当前 feed 无 log/busy 语义，状态变化无独立 live region，头像也未从可访问树隐藏；修复成本低且属于本轮对话体验 | v2 §7、§11 |
| D-01 | High | accepted | 中文 IME 以 Enter 确认候选词时，当前 `@keydown.enter.exact.prevent` 可误触提交；必须检查 `isComposing`/229 | v2 §3.2、§11 |

## 逐条论证

### F-01 — 已排队的 rAF 会在用户向上滚动后仍强制拉回底部

- 步骤 1 核验：事实为真。当前 watcher 在进入异步边界前只检查一次 `stickToBottom`，随后经过 `nextTick()` 直接写入 `feed.scrollTop`，写入前没有再次核验，见 `src/components/knowledge/KnowledgeAgentPanel.vue:35-44`。滚动事件只能修改布尔状态，不能取消已排队任务，见同文件 `47-51`。
- 步骤 2 触发：token 更新先触发 watcher并排队；用户在 Vue 更新或 rAF 执行前向上滚动超过 72px；旧回调仍写到底部。
- 步骤 3 成本：影响为 Critical，因为它直接复现 REQ-KD-019 要消除的核心失效；修复成本中等。
- 步骤 4 范围：属于本功能滚动状态机、REQ-KD-018—021。
- 步骤 5 替代：仅在调度前检查或只在卸载时取消均不等价，必须让用户意图变化使任务失效并在写入前复核。
- 决策：`accepted`。
- design.md 修订：v2 §4.2 定义 `scrollEpoch`、单一 `pendingFrame` 和 feed 身份快照；用户离底、切换会话、新对话及卸载时失效。

### F-02 — 尺寸变化不会重新锚定

- 步骤 1 核验：事实为真。v1 composer 计划改为 autosize；Agent tab 使用 `v-show`；Markdown 可包含图片，而 v1 明确禁止尺寸观察。
- 步骤 2 触发：输入框增高会压缩 feed；隐藏 tab 中完成回答后重新显示会恢复不同尺寸；图片或结构区会在 Vue patch 后继续增高。
- 步骤 3 成本：影响为 High；引入一个受控原生 observer 成本中等，不需要新依赖。
- 步骤 4 范围：属于 composer、消息区滚动与 REQ-KD-016、018、020。
- 步骤 5 替代：只 watch 输入值或 active 状态不能覆盖异步内容；单一组件级 `ResizeObserver` 覆盖更完整。
- 决策：`accepted`。
- design.md 修订：v2 §4.3 观察 feed viewport 与统一 `.message-list`，回调只做 O(1) 度量并复用单帧调度，卸载 disconnect。

### F-03 — 缺少真实增量更新测试

- 步骤 1 核验：事实为真。当前 `sse()` helper 将全部事件拼为一个字符串，Agent 用例通过单次 `route.fulfill` 返回整个 body。
- 步骤 2 触发：F-01 的顺序依赖多个 event-loop/frame；一次性交付可能在用户交互前完成。
- 步骤 3 成本：影响为 High；永久 Playwright 流控 fixture 成本中等。
- 步骤 4 范围：属于 REQ-KD-019、024、026 和红绿纪律。
- 步骤 5 替代：静态长文本、截图或最终 scrollTop 无法证明增量期间保持阅读位置。
- 决策：`accepted`。
- design.md 修订：v2 §11 增加页面侧受控 `ReadableStream` fetch mock，覆盖排队后离底、离底继续更新和恢复跟随。

### F-04 — 零 token 中断显示矛盾占位

- 步骤 1 核验：事实为真。等待占位没有排除 `interrupted`；无 done 的 EOF 会提交 interrupted。
- 步骤 2 触发：SSE 建连后在首 token 前 EOF 时，终态告警和等待文案同时出现。
- 步骤 3 成本：影响为 High；修复成本低。
- 步骤 4 范围：属于 Agent 信息层级、失败降级和 REQ-KD-012。
- 步骤 5 替代：调整文案不能解决状态矛盾，占位必须正向限定为进行态。
- 决策：`accepted`。
- design.md 修订：v2 §3.1/§8 规定占位只在 connecting/running 显示，增加 EOF/cancel/error 回归。

### F-05 — 页面 scrollWidth 会被 overflow:hidden 掩盖

- 步骤 1 核验：事实为真。根布局和右侧内容区均隐藏溢出，而 v1 只规划页面级 scrollWidth。
- 步骤 2 触发：768px 下工具栏或 composer 超出剩余宽度可被祖先直接裁掉。
- 步骤 3 成本：影响为 High；补充几何断言成本低。
- 步骤 4 范围：直接属于 REQ-KD-017、024。
- 步骤 5 替代：人工截图不能替代自动边界与重叠断言。
- 决策：`accepted`。
- design.md 修订：v2 §11 对关键控件读取 bounding box，断言处于 panel/viewport 内且不重叠，并保留内部 scrollWidth 断言。

### F-06 — 屏幕阅读器状态语义不完整

- 步骤 1 核验：事实为真。当前消息区为普通 div，头像没有 `aria-hidden`，v1 只规定 article label 和返回按钮。
- 步骤 2 触发：屏幕阅读器用户无法稳定获知开始、完成、中断、取消或降级；整个 token 流又不应作为 noisy live region。
- 步骤 3 成本：影响为 Medium；增加语义属性和独立状态区成本低。
- 步骤 4 范围：属于本轮消息呈现和 accessibility。
- 步骤 5 替代：直接给整个流 `aria-live` 会逐 token 反复播报；应使用 log/busy 与独立高层状态公告。
- 决策：`accepted`。
- design.md 修订：v2 §7 为 feed 增加 log/busy，增加只播报阶段/终态的 polite live status，头像从可访问树隐藏。

### D-01 — 中文 IME Enter 误发送

- 步骤 1 核验：事实为真。当前 `@keydown.enter.exact.prevent="submit"` 无 `isComposing` 或 keyCode 229 防护，见 `KnowledgeAgentPanel.vue:163-172`。
- 步骤 2 触发：中文输入法按 Enter 确认候选词时可触发提交；中文界面中属于常见路径。
- 步骤 3 成本：影响为 High，修复成本低。
- 步骤 4 范围：属于 composer 与 REQ-KD-016。
- 步骤 5 替代：无等价于显式组合态保护的样式方案。
- 决策：`accepted`。
- design.md 修订：v2 §3.2 使用统一 keydown handler；组合输入期间不发送，普通 Enter 发送，Shift+Enter 换行。

## 范围外问题清单

无。F-01—F-06 与 D-01 均属于本次知识库 Agent 对话布局、滚动、输入、响应式或可访问性范围。

## 诚实承认的有限边界

- `ResizeObserver` 负责内容实际变高后的重新度量，不负责保证远程图片网络请求成功。
- Playwright 可验证 ARIA 属性和状态文本，但不同屏幕阅读器的具体播报节奏仍需后续人工辅助技术抽查。
- 小于 768px 的全局侧栏仍按 requirements 的 Out of Scope 处理；本功能只保证对话组件自身不新增裁切。
- 受控 `ReadableStream` 验证浏览器端跨 frame 顺序；真实网络抖动仍由既有 SSE parser、终态所有权和 E2E 契约共同覆盖。
- 截图按要求人工复核，不引入脆弱的像素级 snapshot 门禁。
