<!-- 时序数据查询（与「架次查询」同级的工作台页面，由点架次跳入）：POST /csv/query-timeseries -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ArrowLeft, Search, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getMappings } from '@/api/aircraft'
import { getCsvOverview, queryTimeseries } from '@/api/csv'
import {
  buildTimeseriesQuery,
  buildTimeseriesTable,
  cellText,
  pickDeviceName,
  propertyCandidates,
  resolveSortie,
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
// 本地：从 /csv/overview 的 columnTypes 取；三方：接口不给参数名，靠手填
const candidates = ref<string[]>([])
const paralist = ref<string[]>([])
const preparing = ref(false)
/** 本地分支定位到的 CSV 表名（deviceName），仅用于界面提示 */
const deviceName = ref('')

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

async function prepare() {
  preparing.value = true
  try {
    if (!external.value) await loadLocalCandidates()
    // 预选全部：本地候选即全部列，进页面即可见数据；
    // 三方没有候选（接口不下发参数名），留空让用户手敲，也允许直接查原始列名
    paralist.value = [...candidates.value]
  } catch (e) {
    ElMessage.error('获取属性列表失败: ' + (e as Error).message)
  } finally {
    preparing.value = false
  }
}

// ---- 结果 ----
const loading = ref(false)
const table = ref<TimeseriesTable>({ columns: [], rows: [] })

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
    if (!table.value.rows.length) {
      ElMessage.info('该查询条件下没有数据')
    }
  } catch (e) {
    table.value = { columns: [], rows: [] }
    ElMessage.error('时序数据查询失败: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  paralist.value = [...candidates.value]
  // 时间回到架次记录的默认值（不是清空）——这正是「默认采用架次记录的起止时间」
  startTime.value = resolved.value.startTime ?? ''
  endTime.value = resolved.value.endTime ?? ''
  runQuery()
}

onMounted(async () => {
  await prepare()
  await runQuery()
})

function rowKey(row: TimeseriesRow, idx: number) {
  return `${row.time}-${idx}`
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
        <el-select
          v-model="paralist"
          multiple
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          :loading="preparing"
          :placeholder="external ? '手动输入参数名，回车确认' : '选择属性'"
          class="w-props"
        >
          <el-option v-for="p in candidates" :key="p" :label="p" :value="p" />
        </el-select>

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
      <span v-if="external" class="stat-hint">
        第三方平台数据由对应平台按机号 / 架次号 / 起止时间实时取回；参数名需手动输入，留空则按平台原始列名返回
      </span>
    </div>

    <!-- 结果表格：时间列 + 每个参数一列，列随查询结果变化 -->
    <div class="table-card">
      <div class="table-wrap" v-loading="loading">
        <el-table
          :data="table.rows"
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

.time-text {
  color: #606266;
  font-variant-numeric: tabular-nums;
}

.num-text {
  color: #0d1f3c;
  font-variant-numeric: tabular-nums;
}
</style>
