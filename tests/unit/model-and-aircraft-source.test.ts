import { describe, expect, it } from 'vitest'
import {
  baseModelCode,
  isExternalModelCode,
  isLocalModelCode,
  modelSourceText,
} from '@/utils/model-code'
import {
  aircraftSourceText,
  isExternalAircraft,
  isLocalAircraft,
} from '@/utils/aircraft-source'

/**
 * 这两组工具函数编码了后端两个接口的隐式约定，且判错时的表现都不像 bug：
 * - 机型：GET /aircraft/models 用 ':' 区分本地/外源，且 ':modelId' 后缀不能直接喂给单机查询
 *   （传 'JX-20A:10001' 返回 0 行，界面表现为「该型号下没有单机」）。
 * - 单机：GET /aircraft/plane 不返回 source，只能用占位符反推。
 * 故用实测数据固化住。
 */

describe('机型编码约定（GET /aircraft/models）', () => {
  it('带 :modelId 后缀的为外源机型', () => {
    // 实测返回：JX-20A 本地一条，航新/633 各一条带后缀
    expect(isExternalModelCode('JX-20A:10001')).toBe(true)
    expect(isExternalModelCode('YX-9B:10002')).toBe(true)
    expect(isLocalModelCode('JX-20A:10001')).toBe(false)
  })

  it('不含冒号的为本地机型', () => {
    expect(isLocalModelCode('JX-20A')).toBe(true)
    expect(isLocalModelCode('B737-800')).toBe(true)
    expect(isExternalModelCode('JX-20A')).toBe(false)
  })

  it('来源文案只能二分：本地 / 第三方服务', () => {
    expect(modelSourceText('JX-20A')).toBe('本地')
    expect(modelSourceText('JX-20A:10001')).toBe('第三方服务')
  })

  it('取基础编码：截掉 :modelId 后缀', () => {
    // 关键用例：后端 /aircraft/plane 只认基础编码
    expect(baseModelCode('JX-20A:10001')).toBe('JX-20A')
    expect(baseModelCode('YX-9B:10002')).toBe('YX-9B')
  })

  it('取基础编码：无后缀时原样返回', () => {
    expect(baseModelCode('JX-20A')).toBe('JX-20A')
    expect(baseModelCode('B737-800')).toBe('B737-800')
  })

  it('取基础编码：只截第一个冒号，空串安全', () => {
    expect(baseModelCode('A:B:C')).toBe('A')
    expect(baseModelCode(':10001')).toBe('')
    expect(baseModelCode('')).toBe('')
  })
})

describe('单机来源判定（GET /aircraft/plane，无 source 字段）', () => {
  /** 实测本地单机：三个字段均为真实值 */
  const localRow = {
    aircraftNumber: '20011',
    modelCode: 'JX-20A',
    airline: '某航空',
    status: 'normal',
    createdAt: '2024-01-01 00:00:00',
  }

  /** 实测外源单机（航新/633）：三个字段统一为 '-'，且 modelCode 不带后缀 */
  const externalRow = {
    aircraftNumber: '20011',
    modelCode: 'JX-20A',
    airline: '-',
    status: '-',
    createdAt: '-',
  }

  it('本地单机：字段为真实值时判为本地', () => {
    expect(isLocalAircraft(localRow)).toBe(true)
    expect(isExternalAircraft(localRow)).toBe(false)
    expect(aircraftSourceText(localRow)).toBe('本地')
  })

  it('外源单机：占位符行判为外源', () => {
    expect(isExternalAircraft(externalRow)).toBe(true)
    expect(isLocalAircraft(externalRow)).toBe(false)
    expect(aircraftSourceText(externalRow)).toBe('第三方服务')
  })

  it('判据是「任一字段为占位符即外源」——偏向外源', () => {
    // 只要一个字段是 '-' 就整条视为外源，避免给外源数据露出删除入口
    expect(isExternalAircraft({ ...localRow, airline: '-' })).toBe(true)
    expect(isExternalAircraft({ ...localRow, status: '-' })).toBe(true)
    expect(isExternalAircraft({ ...localRow, createdAt: '-' })).toBe(true)
  })

  it('缺失 / 空 / 纯空白的字段等同于占位符', () => {
    expect(isExternalAircraft({ ...localRow, airline: '' })).toBe(true)
    expect(isExternalAircraft({ ...localRow, status: '   ' })).toBe(true)
    expect(isExternalAircraft({ ...localRow, createdAt: undefined })).toBe(true)
    expect(isExternalAircraft({ ...localRow, airline: null })).toBe(true)
  })

  it('前后空白的真实值不算占位符', () => {
    expect(isLocalAircraft({ ...localRow, airline: ' 某航空 ' })).toBe(true)
  })
})
