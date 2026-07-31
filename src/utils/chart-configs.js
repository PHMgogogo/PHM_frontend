// 图表配置生成器

import { colorUtils } from './dashboard-utils.js'

/**
 * ECharts 公共配置
 */
export const COMMON_CHART_CONFIG = {
  animation: true,
  animationDuration: 800,
  animationEasing: 'cubicOut',
  textStyle: {
    fontFamily: 'Microsoft YaHei, Arial, sans-serif'
  },
  backgroundColor: 'transparent'
}

/**
 * 响应式配置
 */
export const RESPONSIVE_CONFIG = {
  small: {
    title: { textStyle: { fontSize: 12 } },
    legend: { textStyle: { fontSize: 10 }, itemWidth: 15, itemHeight: 10 },
    grid: { top: 35, bottom: 25, left: 25, right: 15 },
    xAxis: { axisLabel: { fontSize: 9, rotate: 30 } },
    yAxis: { axisLabel: { fontSize: 9 } }
  },
  medium: {
    title: { textStyle: { fontSize: 14 } },
    legend: { textStyle: { fontSize: 12 }, itemWidth: 20, itemHeight: 12 },
    grid: { top: 45, bottom: 35, left: 35, right: 25 },
    xAxis: { axisLabel: { fontSize: 11 } },
    yAxis: { axisLabel: { fontSize: 11 } }
  },
  large: {
    title: { textStyle: { fontSize: 16 } },
    legend: { textStyle: { fontSize: 14 }, itemWidth: 25, itemHeight: 14 },
    grid: { top: 50, bottom: 40, left: 40, right: 30 },
    xAxis: { axisLabel: { fontSize: 12 } },
    yAxis: { axisLabel: { fontSize: 12 } }
  }
}

/**
 * 默认色彩调色板
 */
export const DEFAULT_COLOR_PALETTE = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#e83c63'
]

/**
 * 主题色彩配置
 */
export const THEME_COLORS = {
  default: DEFAULT_COLOR_PALETTE,
  blue: ['#4285f4', '#34a853', '#fbbc04', '#ea4335', '#673ab7', '#ff5722', '#795548', '#607d8b'],
  green: ['#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ff9800', '#ff5722', '#e91e63', '#9c27b0'],
  purple: ['#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'],
  warm: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8', '#f7dc6f']
}

/**
 * 生成柱状图配置
 */
export function generateBarChartConfig(categoryName, dataSource, size = 'medium', customOptions = {}) {
  const responsive = RESPONSIVE_CONFIG[size] || RESPONSIVE_CONFIG.medium
  
  const config = {
    ...COMMON_CHART_CONFIG,
    title: {
      text: `${categoryName} 销量概览`,
      left: 'center',
      ...responsive.title,
      ...customOptions.title
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: '{b}: {c}',
      ...customOptions.tooltip
    },
    legend: {
      show: false,
      ...responsive.legend,
      ...customOptions.legend
    },
    grid: {
      ...responsive.grid,
      ...customOptions.grid
    },
    xAxis: {
      type: 'category',
      data: dataSource.map(item => item.name),
      axisLabel: {
        interval: 0,
        ...responsive.xAxis?.axisLabel
      },
      axisTick: { alignWithLabel: true },
      ...customOptions.xAxis
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...responsive.yAxis?.axisLabel },
      ...customOptions.yAxis
    },
    series: [{
      name: '销量',
      type: 'bar',
      data: dataSource.map((item) => ({
        value: item.value,
        itemStyle: {
          color: item.name === categoryName 
            ? customOptions.highlightColor || DEFAULT_COLOR_PALETTE[0]
            : customOptions.normalColor || '#cdd5ed'
        }
      })),
      barWidth: size === 'small' ? '60%' : '70%',
      ...customOptions.series
    }],
    color: customOptions.colors || DEFAULT_COLOR_PALETTE
  }
  
  return config
}

/**
 * 生成饼图配置
 */
export function generatePieChartConfig(categoryName, dataSource, size = 'medium', customOptions = {}) {
  const responsive = RESPONSIVE_CONFIG[size] || RESPONSIVE_CONFIG.medium
  
  const radiusMap = {
    small: ['30%', '60%'],
    medium: ['40%', '70%'],
    large: ['45%', '75%']
  }
  
  const config = {
    ...COMMON_CHART_CONFIG,
    title: {
      text: `${categoryName} 销量占比`,
      left: 'center',
      ...responsive.title,
      ...customOptions.title
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)',
      ...customOptions.tooltip
    },
    legend: {
      orient: 'vertical',
      left: size === 'small' ? 'left' : 'right',
      top: 'center',
      ...responsive.legend,
      ...customOptions.legend
    },
    series: [{
      name: '销量',
      type: 'pie',
      radius: radiusMap[size],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 5,
        borderColor: '#fff',
        borderWidth: 2,
        ...customOptions.itemStyle
      },
      label: {
        show: size !== 'small',
        position: 'outside',
        formatter: size === 'large' ? '{b}: {d}%' : '{d}%',
        fontSize: responsive.legend?.textStyle?.fontSize || 12
      },
      labelLine: { show: size !== 'small' },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      },
      data: dataSource.map((item, index) => ({
        name: item.name,
        value: item.value,
        itemStyle: {
          color: item.name === categoryName 
            ? customOptions.highlightColor || DEFAULT_COLOR_PALETTE[index % DEFAULT_COLOR_PALETTE.length]
            : customOptions.normalColor || '#e8e8e8'
        },
        selected: item.name === categoryName,
        ...customOptions.dataItemStyle
      })),
      ...customOptions.series
    }],
    color: customOptions.colors || DEFAULT_COLOR_PALETTE
  }
  
  return config
}

/**
 * 生成折线图配置
 */
export function generateLineChartConfig(categoryName, dataSource, size = 'medium', customOptions = {}) {
  const responsive = RESPONSIVE_CONFIG[size] || RESPONSIVE_CONFIG.medium
  
  const config = {
    ...COMMON_CHART_CONFIG,
    title: {
      text: `${categoryName} 销量趋势`,
      left: 'center',
      ...responsive.title,
      ...customOptions.title
    },
    tooltip: {
      trigger: 'axis',
      ...customOptions.tooltip
    },
    legend: {
      show: false,
      ...responsive.legend,
      ...customOptions.legend
    },
    grid: {
      ...responsive.grid,
      ...customOptions.grid
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dataSource.map(item => item.name),
      axisLabel: { ...responsive.xAxis?.axisLabel },
      ...customOptions.xAxis
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...responsive.yAxis?.axisLabel },
      ...customOptions.yAxis
    },
    series: [{
      name: '销量',
      type: 'line',
      smooth: true,
      data: dataSource.map(item => item.value),
      lineStyle: {
        width: 3,
        color: customOptions.lineColor || DEFAULT_COLOR_PALETTE[0]
      },
      itemStyle: {
        color: customOptions.pointColor || DEFAULT_COLOR_PALETTE[0]
      },
      areaStyle: customOptions.showArea ? {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{
            offset: 0, color: colorUtils.opacity(customOptions.lineColor || DEFAULT_COLOR_PALETTE[0], 0.3)
          }, {
            offset: 1, color: colorUtils.opacity(customOptions.lineColor || DEFAULT_COLOR_PALETTE[0], 0.1)
          }]
        }
      } : null,
      ...customOptions.series
    }],
    color: customOptions.colors || DEFAULT_COLOR_PALETTE
  }
  
  return config
}

/**
 * 生成面积图配置
 */
export function generateAreaChartConfig(categoryName, dataSource, size = 'medium', customOptions = {}) {
  return generateLineChartConfig(categoryName, dataSource, size, {
    ...customOptions,
    showArea: true,
    title: { text: `${categoryName} 销量面积图` }
  })
}

/**
 * 生成散点图配置
 */
export function generateScatterChartConfig(categoryName, dataSource, size = 'medium', customOptions = {}) {
  const responsive = RESPONSIVE_CONFIG[size] || RESPONSIVE_CONFIG.medium
  
  const config = {
    ...COMMON_CHART_CONFIG,
    title: {
      text: `${categoryName} 数据分布`,
      left: 'center',
      ...responsive.title,
      ...customOptions.title
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}',
      ...customOptions.tooltip
    },
    grid: {
      ...responsive.grid,
      ...customOptions.grid
    },
    xAxis: {
      type: 'category',
      data: dataSource.map(item => item.name),
      axisLabel: { ...responsive.xAxis?.axisLabel },
      ...customOptions.xAxis
    },
    yAxis: {
      type: 'value',
      axisLabel: { ...responsive.yAxis?.axisLabel },
      ...customOptions.yAxis
    },
    series: [{
      name: '销量',
      type: 'scatter',
      data: dataSource.map((item, index) => ({
        value: item.value,
        itemStyle: {
          color: item.name === categoryName 
            ? DEFAULT_COLOR_PALETTE[0]
            : DEFAULT_COLOR_PALETTE[index % DEFAULT_COLOR_PALETTE.length]
        }
      })),
      symbolSize: size === 'small' ? 8 : size === 'medium' ? 12 : 16,
      ...customOptions.series
    }],
    color: customOptions.colors || DEFAULT_COLOR_PALETTE
  }
  
  return config
}

/**
 * 通用图表配置生成器
 */
export function generateChartConfig(chartType, categoryName, dataSource, size = 'medium', customOptions = {}) {
  const generators = {
    bar: generateBarChartConfig,
    pie: generatePieChartConfig,
    line: generateLineChartConfig,
    area: generateAreaChartConfig,
    scatter: generateScatterChartConfig
  }
  
  const generator = generators[chartType]
  if (!generator) {
    console.warn(`不支持的图表类型: ${chartType}，使用柱状图作为默认`)
    return generateBarChartConfig(categoryName, dataSource, size, customOptions)
  }
  
  return generator(categoryName, dataSource, size, customOptions)
}

/**
 * 根据数据源获取推荐的图表类型
 */
export function getRecommendedChartType(dataSource) {
  if (!dataSource || dataSource.length === 0) return 'bar'
  const dataLength = dataSource.length
  const hasNegativeValues = dataSource.some(item => item.value < 0)
  if (hasNegativeValues) return 'bar'
  if (dataLength <= 5) return 'pie'
  if (dataLength > 10) return 'bar'
  return 'bar'
}

/**
 * 获取图表预览配置（用于选择器中的小图预览）
 */
export function getChartPreviewConfig(chartType) {
  const previewData = [
    { name: 'A', value: 10 },
    { name: 'B', value: 20 },
    { name: 'C', value: 15 }
  ]
  
  const baseConfig = {
    animation: false,
    title: { show: false },
    legend: { show: false },
    tooltip: { show: false },
    grid: { top: 10, bottom: 10, left: 10, right: 10 }
  }
  
  switch (chartType) {
    case 'pie':
      return {
        ...baseConfig,
        series: [{
          type: 'pie',
          radius: ['30%', '60%'],
          center: ['50%', '50%'],
          data: previewData,
          label: { show: false },
          labelLine: { show: false }
        }]
      }
    case 'line':
      return {
        ...baseConfig,
        xAxis: { type: 'category', data: previewData.map(d => d.name), show: false },
        yAxis: { type: 'value', show: false },
        series: [{
          type: 'line',
          data: previewData.map(d => d.value),
          smooth: true,
          showSymbol: false
        }]
      }
    default:
      return {
        ...baseConfig,
        xAxis: { type: 'category', data: previewData.map(d => d.name), show: false },
        yAxis: { type: 'value', show: false },
        series: [{
          type: 'bar',
          data: previewData.map(d => d.value),
          barWidth: '80%'
        }]
      }
  }
}
