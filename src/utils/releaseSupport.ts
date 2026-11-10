import type { CsvOverview, TimeSeriesData } from '@/types/entities'

export type ReleaseDecision =
  | 'release'
  | 'conditional'
  | 'no-release'
  | 'insufficient'

export type AttributeStatus = 'normal' | 'warning' | 'critical' | 'insufficient'

export interface ReleaseSupportConfig {
  baselineRatio: number
  evaluationRows: number
  minBaselineRows: number
  minEvaluationRows: number
  minColumnSamples: number
  releaseScore: number
  conditionalScore: number
  releaseLowScore: number
  minConfidence: number
  releaseConfidence: number
  criticalHealth: number
  severeZ: number
  severeRunLength: number
  severeAttributeRatio: number
}

export const DEFAULT_RELEASE_SUPPORT_CONFIG: ReleaseSupportConfig = {
  baselineRatio: 0.2,
  evaluationRows: 60,
  minBaselineRows: 20,
  minEvaluationRows: 30,
  minColumnSamples: 6,
  releaseScore: 85,
  conditionalScore: 75,
  releaseLowScore: 70,
  minConfidence: 0.8,
  releaseConfidence: 0.9,
  criticalHealth: 30,
  severeZ: 5,
  severeRunLength: 3,
  severeAttributeRatio: 0.1,
}

export interface ReleaseAttributeScore {
  name: string
  healthScore: number | null
  status: AttributeStatus
  deviation: number | null
  exceedanceRate: number | null
  trend: number | null
  coverage: number
  baselineSamples: number
  evaluationSamples: number
  baselineMedian: number | null
  baselineScale: number | null
  severeRun: number
  reason: string
}

export interface ReleaseSupportResult {
  decision: ReleaseDecision
  label: string
  score: number | null
  weightedScore: number | null
  lowScore: number | null
  confidence: number
  totalRows: number
  baselineRows: number
  evaluationRows: number
  baselineEnd: number
  evaluationStart: number
  totalAttributes: number
  scoredAttributes: number
  criticalAttributes: number
  attributes: ReleaseAttributeScore[]
  reasons: string[]
}

const DECISION_LABELS: Record<ReleaseDecision, string> = {
  release: '可放飞',
  conditional: '有条件放飞',
  'no-release': '不建议放飞',
  insufficient: '数据不足',
}

const NUMERIC_SQL_TYPE =
  /\b(?:tinyint|smallint|integer|int|int64|bigint|decimal|numeric|double|float|real|number|serial)\b/i
const TEMPORAL_SQL_TYPE = /\b(?:date|time|timestamp|datetime)\b/i
const NON_FEATURE_COLUMN = /(^|[_\s-])(id|label|target|class)($|[_\s-])|^(序号|标签|类别)$/i

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || /^(nan|inf|infinity)$/i.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0
  if (values.length === 1) return values[0]
  const position = Math.min(1, Math.max(0, q)) * (values.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return values[lower]
  const ratio = position - lower
  return values[lower] * (1 - ratio) + values[upper] * ratio
}

function median(values: number[]): number {
  return quantile(sorted(values), 0.5)
}

function robustScale(values: number[]): number {
  const center = median(values)
  const deviations = sorted(values.map((value) => Math.abs(value - center)))
  const mad = median(deviations)
  if (mad > Number.EPSILON) return Math.max(Number.EPSILON, 1.4826 * mad)

  const q25 = quantile(sorted(values), 0.25)
  const q75 = quantile(sorted(values), 0.75)
  if (q75 - q25 > Number.EPSILON) return (q75 - q25) / 1.349

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  if (variance > Number.EPSILON) return Math.sqrt(variance)

  const magnitude = Math.max(1, ...values.map((value) => Math.abs(value)))
  return magnitude * 1e-6
}

function longestSevereRun(
  values: Array<number | null>,
  center: number,
  scale: number,
  severeZ: number,
): number {
  let longest = 0
  let current = 0
  for (const value of values) {
    if (value !== null && Math.abs((value - center) / scale) > severeZ) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }
  return longest
}

function scoreAttribute(
  name: string,
  values: unknown[],
  baselineStart: number,
  baselineEnd: number,
  evaluationStart: number,
  totalRows: number,
  config: ReleaseSupportConfig,
): ReleaseAttributeScore {
  const numeric = values.map(finiteNumber)
  const baselineValues = numeric
    .slice(baselineStart, baselineEnd)
    .filter((value): value is number => value !== null)
  const evaluationValues = numeric
    .slice(evaluationStart, totalRows)
    .filter((value): value is number => value !== null)
  const evaluationWindow = Math.max(1, totalRows - evaluationStart)
  const coverage = evaluationValues.length / evaluationWindow

  if (
    baselineValues.length < config.minColumnSamples ||
    evaluationValues.length < config.minColumnSamples
  ) {
    return {
      name,
      healthScore: null,
      status: 'insufficient',
      deviation: null,
      exceedanceRate: null,
      trend: null,
      coverage,
      baselineSamples: baselineValues.length,
      evaluationSamples: evaluationValues.length,
      baselineMedian: null,
      baselineScale: null,
      severeRun: 0,
      reason: '基线或评估窗口的有效样本不足',
    }
  }

  const center = median(baselineValues)
  const scale = robustScale(baselineValues)
  const sortedBaseline = sorted(baselineValues)
  const lowerBound = quantile(sortedBaseline, 0.005)
  const upperBound = quantile(sortedBaseline, 0.995)
  const zScores = evaluationValues.map((value) => Math.abs((value - center) / scale))
  const sortedZ = sorted(zScores)
  const deviation = quantile(sortedZ, 0.9)
  const outsideCount = evaluationValues.filter(
    (value) => value < lowerBound || value > upperBound,
  ).length
  const exceedanceRate = outsideCount / evaluationValues.length

  const clamped = numeric
    .slice(evaluationStart, totalRows)
    .map((value) =>
      value === null ? null : Math.min(center + scale * 5, Math.max(center - scale * 5, value)),
    )
  const points = clamped
    .map((value, index) => ({ value, x: index }))
    .filter((point): point is { value: number; x: number } => point.value !== null)

  let trend = 0
  if (points.length >= 2) {
    const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const yMean = points.reduce((sum, point) => sum + point.value, 0) / points.length
    let covariance = 0
    let variance = 0
    for (const point of points) {
      covariance += (point.x - xMean) * (point.value - yMean)
      variance += (point.x - xMean) ** 2
    }
    if (variance > 0) {
      const slope = covariance / variance
      const span = points[points.length - 1].x - points[0].x
      trend = Math.abs(slope * span) / scale
    }
  }

  const anomaly =
    0.45 * Math.min(deviation, 10) +
    0.35 * Math.min(exceedanceRate / 0.05, 5) +
    0.2 * Math.min(trend, 5)
  const healthScore = Math.max(0, Math.min(100, 100 * Math.exp(-anomaly / 3)))
  const severeRun = longestSevereRun(
    numeric.slice(evaluationStart, totalRows),
    center,
    scale,
    config.severeZ,
  )

  let status: AttributeStatus = 'normal'
  let reason = '统计分布与基线一致'
  if (healthScore < config.criticalHealth) {
    status = 'critical'
    reason = `健康分低于 ${config.criticalHealth}`
  } else if (healthScore < config.releaseScore) {
    status = 'warning'
    if (exceedanceRate > 0.05) reason = `越界率 ${(exceedanceRate * 100).toFixed(1)}%`
    else if (trend > 2) reason = '评估窗口内存在明显趋势变化'
    else reason = '相对基线出现偏离'
  }

  return {
    name,
    healthScore,
    status,
    deviation,
    exceedanceRate,
    trend,
    coverage,
    baselineSamples: baselineValues.length,
    evaluationSamples: evaluationValues.length,
    baselineMedian: center,
    baselineScale: scale,
    severeRun,
    reason,
  }
}

function emptyResult(
  totalRows: number,
  baselineRows: number,
  evaluationRows: number,
  attributes: ReleaseAttributeScore[],
  reason: string,
): ReleaseSupportResult {
  return {
    decision: 'insufficient',
    label: DECISION_LABELS.insufficient,
    score: null,
    weightedScore: null,
    lowScore: null,
    confidence: 0,
    totalRows,
    baselineRows,
    evaluationRows,
    baselineEnd: baselineRows,
    evaluationStart: Math.max(0, totalRows - evaluationRows),
    totalAttributes: attributes.length,
    scoredAttributes: 0,
    criticalAttributes: 0,
    attributes,
    reasons: [reason],
  }
}

/**
 * 第一版逐列稳健统计。
 *
 * 以当前架次最早 20% 数据作为基线，以最后 60 行（不足时取基线之后全部数据）
 * 作为评估窗口。每个数值列独立计算稳健偏离、越界率和趋势，再做加权汇总。
 */
export function analyzeReleaseSupport(
  data: TimeSeriesData,
  config: ReleaseSupportConfig = DEFAULT_RELEASE_SUPPORT_CONFIG,
): ReleaseSupportResult {
  const parameters = data.parameters ?? []
  const totalRows = Math.max(
    data.timestamps?.length ?? 0,
    ...parameters.map((parameter) => parameter.values?.length ?? 0),
    0,
  )
  if (!parameters.length || totalRows < config.minBaselineRows + config.minEvaluationRows) {
    return emptyResult(
      totalRows,
      0,
      0,
      [],
      `有效行数不足：至少需要 ${config.minBaselineRows + config.minEvaluationRows} 行`,
    )
  }

  let baselineEnd = Math.max(
    config.minBaselineRows,
    Math.floor(totalRows * config.baselineRatio),
  )
  baselineEnd = Math.min(baselineEnd, totalRows - config.minEvaluationRows)
  const evaluationStart = Math.max(baselineEnd, totalRows - config.evaluationRows)
  const evaluationRows = totalRows - evaluationStart

  const attributes = parameters
    .map((parameter) =>
      scoreAttribute(
        parameter.name,
        parameter.values ?? [],
        0,
        baselineEnd,
        evaluationStart,
        totalRows,
        config,
      ),
    )
    .sort((a, b) => {
      if (a.healthScore === null && b.healthScore === null) return a.name.localeCompare(b.name)
      if (a.healthScore === null) return 1
      if (b.healthScore === null) return -1
      return a.healthScore - b.healthScore
    })

  const scored = attributes.filter(
    (attribute): attribute is ReleaseAttributeScore & { healthScore: number } =>
      attribute.healthScore !== null,
  )
  if (!scored.length) {
    return emptyResult(
      totalRows,
      baselineEnd,
      evaluationRows,
      attributes,
      '没有兼具基线样本和评估样本的数值属性',
    )
  }

  const weighted = scored.map((attribute) => ({
    score: attribute.healthScore,
    weight:
      attribute.coverage *
      (0.7 + 0.3 * Math.min(1, attribute.baselineSamples / 60)),
  }))
  const weightSum = weighted.reduce((sum, item) => sum + item.weight, 0)
  const weightedScore =
    weightSum > 0
      ? weighted.reduce((sum, item) => sum + item.score * item.weight, 0) / weightSum
      : 0
  const lowCount = Math.max(1, Math.ceil(scored.length * 0.1))
  const lowScore =
    scored.slice(0, lowCount).reduce((sum, attribute) => sum + attribute.healthScore, 0) /
    lowCount
  const score = weightedScore * 0.7 + lowScore * 0.3

  const averageCoverage =
    scored.reduce((sum, attribute) => sum + attribute.coverage, 0) / scored.length
  const averageBaselineQuality =
    scored.reduce(
      (sum, attribute) => sum + Math.min(1, attribute.baselineSamples / 60),
      0,
    ) / scored.length
  const sampleFactor = Math.min(1, evaluationRows / 60)
  const columnFactor = scored.length / attributes.length
  const confidence =
    averageCoverage *
    (0.7 + 0.3 * averageBaselineQuality) *
    sampleFactor *
    columnFactor

  const criticalAttributes = scored.filter(
    (attribute) =>
      attribute.healthScore < config.criticalHealth ||
      attribute.severeRun >= config.severeRunLength,
  ).length
  const severeRatio = criticalAttributes / scored.length
  let decision: ReleaseDecision = 'conditional'
  const reasons: string[] = []

  if (confidence + 1e-9 < config.minConfidence) {
    decision = 'insufficient'
    reasons.push(
      `置信度 ${(confidence * 100).toFixed(1)}% 低于 ${(config.minConfidence * 100).toFixed(0)}%`,
    )
  } else if (score < config.conditionalScore) {
    decision = 'no-release'
    reasons.push(
      `综合分 ${score.toFixed(1)} 低于 ${config.conditionalScore}`,
    )
  } else if (
    severeRatio >= config.severeAttributeRatio ||
    scored.some((attribute) => attribute.severeRun >= config.severeRunLength)
  ) {
    decision = 'no-release'
    reasons.push('存在持续严重偏离基线的属性')
  } else if (
    score >= config.releaseScore &&
    lowScore >= config.releaseLowScore &&
    confidence + 1e-9 >= config.releaseConfidence
  ) {
    decision = 'release'
    reasons.push('综合分、低分属性与置信度均达到放飞阈值')
  } else {
    decision = 'conditional'
    if (score < config.releaseScore) {
      reasons.push(`综合分 ${score.toFixed(1)} 处于有条件放飞区间`)
    }
    if (lowScore < config.releaseLowScore) {
      reasons.push(`低分属性均值 ${lowScore.toFixed(1)} 低于 ${config.releaseLowScore}`)
    }
    if (confidence < config.releaseConfidence) {
      reasons.push(`置信度 ${(confidence * 100).toFixed(1)}% 未达到直接放飞要求`)
    }
  }

  return {
    decision,
    label: DECISION_LABELS[decision],
    score,
    weightedScore,
    lowScore,
    confidence,
    totalRows,
    baselineRows: baselineEnd,
    evaluationRows,
    baselineEnd,
    evaluationStart,
    totalAttributes: attributes.length,
    scoredAttributes: scored.length,
    criticalAttributes,
    attributes,
    reasons,
  }
}

export function isNumericCsvType(type: string): boolean {
  const normalized = type.trim()
  return NUMERIC_SQL_TYPE.test(normalized) && !TEMPORAL_SQL_TYPE.test(normalized)
}

/**
 * 从动态 CSV 元数据中挑出可参与统计的数值列。
 * 时间轴、文本列、ID 和常见标签列不进入放飞评分。
 */
export function numericColumnsFromOverview(
  overview: Pick<CsvOverview, 'columnTypes' | 'textColumns' | 'timestampColumn'>,
): string[] {
  const timestamp = overview.timestampColumn?.trim().toLowerCase() ?? ''
  const textColumns = new Set(
    (overview.textColumns ?? []).map((name) => name.trim().toLowerCase()),
  )
  return Object.entries(overview.columnTypes ?? {})
    .filter(([name, type]) => {
      const normalizedName = name.trim()
      const lower = normalizedName.toLowerCase()
      if (!normalizedName || lower === timestamp || textColumns.has(lower)) return false
      if (NON_FEATURE_COLUMN.test(normalizedName)) return false
      return isNumericCsvType(type)
    })
    .map(([name]) => name)
}
