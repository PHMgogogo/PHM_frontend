<!-- 时序数据查询（与「架次查询」同级的工作台页面，由点架次跳入）：POST /csv/query-timeseries -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ArrowLeft, Search, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getMappings, getSortieParameters } from '@/api/aircraft'
import { getCsvOverview, queryTimeseries } from '@/api/csv'
import {
  buildTimeseriesQuery,
  buildTimeseriesTable,
  cellText,
  DEFAULT_PAGE_SIZE,
  filterOptions,
  PAGE_SIZE_OPTIONS,
  paginate,
  pickDeviceName,
  propertyCandidates,
  resolveSortie,
  toOptions,
  type PropertyOption,
  type TimeseriesRow,
  type TimeseriesTable,
} from '@/utils/timeseries'
import type { Sortie } from '@/types/entities'

const props = defineProps<{
  /**
   * 被点击的架次。机号取自行内的 aircraftNumber 而非外部传入：
   * 架次查询允许改机号查别的飞机，此时必须用行自身的机号去匹配 CSV 表映射。
   */
  sortie: Sortie
  /**
   * 当前单机是否来自外部平台（工作台由 GET /aircraft/plane 的占位符判定后传入）。
   * 这是判分支的**主要**依据：三方平台有数据时 /aircraft/sorties 的时间字段是真实值，
   * 光看架次行分不出本地/三方。
   */
  external: boolean
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

// ---- 分支判定 ----
// 单机级来源 + 架次行占位符，两者取或（详见 resolveSortie）。
const resolved = computed(() => resolveSortie(props.external, props.sortie))
const external = computed(() => resolved.value.external)

// ---- 起止时间：默认取架次记录里的值，允许手改 ----
// 三方行有日期可拼成 'YYYY-MM-DD HH:mm:ss'（实测后端认这个格式，返回与带时间时同样 20 行）；
// 本地行只有 HH:mm:ss 拼不出完整时间，留空由后端按架次起止查。
const startTime = ref(resolved.value.startTime ?? '')
const endTime = ref(resolved.value.endTime ?? '')

// ---- 可选属性 ----
// 本地：从 /csv/overview 的 columnTypes 取；三方：按架次行的 parameterGroupId 查参数组字段名
const candidates = ref<string[]>([])
/**
 * 下拉的 options（虚拟滚动用）。
 * 航新参数组实测可下发 10000+ 列名，若逐项渲染 el-option 会一次性挂载上万节点卡死页面，
 * 故用 el-select-v2：options 只传数据，DOM 只渲染可视区那几十项。
 * 用 computed 而非在 prepare() 里赋值，是为了让候选只有一个真源（candidates），不会两处不同步。
 */
const options = computed<PropertyOption[]>(() => toOptions(candidates.value))
const paralist = ref<string[]>([])
const preparing = ref(false)
/** 本地分支定位到的 CSV 表名（deviceName），仅用于界面提示 */
const deviceName = ref('')

/** el-select-v2 的输入框内过滤：万级候选下也要跟手 */
function onFilter(query: string) {
  return filterOptions(options.value, query)
}

/** 命中多项时给出数量提示，避免用户以为下拉「只有前几条」 */
const filterSummary = computed(() => {
  const total = options.value.length
  if (!total) return ''
  return `共 ${total} 个属性`
})

/** 本地分支取属性候选。两步辅助请求不可避免：表名只有 /aircraft/mappings 给得出 */
async function loadLocalCandidates() {
  const mappings = await getMappings({ sortieId: props.sortie.sortieId })
  const name = pickDeviceName(mappings, props.sortie)
  if (!name) {
    ElMessage.warning('该架次没有关联的本地数据表，无法获取属性列表')
    return
  }
  deviceName.value = name

  const overview = await getCsvOverview({
    aircraftNumber: props.sortie.aircraftNumber,
    deviceName: name,
  })
  candidates.value = propertyCandidates(overview)
}

/** 三方分支取属性候选：按架次行的参数组ID查该架次的列名 */
async function loadExternalCandidates() {
  const groupId = props.sortie.parameterGroupId
  if (!groupId) {
    // 老架次 / 该源没有该字段：退回手动输入，不报错
    return
  }
  candidates.value = await getSortieParameters(groupId)
}

async function prepare() {
  preparing.value = true
  try {
    if (external.value) await loadExternalCandidates()
    else await loadLocalCandidates()
    // 默认只选第一条：全选在万级候选下既无意义（请求体与结果表都撑不住）又拖慢首屏，
    // 用户按需再往下拉选；候选为空时留空，与「无可选属性」的表现一致
    paralist.value = candidates.value.length ? [candidates.value[0]] : []
  } catch (e) {
    ElMessage.error('获取属性列表失败: ' + (e as Error).message)
  } finally {
    preparing.value = false
  }
}

// ---- 结果 ----
const loading = ref(false)
const table = ref<TimeseriesTable>({ columns: [], rows: [] })

/**
 * 结果表分页状态。
 * 时序数据行数与时间跨度成正比（分钟级采样轻易到十万行），整份塞给 el-table 会
 * 一次性建出等量的 tr（每行还有 N 个 td），必然卡死；故整份留在 table.rows 内存里，
 * 只把当前页交给表格渲染（见 pageRows）。
 */
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const paged = computed(() => paginate(table.value.rows, page.value, pageSize.value))
/** 当前页的行——表格只渲染这一小段 */
const pageRows = computed(() => paged.value.pageRows)

async function runQuery() {
  loading.value = true
  try {
    const data = await queryTimeseries(
      buildTimeseriesQuery({
        sortie: props.sortie,
        external: external.value,
        paralist: paralist.value,
        startTime: startTime.value,
        endTime: endTime.value,
      }),
    )
    table.value = buildTimeseriesTable(data)
    // 新结果从头看：否则上一次停在第 N 页、这次只有几行时会看到一张空表
    page.value = 1
    if (!table.value.rows.length) {
      ElMessage.info('该查询条件下没有数据')
    }
  } catch (e) {
    table.value = { columns: [], rows: [] }
    page.value = 1
    ElMessage.error('时序数据查询失败: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  // 与进页面时的默认一致：只选第一条（不是全选，理由见 prepare）
  paralist.value = candidates.value.length ? [candidates.value[0]] : []
  // 时间回到架次记录的默认值（不是清空）——这正是「默认采用架次记录的起止时间」
  startTime.value = resolved.value.startTime ?? ''
  endTime.value = resolved.value.endTime ?? ''
  runQuery()
}

onMounted(async () => {
  await prepare()
  await runQuery()
})

/**
 * 行 key 必须用**全量数据里的绝对下标**：分页后每页的 idx 都从 0 重来，
 * 只用 `${time}-${idx}` 会让不同页的行撞 key（同一时间戳 + 同一下标），
 * 表格复用行时会错位。故把当前页的起始偏移加回去。
 */
function rowKey(row: TimeseriesRow, idx: number) {
  return `${row.time}-${(paged.value.page - 1) * pageSize.value + idx}`
}

/** 时间占位符与列表页保持一致 */
function timeText(v?: string | null) {
  if (!v || v === '-') return '--'
  return v
}
</script>

<template>
  <div class="ts-page">
    <div class="page-header">
      <el-button link class="back-btn" @click="emit('back')">
        <el-icon style="margin-right: 4px"><ArrowLeft /></el-icon>返回架次查询
      </el-button>
      <h2 class="page-title">时序数据查询</h2>
    </div>

    <!-- 当前架次信息 -->
    <div class="meta-line">
      <el-tag size="small" :type="external ? 'warning' : 'success'" effect="light">
        {{ external ? '第三方服务' : '本地' }}
      </el-tag>
      <span class="meta">机号 {{ sortie.aircraftNumber || '-' }}</span>
      <span class="meta">架次号 {{ sortie.sortieNumber || '-' }}</span>
      <span class="meta">
        架次记录起止 {{ timeText(sortie.startTime) }} ~ {{ timeText(sortie.endTime) }}
      </span>
      <span v-if="!external && deviceName" class="meta">数据表 {{ deviceName }}</span>
      <!-- 三方行连占位符都没有日期时，拼不出起止，只能由后端按架次推算 -->
      <span v-if="external && !resolved.startTime" class="meta warn">
        该架次无可用的起止时间，将按架次推算
      </span>
    </div>

    <!-- 查询条件 -->
    <div class="filter-bar">
      <div class="filters">
        <!--
          属性下拉：候选可达万级（航新参数组），必须用虚拟滚动的 select-v2，
          普通 el-select 会为每个候选渲染一个 el-option 节点，直接卡死。
          默认只选第一条，故 collapse-tags 是兜底：用户手动多选到很多项时，
          若逐个渲染 tag 照样上万节点，折叠后只画前几个 + 「+N」。
          allow-create 仍保留：后端只返回列名，不保证覆盖平台所有可查字段。
        -->
        <el-select-v2
          v-model="paralist"
          multiple
          filterable
          allow-create
          collapse-tags
          collapse-tags-tooltip
          :max-collapse-tags="3"
          default-first-option
          :reserve-keyword="false"
          :loading="preparing"
          :options="options"
          :filter-method="onFilter"
          :item-height="34"
          :height="274"
          :placeholder="external ? '选择属性（可输入回车新建）' : '选择属性'"
          class="w-props"
        />

        <!-- 起止时间：默认取架次记录的值（三方），可手改；留空由后端按架次起止查 -->
        <el-date-picker
          v-model="startTime"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
          placeholder="开始时间（默认取架次记录）"
          class="w-time"
        />
        <span class="tilde">~</span>
        <el-date-picker
          v-model="endTime"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
          placeholder="结束时间（默认取架次记录）"
          class="w-time"
        />
        <el-tooltip content="留空则由后端按该架次的起止时间查询" placement="top">
          <span class="time-hint">留空按架次起止</span>
        </el-tooltip>
      </div>

      <div class="filter-actions">
        <el-button type="primary" :loading="loading" @click="runQuery">
          <el-icon style="margin-right: 4px"><Search /></el-icon>查询
        </el-button>
        <el-button :disabled="loading" @click="resetFilters">
          <el-icon style="margin-right: 4px"><RefreshRight /></el-icon>重置
        </el-button>
      </div>
    </div>

    <!-- 命中统计 -->
    <div class="stat-line">
      <span class="stat-total">共 {{ table.rows.length }} 条数据</span>
      <span v-if="table.rows.length" class="stat-hint">
        当前渲染第 {{ paged.page }} / {{ paged.pageCount }} 页（{{ pageRows.length }} 条，其余在内存中，翻页即时切换）
      </span>
      <span v-if="filterSummary" class="stat-hint">{{ filterSummary }}（下拉为虚拟滚动，可输入筛选）</span>
      <span v-if="external" class="stat-hint">
        第三方平台数据由对应平台按机号 / 架次号 / 起止时间实时取回；属性列表按参数组取回，可输入回车补充，留空则按平台原始列名返回
      </span>
    </div>

    <!-- 结果表格：时间列 + 每个参数一列，列随查询结果变化 -->
    <div class="table-card">
      <div class="table-wrap" v-loading="loading">
        <!-- 只渲染当前页：全量数据在内存（table.rows），避免万行表格把页面卡死 -->
        <el-table
          :data="pageRows"
          :row-key="rowKey"
          height="100%"
          empty-text="暂无数据"
        >
          <el-table-column label="时间" width="200" align="center">
            <template #default="{ row }">
              <span class="time-text">{{ row.time || '--' }}</span>
            </template>
          </el-table-column>

          <el-table-column
            v-for="(col, idx) in table.columns"
            :key="`${col}-${idx}`"
            :label="col"
            min-width="140"
            align="right"
          >
            <template #default="{ row }">
              <span class="num-text">{{ cellText(row.cells[idx]) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页：整份结果在内存，翻页只换表格渲染的那一段 -->
      <div v-if="table.rows.length" class="table-pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :total="paged.total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          size="small"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ts-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  padding: 24px 32px 0;
  flex-shrink: 0;
}

.back-btn {
  padding: 0;
  margin-bottom: 8px;
  font-size: 13px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0 0 12px;
}

/* ---- 当前架次信息 ---- */
.meta-line {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 0 32px 14px;
  font-size: 13px;
  flex-shrink: 0;
}

.meta {
  color: #606266;
}

.meta.warn {
  color: #e6a23c;
}

/* ---- 查询条件 ---- */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 32px 14px;
  flex-shrink: 0;
}

.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.w-props {
  width: 320px;
}

.w-time {
  width: 210px;
}

.tilde {
  color: #909399;
}

.time-hint {
  font-size: 12px;
  color: #909399;
  cursor: default;
}

.filter-actions {
  display: flex;
  gap: 8px;
}

/* ---- 统计行 ---- */
.stat-line {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 32px 14px;
  font-size: 13px;
  flex-shrink: 0;
}

.stat-total {
  color: #3a4a5c;
  font-weight: 600;
}

.stat-hint {
  color: #909399;
}

/* ---- 表格卡 ---- */
.table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin: 0 32px 32px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e0e8f5;
  padding: 16px 16px 8px;
  overflow: hidden;
}

.table-wrap {
  flex: 1;
  min-height: 0;
}

/* 分页条固定在表格下方，不参与表格的滚动区域 */
.table-pager {
  display: flex;
  justify-content: flex-end;
  padding: 8px 4px 4px;
  flex-shrink: 0;
  border-top: 1px solid #eef2f8;
  margin-top: 8px;
}

.time-text {
  color: #606266;
  font-variant-numeric: tabular-nums;
}

.num-text {
  color: #0d1f3c;
  font-variant-numeric: tabular-nums;
}
</style>
