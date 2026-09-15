// ============================================================
// 单机来源判定
// ============================================================
// 约定：GET /aircraft/plane 已聚合本地/航新/633 三源，但不返回 source 字段，
// 且单机的 modelCode 不带 ':modelId' 后缀（航新的 20018 与本地 20011 都是纯 'JX-20A'），
// 因此无法像机型那样靠编码区分（见 model-code.ts）。
// 可用的判据是占位符：外源行的 airline/status/configVersion/createdAt 统一为 '-'，本地行为真实值。

const PLACEHOLDER = '-'

/**
 * 字段是否为「无实际值」：缺失 / 空 / 纯空白 / 后端占位符 '-'。
 * 先 trim 再判空，使纯空白与空串同归为无值——这类值不携带信息，
 * 且没有任何本地行会返回它，归入占位符才是安全方向（见下方 isExternalAircraft）。
 */
function isPlaceholder(v?: string | null): boolean {
  const s = v?.trim()
  return !s || s === PLACEHOLDER
}

/** 判定所需的单机字段子集 */
export interface AircraftSourceFields {
  airline?: string | null
  status?: string | null
  createdAt?: string | null
}

/**
 * 是否为外源（航新/633）单机：任一关键字段为占位符即视为外源。
 * 刻意偏向判为外源——误判本地为外源只是少一个删除入口（安全），
 * 反过来则会给外源数据露出本地写操作。
 */
export function isExternalAircraft(aircraft: AircraftSourceFields): boolean {
  return (
    isPlaceholder(aircraft.airline) ||
    isPlaceholder(aircraft.status) ||
    isPlaceholder(aircraft.createdAt)
  )
}

export function isLocalAircraft(aircraft: AircraftSourceFields): boolean {
  return !isExternalAircraft(aircraft)
}

/** 单机来源展示文案：接口不区分航新/633，只能二分 */
export function aircraftSourceText(aircraft: AircraftSourceFields): string {
  return isExternalAircraft(aircraft) ? '第三方服务' : '本地'
}

/** 判定所需的架次字段子集 */
export interface SortieSourceFields {
  flightDate?: string | null
  startTime?: string | null
  endTime?: string | null
}

/**
 * 是否为三方（航新/633）架次：GET /aircraft/sorties 对三方行的三个时间字段下发占位符 '-'，
 * 本地行为真实值。与 isExternalAircraft 同样偏向判为三方——误判本地为三方会让用户手敲
 * 参数名（少些便利），反过来则会给三方架次取本地 CSV 表的列名。
 *
 * 注意该聚合接口不返回架次自身的来源字段，这是唯一的判据。
 */
export function isExternalSortie(sortie: SortieSourceFields): boolean {
  return (
    isPlaceholder(sortie.flightDate) ||
    isPlaceholder(sortie.startTime) ||
    isPlaceholder(sortie.endTime)
  )
}

export function isLocalSortie(sortie: SortieSourceFields): boolean {
  return !isExternalSortie(sortie)
}
