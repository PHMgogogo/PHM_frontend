// 飞机基础信息 Mock 数据

export const planesData = [
  {
    id: 'P001',
    planeNo: 'J-20 0001',
    factoryNo: 'JX-2019-001',
    totalLifeHours: 5000,
    totalFlightSorties: 312,
    base: '某基地-1大队',
    serviceDate: '2019-06-15',
    status: 'normal', // normal | warning | fault
  },
  {
    id: 'P002',
    planeNo: 'J-20 0002',
    factoryNo: 'JX-2019-002',
    totalLifeHours: 5000,
    totalFlightSorties: 287,
    base: '某基地-1大队',
    serviceDate: '2019-08-20',
    status: 'warning',
  },
  {
    id: 'P003',
    planeNo: 'J-20 0003',
    factoryNo: 'JX-2020-003',
    totalLifeHours: 5000,
    totalFlightSorties: 195,
    base: '某基地-2大队',
    serviceDate: '2020-03-10',
    status: 'normal',
  },
  {
    id: 'P004',
    planeNo: 'J-20 0004',
    factoryNo: 'JX-2020-004',
    totalLifeHours: 5000,
    totalFlightSorties: 210,
    base: '某基地-2大队',
    serviceDate: '2020-05-18',
    status: 'fault',
  },
  {
    id: 'P005',
    planeNo: '无人机-A 0001',
    factoryNo: 'UA-2021-001',
    totalLifeHours: 3000,
    totalFlightSorties: 156,
    base: '某基地-3大队',
    serviceDate: '2021-01-22',
    status: 'normal',
  },
  {
    id: 'P006',
    planeNo: '无人机-A 0002',
    factoryNo: 'UA-2021-002',
    totalLifeHours: 3000,
    totalFlightSorties: 134,
    base: '某基地-3大队',
    serviceDate: '2021-03-05',
    status: 'normal',
  },
]

export const squadronData = [
  { id: 'SQ1', name: '某基地-1大队', planeIds: ['P001', 'P002'] },
  { id: 'SQ2', name: '某基地-2大队', planeIds: ['P003', 'P004'] },
  { id: 'SQ3', name: '某基地-3大队', planeIds: ['P005', 'P006'] },
]

// 单机构型（软硬件配置）
export const planeConfigData: Record<string, any> = {
  P001: {
    softwareList: [
      { name: '飞管软件', version: 'V3.2.1', installDate: '2023-01-10' },
      { name: '任务管理软件', version: 'V2.1.0', installDate: '2022-08-15' },
      { name: '导航软件', version: 'V4.0.2', installDate: '2023-03-20' },
    ],
    partsList: [
      { name: '涡扇发动机', model: 'WS-XX', factoryNo: 'WS-2019-A001', position: '发动机舱' },
      { name: '飞行控制计算机', model: 'FCC-3', factoryNo: 'FCC-2019-001', position: '前机身' },
      { name: '惯性导航装置', model: 'INS-2000', factoryNo: 'INS-2019-001', position: '中机身' },
      { name: '主起落架', model: 'LG-A型', factoryNo: 'LG-2019-001', position: '主起落架舱' },
    ],
  },
  P002: {
    softwareList: [
      { name: '飞管软件', version: 'V3.2.1', installDate: '2023-01-10' },
      { name: '任务管理软件', version: 'V2.0.5', installDate: '2022-05-20' },
    ],
    partsList: [
      { name: '涡扇发动机', model: 'WS-XX', factoryNo: 'WS-2019-A002', position: '发动机舱' },
      { name: '飞行控制计算机', model: 'FCC-3', factoryNo: 'FCC-2019-002', position: '前机身' },
    ],
  },
}
