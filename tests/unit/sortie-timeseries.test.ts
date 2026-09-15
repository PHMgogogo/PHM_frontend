import { describe, expect, it } from 'vitest'
import { isExternalSortie, isLocalSortie } from '@/utils/aircraft-source'
import {
  buildTimeseriesQuery,
  buildTimeseriesTable,
  cellText,
  composeSortieTime,
  formatTimestamp,
  pickDeviceName,
  propertyCandidates,
  resolveSortie,
  tableToDeviceName,
} from '@/utils/timeseries'
import type { ConfigDataMapping, CsvOverview, TimeSeriesData } from '@/types/entities'

/**
 * 架次 → 时序数据查询这条链路上的隐式约定，全部由 192.168.31.177:8080 实测得出，
 * 判错时界面表现都不像 bug（空表 / 空属性 / 查了别的飞机的表），故固化住：
 * - 分支从单机级来源判（/aircraft/plane 对三方单机下发占位符），叠加架次行占位符；
 * - 本地属性名取自 /csv/overview 的 columnTypes（键大写），要去掉时间轴列；
 * - 本地只带 sortieId、三方只带 aircraftNumber+sortieNumber+起止时间。
 */

/** 实测：GET /aircraft/sorties 本地行 */
const LOCAL_SORTIE = {
  sortieId: 1,
  aircraftNumber: 'B-1234',
  sortieNumber: 'dsafasfa',
  flightDate: '2026-08-05',
  startTime: '09:00:00',
  endTime: '10:30:00',
}

/** 实测：GET /aircraft/sorties 三方行（时间字段为占位符） */
const EXTERNAL_SORTIE = {
  sortieId: 10001,
  aircraftNumber: '20011',
  sortieNumber: '20011-2026072301',
  flightDate: '-',
  startTime: '-',
  endTime: '-',
}

describe('架次来源判定（GET /aircraft/sorties）', () => {
  it('时间字段为真实值时是本地架次', () => {
    expect(isExternalSortie(LOCAL_SORTIE)).toBe(false)
    expect(isLocalSortie(LOCAL_SORTIE)).toBe(true)
  })

  it('任一时间字段是占位符即为三方架次', () => {
    expect(isExternalSortie(EXTERNAL_SORTIE)).toBe(true)
    expect(isExternalSortie({ ...LOCAL_SORTIE, flightDate: '-' })).toBe(true)
    expect(isExternalSortie({ ...LOCAL_SORTIE, startTime: '-' })).toBe(true)
    expect(isExternalSortie({ ...LOCAL_SORTIE, endTime: '-' })).toBe(true)
  })

  it('字段缺失或纯空白判为三方（偏向安全方向）', () => {
    expect(isExternalSortie({})).toBe(true)
    expect(isExternalSortie({ flightDate: '', startTime: '', endTime: '' })).toBe(true)
    expect(isExternalSortie({ ...LOCAL_SORTIE, endTime: '   ' })).toBe(true)
  })
})

describe('deviceName 推导（GET /aircraft/mappings → /csv/overview）', () => {
  const mappings: ConfigDataMapping[] = [
    {
      mappingId: 6,
      aircraftNumber: 'B-1234',
      itemId: 1,
      csvTableName: 'csv_0805',
      dataTime: '2026-08-05 10:30:00',
      createdAt: '2026-08-05 10:31:00',
      sortieId: 1,
    },
  ]

  it('csvTableName 去掉 csv_ 前缀作为 deviceName', () => {
    expect(tableToDeviceName('csv_0805')).toBe('0805')
    expect(tableToDeviceName('0805')).toBe('0805')
    expect(tableToDeviceName('csv_训练')).toBe('训练')
  })

  it('按 sortieId + 机号取到映射表名', () => {
    expect(pickDeviceName(mappings, LOCAL_SORTIE)).toBe('0805')
  })

  it('一个架次多张表时取 mappingId 最大的一张（与后端实测行为一致）', () => {
    // 实测：sortieId=1 关联 csv_0804(mappingId 1) 与 csv_0805(mappingId 6)，
    // 两表列名完全不同，后端按 0805 取数；且接口返回顺序不作为约定，故显式按 mappingId 取新
    const two: ConfigDataMapping[] = [
      { ...mappings[0], mappingId: 6, csvTableName: '0805' },
      { ...mappings[0], mappingId: 1, csvTableName: '0804' },
    ]
    expect(pickDeviceName(two, LOCAL_SORTIE)).toBe('0805')
    // 颠倒入参顺序结果不变
    expect(pickDeviceName([...two].reverse(), LOCAL_SORTIE)).toBe('0805')
  })

  it('sortieId 相同但机号不同时取不到——sortieId 跨机号会重复', () => {
    // 实测：20011 与 20018 的架次都是 sortieId 10001，是两个不同架次
    expect(pickDeviceName(mappings, { ...LOCAL_SORTIE, aircraftNumber: '20018' })).toBeNull()
  })

  it('没有映射时返回 null（而非抛错）', () => {
    expect(pickDeviceName([], LOCAL_SORTIE)).toBeNull()
  })
})

describe('本地属性候选（GET /csv/overview 的 columnTypes）', () => {
  /** 实测返回：键大写，与 dataColumns 的小写不是同一套 */
  const overview: CsvOverview = {
    dataColumns: ['timestamps', 'altitude', 'speed', 'n1', 'n2'],
    textColumns: [],
    columnTypes: { timestamps: 'TIMESTAMP', ALTITUDE: 'INT64', SPEED: 'INT64', N1: 'DOUBLE', N2: 'DOUBLE' },
    timestampColumn: 'timestamps',
  }

  it('取 columnTypes 的键并去掉时间轴列（保大写）', () => {
    expect(propertyCandidates(overview)).toEqual(['ALTITUDE', 'SPEED', 'N1', 'N2'])
  })

  it('时间轴列名比较不分大小写', () => {
    expect(propertyCandidates({ ...overview, timestampColumn: 'TimeStamps' })).toEqual([
      'ALTITUDE',
      'SPEED',
      'N1',
      'N2',
    ])
  })

  it('overview 缺失或字段缺失时返回空数组（不抛错）', () => {
    expect(propertyCandidates(null)).toEqual([])
    expect(propertyCandidates(undefined)).toEqual([])
    expect(
      propertyCandidates({} as Pick<CsvOverview, 'columnTypes' | 'timestampColumn'>),
    ).toEqual([])
  })
})

describe('起止时间拼装（架次记录 → 三方入参）', () => {
  it('flightDate + HH:mm:ss 拼成后端要的 YYYY-MM-DD HH:mm:ss', () => {
    // 实测：这个值与统一查询里同一条航新架次下发的 startTime 逐字相同
    expect(composeSortieTime('2026-07-23', '10:30:00')).toBe('2026-07-23 10:30:00')
    expect(composeSortieTime('2026-07-23', '14:20:00')).toBe('2026-07-23 14:20:00')
  })

  it('任一字段是占位符 / 缺失 / 纯空白时不给值（交给后端按架次推算）', () => {
    expect(composeSortieTime('-', '10:30:00')).toBeUndefined()
    expect(composeSortieTime('2026-07-23', '-')).toBeUndefined()
    expect(composeSortieTime('2026-07-23', '')).toBeUndefined()
    expect(composeSortieTime('', '10:30:00')).toBeUndefined()
    expect(composeSortieTime(undefined, undefined)).toBeUndefined()
    expect(composeSortieTime('2026-07-23', '   ')).toBeUndefined()
  })

  it('已经是完整日期时间时原样使用（容错）', () => {
    expect(composeSortieTime('2026-07-23', '2026-07-23 10:30:00')).toBe('2026-07-23 10:30:00')
  })
})

describe('分支判定与三方入参（GET /aircraft/plane 的单机级来源 → /csv/query-timeseries）', () => {
  /**
   * 实测：同一批航新架次在两个接口里的两副面孔。
   * 关键点 —— /aircraft/sorties 里它的时间是**真实值**，光看列表分不出本地/三方；
   * 而统一查询已废弃，故改用单机级来源（/aircraft/plane 对三方单机下发占位符）。
   */
  const HANGXIN_SORTIE = {
    sortieId: 10001,
    aircraftNumber: 'B-001',
    sortieNumber: '20260723-1',
    flightDate: '2026-07-23',
    startTime: '10:30:00',
    endTime: '14:20:00',
  }

  it('时间字段是真实值的三方架次占位符判不出来，单机级来源能判出来', () => {
    // 这正是之前判错的场景：只看架次行，占位符启发式说它是本地
    expect(isExternalSortie(HANGXIN_SORTIE)).toBe(false)

    const r = resolveSortie(true, HANGXIN_SORTIE)
    expect(r.external).toBe(true)
  })

  it('三方分支的默认起止时间由架次记录拼出，四个入参可直接组装', () => {
    const r = resolveSortie(true, HANGXIN_SORTIE)
    expect(r.startTime).toBe('2026-07-23 10:30:00')
    expect(r.endTime).toBe('2026-07-23 14:20:00')

    expect(
      buildTimeseriesQuery({
        sortie: HANGXIN_SORTIE,
        external: r.external,
        paralist: ['ALTITUDE', 'SPEED', 'N1', 'N2'],
        startTime: r.startTime,
        endTime: r.endTime,
      }),
    ).toEqual({
      aircraftNumber: 'B-001',
      sortieNumber: '20260723-1',
      startTime: '2026-07-23 10:30:00',
      endTime: '2026-07-23 14:20:00',
      paralist: ['ALTITUDE', 'SPEED', 'N1', 'N2'],
    })
  })

  it('本地单机走 sortieId 分支，且不给时间（本地行只有 HH:mm:ss，拼不出日期）', () => {
    const r = resolveSortie(false, LOCAL_SORTIE)
    expect(r.external).toBe(false)
    expect(r.startTime).toBeUndefined()
    expect(r.endTime).toBeUndefined()
  })

  it('本地单机上时间字段是占位符的架次仍按三方处理（安全方向）', () => {
    const r = resolveSortie(false, EXTERNAL_SORTIE)
    expect(r.external).toBe(true)
    // 占位符拼不出时间，留给后端推算
    expect(r.startTime).toBeUndefined()
  })

  it('三方分支绝不带 sortieId —— 实测带 sortieId 查该航新架次得 0 行', () => {
    const q = buildTimeseriesQuery({
      sortie: HANGXIN_SORTIE,
      external: true,
      paralist: ['ALTITUDE'],
      startTime: '2026-07-23 10:30:00',
      endTime: '2026-07-23 14:20:00',
    })
    expect('sortieId' in q).toBe(false)
  })

  it('本地分支只带 sortieId 与属性，不带三方字段', () => {
    const q = buildTimeseriesQuery({ sortie: LOCAL_SORTIE, external: false, paralist: ['ALTITUDE'] })
    expect(q).toEqual({ sortieId: 1, paralist: ['ALTITUDE'] })
    expect('aircraftNumber' in q).toBe(false)
    expect('startTime' in q).toBe(false)
  })
})

describe('请求体组装（POST /csv/query-timeseries）', () => {
  it('属性清空时不带 paralist（本地不传返回空表，非全部列）', () => {
    const q = buildTimeseriesQuery({ sortie: LOCAL_SORTIE, external: false, paralist: [] })
    expect('paralist' in q).toBe(false)
  })

  it('属性里的空白项被剔除，全为空白时等同于未选', () => {
    expect(
      buildTimeseriesQuery({ sortie: LOCAL_SORTIE, external: false, paralist: ['  ', 'N1'] }).paralist,
    ).toEqual(['N1'])
    expect(
      'paralist' in buildTimeseriesQuery({ sortie: LOCAL_SORTIE, external: false, paralist: [' '] }),
    ).toBe(false)
  })

  it('时间为空时不带该字段（三方留空则由后端查三方架次接口推算）', () => {
    const q = buildTimeseriesQuery({
      sortie: EXTERNAL_SORTIE,
      external: true,
      paralist: ['N1'],
      startTime: '  ',
      endTime: undefined,
    })
    expect('startTime' in q).toBe(false)
    expect('endTime' in q).toBe(false)
  })

  it('时间两端各自独立', () => {
    const q = buildTimeseriesQuery({
      sortie: EXTERNAL_SORTIE,
      external: true,
      paralist: ['N1'],
      startTime: '2026-08-05 09:00:00',
      endTime: '',
    })
    expect(q.startTime).toBe('2026-08-05 09:00:00')
    expect('endTime' in q).toBe(false)
  })
})

describe('结果表格组装（{timestamps, parameters} → 行）', () => {
  it('时间列 + 每个参数一列，按下标对齐', () => {
    const data: TimeSeriesData = {
      timestamps: [1_754_352_000_000, 1_754_352_001_000],
      parameters: [
        { name: 'altitude', values: ['0', '1500'] },
        { name: 'n1', values: ['20.5', '21'] },
      ],
    }
    const table = buildTimeseriesTable(data)
    expect(table.columns).toEqual(['altitude', 'n1'])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0].cells).toEqual(['0', '20.5'])
    expect(table.rows[1].cells).toEqual(['1500', '21'])
    expect(table.rows[0].time).not.toBe('')
  })

  it('参数值比时间轴短时留空，不抛错也不错位', () => {
    const table = buildTimeseriesTable({
      timestamps: [1_754_352_000_000, 1_754_352_001_000, 1_754_352_002_000],
      parameters: [{ name: 'altitude', values: ['0'] }],
    })
    expect(table.rows).toHaveLength(3)
    expect(table.rows.map((r) => r.cells[0])).toEqual(['0', undefined, undefined])
  })

  it('参数值比时间轴长时多出的值不丢（行数取两侧最大）', () => {
    const table = buildTimeseriesTable({
      timestamps: [1_754_352_000_000],
      parameters: [{ name: 'altitude', values: ['0', '1500'] }],
    })
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1].time).toBe('')
    expect(table.rows[1].cells).toEqual(['1500'])
  })

  it('无数据时是空表（不抛错）', () => {
    expect(buildTimeseriesTable({ timestamps: [], parameters: [] })).toEqual({
      columns: [],
      rows: [],
    })
  })

  it('值为字符串，原样展示；null/undefined 显示为空', () => {
    expect(cellText('20.5')).toBe('20.5')
    expect(cellText('0')).toBe('0')
    expect(cellText(null)).toBe('')
    expect(cellText(undefined)).toBe('')
  })

  it('时间戳非法时返回空串而非 Invalid Date', () => {
    expect(formatTimestamp(undefined)).toBe('')
    expect(formatTimestamp(null)).toBe('')
    expect(formatTimestamp(NaN)).toBe('')
    expect(formatTimestamp(Infinity)).toBe('')
  })
})
