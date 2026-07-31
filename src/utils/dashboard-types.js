// 仪表盘相关类型定义和常量

/**
 * 布局网格固定尺寸
 */
export const TOTAL_COLS = 12
export const TOTAL_ROWS = 30

/**
 * 数据源项目结构
 */
export const ChartDataItem = {
  name: String,
  value: Number,
  // 可选的额外属性
  color: String,
  category: String
}

/**
 * 图表类型配置
 */
export const CHART_TYPES = {
  BAR: 'bar',
  PIE: 'pie',
  LINE: 'line',
  AREA: 'area',
  SCATTER: 'scatter'
}

/**
 * 预定义尺寸配置
 */
export const DEFAULT_SIZES = {
  SMALL: { value: 'small', label: '小', w: 3, h: 6 },
  MEDIUM: { value: 'medium', label: '中', w: 6, h: 12 },
  LARGE: { value: 'large', label: '大', w: 10, h: 20 },
  EXTRA_LARGE: { value: 'xl', label: '超大', w: TOTAL_COLS, h: TOTAL_ROWS }
}

/**
 * 默认布局配置
 */
export const DEFAULT_LAYOUT_CONFIG = {
  cols: TOTAL_COLS,
  totalRows: TOTAL_ROWS,
  margin: [10, 10],
  containerPadding: [20, 20],
  rowHeight: 30
}

/**
 * 默认控制面板配置
 */
export const DEFAULT_CONTROL_PANEL_CONFIG = {
  enabled: true,
  title: '仪表盘控制中心',
  height: '20%',
  showOptimizeButton: true,
  showSizeSelector: true,
  showTypeSelector: true,
  showDataSelector: true
}

/**
 * 仪表盘配置接口
 */
export const DashboardConfigSchema = {
  // 数据源
  dataSource: [],
  
  // 图表类型选项
  chartTypes: [
    { value: 'bar', label: '柱状图' },
    { value: 'pie', label: '饼图' }
  ],
  
  // 尺寸选项
  sizes: Object.values(DEFAULT_SIZES),
  
  // 布局配置
  layout: DEFAULT_LAYOUT_CONFIG,
  
  // 控制面板配置
  controlPanel: DEFAULT_CONTROL_PANEL_CONFIG,
  
  // 自定义图表配置生成器
  chartConfigGenerator: null,
  
  // 主题配置
  theme: {
    primaryColor: '#409eff',
    successColor: '#67c23a',
    warningColor: '#e6a23c',
    dangerColor: '#f56c6c'
  }
}

/**
 * 布局项目结构
 */
export const LayoutItemSchema = {
  i: String,        // 唯一标识
  x: Number,        // X 坐标
  y: Number,        // Y 坐标
  w: Number,        // 宽度（网格单位）
  h: Number,        // 高度（网格单位）
  option: Object,   // ECharts 配置
  type: String,     // 图表类型
  category: String, // 数据类别
  title: String,    // 图表标题
  static: Boolean,  // 是否静态（不可拖拽调整）
  minW: Number,     // 最小宽度
  minH: Number,     // 最小高度
  maxW: Number,     // 最大宽度
  maxH: Number      // 最大高度
}

/**
 * 验证配置项
 */
export function validateDashboardConfig(config) {
  const errors = []
  
  if (!config) {
    errors.push('配置对象不能为空')
    return errors
  }
  
  if (!Array.isArray(config.dataSource)) {
    errors.push('dataSource 必须是数组')
  }
  
  if (!Array.isArray(config.chartTypes) || config.chartTypes.length === 0) {
    errors.push('chartTypes 必须是非空数组')
  }
  
  if (!Array.isArray(config.sizes) || config.sizes.length === 0) {
    errors.push('sizes 必须是非空数组')
  }
  
  if (!config.layout || typeof config.layout !== 'object') {
    errors.push('layout 必须是对象')
  } else {
    if (typeof config.layout.cols !== 'number' || config.layout.cols <= 0) {
      errors.push('layout.cols 必须是正数')
    }
    if (typeof config.layout.totalRows !== 'number' || config.layout.totalRows <= 0) {
      errors.push('layout.totalRows 必须是正数')
    }
  }
  
  return errors
}

/**
 * 为配置项设置默认值
 */
export function setDefaultConfig(config = {}) {
  return {
    dataSource: config.dataSource || [],
    chartTypes: config.chartTypes || [
      { value: 'bar', label: '柱状图' },
      { value: 'pie', label: '饼图' }
    ],
    sizes: config.sizes || Object.values(DEFAULT_SIZES),
    layout: { ...DEFAULT_LAYOUT_CONFIG, ...config.layout },
    controlPanel: { ...DEFAULT_CONTROL_PANEL_CONFIG, ...config.controlPanel },
    chartConfigGenerator: config.chartConfigGenerator || null,
    theme: { 
      primaryColor: '#409eff',
      successColor: '#67c23a',
      warningColor: '#e6a23c',
      dangerColor: '#f56c6c',
      ...config.theme 
    }
  }
}

/**
 * 事件类型常量
 */
export const DASHBOARD_EVENTS = {
  ITEM_ADDED: 'item-added',
  ITEM_DELETED: 'item-deleted',
  LAYOUT_CHANGED: 'layout-changed',
  LAYOUT_OPTIMIZED: 'layout-optimized',
  CONFIG_CHANGED: 'config-changed',
  CHART_CLICKED: 'chart-clicked'
}
