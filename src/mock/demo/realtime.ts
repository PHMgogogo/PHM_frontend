// 实时监控 Mock 数据

// 关键参数（模拟仪表盘数值，随时间变化）
export const realtimeParams: Record<string, any> = {
  P001: {
    fuel: 68.5,        // 燃油量 %
    throttle: 72.3,    // 油门 %
    heading: 125.4,    // 航向角 °
    pitch: 3.2,        // 俯仰角 °
    roll: 1.8,         // 横滚角 °
    altitude: 8500,    // 高度 m
    airspeed: 820,     // 空速 km/h
    engineRpm: 87.4,   // 发动机转速 %
    hydraulicPressure1: 20.5, // 液压1 MPa
    hydraulicPressure2: 20.3, // 液压2 MPa
    oilTemp: 128,      // 滑油温度 ℃
    voltage: 28.6,     // 供电电压 V
    lastUpdate: new Date().toISOString(),
  },
  P002: {
    fuel: 45.2,
    throttle: 65.0,
    heading: 240.1,
    pitch: -1.5,
    roll: 0.5,
    altitude: 6200,
    airspeed: 750,
    engineRpm: 78.9,
    hydraulicPressure1: 19.8,
    hydraulicPressure2: 18.2,
    oilTemp: 135,
    voltage: 27.9,
    lastUpdate: new Date().toISOString(),
  },
}

// 告警信息
export const alarmData = [
  {
    id: 'ALM001',
    planeId: 'P002',
    system: '液压系统',
    subsystem: '2号液压',
    level: 'warning',  // warning | fault | info
    code: 'HYD-02-0021',
    message: '2号液压系统压力偏低',
    time: '2026-03-09 08:32:15',
    acknowledged: false,
  },
  {
    id: 'ALM002',
    planeId: 'P002',
    system: '推进系统',
    subsystem: '发动机',
    level: 'info',
    code: 'ENG-01-0005',
    message: '发动机滑油温度接近上限',
    time: '2026-03-09 08:35:42',
    acknowledged: false,
  },
  {
    id: 'ALM003',
    planeId: 'P004',
    system: '燃油系统',
    subsystem: '1号燃油',
    level: 'fault',
    code: 'FUEL-01-0003',
    message: '1号燃油系统传感器故障',
    time: '2026-03-09 07:15:20',
    acknowledged: true,
  },
  {
    id: 'ALM004',
    planeId: 'P001',
    system: '供电系统',
    subsystem: '主电源',
    level: 'info',
    code: 'PWR-01-0001',
    message: '主电源电压波动',
    time: '2026-03-09 09:01:00',
    acknowledged: false,
  },
  {
    id: 'ALM005',
    planeId: 'P004',
    system: '光电探测系统',
    subsystem: '前视红外',
    level: 'fault',
    code: 'EO-01-0012',
    message: '前视红外探测器通信中断',
    time: '2026-03-09 06:50:10',
    acknowledged: true,
  },
]

// 告警系统分类（用于告警看板多维度展示）
export const alarmSystems = [
  { key: 'eo', name: '光电探测系统', normal: 5, warning: 0, fault: 1 },
  { key: 'ctrl', name: '管控系统', normal: 8, warning: 1, fault: 0 },
  { key: 'power', name: '供电系统', normal: 6, warning: 1, fault: 0 },
  { key: 'fuel1', name: '1号燃油系统', normal: 4, warning: 0, fault: 1 },
  { key: 'fuel2', name: '2号燃油系统', normal: 4, warning: 0, fault: 0 },
  { key: 'prop', name: '推进系统', normal: 3, warning: 1, fault: 0 },
  { key: 'hyd1', name: '1号液压系统', normal: 5, warning: 0, fault: 0 },
  { key: 'hyd2', name: '2号液压系统', normal: 4, warning: 1, fault: 0 },
]

// 机载健康管理诊断（预留展示位）
export const onboardHMData: Record<string, any> = {
  P001: { status: '正常', description: '各系统运行正常，无异常诊断结果。', time: '2026-03-09 09:00:00' },
  P002: { status: '注意', description: '液压系统压力异常，建议飞后检查2号液压系统密封件。', time: '2026-03-09 08:40:00' },
  P004: { status: '异常', description: '燃油传感器故障，光电系统通信中断，需停飞检修。', time: '2026-03-09 07:20:00' },
}
