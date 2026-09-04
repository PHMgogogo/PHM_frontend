# Knowledge Dialog UX Tasks

- **Feature**: `knowledge-dialog-ux`
- **Branch**: `feat/knowledge-agent-ux`
- **Design**: [design.md](design.md) v2

## 0. Spec and Review Gate

- [x] **T-001** 复述并确认优化范围、方向和不变契约。[REQ-KD-001—REQ-KD-003]
- [x] **T-002** 创建 requirements/design/tasks 三段式文档。[REQ-KD-001—REQ-KD-030]
- [x] **T-003** 并行运行独立 critic 与 defender，归档完整 8 字段 findings 与逐条裁决。[REQ-KD-023—REQ-KD-030]
- [x] **T-004** 修订 design v2，接受 1 Critical/5 High/1 Medium 并建立 tracking matrix。[REQ-KD-023—REQ-KD-030]

## 1. Red Tests

- [x] **T-101** 新增底部距离、72px 阈值和 overscroll 的失败单元测试。[REQ-KD-018—REQ-KD-023]
- [x] **T-102** 新增 Playwright 用户/Agent 方向和用户气泡宽度失败断言。[REQ-KD-004—REQ-KD-009, REQ-KD-024]
- [x] **T-103** 新增长回答离开底部、返回按钮与滚动恢复失败用例。[REQ-KD-018—REQ-KD-021, REQ-KD-024]
- [x] **T-104** 新增受控增量 SSE、零 token 终止态、IME、ARIA 和 768px 内部几何失败用例。[REQ-KD-012, REQ-KD-016—REQ-KD-030]
- [x] **T-105** 保存 red 日志并确认失败原因来自缺失契约而非测试环境。[REQ-KD-023—REQ-KD-030]

## 2. Implementation

- [x] **T-201** 新增无 DOM 全局依赖的滚动距离/阈值工具。[REQ-KD-018—REQ-KD-023, REQ-KD-027]
- [x] **T-202** 重构用户消息为右侧收缩气泡、右侧头像和邻近语义时间。[REQ-KD-004, REQ-KD-006—REQ-KD-009]
- [x] **T-203** 优化 Agent 执行过程、正文、回答状态和操作区层级。[REQ-KD-005, REQ-KD-010—REQ-KD-013]
- [x] **T-204** 重组 toolbar 并将技术说明替换为用户语言。[REQ-KD-014—REQ-KD-015, REQ-KD-017]
- [x] **T-205** 将 composer 改为 2—5 行自适应并保持键盘/运行态契约。[REQ-KD-015—REQ-KD-017]
- [x] **T-206** 实现 epoch-safe 的帧级自动滚动、受控 ResizeObserver 和“回到最新回答”。[REQ-KD-018—REQ-KD-021, REQ-KD-027—REQ-KD-030]
- [x] **T-207** 增加 768px 响应式与 reduced-motion 样式。[REQ-KD-007, REQ-KD-017, REQ-KD-022]
- [x] **T-208** 修复中文 IME 误发送、零 token 终止态和屏幕阅读器状态语义。[REQ-KD-012, REQ-KD-016, REQ-KD-029]

## 3. Verification

- [x] **T-301** 运行定向 unit 与 Playwright，记录 green 证据。[REQ-KD-023—REQ-KD-024]
- [x] **T-302** 运行 typecheck、全量 unit 和 build。[REQ-KD-026]
- [x] **T-303** 生成 1440×1000 与 768×1024 after 截图并人工检查。[REQ-KD-025]
- [x] **T-304** 在同一提交连续运行两次完整 Playwright，任一失败则修复后重新计数。[REQ-KD-026]
- [x] **T-305** 确认 OpenCode 文件无 diff、无一次性脚本、工作树和 whitespace gate 干净。[REQ-KD-001, REQ-KD-026]

## 4. Review Closure

- [x] **T-401** 将所有 finding 关联到 fix commit、验证测试和永久回归测试。[REQ-KD-023—REQ-KD-030]
- [x] **T-402** 更新 tracking 状态与最终测试记录。[REQ-KD-023—REQ-KD-030]

## 5. Verification Evidence

### Red phase

- `npm run test:unit -- --run tests/unit/chat-scroll.test.ts` → exit 1：实现前缺少 `chat-scroll` 模块；日志 `/tmp/phm-dialog-red-unit.log`。
- 知识对话 Playwright 基线 → 5/5 failed：用户头像仍在左、无“回到最新回答”、终止态文案矛盾、IME Enter 误发送、缺少可测试语义；日志 `/tmp/phm-dialog-red-playwright.log`。
- 扩展尺寸用例首次运行 → 7/8 passed：1400px 延迟图片溢出回答卡片，证明内部宽度断言有效；日志 `/tmp/phm-dialog-playwright-expanded.log`。
- 首次连续全量尝试第 1 轮 → 14/15 passed：延迟图片触发的浏览器滚动事件误关闭 sticky；该轮作废并从零计数，日志 `/tmp/phm-dialog-e2e-consecutive-1.log`。
- `npm run test:unit -- --run tests/unit/chat-scroll.test.ts` → 4/5 passed：新增布局变化判定契约时 `didMoveAwayFromBottom` 尚不存在；日志 `/tmp/phm-dialog-resize-race-red-unit.log`。

### Green phase

- 定向滚动单元测试 → 5/5 passed；日志 `/tmp/phm-dialog-resize-race-green-unit.log`。
- 延迟富媒体尺寸用例 `--repeat-each=10` → 10/10 passed；日志 `/tmp/phm-dialog-resize-race-repeat.log`。
- 知识对话专项 Playwright → 8/8 passed；日志 `/tmp/phm-dialog-race-dialog-full.log`。
- `npm run typecheck` → exit 0；日志 `/tmp/phm-dialog-race-typecheck.log`。
- `npm run test:unit -- --run` → 10 files / 38 tests passed；日志 `/tmp/phm-dialog-race-unit-full.log`。
- `npm run build` → exit 0，8966 modules transformed；仅保留既有大 chunk warning，日志 `/tmp/phm-dialog-race-build.log`。
- `npm run test:e2e` 在 `499ac54` 连续两次 → 每轮 15/15 passed；日志 `/tmp/phm-dialog-e2e-final-1.log`、`/tmp/phm-dialog-e2e-final-2.log`。
- Playwright 截图用例 → 2/2 passed，临时脚本已删除；1440×1000、返回按钮态和 768×1024 截图位于 `/tmp/phm-dialog-ux-screenshots/`，日志 `/tmp/phm-dialog-visual.log`。
