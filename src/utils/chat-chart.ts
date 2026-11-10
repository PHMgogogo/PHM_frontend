import type {
  MetricChartPoint,
  MetricChartSpec,
  MetricRangeChartPayload,
  MetricRangeSummary,
} from '@/types/chat-chart'

function finite(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizePoint(value: unknown): MetricChartPoint | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = finite(value[0])
  const y = finite(value[1])
  if (x === null || y === null) return null
  return [x, y, Number(value[2]) === 1 ? 1 : 0]
}

function normalizePoints(values: unknown[]): MetricChartPoint[] {
  const points = values
    .map(normalizePoint)
    .filter((point): point is MetricChartPoint => !!point)
  if (!points.length) return []
  const minimumX = Math.min(...points.map((point) => point[0]))
  const shifted = minimumX < 0
    ? points.map((point) => [point[0] - minimumX, point[1], point[2]] as MetricChartPoint)
    : points
  return shifted.sort((a, b) => a[0] - b[0])
}

function normalizeChart(value: unknown): MetricChartSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const range = record.range as Record<string, unknown> | undefined
  if (!range) return null
  const min = finite(range.min)
  const max = finite(range.max)
  if (min === null || max === null) return null
  if (!Array.isArray(record.series)) return null

  const series = record.series
    .slice(0, 30)
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const points = Array.isArray(row.points) ? normalizePoints(row.points) : []
      if (!points.length) return null
      return {
        name: String(row.name || '未命名架次'),
        sortieId:
          typeof row.sortieId === 'string' || typeof row.sortieId === 'number'
            ? row.sortieId
            : null,
        points: points.slice(0, 4000),
      }
    })
    .filter(
      (
        item,
      ): item is {
        name: string
        sortieId: string | number | null
        points: MetricChartPoint[]
      } => !!item,
    )
  if (!series.length) return null

  return {
    type: 'line',
    title: String(record.title || '属性区间查询'),
    metric: String(record.metric || '属性'),
    unit: record.unit ? String(record.unit) : '',
    range: { min, max },
    xAxisName: String(record.xAxisName || '架次内经过时间（分钟）'),
    yAxisName: String(record.yAxisName || record.metric || '数值'),
    series,
  }
}

function normalizeSummary(value: unknown): MetricRangeSummary | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const row = value as Record<string, unknown>
  const keys: Array<keyof MetricRangeSummary> = [
    'sortieCount',
    'matchedSortieCount',
    'totalPoints',
    'inRangePoints',
    'outOfRangePoints',
    'minimum',
    'maximum',
    'average',
  ]
  if (keys.some((key) => finite(row[key]) === null)) return undefined
  return Object.fromEntries(keys.map((key) => [key, Number(row[key])])) as unknown as MetricRangeSummary
}

function parseObject(value: unknown): MetricRangeChartPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const chart = normalizeChart(record.chart)
  if (!chart) return null
  return {
    chart,
    summary: normalizeSummary(record.summary),
    csvId: typeof record.csv_id === 'string' ? record.csv_id : undefined,
  }
}

function parseNestedOutput(value: unknown): MetricRangeChartPayload | null {
  if (typeof value === 'string') {
    try {
      return parseObject(JSON.parse(value) as unknown)
    } catch {
      return null
    }
  }
  const direct = parseObject(value)
  if (direct) return direct
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      if (typeof nested === 'string' || (nested && typeof nested === 'object')) {
        const parsed = parseNestedOutput(nested)
        if (parsed) return parsed
      }
    }
  }
  return null
}

export function parseMetricChartPayload(output?: string | null): MetricRangeChartPayload | null {
  if (!output?.trim()) return null
  const text = output.trim()
  const candidates = [
    text,
    text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''),
  ]
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      const direct = parseObject(parsed)
      if (direct) return direct
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>
        for (const key of ['data', 'result', 'output', 'text', 'content']) {
          const nested = parseNestedOutput(record[key])
          if (nested) return nested
        }
      }
    } catch {
      // 尝试下一种输出形态
    }
  }
  return null
}
