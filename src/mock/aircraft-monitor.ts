/**
 * 飞行器实时监控 Mock 数据
 * 涵盖：运行状态、性能指标、故障诊断、统计数据 四个维度
 */

// 与 src/utils/dashboard-types.js 中的 TOTAL_COLS / TOTAL_ROWS 保持一致
const TOTAL_COLS = 12
const TOTAL_ROWS = 30

// PHM 主题色板
const COLOR_PRIMARY = '#3b7cff'
const COLOR_TEAL = '#36c4a0'
const COLOR_AMBER = '#f5a623'
const COLOR_DANGER = '#f56c6c'
const COLOR_PURPLE = '#8b5cf6'
const COLOR_MUTED = '#bcc5d0'

const CHART_COLORS = [COLOR_PRIMARY, COLOR_TEAL, COLOR_AMBER, COLOR_DANGER, COLOR_PURPLE]

// ─── 1. 发动机转速趋势（折线图，多飞行器） ───
const engineRpmOption = {
  animation: true,
  backgroundColor: 'transparent',
  title: {
    text: '发动机转速趋势',
    left: 'center',
    textStyle: { fontSize: 13, fontWeight: 600, color: '#0d1f3c' }
  },
  tooltip: {
    trigger: 'axis',
    formatter: (params: any[]) =>
      params[0].axisValue + '<br/>' +
      params.map((p: any) => `${p.marker}${p.seriesName}: <b>${p.value} RPM</b>`).join('<br/>')
  },
  legend: {
    bottom: 4,
    textStyle: { fontSize: 11, color: '#8c9ab0' },
    itemWidth: 16,
    itemHeight: 8
  },
  grid: { top: 44, bottom: 40, left: 52, right: 16 },
  xAxis: {
    type: 'category',
    data: ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00'],
    axisLabel: { fontSize: 11, color: '#8c9ab0' },
    axisLine: { lineStyle: { color: '#e4e8f1' } }
  },
  yAxis: {
    type: 'value',
    name: 'RPM',
    nameTextStyle: { fontSize: 10, color: '#8c9ab0' },
    axisLabel: { fontSize: 10, color: '#8c9ab0' },
    splitLine: { lineStyle: { color: '#f0f3f8' } }
  },
  series: [
    {
      name: 'J-20A',
      type: 'line',
      smooth: true,
      data: [2100, 2350, 2600, 2800, 2650, 2750, 2900],
      lineStyle: { width: 2, color: COLOR_PRIMARY },
      itemStyle: { color: COLOR_PRIMARY },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,124,255,0.15)' }, { offset: 1, color: 'rgba(59,124,255,0)' }] } }
    },
    {
      name: 'J-20B',
      type: 'line',
      smooth: true,
      data: [1950, 2100, 2300, 2450, 2500, 2600, 2700],
      lineStyle: { width: 2, color: COLOR_TEAL },
      itemStyle: { color: COLOR_TEAL }
    },
    {
      name: 'FC-1',
      type: 'line',
      smooth: true,
      data: [1800, 2000, 2100, 2200, 2300, 2250, 2400],
      lineStyle: { width: 2, color: COLOR_AMBER },
      itemStyle: { color: COLOR_AMBER }
    }
  ]
}

// ─── 2. 燃油消耗对比（柱状图） ───
const fuelConsumptionOption = {
  animation: true,
  backgroundColor: 'transparent',
  title: {
    text: '燃油消耗对比',
    left: 'center',
    textStyle: { fontSize: 13, fontWeight: 600, color: '#0d1f3c' }
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: any[]) =>
      `${params[0].axisValue}<br/>${params[0].marker}消耗量: <b>${params[0].value} kg/h</b>`
  },
  grid: { top: 44, bottom: 30, left: 55, right: 16 },
  xAxis: {
    type: 'category',
    data: ['J-20A', 'J-20B', 'FC-1', 'H-6K', 'Y-20'],
    axisLabel: { fontSize: 11, color: '#8c9ab0' },
    axisLine: { lineStyle: { color: '#e4e8f1' } }
  },
  yAxis: {
    type: 'value',
    name: 'kg/h',
    nameTextStyle: { fontSize: 10, color: '#8c9ab0' },
    axisLabel: { fontSize: 10, color: '#8c9ab0' },
    splitLine: { lineStyle: { color: '#f0f3f8' } }
  },
  series: [{
    type: 'bar',
    data: [
      { value: 3200, itemStyle: { color: COLOR_PRIMARY, borderRadius: [4, 4, 0, 0] } },
      { value: 3050, itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } },
      { value: 1850, itemStyle: { color: COLOR_AMBER, borderRadius: [4, 4, 0, 0] } },
      { value: 5400, itemStyle: { color: COLOR_DANGER, borderRadius: [4, 4, 0, 0] } },
      { value: 7800, itemStyle: { color: COLOR_PURPLE, borderRadius: [4, 4, 0, 0] } }
    ],
    barWidth: '50%'
  }]
}

// ─── 3. 发动机温度监控（柱状图，带预警色） ───
const engineTempOption = {
  animation: true,
  backgroundColor: 'transparent',
  title: {
    text: '发动机温度监控',
    left: 'center',
    textStyle: { fontSize: 13, fontWeight: 600, color: '#0d1f3c' }
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: any[]) =>
      `${params[0].axisValue}<br/>${params[0].marker}温度: <b>${params[0].value}°C</b>`
  },
  grid: { top: 44, bottom: 30, left: 55, right: 16 },
  xAxis: {
    type: 'category',
    data: ['J-20A', 'J-20B', 'FC-1', 'H-6K'],
    axisLabel: { fontSize: 11, color: '#8c9ab0' },
    axisLine: { lineStyle: { color: '#e4e8f1' } }
  },
  yAxis: {
    type: 'value',
    name: '°C',
    min: 600,
    max: 1300,
    nameTextStyle: { fontSize: 10, color: '#8c9ab0' },
    axisLabel: { fontSize: 10, color: '#8c9ab0' },
    splitLine: { lineStyle: { color: '#f0f3f8' } }
  },
  series: [{
    type: 'bar',
    data: [
      { value: 980,  itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } },   // 正常
      { value: 1050, itemStyle: { color: COLOR_AMBER, borderRadius: [4, 4, 0, 0] } },  // 偏高
      { value: 890,  itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } },   // 正常
      { value: 1180, itemStyle: { color: COLOR_DANGER, borderRadius: [4, 4, 0, 0] } }  // 告警
    ],
    barWidth: '50%',
    markLine: {
      silent: true,
      data: [{ yAxis: 1100, lineStyle: { color: COLOR_DANGER, type: 'dashed' }, label: { formatter: '告警阈值 1100°C', color: COLOR_DANGER, fontSize: 10 } }]
    }
  }]
}

// ─── 4. 飞行高度与速度（折线图，双 Y 轴） ───
const altSpeedOption = {
  animation: true,
  backgroundColor: 'transparent',
  title: {
    text: '飞行高度与速度',
    left: 'center',
    textStyle: { fontSize: 13, fontWeight: 600, color: '#0d1f3c' }
  },
  tooltip: { trigger: 'axis' },
  legend: {
    bottom: 4,
    textStyle: { fontSize: 11, color: '#8c9ab0' },
    itemWidth: 16,
    itemHeight: 8
  },
  grid: { top: 44, bottom: 40, left: 60, right: 60 },
  xAxis: {
    type: 'category',
    data: ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00'],
    axisLabel: { fontSize: 11, color: '#8c9ab0' },
    axisLine: { lineStyle: { color: '#e4e8f1' } }
  },
  yAxis: [
    {
      type: 'value',
      name: '高度 (m)',
      nameTextStyle: { fontSize: 10, color: COLOR_PRIMARY },
      axisLabel: { fontSize: 10, color: COLOR_PRIMARY },
      splitLine: { lineStyle: { color: '#f0f3f8' } }
    },
    {
      type: 'value',
      name: '速度 (km/h)',
      nameTextStyle: { fontSize: 10, color: COLOR_AMBER },
      axisLabel: { fontSize: 10, color: COLOR_AMBER },
      splitLine: { show: false }
    }
  ],
  series: [
    {
      name: '飞行高度',
      type: 'line',
      smooth: true,
      yAxisIndex: 0,
      data: [0, 4500, 8000, 10000, 9500, 6000],
      lineStyle: { width: 2.5, color: COLOR_PRIMARY },
      itemStyle: { color: COLOR_PRIMARY },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,124,255,0.12)' }, { offset: 1, color: 'rgba(59,124,255,0)' }] } }
    },
    {
      name: '飞行速度',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      data: [0, 600, 1200, 1500, 1400, 900],
      lineStyle: { width: 2.5, color: COLOR_AMBER },
      itemStyle: { color: COLOR_AMBER }
    }
  ]
}

// ─── 5. 故障类型分布（饼图） ───
const faultDistOption = {
  animation: true,
  backgroundColor: 'transparent',
  title: {
    text: '故障类型分布',
    left: 'center',
    textStyle: { fontSize: 13, fontWeight: 600, color: '#0d1f3c' }
  },
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c}次 ({d}%)'
  },
  legend: {
    bottom: 4,
    textStyle: { fontSize: 10, color: '#8c9ab0' },
    itemWidth: 12,
    itemHeight: 8
  },
  series: [{
    type: 'pie',
    radius: ['35%', '62%'],
    center: ['50%', '46%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    labelLine: { show: false },
    emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
    data: [
      { name: '液压系统', value: 12, itemStyle: { color: COLOR_PRIMARY } },
      { name: '电气故障', value: 8,  itemStyle: { color: COLOR_TEAL } },
      { name: '发动机',   value: 15, itemStyle: { color: COLOR_DANGER } },
      { name: '导航系统', value: 6,  itemStyle: { color: COLOR_AMBER } },
      { name: '结构损伤', value: 4,  itemStyle: { color: COLOR_PURPLE } }
    ]
  }]
}

// ─── 6. 年度飞行时数统计（柱状图） ───
const flightHoursOption = {
  animation: true,
  backgroundColor: 'transparent',
  title: {
    text: '年度飞行时数',
    left: 'center',
    textStyle: { fontSize: 13, fontWeight: 600, color: '#0d1f3c' }
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: any[]) =>
      `${params[0].axisValue}<br/>${params[0].marker}飞行时数: <b>${params[0].value} h</b>`
  },
  grid: { top: 44, bottom: 30, left: 50, right: 16 },
  xAxis: {
    type: 'category',
    data: ['J-20A', 'J-20B', 'FC-1', 'H-6K', 'Y-20'],
    axisLabel: { fontSize: 11, color: '#8c9ab0' },
    axisLine: { lineStyle: { color: '#e4e8f1' } }
  },
  yAxis: {
    type: 'value',
    name: '时数 (h)',
    nameTextStyle: { fontSize: 10, color: '#8c9ab0' },
    axisLabel: { fontSize: 10, color: '#8c9ab0' },
    splitLine: { lineStyle: { color: '#f0f3f8' } }
  },
  series: [{
    type: 'bar',
    data: [
      { value: 320, itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } },
      { value: 280, itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } },
      { value: 410, itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } },
      { value: 190, itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } },
      { value: 230, itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } }
    ],
    barWidth: '50%'
  }]
}

// ─── 7. 任务完成率（饼图） ───
const taskCompletionOption = {
  animation: true,
  backgroundColor: 'transparent',
  title: {
    text: '任务完成率',
    left: 'center',
    textStyle: { fontSize: 13, fontWeight: 600, color: '#0d1f3c' }
  },
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c} ({d}%)'
  },
  legend: {
    bottom: 4,
    textStyle: { fontSize: 10, color: '#8c9ab0' },
    itemWidth: 12,
    itemHeight: 8
  },
  series: [{
    type: 'pie',
    radius: ['35%', '62%'],
    center: ['50%', '46%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    labelLine: { show: false },
    emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
    data: [
      { name: '已完成', value: 87, itemStyle: { color: COLOR_TEAL } },
      { name: '进行中', value: 8,  itemStyle: { color: COLOR_PRIMARY } },
      { name: '已取消', value: 3,  itemStyle: { color: COLOR_DANGER } },
      { name: '未开始', value: 2,  itemStyle: { color: COLOR_MUTED } }
    ]
  }]
}

// ─── 8. 距下次维护天数（柱状图，预警着色） ───
const maintenanceOption = {
  animation: true,
  backgroundColor: 'transparent',
  title: {
    text: '距下次维护天数',
    left: 'center',
    textStyle: { fontSize: 13, fontWeight: 600, color: '#0d1f3c' }
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: any[]) =>
      `${params[0].axisValue}<br/>${params[0].marker}剩余: <b>${params[0].value} 天</b>`
  },
  grid: { top: 44, bottom: 30, left: 50, right: 16 },
  xAxis: {
    type: 'category',
    data: ['J-20A', 'J-20B', 'FC-1', 'H-6K', 'Y-20'],
    axisLabel: { fontSize: 11, color: '#8c9ab0' },
    axisLine: { lineStyle: { color: '#e4e8f1' } }
  },
  yAxis: {
    type: 'value',
    name: '天数',
    nameTextStyle: { fontSize: 10, color: '#8c9ab0' },
    axisLabel: { fontSize: 10, color: '#8c9ab0' },
    splitLine: { lineStyle: { color: '#f0f3f8' } }
  },
  series: [{
    type: 'bar',
    data: [
      { value: 15, itemStyle: { color: COLOR_DANGER, borderRadius: [4, 4, 0, 0] } },   // 紧急
      { value: 42, itemStyle: { color: COLOR_AMBER, borderRadius: [4, 4, 0, 0] } },    // 警告
      { value: 78, itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } },     // 正常
      { value: 30, itemStyle: { color: COLOR_AMBER, borderRadius: [4, 4, 0, 0] } },    // 警告
      { value: 95, itemStyle: { color: COLOR_TEAL, borderRadius: [4, 4, 0, 0] } }      // 正常
    ],
    barWidth: '50%',
    markLine: {
      silent: true,
      data: [{ yAxis: 30, lineStyle: { color: COLOR_AMBER, type: 'dashed' }, label: { formatter: '预警线 30天', color: COLOR_AMBER, fontSize: 10 } }]
    }
  }]
}

/**
 * 预设仪表盘布局（12列 × 30行网格）
 * Row 1 (y=0,  h=10): 发动机转速(w=7) | 燃油消耗(w=5)
 * Row 2 (y=10, h=10): 发动机温度(w=5) | 飞行高度速度(w=7)
 * Row 3 (y=20, h=10): 故障分布(w=3) | 飞行时数(w=3) | 任务完成(w=3) | 维护周期(w=3)
 */
export const monitorInitialLayout = [
  {
    i: 'chart-1',
    x: 0, y: 0, w: 7, h: 10,
    option: engineRpmOption,
    title: '发动机转速趋势',
    type: 'line',
    static: false
  },
  {
    i: 'chart-2',
    x: 7, y: 0, w: 5, h: 10,
    option: fuelConsumptionOption,
    title: '燃油消耗对比',
    type: 'bar',
    static: false
  },
  {
    i: 'chart-3',
    x: 0, y: 10, w: 5, h: 10,
    option: engineTempOption,
    title: '发动机温度监控',
    type: 'bar',
    static: false
  },
  {
    i: 'chart-4',
    x: 5, y: 10, w: 7, h: 10,
    option: altSpeedOption,
    title: '飞行高度与速度',
    type: 'line',
    static: false
  },
  {
    i: 'chart-5',
    x: 0, y: 20, w: 3, h: 10,
    option: faultDistOption,
    title: '故障类型分布',
    type: 'pie',
    static: false
  },
  {
    i: 'chart-6',
    x: 3, y: 20, w: 3, h: 10,
    option: flightHoursOption,
    title: '年度飞行时数',
    type: 'bar',
    static: false
  },
  {
    i: 'chart-7',
    x: 6, y: 20, w: 3, h: 10,
    option: taskCompletionOption,
    title: '任务完成率',
    type: 'pie',
    static: false
  },
  {
    i: 'chart-8',
    x: 9, y: 20, w: 3, h: 10,
    option: maintenanceOption,
    title: '维护周期状态',
    type: 'bar',
    static: false
  }
]

/**
 * 仪表盘组件配置（半编辑模式：无控制面板，允许拖拽/调整大小）
 */
export const monitorDashboardConfig = {
  dataSource: [],
  chartTypes: [
    { value: 'bar', label: '柱状图' },
    { value: 'pie', label: '饼图' },
    { value: 'line', label: '折线图' }
  ],
  sizes: [
    { value: 'small',  label: '小', w: 3, h: 10 },
    { value: 'medium', label: '中', w: 6, h: 10 },
    { value: 'large',  label: '大', w: 9, h: 10 }
  ],
  layout: {
    cols: TOTAL_COLS,
    totalRows: TOTAL_ROWS,
    margin: [12, 12],
    containerPadding: [16, 16]
  },
  controlPanel: {
    enabled: false  // 半编辑模式：不显示"添加图表"控制面板
  }
}
