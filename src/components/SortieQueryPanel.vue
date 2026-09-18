<!-- 架次查询（工作台内页面）：默认只查当前飞行器的架次；GET /aircraft/sorties 按机号过滤 -->
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Search, RefreshRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addSortie, deleteSortie, getSorties } from '@/api/aircraft'
import { hasLocalSortieId } from '@/utils/aircraft-source'
import SortieDialog from '@/components/SortieDialog.vue'
import type { Sortie } from '@/types/entities'

const props = defineProps<{
  /** 当前飞行器机号：进入本页即预填到机号框，只查该机的架次；切换飞行器时回填并重查 */
  aircraftNumber: string
  /**
   * 当前飞行器来自外部平台（航新/633）。
   * 架次本身也分来源：三方架次由平台下发，没有本地主键，既不能新增也不该删除，
   * 故整台三方单机不出现「添加架次」，行上的「删除架次」只认带本地主键的行。
   */
  external?: boolean
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

// ---- 架次增删（仅本地） ----
// 架次管理从「数据管理」页移到这里：架次列表本来就是本页的主体，边看边改更顺手，
// 「数据管理」则只留 CSV 表相关的事。
const sortieDialogVisible = ref(false)
const addingSortie = ref(false)
const deletingSortie = ref(false)

async function onSortieConfirm(payload: {
  sortieNumber: string
  flightDate: string
  startTime: string
  endTime: string
}) {
  addingSortie.value = true
  try {
    // 新架次落在当前工作台的飞行器上（机号框只影响查询，不改变「给谁加架次」）
    await addSortie({ ...payload, aircraftNumber: props.aircraftNumber })
    ElMessage.success('架次添加成功')
    sortieDialogVisible.value = false
    runQuery()
  } catch (e) {
    ElMessage.error('添加架次失败: ' + (e as Error).message)
  } finally {
    addingSortie.value = false
  }
}

async function handleDeleteSortie(row: Sortie) {
  try {
    await ElMessageBox.confirm(
      `确定删除架次「${row.sortieNumber || row.sortieId}」？该架次关联的 CSV 数据表会一并删除，且不可恢复。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  deletingSortie.value = true
  try {
    const res = await deleteSortie(row.sortieId)
    ElMessage.success(res?.message || '删除成功')
    runQuery()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e as Error).message)
  } finally {
    deletingSortie.value = false
  }
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
      <el-button
        v-if="!external"
        type="primary"
        size="small"
        @click="sortieDialogVisible = true"
      >
        + 添加架次
      </el-button>
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

          <!-- 只在本地单机出现：三方架次由平台下发，没有本地主键，谈不上增删 -->
          <el-table-column v-if="!external" label="操作" width="120" align="center">
            <template #default="{ row }">
              <el-button
                v-if="hasLocalSortieId(row)"
                type="danger"
                text
                size="small"
                :loading="deletingSortie"
                @click.stop="handleDeleteSortie(row)"
              >
                删除架次
              </el-button>
              <span v-else class="no-op">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 添加架次对话框（仅本地单机） -->
    <SortieDialog
      v-if="!external"
      v-model:visible="sortieDialogVisible"
      :loading="addingSortie"
      @confirm="onSortieConfirm"
    />
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
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0 0 16px;
}

.no-op {
  font-size: 12px;
  color: #c0c4cc;
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
