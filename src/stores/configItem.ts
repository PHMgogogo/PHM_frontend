import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as aircraftApi from '@/api/aircraft'
import { baseModelCode } from '@/utils/aircraft-source'
import type { ConfigItem, ConfigItemType } from '@/types/entities'

export const useConfigItemStore = defineStore('configItem', () => {
  const items = ref<ConfigItem[]>([])
  const loading = ref(false)
  const currentModelCode = ref('')

  /** 三方合成 id 的起始值：远离本地自增主键，避免与真实 itemId 混淆 */
  const THIRD_ITEM_ID_BASE = 900000

  const itemTypeLabel: Record<ConfigItemType, string> = {
    SYSTEM: '系统',
    SUBSYSTEM: '子系统',
    EQUIPMENT: '设备',
    LRU: 'LRU',
  }

  const itemTypeOptions = computed(() =>
    Object.entries(itemTypeLabel).map(([value, label]) => ({ value: value as ConfigItemType, label })),
  )

  /**
   * 构型树：由 GET /aircraft/config-items 的扁平行按 parentItemId 组装。
   *
   * 只用这一个接口渲染——/tree 与 /select-list 返回的是同一批构型项目的另一形态，
   * 前端拿扁平行自己拼树即可，无需多打两个请求。
   *
   * 同时补齐缺失的 itemId：三方行的 itemId / parentItemId 均为 null，而 el-tree 的
   * node-key 与力导向图的节点 id 都要求页面内唯一，故补一个远离本地自增主键、
   * 也不撞 ConfigForceGraph 虚拟根（-1）的合成 id。本地行自带 itemId，不会走到合成分支。
   */
  const displayTree = computed<ConfigItem[]>(() => {
    let nextId = THIRD_ITEM_ID_BASE
    const rows = items.value.map((row) => ({
      ...row,
      itemId: row.itemId ?? nextId++,
      children: undefined as ConfigItem[] | undefined,
    }))
    const byId = new Map(rows.map((row) => [row.itemId, row]))
    const roots: ConfigItem[] = []
    for (const row of rows) {
      const parent = row.parentItemId == null ? undefined : byId.get(row.parentItemId)
      if (parent) (parent.children ??= []).push(row)
      else roots.push(row)
    }
    return roots
  })

  /**
   * 查某机型的全部构型项目。
   * 机型编码取自 GET /aircraft/models，三方为 `K4-WS19:1` 这类合成码；
   * 构型接口只认冒号前的基础编码，故传参前统一截断，本地机型无冒号不受影响。
   */
  async function fetchAll(modelCode: string) {
    const code = baseModelCode(modelCode)
    if (!code) return
    currentModelCode.value = code
    loading.value = true
    try {
      items.value = await aircraftApi.getConfigItems(code)
    } catch {
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function createItem(
    data: Partial<Omit<ConfigItem, 'itemId' | 'children' | 'modelCode'>> & Pick<ConfigItem, 'itemType' | 'gjbChapter'>,
  ) {
    await aircraftApi.createConfigItem({ ...data, modelCode: currentModelCode.value })
    await fetchAll(currentModelCode.value)
  }

  async function deleteItem(itemId: number) {
    await aircraftApi.deleteConfigItem(itemId)
    await fetchAll(currentModelCode.value)
  }

  return {
    items,
    displayTree,
    loading,
    currentModelCode,
    itemTypeLabel,
    itemTypeOptions,
    fetchAll,
    createItem,
    deleteItem,
  }
})
