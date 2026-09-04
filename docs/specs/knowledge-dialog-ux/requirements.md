# Knowledge Dialog UX Requirements

- **Feature**: `knowledge-dialog-ux`
- **Status**: Confirmed; critic/defender gate accepted
- **Date**: 2026-09-04
- **Target repository**: `PHM_frontend`
- **Target branch**: `feat/knowledge-agent-ux`
- **Baseline**: `fb69d20`

## 1. Context

知识库 Agent 已具备可靠的 SSE、可信状态、来源、反馈与本地会话能力，但当前消息层仍使用同一套左起网格。用户消息只通过左外边距模拟右侧位置，头像仍位于气泡左边，短问题也会占据大面积横向空间。Agent 回答中的执行阶段、正文、可信信息与操作区视觉权重接近；工具栏和固定三行输入框在窄屏下占用过多纵向空间。

本功能只优化知识库 Agent 对话区域的信息架构、响应式布局与滚动体验，不改变后端、SSE、知识检索、可信度或 OpenCode 对话契约。

## 2. Surface and Essential Requirements

### 2.1 Surface requirements

- 用户消息在右侧显示，头像位于气泡右侧。
- 短消息不再拉伸成整行卡片，长消息保持可读宽度并自动换行。
- Agent 回答继续在左侧显示，执行过程、答案、可信状态和操作形成清晰层级。
- 工具栏与输入区更紧凑，在 1440px 桌面和 768px 窄屏下均无横向溢出。

### 2.2 Essential requirements

- 对话角色方向必须无需依赖颜色即可辨认。
- 流式输出只能在用户仍停留于底部时自动跟随；用户主动向上阅读时不得抢走位置。
- 用户离开底部后必须有明确、可键盘操作的返回最新回答入口。
- 所有视觉优化必须保留现有完成态、错误态、中断态、来源、反馈和 Markdown 安全语义。

## 3. EARS Requirements

### Scope and compatibility

- **REQ-KD-001 (Ubiquitous)**: 系统 MUST 将改动限定在知识库 Agent 对话区域及其专用滚动工具；MUST NOT 改动 OpenCode 聊天页面或后端接口。
- **REQ-KD-002 (Ubiquitous)**: 系统 MUST 保持 `KnowledgeMessage`、SSE、来源、反馈、会话和可信元数据契约不变。
- **REQ-KD-003 (Ubiquitous)**: 系统 MUST 继续通过现有安全 Markdown renderer 展示消息；MUST NOT 新增原始 HTML 注入路径。

### Message direction and geometry

- **REQ-KD-004 (State-driven)**: WHEN `message.role === 'user'`, 系统 MUST 将消息内容靠消息流右侧对齐，并将用户头像放在气泡右侧。
- **REQ-KD-005 (State-driven)**: WHEN `message.role === 'assistant'`, 系统 MUST 将头像置于气泡左侧，并保持富回答卡片的左侧阅读方向。
- **REQ-KD-006 (Ubiquitous)**: 用户气泡 MUST 按内容收缩；在宽度不小于 901px 时最大宽度 MUST NOT 超过消息行的 72% 或 760px 中较小者。
- **REQ-KD-007 (State-driven)**: WHEN viewport 位于 701—900px，用户气泡最大宽度 MUST NOT 超过消息可用宽度的 88%，且正文、时间与头像不得溢出。
- **REQ-KD-008 (Ubiquitous)**: 用户消息 MUST 去除重复的可见“用户”标题，时间信息 MUST 与气泡保持邻近且使用语义化 `<time>`。
- **REQ-KD-009 (Ubiquitous)**: 用户与 Agent 角色 MUST 同时通过方向、头像位置和气泡轮廓区分，不得仅依赖蓝色差异。

### Assistant information hierarchy

- **REQ-KD-010 (State-driven)**: WHEN Agent 提供执行阶段，系统 MUST 将其呈现为低权重的“执行过程”区域，与最终可信标签视觉分离。
- **REQ-KD-011 (State-driven)**: WHEN Agent 回答完成，系统 MUST 按“正文 → 可选结构化结果 → 回答状态 → 来源/反馈操作”的顺序呈现。
- **REQ-KD-012 (State-driven)**: WHEN 回答处于 error、interrupted、cancelled 或 degraded，现有告警、部分正文和重试入口 MUST 保持可见；空正文终止态 MUST NOT 同时显示等待首片段文案。
- **REQ-KD-013 (State-driven)**: WHEN 来源或反馈不可用，系统 MUST 保持当前诚实说明，不得展示不可执行控件。

### Toolbar and composer

- **REQ-KD-014 (Ubiquitous)**: 工具栏 MUST 将回答模式控制与会话操作分组，并使用用户语言说明模式差异，MUST NOT 暴露 `done` 等内部事件术语作为主要说明。
- **REQ-KD-015 (State-driven)**: WHILE Agent 正在运行，模式选择 MUST 保持禁用，取消操作 MUST 保持可见。
- **REQ-KD-016 (Ubiquitous)**: 输入框 MUST 在 2—5 行之间自动伸缩，并继续支持 Enter 发送、Shift+Enter 换行、4000 字符上限和运行中防重复提交；中文 IME 组合输入确认期间的 Enter MUST NOT 发送。
- **REQ-KD-017 (Responsive)**: WHEN viewport 为 768px，工具栏、模式选择、会话操作、输入区和发送按钮 MUST 不产生页面级或组件级横向溢出、裁切或重叠。

### Scroll behavior

- **REQ-KD-018 (State-driven)**: WHILE 用户距离消息流底部不超过 72px，新增 token、阶段、完成态、可信元数据或可观察尺寸变化 MUST 自动保持最新内容可见。
- **REQ-KD-019 (Event-driven)**: WHEN 用户主动滚动至距离底部超过 72px，后续消息更新和此前已排队滚动任务 MUST NOT 强制改变其阅读位置。
- **REQ-KD-020 (State-driven)**: WHILE 用户离开底部，系统 MUST 显示“回到最新回答”按钮；WHEN 用户激活该按钮，系统 MUST 滚动到底部并恢复自动跟随。
- **REQ-KD-021 (Ubiquitous)**: 自动滚动 MUST 等待 Vue DOM 更新和下一渲染帧，MUST 避免依赖固定延时。
- **REQ-KD-022 (Optional)**: WHERE 用户启用 `prefers-reduced-motion: reduce`，系统 MUST 禁用非必要脉冲与平滑滚动动画。

### Verification and quality

- **REQ-KD-023 (Ubiquitous)**: 系统 MUST 为底部距离与粘滞阈值增加边界单元测试，包括 overscroll 负值钳制和 72px 边界。
- **REQ-KD-024 (Ubiquitous)**: Playwright MUST 断言桌面端用户头像位于气泡右侧、用户气泡宽度上限、Agent 头像位于左侧、返回最新回答可用以及 768px 无横向溢出。
- **REQ-KD-025 (Ubiquitous)**: Playwright MUST 生成 1440×1000 与 768×1024 的对话截图，并进行人工视觉复核。
- **REQ-KD-026 (Ubiquitous)**: 实现后 MUST 通过 typecheck、unit、build 和完整 Playwright；完整 Playwright MUST 在同一提交连续通过两次。
- **REQ-KD-027 (Ubiquitous)**: 对话更新 MUST 保持 O(1) DOM 滚动计算，不得引入新运行时依赖或全量 DOM 查询循环。
- **REQ-KD-028 (Event-driven)**: WHEN 用户打开另一会话、新建对话或组件卸载，系统 MUST 使旧滚动任务失效；WHEN 新消息上下文可见，系统 MUST 从该上下文底部开始。
- **REQ-KD-029 (Ubiquitous)**: 消息流 MUST 暴露 chat log、busy 和高层状态播报语义；状态播报 MUST NOT 逐 token 打扰屏幕阅读器。
- **REQ-KD-030 (Ubiquitous)**: 尺寸观察 MUST 限定为一个组件级 `ResizeObserver` 和两个固定目标，并在卸载时释放；MUST NOT 扫描消息子节点。

## 4. Acceptance Criteria

1. 1440px 截图中，用户问题呈紧凑右侧气泡，头像在右；Agent 富回答在左。
2. 768px 截图中，对话工具栏、消息与输入区无水平裁切，用户与 Agent 方向仍可辨认。
3. 长回答滚动到顶部后出现“回到最新回答”，点击后底部距离不超过 2px。
4. 用户在上方阅读时，消息更新不强制拉回底部。
5. 零 token EOF/cancel/error 仅显示真实终止态，中文 IME Enter 不误发送。
6. 消息区具备 log/busy/status 语义，头像不重复进入可访问树。
7. 现有知识中心 7 条 Playwright 用例全部保持通过，新增几何、增量流与滚动用例通过。
8. 工作树中不保留一次性截图脚本或未忽略测试产物。

## 5. Out of Scope

- OpenCode 对话页面及其消息组件。
- RAG 后端、SSE event schema、API path、Pinia 消息数据模型和本地持久化格式。
- 全局侧边导航在小于 768px 手机屏幕下的重构。
- 来源抽屉、会话抽屉和纠正弹窗的信息架构重做。
- 品牌色、图标库或全站 design token 重构。
