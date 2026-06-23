// 健康评估 Mock 数据

// 整机健康评估树结构
export const healthTreeData: Record<string, any> = {
  P001: {
    sorties: ['S20260308001', 'S20260307001', 'S20260306001'],
    assessments: {
      S20260308001: {
        label: '整机',
        score: 88,
        status: 'warning',
        children: [
          {
            label: '飞管系统',
            score: 95,
            status: 'normal',
            children: [
              { label: '管理与控制分系统', score: 95, status: 'normal', children: [] },
              { label: '导航分系统', score: 98, status: 'normal', children: [] },
            ],
          },
          {
            label: '推进系统',
            score: 80,
            status: 'warning',
            children: [
              { label: '发动机', score: 78, status: 'warning', children: [] },
              { label: '进气道', score: 92, status: 'normal', children: [] },
            ],
          },
          {
            label: '液压系统',
            score: 85,
            status: 'warning',
            children: [
              { label: '1号液压', score: 96, status: 'normal', children: [] },
              { label: '2号液压', score: 74, status: 'warning', children: [] },
            ],
          },
          {
            label: '燃油系统',
            score: 93,
            status: 'normal',
            children: [
              { label: '1号油箱', score: 95, status: 'normal', children: [] },
              { label: '2号油箱', score: 91, status: 'normal', children: [] },
            ],
          },
        ],
      },
    },
  },
  P002: {
    sorties: ['S20260308002', 'S20260307002'],
    assessments: {
      S20260308002: {
        label: '整机',
        score: 72,
        status: 'warning',
        children: [
          {
            label: '液压系统',
            score: 60,
            status: 'fault',
            children: [
              { label: '1号液压', score: 90, status: 'normal', children: [] },
              { label: '2号液压', score: 50, status: 'fault', children: [] },
            ],
          },
          {
            label: '飞管系统',
            score: 92,
            status: 'normal',
            children: [
              { label: '管理与控制分系统', score: 92, status: 'normal', children: [] },
            ],
          },
        ],
      },
    },
  },
  P004: {
    sorties: ['S20260308003'],
    assessments: {
      S20260308003: {
        label: '整机',
        score: 45,
        status: 'fault',
        children: [
          {
            label: '燃油系统',
            score: 30,
            status: 'fault',
            children: [
              { label: '燃油传感器', score: 10, status: 'fault', children: [] },
              { label: '油箱', score: 90, status: 'normal', children: [] },
            ],
          },
          {
            label: '光电探测系统',
            score: 20,
            status: 'fault',
            children: [
              { label: '前视红外', score: 5, status: 'fault', children: [] },
              { label: '可见光相机', score: 85, status: 'normal', children: [] },
            ],
          },
        ],
      },
    },
  },
}

// 隐身健康状态评估
export const stealthHealthData: Record<string, any> = {
  P001: {
    S20260308001: {
      overallScore: 91,
      status: 'normal',
      items: [
        { area: '机身前段涂层', status: 'normal', score: 95, remark: '状态良好' },
        { area: '机翼前缘涂层', status: 'normal', score: 92, remark: '状态良好' },
        { area: '进气道内壁涂层', status: 'normal', score: 88, remark: '轻微磨损，建议下次定检处理' },
        { area: '雷达散射截面', status: 'normal', score: 94, remark: '符合设计指标' },
      ],
    },
  },
  P002: {
    S20260308002: {
      overallScore: 83,
      status: 'warning',
      items: [
        { area: '机身前段涂层', status: 'normal', score: 90, remark: '状态良好' },
        { area: '机翼前缘涂层', status: 'warning', score: 72, remark: '涂层存在裂缝，需修复' },
        { area: '进气道内壁涂层', status: 'normal', score: 88, remark: '轻微磨损' },
        { area: '雷达散射截面', status: 'warning', score: 80, remark: '偏离设计指标，建议修复后重测' },
      ],
    },
  },
}

// 放飞支持
export const releaseFlightData = [
  { planeId: 'P001', planeNo: '歼-X 0001', canRelease: true, reason: '各系统状态正常，可放飞', squadron: '某基地-1大队' },
  { planeId: 'P002', planeNo: '歼-X 0002', canRelease: false, reason: '液压系统存在故障，不建议放飞', squadron: '某基地-1大队' },
  { planeId: 'P003', planeNo: '歼-X 0003', canRelease: true, reason: '各系统状态正常，可放飞', squadron: '某基地-2大队' },
  { planeId: 'P004', planeNo: '歼-X 0004', canRelease: false, reason: '燃油传感器故障、光电系统异常，禁止放飞', squadron: '某基地-2大队' },
  { planeId: 'P005', planeNo: '无人机-A 0001', canRelease: true, reason: '各系统状态正常，可放飞', squadron: '某基地-3大队' },
  { planeId: 'P006', planeNo: '无人机-A 0002', canRelease: true, reason: '各系统状态正常，可放飞', squadron: '某基地-3大队' },
]

// 中队/机队放飞汇总
export const squadronReleaseData = [
  { squadronId: 'SQ1', squadronName: '某基地-1大队', canRelease: false, reason: '本队存在不可放飞飞机（歼-X 0002），整队不建议放飞' },
  { squadronId: 'SQ2', squadronName: '某基地-2大队', canRelease: false, reason: '本队存在不可放飞飞机（歼-X 0004），整队不建议放飞' },
  { squadronId: 'SQ3', squadronName: '某基地-3大队', canRelease: true, reason: '本队全部飞机状态正常，可放飞' },
]
