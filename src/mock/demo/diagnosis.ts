// 增强诊断 Mock 数据

// 飞行架次列表
export const sortieList = [
  { id: 'S20260308001', planeId: 'P001', date: '2026-03-08', engineModel: 'WS-XX', sortieName: '第312架次', startTime: '08:15:00', endTime: '10:42:00', flightHours: 2.45 },
  { id: 'S20260307001', planeId: 'P001', date: '2026-03-07', engineModel: 'WS-XX', sortieName: '第311架次', startTime: '09:30:00', endTime: '11:55:00', flightHours: 2.42 },
  { id: 'S20260306001', planeId: 'P001', date: '2026-03-06', engineModel: 'WS-XX', sortieName: '第310架次', startTime: '14:00:00', endTime: '16:10:00', flightHours: 2.17 },
  { id: 'S20260308002', planeId: 'P002', date: '2026-03-08', engineModel: 'WS-XX', sortieName: '第287架次', startTime: '07:50:00', endTime: '10:05:00', flightHours: 2.25 },
  { id: 'S20260307002', planeId: 'P002', date: '2026-03-07', engineModel: 'WS-XX', sortieName: '第286架次', startTime: '08:00:00', endTime: '10:20:00', flightHours: 2.33 },
  { id: 'S20260308003', planeId: 'P004', date: '2026-03-08', engineModel: 'WS-XX', sortieName: '第210架次', startTime: '06:30:00', endTime: '08:15:00', flightHours: 1.75 },
]

// 飞参判读结果（每个架次触发的事件列表）
export const flightParamEvents: Record<string, any[]> = {
  S20260308001: [
    { id: 'E001', code: 'FP-ENG-001', name: '发动机超温提示', type: '提示', system: '发动机', time: '08:52:13', duration: 45 },
    { id: 'E002', code: 'FP-HYD-002', name: '液压压力低告警', type: '告警', system: '液压系统', time: '09:10:05', duration: 12 },
    { id: 'E003', code: 'FP-ENG-003', name: '发动机振动超限', type: '使用限制', system: '发动机', time: '09:45:30', duration: 28 },
  ],
  S20260307001: [
    { id: 'E004', code: 'FP-FUEL-001', name: '燃油消耗偏大提示', type: '提示', system: '燃油系统', time: '10:05:20', duration: 60 },
  ],
  S20260306001: [
    { id: 'E005', code: 'FP-PWR-001', name: '电源电压波动告警', type: '告警', system: '供电系统', time: '14:38:45', duration: 8 },
    { id: 'E006', code: 'FP-CTRL-001', name: '飞控系统自检异常', type: '设备故障', system: '飞行控制', time: '15:12:10', duration: 15 },
  ],
  S20260308002: [
    { id: 'E007', code: 'FP-HYD-002', name: '2号液压压力偏低', type: '告警', system: '液压系统', time: '08:22:33', duration: 300 },
    { id: 'E008', code: 'FP-HYD-003', name: '液压系统渗漏提示', type: '提示', system: '液压系统', time: '09:15:00', duration: 120 },
  ],
  S20260307002: [
    { id: 'E009', code: 'FP-ENG-002', name: '发动机转速异常', type: '使用限制', system: '发动机', time: '08:55:22', duration: 35 },
  ],
  S20260308003: [
    { id: 'E010', code: 'FP-FUEL-002', name: '燃油传感器信号异常', type: '设备故障', system: '燃油系统', time: '06:58:14', duration: 3600 },
    { id: 'E011', code: 'FP-EO-001', name: '光电系统通信中断', type: '设备故障', system: '光电探测', time: '07:05:00', duration: 2500 },
  ],
}

// 生成模拟时序数据
function genTimeSeries(baseVal: number, noise: number, count = 60) {
  return Array.from({ length: count }, (_, i) => ({
    t: i,
    v: +(baseVal + (Math.random() - 0.5) * noise * 2).toFixed(2),
  }))
}

// 事件对应的参数时序数据
export const eventTimeSeriesData: Record<string, any> = {
  'E001': {
    params: ['发动机出口温度(℃)', '涡轮前温度(℃)'],
    series: {
      '发动机出口温度(℃)': genTimeSeries(685, 20),
      '涡轮前温度(℃)': genTimeSeries(1120, 30),
    },
    limit: { '发动机出口温度(℃)': 700, '涡轮前温度(℃)': 1150 },
  },
  'E002': {
    params: ['1号液压压力(MPa)', '2号液压压力(MPa)'],
    series: {
      '1号液压压力(MPa)': genTimeSeries(20.5, 0.5),
      '2号液压压力(MPa)': genTimeSeries(17.8, 1.2),
    },
    limit: { '1号液压压力(MPa)': 20, '2号液压压力(MPa)': 20 },
  },
  'E003': {
    params: ['发动机振动值(mm/s)'],
    series: { '发动机振动值(mm/s)': genTimeSeries(4.8, 1.5) },
    limit: { '发动机振动值(mm/s)': 4.5 },
  },
  'E007': {
    params: ['2号液压压力(MPa)', '液压油温度(℃)'],
    series: {
      '2号液压压力(MPa)': genTimeSeries(18.2, 1.8),
      '液压油温度(℃)': genTimeSeries(65, 5),
    },
    limit: { '2号液压压力(MPa)': 20, '液压油温度(℃)': 80 },
  },
  'E010': {
    params: ['1号燃油流量(L/min)', '燃油传感器信号(V)'],
    series: {
      '1号燃油流量(L/min)': genTimeSeries(42, 15),
      '燃油传感器信号(V)': genTimeSeries(2.0, 2.5),
    },
    limit: {},
  },
}

// 故障详情（判据内容）
export const faultCriteria: Record<string, any> = {
  'FP-ENG-001': {
    index: 1,
    name: '发动机超温提示',
    type: '提示',
    description: '发动机出口温度连续超过680℃，持续时间超过30秒',
    criteria: '条件：发动机出口温度 T_EGT > 680℃ 且 持续时间 t > 30s',
  },
  'FP-HYD-002': {
    index: 2,
    name: '液压压力低告警',
    type: '告警',
    description: '液压系统工作压力低于正常范围下限（20MPa），可能导致操纵系统失效',
    criteria: '条件：液压压力 P_HYD < 20MPa 且 持续时间 t > 10s',
  },
  'FP-ENG-003': {
    index: 3,
    name: '发动机振动超限',
    type: '使用限制',
    description: '发动机振动量级超出使用限制，需降低油门或停车检查',
    criteria: '条件：振动值 V > 4.5mm/s 且 持续时间 t > 20s',
  },
}

// 地面综合诊断 - 故障结果列表
export const groundDiagFaults: Record<string, any[]> = {
  P001: [
    { id: 'GF001', sortieId: 'S20260308001', date: '2026-03-08', faultCode: 'GD-ENG-003', faultName: '发动机振动超限', system: '发动机', params: ['发动机振动值(mm/s)', '发动机转速(%)'] },
    { id: 'GF002', sortieId: 'S20260306001', date: '2026-03-06', faultCode: 'GD-CTRL-001', faultName: '飞控系统自检异常', system: '飞行控制', params: ['飞控计算机状态', '舵面偏角(°)'] },
  ],
  P002: [
    { id: 'GF003', sortieId: 'S20260308002', date: '2026-03-08', faultCode: 'GD-HYD-002', faultName: '2号液压压力持续低', system: '液压系统', params: ['2号液压压力(MPa)', '液压油温度(℃)', '液压油量(L)'] },
  ],
  P004: [
    { id: 'GF004', sortieId: 'S20260308003', date: '2026-03-08', faultCode: 'GD-FUEL-002', faultName: '燃油传感器故障', system: '燃油系统', params: ['燃油传感器信号(V)', '燃油量(L)'] },
    { id: 'GF005', sortieId: 'S20260308003', date: '2026-03-08', faultCode: 'GD-EO-001', faultName: '光电系统通信中断', system: '光电探测', params: ['光电系统通信状态', '前视红外信号强度'] },
  ],
}
