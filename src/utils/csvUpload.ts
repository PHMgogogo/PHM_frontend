// ============================================================
// CSV 上传：默认表名推导（纯逻辑，便于单测）
// ============================================================
// 一个架次可关联多张 CSV 数据表（见 utils/timeseries.ts 的说明），
// 所以「表名 = 架次号」不能是硬绑定：同架次再传第二张表时要自动避让重名。
//
// 后端契约（已确认）：表名**按架次唯一**，不同架次/不同机号可以用同名表。
// 因此这里只在本架次已有的表名里查重，不做跨架次、跨机号的全局去重。

import { tableToDeviceName } from './timeseries'

/**
 * 在 `existing` 中挑一个不与 `base` 冲突的表名：`base` 被占用时依次尝试 `base_2`、`base_3`…
 * 比较折叠大小写（MySQL 在多数配置下表名大小写不敏感，`CA1201` 与 `ca1201` 视为同名）。
 */
export function nextTableName(base: string, existing: string[]): string {
  const name = base.trim()
  if (!name) return ''
  const used = new Set(existing.map((n) => tableToDeviceName(n).trim().toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  for (let i = 2; i <= 999; i++) {
    const candidate = `${name}_${i}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  // 极端兜底：同架次同名表超过 998 张时才走到这里
  return `${name}_${existing.length + 1}`
}

/**
 * 依据选中的架次推导默认表名：
 * - 取架次号（三方架次同样有 sortieNumber），架次号为空时退回 `sortie_<sortieId>`；
 * - 该架次下已存在同名表时自动追加序号，避免后端建表覆盖。
 */
export function defaultCsvTableName(
  sortie: { sortieId: number; sortieNumber?: string } | undefined | null,
  existingTableNames: string[] = [],
): string {
  if (!sortie) return ''
  const base = (sortie.sortieNumber || '').trim() || `sortie_${sortie.sortieId}`
  return nextTableName(base, existingTableNames)
}
