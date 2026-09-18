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
  normalizeProperties,
  PAGE_SIZE_OPTIONS,
  paginate,
  pickDeviceName,
  propertyCandidates,
  resolveSortie,
  type TimeseriesRow,
  type TimeseriesTable,
} from '@/utils/timeseries'
import PropertyPicker from '@/components/PropertyPicker.vue'
import TimeseriesJobDialog from '@/components/TimeseriesJobDialog.vue'
import type { Sortie } from '@/types/entities'

const props = defineProps<{
  /**
   * 被点击的架次。机号取自行内的 aircraftNumber 而非外部传入：
   * 架次查询允许改机号查别的飞机，此时必须用行自身的机号去匹配 CSV 表映射。
   */
  sortie: Sortie
  /**
   * 当前飞行器所属机型（基础编码）。时序查询请求体的 `airplaneType` 必填，
   * 且必须与查架次时用的机型一致，否则后端会路由到别的源而查不到数据。
   */
  modelCode: string
  /**
   * 当前单机是否来自外部平台（工作台由 GET /aircraft/plane 的占位符判定后传入）。
   * 这是判分支的**主要**依据：三方平台有数据时 /aircraft/sorties 的时间字段是真实值，
   * 光看架次行分不出本地/三方。
   */
  external: boolean
}>()

const emit = defineEmits<{
  (e: 'back'): void
  /** 去训练 / 去推理前若没有可用会话，跳去会话管理新建 */
  (e: 'navigate-to-tasks'): void
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
/** 已选属性（交给 PropertyPicker 管理：搜索 + 虚拟列表 + 批量粘贴） */
const paralist = ref<string[]>([])
const preparing = ref(false)
/** 本地分支定位到的 CSV 表名（deviceName），仅用于界面提示 */
const deviceName = ref('')

/**
 * 默认选中：候选的第一条。
 *
 * 属性名可能很长（如 `主燃油加速供油量_JDK_GME_FDR2_A`），平铺在筛选栏既占地方
 * 也读不出重点；选中结果只在 PropertyPicker 的按钮徽标与抽屉内呈现。
 * 留空会走「后端按平台原始列名返回」（三方是 Column4/Column5 这种），
 * 进页面即有一条真实列名，用户才有继续查询 / 去训练的抓手。
 */
function defaultSelection(): string[] {
  const first = normalizeProperties(candidates.value)[0]
  return first ? [first] : []
}

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
    modelCode: props.modelCode,
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
    paralist.value = defaultSelection()
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
        modelCode: props.modelCode,
        paralist: paralist.value,
        startTime: startTime.value,
        endTime: endTime.value,
      }),
    )
    table.value = buildTimeseriesTable(data)
    // 新结果从头看：否则上一次停在第 N 页、这次只有几行时会看到一张空表
    page.value = 1
    if (!table.value.rows.length) {
      // 空结果属预期（机型与数据源不匹配 / 该源当前不可达会回落本地后返回空），不是接口异常
      ElMessage.info('当前架次 / 机型暂无数据，或数据源暂不可用')
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
  // 与进页面时的默认一致（理由见 prepare）
  paralist.value = defaultSelection()
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

// ---- 训练 / 推理（仅三方单机） ----
// 本地与三方的入口、弹窗、请求体完全一致：本页查询用的 sortieKey + 属性 + 起止时间就是取数条件，
// 后端按 sortieKey 自己定向到本地 CSV 表或三方平台（见 buildTimeseriesJobRequest）。
// 「数据管理」里的按 CSV 表训练那条链路已下线，避免同一件事有两个入口、两套请求体。
const jobDialogVisible = ref(false)
const jobMode = ref<'train' | 'infer'>('train')

function openJob(mode: 'train' | 'infer') {
  if (!paralist.value.length) {
    ElMessage.warning('请先选择至少一个属性，训练 / 推理按所选属性取数')
    return
  }
  jobMode.value = mode
  jobDialogVisible.value = true
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
        <!-- 属性候选可达万级（航新参数组），故不在筛选栏摆下拉，改由抽屉承载（见 PropertyPicker） -->
        <PropertyPicker
          v-model="paralist"
          :options="candidates"
          :loading="preparing"
          :disabled="loading"
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
        <el-divider direction="vertical" />
        <!-- 本地 / 三方同一套入口：取数条件就是本页的查询条件 -->
        <el-tooltip content="以当前查询的架次 / 属性 / 时间范围作为训练数据" placement="top">
          <el-button
            type="primary"
            plain
            :disabled="loading || !paralist.length"
            @click="openJob('train')"
          >
            去训练
          </el-button>
        </el-tooltip>
        <el-tooltip content="以当前查询的架次 / 属性 / 时间范围作为推理输入" placement="top">
          <el-button plain :disabled="loading || !paralist.length" @click="openJob('infer')">
            去推理
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 命中统计 -->
    <div class="stat-line">
      <span class="stat-total">共 {{ table.rows.length }} 条数据</span>
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

    <!-- 以时序数据为数据源发起训练 / 推理（本地与三方同一套） -->
    <TimeseriesJobDialog
      v-model="jobDialogVisible"
      :mode="jobMode"
      :sortie="sortie"
      :model-code="modelCode"
      :properties="paralist"
      :start-time="startTime"
      :end-time="endTime"
      @navigate-to-tasks="emit('navigate-to-tasks')"
    />
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
