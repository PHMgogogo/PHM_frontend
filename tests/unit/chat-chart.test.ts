import { describe, expect, it } from 'vitest'
import { parseMetricChartPayload } from '@/utils/chat-chart'

const payload = {
  chart: {
    type: 'line',
    title: '测试温度区间',
    metric: '温度',
    unit: '℃',
    range: { min: 20, max: 30 },
    xAxisName: '架次内经过时间（分钟）',
    yAxisName: '温度（℃）',
    series: [
      {
        name: '2026_he_data',
        sortieId: '23',
        points: [
          [0, 21.5, 1],
          [1, 31.2, 0],
        ],
      },
    ],
  },
  summary: {
    sortieCount: 1,
    matchedSortieCount: 1,
    totalPoints: 2,
    inRangePoints: 1,
    outOfRangePoints: 1,
    minimum: 21.5,
    maximum: 31.2,
    average: 26.35,
  },
}

describe('parseMetricChartPayload', () => {
  it('解析 MCP 工具返回的图表 JSON', () => {
    const result = parseMetricChartPayload(JSON.stringify(payload))
    expect(result?.chart.metric).toBe('温度')
    expect(result?.chart.series[0].points).toEqual([
      [0, 21.5, 1],
      [1, 31.2, 0],
    ])
    expect(result?.summary?.inRangePoints).toBe(1)
  })

  it('兼容带文本前后缀和代码围栏的工具输出', () => {
    const result = parseMetricChartPayload(
      `工具执行完成\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``,
    )
    expect(result?.chart.title).toBe('测试温度区间')
  })

  it('兼容 OpenCode 使用 result 字段包装的工具输出', () => {
    const result = parseMetricChartPayload(
      JSON.stringify({ result: JSON.stringify(payload) }),
    )
    expect(result?.chart.series[0].name).toBe('2026_he_data')
    expect(result?.summary?.totalPoints).toBe(2)
  })

  it('普通工具输出不会误判为图表', () => {
    expect(parseMetricChartPayload('{"rows": 10}')).toBeNull()
  })

  it('修正历史消息里负数和乱序的经过时间', () => {
    const legacy = {
      ...payload,
      chart: {
        ...payload.chart,
        series: [
          {
            name: 'legacy',
            points: [
              [0, 30, 1],
              [-5, 20, 1],
              [-2, 25, 1],
            ],
          },
        ],
      },
    }
    const result = parseMetricChartPayload(JSON.stringify(legacy))
    expect(result?.chart.series[0].points).toEqual([
      [0, 20, 1],
      [3, 25, 1],
      [5, 30, 1],
    ])
  })
})
