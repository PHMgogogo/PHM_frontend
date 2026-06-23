// 趋势分析 Mock 数据

// 生成架次趋势数据
function genSortieTrend(base: number, noise: number, count = 20) {
  return Array.from({ length: count }, (_, i) => ({
    sortie: i + 1,
    value: +(base + (Math.random() - 0.5) * noise + i * 0.05).toFixed(3),
  }))
}

// 预防性维修到检信息
export const preventiveMaintenanceData: Record<string, any[]> = {
  P001: [
    {
      id: 'PM001',
      name: '发动机定检',
      specialty: '机械专业',
      checkType: '定检',
      status: 'warning',  // normal | warning | overdue
      dueDate: '2026-03-20',
      lastDate: '2025-09-20',
      accumulatedHours: 486,
      checkInterval: 500,
      trendData: Array.from({ length: 20 }, (_, i) => ({ time: i + 1, pass: i < 17 ? 1 : 0 })),
    },
    {
      id: 'PM002',
      name: '液压系统周检',
      specialty: '机械专业',
      checkType: '周检',
      status: 'normal',
      dueDate: '2026-03-15',
      lastDate: '2026-03-08',
      accumulatedHours: 7,
      checkInterval: 10,
      trendData: Array.from({ length: 10 }, (_, i) => ({ time: i + 1, pass: 1 })),
    },
    {
      id: 'PM003',
      name: '电源系统特检',
      specialty: '航电专业',
      checkType: '特检',
      status: 'overdue',
      dueDate: '2026-03-01',
      lastDate: '2025-06-01',
      accumulatedHours: 280,
      checkInterval: 250,
      trendData: Array.from({ length: 15 }, (_, i) => ({ time: i + 1, pass: i < 12 ? 1 : 0 })),
    },
    {
      id: 'PM004',
      name: '导弹挂架检查',
      specialty: '军械专业',
      checkType: '周检',
      status: 'normal',
      dueDate: '2026-03-12',
      lastDate: '2026-03-05',
      accumulatedHours: 4,
      checkInterval: 7,
      trendData: Array.from({ length: 8 }, (_, i) => ({ time: i + 1, pass: 1 })),
    },
  ],
  P002: [
    {
      id: 'PM005',
      name: '液压系统定检',
      specialty: '机械专业',
      checkType: '定检',
      status: 'overdue',
      dueDate: '2026-02-28',
      lastDate: '2025-08-28',
      accumulatedHours: 520,
      checkInterval: 500,
      trendData: Array.from({ length: 20 }, (_, i) => ({ time: i + 1, pass: i < 15 ? 1 : 0 })),
    },
    {
      id: 'PM006',
      name: '发动机周检',
      specialty: '机械专业',
      checkType: '周检',
      status: 'warning',
      dueDate: '2026-03-10',
      lastDate: '2026-03-03',
      accumulatedHours: 9,
      checkInterval: 10,
      trendData: Array.from({ length: 10 }, (_, i) => ({ time: i + 1, pass: i < 8 ? 1 : 0 })),
    },
  ],
}

// 整机/系统趋势分析
export const systemTrendData: Record<string, any[]> = {
  P001: [
    {
      id: 'TR001',
      name: '发动机振动均值趋势',
      target: '发动机',
      param: '振动值(mm/s)',
      statFunc: '均值',
      unit: 'mm/s',
      limit: 4.5,
      trendData: genSortieTrend(3.2, 0.4),
    },
    {
      id: 'TR002',
      name: '液压压力最小值趋势',
      target: '2号液压系统',
      param: '2号液压压力(MPa)',
      statFunc: '最小值',
      unit: 'MPa',
      limit: 20.0,
      trendData: [
        ...Array.from({ length: 15 }, (_, i) => ({ sortie: i + 1, value: +(20.5 - i * 0.03 + (Math.random() - 0.5) * 0.2).toFixed(3) })),
        ...Array.from({ length: 5 }, (_, i) => ({ sortie: i + 16, value: +(19.8 - i * 0.1 + (Math.random() - 0.5) * 0.3).toFixed(3) })),
      ],
    },
    {
      id: 'TR003',
      name: '燃油消耗率均值趋势',
      target: '燃油系统',
      param: '燃油消耗率(L/h)',
      statFunc: '均值',
      unit: 'L/h',
      limit: null,
      trendData: genSortieTrend(850, 25),
    },
  ],
  P002: [
    {
      id: 'TR004',
      name: '2号液压压力最小值趋势',
      target: '2号液压系统',
      param: '2号液压压力(MPa)',
      statFunc: '最小值',
      unit: 'MPa',
      limit: 20.0,
      trendData: [
        ...Array.from({ length: 10 }, (_, i) => ({ sortie: i + 1, value: +(20.3 - i * 0.05 + (Math.random() - 0.5) * 0.2).toFixed(3) })),
        ...Array.from({ length: 10 }, (_, i) => ({ sortie: i + 11, value: +(19.8 - i * 0.15 + (Math.random() - 0.5) * 0.3).toFixed(3) })),
      ],
    },
  ],
}
