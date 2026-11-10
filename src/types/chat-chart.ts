export interface MetricChartPoint extends Array<number> {
  0: number
  1: number
  2: 0 | 1
}

export interface MetricChartSeries {
  name: string
  sortieId?: string | number | null
  points: MetricChartPoint[]
}

export interface MetricChartSpec {
  type: 'line'
  title: string
  metric: string
  unit?: string
  range: { min: number; max: number }
  xAxisName: string
  yAxisName: string
  series: MetricChartSeries[]
}

export interface MetricRangeSummary {
  sortieCount: number
  matchedSortieCount: number
  totalPoints: number
  inRangePoints: number
  outOfRangePoints: number
  minimum: number
  maximum: number
  average: number
}

export interface MetricRangeChartPayload {
  chart: MetricChartSpec
  summary?: MetricRangeSummary
  csvId?: string
}
