import { describe, expect, it } from 'vitest'
import {
  analyzeReleaseSupport,
  numericColumnsFromOverview,
} from '@/utils/releaseSupport'
import type { TimeSeriesData } from '@/types/entities'

function makeData(
  names: string[],
  rowCount: number,
  valueAt: (name: string, index: number) => unknown,
): TimeSeriesData {
  return {
    timestamps: Array.from({ length: rowCount }, (_, index) => index * 1000),
    parameters: names.map((name) => ({
      name,
      values: Array.from({ length: rowCount }, (_, index) => valueAt(name, index)),
    })),
  }
}

describe('analyzeReleaseSupport', () => {
  it('对稳定数据给出可放飞结论', () => {
    const data = makeData(['a', 'b'], 200, (name, index) => {
      const noise = index % 2 === 0 ? 0.02 : -0.02
      return (name === 'a' ? 10 : 50) + noise
    })

    const result = analyzeReleaseSupport(data)

    expect(result.decision).toBe('release')
    expect(result.score).toBeGreaterThan(85)
    expect(result.confidence).toBeGreaterThanOrEqual(0.9 - 1e-9)
    expect(result.attributes).toHaveLength(2)
  })

  it('对持续严重偏离的属性给出不建议放飞', () => {
    const data = makeData(['pressure'], 200, (_, index) =>
      index < 140 ? 10 + (index % 3) * 0.01 : 30,
    )

    const result = analyzeReleaseSupport(data)

    expect(result.decision).toBe('no-release')
    expect(result.attributes[0].healthScore).toBeLessThan(30)
    expect(result.attributes[0].severeRun).toBeGreaterThanOrEqual(3)
  })

  it('数据行不足时返回数据不足', () => {
    const data = makeData(['a'], 20, () => 1)

    const result = analyzeReleaseSupport(data)

    expect(result.decision).toBe('insufficient')
    expect(result.score).toBeNull()
  })

  it('动态忽略无法解析为数值的列', () => {
    const data = makeData(['numeric', 'text'], 200, (name, index) =>
      name === 'numeric' ? 10 + (index % 2) * 0.01 : `state-${index % 2}`,
    )

    const result = analyzeReleaseSupport(data)

    expect(result.scoredAttributes).toBe(1)
    expect(result.attributes.find((item) => item.name === 'text')?.status).toBe(
      'insufficient',
    )
  })
})

describe('numericColumnsFromOverview', () => {
  it('动态识别数值列并排除时间、文本、ID 和标签列', () => {
    const columns = numericColumnsFromOverview({
      columnTypes: {
        TIME: 'TIMESTAMP',
        TEMPERATURE: 'DOUBLE',
        PRESSURE: 'DECIMAL(10,2)',
        DEVICE_ID: 'BIGINT',
        LABEL: 'INT64',
        NOTE: 'VARCHAR',
      },
      textColumns: ['NOTE'],
      timestampColumn: 'TIME',
    })

    expect(columns).toEqual(['TEMPERATURE', 'PRESSURE'])
  })
})
