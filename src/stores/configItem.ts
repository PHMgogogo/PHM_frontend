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

  // ---- 第三方构型（GET /aircraft/config-items?modelCode=，机型必填）----
  // 三方行的 modelCode 装的即上游的 SSFJH（后端映射：SSFJH→modelCode），故架号列表由它去重而来。
  // 机型改成必填后不再有「一次拉全部三方构型」的入口，改为遍历机型列表逐个拉取后合并。
  const thirdItems = ref<ConfigItem[]>([])
  const currentSsfjh = ref('')
  const ssfjhItems = ref<ConfigItem[]>([])
  const ssfjhLoading = ref(false)

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
   * 三方构型行的展示数据：结构（children）原样保留，只补齐缺失的 itemId。
   * 三方行的 itemId / parentItemId 均为 null，而 el-tree 的 node-key 与力导向图的节点 id
   * 都要求页面内唯一，故补一个远离本地自增主键、也不撞 ConfigForceGraph 虚拟根（-1）的合成 id。
   * 本机与三方在构型管理页共用同一套树/图谱渲染，因此这里产出的结构与 treeData 同形。
   */
  const ssfjhTree = computed<ConfigItem[]>(() => {
    let nextId = THIRD_ITEM_ID_BASE
    const normalize = (rows: ConfigItem[]): ConfigItem[] =>
      rows.map((row) => ({
        ...row,
        itemId: row.itemId ?? nextId++,
        children: row.children?.length ? normalize(row.children) : undefined,
      }))
    return normalize(ssfjhItems.value)
  })

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

  /**
   * 拉取全部第三方构型并缓存，供机型下拉里的架号选项使用。
   *
   * ⚠️ 机型现在是必填（后端按机型路由），不再支持「不传机型拉全部三方构型」，
   * 故由调用方传入机型编码列表，逐个拉取后合并去重。
   */
  async function fetchThirdItems(modelCodes: string[]) {
    const codes = [...new Set((modelCodes ?? []).filter(Boolean))]
    if (!codes.length) {
      thirdItems.value = []
      return
    }
    const results = await Promise.allSettled(
      codes.map((code) => aircraftApi.getConfigItems(code)),
    )
    thirdItems.value = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
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
    ssfjhTree,
    ssfjhLoading,
    fetchThirdItems,
    fetchSsfjhItems,
    fetchAll,
    createItem,
    deleteItem,
    getAvailableParents,
  }
})
