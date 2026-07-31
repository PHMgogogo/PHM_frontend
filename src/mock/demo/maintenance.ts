// 维修建议 Mock 数据

// 故障信息表（按架次）
export const maintenanceFaultList: Record<string, any[]> = {
  S20260308001: [
    {
      id: 'MF001',
      faultCode: 'GD-ENG-003',
      faultType: '使用限制',
      faultName: '发动机振动超限',
      faultDevice: '发动机',
      system: '推进系统',
      faultStatus: 'confirmed',  // confirmed | suspected | resolved
    },
    {
      id: 'MF002',
      faultCode: 'GD-HYD-002',
      faultType: '告警',
      faultName: '液压压力低',
      faultDevice: '2号液压泵',
      system: '液压系统',
      faultStatus: 'suspected',
    },
  ],
  S20260308002: [
    {
      id: 'MF003',
      faultCode: 'GD-HYD-002',
      faultType: '告警',
      faultName: '2号液压压力持续偏低',
      faultDevice: '2号液压泵',
      system: '液压系统',
      faultStatus: 'confirmed',
    },
  ],
  S20260308003: [
    {
      id: 'MF004',
      faultCode: 'GD-FUEL-002',
      faultType: '设备故障',
      faultName: '燃油传感器故障',
      faultDevice: '1号燃油传感器',
      system: '燃油系统',
      faultStatus: 'confirmed',
    },
    {
      id: 'MF005',
      faultCode: 'GD-EO-001',
      faultType: '设备故障',
      faultName: '光电系统通信中断',
      faultDevice: '前视红外探测器',
      system: '光电探测系统',
      faultStatus: 'confirmed',
    },
  ],
  S20260307001: [
    {
      id: 'MF006',
      faultCode: 'GD-FUEL-001',
      faultType: '提示',
      faultName: '燃油消耗偏大',
      faultDevice: '燃油系统',
      system: '燃油系统',
      faultStatus: 'resolved',
    },
  ],
}

// 排故引导/维修建议（故障码 -> 建议列表映射）
export const maintenanceGuide: Record<string, any> = {
  'GD-ENG-003': {
    faultName: '发动机振动超限',
    steps: [
      { step: 1, action: '停飞，禁止再次起飞', urgency: 'immediate' },
      { step: 2, action: '检查发动机安装螺栓是否松动，力矩是否符合规定值（参照维护手册第3章表3-12）', urgency: 'high' },
      { step: 3, action: '检查发动机风扇叶片是否有异物损伤（FOD）', urgency: 'high' },
      { step: 4, action: '用振动测量仪复测发动机在地面慢车状态下的振动量级', urgency: 'medium' },
      { step: 5, action: '若振动量级仍超限，拆卸发动机送往维修站进行平衡检查', urgency: 'high' },
      { step: 6, action: '记录故障信息，填写故障件维修报告', urgency: 'medium' },
    ],
    ietmRef: 'IETM-ENG-CH3-SEC4',
    estimatedTime: '4-8小时',
  },
  'GD-HYD-002': {
    faultName: '液压压力低',
    steps: [
      { step: 1, action: '检查液压油量，若不足则补充至规定刻度（参照维护手册第5章）', urgency: 'high' },
      { step: 2, action: '检查液压管路有无渗漏点，重点检查接头和密封圈', urgency: 'high' },
      { step: 3, action: '检查液压泵工作状态，测量输出压力是否达标', urgency: 'high' },
      { step: 4, action: '若液压泵输出压力不足，更换液压泵（件号：HP-3-ASSY）', urgency: 'medium' },
      { step: 5, action: '系统充液压油后，进行地面液压试验，确认压力正常', urgency: 'medium' },
    ],
    ietmRef: 'IETM-HYD-CH5-SEC2',
    estimatedTime: '2-6小时',
  },
  'GD-FUEL-002': {
    faultName: '燃油传感器故障',
    steps: [
      { step: 1, action: '停飞，检查燃油传感器接线是否牢固，有无断路/短路', urgency: 'immediate' },
      { step: 2, action: '用万用表测量传感器输出电压，对比正常值范围（1.0V-4.0V）', urgency: 'high' },
      { step: 3, action: '更换燃油传感器（件号：FS-A-001），安装后接线并检查绝缘', urgency: 'high' },
      { step: 4, action: '地面加注燃油，核实传感器读数与实际油量一致', urgency: 'medium' },
    ],
    ietmRef: 'IETM-FUEL-CH6-SEC1',
    estimatedTime: '1-3小时',
  },
  'GD-EO-001': {
    faultName: '光电系统通信中断',
    steps: [
      { step: 1, action: '检查光电系统供电电压是否正常（标准：28±2V）', urgency: 'immediate' },
      { step: 2, action: '检查系统通信总线连接器，确认无松动', urgency: 'high' },
      { step: 3, action: '使用地面测试设备对光电系统进行自检测试', urgency: 'high' },
      { step: 4, action: '若自检失败，更换前视红外探测器组件（件号：EO-IR-FRONT-001）', urgency: 'high' },
      { step: 5, action: '更换后重新进行系统地面功能测试', urgency: 'medium' },
    ],
    ietmRef: 'IETM-EO-CH8-SEC3',
    estimatedTime: '2-4小时',
  },
  'GD-FUEL-001': {
    faultName: '燃油消耗偏大',
    steps: [
      { step: 1, action: '核查本次飞行剖面与燃油消耗基准是否一致', urgency: 'medium' },
      { step: 2, action: '检查燃油系统各管路接头密封性', urgency: 'medium' },
      { step: 3, action: '跟踪后续3架次燃油消耗数据，若持续偏大则进一步检查', urgency: 'low' },
    ],
    ietmRef: 'IETM-FUEL-CH6-SEC2',
    estimatedTime: '0.5小时',
  },
}

// IETM 库（文档索引）
export const ietmLibrary = [
  { id: 'IETM-ENG-CH3-SEC4', title: '发动机振动超限处理程序', chapter: '发动机维护', category: '排故程序' },
  { id: 'IETM-HYD-CH5-SEC2', title: '液压系统低压故障处理', chapter: '液压系统维护', category: '排故程序' },
  { id: 'IETM-FUEL-CH6-SEC1', title: '燃油传感器更换程序', chapter: '燃油系统维护', category: '更换程序' },
  { id: 'IETM-EO-CH8-SEC3', title: '光电系统通信故障诊断', chapter: '任务系统维护', category: '排故程序' },
  { id: 'IETM-FUEL-CH6-SEC2', title: '燃油消耗偏大分析程序', chapter: '燃油系统维护', category: '排故程序' },
]
