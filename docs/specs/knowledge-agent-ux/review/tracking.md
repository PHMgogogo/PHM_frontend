# Review Tracking — Knowledge Agent UX

**Status**: Design gate passed; implementation verification pending  
**Design baseline**: `design.md` v2  
**Review result**: 3 Critical / 6 High / 2 Medium，全部由 defender `accepted`

## Tracking Matrix

| Finding ID | Severity | REQ | Defender decision | Design revision | Fix commit | Verification test | Permanent regression | Status |
|---|---|---|---|---|---|---|---|---|
| F-KA-001 | Critical | REQ-KA-008/032/035/041 | accepted | v2 §3.3 mutation fail-closed + production gateway gate；`RAG-KA-BL-001` | pending | capability unit + readonly E2E | production default readonly | accepted-design |
| F-KA-002 | Critical | REQ-KA-013/041 | accepted | delete 独立缺省关闭；无强一致文案；`RAG-KA-BL-002` | pending | delete capability/wording tests | 200 不宣称索引清理 | accepted-design |
| F-KA-003 | Critical | REQ-KA-017/042 | accepted | retrieval 主 0 = ambiguous-zero；`RAG-KA-BL-003` | pending | score formatter unit/E2E | unavailable never 0 | accepted-design |
| F-KA-004 | High | REQ-KA-030/041 | accepted | 本设备 ID registry；不调用全局 list；`RAG-KA-BL-004` | pending | storage/API mock tests | no global session enumeration | accepted-design |
| F-KA-005 | High | REQ-KA-013/044 | accepted | processing/unknown 永不可删；detail 对账 | pending | canDelete unit + E2E | processing no DELETE | accepted-design |
| F-KA-006 | High | REQ-KA-006/043 | accepted | runId/sessionId/messageId + signal + first-terminal-wins | pending | stale event/fake stream tests | no cross-run writes | accepted-design |
| F-KA-007 | High | REQ-KA-029/042 | accepted | `PublicKnowledgeMetadata` allowlist at SSE boundary | pending | secret sentinel unit | reasoning absent from state/storage/log | accepted-design |
| F-KA-008 | High | REQ-KA-042 | accepted | runtime normalizers + explicit parser/answer/source budgets | pending | malformed/limit unit | bounded untrusted input | accepted-design |
| F-KA-009 | High | REQ-KA-011/044 | accepted | off-page detail reconcile + bounded backoff + generation-safe dispose | pending | fake timer poll tests | queue convergence | accepted-design |
| F-KA-010 | Medium | REQ-KA-023/027 | accepted | Fast no intent stage；done final authority | pending | mode/route unit + E2E | honest final route | accepted-design |
| F-KA-011 | Medium | REQ-KA-003/040/045 | accepted | byte chunk unit responsibility；production no-buffer contract/smoke | pending | parser unit + proxy docs | no false chunk claim | accepted-design |

## Merge Gate

- Critical findings must have a design revision, implementation commit, verification test, permanent regression, and `closed` status.
- High findings must be `closed` or `defended-with-alternative` with the alternative implemented and tested.
- `None`/unavailable confidence or scores must never be represented as zero.

## Design Gate Decision

- Critic 与 defender 均已归档，defender 未驳回或降级任何 finding。
- v2 已为每个 Critical/High 给出范围内的 fail-closed 或等价控制，因此允许进入红测试阶段。
- findings 仍保持 `accepted-design`，不得提前写成 `closed`；实现 commit、验证和永久回归四列完成后再逐项关闭。
