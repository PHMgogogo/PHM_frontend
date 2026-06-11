import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as aircraftApi from '@/api/aircraft'
import type { ConfigItem, ConfigItemType } from '@/types/entities'

export const useConfigItemStore = defineStore('configItem', () => {
  const items = ref<ConfigItem[]>([])
  const treeData = ref<ConfigItem[]>([])
  const selectList = ref<ConfigItem[]>([])
  const loading = ref(false)
  const currentModelCode = ref('')

  const itemTypeLabel: Record<ConfigItemType, string> = {
    SYSTEM: '系统',
    SUBSYSTEM: '子系统',
    EQUIPMENT: '设备',
    LRU: 'LRU',
  }

  const itemTypeOptions = computed(() =>
    Object.entries(itemTypeLabel).map(([value, label]) => ({ value: value as ConfigItemType, label })),
  )

  async function fetchAll(modelCode: string) {
    if (!modelCode) return
    currentModelCode.value = modelCode
    loading.value = true
    try {
      const [flat, tree, select] = await Promise.all([
        aircraftApi.getConfigItems(modelCode),
        aircraftApi.getConfigItemTree(modelCode),
        aircraftApi.getConfigItemSelectList(modelCode),
      ])
      items.value = flat
      treeData.value = tree
      selectList.value = select
    } catch {
      items.value = []
      treeData.value = []
      selectList.value = []
    } finally {
      loading.value = false
    }
  }

  async function createItem(data: Omit<ConfigItem, 'itemId' | 'children'>) {
    await aircraftApi.createConfigItem({ ...data, modelCode: currentModelCode.value })
    await fetchAll(currentModelCode.value)
  }

  async function deleteItem(itemId: number) {
    await aircraftApi.deleteConfigItem(itemId)
    await fetchAll(currentModelCode.value)
  }

  // 根据 parentItemId 和 itemType 过滤可选父节点
  function getAvailableParents(targetType: ConfigItemType): ConfigItem[] {
    if (targetType === 'SYSTEM') return []
    if (targetType === 'SUBSYSTEM') return selectList.value.filter((i) => i.itemType === 'SYSTEM')
    return selectList.value.filter((i) => i.itemType === 'SYSTEM' || i.itemType === 'SUBSYSTEM')
  }

  return {
    items,
    treeData,
    selectList,
    loading,
    currentModelCode,
    itemTypeLabel,
    itemTypeOptions,
    fetchAll,
    createItem,
    deleteItem,
    getAvailableParents,
  }
})
