<!-- 架次查询（工作台内页面）：默认只查当前飞行器的架次；GET /aircraft/sorties 按机号过滤 -->
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Search, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getSorties } from '@/api/aircraft'
import type { Sortie } from '@/types/entities'

const props = defineProps<{
  /** 当前飞行器机号：进入本页即预填到机号框，只查该机的架次；切换飞行器时回填并重查 */
  aircraftNumber: string
}>()

/**
 * 下钻：点某行架次 → 由工作台切到同级的「时序数据查询」页面。
 * 本组件不渲染时序内容，只把选中的架次交出去。
 */
const emit = defineEmits<{
  (e: 'select-sortie', sortie: Sortie): void
}>()

function onRowClick(row: Sortie) {
  emit('select-sortie', row)
}

// ---- 查询条件 ----
// 默认 = 当前飞行器机号：进入哪台飞机的页面就只查哪台的架次。
// 机号框仍可手改/清空（清空则后端返回全部机号的架次），切换飞行器时会自动回填。
const queryNumber = ref(props.aircraftNumber)
const filterSortieNum = ref('')

// ---- 结果 ----
const loading = ref(false)
const rows = ref<Sortie[]>([])

// 架次号关键字过滤（接口只按机号过滤，其余条件在客户端做）
const filteredRows = computed(() => {
  const q = filterSortieNum.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((r) => (r.sortieNumber || '').toLowerCase().includes(q))
})

async function runQuery() {
  loading.value = true
  try {
    // 按机号过滤；机号框被手动清空时后端返回全部架次
    rows.value = await getSorties(queryNumber.value.trim())
  } catch (e) {
    rows.value = []
    ElMessage.error('架次查询失败: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  // 重置 = 回到默认状态，即再查一次当前飞行器的架次
  queryNumber.value = props.aircraftNumber
  filterSortieNum.value = ''
  runQuery()
}

onMounted(runQuery)

// 切换飞行器时重置为新的机号并重查
watch(
  () => props.aircraftNumber,
  (v) => {
    queryNumber.value = v
    filterSortieNum.value = ''
    runQuery()
  },
)

/**
 * 时间字段：本地架次为 "HH:mm:ss"，外源架次后端下发占位符 "-"。
 * 统一把占位符/空值显示为 "--"。
 */
function timeText(v?: string | null) {
  if (!v || v === '-') return '--'
  return v
}

function dateText(v?: string | null) {
  if (!v || v === '-') return '-'
  return v
}

/**
 * 行 key 必须带机号与下标：sortieId 只在单个来源内唯一，跨机号会重复
 * （如 20011 与 20018 都有 sortieId 10001），清空机号查全部时必然冲突。
 */
function rowKey(row: Sortie, idx: number) {
  return `${row.aircraftNumber}-${row.sortieId}-${idx}`
}
</script>

<template>
  <div class="sortie-page">
    <div class="page-header">
      <h2 class="page-title">架次查询</h2>
    </div>

    <!-- 筛选区 -->
    <div class="filter-bar">
      <div class="filters">
        <el-input
          v-model="queryNumber"
          placeholder="机号（默认当前机号）"
          clearable
          class="w-num"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-input
          v-model="filterSortieNum"
          placeholder="架次号"
          clearable
          class="w-text"
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
      <span class="stat-total">共 {{ filteredRows.length }} 条架次</span>
      <span class="stat-hint">点击任一架次可查看其时序数据</span>
    </div>

    <!-- 结果表格 -->
    <div class="table-card">
      <div class="table-wrap" v-loading="loading">
        <el-table
          :data="filteredRows"
          :row-key="rowKey"
          height="100%"
          empty-text="暂无匹配的架次"
          class="clickable-table"
          @row-click="onRowClick"
        >
          <el-table-column label="机号" width="160" align="center">
            <template #default="{ row }">
              <span>{{ row.aircraftNumber || '-' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="架次号" min-width="220">
            <template #default="{ row }">
              <span class="sortie-num">{{ row.sortieNumber || '-' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="飞行日期" width="160" align="center">
            <template #default="{ row }">
              <span>{{ dateText(row.flightDate) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="起止时间" width="220" align="center">
            <template #default="{ row }">
              <span class="time-text">
                {{ timeText(row.startTime) }} ~ {{ timeText(row.endTime) }}
              </span>
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

.w-num {
  width: 200px;
}

.w-text {
  width: 180px;
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

/* 行可点击下钻：给出指针光标（el-table 的行在 scoped 样式外，需 :deep） */
.clickable-table :deep(.el-table__row) {
  cursor: pointer;
}

.sortie-num {
  font-weight: 500;
  color: #0d1f3c;
}

.time-text {
  color: #606266;
  font-variant-numeric: tabular-nums;
}
</style>
