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

  // ---- 第三方构型（GET /aircraft/config-items 不传 modelCode）----
  // 三方行的 modelCode 装的即上游的 SSFJH（后端映射：SSFJH→modelCode），故架号列表由它去重而来
  const thirdItems = ref<ConfigItem[]>([])
  const currentSsfjh = ref('')
  const ssfjhItems = ref<ConfigItem[]>([])
  const ssfjhLoading = ref(false)

  const itemTypeLabel: Record<ConfigItemType, string> = {
    SYSTEM: '系统',
    SUBSYSTEM: '子系统',
    EQUIPMENT: '设备',
    LRU: 'LRU',
  }

  const itemTypeOptions = computed(() =>
    Object.entries(itemTypeLabel).map(([value, label]) => ({ value: value as ConfigItemType, label })),
  )

  /** 第三方架号（SSFJH）列表：对三方行 modelCode 去重后排序，接口返回顺序不保证 */
  const thirdSsfjhList = computed(() =>
    [...new Set(thirdItems.value.map((i) => i.modelCode).filter(Boolean))].sort(),
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

  /** 拉取全部第三方构型并缓存，供机型下拉里的架号选项使用 */
  async function fetchThirdItems() {
    try {
      thirdItems.value = await aircraftApi.getConfigItems()
    } catch {
      thirdItems.value = []
    }
  }

  /**
   * 查某个架号（SSFJH）下的全部部件：查询时把 modelCode 传成该架号。
   */
  async function fetchSsfjhItems(ssfjh: string) {
    if (!ssfjh) return
    currentSsfjh.value = ssfjh
    ssfjhLoading.value = true
    try {
      ssfjhItems.value = await aircraftApi.getConfigItems(ssfjh)
    } catch {
      ssfjhItems.value = []
    } finally {
      ssfjhLoading.value = false
    }
    // TODO(后端让 modelCode 对三方 SSFJH 生效后删除)：当前带参请求会走本地分支返回空，
    // 此时回落用首屏缓存的全量三方结果按 modelCode 过滤。
    if (!ssfjhItems.value.length) {
      ssfjhItems.value = thirdItems.value.filter((i) => i.modelCode === ssfjh)
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
    thirdItems,
    thirdSsfjhList,
    currentSsfjh,
    ssfjhItems,
    ssfjhLoading,
    fetchThirdItems,
    fetchSsfjhItems,
    fetchAll,
    createItem,
    deleteItem,
    getAvailableParents,
  }
})
