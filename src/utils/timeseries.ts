// ============================================================
// 时序数据查询（POST /csv/query-timeseries）的纯逻辑
// ============================================================
// 抽成独立模块而非写在 SFC 里，是为了让「属性候选 / 请求体组装 / 表格对齐」这几处
// 有实测契约支撑的规则可被单元测试直接覆盖（见 tests/unit/sortie-timeseries.test.ts）。
// 组件只负责取数与渲染。

import type {
  ConfigDataMapping,
  CsvOverview,
  Sortie,
  TimeSeriesData,
  TimeSeriesQuery,
  TimeseriesJobRequest,
} from '@/types/entities'
import { hasLocalSortieId, isExternalSortie } from './aircraft-source'

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

/** 属性下拉的一项（el-select-v2 的 options 元素） */
export interface PropertyOption {
  label: string
  value: string
}

/**
 * 候选列名 → 下拉 option。
 *
 * 航新参数组实测可下发 10000+ 列名，若直接 `v-for` 渲染 el-option 会一次性挂载
 * 上万节点把页面卡死；故统一走 el-select-v2 的虚拟滚动（只渲染可视区选项）。
 * option 只保留 label/value 两个字段：虚拟列表按 itemHeight 估算高度，
 * 对象越简单越省内存，也避免把大字符串复制到多份。
 *
 * 顺手做三件容错：去重（后端列名可能重名）、剔除空白项、非数组按空处理。
 */
export function toOptions(candidates?: string[] | null): PropertyOption[] {
  if (!Array.isArray(candidates)) return []
  const seen = new Set<string>()
  const options: PropertyOption[] = []
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push({ label: value, value })
  }
  return options
}

/**
 * 输入框内过滤（el-select-v2 的 filter-method）。
 *
 * 默认过滤是 O(n) 全量正则匹配，1 万项每次输入都要扫一遍；这里改为
 * 折叠大小写的 indexOf 子串匹配 —— 对「用户敲的是列名片段」这个场景足够，
 * 且不需要为正则转义 / 编译付费。空查询直接返回原数组，不复制。
 */
export function filterOptions(options: PropertyOption[], query: string): PropertyOption[] {
  if (!Array.isArray(options)) return []
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => o.label.toLowerCase().includes(q))
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
 * 第三条判据是**本地主键**：三方行的 sortieId 为 null，而本地 CSV 链路（mappings →
 * csv_<表名>）正是以它为锚点，没有主键就无从绑定，必须按三方处理。
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
    /** 本地主键；三方行下发 null */
    sortieId?: number | null
    flightDate?: string | null
    startTime?: string | null
    endTime?: string | null
  },
): ResolvedSortie {
  // 没有本地主键 ⇒ 不可能有本地 config_data_mapping，绝不能进本地分支
  // （否则会发 ?sortieId=null 查映射，再拿别人的表名去 /csv/overview 取列名）。
  const external =
    aircraftExternal || !hasLocalSortieId(sortie) || isExternalSortie(sortie)
  return {
    external,
    // 本地行只有 HH:mm:ss 没有日期，拼不出完整时间；不传后端也按该架次起止查（实测一致）
    startTime: external ? composeSortieTime(sortie.flightDate, sortie.startTime) : undefined,
    endTime: external ? composeSortieTime(sortie.flightDate, sortie.endTime) : undefined,
  }
}

export interface TimeseriesQueryInput {
  /** 被点击的架次（用其 sortieKey 定位；aircraftNumber 仅作后端路由索引的补充） */
  sortie: { sortieKey: string; aircraftNumber?: string }
  /** 用户选择的属性（本地为 CSV 列名，三方为参数名） */
  paralist: string[]
  /** 起止时间，默认由架次记录拼出（三方），用户可改；本地为 undefined */
  startTime?: string
  endTime?: string
}

/**
 * 组装请求体。
 *
 * 只有一种形态：`sortieId` 装架次的 `sortieKey`，后端据此定向到唯一数据源
 * （本地 CSV 表 / 航新 / 633）。本地与三方的差别只体现在 key 的取值上，
 * 不再按分支选字段——旧的「本地发 sortieId、三方发机号+架次号」契约已废弃，
 * 实测三方仍按旧形态发会得到 400「请提供 sortieKey（取自 /aircraft/sorties 的 sortieKey）」。
 *
 * `aircraftNumber` 后端标为可选（仅当路由索引缺该架次机号时作补充），这里带上行自身的
 * 机号：既无副作用，又能兜住索引缺机号的情况。
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
  const query: TimeSeriesQuery = { sortieId: input.sortie.sortieKey }
  if (input.sortie.aircraftNumber) query.aircraftNumber = input.sortie.aircraftNumber

  const start = input.startTime?.trim()
  if (start) query.startTime = start
  const end = input.endTime?.trim()
  if (end) query.endTime = end

  const paralist = input.paralist.map((s) => s.trim()).filter(Boolean)
  if (paralist.length) query.paralist = paralist

  return query
}

// ---- 以时序数据为数据源的训练 / 推理 ----

export interface TimeseriesJobInput {
  sortie: Sortie
  /** 时序查询选中的属性（= 界面上的 paralist），作为训练/推理的候选列 */
  dataCols: string[]
  labelCols: string[]
  instanceId: string
  startTime?: string
  endTime?: string
  batchSize?: number
  /** 仅训练 */
  epoch?: number
  /** 仅训练 */
  learningRate?: number
  device?: 'cpu' | 'cuda'
  detach?: boolean
  /** 训练才带 epoch / learning_rate；推理不带，否则后端可能按未知字段拒绝 */
  mode: 'train' | 'infer'
}

/**
 * 组装「以时序数据为数据源」的训练 / 推理请求体。
 *
 * 与 buildTimeseriesQuery 共用同一套定位字段（sortieId 装 sortieKey、机号兜底、
 * 时间留空由后端按架次推算），这样三方单机的训练取数与用户在时序页看到的查询
 * 走的是同一个数据源、同一段时间、同一批属性名。
 *
 * 列名去空白去重；data/label 全空时仍照发（由调用方先做必填校验，这里不悄悄改语义）。
 */
export function buildTimeseriesJobRequest(input: TimeseriesJobInput): TimeseriesJobRequest {
  const clean = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))]

  const request: TimeseriesJobRequest = {
    sortieId: input.sortie.sortieKey,
    data_cols: clean(input.dataCols),
    label_cols: clean(input.labelCols),
    instance_id: input.instanceId,
  }
  if (input.sortie.aircraftNumber) request.aircraftNumber = input.sortie.aircraftNumber

  const start = input.startTime?.trim()
  if (start) request.startTime = start
  const end = input.endTime?.trim()
  if (end) request.endTime = end

  if (input.batchSize !== undefined) request.batch_size = input.batchSize
  if (input.device) request.device = input.device
  if (input.detach !== undefined) request.detach = input.detach
  if (input.mode === 'train') {
    if (input.epoch !== undefined) request.epoch = input.epoch
    if (input.learningRate !== undefined) request.learning_rate = input.learningRate
  }

  return request
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

/** 结果表每页行数的默认值：一行就是一个时间点的全列数据，几百行已足够看 */
export const DEFAULT_PAGE_SIZE = 200

/** 结果表分页可选的行数 */
export const PAGE_SIZE_OPTIONS = [100, 200, 500, 1000]

/**
 * 结果表分页：整份数据留在内存（`rows` 不动），只把当前页交给表格渲染。
 *
 * 时序数据的行数与时间跨度成正比（分钟级采样可轻易到十万行），全部塞给 el-table
 * 会一次性创建对应数量的 tr + 每列一个 td，直接卡死。故只渲染当前页。
 *
 * 页码越界（如切换每页大小后页码超出、或重新查询后行数变少）一律夹到合法范围，
 * 不抛错也不返回空页——否则用户会看到一张莫名其妙的空表。
 */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const size = Math.max(1, Math.floor(pageSize) || 1)
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  // 页码夹取：1 <= page <= pageCount
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * size
  return {
    /** 当前页的行（原数组切片，不复制元素） */
    pageRows: rows.slice(start, start + size),
    /** 夹取后的页码，调用方应据此回写以免与实际展示不一致 */
    page: current,
    pageCount,
    total,
  }
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
