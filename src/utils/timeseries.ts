// ============================================================
// 时序数据查询（POST /csv/query-timeseries）的纯逻辑
// ============================================================
// 抽成独立模块而非写在 SFC 里，是为了让「属性候选 / 请求体组装 / 表格对齐」这几处
// 有实测契约支撑的规则可被单元测试直接覆盖（见 tests/unit/sortie-timeseries.test.ts）。
// 组件只负责取数与渲染。

import type {
  ConfigDataMapping,
  CsvOverview,
  TimeSeriesData,
  TimeSeriesQuery,
} from '@/types/entities'
import { isExternalSortie } from './aircraft-source'

/** 归一化比较用的键：后端列名大小写混用（columnTypes 的键大写、返回的参数名小写），比较一律折叠大小写与空白 */
function normalizeKey(v: string): string {
  return v.trim().toLowerCase()
}

/**
 * 「deviceName」= 映射的 csvTableName 去掉 `csv_` 前缀（如 `csv_0805` → `0805`）。
 * 实测带前缀不带前缀后端都认，这里统一成不带前缀的形态。
 */
export function tableToDeviceName(csvTableName: string): string {
  const name = csvTableName.trim()
  return name.toLowerCase().startsWith('csv_') ? name.slice(4) : name
}

/**
 * 从架次的构型数据映射里挑出本地 CSV 表名（deviceName）。
 *
 * 必须按机号过滤：`sortieId` 只在单个来源内唯一，跨机号会重复
 * （如 20011 与 20018 的架次都是 sortieId 10001），仅按 sortieId 取映射会拿到别的飞机的表。
 *
 * 一个架次可关联多张表（实测 sortieId=1 有 csv_0804 与 csv_0805，两表列名完全不同），
 * 而请求体没有 tableName/mappingId 字段、查哪张由后端定。这里取 mappingId 最大的一张，
 * 与实测观察到的后端行为一致（后端取 csv_0805 即较新的那条映射，返回 10 行；
 * 若按 0804 的列名去查则会查不到）。不依赖接口返回顺序，故显式排序。
 */
export function pickDeviceName(
  mappings: ConfigDataMapping[],
  sortie: { sortieId: number; aircraftNumber: string },
): string | null {
  const own = mappings
    .filter(
      (m) =>
        m.sortieId === sortie.sortieId &&
        m.aircraftNumber === sortie.aircraftNumber &&
        !!m.csvTableName,
    )
    .sort((a, b) => b.mappingId - a.mappingId)
  return own.length ? tableToDeviceName(own[0].csvTableName) : null
}

/**
 * 本地分支可选的属性名 = /csv/overview 的 columnTypes 键去掉时间轴列。
 *
 * 用 columnTypes 而非 dataColumns：columnTypes 的键与实际能查到的列名一致
 * （实测 `ALTITUDE`/`SPEED`/`N1`/`N2` 可查到数据），dataColumns 是小写另一套。
 */
export function propertyCandidates(
  overview: Pick<CsvOverview, 'columnTypes' | 'timestampColumn'> | null | undefined,
): string[] {
  const types = overview?.columnTypes ?? {}
  const ts = normalizeKey(overview?.timestampColumn ?? '')
  return Object.keys(types).filter((k) => normalizeKey(k) !== ts)
}

/**
 * 三方的起止时间：把列表行的 `flightDate` 与 `HH:mm:ss` 拼成后端要的
 * `YYYY-MM-DD HH:mm:ss`。实测拼出来的值与该架次在后端的真实起止时间完全相同
 * （`'2026-07-23'` + `'10:30:00'` → `'2026-07-23 10:30:00'`），
 * 故起止时间直接取自架次行即可，无需另调聚合接口。
 *
 * 任一字段缺失/为占位符 `-` 时返回 undefined（该字段不下发，由后端按架次推算）。
 */
export function composeSortieTime(
  flightDate?: string | null,
  time?: string | null,
): string | undefined {
  const d = (flightDate ?? '').trim()
  const t = (time ?? '').trim()
  if (!d || !t || d === '-' || t === '-') return undefined
  // 已经是完整日期时间则原样用（容错统一查询那种形态）
  if (t.length > 8) return t
  return `${d} ${t}`
}

/**
 * 判分支并取出三方分支要用的默认起止时间。
 *
 * 以**单机级**来源为准：`GET /aircraft/plane` 会把三方单机的 `airline`/`status`/`createdAt`
 * 下发为占位符（实测 B-001/B-002 是三方、B-1234 是本地），这条在工作台里已经算好了。
 * 再叠加架次行的占位符判断：三方平台取不到数据时 `/aircraft/sorties` 的时间字段是 `-`，
 * 这种行无论如何都按三方处理——宁可让用户手填参数名，也不能拿本地表编号去查三方。
 *
 * 注意三方架次有数据时列表里是**真实时间**，只靠占位符判不出来；这也是必须传
 * 单机级来源的原因（已废弃的统一查询曾用 source 字段兜住这点）。
 */
export interface ResolvedSortie {
  external: boolean
  /** 三方分支的默认起止时间（从架次记录拼出），本地分支为 undefined */
  startTime?: string
  endTime?: string
}

export function resolveSortie(
  aircraftExternal: boolean,
  sortie: {
    flightDate?: string | null
    startTime?: string | null
    endTime?: string | null
  },
): ResolvedSortie {
  const external = aircraftExternal || isExternalSortie(sortie)
  return {
    external,
    // 本地行只有 HH:mm:ss 没有日期，拼不出完整时间；不传后端也按该架次起止查（实测一致）
    startTime: external ? composeSortieTime(sortie.flightDate, sortie.startTime) : undefined,
    endTime: external ? composeSortieTime(sortie.flightDate, sortie.endTime) : undefined,
  }
}

export interface TimeseriesQueryInput {
  /** 被点击的架次（含 sortieId / aircraftNumber / sortieNumber） */
  sortie: { sortieId: number; aircraftNumber: string; sortieNumber: string }
  /** true → 三方分支，false → 本地分支 */
  external: boolean
  /** 用户选择的属性（本地为 CSV 列名，三方为参数名） */
  paralist: string[]
  /** 三方起止时间，默认由架次记录拼出，用户可改；本地为 undefined */
  startTime?: string
  endTime?: string
}

/**
 * 组装请求体。
 *
 * 两条分支的字段互斥：
 * - 本地 → `sortieId`（后端据此定位该架次关联的 csv_xxx 表）；
 * - 三方 → `aircraftNumber` + `sortieNumber`（后端转发给平台时即 airplaneNum / flightNum），
 *   外带该架次的真实 `startTime`/`endTime`。**绝不能给三方带 sortieId**：
 *   那是本地表的编号，对三方平台没有意义，后端会按「本地优先」去查本地表而查空。
 *   实测：同一航新架次，传 sortieId 得 0 行，传机号+架次号+起止时间得 20 行。
 *
 * 属性清空时**不带** paralist：本地不传会返回空表（不会有「全部列」兜底）；
 * 三方不传则返回上游的原始列名（实测为 Column4/Column5/Column6），故三方要手填
 * 参数名（如 ALTITUDE/SPEED/N1/N2）才能得到有意义的列名。
 *
 * ⚠️ 三方分支的 paralist 只是**列名标签**，不是筛选条件：实测传 ['__NOPE__'] 也会返回
 * 一条名为 __NOPE__ 的数据、传 5 个名字就回 5 条序列，值每次请求随机。也就是说三方
 * 参数名填错不会报错，只会得到一张名字对不上内容的表——故界面上必须让用户看得见
 * 自己填的名字（结果表列名即他所填），不要假装它是从平台查出来的元数据。
 */
export function buildTimeseriesQuery(input: TimeseriesQueryInput): TimeSeriesQuery {
  const query: TimeSeriesQuery = {}

  if (input.external) {
    if (input.sortie.aircraftNumber) query.aircraftNumber = input.sortie.aircraftNumber
    if (input.sortie.sortieNumber) query.sortieNumber = input.sortie.sortieNumber
    const start = input.startTime?.trim()
    if (start) query.startTime = start
    const end = input.endTime?.trim()
    if (end) query.endTime = end
  } else {
    query.sortieId = input.sortie.sortieId
  }

  const paralist = input.paralist.map((s) => s.trim()).filter(Boolean)
  if (paralist.length) query.paralist = paralist

  return query
}

export interface TimeseriesTable {
  /** 参数名列表，顺序与每行 cells 的下标一一对应 */
  columns: string[]
  rows: TimeseriesRow[]
}

export interface TimeseriesRow {
  /** 已格式化的时间，缺失时为 '' */
  time: string
  /** 按下标与 columns 对齐；缺失的单元格为 undefined */
  cells: unknown[]
}

/**
 * 时间戳（毫秒）→ `YYYY-MM-DD HH:mm:ss`（本地时区）。非有限数返回空串。
 */
export function formatTimestamp(ms?: number | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** 单元格文本：接口下发的是字符串，原样展示；null/undefined 显示为空 */
export function cellText(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

/**
 * `{timestamps, parameters}` → 表格行。
 *
 * 行数取时间轴长度与各参数值长度的最大值：两个方向都要容错——values 比 timestamps 短
 * （缺的格子留空）或长（多出的值不丢），避免任一侧长度不一致时错位或截断。
 */
export function buildTimeseriesTable(data: TimeSeriesData): TimeseriesTable {
  const parameters = data.parameters ?? []
  const columns = parameters.map((p) => p.name)
  const rowCount = Math.max(
    data.timestamps?.length ?? 0,
    ...parameters.map((p) => p.values?.length ?? 0),
    0,
  )

  const rows: TimeseriesRow[] = []
  for (let i = 0; i < rowCount; i++) {
    rows.push({
      time: formatTimestamp(data.timestamps?.[i]),
      cells: parameters.map((p) => p.values?.[i]),
    })
  }

  return { columns, rows }
}
