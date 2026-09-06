<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useUnifiedStore } from '@/stores/unified'
import { unifiedApi, SOURCE_ORDER, sourceText, sourceWarnings } from '@/api/unified'
import type { UnifiedSortieRow, UnifiedSource, UnifiedSortieQuery } from '@/types/entities'

const unifiedStore = useUnifiedStore()

// ---- 筛选条件 ----
const selectedSource = ref<UnifiedSource | ''>('') // 客户端来源过滤（空 = 全部）
const filterType = ref('') // airplaneType
const filterNum = ref('') // airplaneNum
const filterFlightNum = ref('') // flightNum
const filterRange = ref<[string, string] | null>(null) // startTime / endTime（日期范围）

// ---- 查询结果 ----
const loading = ref(false)
const rows = ref<UnifiedSortieRow[]>([])
const warnings = ref<string[]>([])
const totalOf = ref<{ local: number; hangxin: number; sansan: number }>({
  local: 0,
  hangxin: 0,
  sansan: 0,
})

// 机型下拉（三源机型，供 airplaneType 使用）
const modelOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const m of unifiedStore.models) {
    if (m.modelCode && !seen.has(m.modelCode)) seen.set(m.modelCode, m.manufacturer ?? '')
  }
  return [...seen.entries()].map(([value, manufacturer]) => ({
    value,
    label: manufacturer ? `${value} — ${manufacturer}` : value,
  }))
})

const SOURCE_OPTIONS: { value: UnifiedSource; label: string }[] = SOURCE_ORDER.map((s) => ({
  value: s,
  label: sourceText(s),
}))

// 客户端来源过滤后的表格数据
const filteredRows = computed(() =>
  selectedSource.value ? rows.value.filter((r) => r.source === selectedSource.value) : rows.value,
)

// 各来源命中数（服务端返回的 total）
const sourceCounts = computed(() =>
  SOURCE_ORDER.map((s) => ({ source: s, count: totalOf.value[s] })),
)

// 时间只取时刻部分（远端为 "2026-07-23 10:30:00"，本地为 "10:30:00"）
function timePart(s?: string | null) {
  if (!s) return '--'
  const i = s.indexOf(' ')
  return i >= 0 ? s.slice(i + 1, i + 19) : s
}

async function runQuery() {
  const body: UnifiedSortieQuery = {}
  if (filterType.value) body.airplaneType = filterType.value
  if (filterNum.value.trim()) body.airplaneNum = filterNum.value.trim()
  if (filterFlightNum.value.trim()) body.flightNum = filterFlightNum.value.trim()
  // 后端按完整时间串比较，日期需补足到 00:00:00 / 23:59:59
  if (filterRange.value && filterRange.value.length === 2) {
    body.startTime = `${filterRange.value[0]} 00:00:00`
    body.endTime = `${filterRange.value[1]} 23:59:59`
  }

  loading.value = true
  try {
    const res = await unifiedApi.querySortie(body)
    rows.value = res.data
    warnings.value = sourceWarnings(res)
    totalOf.value = {
      local: res.local.total,
      hangxin: res.hangxin.total,
      sansan: res.sansan.total,
    }
  } catch (e) {
    rows.value = []
    warnings.value = []
    totalOf.value = { local: 0, hangxin: 0, sansan: 0 }
    ElMessage.error('架次统一查询失败: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  selectedSource.value = ''
  filterType.value = ''
  filterNum.value = ''
  filterFlightNum.value = ''
  filterRange.value = null
  runQuery()
}

onMounted(async () => {
  await unifiedStore.fetchModels()
  await runQuery()
})

// 来源徽标颜色
function srcClass(s: UnifiedSource) {
  return { local: 'src-local', hangxin: 'src-hangxin', sansan: 'src-sansan' }[s] ?? ''
}

function rowKey(row: UnifiedSortieRow) {
  return `${row.source}-${row.flightId}`
}
</script>

<template>
  <div class="sortie-page">
    <div class="page-header">
      <h2 class="page-title">架次统一查询</h2>
    </div>

    <p v-if="warnings.length" class="source-warning">
      {{ warnings.join('；') }}
    </p>

    <!-- 筛选区 -->
    <div class="filter-bar">
      <div class="filters">
        <el-select
          v-model="selectedSource"
          placeholder="来源"
          clearable
          class="w-src"
        >
          <el-option
            v-for="opt in SOURCE_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>

        <el-select
          v-model="filterType"
          placeholder="机型"
          filterable
          clearable
          class="w-type"
        >
          <el-option
            v-for="opt in modelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>

        <el-input
          v-model="filterNum"
          placeholder="机号"
          clearable
          class="w-text"
        />

        <el-input
          v-model="filterFlightNum"
          placeholder="架次号"
          clearable
          class="w-text"
        />

        <el-date-picker
          v-model="filterRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          unlink-panels
          class="w-date"
        />
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
      <span class="stat-total">共 {{ rows.length }} 条架次</span>
      <span
        v-for="c in sourceCounts"
        :key="c.source"
        class="stat-chip"
      >
        <span class="stat-dot" :class="srcClass(c.source)"></span>
        {{ sourceText(c.source) }} {{ c.count }}
      </span>
    </div>

    <!-- 结果表格 -->
    <div class="table-card">
      <div class="table-wrap" v-loading="loading">
        <el-table
          :data="filteredRows"
          :row-key="rowKey"
          height="100%"
          empty-text="暂无匹配的架次，可调整筛选条件后查询"
        >
          <!-- 展开行：参数列表 -->
          <el-table-column type="expand" width="36">
            <template #default="{ row }">
              <div v-if="row.parameterList?.length" class="param-wrap">
                <span class="param-label">参数列表：</span>
                <el-tag
                  v-for="(p, i) in row.parameterList"
                  :key="i"
                  size="small"
                  effect="plain"
                  class="param-tag"
                >{{ p }}</el-tag>
              </div>
              <div v-else class="sub-empty">该架次无参数信息</div>
            </template>
          </el-table-column>

          <el-table-column label="来源" width="120" align="center">
            <template #default="{ row }">
              <span class="source-badge" :class="srcClass(row.source)">
                {{ sourceText(row.source) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="机型" width="120" align="center">
            <template #default="{ row }">
              <span>{{ row.aircraftType || '-' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="机号" width="140" align="center">
            <template #default="{ row }">
              <span>{{ row.aircraftNo || '-' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="架次号" min-width="180">
            <template #default="{ row }">
              <span class="flight-num">{{ row.flightNum || row.flightId }}</span>
            </template>
          </el-table-column>

          <el-table-column label="飞行日期" width="140" align="center">
            <template #default="{ row }">
              <span>{{ row.flightDate || '-' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="起止时间" width="220" align="center">
            <template #default="{ row }">
              <span class="time-text">{{ timePart(row.startTime) }} ~ {{ timePart(row.endTime) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="参数" width="100" align="center">
            <template #default="{ row }">
              <span>{{ row.parameterList?.length ?? 0 }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sortie-page {
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

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0 0 16px;
}

.source-warning {
  margin: -4px 32px 12px;
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.6;
}

/* ---- 筛选区 ---- */
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

.w-src {
  width: 130px;
}

.w-type {
  width: 170px;
}

.w-text {
  width: 170px;
}

.w-date {
  width: 280px;
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

.stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #6a7a90;
}

.stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
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

/* 来源徽标 */
.source-badge {
  font-size: 12px;
  color: #fff;
  border-radius: 10px;
  padding: 1px 10px;
  line-height: 18px;
  display: inline-block;
}

.src-local {
  background: #1a6cf0;
}

.src-hangxin {
  background: #0ea5e9;
}

.src-sansan {
  background: #f59e0b;
}

.flight-num {
  font-weight: 500;
  color: #0d1f3c;
}

.time-text {
  color: #606266;
  font-variant-numeric: tabular-nums;
}

.param-wrap {
  padding: 6px 16px 6px 48px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.param-label {
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}

.sub-empty {
  padding-left: 48px;
  font-size: 12px;
  color: #c0c4cc;
}
</style>
