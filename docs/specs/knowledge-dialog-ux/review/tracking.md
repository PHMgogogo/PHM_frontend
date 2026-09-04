# Review Tracking — knowledge-dialog-ux

- **Status**: Implementation verified; merge gate passed
- **Design baseline**: `design.md` v2
- **Review result**: 1 Critical / 5 High / 1 Medium，全部由 defender `accepted`

## Tracking Matrix

| Finding ID | Severity | REQ | Defender decision | Design revision | Fix commit | Verification test | Permanent regression | Status |
|---|---|---|---|---|---|---|---|---|
| F-01 | Critical | REQ-KD-018—021/028 | accepted | v2 §4.2/§11 epoch、cancel、回调前复核 | `c13b714`, `499ac54` | incremental no-yank + scheduler unit | `knowledge-dialog.spec.ts:182`；`chat-scroll.test.ts` | closed |
| F-02 | High | REQ-KD-016/018/020/028/030 | accepted | v2 §3.2/§4.2—4.3/§10/§11 尺寸观察与方向判定 | `c13b714`, `499ac54` | autosize/image/tab + 10 次重复 | `knowledge-dialog.spec.ts:229,297`；`chat-scroll.test.ts` | closed |
| F-03 | High | REQ-KD-019/024/026 | accepted | v2 §11 受控 `ReadableStream` | `c13b714` | 分段 token、离底、返回后继续跟随 | `knowledge-dialog.spec.ts:182` | closed |
| F-04 | High | REQ-KD-012 | accepted | v2 §3.1/§8/§11 终止态占位 | `c13b714` | cancel/EOF/error 零 token | `knowledge-dialog.spec.ts:322,337` | closed |
| F-05 | High | REQ-KD-017/024 | accepted | v2 §6/§11 内部宽度与 bounding box | `c13b714` | 768px 边界、不重叠与内部 overflow | `knowledge-dialog.spec.ts:406` | closed |
| F-06 | Medium | REQ-KD-029 | accepted | v2 §7/§11 log/busy/status/avatar | `c13b714` | role/name/busy/live/avatar 语义 | `knowledge-dialog.spec.ts:139` | closed |
| D-01 | High | REQ-KD-016 | accepted | v2 §3.2/§11 IME composition guard | `c13b714` | composing/229/Shift+Enter/Enter | `knowledge-dialog.spec.ts:359` | closed |

## Merge Gate

- Critical 必须填写 design revision、fix commit、验证测试和永久回归并标记 `closed`。
- High 必须为 `closed` 或 `defended-with-alternative`，替代方案必须已实现并测试。

## Final Gate Decision

- F-01 Critical、F-02—F-05/D-01 High 与 F-06 Medium 均已关联实现提交和永久回归并关闭。
- 延迟图片首次全量运行暴露 sticky 竞态后，增加方向判定与纯函数回归；专项并行重复 10 次通过。
- 修复提交 `499ac54` 上完整 Playwright 从零连续两轮 15/15 通过；红绿日志和截图位置见 `tasks.md` §5。
