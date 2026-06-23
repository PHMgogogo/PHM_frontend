// 故障预测 Mock 数据

// 有寿件使用信息监控
export const lifeLimitedPartsData: Record<string, any[]> = {
  P001: [
    { id: 'LLP001', name: '涡扇发动机', model: 'WS-XX', totalLife: 2000, usedLife: 1245, remainLife: 755, unit: '飞行小时', warnThreshold: 300, status: 'normal' },
    { id: 'LLP002', name: '主起落架', model: 'LG-A型', totalLife: 3000, usedLife: 2650, remainLife: 350, unit: '起落次数', warnThreshold: 400, status: 'warning' },
    { id: 'LLP003', name: '弹射座椅火工品', model: 'EJ-XX', totalLife: 5, usedLife: 0, remainLife: 5, unit: '年', warnThreshold: 1, status: 'normal' },
    { id: 'LLP004', name: '液压泵', model: 'HP-3型', totalLife: 1500, usedLife: 1380, remainLife: 120, unit: '飞行小时', warnThreshold: 200, status: 'warning' },
    { id: 'LLP005', name: '主油泵', model: 'FP-2型', totalLife: 1800, usedLife: 980, remainLife: 820, unit: '飞行小时', warnThreshold: 300, status: 'normal' },
  ],
  P002: [
    { id: 'LLP006', name: '涡扇发动机', model: 'WS-XX', totalLife: 2000, usedLife: 1180, remainLife: 820, unit: '飞行小时', warnThreshold: 300, status: 'normal' },
    { id: 'LLP007', name: '主起落架', model: 'LG-A型', totalLife: 3000, usedLife: 2850, remainLife: 150, unit: '起落次数', warnThreshold: 400, status: 'warning' },
    { id: 'LLP008', name: '液压泵', model: 'HP-3型', totalLife: 1500, usedLife: 1450, remainLife: 50, unit: '飞行小时', warnThreshold: 200, status: 'fault' },
  ],
  P004: [
    { id: 'LLP009', name: '涡扇发动机', model: 'WS-XX', totalLife: 2000, usedLife: 890, remainLife: 1110, unit: '飞行小时', warnThreshold: 300, status: 'normal' },
    { id: 'LLP010', name: '燃油传感器', model: 'FS-A型', totalLife: 1200, usedLife: 875, remainLife: 325, unit: '飞行小时', warnThreshold: 400, status: 'warning' },
  ],
}

// 机体结构寿命监控
export const structureLifeData: Record<string, any[]> = {
  P001: [
    { id: 'SL001', part: '机翼根部', totalLife: 6000, usedLife: 3120, unit: '等效飞行小时', consumeRate: 0.98 },
    { id: 'SL002', part: '机身中段', totalLife: 6000, usedLife: 3050, unit: '等效飞行小时', consumeRate: 0.96 },
    { id: 'SL003', part: '尾翼', totalLife: 5000, usedLife: 2900, unit: '等效飞行小时', consumeRate: 0.94 },
    { id: 'SL004', part: '进气道结构', totalLife: 4000, usedLife: 2210, unit: '等效飞行小时', consumeRate: 0.88 },
  ],
  P002: [
    { id: 'SL005', part: '机翼根部', totalLife: 6000, usedLife: 2870, unit: '等效飞行小时', consumeRate: 0.95 },
    { id: 'SL006', part: '机身中段', totalLife: 6000, usedLife: 2790, unit: '等效飞行小时', consumeRate: 0.93 },
  ],
}

// 设备故障预测（基于趋势预测剩余寿命）
export const deviceFaultPrediction: Record<string, any[]> = {
  P001: [
    {
      id: 'FP001',
      device: '2号液压泵',
      system: '液压系统',
      currentHealth: 72,
      predictedFaultSortie: 18,
      confidence: 85,
      basis: '基于近20架次液压压力下降趋势，拟合预测约第18架次后液压压力将降至告警阈值以下',
      riskLevel: 'medium',
    },
    {
      id: 'FP002',
      device: '主起落架',
      system: '起落架系统',
      currentHealth: 65,
      predictedFaultSortie: 50,
      confidence: 78,
      basis: '基于起落架使用寿命（当前剩余350次起落），预测约50架次后超出使用限制',
      riskLevel: 'medium',
    },
  ],
  P002: [
    {
      id: 'FP003',
      device: '2号液压泵',
      system: '液压系统',
      currentHealth: 45,
      predictedFaultSortie: 5,
      confidence: 92,
      basis: '液压泵已接近寿命上限（当前50小时/剩余），结合压力下降趋势，预测约5架次内发生故障',
      riskLevel: 'high',
    },
    {
      id: 'FP004',
      device: '主起落架',
      system: '起落架系统',
      currentHealth: 55,
      predictedFaultSortie: 8,
      confidence: 88,
      basis: '主起落架剩余寿命仅150次起落，预测约8架次后超出使用限制',
      riskLevel: 'high',
    },
  ],
}

// 寿命消耗统计（用于饼/柱状图）
export const lifeConsumeStats: Record<string, any> = {
  P001: {
    systems: ['发动机', '起落架', '液压系统', '燃油系统', '飞控系统', '电源系统'],
    consumePercent: [62.3, 88.3, 78.5, 54.4, 45.2, 38.6],
  },
  P002: {
    systems: ['发动机', '起落架', '液压系统', '燃油系统', '飞控系统', '电源系统'],
    consumePercent: [59.0, 95.0, 92.5, 48.2, 42.8, 35.1],
  },
  P003: {
    systems: ['发动机', '起落架', '液压系统', '燃油系统', '飞控系统', '电源系统'],
    consumePercent: [38.5, 52.1, 41.2, 35.8, 30.5, 28.4],
  },
  P004: {
    systems: ['发动机', '起落架', '液压系统', '燃油系统', '飞控系统', '电源系统'],
    consumePercent: [44.5, 63.2, 55.0, 72.9, 38.5, 30.2],
  },
}
