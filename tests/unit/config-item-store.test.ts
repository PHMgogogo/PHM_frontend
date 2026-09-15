import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfigItem } from '@/types/entities'

const api = vi.hoisted(() => ({
  getConfigItems: vi.fn(),
  getConfigItemTree: vi.fn(),
  getConfigItemSelectList: vi.fn(),
  createConfigItem: vi.fn(),
  deleteConfigItem: vi.fn(),
}))

vi.mock('@/api/aircraft', () => api)

import { useConfigItemStore } from '@/stores/configItem'

/**
 * 构型管理页的第三方分支约定（后端 GET /aircraft/config-items）：
 * - 不传 modelCode 才返回三方构型，且**三方行的 modelCode 装的就是上游的 SSFJH**
 *   （后端映射 SSFJH→modelCode，itemId/parentItemId 为 null，itemType 固定 EQUIPMENT）。
 * - 传 modelCode 走的是本地分支，目前拿不到三方架号的数据，故 store 在带参返回空时
 *   回落用首屏缓存过滤，保证界面不空。这些行为出错时都只是「表里少几行」，不像 bug，故用测试固化。
 */

/** 三方构型行：itemId/parentItemId 为 null，名称落在 equipmentName，modelCode 即架号 */
function thirdRow(ssfjh: string, equipmentName: string): ConfigItem {
  return {
    itemId: null as unknown as number,
    modelCode: ssfjh,
    parentItemId: null,
    gjbChapter: null as unknown as string,
    systemName: null,
    subSystemName: null,
    equipmentName,
    partNumber: null,
    itemType: 'EQUIPMENT',
  }
}

describe('构型管理 · 第三方架号（SSFJH）', () => {
  let store: ReturnType<typeof useConfigItemStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useConfigItemStore()
  })

  it('架号列表取三方行的 modelCode，去重、排序、滤掉空值', async () => {
    // 接口返回顺序不保证，且同一架号会有多行
    api.getConfigItems.mockResolvedValue([
      thirdRow('0002', '部件B'),
      thirdRow('0001', '部件A'),
      thirdRow('0001', '部件A2'),
      thirdRow('', '无名架号'),
    ])

    await store.fetchThirdItems()

    expect(store.thirdSsfjhList).toEqual(['0001', '0002'])
  })

  it('点架号时把 modelCode 传成该架号', async () => {
    api.getConfigItems.mockResolvedValue([thirdRow('0001', '后端过滤结果')])

    await store.fetchSsfjhItems('0001')

    expect(api.getConfigItems).toHaveBeenCalledWith('0001')
    expect(store.currentSsfjh).toBe('0001')
    expect(store.ssfjhItems.map((i) => i.equipmentName)).toEqual(['后端过滤结果'])
  })

  it('带参返回空时回落首屏缓存，只留该架号的行', async () => {
    api.getConfigItems.mockResolvedValue([
      thirdRow('0001', '部件A'),
      thirdRow('0001', '部件A2'),
      thirdRow('0002', '部件B'),
    ])
    await store.fetchThirdItems()

    // 后端尚未让 modelCode 对三方 SSFJH 生效：带参请求返回空
    api.getConfigItems.mockResolvedValue([])
    await store.fetchSsfjhItems('0001')

    expect(api.getConfigItems).toHaveBeenLastCalledWith('0001')
    expect(store.ssfjhItems.map((i) => i.equipmentName)).toEqual(['部件A', '部件A2'])
  })

  it('未先拉全量时回落结果为空，不抛错', async () => {
    api.getConfigItems.mockResolvedValue([])

    await store.fetchSsfjhItems('0001')

    expect(store.ssfjhItems).toEqual([])
  })

  it('空架号不发请求，避免误把全量三方构型当成本地机型查回来', async () => {
    await store.fetchSsfjhItems('')

    expect(api.getConfigItems).not.toHaveBeenCalled()
  })

  it('第三方链路不污染本地构型状态', async () => {
    api.getConfigItems.mockResolvedValue([thirdRow('0001', '部件A')])

    await store.fetchThirdItems()
    await store.fetchSsfjhItems('0001')

    expect(store.currentModelCode).toBe('')
    expect(store.treeData).toEqual([])
    expect(api.getConfigItemTree).not.toHaveBeenCalled()
  })
})
