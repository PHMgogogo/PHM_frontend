# Review Tracking — Knowledge Agent UX

- **Status**: Implementation verified; merge gate passed
- **Design baseline**: `design.md` v2
- **Review result**: 3 Critical / 6 High / 2 Medium，全部由 defender `accepted`

## Tracking Matrix

| Finding ID | Severity | REQ | Defender decision | Design revision | Fix commit | Verification test | Permanent regression | Status |
|---|---|---|---|---|---|---|---|---|
| F-KA-001 | Critical | REQ-KA-008/032/035/041 | accepted | v2 §3.3 mutation fail-closed + production gateway gate；`RAG-KA-BL-001` | `3adbf87`, `c8535ff` | `knowledge-capabilities.test.ts` + readonly/mutation Playwright | strict false + no control/no request | closed |
| F-KA-002 | Critical | REQ-KA-013/041 | accepted | delete 独立缺省关闭；无强一致文案；`RAG-KA-BL-002` | `bb93fe2`, `c8535ff` | `knowledge-format.test.ts` + readonly Playwright | 200 文案只表述 accepted/refreshed | closed |
| F-KA-003 | Critical | REQ-KA-017/042 | accepted | retrieval 主 0 = ambiguous-zero；`RAG-KA-BL-003` | `bb93fe2`, `c8535ff` | formatter/normalizer unit + three-strategy Playwright | unavailable/主 0 双契约 | closed |
| F-KA-004 | High | REQ-KA-030/041 | accepted | 本设备 ID registry；不调用全局 list；`RAG-KA-BL-004` | `bb93fe2`, `c8535ff` | `local-sessions.test.ts` + history Playwright | 仅 ID/seenAt；断言无 `/sessions` | closed |
| F-KA-005 | High | REQ-KA-013/044 | accepted | processing/unknown 永不可删；detail 对账 | `bb93fe2`, `c8535ff` | canDelete unit + readonly/polling tests | processing no DELETE + off-page detail | closed |
| F-KA-006 | High | REQ-KA-006/043 | accepted | runId/sessionId/messageId + signal + first-terminal-wins | `bb93fe2` | `run-ownership.test.ts` + EOF retry Playwright | stale identity/late terminal no-op | closed |
| F-KA-007 | High | REQ-KA-029/042 | accepted | `PublicKnowledgeMetadata` allowlist at SSE boundary | `bb93fe2` | normalizer secret sentinel + XSS Playwright | reasoning absent from DOM/storage/state | closed |
| F-KA-008 | High | REQ-KA-042 | accepted | runtime normalizers + explicit parser/answer/source budgets | `bb93fe2` | normalizer/SSE limit unit suites | bounded frame/input/event/answer/source | closed |
| F-KA-009 | High | REQ-KA-011/044 | accepted | off-page detail reconcile + bounded backoff + generation-safe dispose | `bb93fe2` | `knowledge-polling.test.ts` | 3/6/12/24/30 + 5 次后 tracking_error | closed |
| F-KA-010 | Medium | REQ-KA-023/027 | accepted | Fast no intent stage；done final authority | `bb93fe2`, `c8535ff` | Fast degraded + final-route Playwright | no fake stage；general route hides sources | closed |
| F-KA-011 | Medium | REQ-KA-003/040/045 | accepted | byte chunk unit responsibility；production no-buffer contract/smoke | `3adbf87`, `bb93fe2` | byte/CRLF/EOF unit + cold-cache Playwright | README proxy/smoke contract | closed |

## Merge Gate

- Critical findings must have a design revision, implementation commit, verification test, permanent regression, and `closed` status.
- High findings must be `closed` or `defended-with-alternative` with the alternative implemented and tested.
- `None`/unavailable confidence or scores must never be represented as zero.

## Final Gate Decision

- Critic 与 defender 均已归档，defender 未驳回或降级任何 finding。
- 3 个 Critical 与 6 个 High 均已填写实现 commit、验证测试和永久回归，并关闭；2 个 Medium 同步关闭。
- 红绿证据、完整命令与结果见 `tasks.md` §10；生产 mutation 仍必须通过 README/设计规定的网关授权清单，前端 capability 不替代安全边界。
