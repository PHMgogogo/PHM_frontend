// 图表数据展示选项构造器
// 把 POST /api/display 的序列式响应（{dimensions, parameter, data}）
// 按 type 转成 ECharts option。与 chart-configs.js 风格保持一致。

import { COMMON_CHART_CONFIG, DEFAULT_COLOR_PALETTE, RESPONSIVE_CONFIG } from '../../utils/chart-configs.js'
import { DISPLAY_TYPE } from '../../api/display.js'

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

/** 生成图表标题：用参数名拼接 */
function buildTitle(parameters) {
  if (!parameters || parameters.length === 0) return '数据展示'
  if (parameters.length === 1) return parameters[0]
  return parameters.slice(0, 3).join(' / ') + (parameters.length > 3 ? ' …' : '')
}

/**
 * 把 DisplayResponse 转成 ECharts option。
 * @param {string} displayType DISPLAY_TYPE 之一
 * @param {import('../../api/display').DisplayResponse} response
 * @param {string} [size='medium'] 'small' | 'medium' | 'large'
 * @returns {object} ECharts option
 */
export function buildDisplayOption(displayType, response, size = 'medium') {
  if (!response || !Array.isArray(response.dimensions) || !Array.isArray(response.data)) {
    return emptyOption('无数据')
  }

  const responsive = RESPONSIVE_CONFIG[size] || RESPONSIVE_CONFIG.medium

  switch (displayType) {
    case DISPLAY_TYPE.SINGLE_TIMESERIES_2D:
    case DISPLAY_TYPE.MULTI_TIMESERIES_2D:
      return buildTimeseriesOption(response, size, responsive)
    case DISPLAY_TYPE.MAPPING_2D:
      return buildMapping2DOption(response, size, responsive)
    case DISPLAY_TYPE.POINT_CLOUD_3D:
      return buildPointCloud3DOption(response, size)
    default:
      return emptyOption(`不支持的类型: ${displayType}`)
  }
}

/** 2D 时序图（line）：x 轴为 dimensions[0]（时间），每条 series 对应一个 parameter */
function buildTimeseriesOption(response, size, responsive) {
  const timeDim = response.dimensions[0]
  // 时间轴数据：取第一条 series 的每个点的第 0 维（各 series 共享时间轴）
  const timeAxis = response.data[0]?.data?.map((point) => point[0]) ?? []

  const series = response.data.map((s, idx) => ({
    name: s.parameter,
    type: 'line',
    smooth: true,
    showSymbol: response.data[0]?.data?.length <= 60,
    data: s.data.map((point) => point[point.length - 1]), // 末位是该参数值
    lineStyle: { width: 2, color: s.color || DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length] },
    itemStyle: { color: s.color || DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length] },
  }))

  const parameters = response.parameter ?? []

  return {
    ...COMMON_CHART_CONFIG,
    title: { text: buildTitle(parameters), left: 'center', ...responsive.title },
    tooltip: { trigger: 'axis' },
    legend: {
      show: parameters.length > 1,
      top: responsive.legend?.top ?? 0,
      ...responsive.legend,
    },
    grid: { ...responsive.grid },
    xAxis: {
      type: timeDim?.unit === 'time' ? 'time' : 'category',
      name: timeDim?.name ?? '',
      data: timeDim?.unit === 'time' ? undefined : timeAxis,
      boundaryGap: false,
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

/** 2D 映射图（scatter）：x=dimensions[0], y=dimensions[1] */
function buildMapping2DOption(response, size, responsive) {
  const xDim = response.dimensions[0]
  const yDim = response.dimensions[1]

  const series = response.data.map((s, idx) => ({
    name: s.parameter,
    type: 'scatter',
    data: s.data.map((point) => [point[0], point[1]]),
    symbolSize: size === 'small' ? 6 : size === 'large' ? 10 : 8,
    itemStyle: { color: s.color || DEFAULT_COLOR_PALETTE[idx % DEFAULT_COLOR_PALETTE.length], opacity: 0.7 },
  }))

  const parameters = response.parameter ?? []

  return {
    ...COMMON_CHART_CONFIG,
    title: { text: buildTitle(parameters), left: 'center', ...responsive.title },
    tooltip: {
      trigger: 'item',
      formatter: (p) =>
        `${xDim?.name ?? 'x'}: ${p.value[0]}<br/>${yDim?.name ?? 'y'}: ${p.value[1]}`,
    },
    legend: { show: parameters.length > 1, ...responsive.legend },
    grid: { ...responsive.grid },
    xAxis: {
      type: 'value',
      name: xDim?.name ?? '',
      nameLocation: 'middle',
      nameGap: 28,
      axisLabel: { ...responsive.xAxis?.axisLabel },
    },
    yAxis: {
      type: 'value',
      name: yDim?.name ?? '',
      nameLocation: 'middle',
      nameGap: 36,
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
    title: { text: buildTitle(parameters), left: 'center' },
    tooltip: {
      formatter: (p) =>
        `${xDim?.name ?? 'x'}: ${p.value[0]}<br/>${yDim?.name ?? 'y'}: ${p.value[1]}<br/>${
          zDim?.name ?? 'z'
        }: ${p.value[2]}`,
    },
    legend: { show: parameters.length > 1, top: 30 },
    xAxis3D: { name: xDim?.name ?? 'x' },
    yAxis3D: { name: yDim?.name ?? 'y' },
    zAxis3D: { name: zDim?.name ?? 'z' },
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
