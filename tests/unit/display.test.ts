// ============================================================
// display.ts 单元测试：SQL 编排 + 行式→序列式转换
// ============================================================
// queryDisplay 直调 data_module /csv/sql（背景见 src/api/display.ts 文件头），
// 此处用 mock fetch 锁定两件事：
// 1. 发出的 SQL 与达梦标识符规则匹配：列名加引号保留原始大小写、表名不加
//    引号、容忍 data 已带 csv_ 前缀、limit>0 才生成 LIMIT 子句；
// 2. 四种图表类型的行式→序列式转换与 entity 修复版 _transform 同规则
//    （dimensions/parameter/系列数据点结构、字符串数值 coerce、时序轴 unit）。

import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryDisplay, DISPLAY_TYPE } from '@/api/display'
import type { DisplayRequest } from '@/api/display'

/** mock 全局 fetch 返回一次 /csv/sql 成功响应；返回 mock 以便断言请求内容 */
function mockCsvSql(rows: Record<string, string>[]) {
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: rows,
          columns: rows.length ? Object.keys(rows[0]) : [],
          totalRows: rows.length,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** 取 mock fetch 收到的请求体里的 SQL 字符串 */
function sentSql(fetchMock: ReturnType<typeof mockCsvSql>): string {
  const init = fetchMock.mock.calls[0][1] as RequestInit
  return (JSON.parse(init.body as string) as { sql: string }).sql
}

/** 取 mock fetch 收到的请求 URL */
function sentUrl(fetchMock: ReturnType<typeof mockCsvSql>): string {
  return fetchMock.mock.calls[0][0] as string
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('queryDisplay：SQL 编排', () => {
  it('列名加引号保留原始小写，表名不加引号，limit=0 不生成 LIMIT', async () => {
    const m = mockCsvSql([{ n1_speed: '85.2', n2_speed: '95.1' }])
    await queryDisplay({
      data: '202609281120',
      columns: ['n1_speed', 'n2_speed'],
      limit: 0,
      type: DISPLAY_TYPE.MAPPING_2D,
    })
    expect(sentUrl(m)).toBe('/api/csv/sql')
    expect(sentSql(m)).toBe('SELECT "n1_speed", "n2_speed" FROM csv_202609281120')
  })

  it('容忍 data 已带 csv_ 前缀（不重复拼接）', async () => {
    const m = mockCsvSql([{ a: '1', b: '2' }])
    await queryDisplay({
      data: 'csv_engine_vibration',
      columns: ['a', 'b'],
      limit: 0,
      type: DISPLAY_TYPE.MAPPING_2D,
    })
    expect(sentSql(m)).toContain('FROM csv_engine_vibration')
  })

  it('limit>0 时追加 LIMIT 子句', async () => {
    const m = mockCsvSql([{ a: '1', b: '2' }])
    await queryDisplay({
      data: 't',
      columns: ['a', 'b'],
      limit: 500,
      type: DISPLAY_TYPE.MAPPING_2D,
    })
    expect(sentSql(m)).toBe('SELECT "a", "b" FROM csv_t LIMIT 500')
  })

  it('列名内嵌双引号按 SQL 约定转义', async () => {
    const m = mockCsvSql([{ 'we"ird': '1', b: '2' }])
    await queryDisplay({
      data: 't',
      columns: ['we"ird', 'b'],
      limit: 0,
      type: DISPLAY_TYPE.MAPPING_2D,
    })
    expect(sentSql(m)).toBe('SELECT "we""ird", "b" FROM csv_t')
  })
})

describe('queryDisplay：列数校验', () => {
  const cases: [DisplayRequest['type'], number][] = [
    [DISPLAY_TYPE.SINGLE_TIMESERIES_2D, 1],
    [DISPLAY_TYPE.MAPPING_2D, 3],
    [DISPLAY_TYPE.MULTI_TIMESERIES_2D, 2],
    [DISPLAY_TYPE.POINT_CLOUD_3D, 2],
  ]
  it.each(cases)('%s 列数不符时拒绝并前置拦截（不发请求）', async (type, n) => {
    const m = mockCsvSql([])
    await expect(
      queryDisplay({
        data: 't',
        columns: Array.from({ length: n }, (_, i) => `c${i}`),
        limit: 0,
        type,
      }),
    ).rejects.toThrow(/requires/)
    expect(m).not.toHaveBeenCalled()
  })
})

describe('queryDisplay：行式→序列式转换', () => {
  it('MAPPING_2D：单系列，点=[x, y]，数值字符串转数值', async () => {
    mockCsvSql([
      { n1_speed: '85.2', n2_speed: '95.1' },
      { n1_speed: '92.5', n2_speed: '98.3' },
    ])
    const res = await queryDisplay({
      data: 't',
      columns: ['n1_speed', 'n2_speed'],
      limit: 0,
      type: DISPLAY_TYPE.MAPPING_2D,
    })
    expect(res.dimensions).toEqual([
      { name: 'n1_speed', unit: '' },
      { name: 'n2_speed', unit: '' },
    ])
    expect(res.parameter).toEqual(['n2_speed'])
    expect(res.data).toEqual([{ parameter: 'n2_speed', data: [[85.2, 95.1], [92.5, 98.3]] }])
  })

  it('SINGLE_TIMESERIES_2D：时间轴 unit=time，非数值时间标签保持字符串', async () => {
    mockCsvSql([
      { flight_date: '2026-04-15', n1_speed: '85.2' },
      { flight_date: '2026-04-16', n1_speed: '92.5' },
    ])
    const res = await queryDisplay({
      data: 't',
      columns: ['flight_date', 'n1_speed'],
      limit: 0,
      type: DISPLAY_TYPE.SINGLE_TIMESERIES_2D,
    })
    expect(res.dimensions).toEqual([
      { name: 'flight_date', unit: 'time' },
      { name: 'n1_speed', unit: '' },
    ])
    expect(res.parameter).toEqual(['n1_speed'])
    expect(res.data[0].data).toEqual([
      ['2026-04-15', 85.2],
      ['2026-04-16', 92.5],
    ])
  })

  it('MULTI_TIMESERIES_2D：每个参数列一个系列，共享时间轴', async () => {
    mockCsvSql([
      { flight_date: '2026-04-15', n1_speed: '85.2', n2_speed: '95.1', phase: 'TAKEOFF' },
    ])
    const res = await queryDisplay({
      data: 't',
      columns: ['flight_date', 'n1_speed', 'n2_speed'],
      limit: 0,
      type: DISPLAY_TYPE.MULTI_TIMESERIES_2D,
    })
    expect(res.dimensions).toEqual([
      { name: 'flight_date', unit: 'time' },
      { name: 'n1_speed', unit: '' },
    ])
    expect(res.parameter).toEqual(['n1_speed', 'n2_speed'])
    expect(res.data).toEqual([
      { parameter: 'n1_speed', data: [['2026-04-15', 85.2]] },
      { parameter: 'n2_speed', data: [['2026-04-15', 95.1]] },
    ])
  })

  it('POINT_CLOUD_3D：三轴维度，点=[x, y, z]，参数为第 3 列', async () => {
    mockCsvSql([{ n1_speed: '85.2', n2_speed: '95.1', fan_vibration: '2.1' }])
    const res = await queryDisplay({
      data: 't',
      columns: ['n1_speed', 'n2_speed', 'fan_vibration'],
      limit: 0,
      type: DISPLAY_TYPE.POINT_CLOUD_3D,
    })
    expect(res.dimensions.map((d) => d.name)).toEqual(['n1_speed', 'n2_speed', 'fan_vibration'])
    expect(res.parameter).toEqual(['fan_vibration'])
    expect(res.data).toEqual([{ parameter: 'fan_vibration', data: [[85.2, 95.1, 2.1]] }])
  })

  it('上游返回空数据时产出空点系列（与 entity 行为一致）', async () => {
    mockCsvSql([])
    const res = await queryDisplay({
      data: 't',
      columns: ['n1_speed', 'n2_speed'],
      limit: 0,
      type: DISPLAY_TYPE.MAPPING_2D,
    })
    expect(res.parameter).toEqual(['n2_speed'])
    expect(res.data).toEqual([{ parameter: 'n2_speed', data: [] }])
  })

  it('上游 success=false / HTTP 非 2xx 时抛出上游错误信息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, error: 'SQL执行错误' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    await expect(
      queryDisplay({
        data: 't',
        columns: ['n1_speed', 'n2_speed'],
        limit: 0,
        type: DISPLAY_TYPE.MAPPING_2D,
      }),
    ).rejects.toThrow('SQL执行错误')
  })
})
