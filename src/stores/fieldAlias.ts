import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 字段中文别名：原始英文字段名 → 中文别名，纯前端内存态。
// 不做任何持久化（刷新页面丢失是预期行为）；不内置种子词典，纯手动配置。
// 键全局按字段名索引（本域 CSV 列名是物理量助记符，跨表同名大概率同义）；
// 读取统一收口在 aliasOf()，未来若需按表隔离只需改造内部键结构，调用方不变。
export const useFieldAliasStore = defineStore('fieldAlias', () => {
  const aliases = ref<Record<string, string>>({})

  /** 展示名：有（非空白）别名返回别名，否则回退英文原名 —— 全项目唯一读取入口 */
  function aliasOf(field: string): string {
    return aliases.value[field]?.trim() || field
  }

  function hasAlias(field: string): boolean {
    return !!aliases.value[field]?.trim()
  }

  /** 设置别名；传入空串/空白 = 清除该字段别名（恢复英文原名） */
  function setAlias(field: string, alias: string) {
    const v = (alias ?? '').trim()
    if (!v) delete aliases.value[field]
    else aliases.value[field] = v
  }

  function clearAlias(field: string) {
    delete aliases.value[field]
  }

  /** 批量提交（批量对话框确定时用）：逐 key 走 setAlias，空串自然 = 清除 */
  function setAliases(patch: Record<string, string>) {
    Object.entries(patch ?? {}).forEach(([field, alias]) => setAlias(field, alias))
  }

  function clearAll() {
    aliases.value = {}
  }

  /** 给 DisplayOptionBuilder 的普通对象快照（option 查询时一次性构建，不保持响应式） */
  const aliasMap = computed<Record<string, string>>(() => ({ ...aliases.value }))

  /** 已配置别名总数（批量入口按钮显示"已配置 N"用） */
  const count = computed(() => Object.keys(aliases.value).length)

  return {
    aliases,
    aliasOf,
    hasAlias,
    setAlias,
    clearAlias,
    setAliases,
    clearAll,
    aliasMap,
    count,
  }
})
