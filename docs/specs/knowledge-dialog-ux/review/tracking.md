# Review Tracking — knowledge-dialog-ux

- **Status**: Design gate passed; implementation verification pending
- **Design baseline**: `design.md` v2
- **Review result**: 1 Critical / 5 High / 1 Medium，全部由 defender `accepted`

## Tracking Matrix

| Finding ID | Severity | REQ | Defender decision | Design revision | Fix commit | Verification test | Permanent regression | Status |
|---|---|---|---|---|---|---|---|---|
| F-01 | Critical | REQ-KD-018—021/028 | accepted | v2 §4.2/§11 epoch、cancel、回调前复核 | pending | pending | `tests/e2e_ui/knowledge-dialog.spec.ts` incremental stream race | accepted-by-defender |
| F-02 | High | REQ-KD-016/018/020/028/030 | accepted | v2 §3.2/§4.3/§10/§11 受控尺寸观察 | pending | pending | `tests/e2e_ui/knowledge-dialog.spec.ts` resize/tab restore | accepted-by-defender |
| F-03 | High | REQ-KD-019/024/026 | accepted | v2 §11 受控 `ReadableStream` | pending | pending | `tests/e2e_ui/knowledge-dialog.spec.ts` incremental no-yank | accepted-by-defender |
| F-04 | High | REQ-KD-012 | accepted | v2 §3.1/§8/§11 终止态占位 | pending | pending | `tests/e2e_ui/knowledge-dialog.spec.ts` zero-token terminals | accepted-by-defender |
| F-05 | High | REQ-KD-017/024 | accepted | v2 §6/§11 内部宽度与 bounding box | pending | pending | `tests/e2e_ui/knowledge-dialog.spec.ts` 768 geometry | accepted-by-defender |
| F-06 | Medium | REQ-KD-029 | accepted | v2 §7/§11 log/busy/status/avatar | pending | pending | `tests/e2e_ui/knowledge-dialog.spec.ts` accessibility semantics | accepted-by-defender |
| D-01 | High | REQ-KD-016 | accepted | v2 §3.2/§11 IME composition guard | pending | pending | `tests/e2e_ui/knowledge-dialog.spec.ts` IME Enter | accepted-by-defender |

## Gate

- 编码前：design v2 已纳入全部 accepted finding，可进入红测试阶段。
- 合并前：F-01 必须填齐 fix commit、验证测试、永久回归并标记 `closed`。
- 合并前：F-02—F-05、D-01 必须填齐四列并标记 `closed`。
- F-06 随本轮实现验证，不转 backlog。

