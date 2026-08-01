// 图表数据展示选项构造器
// 把 POST /api/display/raw-data 的序列式响应（{dimensions, parameter, data}）
// 按 type 转成 ECharts option。与 chart-configs.js 风格保持一致。

import { COMMON_CHART_CONFIG, DEFAULT_COLOR_PALETTE, RESPONSIVE_CONFIG } from '../../utils/chart-configs.js'
import { DISPLAY_TYPE, CHART_STYLE } from '../../api/display.js'

/**
 * 各 type 所需的列数约束。
 * - 'N' 表示恰好 N 列
 * - 'N+' 表示至少 N 列（multi 时序：时间 + 多参数）
 * @param {string} type DISPLAY_TYPE 之一
 * @returns {{exact: number, min: number}} 列数约束
 */
export function getRequiredColumnCount(type) {
  switch (type) {
    case DISPLAY_TYPE.SINGLE_TIMESERIES_2D:
      return { exact: 2, min: 2 }
    case DISPLAY_TYPE.MULTI_TIMESERIES_2D:
      return { exact: 0, min: 3 } // 至少 3 列：时间 + 2 个参数
    case DISPLAY_TYPE.MAPPING_2D:
      return { exact: 2, min: 2 }
    case DISPLAY_TYPE.POINT_CLOUD_3D:
      return { exact: 3, min: 3 }
    default:
      return { exact: 0, min: 1 }
  }
}

/**
 * 把 ChartStyle 解析为 ECharts series 配置片段。
 * - AREA 表达为 `type:'line'` + areaStyle（由调用方读取 areaStyle 再加 opacity）。
 * - style 缺省（null/undefined）时回落 fallback，保证现有渲染零回归。
 * @param {string|null|undefined} style CHART_STYLE 之一
 * @param {'line'|'scatter'|'bar'} fallback 该类型在无样式时的默认 series 类型
 * @returns {{ type: string, areaStyle?: object }}
 */
function resolveSeriesType(style, fallback) {
  switch (style) {
    case CHART_STYLE.BAR:
      return { type: 'bar' }
    case CHART_STYLE.SCATTER:
      return { type: 'scatter' }
    case CHART_STYLE.AREA:
      return { type: 'line', areaStyle: {} }
    case CHART_STYLE.LINE:
      return { type: 'line' }
    default:
      return { type: fallback }
  }
}

/**
 * 生成图表标题：用参数名拼接。
 * 既作为 ECharts 标题的备选来源，也供外部（如 MonitorView）在用户未自定义标题时推导默认标题。
 * @param {string[]} parameters 参数名列表
 * @returns {string} 标题文本
 */
export function buildTitle(parameters) {
  if (!parameters || parameters.length === 0) return '数据展示'
  if (parameters.length === 1) return parameters[0]
  return parameters.slice(0, 3).join(' / ') + (parameters.length > 3 ? ' …' : '')
}

/**
 * 把 DisplayResponse 转成 ECharts option。
 * @param {string} displayType DISPLAY_TYPE 之一
 * @param {import('../../api/display').DisplayResponse} response
 * @param {string} [size='medium'] 'small' | 'medium' | 'large'
 * @param {string|null} [style=null] CHART_STYLE 之一；仅作用于 2D 类型，3D 点云忽略
 * @returns {object} ECharts option
 */
export function buildDisplayOption(displayType, response, size = 'medium', style = null) {
  if (!response || !Array.isArray(response.dimensions) || !Array.isArray(response.data)) {
    return emptyOption('无数据')
  }

  const responsive = RESPONSIVE_CONFIG[size] || RESPONSIVE_CONFIG.medium

  switch (displayType) {
    case DISPLAY_TYPE.SINGLE_TIMESERIES_2D:
    case DISPLAY_TYPE.MULTI_TIMESERIES_2D:
      return buildTimeseriesOption(response, size, responsive, style)
    case DISPLAY_TYPE.MAPPING_2D:
      return buildMapping2DOption(response, size, responsive, style)
    case DISPLAY_TYPE.POINT_CLOUD_3D:
      return buildPointCloud3DOption(response, size) // 3D 忽略 style
    default:
      return emptyOption(`不支持的类型: ${displayType}`)
  }
}

/**
 * 2D 时序图：x 轴为 dimensions[0]（时间），每条 series 对应一个 parameter。
 * series 渲染样式由 style 决定（折线/散点/柱状/面积），数据格式保持 y-only 不变。
 * @param {string|null} [style=null] CHART_STYLE 之一；缺省回落折线
 */
function buildTimeseriesOption(response, size, responsive, style = null) {
  // 时间轴数据：取第一条 series 的每个点的第 0 维（各 series 共享时间轴）
  const timeAxis = response.data[0]?.data?.map((point) => point[0]) ?? []

  const resolved = resolveSeriesType(style, 'line')
  const isLineLike = resolved.type === 'line'
  const isScatter = resolved.type === 'scatter'

  const series = response.data.map((s, idx) => {
    const color = s.color || DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length]
    const base = {
      name: s.parameter,
      type: resolved.type,
      data: s.data.map((point) => point[point.length - 1]), // 末位是该参数值；格式不变
      itemStyle: { color },
    }
    if (isLineLike) {
      base.smooth = true
      base.showSymbol = response.data[0]?.data?.length <= 60
      base.lineStyle = { width: 2, color }
      if (resolved.areaStyle) base.areaStyle = { opacity: 0.2 }
    } else if (isScatter) {
      base.symbolSize = size === 'small' ? 6 : size === 'large' ? 10 : 8
    }
    return base
  })

  const parameters = response.parameter ?? []

  return {
    ...COMMON_CHART_CONFIG,
    // 标题由 ChartWidget 外层 .chart-title 展示，这里不再内嵌 ECharts 标题，避免重复
    tooltip: { trigger: 'axis' },
    legend: {
      show: parameters.length > 1,
      top: responsive.legend?.top ?? 0,
      ...responsive.legend,
    },
    grid: { ...responsive.grid },
    xAxis: {
      // 时序数据多为等间距采样（如 "00:00:00"），本身不含日历日期。
      // 统一用 category 轴：把时间串作为类别标签按索引对齐，避免 time 轴
      // 强加纪元/时区语义（曾导致所有点回落到 1970-01-01 08:00:00 即 epoch 0）。
      // 不设置轴名（单位），保持图表简洁；维度单位（dimensions.unit）不在前端渲染
      type: 'category',
      data: timeAxis,
      // 仅柱状留白，避免柱体贴轴原点；line/area/scatter 维持原 false 观感
      boundaryGap: resolved.type === 'bar',
      axisLabel: { ...responsive.xAxis?.axisLabel },
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...responsive.yAxis?.axisLabel },
    },
    series,
    color: DEFAULT_COLOR_PALETTE,
  }
}

/**
 * 2D 映射图：x=dimensions[0], y=dimensions[1]，两条 type:'value' 轴。
 * series 渲染样式由 style 决定（默认散点），数据格式保持 [x,y] 不变。
 * @param {string|null} [style=null] CHART_STYLE 之一；缺省回落散点
 */
function buildMapping2DOption(response, size, responsive, style = null) {
  const xDim = response.dimensions[0]
  const yDim = response.dimensions[1]

  const resolved = resolveSeriesType(style, 'scatter')
  const isLineLike = resolved.type === 'line'
  const isScatter = resolved.type === 'scatter'

  const series = response.data.map((s, idx) => {
    const color = s.color || DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length]
    const base = {
      name: s.parameter,
      type: resolved.type,
      data: s.data.map((point) => [point[0], point[1]]), // 格式不变
      itemStyle: { color, opacity: 0.7 },
    }
    if (isLineLike) {
      base.showSymbol = response.data[0]?.data?.length <= 60
      base.lineStyle = { width: 2, color }
      if (resolved.areaStyle) base.areaStyle = { opacity: 0.2 }
    } else if (isScatter) {
      base.symbolSize = size === 'small' ? 6 : size === 'large' ? 10 : 8
    }
    return base
  })

  const parameters = response.parameter ?? []

  return {
    ...COMMON_CHART_CONFIG,
    // 标题由 ChartWidget 外层 .chart-title 展示，这里不再内嵌 ECharts 标题，避免重复
    tooltip: {
      trigger: 'item',
      formatter: (p) =>
        `${xDim?.name ?? 'x'}: ${p.value[0]}<br/>${yDim?.name ?? 'y'}: ${p.value[1]}`,
    },
    legend: { show: parameters.length > 1, ...responsive.legend },
    grid: { ...responsive.grid },
    xAxis: {
      type: 'value',
      // 不设置轴名（单位）；维度名仅保留在 tooltip 中作为悬浮提示
      axisLabel: { ...responsive.xAxis?.axisLabel },
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...responsive.yAxis?.axisLabel },
    },
    series,
    color: DEFAULT_COLOR_PALETTE,
  }
}

/** 3D 点云（scatter3D）：依赖 echarts-gl，x/y/z 三轴 */
function buildPointCloud3DOption(response, size) {
  const xDim = response.dimensions[0]
  const yDim = response.dimensions[1]
  const zDim = response.dimensions[2]

  // 合并所有 series 的数据（每条 series 取 x,y,z 三维）。
  // 若存在多个 series，分别构造。
  const series = response.data.map((s, idx) => ({
    type: 'scatter3D',
    name: s.parameter,
    data: s.data.map((point) => [point[0], point[1], point[2]]),
    symbolSize: size === 'small' ? 4 : size === 'large' ? 8 : 6,
    itemStyle: {
      color: s.color || DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length],
      opacity: 0.8,
    },
  }))

  const parameters = response.parameter ?? []

  return {
    ...COMMON_CHART_CONFIG,
    // 标题由 ChartWidget 外层 .chart-title 展示，这里不再内嵌 ECharts 标题，避免重复
    tooltip: {
      formatter: (p) =>
        `${xDim?.name ?? 'x'}: ${p.value[0]}<br/>${yDim?.name ?? 'y'}: ${p.value[1]}<br/>${
          zDim?.name ?? 'z'
        }: ${p.value[2]}`,
    },
    legend: { show: parameters.length > 1, top: 30 },
    // 三轴不设置轴名（单位）；维度名仅保留在 tooltip 中
    xAxis3D: {},
    yAxis3D: {},
    zAxis3D: {},
    grid3D: {
      viewControl: {
        // 默认可拖拽旋转；autoRotate 太晃眼，关闭
        autoRotate: false,
        distance: 200,
      },
      boxWidth: 120,
      boxDepth: 120,
    },
    series,
  }
}

function emptyOption(msg) {
  return {
    ...COMMON_CHART_CONFIG,
    title: { text: msg, left: 'center', top: 'middle', textStyle: { color: '#8c9ab0', fontSize: 14 } },
  }
}
